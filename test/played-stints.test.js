import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #247: a game underway never rewrites stints already played. Runs at the
   `computeAll` seam on a fixture day (spec 247, Proof table). The setup is
   the survey's: 9 players p0-p8, 4 x 8 min, sub every 4 (8 stints), even
   minutes, seed 1234, p5 out at the start. Expected numbers come from the
   spec's "What would settle it", not from re-running the solver. */
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
globalThis.document = {
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }), font: '' }) }),
  querySelector: () => null,
  querySelectorAll: () => [],
};

const S = await import('../app/state.js');
const L = await import('../app/live.js');

const LILY = 'p5';
const emptyConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [],
  openingFive: [], lastPeriodFive: [],
});

function setup(opts = {}) {
  S.state.players.length = 0;
  for (let i = 0; i < 9; i++) S.state.players.push({ id: `p${i}`, name: `Player ${i}`, tier: 3 });
  const g = {
    id: 'g247', label: '', tipoff: '', out: [LILY], seed: 1234,
    periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
    strategy: opts.strategy ?? 'balanced', balance: 'even',
    constraints: { ...emptyConstraints(), units: opts.units || [] },
    live: { at: 0, overrides: {} },
    useCarryover: false, useSeasonTargets: false,
  };
  S.state.day.games = [g];
  S.state.activeGame = 0;
  S.computeAll();
  return g;
}

/* Tip off and press next `n` times, the way bench mode does: the stamp is
   adopted on the first solve after the game is underway. */
function startAt(g, n) {
  g.live.at = n;
  S.computeAll();
}
const fives = (g, n) => S.effectiveStints(g, S.plans[0]).slice(0, n).map(s => s.onFloor.join(','));
const minutes = g => S.effectiveMinutes(g, S.plans[0]);

test('A: a late arrival leaves the played stints and minutes alone, and re-plans the rest with her in', () => {
  const g = setup();
  startAt(g, 2);
  const pastBefore = fives(g, 3);
  const playedBefore = S.minutesFrom(S.effectiveStints(g, S.plans[0]).slice(0, 3), S.availIds(g));
  S.rotationMoved();

  S.setAvailable(g, LILY, true);
  S.computeAll();

  assert.deepEqual(fives(g, 3), pastBefore, 'stints 0-2, the one on the floor included, are the same fives as before');
  const eff = S.effectiveStints(g, S.plans[0]);
  const playedAfter = S.minutesFrom(eff.slice(0, 3), S.availIds(g));
  for (const id of S.availIds(g)) assert.equal(playedAfter[id] || 0, playedBefore[id] || 0, `${id} played minutes`);
  assert.equal(playedAfter[LILY] || 0, 0, 'Lily has played nothing');
  /* Amendments 7 and 13: the stint on the floor stays, so the re-plan is
     stints 3-7 and her even share is 20 x 5 / 9 = 11.1 minutes, about three
     stints. She plays in at least one of them, and only those. */
  assert.ok(eff.slice(3).some(r => r.onFloor.includes(LILY)), 'Lily plays in the re-planned stints');
  const m = minutes(g);
  assert.ok(Math.abs(m[LILY] - 100 / 9) <= 4, `Lily ends at ${m[LILY]}, within a stint of 11.1`);
  const others = Object.keys(m).filter(id => id !== LILY).map(id => m[id]);
  assert.ok(Math.max(...others) - Math.min(...others) <= 4, `on-time kids within a stint: ${others}`);
  assert.deepEqual(S.rotationMoved(), [], 'no "Rotation changed" toast: nothing played moved');
});

test('B: a late arrival after a This stint swap keeps the swapped five and clears no swaps', () => {
  const g = setup();
  const p0 = S.plans[0];
  const inId = S.availIds(g).find(id => !p0.stints[0].onFloor.includes(id));
  const outId = p0.stints[0].onFloor[0];
  const swapped = p0.stints[0].onFloor.map(x => (x === outId ? inId : x));
  g.live.overrides[0] = swapped;
  startAt(g, 2);
  S.overridesDropped();
  S.rotationMoved();

  S.setAvailable(g, LILY, true);
  S.computeAll();

  assert.equal(S.effectiveLineup(g, S.plans[0], 0).join(','), swapped.join(','), 'the swapped five in stint 0 survives');
  assert.equal(S.overridesDropped(), 0, 'no "swaps you made by hand were cleared" toast');
  assert.deepEqual(S.rotationMoved(), [], 'no rotation-changed toast');
});

