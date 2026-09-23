/* The roster page: the player list, the three sheets it opens (one player,
   add a player, paste a list), the two reorder affordances Edit mode shows
   and the pointer-driven drag that backs them, plus the team controls that
   sit above the list. Split out of app.js.

   `edit(kind)` (#122, `app/edit.js`) comes in through `initRoster` rather
   than being imported, for the same reason as every other view seam: it
   belongs to the dispatcher in render.js, and importing it back would close
   the module graph into a cycle. `undoable` used to arrive the same way and
   is now imported straight from toast.js, which is a leaf. */
import { deriveShortNames } from './engine.js';
import { confirmAddLabel, dropIndex, duplicateNumbers, focusAfterRemoval, parseRoster, repeatIndexes } from './roster.js';
import { riseIn, tick, enabled as fxOn } from './fx.js';
import { icon } from './icons.js';
import { $, set, el, uid } from './dom.js';
import { withFocus, openSheet, closeSheet, guardClose, showAskRow } from './trap.js';
import { undoable, offer } from './toast.js';
import { state, colorOf, initials, removePlayer, byId, joinNames, teamName, nextHue, hueSlots } from './state.js';
import { levelMeter, levelName, levelledCount, resetLevels, repaintLevels } from './balance.js';

let edit = () => {};

/* Edit mode is meant to be a property of the screen, not of the data: leaving
   Team and coming back should give the tapping list, which is what a coach
   expects of a mode they turned on to move one player. This flag is
   module-level, though, so nothing resets it on its own -- `resetEditMode`
   below is what `render.js`'s `applyView` calls on the real transition out of
   Team, so the coach who left mid-edit never finds it still on. */
let editing = false;

/* Called from `render.js` on the real transition away from Team (#31 A2). A
   no-op, and no repaint, if Edit was already off. Syncs `#teamEdit`'s own
   label/`aria-pressed` the same way `toggleEditMode` below does -- that
   function takes its button by reference (the click's own `e.currentTarget`),
   but this call has none, so it looks the one fixed id up itself. */
export function resetEditMode() {
  if (!editing) return;
  editing = false;
  const btn = $('#teamEdit');
  if (btn) {
    btn.textContent = 'Edit';
    btn.setAttribute('aria-pressed', 'false');
  }
  renderRoster();
}

export function initRoster(editFn) {
  edit = editFn;
}

/* A jersey number is digits, in both places one can be typed -- the player
   sheet and the add sheet. `inputMode="numeric"` is a hint to the keyboard,
   not a rule, so the field enforces it as the coach types. */
const digitsOnly = s => s.replace(/[^0-9]/g, '');

/* The grip's keyboard path only (B1): `renderRoster` starts with
   `box.textContent = ''`, which detaches every row `flip` measured below
   before anything moves, so `flip`'s own `!e.isConnected` check always skips
   them and no row is ever actually animated from where it was -- a rebuild,
   not a FLIP, dressed as one. That is harmless for a key press, which has no
   pointer to keep visually anchored, so the rebuild (and `withFocus`, which
   puts the pressed control back by `data-fk`) stays; the arrows below use
   `rosterDrop`'s cheap path instead, which really does move without a
   rebuild. */
function movePlayer(id, dir) {
  const i = state.players.findIndex(p => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.players.length) return;
  withFocus(() => {
    [state.players[i], state.players[j]] = [state.players[j], state.players[i]];
    renderRoster();
  });
  edit('reorder');
}

/* B1: the arrows are always a single adjacent swap -- exactly what
   `rosterDrop` already does for a drag's drop, cheaply: splice the two
   affected rows, move the real DOM nodes instead of rebuilding them, and
   re-disable the ends. Reused rather than re-derived, and it is also why the
   arrows need no `withFocus`: their own button node never leaves the DOM, so
   focus simply stays where it was. */
function arrowMove(id, dir) {
  const i = state.players.findIndex(p => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.players.length) return;
  const box = $('#rosterlist');
  const rows = [...box.querySelectorAll('.rrow')];
  rosterDrop({ box, row: rows[i], rows, from: i, to: j });
}

