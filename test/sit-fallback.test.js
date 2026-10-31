import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #412: the #134 fallback in `syncOverrides` -- a mid-game format change moves
   the grid, so the freeze does not run and the rest is planned again from
   scratch -- must still keep a kid the coach sat for the rest off the floor,
   or say it could not. Runs at the `computeAll` seam, set up like
   played-stints.test.js. */
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

function setup(count, out = []) {
  S.state.players.length = 0;
  for (let i = 0; i < count; i++) S.state.players.push({ id: `p${i}`, name: ['Ava','Ben','Cy','Dee','Eli','Fay','Gus','Hal','Ivy'][i], tier: 3 });
  const g = {
    id: 'g412', label: '', tipoff: '', out, seed: 1234,
    periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
    strategy: 'balanced', balance: 'even',
    constraints: { minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: [], units: [] },
    live: { at: 0, overrides: {} },
    useCarryover: false, useSeasonTargets: false,
  };
  S.state.day.games = [g];
  S.state.activeGame = 0;
  S.computeAll();
  g.live.at = 2;
  S.computeAll();
  return g;
}

/* The coach sat `id` for the rest of the game, from the stint after the one on the floor. */
function sit(g, id) {
  L.sitOut(g.live, id);
  const r = S.resolveRest(g, S.plans[0], L.resetFrom(g.live));
  assert.ok(r.ok, 'the premise: the sit took');
  L.writeOverrides(g.live, r.overrides, false);
  S.computeAll();
}

const laterFives = g => S.effectiveStints(g, S.plans[0]).slice(L.resetFrom(g.live)).map(s => s.onFloor);

test('a format change mid-game keeps the sat kid off the floor', () => {
  const g = setup(9);
  sit(g, 'p0');
  S.satShortBench();
  g.periods = 2;    // the grid moves, so the freeze cannot run
  S.computeAll();
  const fives = laterFives(g);
  assert.ok(fives.length > 0, 'the premise: stints are left to play');
  assert.deepEqual(fives.filter(f => f.includes('p0')), [], `p0 sat for the rest: ${JSON.stringify(fives)}`);
  assert.deepEqual(S.satShortBench(g.id), [], 'five could be made without them, so nothing to say');
});

test('a format change that leaves too few without the sat kid plans with them and says so', () => {
  const g = setup(6);
  sit(g, 'p0');
  S.satShortBench();
  g.out = ['p1'];   // five at the game, one of them sat
  g.periods = 2;
  S.computeAll();
  const fives = laterFives(g);
  assert.ok(fives.length > 0 && fives.every(f => f.includes('p0')), `p0 fills the fifth seat: ${JSON.stringify(fives)}`);
  assert.deepEqual(S.satShortBench(g.id), ['Ava']);
});
