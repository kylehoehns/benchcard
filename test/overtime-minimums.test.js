import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';

/* #564: does overtime count toward minimums? A characterization of what the app
 * does, so How it works can say it. The game: eight kids (p0..p7), 2 periods of
 * 16, a sub every 4 -- eight stints, and the balanced plan gives every kid 20
 * minutes -- then the game is on its last stint when Add overtime is tapped
 * (Next rotation). */

const players = Array.from({ length: 8 }, (_, i) => player(`p${i}`));
const ALL = players.map(p => p.id);

function lastStint(settings, fn) {
  const g = bareGame({ id: 'g0', periods: 2, periodMinutes: 16, granMode: 'everyN', granValue: 4, seed: 7, live: { at: 0, overrides: {} } });
  return withTeam(players, [g], settings, () => {
    S.computeAll();
    g.live.at = 7;
    S.computeAll();
    return fn(g);
  });
}
const overtimeFives = g => S.effectiveStints(g, S.plans[0]).slice(8).map(s => s.onFloor);

test('with no minimum, the one overtime stint goes to p2 p3 p4 p5 p7 and p6 sits it', () => {
  lastStint({}, g => {
    assert.equal(S.addOvertime(g, 4, 'next'), true);
    assert.deepEqual(overtimeFives(g), [['p2', 'p3', 'p4', 'p5', 'p7']]);
  });
});

test('a kid\'s own minimum counts overtime: p6, 20 minutes in and wanting 24, is on for the overtime stint', () => {
  lastStint({}, g => {
    const played = S.minutesFrom(S.effectiveStints(g, S.plans[0]).slice(0, 8), ALL);
    assert.equal(played.p6, 20);
    g.constraints.minMinutes = { p6: 24 };
    assert.equal(S.addOvertime(g, 4, 'next'), true);
    assert.deepEqual(overtimeFives(g), [['p2', 'p3', 'p4', 'p5', 'p6']]);
  });
});

test('the league minimum counts overtime: 24 minutes for all eight, 20 played, 8 minutes of overtime gets everyone to 24 or more', () => {
  lastStint({ minMinutes: 24, minUnit: 'min' }, g => {
    assert.equal(S.addOvertime(g, 8, 'next'), true);
    const total = S.minutesFrom(S.effectiveStints(g, S.plans[0]), ALL);
    assert.deepEqual(Object.values(total).filter(m => m < 24), [], JSON.stringify(total));
  });
});

test('the league minimum is worked out from the regular game: overtime does not raise it', () => {
  lastStint({ minMinutes: 75, minUnit: 'pct' }, g => {
    const before = S.leagueMinFor(g);
    assert.equal(before, 24, '75% of 32 minutes');
    assert.equal(S.addOvertime(g, 8, 'next'), true);
    assert.equal(S.leagueMinFor(g), 24);
  });
});
