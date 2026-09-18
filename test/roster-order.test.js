import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Reordering the roster is one pair of facts, and the code got them wrong for
 * as long as the grip has existed.
 *
 * Until #31 the ▲▼ buttons were `display: none` below 620px, so on a phone the
 * grip was the whole reorder surface -- drag, and Up/Down keys -- and it was
 * also the FIRST element carrying `.obtn`, so `rosterUp`'s
 * `querySelectorAll('.obtn')` addressed the grip as if it were the Up arrow.
 * Measured after one drag at 390x844: the top row's grip came back `disabled`,
 * 0.22 opacity, unfocusable and undraggable, the last row's Up arrow was
 * disabled instead of its Down, and no row's Down was updated at all.
 *
 * #31 moves the pair into Edit mode (decision 7, rationale at
 * app/roster-view.js:93-99, canonical): an Edit row now shows grip +
 * move-up + move-down at every width. This file is re-pointed at that row.
 * Both halves are still pinned because either one alone is satisfiable while
 * the roster is unusable: correct selectors over a row that shows nothing
 * leave a coach with no way to reorder at all.
 *
 * `editRow` builds real DOM through `el()` and `renderRoster` reads `state`,
 * which reaches for localStorage at import time -- so this reads the source.
 * That makes it a guard, and each case names the failure it is standing in
 * front of rather than the shape of the line it matches. */
const js = readFileSync(new URL('../app/roster-view.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');

/* Comments first: this file's own explanation names `.obtn` and `.rgrip`
   repeatedly, and the block above `rosterDrop`'s loop describes the exact bug
   these tests ban. Scoring the explanation is not scoring the code. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = decomment(js);
const cssCode = decomment(css);

// One top-level function's own source: from its declaration to the next one,
// so a case about it never reads its neighbor. The second argument is what a
// reader is told when the function it names is gone or renamed.
function fnSource(name, missing) {
  const at = code.indexOf(`function ${name}`);
  assert.notEqual(at, -1, missing);
  const end = code.indexOf('\nfunction ', at + 1);
  return code.slice(at, end < 0 ? code.length : end);
}

// The same slice, but off the RAW (commented) source -- for the one case
// that is about a comment's own wording, where `code` has already thrown the
// comment away and a case built on `code` would measure nothing.
function fnSourceRaw(name, missing) {
  const at = js.indexOf(`function ${name}`);
  assert.notEqual(at, -1, missing);
  const end = js.indexOf('\nfunction ', at + 1);
  return js.slice(at, end < 0 ? js.length : end);
}

// The Edit row, so a case about it never reads the tapping row above it.
const editRow = fnSource('editRow',
  'editRow is gone or renamed; Edit mode is where reordering lives since #31');

test('an Edit row carries the grip and both move buttons', () => {
  assert.ok(/'obtn rgrip press'/.test(editRow),
    'the Edit row lost its drag grip -- it is the only reorder surface a pointer has');
  const arrows = [...editRow.matchAll(/el\('button', '([^']*)'\)/g)]
    .filter(([, cls]) => cls.split(/\s+/).includes('obtn') && !cls.split(/\s+/).includes('rgrip'));
  assert.equal(arrows.length, 2,
    `the Edit row builds ${arrows.length} move button(s), want move-up and move-down. I3: every `
    + 'drag needs a visible button that does the same thing, and Edit mode is where they live.');
  assert.ok(/icon\('arrow-up'/.test(editRow) && /icon\('arrow-down'/.test(editRow),
    "the Edit row's move buttons stopped building the up/down icons a coach reads as a move control");
  assert.ok(/up\.disabled = idx === 0/.test(editRow) && /dn\.disabled = idx === state\.players\.length - 1/.test(editRow),
    'the ends stopped disabling themselves, so the first row offers a move up that does nothing');
});

test('the drag-end re-enable addresses the arrows, never the grip', () => {
  assert.ok(/querySelectorAll\('\.obtn:not\(\.rgrip\)'\)/.test(code),
    "roster-view.js no longer selects the arrows as `.obtn:not(.rgrip)`. The grip carries "
    + '`.obtn` and comes first, so any selection that includes it shifts the pair by one.');
  assert.ok(!/querySelector(All)?\('\.obtn'\)/.test(code),
    'roster-view.js selects a bare `.obtn` again -- that set starts with the grip, and '
    + 'disabling the grip is disabling the way a finger reorders a player.');
});

test('the grip takes the arrow keys it advertises', () => {
  assert.ok(/aria-label/.test(editRow) && /arrow keys/.test(editRow),
    'the grip stopped promising the arrow keys in its accessible name');
  assert.ok(/ArrowUp/.test(editRow) && /ArrowDown/.test(editRow) && /movePlayer/.test(editRow),
    'the grip promises Up/Down in its label but no longer moves the player, so a keyboard '
    + 'and a screen reader are left with a control that does nothing');
});

/* #31 decision 7: the arrows are no longer the desktop half of the pair. The
   rule that hid them (`@media (max-width: 620px) { .rrow .obtn { display:
   none } }`) is deleted, and this case is what keeps it deleted -- bringing it
   back would take the phone straight back to grip-only, which is the state
   every bug above was measured in. */
test('no width hides the move buttons', () => {
  const hiding = [...cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, sel, body]) => /\.rrow/.test(sel) && /\.obtn/.test(sel) && /display:\s*none/.test(body))
    .map(([, sel]) => sel.trim().replace(/\s+/g, ' '));
  assert.deepEqual(hiding, [],
    `CSS hides a roster reorder button again (${hiding.join(' / ')}). A phone is the only device `
    + 'this app is designed for, so a rule that hides the arrows hides them everywhere that '
    + 'matters, and the grip carries `.obtn` too.');
});

