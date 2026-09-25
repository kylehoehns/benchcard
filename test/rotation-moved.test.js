import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';

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