test('C: a rule added at stint 3 leaves stints 0-3 alone and caps the rest', () => {
  const g = setup();
  startAt(g, 3);
  const past = fives(g, 4);
  const played = S.minutesFrom(S.effectiveStints(g, S.plans[0]).slice(0, 4), S.availIds(g));
  g.constraints.maxMinutes.p0 = 12;
  S.computeAll();

  assert.deepEqual(fives(g, 4), past, 'stints 0-3, the one on the floor included, are unchanged');
  const ends = minutes(g).p0;
  assert.ok(ends <= Math.max(12, played.p0), `p0 ends at ${ends}, at most 12 or what was played (${played.p0})`);
});

test('D: a sub-interval change mid-game keeps #134: the rotation is rewritten and reported', () => {
  const g = setup();
  startAt(g, 2);
  S.rotationMoved();
  const oldCount = S.plans[0].stints.length;
  g.granValue = 8;
  S.computeAll();

  assert.notEqual(S.plans[0].stints.length, oldCount, 'the grid changed');
  assert.deepEqual(S.rotationMoved(), [g.id], 'the "Rotation changed" offer is raised');
  assert.deepEqual(g.live.overrides, {}, 'nothing is frozen on a new grid');
});

for (const strategy of ['minutes', 'platoon']) {
  test(`E: with ${strategy}, a mid-game change keeps #134`, () => {
    const g = setup({ strategy, units: [['p0', 'p1', 'p2', 'p3', 'p4'], ['p6', 'p7', 'p8', 'p1', 'p2']] });
    assert.equal(S.plans[0].ok, true, 'the fixture plans');
    startAt(g, 2);
    S.rotationMoved();
    if (strategy === 'platoon') g.constraints.units[1] = ['p6', 'p7', 'p8', 'p3', 'p4'];
    else S.setAvailable(g, 'p8', false);
    S.computeAll();
    assert.deepEqual(S.rotationMoved(), [g.id], 'resolveRest refuses, so the rotation is rewritten and reported');
  });
}

test('I: before tip-off every change re-plans the whole game', () => {
  const g = setup();
  const before = fives(g, 8).join('|');
  S.setAvailable(g, LILY, true);
  S.computeAll();
  assert.notEqual(fives(g, 8).join('|'), before, 'the plan was rewritten');
  assert.ok(S.plans[0].stints[0].onFloor.length === 5);
  assert.ok(S.plans[0].stints.some(s => s.onFloor.includes(LILY)), 'Lily is in the plan');
  assert.deepEqual(g.live.overrides, {}, 'nothing frozen');
  assert.ok(Math.abs(minutes(g)[LILY] - 160 / 9) <= 4, 'an even share of the whole game');
  assert.deepEqual(S.rotationMoved(), [], 'not underway: nothing to report');
});

test('G: a kid marked out after playing keeps her played stints, on screen and in the season', () => {
  const g = setup();
  startAt(g, 3);
  const ava = S.plans[0].stints[0].onFloor[0];
  const past = fives(g, 3);
  const playedAva = S.minutesFrom(S.effectiveStints(g, S.plans[0]).slice(0, 3), [ava])[ava];
  assert.ok(playedAva >= 4, 'the fixture has her playing');

  S.setAvailable(g, ava, false);
  S.computeAll();

  assert.deepEqual(fives(g, 3), past, 'stints 0-2 are unchanged and still show her');
  assert.ok(S.effectiveStints(g, S.plans[0])[0].onFloor.includes(ava));
  assert.equal(minutes(g)[ava], playedAva, 'her played minutes are what the plan table and card read');
  for (let k = 3; k < 8; k++) assert.ok(!S.effectiveStints(g, S.plans[0])[k].onFloor.includes(ava), `not in stint ${k}`);

  S.state.day.name = 'Sat';
  S.archiveDay();
  const filed = S.team().season.games.find(x => x.id === g.id);
  assert.equal(filed.minutes[ava], playedAva, 'the season record files her played minutes');
});

/* ---- fix pass for #247: amendments 7-12 ---- */

const swappedFive = (g, k) => {
  const p0 = S.plans[0];
  const inId = S.availIds(g).find(id => !p0.stints[k].onFloor.includes(id));
  return p0.stints[k].onFloor.map((x, i) => (i === 0 ? inId : x));
};

test('7: the stint on the floor keeps its five when the rest is re-planned', () => {
  const g = setup();
  startAt(g, 2);
  const before = fives(g, 3);
  S.setAvailable(g, LILY, true);
  S.computeAll();
  assert.deepEqual(fives(g, 3), before, 'stints 0-2 are as the coach saw them');
  assert.ok(!S.effectiveLineup(g, S.plans[0], 2).includes(LILY), 'she is not put on the floor mid-stint');
});

test('7: a five on the floor that names a kid now out is the one stint that changes', () => {
  const g = setup();
  startAt(g, 2);
  const before = fives(g, 3);
  const gone = S.plans[0].stints[2].onFloor[0];
  S.setAvailable(g, gone, false);
  S.computeAll();
  assert.deepEqual(fives(g, 2), before.slice(0, 2), 'stints 0-1 are unchanged');
  assert.ok(!S.effectiveLineup(g, S.plans[0], 2).includes(gone), 'the absent kid is off the floor');
  assert.equal(S.effectiveLineup(g, S.plans[0], 2).length, 5);
});

