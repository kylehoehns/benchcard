/* Tiny DOM helpers shared by every view module.

   Deliberately not a library: seven one-liners that exist so the view code
   below them reads as intent rather than as `document.createElement`. They
   live in their own module because `app.js` is being split a seam at a time
   and every seam needs these — importing them from `app.js` would make the
   split circular.

   The forgiving ones (`on`, `set`, `style`) are the point: this app has no
   build step, so a markup change that drops an element should degrade to a
   warned no-op rather than throw and kill every handler declared after it. */

export const $ = s => document.querySelector(s);

// Binding helper: a markup change that drops an element degrades to a no-op
// instead of throwing and killing every handler declared after it.
export const on = (sel, ev, fn) => { const n = $(sel); if (n) n[ev] = fn; else console.warn('missing element', sel); };

// Same idea for writes: a markup change should degrade, not throw mid-render
// and leave half the page unpainted.
export const set = (sel, prop, val) => { const n = $(sel); if (n) n[prop] = val; };

export const style = (sel, prop, val) => { const n = $(sel); if (n) n.style[prop] = val; };

export const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

export const clone = o => JSON.parse(JSON.stringify(o));

export const uid = p => p + Math.random().toString(36).slice(2, 9);

// #143: the bold ink check mark a chosen row carries -- a Who's here row
// that's present, the picked row in game-setup.js's `paintGranRows`, or
// balance.js's chosen shape row. Shared here so the three call sites don't
// each keep their own copy of the same three lines.
export const checkMark = () => {
  const mark = el('span', 'prow-check', '✓');
  mark.setAttribute('aria-hidden', 'true');
  return mark;
};

// #146 item 3: the repeat row the paste sheet (roster-view.js) and first-run
// step 1 (onboarding.js) both paint -- a name-and-count notice beside a
// "Drop one" button -- built identically down to the class names, the same
// reason `checkMark` above lives here rather than in either view that draws
// it. `notice` and `name` are supplied by the caller (`repeatNotice`,
// roster.js, computes the wording; this only lays it out) so this module
// stays a leaf with no import of its own. `onDrop` is the caller's own
// handler, since the two views remove the entry from two different fields.
export const repeatRow = (notice, name, onDrop) => {
  const row = el('div', 'paste-repeat');
  row.append(el('span', '', notice));
  const drop = el('button', 'btn ghost sm press', 'Drop one');
  drop.type = 'button';
  drop.setAttribute('aria-label', `Drop one ${name}`);
  drop.onclick = onDrop;
  row.append(drop);
  return row;
};

/* One shared 2D context for text measurement. Several places size type by
   measuring it (the card auto-fit, the availability pills, game mode's call
   line) and a canvas measure costs no layout, unlike reading a laid-out box.
   It lives here because it belongs to none of them in particular; set `.font`
   before every measurement, since the last caller left theirs on it. */
export const ctx2d = document.createElement('canvas').getContext('2d');

/* #455, #477, #483: the elements that hold a person's name or a plan note's
   sentence, where a single word can be wider than the column at a large text
   size. The one list: `fitLongWords` below shrinks these, and the clip sweep
   (scripts/smoke/clip-sweep.mjs) never excuses a split inside one. A plan note
   keeps its sentence at its CSS size: plan-view.js wraps each long word of it
   in a `.fitw`, and only that word shrinks. */
export const FIT_SELECTORS = ['.alert .fitw', '.rrow .prow-t', '.gm-p:not(.fresh) .nm'];
/* The plan note's own sentence: not shrunk, but a split in it is never excused. */
export const NOTE_TEXT = '.alert > span:not(.ico)';

/* #520: the smallest a fitted name gets: 70% of its CSS size. A coach who set
   large text needs it, so a word that still does not fit at the floor is
   broken with a hyphen instead (`hyphenate` below) rather than shrunk further.
   The clip sweep holds this to its own 70% (MIN_FIT_RATIO). */
const FIT_FLOOR = 0.7;
const SHY = '\u00AD';

const textNodes = e => {
  const out = [], w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
  return out;
};
/* Take back the soft hyphens a previous fit put in, so this one measures the
   words as the app wrote them. */
const unhyphenate = e => {
  for (const n of textNodes(e)) if (n.data.includes(SHY)) n.data = n.data.replaceAll(SHY, '');
};
/* Put a soft hyphen between the letters of each word still wider than the
   room at the floor, keeping two letters on either side of any break. The
   browser then breaks it at the last one that fits and paints a hyphen there,
   so the word never splits without one. Only the over-wide words get them: a
   soft hyphen is a break chance, and in a word that fits it would break
   where moving the whole word down was right. A part of a hyphenated name
   ("Montgomery-Okafor") is measured on its own, since the browser can already
   break after its hyphen. */
const hyphenate = (e, max) => {
  for (const n of textNodes(e)) {
    const r = document.createRange();
    const long = [...n.data.matchAll(/[^\s-]{5,}/g)].filter(m => {
      r.setStart(n, m.index);
      r.setEnd(n, m.index + m[0].length);
      return r.getBoundingClientRect().width > max;
    });
    if (!long.length) continue;
    let out = '', at = 0;
    for (const m of long) {
      const ch = [...m[0]];
      out += n.data.slice(at, m.index) + ch.map((c, i) => (i >= 2 && i <= ch.length - 2 ? SHY : '') + c).join('');
      at = m.index + m[0].length;
    }
    n.data = out + n.data.slice(at);
  }
};

