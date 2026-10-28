import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handStints } from '../app/live.js';
import { S, bareGame, withTeam, player } from './state-fixture.js';

/* #367: an underway game's grid can grow at the end (overtime), and the
   stints already played freeze while only the new ones are planned. Driven
   through `computeAll` on a game underway, the way the app asks. The game:
   8 players, 2 x 16, everyN 4 (8 regulation stints), on stint 8 (index 7),
   with a hand swap in stint 3 (index 2). */

const players = Array.from({ length: 8 }, (_, i) => player(`p${i}`));
const ALL = players.map(p => p.id);
const REG = 8;

function game(extra = {}) {
  return bareGame({
    id: 'g0', periods: 2, periodMinutes: 16, granMode: 'everyN', granValue: 4,
    seed: 7, live: { at: 0, overrides: {} }, ...extra,
  });
}

/* Compute the printed plan, then put the game on stint 8 with a hand swap in
   stint 3: the first bench player takes the first starter's place. */
function underway(g, ids = ALL) {
  S.computeAll();
  const five = S.effectiveLineup(g, S.plans[0], 2);
  const bench = ids.find(id => !five.includes(id));
  g.live.overrides = { 2: [bench, ...five.slice(1)] };
  g.live.hand = [2];
  g.live.at = REG - 1;
  S.computeAll();
  S.rotationMoved(); S.overridesDropped();
  return g;
}

const fives = g => S.effectiveStints(g, S.plans[0]).map(s => s.onFloor);
const minutesThrough = (g, n) =>
  S.minutesFrom(S.effectiveStints(g, S.plans[0]).slice(0, n), ALL);
const run = (extra, fn, roster = players) =>
  withTeam(roster, [game(extra)], {}, () => fn(underway(S.state.day.games[0], roster.map(p => p.id))));

test('growing an underway game by overtime moves no minute played and no swap', () => {
  run({}, g => {
    const before = fives(g).slice(0, REG);
    const minBefore = minutesThrough(g, REG);
    g.overtime = [2];
    S.computeAll();
    assert.equal(S.plans[0].stints.length, REG + 1);
    assert.deepEqual(fives(g).slice(0, REG), before);
    assert.deepEqual(minutesThrough(g, REG), minBefore);
    assert.deepEqual(handStints(g.live), [2], 'the stint-3 swap is still a hand swap');
    assert.equal(g.live.at, REG - 1, 'the game is still on stint 8');
    assert.deepEqual(S.rotationMoved(), []);
    assert.equal(S.overridesDropped(), 0);
  });
});

test('the new overtime stints are planned around minutes played', () => {
  run({}, g => {
    g.overtime = [8];
    S.computeAll();
    const f = fives(g);
    assert.equal(f.length, REG + 2);
    assert.equal(f[REG].length, 5);
    assert.equal(f[REG + 1].length, 5);
    const played = minutesThrough(g, REG);
    const fewest = Math.min(...Object.values(played));
    const lightest = ALL.filter(id => played[id] === fewest);
    assert.ok(lightest.every(id => f[REG].includes(id)),
      `${lightest} played least (${fewest}) and should open overtime`);
  });
});

test('closers: the overtime five is the closing group, regulation unchanged', () => {
  const closing = { stints: 2, players: ['p0', 'p1', 'p2', 'p3', 'p4'] };
  const constraints = { ...S.emptyConstraints(), closing };
  run({ strategy: 'closers', constraints }, g => {
    const before = fives(g).slice(0, REG);
    g.overtime = [2];
    S.computeAll();
    const f = fives(g);
    assert.deepEqual([...f[REG]].sort(), closing.players);
    assert.deepEqual(f.slice(0, REG), before);
  });
});

test('a format change that is not a prefix keeps the #134 path', () => {
  for (const change of [{ periodMinutes: 12 }, { periods: 4 }]) {
    run({}, g => {
      Object.assign(g, change);
      S.computeAll();
      assert.deepEqual(S.rotationMoved(), [g.id], JSON.stringify(change));
    });
  }
});

test('removing unplayed overtime leaves the played stints and the swap alone', () => {
  run({}, g => {
    const before = fives(g).slice(0, REG);
    const minBefore = minutesThrough(g, REG);
    g.overtime = [2];
    S.computeAll();
    g.overtime = [];
    S.computeAll();
    assert.equal(S.plans[0].stints.length, REG);
    assert.deepEqual(fives(g), before);
    assert.deepEqual(minutesThrough(g, REG), minBefore);
    assert.deepEqual(handStints(g.live), [2]);
    assert.equal(g.live.overrides[REG], undefined, 'no five left for a stint that is gone');
    assert.deepEqual(S.rotationMoved(), []);
  });
});

/* #368 handles By hand and Platoon overtime. Until it does, growth for these
   two falls back to #134 because `resolveRest` refuses them. When #368 lands,
   this test is the one to turn over. */
test('by hand and platoon still fall back to #134 on growth', () => {
  const ten = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
  const rules = {
    minutes: { targetSlots: Object.fromEntries(ten.map(p => [p.id, 4])), targetCapacity: 40 },
    platoon: { units: [ten.slice(0, 5).map(p => p.id), ten.slice(5).map(p => p.id)] },
  };
  for (const strategy of ['minutes', 'platoon']) {
    const constraints = { ...S.emptyConstraints(), ...rules[strategy] };
    run({ strategy, constraints }, g => {
      g.overtime = [2];
      S.computeAll();
      assert.deepEqual(S.rotationMoved(), [g.id], strategy);
    }, ten);
  }
});

test('an empty overtime list plans exactly as a game without the field', () => {
  const planOf = extra => withTeam(players, [game({ live: { at: 1, overrides: {} }, ...extra })], {}, () => {
    S.computeAll();
    return { stints: S.plans[0].stints, stamp: S.state.day.games[0].live.stamp };
  });
  const without = planOf({});
  assert.ok(without.stamp, 'the baseline has a stamp to compare');
  assert.deepEqual(planOf({ overtime: [] }), without);
});

test('a regulation-period change that keeps matching labels is a format change', () => {
  // 3 -> 5 and 5 -> 3 periods: P1..P3 is a prefix of P1..P5, but the extra
  // stints are regulation periods, not overtime, so #134 keeps the report
  const three = { periods: 3, periodMinutes: 8 };
  for (const [from, to] of [[3, 5], [5, 3]]) {
    run({ ...three, periods: from }, g => {
      g.live.at = 1;   // early, so the stints one grid lacks are unplayed
      S.computeAll();
      S.rotationMoved(); S.overridesDropped();
      g.periods = to;
      S.computeAll();
      assert.deepEqual(S.rotationMoved(), [g.id], `${from} -> ${to} periods`);
    });
  }
});
