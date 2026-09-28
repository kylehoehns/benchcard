/* #125 fix pass, reuse-reviewer finding 1: `GAMES_VIEW_READY` (`fixtures.mjs`)
 * re-derived `onScreen`'s own "is this screen currently on show" expression
 * by hand and dropped its null guard -- a screen id that has not painted yet
 * throws a `TypeError` under `onScreen`'s guarded form, but reads `undefined`
 * (falsy, so `land`'s boot-wait poll just retries) under the guarded form and
 * throws under the unguarded one. `screenReadyExpr` (`dom.mjs`) is the one
 * builder both now call. Pure string builders -- no CDP call in either -- so
 * this is a `node --test` seam, the same kind `planLanding` gets in
 * `smoke-page-state.test.js`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES_VIEW_READY } from '../scripts/smoke/fixtures.mjs';

test('GAMES_VIEW_READY null-guards #view-games the way onScreen guards every id it is asked about', () => {
  assert.equal(
    GAMES_VIEW_READY,
    `!!(document.getElementById('view-games') && !document.getElementById('view-games').hidden)`,
  );
});
