import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withTeam, withDays, player } from './state-fixture.js';
import { resumeAt, resumeBarAt } from '../app/live.js';

/* #34 decision 5 and "What would settle it" item 7: `resumeBarAt(days,
 * dayPlans)` picks WHICH part-played game the floating bar resumes, on a day
 * that can hold more than one. It walks `days` from the end so that when two
 * games are both mid-play the coach lands back on the one they were most
 * recently away from, rather than always the earliest game on the day.
 *
 * Built on the two-game day this file assembles by hand with `withTeam` and
 * `S.computeAll()` -- the same fixture seam sentence.test.js and
 * plan-sheet.test.js already use -- so every case is driven through real
 * plans, not a hand-typed stand-in for what `resumeAt` would have said. */

// Two real games, built the way newTeam builds a day's first game and the
// way "Same as ${when}" clones the second -- `S.newGame`, not a hand-typed
// stand-in for the shape `buildStints` needs. `resolve-rest.test.js` types
// that shape out by hand for its own reasons; this file does not need to.
function twoGameDay() {
  const players = [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Cara'), player('d', 'Dee'), player('e', 'Eve')];
  const settings = { periods: 4, periodMinutes: 8 };
  const g0 = S.newGame(0, null, settings);
  const g1 = S.newGame(1, g0, settings);
  return { players, games: [g0, g1], settings };
}

test('resumeBarAt is null when neither game has a live.at at all', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    assert.equal(resumeBarAt(S.team().days, S.dayPlans), null);
  });
});

test('resumeBarAt is null when the only non-zero live.at values are stint 0 or the last stint', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    const p0 = S.plans[0];
    games[0].live.at = p0.stints.length - 1; // last stint: game over, not "part-played"
    games[1].live.at = 0; // stint 0: indistinguishable from never started
    assert.equal(resumeBarAt(S.team().days, S.dayPlans), null);
  });
});

test('resumeBarAt picks the LATER game when both are part-played', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    games[0].live.at = 2;
    games[1].live.at = 3;
    const r = resumeBarAt(S.team().days, S.dayPlans);
    assert.equal(r.i, 1, 'the later game (index 1) wins, not the earlier one');
  });
});

test('resumeBarAt picks the only part-played game when just the first one is underway', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    games[0].live.at = 2;
    const r = resumeBarAt(S.team().days, S.dayPlans);
    assert.equal(r.i, 0);
  });
});

/* `resumeAt` used to default both of its arguments -- the plan to
   `plans[state.activeGame]` and the game to `game()` -- so passing an
   `undefined` plan silently substituted the ACTIVE game's plan while keeping
   the game that was passed in. `resumeBarAt` walks `days`' games by index, so
   the moment `dayPlans` is shorter than that list (a day's games written
   before the recompute that follows them lands) that substitution used to
   fire. `resumeAt` and `resumeBarAt` now take no default arguments at all, so
   the substitution cannot happen. */
test('resumeBarAt ignores a game with no plan rather than borrowing another game\'s', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    games[0].live.at = 2;
    games[1].live.at = 3;
    const dayPlans = [[S.plans[0]]]; // dayPlans shorter than the day's games; index 1 is undefined
    const r = resumeBarAt(S.team().days, dayPlans);
    assert.equal(r && r.i, 0,
      'game 1 has no plan, so the bar must fall back to game 0, not offer game 1 on game 0\'s plan');
  });
});

test("resumeBarAt's where matches resumeAt's own where for the picked game", () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    games[0].live.at = 2;
    games[1].live.at = 3;
    const r = resumeBarAt(S.team().days, S.dayPlans);
    const want = resumeAt(S.plans[r.i], games[r.i].live);
    assert.equal(r.where, want.where);
  });
});

/* #101 item 8: the bar is no longer scoped to `state.day` -- a part-played
 * game on a day that is NOT the one currently open still has to show it.
 * `withTeam` only builds a one-day team, so this test uses `withDays`
 * (state-fixture.js) instead, the two-day harness test/day-list.test.js's
 * own cases share. */
test('resumeBarAt finds a part-played game on a day that is not the open one', () => {
  const { players, games: satGames, settings } = twoGameDay();
  const sunGame = S.newGame(0, null, settings);
  withDays(players, [
    { name: '', date: '2026-09-26', games: satGames },
    { name: '', date: '2026-09-27', games: [sunGame] },
  ], settings, () => {
    S.computeAll();
    satGames[0].live.at = 2; // part-played, but on the day that is NOT open
    const r = resumeBarAt(S.team().days, S.dayPlans);
    assert.ok(r, 'a part-played game on a closed day must still surface');
    assert.equal(r.d, 0, 'it is Saturday (day 0), not the open Sunday');
    assert.equal(r.i, 0);
  }, 1); // Sunday (day 1) is open; Saturday is not
});
