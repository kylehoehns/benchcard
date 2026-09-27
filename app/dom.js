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