/* ---- drag to reorder ----------------------------------------------------
 * Pointer events, so a finger and a mouse take the same path. The grab area
 * is the order column and the avatar only: `touch-action: none` has to be
 * scoped to the handle or the whole roster stops scrolling under a thumb.
 * Since #31 (decision 7) the grip and the two arrows are all on screen at
 * every width: the `max-width: 620px` rule that used to hide `.rrow .obtn`
 * is gone, because a phone is the only device this app is designed for and a
 * drag needs a visible button that does the same thing (I3). The grip is
 * still the non-pointer path -- it takes Up/Down keys, and its accessible
 * name says so and names the position it reached. Either way a press only
 * becomes a drag past a 5px threshold, and the click that follows a real
 * drag is swallowed.
 *
 * Nothing is re-rendered. The rows are moved in the DOM and `state.players`
 * is spliced to match, which keeps the nodes (and anything typed into them)
 * alive; renderRoster() would rebuild them and flash every row's entrance.
 *
 * With 11 players only about five rows fit a phone, so a drag that cannot
 * scroll can only reach rows that already happen to be on screen -- moving the
 * last player into the starting five would be impossible. The pointer driving
 * the page near either edge therefore scrolls it, and every offset is measured
 * in *document* space (clientY + scrollY) so the row keeps tracking the finger
 * while the page moves underneath it. */
let dnd = null;
const DRAG_EDGE = 60;   // px from the viewport edge where autoscroll starts
const DRAG_SPEED = 16;  // px per frame at the very edge

function rosterDown(e) {
  if (e.button > 0 || dnd) return;
  // A1: only an Edit row is a drag surface -- the tapping list's own `.av`
  // must let a pointer scroll the page under it, not start a reorder.
  if (!e.target.closest('.rrow-edit')) return;
  if (!e.target.closest('.rord, .av')) return;
  const row = e.target.closest('.rrow');
  const box = $('#rosterlist');
  if (!row || !box.contains(row)) return;
  const rows = [...box.querySelectorAll('.rrow')];
  if (rows.length < 2) return;
  const a = rows[0].getBoundingClientRect(), b = rows[1].getBoundingClientRect();
  dnd = { box, row, rows, from: rows.indexOf(row), to: rows.indexOf(row),
          y0: e.clientY + scrollY, y: e.clientY,
          step: b.top - a.top || a.height, live: false, raf: 0 };
  addEventListener('pointermove', rosterMove);
  addEventListener('pointerup', rosterUp);
  addEventListener('pointercancel', rosterUp);
}

function rosterMove(e) {
  if (!dnd) return;
  dnd.y = e.clientY;
  if (!dnd.live) {
    if (Math.abs(e.clientY + scrollY - dnd.y0) < 5) return;
    dnd.live = true;
    tick();
    dnd.box.classList.add('dragging');
    dnd.row.classList.add('drag');
    getSelection()?.removeAllRanges();
    dnd.raf = requestAnimationFrame(rosterEdgeScroll);
  }
  e.preventDefault();
  rosterTrack();
}

/* One place that turns "where is the finger" into "where is the row", so an
   autoscroll frame and a pointermove stay in agreement. */
function rosterTrack() {
  const dy = dnd.y + scrollY - dnd.y0;
  dnd.row.style.transform = `translateY(${dy}px)`;
  const to = dropIndex(dnd.from, dy, dnd.step, dnd.rows.length);
  if (to !== dnd.to) { dnd.to = to; rosterShift(); }
}

/* Scroll while the finger sits near an edge, easing in over the last 60px so
   a drag that merely ends low on the screen does not bolt. */
function rosterEdgeScroll() {
  if (!dnd || !dnd.live) return;
  dnd.raf = requestAnimationFrame(rosterEdgeScroll);
  const over = dnd.y - (innerHeight - DRAG_EDGE), under = DRAG_EDGE - dnd.y;
  const v = over > 0 ? Math.min(over, DRAG_EDGE) : under > 0 ? -Math.min(under, DRAG_EDGE) : 0;
  if (!v) return;
  const before = scrollY;
  scrollBy(0, Math.round(v / DRAG_EDGE * DRAG_SPEED));
  if (scrollY !== before) rosterTrack();   // the page moved: so must the row
}

/* Every row is the same height, so the rows the dragged one has passed just
   slide one slot the other way. */
function rosterShift(d = dnd) {
  const { rows, from, to, step } = d;
  rows.forEach((r, i) => {
    if (i === from) return;
    const d = (from < to && i > from && i <= to) ? -step
            : (from > to && i >= to && i < from) ? step : 0;
    r.style.transform = d ? `translateY(${d}px)` : '';
  });
}

