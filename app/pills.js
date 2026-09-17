/* Player pills.
 *
 * The "tap up to N" picker that serves the closers list, the platoon units
 * and the starting-five rules -- it has no single owner (the strategy body
 * *and* the rules body both build one), which is why it lives in a leaf
 * module rather than either of theirs.
 *
 * Imports state / dom / engine only, so any view seam can take it.
 */
import { deriveShortNames } from './engine.js';
import { el } from './dom.js';
import { state, game, availIds, colorOf, initials, byId } from './state.js';
import { callNames } from './roster.js';

// A reusable "tap up to N players" grid -- the same control serves closers and units.
export function pickFive(selected, onToggle, opts = {}) {
  const g = game();
  const ids = availIds(g);
  const shorts = deriveShortNames(state.players);
  // #28 decision 8: the tile's visible name is the on-court call name --
  // "Maya", or "Maya R."/the full name on a collision -- never elided
  // (`fitPills`, the squad pill's canvas-measured middle-ellipsis, does not
  // apply here: this tile wraps instead). The accessible name stays the
  // player's full name below, same as the squad pill.
  const names = callNames(state.players);
  const max = opts.max ?? 5;
  const taken = opts.taken || new Set();

  const hd = el('div', 'pickhd');
  hd.append(el('span', 't', opts.title || 'Pick five'));
  hd.append(el('span', 'c' + (selected.length === max ? ' full' : ''), `${selected.length} of ${max}`));

  const grid = el('div', 'pick');
  for (const id of ids) {
    const on = selected.includes(id);
    // #28 decision 8: with `opts.replace` (the Add-a-rule single-player picks,
    // `max: 1`), a full group never blocks a new tile -- the caller's own
    // draft holds one id, so tapping a second tile just overwrites it. Every
    // other picker (closers, units, starting fives) keeps the old block.
    const blocked = !on && (taken.has(id) || (!opts.replace && selected.length >= max));
    const b = el('button', 'plr press ' + (on ? 'on' : 'off'));
    b.type = 'button';
    b.style.setProperty('--c', colorOf(id));
    b.setAttribute('aria-pressed', String(on));
    const full = byId(id)?.name || id;
    // Named explicitly, like the squad pills: the initials/number is content,
    // and the full name is the clearer accessible name than the on-court one.
    b.setAttribute('aria-label', full);
    b.append(el('span', 'av', initials(byId(id) || { name: shorts[id] })), el('span', 'nm', names[id] || full));
    if (on) {
      const check = el('span', 'plr-check', '✓');
      check.setAttribute('aria-hidden', 'true');
      b.append(check);
    }
    b.disabled = blocked;
    b.onclick = () => onToggle(id, !on);
    grid.append(b);
  }
  const box = el('div');
  box.append(hd, grid);
  return box;
}