/* Fix pass finding B1: `movePlayer` reorders by rebuilding every row
 * (`renderRoster`) inside the very `flip()` call meant to animate the old
 * rows into their new places -- but `renderRoster` starts with
 * `box.textContent = ''`, which detaches every row `flip` measured before
 * anything moves. `flip`'s own loop skips a detached element
 * (`!e.isConnected`), so every press quietly measures for an animation that
 * can never play. The arrows are a single adjacent swap, exactly what
 * `rosterDrop` already does cheaply for a drag's drop -- so they route
 * through that path instead, and `movePlayer` is left only where a full
 * rebuild is harmless: the grip's keyboard path, which has no pointer to
 * keep visually anchored the way a drag does. */
test('the arrows move through rosterDrop’s cheap path, not movePlayer’s rebuild', () => {
  assert.ok(/up\.onclick = \(\) => arrowMove\(p\.id, -1\)/.test(editRow),
    'the Up arrow no longer calls arrowMove(p.id, -1) -- it should reuse rosterDrop’s cheap '
    + 'splice+DOM-move+redisable path instead of movePlayer’s full-rebuild path');
  assert.ok(/dn\.onclick = \(\) => arrowMove\(p\.id, 1\)/.test(editRow),
    'the Down arrow no longer calls arrowMove(p.id, 1) -- same finding as the Up arrow');
  const arrowMoveSrc = fnSource('arrowMove',
    'arrowMove is gone or renamed; the arrow buttons have nothing cheap left to call');
  assert.ok(/rosterDrop\(/.test(arrowMoveSrc),
    'arrowMove no longer calls rosterDrop -- the whole point of this finding was reusing its '
    + 'cheap path instead of movePlayer’s renderRoster rebuild');
});

test('movePlayer stays wired to the grip’s keyboard path only', () => {
  const grip = editRow.slice(editRow.indexOf('grip.onkeydown'), editRow.indexOf('const up ='));
  assert.ok(/movePlayer\(/.test(grip),
    'the grip’s ArrowUp/ArrowDown handler stopped calling movePlayer');
});

test('movePlayer’s own comment does not promise an animation renderRoster prevents', () => {
  const mp = fnSourceRaw('movePlayer',
    'movePlayer is gone or renamed; the grip’s keyboard path moved with it');
  assert.ok(!/then animate each row from where it was/.test(mp),
    'movePlayer still promises an animation flip() cannot deliver here -- renderRoster wipes '
    + 'and rebuilds every row inside the very callback flip measured, so every "before" element '
    + 'is disconnected (`!e.isConnected`) by the time flip tries to animate it, and nothing ever '
    + 'moves');
});

/* A cancelled pointer is not a drop. An incoming call, the OS claiming the
   gesture or a stray second finger all fire `pointercancel`, and committing
   the move there reorders the roster to wherever the finger happened to be --
   silently, and roster order is what every other screen reads in. */
test('a cancelled drag puts the row back where it started', () => {
  const fn = fnSource('rosterUp', 'rosterUp is gone or renamed; move this case with it');
  const m = fn.match(/pointercancel'[^\n]*\n?[^\n]*/);
  assert.ok(/e\?\.type === 'pointercancel'/.test(fn),
    'rosterUp no longer tells a cancel from a drop, so an interrupted drag commits wherever '
    + 'the finger was');
  assert.ok(/d\.to = d\.from/.test(fn),
    `the cancel branch (${m ? m[0].trim() : 'not found'}) stopped aiming the drop back at the `
    + 'index the row started from');
});

/* The reorder announces itself, and the grip's own name is the whole mechanism.
 *
 * `movePlayer` rebuilds the rows and `withFocus` restores focus by `data-fk`,
 * which is keyed to the PLAYER (`r:<id>:ord`) -- so the grip that comes back
 * is the one that moved, and the node it replaces is detached, which makes the
 * restore a genuine focus event on a new element. A screen reader reads a
 * newly focused control's accessible name. Measured at 390x844 before the
 * change: three presses fired three focus events carrying the IDENTICAL
 * string, which is why the reorder was silent. Measured after: "position 1 of
 * 11", "2 of 11", "3 of 11", "4 of 11", the same `data-fk` throughout.
 *
 * So the position has to stay IN the name, and it has to be computed. A
 * literal position or a literal count is the same silence with extra words --
 * every row would claim the same place, or the count would lie the moment a
 * player is added. This is deliberately the ONLY announcement in the app:
 * there is no live region and no visually-hidden class, and inventing the
 * first announcer is a product decision, not a defect fix. */
test('the grip names the position it moved to, computed not written', () => {
  /* Scoped to the grip's OWN setAttribute call, not to a window of source.
     A 900-character window from the anchor reaches `up.setAttribute` twenty
     lines below, and this case went GREEN with the position moved off the grip
     and onto the Up arrow -- which used to be `display: none` at the 390px
     baseline, i.e. the guard scoring the one element the phone could not see. */
  const call = editRow.indexOf('grip.setAttribute(');
  assert.notEqual(call, -1, 'the grip no longer sets its own accessible name');
  const window = editRow.slice(call, editRow.indexOf(');', call));
  assert.ok(!/\b(up|dn)\.setAttribute/.test(window), 'this slice ran past the grip into the arrows');
  const m = window.match(/position \$\{([^}]+)\} of \$\{([^}]+)\}/);
  assert.ok(m, 'the grip stopped naming its position. Focus IS restored to this grip after a '
    + 'move, so the name is the only thing a screen reader has to hear -- without the position '
    + 'it reads the same words on every press and the reorder is silent again.');
  assert.match(m[1], /\bidx\b|\bindex\b|\bi\b/,
    'the position is not the row index, so every grip would announce the same place');
  assert.match(m[2], /\.length\b/,
    'the count is a literal, so it lies the moment a player is added or removed');
});