function rosterUp(e) {
  removeEventListener('pointermove', rosterMove);
  removeEventListener('pointerup', rosterUp);
  removeEventListener('pointercancel', rosterUp);
  const d = dnd; dnd = null;
  if (d?.raf) cancelAnimationFrame(d.raf);
  if (!d || !d.live) return;           // a tap: let the button's click through
  // A cancelled pointer is not a drop. An incoming call, the OS claiming the
  // gesture or a stray second finger all fire `pointercancel`, and committing
  // the move there reorders the roster to wherever the finger happened to be
  // -- silently, and roster order is what every other screen reads in. Put the
  // row back instead: aim the drop at `from` and let the same settle path run,
  // so the row animates home and the shifted rows slide back with it.
  if (e?.type === 'pointercancel' && d.to !== d.from) { d.to = d.from; rosterShift(d); }
  const kill = ev => { ev.preventDefault(); ev.stopPropagation(); };
  addEventListener('click', kill, { capture: true, once: true });
  setTimeout(() => removeEventListener('click', kill, true), 0);

  // Everything settles through the same animation, including a drop that ended
  // where it started and a cancel: the row slides to its slot rather than
  // teleporting, and the 260ms fallback covers a transition that never fires
  // because the offset was already zero.
  const settle = () => rosterDrop(d);
  if (!fxOn) { d.row.style.transform = ''; settle(); return; }
  d.row.style.transition = 'transform var(--t-fast) var(--ease)';
  d.row.style.transform = `translateY(${(d.to - d.from) * d.step}px)`;
  let done = false;
  const fin = () => { if (done) return; done = true; settle(); };
  d.row.addEventListener('transitionend', fin, { once: true });
  setTimeout(fin, 260);
}

function rosterDrop(d) {
  const { box, row, rows, from, to } = d;
  const order = rows.slice();
  order.splice(from, 1);
  order.splice(to, 0, row);
  // re-inserting a node restarts its entrance animation; suppress for a frame
  box.classList.add('no-anim');
  for (const r of order) { r.style.transition = ''; r.style.transform = ''; box.append(r); }
  box.classList.remove('dragging');
  row.classList.remove('drag');
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('no-anim')));

  const [p] = state.players.splice(from, 1);
  state.players.splice(to, 0, p);
  if (to !== from) tick();
  /* Re-disable the ends. `:not(.rgrip)` is load-bearing: the grip shares
     `.obtn` with the arrows and is the FIRST of the three, so a bare `.obtn`
     here disabled the top row's grip (0.22 opacity, no focus, no drag -- the
     one reorder affordance a finger has) and shifted the pair by one, leaving
     the last row's Up disabled and every row's Down stale. */
  order.forEach((r, i) => {
    const [up, dn] = r.querySelectorAll('.obtn:not(.rgrip)');
    if (up) up.disabled = i === 0;
    if (dn) dn.disabled = i === order.length - 1;
  });
  edit('reorder');
}

/* ---- duplicate jersey numbers -------------------------------------------
 * Two kids cannot wear the same number, so a collision is a typo or a second
 * paste of the same list -- and the app used to show two 7s on the roster, on
 * the card and in game mode without a word. The roster page is where the fix
 * happens, so the notice lives here rather than in the plan's issue list.
 *
 * Painted separately from renderRoster because the number field must not
 * rebuild its own row while a coach is typing in it: `num.oninput` repaints
 * the markers in place instead, so the warning appears and clears on the
 * keystroke that causes it without the caret moving. */
function nameOf(id) {
  const n = byId(id)?.name?.trim();
  return n || 'a player with no name';
}

// "A and B", "A, B and C" -- US English, serial comma left off deliberately to
// match the rest of the app's copy. `joinNames` (state.js) is the join; this
// is only the ids-to-player-names step ahead of it.
const joinPlayerNames = ids => joinNames(ids.map(nameOf));

function dupeMessage(dupes) {
  if (!dupes.length) return '';
  const sentences = dupes.map(d =>
    `${joinPlayerNames(d.ids)} ${d.ids.length > 2 ? 'all' : 'both'} wear #${d.number}.`);
  sentences.push(dupes.length > 1
    ? 'Give one of each a different number.'
    : 'Give one of them a different number.');
  return sentences.join(' ');
}

/* The per-field marker follows the field: since #31 the only number a coach
   can type into is the one in the open player sheet, so that is the one place
   a collision can be marked on the control itself. The notice is still about
   the whole roster (decision 9), which is why it is painted separately. */
