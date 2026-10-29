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

/* #368: By hand and Platoon grow by overtime too. `resolveRest` refuses both
   for a suffix that has regulation in it, and lifts that for one that is all
   overtime. */
test('by hand: overtime is planned around minutes played and the coach\'s targets stay as saved', () => {
  const ten = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
  const constraints = { ...S.emptyConstraints(),
    targetSlots: Object.fromEntries(ten.map(p => [p.id, 4])), targetCapacity: 40 };
  run({ strategy: 'minutes', constraints }, g => {
    const before = fives(g).slice(0, REG);
    const slots = { ...g.constraints.targetSlots };
    g.overtime = [8];
    S.computeAll();
    const f = fives(g);
    assert.deepEqual(S.rotationMoved(), [], 'no #134 rewrite');
    assert.deepEqual(f.slice(0, REG), before, 'regulation is as it was played');
    assert.equal(f.length, REG + 2);
    assert.ok(f[REG].length === 5 && f[REG + 1].length === 5);
    assert.deepEqual(g.constraints.targetSlots, slots, 'the saved targets are not rescaled');
    assert.equal(g.constraints.targetCapacity, 40, 'and are still measured against regulation');
    const played = minutesThrough(g, REG);
    const fewest = Math.min(...Object.values(played));
    assert.ok(ten.map(p => p.id).filter(id => played[id] === fewest).every(id => f[REG].includes(id)),
      'those who played least open overtime');
  }, ten);
});

test('platoon: overtime continues the units by stint number, as if the game had more stints', () => {
  const fifteen = Array.from({ length: 15 }, (_, i) => player(`p${i}`));
  const ids = fifteen.map(p => p.id);
  const units = [ids.slice(0, 5), ids.slice(5, 10), ids.slice(10)];
  const constraints = { ...S.emptyConstraints(), units };
  run({ strategy: 'platoon', constraints }, g => {
    const before = fives(g).slice(0, REG);
    g.overtime = [8];
    S.computeAll();
    const f = fives(g);
    assert.deepEqual(S.rotationMoved(), [], 'no #134 rewrite');
    assert.deepEqual(f.slice(0, REG), before);
    // stint 9 of the game is index 8 = 2 (mod 3), stint 10 is index 9 = 0
    assert.deepEqual([...f[REG]].sort(), units[2]);
    assert.deepEqual([...f[REG + 1]].sort(), units[0]);
  }, fifteen);
});

test('plays at most: a player at the cap after regulation is off the floor in overtime', () => {
  run({}, g => {
    const played = minutesThrough(g, REG);
    g.constraints.maxMinutes = { p0: played.p0 };
    g.overtime = [8];
    S.computeAll();
    const f = fives(g);
    assert.equal(f.length, REG + 2);
    for (const five of f.slice(REG)) assert.ok(!five.includes('p0'), 'p0 is at the cap');
    assert.deepEqual(S.rotationMoved(), []);
  });
});

/* #368 item 5: how many stints an overtime of each length makes, and that
   every strategy plans five on the floor in each of them without moving a
   stint played. */
const OT_STINTS = (mode, value, len) => {
  const g = bareGame({ id: 'g0', periods: 2, periodMinutes: 16, granMode: mode, granValue: value, overtime: [len] });
  return withTeam(players, [g], {}, () => { S.computeAll(); return S.plans[0].stints.filter(s => s.periodName === 'OT'); });
};

test('an overtime is cut by the sub interval: 8 minutes at every 4 is two stints, 2 is one, breaks only is one', () => {
  assert.equal(OT_STINTS('everyN', 4, 8).length, 2);
  assert.equal(OT_STINTS('everyN', 4, 2).length, 1);
  assert.equal(OT_STINTS('breaksOnly', 4, 8).length, 1);
});

test('every strategy plans five on the floor through overtime of 1 to 10 minutes in every sub interval', () => {
  const ten = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
  const ids = ten.map(p => p.id);
  const strategies = {
    balanced: {},
    closers: { constraints: { ...S.emptyConstraints(), closing: { stints: 2, players: ids.slice(0, 5) } } },
    minutes: { constraints: { ...S.emptyConstraints(), targetSlots: Object.fromEntries(ids.map(id => [id, 4])), targetCapacity: 40 } },
    platoon: { constraints: { ...S.emptyConstraints(), units: [ids.slice(0, 5), ids.slice(5)] } },
  };
  for (const [strategy, extra] of Object.entries(strategies)) {
    for (const granMode of ['everyN', 'perPeriod', 'breaksOnly']) {
      for (let len = 1; len <= 10; len++) {
        const label = `${strategy} ${granMode} ${len} min`;
        withTeam(ten, [game({ strategy, granMode, ...extra })], {}, () => {
          const g = S.state.day.games[0];
          S.computeAll();
          const reg = S.plans[0].stints.length;
          g.live.at = reg - 1;
          S.computeAll();
          S.rotationMoved();
          const before = fives(g).slice(0, reg);
          g.overtime = [len];
          S.computeAll();
          const f = fives(g);
          assert.ok(f.length > reg, label);
          for (const five of f.slice(reg)) assert.equal(five.length, 5, label);
          assert.deepEqual(f.slice(0, reg), before, label);
          assert.deepEqual(S.rotationMoved(), [], label);
        });
      }
    }
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
