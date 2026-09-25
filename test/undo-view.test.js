import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lacks } from './prose.js';

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
  assert.match(fn.slice(0, fn.indexOf('\n}')), /\(refresh \|\| viewRefresh\)\(true\)/);
  // the forward path must stay plain, or every caller sees the same flag twice
  const undoable = toast.slice(toast.indexOf('export function undoable'));
  assert.match(undoable.slice(0, undoable.indexOf('\n}')), /\(refresh \|\| viewRefresh\)\(\)/);
});

/* Two source-regex assertions used to live here: that `viewRefresh` calls
   `setView(state.view)`, and that `removeTeam`'s own refresh calls
   `setView(undoing ? 'settings' : 'today')`. Both are now proven by running
   the behavior, in `node scripts/smoke.mjs --only "today keys and undo"`
   (#23 review) -- New day, Add a game, Remove this game and Remove team all
   land the coach where their undo snapshot says, and a source match that
   cannot tell "true" from "merely spelled the same" was the weaker of the
   two guards on the same claim. */

/* ------------------------------------------------------------------ *
 * an undo must not take a later edit down with it
 *
 * The snapshot is the whole of `state`, which is what makes undo unable to
 * miss a side effect -- and also what makes it destructive if the coach has
 * moved on. Reproduced in the browser: delete a player, fix a spelling in
 * another row, press Undo, and the spelling reverts too, silently. So the
 * offer retires on the next edit.
 *
 * #122: `soon()` (`app/render.js`) is gone, and every edit now goes through
 * `edit()` (`app/edit.js`), which is the one thing that calls `retireUndo`
 * now -- proven by running it, in `test/edit.test.js`'s
 * "the strategy kind retires a pending undo" (the real bug this issue fixed:
 * the strategy segment used to call `renderAll()` directly and never retired
 * undo) and "the theme kind is a preference: it retires undo but skips the
 * first-run check" (every kind retires undo, including a preference). A
 * source match here would only prove the words `retireUndo()` still appear
 * somewhere in `edit.js`, not that every kind actually calls it -- running
 * the behavior for both a record edit and a preference is the stronger
 * proof of the same claim. */

test('only snapshot undos are retired, not offers', () => {
  // `offer` acts on ids and takes nothing back, so a later edit leaves it be
  assert.match(toast, /dataset\.undo = '1'/);
  // `retireUndo` finds the live undo toast through the one shared accessor
  // (`liveUndoToast`, also used by the tip and install prompts to defer
  // behind it) rather than its own copy of the selector.
  const fn = toast.slice(toast.indexOf('export function retireUndo'));
  assert.match(fn.slice(0, fn.indexOf('\n}')), /liveUndoToast\(\)/);
  assert.match(toast, /const liveUndoToast = \(\) => document\.querySelector\('\.toast\[data-undo\]'\)/);
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
  assert.ok(lacks(fn, /'no players yet'/));
  // and the last-team tail is appended as a sentence, not glued on with a comma
  assert.ok(lacks(fn, /go with it, and Benchcard/));
  assert.match(fn, /' Benchcard goes back to the start\./);
});