function markDupeField(others) {
  const num = $('#playerNumber');
  const sheet = $('#sheetPlayer');
  if (!num || !sheet) return;
  const with_ = sheet.open ? others.get(sheet.dataset.pid) : null;
  num.classList.toggle('dupe', !!with_);
  if (with_) {
    num.setAttribute('aria-invalid', 'true');
    num.title = `Same number as ${with_}`;
  } else {
    num.removeAttribute('aria-invalid');
    num.removeAttribute('title');
  }
}

function paintDupes() {
  const dupes = duplicateNumbers(state.players);
  const others = new Map();          // id -> the names it collides with
  for (const d of dupes) {
    for (const id of d.ids) others.set(id, joinPlayerNames(d.ids.filter(x => x !== id)));
  }
  markDupeField(others);
  const box = $('#dupewarn');
  if (!box) return;
  box.textContent = '';
  const msg = dupeMessage(dupes);
  if (!msg) return;
  const a = el('div', 'alert warn');
  a.append(el('span', 'ico', '!'), el('span', null, msg));
  box.append(a);
}

/* ---- what removing a player actually costs ------------------------------
 *
 * "Removed Casey." on its own is true and says nothing. `removePlayer` also
 * takes this player out of every rule in every game on the day -- pairings,
 * avoids, the opening five, the closing lineup, units, a minimum or a cap set
 * by hand, and any stint the coach overrode during the game -- and the season
 * ledger, which keeps their filed minutes, stops being able to NAME them:
 * `season-view.js` looks the id up in the roster, so the row reads "Left the
 * team". Undo puts all of it back; nine seconds later nothing does. A coach
 * who is told none of that finds out on a Saturday.
 *
 * The rules half is a STRUCTURAL question, not a second copy of
 * `removePlayer`'s list: it asks whether the id appears anywhere in the
 * game's constraints, its sit-out list or its overrides. A new kind of rule
 * added to the sweep is covered here the day it lands, which a hand-written
 * list would not be. `"id"` with the quotes, because JSON writes both an
 * array entry and an object key that way and a bare id would also match a
 * longer one that starts with it.
 *
 * Each cost is its own short sentence, and a cost that does not apply is not
 * mentioned: a coach on their first Saturday, with no rules set and no game
 * filed, still gets the plain "Removed Casey."
 */
function removalCosts(id) {
  const tag = `"${id}"`;
  const out = [];
  if (state.day.games.some(g => JSON.stringify([g.constraints, g.out, g.live?.overrides ?? 0]).includes(tag)))
    out.push('Their rules went too.');
  if (state.season.games.some(g => Object.hasOwn(g.minutes, id)))
    out.push('The season keeps their minutes, not their name.');
  return out;
}

export function renderRoster() {
  const n = state.players.length;
  const box = $('#rosterlist'); box.textContent = '';
  set('#teamName', 'value', state.teamName || '');
  renderTeamControls();
  renderTeamActions();
  if (!box.dataset.dnd) { box.dataset.dnd = '1'; box.addEventListener('pointerdown', rosterDown); }
  set('#teamTitle', 'textContent', teamName() || 'Team');
  set('#rosterCount', 'textContent', n ? `${n} player${n === 1 ? '' : 's'}` : '');

  /* Decision 8: with nobody on the roster the group box itself goes, rather
     than standing open and empty above a designed empty state (W3). */
  box.hidden = !n;
  const empty = $('#teamEmpty');
  if (empty) empty.hidden = n > 0;

  if (!n) {
    paintDupes();
    return;
  }

  state.players.forEach((p, idx) => {
    box.append(editing ? editRow(p, idx) : playerRow(p));
  });
  paintDupes();
  riseIn(box.querySelectorAll('.rrow'), { delay: 0.018, from: 6 });
}

/* #31 item 7: Edit in the header swaps the tapping list for the reorder list
   and back. The flag lives here, with the two row builders it chooses
   between; the button is wired in app.js beside the other Team controls, and
   its own label is the state a coach reads ("Edit" / "Done"), which is why
   `aria-pressed` follows it rather than standing in for it. */
export function toggleEditMode(btn) {
  editing = !editing;
  if (btn) {
    btn.textContent = editing ? 'Done' : 'Edit';
    btn.setAttribute('aria-pressed', String(editing));
  }
  renderRoster();
}

/* What a coach reads down the list. A player with no name still needs a row
   they can open, so the row says so rather than showing a blank line. */
const rowName = p => p.name || 'Unnamed';

/* What both kinds of row are before their contents: the player's id, which is
   how the drag and `repaintRow` find a row again, and the player's own color,
   which the badge reads off the row as `--c`. */
