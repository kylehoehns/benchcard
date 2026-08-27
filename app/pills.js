/* Player pills.
 *
 * Two widgets that both draw a roster as a grid of tappable name pills: the
 * squad row on the setup view and the "tap up to N" picker that serves the
 * closers list, the platoon units and the starting-five rules. They live
 * together in a leaf module because neither has a single owner -- the picker
 * is used from the strategy body *and* from the rules body, and `fitPills`
 * is used by both of those and by the squad row. Extracting either one into
 * a view module would have meant that view importing back into app.js.
 *
 * Imports state / dom / engine only, so any view seam can take it.
 */
import { deriveShortNames } from './engine.js';
import { el, ctx2d } from './dom.js';
import { state, game, availIds, colorOf, initials, byId, elideMiddle } from './state.js';

/* A squad pill caps its name at 15ch and clips with a tail ellipsis, and the
   tail is the surname -- a roster with an "Isabella Torres" and an "Isabella
   Ruiz" put up two pills both reading "Isabella…" for the tap that decides who
   plays today. Same fix as the game tabs and the card header: elide the middle.
   Sized by measurement rather than a character count, because 15ch is a
   different number of letters for "Willi" than for "Ilinca", and measured on a
   canvas so a roster of 15 costs no layout. The CSS ellipsis stays as the
   backstop for anything this misjudges. */
export function fitPills(box) {
  const spans = box.querySelectorAll('.plr .nm');
  if (!spans.length) return;
  // The picker builds its grid before anyone mounts it, and a detached node has
  // no computed style to read the cap off. One retry, never a loop.
  if (!spans[0].isConnected) {
    requestAnimationFrame(() => { if (spans[0].isConnected) fitPills(box); });
    return;
  }
  const cs = getComputedStyle(spans[0]);
  const avail = parseFloat(cs.maxWidth);
  if (!(avail > 0)) return;                  // no cap in this layout: leave it alone
  ctx2d.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const ls = parseFloat(cs.letterSpacing) || 0;
  const w = t => ctx2d.measureText(t).width + t.length * ls + 1;  // canvas lands a hair under the laid-out box
  for (const nm of spans) {
    const full = nm.dataset.full ?? nm.textContent;
    nm.dataset.full = full;
    let n = full.length - 1;
    if (w(full) <= avail) { nm.textContent = full; continue; }
    while (n > 6 && w(elideMiddle(full, n)) > avail) n--;
    nm.textContent = elideMiddle(full, n);
  }
  // A first paint before Inter arrives measures the fallback face; redo it once.
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => fitPills(box));
}

// A reusable "tap up to N players" grid -- the same control serves closers and units.
export function pickFive(selected, onToggle, opts = {}) {
  const g = game();
  const ids = availIds(g);
  const shorts = deriveShortNames(state.players);
  const max = opts.max ?? 5;
  const taken = opts.taken || new Set();

  const hd = el('div', 'pickhd');
  hd.append(el('span', 't', opts.title || 'Pick five'));
  hd.append(el('span', 'c' + (selected.length === max ? ' full' : ''), `${selected.length} of ${max}`));

  const grid = el('div', 'pick');
  for (const id of ids) {
    const on = selected.includes(id);
    const blocked = !on && (taken.has(id) || selected.length >= max);
    const b = el('button', 'plr press ' + (on ? 'on' : 'off'));
    b.type = 'button';
    b.style.setProperty('--c', colorOf(id));
    b.setAttribute('aria-pressed', String(on));
    const full = byId(id)?.name || id;
    // Named explicitly, like the squad pills: the initials bubble is content,
    // and once the name elides the accessible name would carry the ellipsis.
    b.setAttribute('aria-label', full);
    b.append(el('span', 'av', initials(byId(id) || { name: shorts[id] })), el('span', 'nm', full));
    b.disabled = blocked;
    b.onclick = () => onToggle(id, !on);
    grid.append(b);
  }
  fitPills(grid);
  const box = el('div');
  box.append(hd, grid);
  return box;
}
