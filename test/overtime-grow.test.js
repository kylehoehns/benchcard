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

test('platoon: sit-for-the-rest is still refused in an all-overtime suffix, the freeze is not', () => {
  const fifteen = Array.from({ length: 15 }, (_, i) => player(`p${i}`));
  const ids = fifteen.map(p => p.id);
  const units = [ids.slice(0, 5), ids.slice(5, 10), ids.slice(10)];
  const constraints = { ...S.emptyConstraints(), units };
  run({ strategy: 'platoon', constraints }, g => {
    g.overtime = [8];
    S.computeAll();
    const sitter = S.plans[0].stints[REG].onFloor[0];
    const sat = S.resolveRest(g, S.plans[0], REG, [sitter]);
    assert.deepEqual([sat.ok, sat.reason], [false, 'strategy'],
      'the units ignore who is available, so the sitter would stay on the floor');
    assert.equal(S.resolveRest(g, S.plans[0], REG).ok, true, 'the freeze (no one sitting) still plans overtime');
  }, fifteen);
});

test('by hand: a normal overtime raises no warning about the targets not adding up', () => {
  const ten = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
  const constraints = { ...S.emptyConstraints(),
    targetSlots: Object.fromEntries(ten.map(p => [p.id, 4])), targetCapacity: 40 };
  run({ strategy: 'minutes', constraints }, g => {
    const sums = () => S.plans[0].issues.map(i => i.code).filter(c => /^TARGETS_(UNDER|OVER)_BUDGET$/.test(c));
    assert.deepEqual(sums(), [], 'the premise: regulation adds up');
    S.addOvertime(g, 8);
    assert.deepEqual(sums(), []);
  }, ten);
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

/* #368: addOvertime, the state change behind the sheet's "Add overtime". */
test('addOvertime adds the period, remembers the length and says it held', () => {
  run({}, g => {
    assert.equal(S.addOvertime(g, 8), true);
    assert.deepEqual(g.overtime, [{ minutes: 8, who: 'next' }]);
    assert.equal(S.state.settings.overtimeMinutes, 8);
    assert.equal(S.plans[0].stints.length, REG + 2);
  });
});

test('addOvertime adds nothing past the fourth overtime', () => {
  run({ overtime: [2, 2, 2, 2] }, g => {
    assert.equal(S.addOvertime(g, 5), false);
    assert.deepEqual(g.overtime, [2, 2, 2, 2]);
    assert.notEqual(S.state.settings.overtimeMinutes, 5);
  });
});

test('addOvertime takes itself back when nobody can play it, rather than leave a plan that does not solve', () => {
  run({}, g => {
    g.constraints.maxMinutes = minutesThrough(g, REG);   // everyone is at their cap
    const before = S.state.settings.overtimeMinutes;
    assert.equal(S.addOvertime(g, 8), false);
    assert.deepEqual(g.overtime || [], []);
    assert.equal(S.state.settings.overtimeMinutes, before);
    assert.equal(S.plans[0].ok, true);
    assert.equal(S.plans[0].stints.length, REG);
  });
});

test('addOvertime keeps the stints played when four players are already at their cap, and says the caps were relaxed (#490)', () => {
  run({}, g => {
    // four players already at their cap: the overtime cannot be planned inside them.
    // This used to rewrite the past ('rewritten'); the caps give way instead.
    const played = minutesThrough(g, REG);
    g.constraints.maxMinutes = Object.fromEntries(['p0', 'p1', 'p2', 'p3'].map(id => [id, played[id]]));
    const was = fives(g).slice(0, REG);
    const r = S.addOvertime(g, 8);
    assert.equal(r, true);
    assert.deepEqual(fives(g).slice(0, REG), was, 'the stints played are the same fives');
    assert.deepEqual(S.rotationMoved(), [], 'no Rotation changed');
    assert.ok(S.plans[0].issues.some(i => i.code === 'CAP_RELAXED'), 'the plan says a cap was relaxed');
  });
});

/* #369: who plays an overtime. The choice rides on the overtime entry; Keep and
   Strongest also store the five they settled on when the overtime was added. */
const leveled = tiers => tiers.map((tier, i) => ({ ...player(`p${i}`), tier }));
const idsOf = roster => roster.map(p => p.id);
const sorted = five => [...five].sort();
// a hand swap on stint k so that `id` is on the floor in place of the first
// player there who is not `id`
const putOn = (g, k, id) => {
  const five = S.effectiveLineup(g, S.plans[0], k);
  if (five.includes(id)) return;
  g.live.overrides[k] = [id, ...five.slice(1)];
  g.live.hand = [...new Set([...(g.live.hand || []), k])];
  S.computeAll();
};

test('addOvertime stores the choice on the entry, and Next rotation and Even out store no five', () => {
  run({}, g => {
    S.addOvertime(g, 4, 'even');
    assert.deepEqual(g.overtime, [{ minutes: 4, who: 'even' }]);
  });
});

test('strongest five: the two Level 5s and three Level 4s play every overtime stint', () => {
  const roster = leveled([5, 5, 4, 4, 4, 3, 3, 2, 2, 1]);
  run({}, g => {
    S.addOvertime(g, 8, 'strongest');
    const f = fives(g);
    assert.equal(f.length, REG + 2);
    assert.deepEqual(sorted(f[REG]), ['p0', 'p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(sorted(f[REG + 1]), ['p0', 'p1', 'p2', 'p3', 'p4']);
  }, roster);
});

test('strongest five: of equal Levels, the player with fewer minutes so far gets the spot', () => {
  const roster = leveled([5, 5, 4, 4, 4, 4, 3, 3, 2, 2]);
  run({}, g => {
    putOn(g, 3, 'p5');
    const played = minutesThrough(g, REG);
    const fours = ['p2', 'p3', 'p4', 'p5'].sort((a, b) => played[a] - played[b]);
    assert.ok(played[fours[2]] < played[fours[3]], 'the premise: one Level 4 played more than the rest');
    S.addOvertime(g, 4, 'strongest');
    assert.deepEqual(sorted(fives(g)[REG]), sorted(['p0', 'p1', ...fours.slice(0, 3)]));
  }, roster);
});

test('strongest five never picks a player who is out', () => {
  const roster = leveled([5, 5, 4, 4, 4, 3, 3, 2, 2, 1]);
  run({ out: ['p0'] }, g => {
    S.addOvertime(g, 4, 'strongest');
    const five = fives(g)[REG];
    assert.ok(!five.includes('p0'));
    assert.deepEqual(sorted(five), ['p1', 'p2', 'p3', 'p4', 'p5']);
  }, roster);
});

test('keep this five: every overtime stint has the five on the floor in the last stint, a hand swap included', () => {
  run({}, g => {
    const bench = ALL.find(id => !fives(g)[REG - 1].includes(id));
    putOn(g, REG - 1, bench);
    const last = fives(g)[REG - 1];
    assert.ok(last.includes(bench));
    S.addOvertime(g, 8, 'keep');
    const f = fives(g);
    assert.deepEqual(sorted(f[REG]), sorted(last));
    assert.deepEqual(sorted(f[REG + 1]), sorted(last));
  });
});

test('even out: the player who played least is on the floor in a Closers game whose closing group leaves them out', () => {
  const closing = { stints: 2, players: ['p0', 'p1', 'p2', 'p3', 'p4'] };
  run({ strategy: 'closers', constraints: { ...S.emptyConstraints(), closing } }, g => {
    const played = minutesThrough(g, REG);
    const fewest = Math.min(...Object.values(played));
    const lightest = ALL.filter(id => played[id] === fewest);
    S.addOvertime(g, 4, 'even');
    const five = fives(g)[REG];
    assert.ok(lightest.every(id => five.includes(id)), `${lightest} played ${fewest} and should be on`);
    assert.notDeepEqual(sorted(five), closing.players, 'the closing group does not apply');
  });
  // the same overtime as Next rotation is the closing group
  run({ strategy: 'closers', constraints: { ...S.emptyConstraints(), closing } }, g => {
    S.addOvertime(g, 4, 'next');
    assert.deepEqual(sorted(fives(g)[REG]), closing.players);
  });
});

test('even out: a Platoon game plans it as Even, and sitting someone for the rest is allowed there', () => {
  const fifteen = Array.from({ length: 15 }, (_, i) => player(`p${i}`));
  const ids = fifteen.map(p => p.id);
  const units = [ids.slice(0, 5), ids.slice(5, 10), ids.slice(10)];
  run({ strategy: 'platoon', constraints: { ...S.emptyConstraints(), units } }, g => {
    S.addOvertime(g, 8, 'even');
    const sitter = S.plans[0].stints[REG].onFloor[0];
    const r = S.resolveRest(g, S.plans[0], REG, [sitter]);
    assert.equal(r.ok, true);
    assert.ok(!r.overrides[REG].includes(sitter));
    assert.equal(r.overrides[REG].length, 5);
  }, fifteen);
});

test('a pinned five holds through a swap re-plan, a cap and an Apart rule', () => {
  const roster = leveled([5, 5, 4, 4, 4, 3, 3, 2, 2, 1]);
  run({}, g => {
    S.addOvertime(g, 8, 'strongest');
    const five = ['p0', 'p1', 'p2', 'p3', 'p4'];
    g.constraints.maxMinutes = { p0: minutesThrough(g, REG).p0 };           // already at the cap
    g.constraints.avoids = [['p1', 'p2']];                                    // Apart
    const r = S.resolveRest(g, S.plans[0], REG);
    assert.equal(r.ok, true, 'a rule cannot refuse the five');
    assert.deepEqual(sorted(r.overrides[REG]), five);
    assert.deepEqual(sorted(r.overrides[REG + 1]), five);
    const swap = S.resolveRest(g, S.plans[0], REG + 1);
    assert.deepEqual(sorted(swap.overrides[REG + 1]), five);
  }, roster);
});

test('pinned fives are not moved when a later re-plan runs from the first overtime stint', () => {
  run({}, g => {
    S.addOvertime(g, 8, 'keep');
    const five = sorted(fives(g)[REG]);
    const printed = () => JSON.stringify(S.plans[0].stints.map(s => s.onFloor));
    const was = printed();
    g.seed = g.seed + 1;
    S.computeAll();
    assert.notEqual(printed(), was, 'the premise: the printed plan moved');
    const r = S.resolveRest(g, S.plans[0], REG);
    assert.equal(r.ok, true);
    assert.deepEqual(sorted(r.overrides[REG]), five);
    assert.deepEqual(sorted(r.overrides[REG + 1]), five);
    assert.deepEqual(sorted(fives(g)[REG]), five);
    assert.deepEqual(sorted(fives(g)[REG + 1]), five);
  });
});

/* The review pass on #369. */
const CLOSING = ['p0', 'p1', 'p2', 'p3', 'p4'];
const closersGame = () => ({ strategy: 'closers', constraints: { ...S.emptyConstraints(), closing: { stints: 2, players: CLOSING } } });

test('even out beside a pinned period is still planned as Even, not as the game\'s Closers', () => {
  run(closersGame(), g => {
    S.addOvertime(g, 4, 'even');
    g.live.at = REG;                       // on the one stint of OT
    S.addOvertime(g, 4, 'keep');
    const played = minutesThrough(g, REG);
    const fewest = Math.min(...Object.values(played));
    const lightest = ALL.filter(id => played[id] === fewest);
    const r = S.resolveRest(g, S.plans[0], REG);
    assert.equal(r.ok, true);
    assert.ok(lightest.every(id => r.overrides[REG].includes(id)), `${lightest} played ${fewest} and should be on`);
    assert.notDeepEqual(sorted(r.overrides[REG]), CLOSING, 'the closing group does not apply to Even out');
  });
});

test('a pinned period counts as minutes played: players capped to play only it are not put on again', () => {
  run({}, g => {
    S.addOvertime(g, 4, 'keep');           // OT: one pinned stint of 4 minutes
    g.overtime.push({ minutes: 8, who: 'next' });
    S.computeAll();
    const pinned = g.overtime[0].five;
    const played = minutesThrough(g, REG);
    // two on the pinned five may play that stint and nothing more
    const capped = pinned.slice(0, 2);
    g.constraints.maxMinutes = Object.fromEntries(capped.map(id => [id, played[id] + 4]));
    const r = S.resolveRest(g, S.plans[0], REG);
    assert.equal(r.ok, true);
    assert.deepEqual(sorted(r.overrides[REG]), sorted(pinned));
    for (const k of [REG + 1, REG + 2]) {
      assert.equal(r.overrides[k].length, 5);
      assert.deepEqual(r.overrides[k].filter(id => capped.includes(id)), [], `stint ${k} puts a capped player on again`);
    }
  });
});

test('a rotation change that falls back to #134 keeps the pinned overtime fives', () => {
  run({}, g => {
    S.addOvertime(g, 8, 'keep');
    const five = sorted(fives(g)[REG]);
    g.periodMinutes = 12;                  // the grid moved: the freeze cannot hold
    S.computeAll();
    assert.deepEqual(S.rotationMoved(), ['g0'], 'the premise: this is the #134 path');
    const ot = S.plans[0].stints.map((s, i) => (s.period > g.periods ? i : -1)).filter(i => i >= 0);
    assert.equal(ot.length, 2);
    for (const i of ot) assert.deepEqual(sorted(fives(g)[i]), five);
  });
});

test('a suffix that is all pinned is not refused by Platoon\'s no-sitting rule', () => {
  const fifteen = Array.from({ length: 15 }, (_, i) => player(`p${i}`));
  const ids = fifteen.map(p => p.id);
  const units = [ids.slice(0, 5), ids.slice(5, 10), ids.slice(10)];
  run({ strategy: 'platoon', constraints: { ...S.emptyConstraints(), units } }, g => {
    S.addOvertime(g, 8, 'keep');
    const sitter = S.plans[0].stints[REG].onFloor[0];
    const r = S.resolveRest(g, S.plans[0], REG, [sitter]);
    assert.equal(r.ok, true);
    assert.ok(!r.overrides[REG].includes(sitter));
    assert.equal(r.overrides[REG].length, 5);
  }, fifteen);
});

test('Reset on a record with no hand list leaves the pinned fives as not by hand', () => {
  run({}, g => {
    S.addOvertime(g, 8, 'keep');
    delete g.live.hand;                    // a record from before the list existed
    S.resetRest(g);
    assert.ok(![REG, REG + 1].some(k => handStints(g.live).includes(k)), 'the pinned stints are not hand swaps');
  });
});

test('Reset re-plans an Even-out overtime as Even, not as the printed plan\'s Closers', () => {
  run(closersGame(), g => {
    S.addOvertime(g, 4, 'even');
    S.resetRest(g);
    const played = minutesThrough(g, REG);
    const fewest = Math.min(...Object.values(played));
    const lightest = ALL.filter(id => played[id] === fewest);
    const five = fives(g)[REG];
    assert.ok(lightest.every(id => five.includes(id)), `${lightest} played ${fewest} and should be on`);
    assert.notDeepEqual(sorted(five), CLOSING);
  });
});

test('Reset gives a pinned period no four-player five when too few are available', () => {
  run({}, g => {
    S.addOvertime(g, 8, 'keep');
    g.out = ALL.slice(0, 4);               // four left; the plan on hand is the stale one
    S.resetRest(g);
    for (const k of [REG, REG + 1]) assert.ok(!g.live.overrides[k] || g.live.overrides[k].length === 5);
  });
});

test('addOvertime does not store a pinning choice without its five', () => {
  run({}, g => {
    // regulation cannot be planned on its own (everyone must play 21 of 32), overtime makes room
    g.constraints.minMinutes = Object.fromEntries(ALL.map(id => [id, 21]));
    S.computeAll();
    assert.equal(S.plans[0].ok, false, 'the premise: the plan as it stands does not solve');
    const r = S.addOvertime(g, 8, 'keep');
    assert.ok(r === false || g.overtime[0].five?.length === 5, `stored ${JSON.stringify(g.overtime)} and said ${r}`);
  });
});

test('the stored five does not move when a Level is edited afterwards', () => {
  const roster = leveled([5, 5, 4, 4, 4, 3, 3, 2, 2, 1]);
  run({}, g => {
    S.addOvertime(g, 8, 'strongest');
    roster[9].tier = 5;
    S.computeAll();
    assert.deepEqual(sorted(fives(g)[REG]), ['p0', 'p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(sorted(g.overtime[0].five), ['p0', 'p1', 'p2', 'p3', 'p4']);
  }, roster);
});

test('a pinned player who goes Out is replaced by the highest Level then the fewest minutes (Strongest)', () => {
  const roster = leveled([5, 5, 4, 4, 4, 4, 3, 3, 2, 2]);
  run({}, g => {
    putOn(g, 3, 'p5');
    S.addOvertime(g, 8, 'strongest');
    const five = fives(g)[REG];
    assert.ok(five.includes('p2') && five.includes('p3') && five.includes('p4') && !five.includes('p5'));
    S.setAvailable(g, 'p0', false);
    S.computeAll();
    const now = fives(g);
    // p5 is the remaining Level 4, ahead of the Level 3s
    assert.deepEqual(sorted(now[REG]), ['p1', 'p2', 'p3', 'p4', 'p5']);
    assert.deepEqual(sorted(now[REG + 1]), ['p1', 'p2', 'p3', 'p4', 'p5']);
  }, roster);
});

test('a pinned player who goes Out is replaced by whoever played least (Keep)', () => {
  run({}, g => {
    putOn(g, REG - 1, ALL.find(id => !fives(g)[REG - 1].includes(id)));   // a five the plan would not pick
    S.addOvertime(g, 8, 'keep');
    const five = fives(g)[REG];
    const gone = five[0];
    S.setAvailable(g, gone, false);
    S.computeAll();
    const now = fives(g)[REG];
    assert.ok(!now.includes(gone));
    assert.deepEqual(sorted(five.slice(1).filter(id => now.includes(id))), sorted(five.slice(1)), 'the other four stay');
    // the stint on the floor named the player who left, so it is re-planned too:
    // the seat goes to whoever has played least once that is counted
    const played = minutesThrough(g, REG);
    const newcomer = now.find(id => !five.includes(id));
    const candidates = ALL.filter(id => id !== gone && !five.slice(1).includes(id));
    assert.equal(played[newcomer], Math.min(...candidates.map(id => played[id])));
  });
});

test('second overtime: each period keeps its own choice', () => {
  const roster = leveled([5, 5, 4, 4, 4, 3, 3, 2, 2, 1]);
  run({}, g => {
    const regLast = sorted(fives(g)[REG - 1]);
    S.addOvertime(g, 4, 'keep');
    g.live.at = REG;                      // on the one stint of the first overtime
    S.addOvertime(g, 4, 'strongest');
    const f = fives(g);
    assert.equal(f.length, REG + 2);
    assert.deepEqual(sorted(f[REG]), regLast);
    assert.deepEqual(sorted(f[REG + 1]), ['p0', 'p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(g.overtime.map(o => o.who), ['keep', 'strongest']);
  }, roster);
});

test('Reset leaves pinned overtime stints on their stored five, a hand swap in one included', () => {
  run({}, g => {
    S.addOvertime(g, 8, 'keep');
    const five = sorted(fives(g)[REG]);
    const bench = ALL.find(id => !five.includes(id));
    g.live.overrides[REG] = [bench, ...fives(g)[REG].slice(1)];
    g.live.hand = [...(g.live.hand || []), REG];
    S.computeAll();
    S.resetRest(g);
    assert.deepEqual(sorted(fives(g)[REG]), five);
    assert.deepEqual(sorted(fives(g)[REG + 1]), five);
    assert.deepEqual(handStints(g.live), [2], 'the pins are not swaps the coach made');
  });
});