function rowShell(tag, cls, p) {
  const row = el(tag, cls);
  row.dataset.id = p.id;
  row.style.setProperty('--c', colorOf(p.id));
  return row;
}

/* One line per kid, the way a coach reads a roster on paper (#31 item 1): the
   number in their color, the name, the word for their level, and a chevron
   that says the row opens. The whole row is one button (C6), so there is
   nothing in the list a mis-tap can edit -- everything about a player is
   edited in their own sheet. */
function playerRow(p) {
  const row = rowShell('button', 'prow rrow', p);
  row.type = 'button';
  row.append(el('span', 'av', initials(p)));
  row.append(el('span', 'prow-t', rowName(p)));
  row.append(el('span', 'prow-v', levelName(p)));
  row.append(icon('chevron_right', { size: '.8rem', cls: 'prow-chev' }));
  row.onclick = () => openPlayerSheet(p, row);
  return row;
}

/* One row, repainted where it stands.
 *
 * The list is deliberately not in `AFTER_EDIT` (`render.js`, and the KEEP
 * reason in `test/render-sections.test.js`): it is rebuilt by its own edits,
 * because rebuilding it replays `rowIn` down all eleven rows. That is right
 * for a row joining or leaving, and wrong for the three things a sheet can
 * change about a player who is already in the list -- their number, their
 * name and their level -- which the coach is changing while that list shows
 * above the sheet. So those are written back onto the row they came from.
 * Found by `data-id` rather than held in a variable, so nothing here can go
 * stale against a rebuild that happened in between. */
function repaintRow(p) {
  const row = document.querySelector(`#rosterlist .rrow[data-id="${CSS.escape(p.id)}"]`);
  if (!row) return;
  const av = row.querySelector('.av'); if (av) av.textContent = initials(p);
  const nm = row.querySelector('.prow-t'); if (nm) nm.textContent = rowName(p);
  const lv = row.querySelector('.prow-v'); if (lv) lv.textContent = levelName(p);
}

/* #31 A5: the player sheet's own identity block, same idea as `repaintRow`
   above -- found by the dialog's own `data-pid` rather than held in a
   variable, so a number, name or level edit made while the sheet is open
   repaints it in place. `data-pid` is set by `openPlayerSheet` before the
   dialog's own `showModal()` runs, so this also paints the very first open,
   not only a later edit -- and does nothing for any player who is not the
   one the dialog is currently keyed to. */
function repaintIdent(p) {
  const dialog = $('#sheetPlayer');
  if (!dialog || dialog.dataset.pid !== p.id) return;
  set('#playerIdentAv', 'textContent', initials(p));
  set('#playerIdentName', 'textContent', rowName(p));
  set('#playerIdentLevel', 'textContent', levelName(p));
}

/* Edit mode's row (#31 item 7, decision 7): the drag grip AND both move
   buttons, at every width -- a phone is the only device this app is designed
   for, and I3 wants a visible button for every drag. Nothing here is a text
   field and there is no remove: C6 puts removal in the row's own detail,
   which is the player sheet. */
function editRow(p, idx) {
  const row = rowShell('div', 'prow rrow rrow-edit', p);

  const ord = el('div', 'rord');
  const grip = el('button', 'obtn rgrip press');
  grip.append(icon('grip-vertical', { size: '1.05em', stroke: 2.4 }));
  grip.type = 'button';
  grip.dataset.fk = `r:${p.id}:ord`;
  /* The position is IN the name, and that is the whole announcement.
     `movePlayer` rebuilds the rows and `withFocus` puts focus back by
     `data-fk` -- which is keyed to the PLAYER, so the grip that comes back
     is the one that moved, not the one now sitting where it used to be. The
     old node is detached by then, so the restore is a real focus event on a
     new element, and a screen reader reads the newly focused control's name
     aloud. It just used to read the same words every time: measured at
     390x844, ArrowUp fired a second `focusin` on `r:p1:ord` carrying the
     identical string, which is exactly why the reorder was silent. With the
     position in the name that same event now says "position 1 of 11".

     So: no live region, no visually-hidden class, no announcer, and nothing
     new to keep in step. Deliberately NOT extended to Shuffle or a strategy
     change -- announce what the coach did when the feedback is otherwise
     invisible; do not announce what they explicitly asked for. The new plan
     IS the answer to a Shuffle, and it is already on screen. */
  grip.setAttribute(
    'aria-label',
    `Reorder ${p.name || 'player'}, position ${idx + 1} of ${state.players.length}: `
    + 'drag, or press the up and down arrow keys',
  );
  grip.onkeydown = e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    movePlayer(p.id, e.key === 'ArrowUp' ? -1 : 1);
  };
  const up = el('button', 'obtn press');
  up.append(icon('arrow-up', { size: '.85em', stroke: 2.4 }));
  up.type = 'button'; up.disabled = idx === 0;
  up.dataset.fk = `r:${p.id}:up`;
  up.setAttribute('aria-label', `Move ${p.name || 'player'} up`);
  up.onclick = () => arrowMove(p.id, -1);
  const dn = el('button', 'obtn press');
  dn.append(icon('arrow-down', { size: '.85em', stroke: 2.4 }));
  dn.type = 'button'; dn.disabled = idx === state.players.length - 1;
  dn.dataset.fk = `r:${p.id}:dn`;
  dn.setAttribute('aria-label', `Move ${p.name || 'player'} down`);
  dn.onclick = () => arrowMove(p.id, 1);
  ord.append(grip, up, dn);
  row.append(ord);
  row.append(el('span', 'av', initials(p)));
  row.append(el('span', 'prow-t', rowName(p)));
  return row;
}

