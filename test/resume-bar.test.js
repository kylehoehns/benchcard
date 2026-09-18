import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withTeam, player } from './state-fixture.js';
import { resumeAt, resumeBarAt } from '../app/card.js';

/* #34 decision 5 and "What would settle it" item 7: `resumeBarAt()` picks
 * WHICH part-played game the floating bar resumes, on a day that can hold
 * more than one. It walks `state.day.games` from the end so that when two
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
    assert.equal(resumeBarAt(), null);
  });
});

test('resumeBarAt is null when the only non-zero live.at values are stint 0 or the last stint', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    const p0 = S.plans[0];
    games[0].live.at = p0.stints.length - 1; // last stint: game over, not "part-played"
    games[1].live.at = 0; // stint 0: indistinguishable from never started
    assert.equal(resumeBarAt(), null);
  });
});

test('resumeBarAt picks the LATER game when both are part-played', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    games[0].live.at = 2;
    games[1].live.at = 3;
    const r = resumeBarAt();
    assert.equal(r.i, 1, 'the later game (index 1) wins, not the earlier one');
  });
});

test('resumeBarAt picks the only part-played game when just the first one is underway', () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    games[0].live.at = 2;
    const r = resumeBarAt();
    assert.equal(r.i, 0);
  });
});

test("resumeBarAt's where matches resumeAt's own where for the picked game", () => {
  const { players, games, settings } = twoGameDay();
  withTeam(players, games, settings, () => {
    S.computeAll();
    games[0].live.at = 2;
    games[1].live.at = 3;
    const r = resumeBarAt();
    const want = resumeAt(S.plans[r.i], games[r.i]);
    assert.equal(r.where, want.where);
  });
});
