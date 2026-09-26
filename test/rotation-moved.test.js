import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, withDays, player } from './state-fixture.js';

/* #134 Proof: "Rotation-moved detection for underway games; no detection for
 * not-started, finished, or an identical rotation" against `computeAll` and
 * the stamp it keeps in `syncOverrides`. `overridesDropped` already says
 * "the rotation moved and there were swaps to drop"; `rotationMoved` is the
 * companion that also fires with nothing to drop, because the played
 * minutes were rewritten either way (item 4) -- but only while the game is
 * "underway" per `stage()` (live.js), never for a game that has not started
 * or one already finished (item 5). Read-and-reset, exactly like
 * `overridesDropped`. */

const players = [player('p0'), player('p1'), player('p2'), player('p3'), player('p4'), player('p5')];
const underway = (extra) => bareGame({ id: 'g0', live: { at: 1, overrides: {} }, ...extra });

test('an underway game whose rotation moves is reported by rotationMoved', () => {
  const g = underway();
  withTeam(players, [g], {}, () => {
    S.computeAll();
    assert.deepEqual(S.rotationMoved(), [], 'the very first computeAll only adopts a baseline');
    g.periodMinutes = 6;
    S.computeAll();
    assert.deepEqual(S.rotationMoved(), [g.id], 'a format change rebuilt the rotation of an underway game');
  });
});

test('rotationMoved stays empty when the rotation is unchanged', () => {
  const g = underway();
  withTeam(players, [g], {}, () => {
    S.computeAll();
    S.rotationMoved();
    g.label = 'Renamed opponent';
    S.computeAll();
    assert.deepEqual(S.rotationMoved(), [], 'a rename does not move the rotation');
  });
});

const NOT_UNDERWAY = [
  ['a game that has not started', { at: 0, overrides: {} }, 'a not-started game is not "underway"'],
  ['a finished game', { at: 0, overrides: {}, finished: true }, 'a finished game is not "underway"'],
];

for (const [label, live, message] of NOT_UNDERWAY) {
  test(`rotationMoved stays empty for ${label}`, () => {
    const g = bareGame({ id: 'g0', live });
    withTeam(players, [g], {}, () => {
      S.computeAll();
      g.periodMinutes = 6;
      S.computeAll();
      assert.deepEqual(S.rotationMoved(), [], message);
    });
  });
}

/* `render()`'s settled snapshot (design step 1) asks `dayUnderway()` on
 * every repaint, including the one right after `removeGame()` empties a
 * team down to zero days (#126: "no empty days" -- removing a team's last
 * game drops its day too). `state.day` is then `undefined` (state.js's own
 * accessor, `team().days[team().activeDay]`, with an empty `days`), so
 * `dayUnderway` must not read `state.day.games` the way every other caller
 * -- which always has an active day -- gets away with. */
/* Quality review (#134): `moved` was scoped to the whole active TEAM --
 * `computeAll` solves every day of the team on every render (`dayPlans =
 * team().days.map(solveDay)`), and `syncOverrides` adds to `moved` for any
 * underway game in any of them. `dayUnderway`/the settled snapshot are
 * scoped to `state.day` alone, so a team-wide edit that moved a game on a
 * day the coach is not looking at made `render()` offer Undo -- and restore
 * -- over the wrong day's game. `rotationMoved` must report only the active
 * day's own games. */
test('rotationMoved only reports the active day\'s game, not an off-screen day\'s', () => {
  const g0 = bareGame({ id: 'g0', live: { at: 1, overrides: {} } });
  const g1 = bareGame({ id: 'g1', live: { at: 1, overrides: {} } });
  withDays(players, [
    { name: '', date: '2026-09-26', games: [g0] },
    { name: '', date: '2026-09-27', games: [g1] },
  ], {}, () => {
    S.computeAll();
    S.rotationMoved(); // the first computeAll only adopts each game's baseline

    // The off-screen day (day 1) moves; the active day is day 0.
    g1.periodMinutes = 6;
    S.computeAll();
    assert.deepEqual(S.rotationMoved(), [],
      'a move on an off-screen day must not be reported for the active day');

    // Now the active day's own game moves.
    g0.periodMinutes = 6;
    S.computeAll();
    assert.deepEqual(S.rotationMoved(), ['g0'],
      'a move on the active day is reported');
  }, 0);
});

test('dayUnderway does not throw and reports false with no active day', () => {
  const g = underway();
  withTeam(players, [g], {}, () => {
    S.computeAll();
    S.removeGame();
    assert.equal(S.state.day, undefined, 'the only game and its day are both gone');
    assert.doesNotThrow(() => S.dayUnderway());
    assert.equal(S.dayUnderway(), false, 'no active day is never "underway"');
  });
});