/* ---- the player sheet (#31 item 3) ---------------------------------------
 *
 * One kid, one place: the number, the name, the name the card prints, the
 * level, and the way off the team. The rows are static markup in index.html
 * (the same arrangement `#sheetCard` uses for its options) -- this fills in
 * the values and rewires the four handlers to the player being opened, so
 * there is one set of fields rather than one per player.
 *
 * Every field edits `p` directly and repaints through `soon`, exactly as the
 * roster row's own inputs used to: the list behind the sheet still has to
 * show the new name, and the plan still has to be re-solved. */
function openPlayerSheet(p, trigger) {
  const dialog = $('#sheetPlayer');
  if (!dialog) return;
  const num = $('#playerNumber'), nm = $('#playerName'), sh = $('#playerShort');
  // the heading is the player's name, so it is rewritten as the name is typed
  const showTitle = () => set('#sheetPlayerTitle', 'textContent', p.name || 'Player');

  dialog.dataset.pid = p.id;   // how `paintDupes` knows whose number is on show
  // A5: the identity block's badge reads the same `--c` a roster row's own does.
  $('#playerIdent').style.setProperty('--c', colorOf(p.id));
  repaintIdent(p);
  showTitle();
  num.value = p.number || '';
  nm.value = p.name || '';
  sh.value = p.shortName || '';
  /* The automatic short name as the placeholder, so the field shows what the
     card prints today and typing over it is plainly an override. */
  sh.placeholder = deriveShortNames(state.players)[p.id] || '—';
  num.setAttribute('aria-label', `Jersey number for ${p.name || 'this player'}`);
  sh.setAttribute('aria-label', `Card name for ${p.name || 'this player'}`);

  num.oninput = () => {
    p.number = digitsOnly(num.value); num.value = p.number;
    repaintRow(p);
    repaintIdent(p);   // A5: the badge reads the number first (`initials`)
    paintDupes();
    edit('player');
  };
  nm.oninput = () => {
    p.name = nm.value;
    showTitle();
    repaintRow(p);
    repaintIdent(p);
    paintDupes();   // the notice names the players; a rename restates it
    edit('playerName');
  };
  sh.oninput = () => { p.shortName = sh.value.toUpperCase(); sh.value = p.shortName; edit('player'); };

  const lv = $('#playerLevel');
  lv.textContent = '';
  lv.append(levelMeter(p));
  set('#playerLevelNote', 'textContent', levelsNote());

  const rm = $('#playerRemove');
  rm.onclick = () => {
    const idx = state.players.findIndex(x => x.id === p.id);
    const who = p.name || 'Player';
    /* `undoable` repaints through `setView(state.view)`, which closes every
       open sheet on its way (applyView, render.js) -- so this sheet is gone
       and the snackbar lands in `#toasts` where the coach can still reach it,
       with no second close path of its own. */
    undoable([`Removed ${who}.`, ...removalCosts(p.id)].join(' '), () => removePlayer(p.id));
    /* The row the coach came from went with the player, and `withFocus`
       cannot carry this one -- it restores by `data-fk`, and this row's key no
       longer exists -- so name the successor the way a list deletion should.
       Without it focus lands on `<body>`. */
    const rows = document.querySelectorAll('#rosterlist .rrow');
    const to = focusAfterRemoval(idx, rows.length);
    (rows[to] || $('#teamAdd'))?.focus({ preventScroll: true });
  };

  openSheet(dialog, trigger);
  paintDupes();   // the sheet's own number field carries the collision marker
}

