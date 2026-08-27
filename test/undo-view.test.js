import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Undo puts the record back; it has to put the *screen* back too.
 *
 * Removing a team from the Roster page moves the coach to Games, because the
 * roster they were looking at no longer exists. Undo restored the team but ran
 * the same refresh, so they came back to Games -- the record was right and the
 * screen was not. `showUndo` now tells the refresh which direction it is
 * running in, and the team remover reads the restored `state.view`.
 *
 * Source-reading, like plan-table.test.js: both sides are DOM callbacks. */
const toast = readFileSync(new URL('../app/toast.js', import.meta.url), 'utf8');
const teams = readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8');

test('the undo refresh knows it is an undo', () => {
  const fn = toast.slice(toast.indexOf('function showUndo'));
  assert.match(fn.slice(0, fn.indexOf('\n}')), /\(refresh \|\| renderAll\)\(true\)/);
  // the forward path must stay plain, or every caller sees the same flag twice
  const undoable = toast.slice(toast.indexOf('export function undoable'));
  assert.match(undoable.slice(0, undoable.indexOf('\n}')), /\(refresh \|\| renderAll\)\(\)/);
});

test('undoing a team removal lands on the view it was removed from', () => {
  const fn = teams.slice(teams.indexOf('function removeTeam'), teams.indexOf('/* ---------------- the game tabs'));
  assert.match(fn, /setView\(undoing \? \(state\.view \|\| 'games'\) : 'games'\)/);
});

/* ------------------------------------------------------------------ *
 * an undo must not take a later edit down with it
 *
 * The snapshot is the whole of `state`, which is what makes undo unable to
 * miss a side effect -- and also what makes it destructive if the coach has
 * moved on. Reproduced in the browser: delete a player, fix a spelling in
 * another row, press Undo, and the spelling reverts too, silently. So the
 * offer retires on the next edit. `soon()` is the signal for "the coach
 * changed something", the same reason `editHappened` is called from there.
 * ------------------------------------------------------------------ */
const render = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');

test('an edit retires a pending undo', () => {
  const fn = render.slice(render.indexOf('export function soon'));
  assert.match(fn.slice(0, fn.indexOf('\n}')), /retireUndo\(\)/,
    'soon() must retire the undo offer as well as the recovery notice');
  assert.match(render, /import \{[^}]*\bretireUndo\b[^}]*\} from '\.\/toast\.js'/);
});

test('only snapshot undos are retired, not offers', () => {
  // `offer` acts on ids and takes nothing back, so a later edit leaves it be
  assert.match(toast, /dataset\.undo = '1'/);
  const fn = toast.slice(toast.indexOf('export function retireUndo'));
  assert.match(fn.slice(0, fn.indexOf('\n}')), /\[data-undo\]/);
  const off = toast.slice(toast.indexOf('export function offer'));
  assert.doesNotMatch(off.slice(0, off.indexOf('\n}')), /dataset\.undo/);
});

/* The remove-team confirm is the only confirm in the app, and it is read at
   the one moment copy matters. It used to slot a count phrase in front of a
   fixed tail, so an empty team got "no players yet, their levels and every
   game go with it." -- lowercase in the middle of a sentence, and it does not
   parse. Both halves are now whole sentences. */
test('the remove-team confirm is made of whole sentences', () => {
  const fn = teams.slice(teams.indexOf('function removeTeam'), teams.indexOf("verb: 'Remove team'"));
  // an empty team gets a sentence of its own, not a phrase in front of one
  assert.match(fn, /'There are no players yet, but every game for this team goes with it\.'/);
  assert.doesNotMatch(fn, /'no players yet'/);
  // and the last-team tail is appended as a sentence, not glued on with a comma
  assert.doesNotMatch(fn, /go with it, and Benchcard/);
  assert.match(fn, /' Benchcard goes back to the start\./);
});
