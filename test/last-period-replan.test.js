import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #444: once the last period's first stint has been played, a re-plan treats
   the Last-period five as done. Through the `state.js` seam (spec 444, "What
   would settle it"): 10 players, Starts the last period p0-p4. */
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

const FIVE = ['p0', 'p1', 'p2', 'p3', 'p4'];
const CASES = [
  { name: '4x8 every 3, seed 1', seed: 1, periods: 4, periodMinutes: 8, granValue: 3 },
  { name: '4x8 every 3, seed 3', seed: 3, periods: 4, periodMinutes: 8, granValue: 3 },
  { name: '4x8 every 4', seed: 1, periods: 4, periodMinutes: 8, granValue: 4 },
  { name: '2x16 every 4', seed: 1, periods: 2, periodMinutes: 16, granValue: 4 },
];

function setup(o, constraints = {}, n = 10) {
  S.state.players.length = 0;
  for (let i = 0; i < n; i++) S.state.players.push({ id: `p${i}`, name: `Player ${i}`, tier: 3 });
  const g = {
    id: `g444-${o.name}`, label: '', tipoff: '', out: [], seed: o.seed,
    periods: o.periods, periodMinutes: o.periodMinutes,
    granMode: 'everyN', granValue: o.granValue,
    strategy: 'balanced', balance: 'even',
    constraints: {
      minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [],
      openingFive: [], lastPeriodFive: FIVE, units: [], ...constraints,
    },
    live: { at: 0, overrides: {} },
    useCarryover: false, useSeasonTargets: false,
  };
  S.state.day.games = [g];
  S.state.activeGame = 0;
  S.computeAll();
  const p = S.plans[0];
  // the last period's first stint, read off the printed plan, not the engine
  const f = p.stints.findIndex(s => s.period === o.periods);
  return { g, p, f };
}
const setOf = ids => [...ids].sort();

for (const o of CASES) {
  test(`1: ${o.name}: a re-plan from the last period's second stint does not put p0-p4 back on`, () => {
    const { g, p, f } = setup(o);
    assert.deepEqual(setOf(p.stints[f].onFloor), FIVE, 'the plan starts the last period with p0-p4');
    const r = S.resolveRest(g, p, f + 1);
    assert.equal(r.ok, true);
    /* "plan 2/5 -> replan 5/5" is the symptom (spec 444): as many of p0-p4 as the
       plan had, not all five. The solver may re-pick the rest. */
    const kept = ids => ids.filter(id => FIVE.includes(id)).length;
    assert.equal(kept(r.overrides[f + 1]), kept(p.stints[f + 1].onFloor));
  });

  test(`3: ${o.name}: sitting p0 in the last period raises no "start the last period" note`, () => {
    const { g, p, f } = setup(o);
    const r = S.resolveRest(g, p, f + 1, ['p0']);
    assert.equal(r.ok, true);
    const bad = (r.issues || []).filter(i => /is set to start the last period/.test(i.message));
    assert.deepEqual(bad.map(i => i.message), []);
  });

  test(`4: ${o.name}: a re-plan before the last period starts still puts p0-p4 on its first stint`, () => {
    const { g, p, f } = setup(o);
    for (const k of [f - 1, f]) {
      const r = S.resolveRest(g, p, k);
      assert.equal(r.ok, true, `from ${k}`);
      assert.deepEqual(setOf(r.overrides[f]), FIVE, `from ${k}`);
    }
  });
}

test('2: 4x8 every 3, seed 3: swapping p0 off at the last period\'s first stint, the re-plan is not the full five again', () => {
  const { g, p, f } = setup(CASES[1]);
  g.live.overrides[f] = p.stints[f].onFloor.map(id => (id === 'p0' ? 'p5' : id));
  const r = S.resolveRest(g, p, f + 1);
  assert.equal(r.ok, true);
  // p0 may come back on by fairness (they lost a stint); the full five must not
  assert.notDeepEqual(setOf(r.overrides[f + 1]), FIVE);
  assert.ok(r.overrides[f + 1].filter(id => FIVE.includes(id)).length < 5);
});