/* The footnote under the sheet's Level row. */
function levelsNote() {
  /* "never change anyone's minutes" used to be the middle clause, and it is
     not true: everyone's SHARE is worked out without levels (budget.js never
     sees them -- test/leak.test.js pins that), but when the stints do not
     divide evenly the solver still has to pick who lands on the high side of
     the rounding, and levels move that pick by a stint. Claim the part the
     test actually guards.

     The second clause has to follow the team's tie-break stance, or it is
     false in a state the app can be in. Under the default the share really is
     worked out without levels; under 'levels' the coach has asked them to
     settle the odd stint, which is the one thing that moves. Everything else
     about the sentence is true either way. */
  const byLevel = (state.settings?.tieBreak ?? 'behind') === 'levels';
  return `Levels stay with your team from game to game. ${byLevel
    ? 'They shape who is on the floor together, and the tie-break setting asks them to settle the odd stint when the clock will not divide evenly.'
    : 'They shape who is on the floor together; everyone’s share of the minutes is worked out without them.'} They are never printed and never shown in bench mode.`;
}

/* ---- the two ways to add (#31 items 5 and 6) -----------------------------
 *
 * Both are commit sheets (C4): the confirm's two spellings are
 * `confirmAddLabel`, app/roster.js:200-203 (canonical), not re-derived here. */

/* A new kid, typed or pasted: both doors make the same record, so the default
   level and the empty card-name override are decided once. The hue is the
   caller's, because one at a time takes the next free one and a paste has to
   spread a whole list across the wheel. */
const newPlayer = (name, number, hue) =>
  ({ id: uid('p'), name, number, shortName: '', tier: 3, hue });

/* A row joined or left the list, so the list IS rebuilt -- it is deliberately
   not in `AFTER_EDIT` (see `repaintRow`), and this is the edit that should
   replay its entrance. Then the plan is re-solved with the rules, because who
   is on the team is what the rules are about. */
function rosterChanged() {
  renderRoster();
  edit('rosterChange');
}

function paintAddConfirm() {
  const num = $('#addNumber'), nm = $('#addName');
  set('#addPlayerGo', 'textContent', confirmAddLabel(1));
  // A3: nothing typed is nothing to add -- no pushing a blank "Unnamed" player.
  $('#addPlayerGo').disabled = !num.value.trim() && !nm.value.trim();
}

// I7: the same ask-row toggle `showPasteAsk` below and teams-view.js's
// `showFlowAsk` use, shared out of trap.js next to `guardClose`.
function showAddAsk(on) { showAskRow('#addAsk', '#addFoot', '#addKeep', on); }

export function openAddPlayerSheet(trigger) {
  const dialog = $('#sheetAddPlayer');
  if (!dialog) return;
  const num = $('#addNumber'), nm = $('#addName');
  num.value = ''; nm.value = '';
  showAddAsk(false);
  paintAddConfirm();
  num.oninput = () => { num.value = digitsOnly(num.value); paintAddConfirm(); };
  nm.oninput = paintAddConfirm;
  $('#addPlayerGo').onclick = () => {
    state.players.push(newPlayer(nm.value.trim(), num.value, nextHue()));
    closeSheet(dialog);
    rosterChanged();
  };
  $('#addKeep').onclick = () => { showAddAsk(false); nm.focus(); };
  $('#addDiscard').onclick = () => { num.value = ''; nm.value = ''; showAddAsk(false); closeSheet(dialog); };
  /* A3/C4: same close guard as the paste sheet (`guardClose`, trap.js) --
     closing on top of typed content asks first, and an empty sheet has
     nothing to lose. */
  guardClose(dialog, () => {
    if (!num.value.trim() && !nm.value.trim()) return false;
    showAddAsk(true);
    return true;
  });
  openSheet(dialog, trigger);
}

export function openPasteSheet(trigger) {
  const dialog = $('#sheetPaste');
  if (!dialog) return;
  const ta = $('#pasteText');
  ta.value = '';
  showPasteAsk(false);
  paintPasteConfirm();
  ta.oninput = paintPasteConfirm;
  $('#pasteGo').onclick = commitPaste;
  $('#pasteKeep').onclick = () => { showPasteAsk(false); ta.focus(); };
  $('#pasteDiscard').onclick = () => { ta.value = ''; showPasteAsk(false); closeSheet(dialog); };
  /* C4: closing on top of typed text asks first. The guard is consulted by
     every close a coach can make -- the ✕, Escape, Android's back gesture and
     a backdrop tap all end up in `closeSheet` -- and returns true for "asked,
     stay open". With an empty box there is nothing to lose and the close goes
     straight through. */
  guardClose(dialog, () => {
    if (!ta.value.trim()) return false;
    showPasteAsk(true);
    return true;
  });
  openSheet(dialog, trigger);
}

