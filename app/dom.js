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
   (scripts/smoke/clip-sweep.mjs) never excuses a split inside one. */
export const FIT_SELECTORS = ['.alert > span:not(.ico)', '.rrow .prow-t', '.gm-p:not(.fresh) .nm'];

/* The smallest a fitted name gets: 40% of its CSS size. Below that the
   element's own `overflow-wrap` still breaks the word as a last resort, so
   nothing is ever clipped. */
const FIT_FLOOR = 0.4;

const fitSig = new WeakMap();

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
const room = e => {
  const cs = getComputedStyle(e);
  return e.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
};

/* Shrink the text of each `FIT_SELECTORS` element just enough that its widest
   unbreakable chunk (a word, or the part of a hyphenated one before its
   hyphen: the browser's own break chances) fits the element's width. The real
   font, weight and letter-spacing are the ones measured, so there is no canvas
   guess. A name that fits keeps its CSS size. An element that is not laid out
   (a closed sheet) is skipped and fitted when it opens.

   An owned element's width must never depend on its own font size, or fitting
   would chase itself. Each pass starts from the CSS size, so the answer is the
   same however many times it runs; an element whose text and width have not
   changed since its last fit is not touched at all. */
function fitLongWords(root = document) {
  const todo = [];
  for (const e of root.querySelectorAll(FIT_SELECTORS.join(','))) {
    const sig = `${e.textContent}|${e.clientWidth}`;
    if (e.clientWidth > 0 && fitSig.get(e) !== sig) todo.push(e);
  }
  if (!todo.length) return;
  for (const e of todo) { e.style.fontSize = ''; e.style.overflowWrap = 'normal'; }
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
  for (const e of todo) { e.style.overflowWrap = ''; fitSig.set(e, `${e.textContent}|${e.clientWidth}`); }
}

/* Keep `fitLongWords` true as the page changes. A MutationObserver rather than
   a ResizeObserver: its callback is a microtask, so the fit lands before the
   frame that shows the new text is painted, it sees text and `open`/`hidden`
   changes that a ResizeObserver does not, and fitting from inside one would
   risk "ResizeObserver loop completed" errors. The observer ignores `style`,
   so its own writes cannot call it again. Resizing the window and fonts
   finishing loading re-run it as well. */
export function initFit() {
  const run = () => fitLongWords();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['open', 'hidden', 'class'] });
  addEventListener('resize', run);
  document.fonts?.addEventListener?.('loadingdone', run);
  document.fonts?.ready?.then(run);
  run();
}
