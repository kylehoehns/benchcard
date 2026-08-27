/* The roster page: the player list, the two reorder affordances and the
   pointer-driven drag that backs them, plus the team controls that sit above
   the list. Split out of app.js.

   The scheduler (`soon` / `AFTER_EDIT`) comes in through `initRoster` rather
   than being imported, for the same reason as every other view seam: it
   belongs to the dispatcher in render.js, and importing it back would close
   the module graph into a cycle. `undoable` used to arrive the same way and
   is now imported straight from toast.js, which is a leaf. */
import { deriveShortNames } from './engine.js';
import { dropIndex, duplicateNumbers, focusAfterRemoval } from './roster.js';
import { riseIn, flip, tick, enabled as fxOn } from './fx.js';
import { icon } from './icons.js';
import { $, set, el } from './dom.js';
import { withFocus } from './trap.js';
import { undoable } from './toast.js';
import { state, colorOf, initials, removePlayer, byId } from './state.js';
import { levelMeter, levelKey, levelledCount, resetLevels, repaintLevels } from './balance.js';

let soon = () => {};
let AFTER_EDIT = [];

export function initRoster(scheduler, afterEdit) {
  soon = scheduler;
  AFTER_EDIT = afterEdit;
}

function movePlayer(id, dir) {
  const i = state.players.findIndex(p => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.players.length) return;
  const rows = document.querySelectorAll('#rosterlist .rrow');
  // FLIP: measure, reorder, then animate each row from where it was
  // withFocus keeps the pressed control under the finger/caret: the rows are
  // rebuilt, so without it a second press has nothing focused to press.
  flip(rows, () => withFocus(() => {
    [state.players[i], state.players[j]] = [state.players[j], state.players[i]];
    renderRoster();
  }));
  soon('avail', 'constraints', ...AFTER_EDIT);
}

