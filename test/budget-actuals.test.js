import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The minutes budget used to state a number it could not keep.
 *
 * A hand-set target is only handed to the solver intact when the targets add
 * up to the whole floor budget (see the two engine tests named after it). Set
 * one player to 4 minutes with the rest left alone and the plan gives them 16
 * -- the coach's number and the real one sat about 200px apart on the same
 * screen with nothing joining them.
 *
 * These are source-reading tests, the same trick as plan-table.test.js: the
 * budget rows are DOM built in a module the test runner has no document for.
 * They guard the wiring, not the pixels -- the browser check is in the loop
 * notes. */
const strategy = readFileSync(new URL('../app/strategy.js', import.meta.url), 'utf8');
const render = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');
const state = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');

test('the budget row carries the minutes the plan actually gives', () => {
  assert.match(strategy, /export function refreshBudgetActuals/);
  assert.match(strategy, /el\('span', 'act'\)/, 'the row needs a node to write it into');
  assert.match(strategy, /`plays \$\{fmtMinutes\(got\)\}`/);
});

test('it repaints after a solve, not under the dragging finger', () => {
  // `updateBudgetUI` runs on every `input` event, when `plans` is still the
  // previous solve. Writing the actual there would show the coach a number
  // from the plan they just replaced.
  const fn = strategy.slice(strategy.indexOf('function updateBudgetUI'),
                            strategy.indexOf('export function refreshBudgetActuals'));
  assert.ok(!fn.includes('refreshBudgetActuals'),
    'updateBudgetUI must not paint actuals: mid-drag they are a plan out of date');
  assert.match(render, /budget:\s*\(\) => refreshBudgetActuals\(\)/);
});

test('a slider drag reaches it -- PLAN_ONLY is the drag repaint list', () => {
  const planOnly = render.match(/export const PLAN_ONLY = \[([^\]]*)\]/)[1];
  assert.ok(planOnly.includes("'budget'"), 'dragging a slider must refresh the actuals');
  const afterEdit = render.match(/export const AFTER_EDIT = \[([^\]]*)\]/)[1];
  assert.ok(afterEdit.includes("'budget'"));
  // strategy rebuilds the rows; budget fills them in, so it has to come after
  assert.ok(afterEdit.indexOf("'strategy'") < afterEdit.indexOf("'budget'"));
});

test('the lock button promises what it now delivers', () => {
  /* This test used to assert the opposite, and was right to: `normalize` in
     engine.js is a whitelist and `lockedTargets` was not on it, so a locked row
     had never reached the solver at all -- the lock only guarded the UI's
     "Even out the rest" button, and "Lock these minutes" oversold that.

     The lock is real now: excluded from the proportional share of spare
     minutes, and a minute off a locked target costs the same as breaking a
     floor or a cap. So the label may say so. */
  assert.ok(!strategy.includes('Hold this number when evening out'),
    'the narrower promise no longer describes what the lock does');
  assert.match(strategy, /Hold this number exactly/);
});

test('the strategy blurb no longer claims the budget always adds up', () => {
  assert.ok(!state.includes('The budget always adds up'),
    'the coach can leave it short -- that is the whole bug');
});
