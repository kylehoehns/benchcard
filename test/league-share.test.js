import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withTeam, bareGame, player } from './state-fixture.js';

/* #447: the league minimum as a share of the game, scaled for a late arrival.
   Runs at the `computeAll` / `setAvailable` seam on a fixture team (spec 447,
   Proof table). Expected numbers are the spec's "What would settle it". */

const ids = n => Array.from({ length: n }, (_, i) => `p${i}`);

/* Runs `fn(g)` on a fresh team of `n` players and one game of `periods` x
   `periodMinutes` subbed every `every` minutes, with `settings` for the team. */
function game({ n = 10, periods = 4, periodMinutes = 8, every = 4, settings, out = [], constraints }, fn) {
  const g = bareGame({ id: 'g447', seed: 1234, periods, periodMinutes, granValue: every, out, late: [],
    live: { at: 0, overrides: {} }, constraints: { ...S.emptyConstraints(), ...constraints } });
  return withTeam(ids(n).map(id => player(id)), [g], settings, () => { S.computeAll(); return fn(g); });
}
const minutes = g => S.effectiveMinutes(g, S.plans[0]);
const codes = () => S.plans[0].issues.map(i => i.code);

/* Walk in `id` at stint `at` of a game underway. */
function arriveAt(g, at, ...who) {
  g.live.at = at;
  S.computeAll();
  for (const id of who) S.setAvailable(g, id, true);
  S.computeAll();
}

test('A: a late arrival is owed the same share of the time left, not every stint left (16 min league minimum)', () => {
  game({ out: ['p9'], settings: { minMinutes: 16 } }, g => {
    arriveAt(g, 4, 'p9');
    const m = minutes(g);
    assert.equal(m.p9, 8);
    for (const id of ids(9)) assert.ok(m[id] >= 16, `${id} ends at ${m[id]}`);
  });
});

test('B: 12 min league minimum, a late arrival is owed 6 rounded up to a whole stint, 8', () => {
  game({ out: ['p9'], settings: { minMinutes: 12 } }, g => {
    arriveAt(g, 4, 'p9');
    const m = minutes(g);
    assert.equal(m.p9, 8);
    for (const id of ids(9)) assert.ok(m[id] >= 12, `${id} ends at ${m[id]}`);
  });
});

test('C: 50 % of a 4x8 game composes to 16 for everyone, with no stint-boundary warning', () => {
  game({ settings: { minMinutes: 50, minUnit: 'pct' } }, g => {
    assert.ok(S.plans[0].ok, codes().join());
    assert.equal(S.leagueMinFor(g), 16);
    assert.ok(!codes().includes('MIN_OFF_STINT_BOUNDARY'));
    for (const id of ids(10)) assert.ok(minutes(g)[id] >= 16, `${id} ends at ${minutes(g)[id]}`);
  });
});

test('D: 50 % of a 2x12 game, every 4, is 12 and plans with 8 players and with 9', () => {
  for (const n of [8, 9]) {
    game({ n, periods: 2, periodMinutes: 12, settings: { minMinutes: 50, minUnit: 'pct' } }, g => {
      assert.equal(S.leagueMinFor(g), 12);
      assert.ok(S.plans[0].ok, `${n} players: ${codes().join()}`);
      assert.ok(!codes().includes('MINS_UNSATISFIABLE'), `${n} players`);
    });
  }
});

test('E: 50 % of a 4x6 game, every 3, is 12 and plans 9 players with no stint-boundary warning', () => {
  game({ n: 9, periods: 4, periodMinutes: 6, every: 3, settings: { minMinutes: 50, minUnit: 'pct' } }, g => {
    assert.equal(S.leagueMinFor(g), 12);
    assert.ok(S.plans[0].ok, codes().join());
    assert.ok(!codes().includes('MIN_OFF_STINT_BOUNDARY'));
    assert.ok(!codes().includes('MINS_UNSATISFIABLE'));
  });
});

test('F: 2 periods is 16 minutes in a 4x8 game and 24 in a 2x12 game', () => {
  const settings = { minMinutes: 2, minUnit: 'periods' };
  game({ settings }, g => assert.equal(S.leagueMinFor(g), 16));
  game({ periods: 2, periodMinutes: 12, settings }, g => assert.equal(S.leagueMinFor(g), 24));
});

test('G: a 16 minute minimum with nobody late plans exactly the fives it planned before there was a unit', () => {
  // captured from the tree before #447 (7f63ad0), same fixture and seed
  const BEFORE = 'p2,p3,p4,p8,p9|p1,p3,p4,p5,p7|p0,p5,p6,p7,p9|p0,p1,p2,p6,p8|p0,p1,p3,p4,p7|p0,p2,p5,p7,p9|p1,p2,p6,p8,p9|p3,p4,p5,p6,p8';
  const fives = settings => game({ settings }, () => S.plans[0].stints.map(s => s.onFloor.join(',')).join('|'));
  assert.equal(fives({ minMinutes: 16 }), BEFORE);
  assert.equal(fives({ minMinutes: 16, minUnit: 'min' }), BEFORE);
});

test('I: a kid who walks in during the last stint gets one note that no minimum can be met; their own minimum is named when it bound', () => {
  game({ out: ['p9'], settings: { minMinutes: 16 } }, g => {
    arriveAt(g, 7, 'p9');
    const notes = S.plans[0].issues.filter(i => i.code === 'MIN_CLAMPED');
    assert.equal(notes.length, 1, codes().join());
    assert.deepEqual(notes[0].playerIds, ['p9']);
    assert.equal(notes[0].severity, 'warn');
    assert.match(notes[0].message, /can finish with at most 0 min, under the league minimum of 4: that is all the time left\.$/);
  });
  // a 12 minute league minimum here: 9 x 16 + 28 would not fit the whole game, so the full solve would refuse it first
  game({ out: ['p9'], settings: { minMinutes: 12 }, constraints: { minMinutes: { p9: 28 } } }, g => {
    arriveAt(g, 2, 'p9');
    const notes = S.plans[0].issues.filter(i => i.code === 'MIN_CLAMPED');
    assert.equal(notes.length, 1, codes().join());
    assert.match(notes[0].message, /p9 can finish with at most 20 min, under their 28-minute minimum: that is all the time left\.$/);
  });
});

test('J: two kids walking in do not refuse the game for a minimum they are no longer owed', () => {
  game({ n: 11, out: ['p9', 'p10'], settings: { minMinutes: 16 } }, g => {
    arriveAt(g, 4, 'p9', 'p10');
    assert.equal(S.plans[0].ok, true, codes().join());
  });
});