/* ---- drag to reorder ----------------------------------------------------
 * Pointer events, so a finger and a mouse take the same path. The grab area
 * is the order column and the avatar only: `touch-action: none` has to be
 * scoped to the handle or the whole roster stops scrolling under a thumb.
 * The GRIP is the non-pointer path, not the arrows: `app.css:1881` hides
 * `.rrow .obtn` below 620px, so at the 390px baseline this file designs for the
 * arrows measure 0x0 and only the grip is on screen, taking Up/Down keys. The
 * arrows are the desktop half of the same pair and keep working there. Either
 * way a press only becomes a drag past a 5px threshold, and the click that
 * follows a real drag is swallowed.
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
     only reorder affordance a phone has) and shifted the pair by one, leaving
     the last row's Up disabled and every row's Down stale. */
  order.forEach((r, i) => {
    const [up, dn] = r.querySelectorAll('.obtn:not(.rgrip)');
    if (up) up.disabled = i === 0;
    if (dn) dn.disabled = i === order.length - 1;
  });
  soon('avail', 'constraints', ...AFTER_EDIT);
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
// match the rest of the app's copy.
function joinNames(ids) {
  const names = ids.map(nameOf);
  if (names.length < 3) return names.join(' and ');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function dupeMessage(dupes) {
  if (!dupes.length) return '';
  const sentences = dupes.map(d =>
    `${joinNames(d.ids)} ${d.ids.length > 2 ? 'all' : 'both'} wear #${d.number}.`);
  sentences.push(dupes.length > 1
    ? 'Give one of each a different number.'
    : 'Give one of them a different number.');
  return sentences.join(' ');
}

function paintDupes() {
  const dupes = duplicateNumbers(state.players);
  const others = new Map();          // id -> the names it collides with
  for (const d of dupes) {
    for (const id of d.ids) others.set(id, joinNames(d.ids.filter(x => x !== id)));
  }
  for (const row of document.querySelectorAll('#rosterlist .rrow')) {
    const num = row.querySelector('.num');
    if (!num) continue;
    const with_ = others.get(row.dataset.id);
    num.classList.toggle('dupe', !!with_);
    if (with_) {
      num.setAttribute('aria-invalid', 'true');
      num.title = `Same number as ${with_}`;
    } else {
      num.removeAttribute('aria-invalid');
      num.removeAttribute('title');
    }
  }
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
  const box = $('#rosterlist'); box.textContent = '';
  set('#teamName', 'value', state.teamName || '');
  renderTeamControls();
  renderLevelControls();
  if (!box.dataset.dnd) { box.dataset.dnd = '1'; box.addEventListener('pointerdown', rosterDown); }
  set('#rosterCount', 'textContent', state.players.length
    ? `${state.players.length} player${state.players.length === 1 ? '' : 's'}` : '');

  // column labels for a table with no rows: the first screen a new coach sees
  // should not look like something failed to load
  $('.rhead')?.toggleAttribute('hidden', !state.players.length);

  if (!state.players.length) {
    const e = el('div', 'roster-empty');
    e.append(el('div', 'se-ico', '🏀'));
    e.append(el('div', 'se-t', 'No players yet'));
    e.append(el('div', 'se-s', 'Add them one at a time, or paste your whole roster at once.'));
    box.append(e);
    paintDupes();
    return;
  }

  const shorts = deriveShortNames(state.players);
  state.players.forEach((p, idx) => {
    const row = el('div', 'rrow');
    row.dataset.id = p.id;
    row.style.setProperty('--c', colorOf(p.id));

    /* Two reorder affordances, one shown at a time by CSS: the arrow pair on a
       mouse, and a single grip on a phone -- side by side the arrows cost 88px
       of a 368px row, which is most of what the name needs. The grip is the
       same drag handle the arrows were (rosterDown grabs anything in .rord)
       and takes Up/Down keys, so the keyboard path survives the swap. */
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
    up.onclick = () => movePlayer(p.id, -1);
    const dn = el('button', 'obtn press');
    dn.append(icon('arrow-down', { size: '.85em', stroke: 2.4 }));
    dn.type = 'button'; dn.disabled = idx === state.players.length - 1;
    dn.dataset.fk = `r:${p.id}:dn`;
    dn.setAttribute('aria-label', `Move ${p.name || 'player'} down`);
    dn.onclick = () => movePlayer(p.id, 1);
    ord.append(grip, up, dn);
    row.append(ord);

    row.append(el('div', 'av', initials(p)));

    const num = el('input', 'num'); num.type = 'text'; num.inputMode = 'numeric';
    num.value = p.number || ''; num.placeholder = '–'; num.maxLength = 2;
    num.dataset.fk = `r:${p.id}:num`;
    num.setAttribute('aria-label', `Jersey number for ${p.name}`);
    num.oninput = () => {
      p.number = num.value.replace(/[^0-9]/g, ''); num.value = p.number;
      row.querySelector('.av').textContent = initials(p);
      paintDupes();
      soon('avail', ...AFTER_EDIT);
    };

    const nm = el('input', 'pname'); nm.type = 'text'; nm.value = p.name; nm.placeholder = 'Name';
    nm.dataset.fk = `r:${p.id}:name`;
    nm.setAttribute('aria-label', 'Player name');
    nm.oninput = () => {
      p.name = nm.value;
      if (!p.number) row.querySelector('.av').textContent = initials(p);
      paintDupes();   // the notice names the players; a rename restates it
      soon('avail', 'constraints', ...AFTER_EDIT);
    };

    const sh = el('input', 'short'); sh.type = 'text'; sh.value = p.shortName || '';
    sh.placeholder = shorts[p.id] || '—'; sh.maxLength = 5;
    sh.dataset.fk = `r:${p.id}:short`;
    sh.setAttribute('aria-label', `Card name for ${p.name}`);
    sh.oninput = () => { p.shortName = sh.value.toUpperCase(); sh.value = p.shortName; soon('avail', ...AFTER_EDIT); };

    const x = el('button', 'xbtn press');
    x.type = 'button';
    x.append(icon('trash-2', { size: '.95em' }));
    x.title = `Remove ${p.name}`;
    x.onclick = () => {
      const who = p.name || 'Player';
      undoable([`Removed ${who}.`, ...removalCosts(p.id)].join(' '), () => removePlayer(p.id));
      /* `undoable` has rebuilt the list by the time it returns, and the button
         the coach just pressed went with it. `withFocus` cannot carry this one
         -- it restores by `data-fk`, and this row's key no longer exists -- so
         name the successor the way a list deletion should. Without it focus
         lands on `<body>`: measured, not assumed. */
      const rows = document.querySelectorAll('#rosterlist .rrow');
      const to = focusAfterRemoval(idx, rows.length);
      (rows[to]?.querySelector('.xbtn') || $('#addplayer'))?.focus({ preventScroll: true });
    };

    row.append(num, nm, sh, x);
    /* A second line inside the same row rather than a row of its own, so the
       level belongs to the player visibly.
     *
       It was behind a toggle for exactly one day. The toggle was there to spare
       coaches who would never use this the extra row height -- but a coach
       working rotations on a spreadsheet is precisely who this is for, and a
       feature they have to find first is one most of them never will. It is the
       part of the app that does something their paper cannot. So it is on. */
    row.append(levelMeter(p));
    box.append(row);
  });
  paintDupes();
  riseIn(box.querySelectorAll('.rrow'), { delay: 0.018, from: 6 });
}

/* Roster page: the controls that change how many teams there are. `Add` is
   always offered; `Remove` only once there is a second, because removing the
   only team would leave the app with no roster and no way back to onboarding.
   The buttons themselves are wired in app.js, beside the other team actions --
   this only paints their state. */
/* The Levels toggle and everything that follows from it. Kept beside the other
   roster actions rather than in a fold of its own: a fold below the list is
   what made this feel like a separate feature instead of a column of the
   roster. */
/* The `levels` render key. NOT `renderRoster`, which is what it used to be:
   changing one player's level rebuilt every row in the list and replayed
   `riseIn`'s stagger down all of them, so dragging a meter made the whole
   roster flicker. Nothing in a row except the meter depends on the tier, so
   the meters repaint themselves and only the two boxes OUTSIDE the list are
   rebuilt -- the key, and the foot, where the reset button appears as soon as
   anyone is off the default. */
export function renderLevels() {
  repaintLevels();
  renderLevelControls();
}

function renderLevelControls() {
  const has = state.players.length > 0;

  /* The key goes directly above the rows it explains. It sat under the list in
     the first cut, which meant reading twelve meters before being told which
     end was which. */
  const key = $('#levelskey');
  if (key) {
    key.textContent = '';
    key.hidden = !has;
    if (has) key.append(levelKey());
  }

  // the explanation and the reset sit below; they are read once, not scanned
  const foot = $('#levelsfoot');
  if (!foot) return;
  foot.textContent = '';
  foot.hidden = !has;
  if (!has) return;
  const note = el('p', 'note');
  /* "never change anyone's minutes" used to be the middle clause, and it is
     not true: everyone's SHARE is worked out without levels (budget.js never
     sees them -- test/leak.test.js pins that), but when the stints do not
     divide evenly the solver still has to pick who lands on the high side of
     the rounding, and levels move that pick by a stint. Claim the part the
     test actually guards. */
  /* The second clause has to follow the team's tie-break stance, or it is
     false in a state the app can be in. Under the default the share really is
     worked out without levels; under 'levels' the coach has asked them to
     settle the odd stint, which is the one thing that moves. Everything else
     about the sentence is true either way. */
  const byLevel = (state.settings?.tieBreak ?? 'behind') === 'levels';
  note.textContent = `Levels stay with your team from game to game. ${byLevel
    ? 'They shape who is on the floor together, and the setting below asks them to settle the odd stint when the clock will not divide evenly.'
    : 'They shape who is on the floor together; everyone’s share of the minutes is worked out without them.'} They are never printed and never shown in bench mode.`;
  foot.append(note);
  if (levelledCount()) {
    const reset = el('button', 'btn ghost sm press', 'Put everyone back to the same level');
    reset.type = 'button';
    reset.onclick = resetLevels;
    foot.append(reset);
  }
}

function renderTeamControls() {
  const many = state.teams.length > 1;
  /* Always offered, including for the only team: a season ends, and refusing
     it would leave a coach deleting players one at a time to reach the same
     place. It is behind a confirm and an undo toast, which is the protection
     that actually matches the consequence. */
  set('#removeTeam', 'hidden', false);
  set('#teamCount', 'textContent', many ? `${state.activeTeam + 1} of ${state.teams.length} teams` : '');
}