function showPasteAsk(on) { showAskRow('#pasteAsk', '#pasteFoot', '#pasteKeep', on); }

function paintPasteConfirm() {
  set('#pasteGo', 'textContent', confirmAddLabel(parseRoster($('#pasteText').value).length));
}

/* Paste appends, and it must keep doing so -- twins with the same first name
   are real, so a silent dedupe would quietly delete a kid. What it must not do
   is say nothing when a coach pastes the same list twice: the roster doubles,
   and the card copes by disambiguating to MARW / MARW2 / MARW3, which is a
   card nobody can read. So: add everything, then name the repeats and offer to
   drop just those. Ignoring the offer leaves the paste exactly as it landed. */
function commitPaste() {
  const parsed = parseRoster($('#pasteText').value);
  if (!parsed.length) return;
  const repeats = repeatIndexes(state.players, parsed);
  const slots = hueSlots(parsed.length);
  const added = parsed.map((x, i) => newPlayer(x.name, x.number, slots[i]));
  state.players.push(...added);
  $('#pasteText').value = '';   // nothing left to lose, so the close guard lets go
  closeSheet($('#sheetPaste'));
  rosterChanged();
  if (!repeats.length) return;
  const n = repeats.length;
  const ids = repeats.map(i => added[i].id);
  offer(`${n} of these ${n === 1 ? 'was' : 'were'} already on the roster.`, 'Skip them', () => {
    for (const id of ids) removePlayer(id);
    rosterChanged();
  });
}

/* The `levels` render key. NOT `renderRoster`, which is what it used to be:
   changing one player's level rebuilt every row in the list and replayed
   `riseIn`'s stagger down all of them. Since #31 the level control is not in
   the list at all -- it is the meter in the open player sheet -- so the meter
   repaints itself and only the actions group outside the list is rebuilt,
   where the reset row appears as soon as anyone is off the default. */
export function renderLevels() {
  repaintLevels();
  renderTeamActions();
  /* The word for the level is on the roster row too, and the row the coach
     just changed is sitting behind the open sheet. */
  for (const p of state.players) { repaintRow(p); repaintIdent(p); }
}

/* The second group under the roster (#31 decision 6): the other way to add
   players, and -- only once somebody is off the default -- the one levels
   control that stays on this screen. Its wording is unchanged from the old
   `#levelsfoot`; the explanation that used to sit beside it is now the
   footnote under Level in the player sheet, where the control is. */
function renderTeamActions() {
  const box = $('#teamActions');
  if (!box) return;
  box.textContent = '';
  box.hidden = !state.players.length;
  if (!state.players.length) return;

  const grp = el('div', 'pgrp');

  const paste = actionRow('Paste a list');
  paste.id = 'pasteRow';
  // the chevron says this row opens something, the way a roster row's does
  paste.append(icon('chevron_right', { size: '.8rem', cls: 'prow-chev' }));
  paste.onclick = () => openPasteSheet(paste);
  grp.append(paste);

  if (levelledCount()) {
    const reset = actionRow('Put everyone back to the same level');
    reset.onclick = resetLevels;
    grp.append(reset);
  }

  box.append(grp);
}

// one row of that group: the same `.prow` a roster row and a sheet row are
function actionRow(label) {
  const row = el('button', 'prow');
  row.type = 'button';
  row.append(el('span', 'prow-t', label));
  return row;
}

/* Roster page: the controls that change how many teams there are. `Add` is
   always offered; `Remove` only once there is a second, because removing the
   only team would leave the app with no roster and no way back to onboarding.
   The buttons themselves are wired in app.js, beside the other team actions --
   this only paints their state. */
function renderTeamControls() {
  const many = state.teams.length > 1;
  /* Always offered, including for the only team: a season ends, and refusing
     it would leave a coach deleting players one at a time to reach the same
     place. It is behind a confirm and an undo toast, which is the protection
     that actually matches the consequence. */
  set('#removeTeam', 'hidden', false);
  set('#teamCount', 'textContent', many ? `${state.activeTeam + 1} of ${state.teams.length} teams` : '');
}