test('8: Shuffle twice in a row leaves the stints played as the coach saw them', () => {
  const g = setup();
  startAt(g, 3);
  const seen = fives(g, 4);
  S.reseed(g); S.computeAll();
  assert.deepEqual(fives(g, 4), seen, 'after the first Shuffle');
  S.reseed(g); S.computeAll();
  assert.deepEqual(fives(g, 4), seen, 'after the second Shuffle');
  assert.deepEqual(S.rotationMoved(), [], 'nothing played moved, so no #134 offer');
});

test('8: Shuffle after a hand swap in a played stint keeps the swap, then and after a second Shuffle', () => {
  const g = setup();
  g.live.overrides[1] = swappedFive(g, 1);
  startAt(g, 3);
  const seen = fives(g, 4);
  assert.equal(seen[1], g.live.overrides[1].join(','), 'the fixture shows the swap');
  S.reseed(g); S.computeAll();
  assert.deepEqual(fives(g, 4), seen, 'after the first Shuffle');
  S.reseed(g); S.computeAll();
  assert.deepEqual(fives(g, 4), seen, 'after the second Shuffle');
});

test('9: removing a rostered kid who played mid-game falls back to #134 and leaves no ghost in a five', () => {
  const g = setup();
  startAt(g, 3);
  S.rotationMoved();
  const ghost = S.plans[0].stints[0].onFloor[0];
  S.removePlayer(ghost);
  S.computeAll();
  assert.deepEqual(S.rotationMoved(), [g.id], 'the rotation is rewritten and reported');
  for (const [k, s] of S.effectiveStints(g, S.plans[0]).entries()) {
    assert.ok(!s.onFloor.includes(ghost), `stint ${k} does not name the removed kid`);
  }
});

test('10: a re-plan that overwrites a hand swap still to come says the swap was cleared', () => {
  const g = setup();
  startAt(g, 2);
  g.live.overrides[5] = swappedFive(g, 5);
  g.live.hand = [5];
  S.overridesDropped();
  S.setAvailable(g, LILY, true);
  S.computeAll();
  assert.equal(S.overridesDropped(), 1, 'the coach is told');
  assert.deepEqual(L.handStints(g.live), [], 'and it is gone');
});

test('10: a re-plan with no hand swaps says nothing was cleared, and neither does a later Format change', () => {
  const g = setup();
  startAt(g, 2);
  S.overridesDropped();
  S.setAvailable(g, LILY, true);
  S.computeAll();
  assert.equal(S.overridesDropped(), 0, 'the freeze is not a hand swap');
  g.granValue = 8;
  S.computeAll();
  assert.deepEqual(S.rotationMoved(), [g.id], 'the format change is still reported');
  assert.equal(S.overridesDropped(), 0, 'but no swaps by hand were cleared');
});

test('10: a hand swap in a played stint survives a re-plan and is still a hand swap', () => {
  const g = setup();
  g.live.overrides[0] = swappedFive(g, 0);
  g.live.hand = [0];
  startAt(g, 2);
  S.overridesDropped();
  S.setAvailable(g, LILY, true);
  S.computeAll();
  assert.deepEqual(L.handStints(g.live), [0]);
  assert.equal(S.overridesDropped(), 0);
});

test('11: a kid who played, went out and came back is not treated as a late arrival', () => {
  const g = setup();
  startAt(g, 3);
  const ava = S.plans[0].stints[0].onFloor[0];
  S.setAvailable(g, ava, false);
  S.computeAll();
  startAt(g, 5);
  S.setAvailable(g, ava, true);
  S.computeAll();
  assert.equal(g.live.arrived?.[ava], undefined, 'not recorded as late');
  const m = minutes(g);
  const others = S.availIds(g).filter(id => id !== ava).map(id => m[id]);
  assert.ok(m[ava] >= Math.min(...others) - 4, `she ends at ${m[ava]}, not shrunk far below the others ${others}`);
});

test('12: marking a kid out on a finished game deletes none of the played fives naming her', () => {
  const g = setup();
  const ava = S.plans[0].stints[0].onFloor[0];
  const five = k => S.plans[0].stints[k].onFloor.slice();
  startAt(g, 7);
  g.live.finished = true;
  g.live.overrides = { 0: [ava, ...five(0).filter(x => x !== ava).slice(0, 4)], 7: [ava, ...five(7).filter(x => x !== ava).slice(0, 4)] };
  S.setAvailable(g, ava, false);
  assert.deepEqual(Object.keys(g.live.overrides), ['0', '7'], 'every played five that names her is still there');
});
