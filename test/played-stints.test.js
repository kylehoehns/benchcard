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
  const pastBefore = fives(g, 2);
  const playedBefore = S.minutesFrom(S.effectiveStints(g, S.plans[0]).slice(0, 2), S.availIds(g));
  S.rotationMoved();

  S.setAvailable(g, LILY, true);
  S.computeAll();

  assert.deepEqual(fives(g, 2), pastBefore, 'stints 0 and 1 are the same fives as before');
  const eff = S.effectiveStints(g, S.plans[0]);
  const playedAfter = S.minutesFrom(eff.slice(0, 2), S.availIds(g));
  for (const id of S.availIds(g)) assert.equal(playedAfter[id] || 0, playedBefore[id] || 0, `${id} played minutes`);
  assert.equal(playedAfter[LILY] || 0, 0, 'Lily has played nothing');
  /* "Stints 2-7 include Lily" cannot mean all six: her even share is 13.3
     minutes, about three stints. She is in the rest, and only the rest. */
  assert.ok(eff.slice(2).some(r => r.onFloor.includes(LILY)), 'Lily plays in the re-planned stints');
  const m = minutes(g);
  assert.ok(Math.abs(m[LILY] - 120 / 9) <= 4, `Lily ends at ${m[LILY]}, within a stint of 13.3`);
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

test('C: a rule added at stint 3 leaves stints 0-2 alone and caps the rest', () => {
  const g = setup();
  startAt(g, 3);
  const past = fives(g, 3);
  const played = S.minutesFrom(S.effectiveStints(g, S.plans[0]).slice(0, 3), S.availIds(g));
  g.constraints.maxMinutes.p0 = 12;
  S.computeAll();

  assert.deepEqual(fives(g, 3), past, 'stints 0-2 are unchanged');
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