const fitSig = new WeakMap();
// Bumped when fonts finish loading: a fit measured on the fallback font is stale
// though the text and width have not changed.
let fitGen = 0;

/* How wide an element's text lays out, and the room it has: both fractional,
   since `scrollWidth` rounds to a whole pixel and a word a hair wider than its
   box still breaks. With `overflow-wrap: normal` a chunk wider than the box
   overflows it, so the widest line rectangle is the widest chunk. */
const widest = e => {
  const r = document.createRange();
  r.selectNodeContents(e);
  let m = 0;
  for (const q of r.getClientRects()) m = Math.max(m, q.width);
  return m;
};
/* A `.fitw` word is measured against the note sentence that holds it. */
const boxOf = e => e.matches('.fitw') ? e.parentElement : e;
const room = e => {
  const b = boxOf(e);
  const cs = getComputedStyle(b);
  return b.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
};
/* What a fit depends on: the words, the room, the text size (the root's, which
   is what a coach's text-size setting changes) and the font generation. The
   room is read off the box's parent, whose width the fit cannot change: the
   box's own width follows the fit (a hyphenated name's pinned min-width, a
   Team name moving up beside its badge), so it would hide a real change. */
const sigOf = e => `${e.textContent}|${boxOf(e).parentElement.clientWidth}|${getComputedStyle(document.documentElement).fontSize}|${fitGen}`;

/* Shrink the text of each `FIT_SELECTORS` element just enough that its widest
   unbreakable chunk (a word, or the part of a hyphenated one before its
   hyphen: the browser's own break chances) fits its box, down to FIT_FLOOR;
   past that, hyphenate the chunk. The real font,
   weight and letter-spacing are the ones measured, so there is no canvas
   guess. A name that fits keeps its CSS size. An element that is not laid out
   (a closed sheet) is skipped and fitted when it opens.

   An owned element's width must never depend on its own font size, or fitting
   would chase itself. Each pass starts from the CSS size, so the answer is the
   same however many times it runs; an element whose signature (`sigOf`) has
   not changed since its last fit is not touched at all. */
function fitLongWords(root = document) {
  const todo = [];
  for (const e of root.querySelectorAll(FIT_SELECTORS.join(','))) {
    if (boxOf(e).clientWidth > 0 && fitSig.get(e) !== sigOf(e)) todo.push(e);
  }
  if (!todo.length) return;
  /* `transition: none` while fitting: the reduced-motion block in app.css gives
     every element a .01ms transition on every property, and a font size that
     transitions still reads as the old one this tick, so each measurement
     below would see the size before it and shrink the name to the floor. */
  for (const e of todo) {
    unhyphenate(e);
    e.style.fontSize = e.style.minWidth = '';
    e.style.overflowWrap = 'normal'; e.style.transition = 'none';
  }
  const bases = todo.map(e => parseFloat(getComputedStyle(e).fontSize));
  const px = n => `${Math.floor(n * 100) / 100}px`;
  const over = e => widest(e) > room(e) - 0.05;
  const wide = todo.map(e => widest(e) > room(e) - 0.05 ? (room(e) - 0.5) / widest(e) : 1);
  todo.forEach((e, i) => { if (wide[i] < 1) e.style.fontSize = px(Math.max(bases[i] * FIT_FLOOR, bases[i] * wide[i])); });
  // Letter-spacing and hinting do not scale exactly; step down until it fits.
  todo.forEach((e, i) => {
    for (let n = 0; n < 8 && wide[i] < 1 && over(e); n++) {
      const next = parseFloat(e.style.fontSize) * 0.97;
      if (next < bases[i] * FIT_FLOOR) break;
      e.style.fontSize = px(next);
    }
  });
  /* Soft hyphens shrink an element's min-content to a few letters, and a Team
     row (`.rrow`, flex-wrap) places its name by that: the name would jump up
     beside the badge, into less room, and the fit would no longer hold. So a
     name that gets them keeps the width it was fitted at. */
  todo.forEach((e, i) => {
    if (!(wide[i] < 1 && over(e))) return;
    const max = room(e) - 0.05;
    if (boxOf(e) === e) e.style.minWidth = `${e.getBoundingClientRect().width}px`;
    hyphenate(e, max);
  });
  for (const e of todo) { e.style.overflowWrap = e.style.transition = ''; fitSig.set(e, sigOf(e)); }
}

/* Keep `fitLongWords` true as the page changes. A MutationObserver rather than
   a ResizeObserver: its callback is a microtask, so the fit lands before the
   frame that shows the new text is painted, it sees text and `open`/`hidden`
   changes that a ResizeObserver does not, and fitting from inside one would
   risk "ResizeObserver loop completed" errors. The fitter writes `style`, which
   the observer ignores, and the soft hyphens in a text node's data, which it
   does see: that wakes it once more, but each element's signature was taken
   after the write, so the second run touches nothing and the loop ends. Resizing the window and fonts finishing loading
   (which bumps `fitGen`, so every element is measured again) re-run it too. */
export function initFit() {
  const run = () => fitLongWords();
  const refit = () => { fitGen++; run(); };
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['open', 'hidden', 'class'] });
  addEventListener('resize', run);
  document.fonts?.addEventListener?.('loadingdone', refit);
  document.fonts?.ready?.then(refit);
  run();
}
