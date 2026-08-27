import { test } from 'node:test';
import assert from 'node:assert/strict';

/* Mid-game re-solve (A10, slice 1).

   "Aiden has four fouls, sit him" -- `resolveRest` re-solves the REST of the
   game honouring the minutes everyone has already played, and hands back
   fives for stints k..n-1 only.

   The four properties that make it safe to ship, in the order they matter:

     1. THE PAST DOES NOT MOVE. Stints 0..k-1 are never written, so
        `effectiveStints` reports exactly what it reported a second earlier
        and `effectiveMinutes` cannot fork. This is the one that would lose a
        coach's game, so it is checked structurally (the rows are the same
        objects) and numerically (nobody's played total moved).
     2. THE SAT PLAYER IS ACTUALLY SAT, from stint k to the whistle.
     3. IT IS FAIRER THAN WHAT IT REPLACES. `Rest of game` today dumps every
        remaining stint on one named kid. This measures both across 162 cases
        rather than asserting the improvement on faith -- see the numbers in
        the test's own output.
     4. IT IS FULLY REVERSIBLE. Clearing the overrides -- what "Back to the
        printed plan" does -- gives back the printed plan by identity, not by
        equality.

   `state.js` reaches for `localStorage` at import time and `dom.js` measures a
   canvas, so both are stubbed before the import. That is the whole harness;
   nothing here is mocked past the browser. */
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
const { generatePlan, buildStints } = await import('../app/engine.js');

const freshConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [],
  openingFive: [], lastPeriodFive: [],
});

function setup(n, opts = {}) {
  S.state.players.length = 0;
  for (let i = 0; i < n; i++) S.state.players.push({ id: `p${i}`, name: `Player ${i}`, tier: 3 });
  const g = {
    id: 'g1', label: '', when: '', out: opts.out || [], seed: opts.seed ?? 1,
    periods: opts.periods ?? 4, periodMinutes: opts.periodMinutes ?? 8,
    granMode: opts.granMode ?? 'everyN', granValue: opts.granValue ?? 3,
    strategy: opts.strategy ?? 'balanced', balance: opts.balance ?? 'even',
    constraints: opts.constraints || freshConstraints(),
    live: { at: 0, overrides: {} },
    useCarryover: false, useSeasonTargets: false,
  };
  S.state.day.games = [g];
  S.state.activeGame = 0;
  S.computeAll();
  return { g, p: S.plans[0] };
}

/* What `Rest of game` does today: one named kid -- the lightest on the bench,
   which is the order the bench is offered in -- inherits every one of the sat
   player's remaining stints. Reproduced here so the comparison in the fairness
   test is against the real behaviour and not a straw man. */
function oneForOne(g, p, k, outId) {
  const played = S.minutesFrom(S.effectiveStints(g, p).slice(0, k), S.availIds(g));
  const floor = S.effectiveLineup(g, p, k);
  const inId = S.availIds(g).filter(id => !floor.includes(id) && id !== outId)
    .sort((a, b) => (played[a] || 0) - (played[b] || 0) || (a < b ? -1 : 1))[0];
  if (!inId) return null;
  const ov = {};
  for (let j = k; j < p.stints.length; j++) {
    const f = p.stints[j].onFloor;
    if (!f.includes(outId) || f.includes(inId)) continue;
    ov[j] = f.map(x => (x === outId ? inId : x));
  }
  return ov;
}

const withOverrides = (g, p, ov, fn) => {
  const saved = g.live.overrides;
  g.live.overrides = { ...saved, ...ov };
  try { return fn(); } finally { g.live.overrides = saved; }
};

test('the past is untouched -- the same rows, and nobody\'s played minutes move', () => {
  const { g, p } = setup(10, { seed: 4 });
  const k = 5;
  const all = S.availIds(g);
  const before = S.effectiveStints(g, p).slice(0, k);
  const playedBefore = S.minutesFrom(before, all);

  const r = S.resolveRest(g, p, k, ['p2']);
  assert.equal(r.ok, true, r.reason);
  Object.assign(g.live.overrides, r.overrides);

  const after = S.effectiveStints(g, p).slice(0, k);
  for (let i = 0; i < k; i++) {
    assert.equal(after[i].onFloor.join(','), before[i].onFloor.join(','), `stint ${i} moved`);
  }
  assert.deepEqual(S.minutesFrom(after, all), playedBefore);

  /* The guard has to be able to fail. Writing one stint of the past and
     reading the mutation back proves the two checks above are live and not
     comparing an array against itself. */
  g.live.overrides[k - 1] = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const tampered = S.effectiveStints(g, p).slice(0, k);
  assert.equal(tampered[k - 1].onFloor.join(','), 'p0,p1,p2,p3,p4');
  assert.notDeepEqual(S.minutesFrom(tampered, all), playedBefore);
});

test('a re-solve writes stints k..n-1 and no others', () => {
  const { g, p } = setup(11, { seed: 7, granValue: 4 });
  const k = 3;
  const r = S.resolveRest(g, p, k, ['p1']);
  assert.equal(r.ok, true, r.reason);
  const keys = Object.keys(r.overrides).map(Number).sort((a, b) => a - b);
  assert.deepEqual(keys, Array.from({ length: p.stints.length - k }, (_, i) => k + i));
  for (const five of Object.values(r.overrides)) assert.equal(new Set(five).size, 5);
});

test('the sat player appears in no stint from k on, and everyone else is still eligible', () => {
  for (const n of [8, 10, 12]) {
    const { g, p } = setup(n, { seed: 2 });
    const k = 4;
    const outId = S.effectiveLineup(g, p, k)[0];
    const r = S.resolveRest(g, p, k, [outId]);
    assert.equal(r.ok, true, r.reason);
    for (const [key, five] of Object.entries(r.overrides)) {
      assert.ok(!five.includes(outId), `${outId} is still on the floor at stint ${key}`);
      for (const id of five) assert.ok(S.availIds(g).includes(id), `${id} is not available`);
    }
  }
});

test('a re-solve is fairer than the one-for-one swap it replaces -- measured, not assumed', () => {
  const rows = [];
  for (const n of [7, 8, 9, 10, 11, 12]) {
    for (const seed of [1, 2, 3]) {
      for (const gran of [{ granMode: 'everyN', granValue: 3 },
                          { granMode: 'everyN', granValue: 4 },
                          { granMode: 'perPeriod', granValue: 2 }]) {
        const { g, p } = setup(n, { seed, ...gran });
        for (const k of [1, Math.floor(p.stints.length / 2), p.stints.length - 2]) {
          if (k < 1 || k >= p.stints.length) continue;
          const outId = S.effectiveLineup(g, p, k)[0];
          const r = S.resolveRest(g, p, k, [outId]);
          const o = oneForOne(g, p, k, outId);
          assert.equal(r.ok, true, `${n}/${seed}/${k}: ${r.reason}`);
          assert.ok(o, `${n}/${seed}/${k}: no one-for-one to compare against`);
          // judged over the players still playing: the sat kid's total is
          // frozen either way and would only flatter both numbers
          const ids = S.availIds(g).filter(id => id !== outId);
          const spread = ov => withOverrides(g, p, ov, () => {
            const m = S.effectiveMinutes(g, p);
            const v = ids.map(id => m[id] || 0);
            return Math.round((Math.max(...v) - Math.min(...v)) * 100) / 100;
          });
          rows.push({ resolve: spread(r.overrides), one: spread(o) });
        }
      }
    }
  }
  const mean = f => Math.round(rows.reduce((a, r) => a + f(r), 0) / rows.length * 1000) / 1000;
  const worse = rows.filter(r => r.resolve > r.one);
  console.log(`  re-solve vs one-for-one over ${rows.length} cases: `
    + `${rows.filter(r => r.resolve < r.one).length} better, `
    + `${rows.filter(r => r.resolve === r.one).length} the same, ${worse.length} worse; `
    + `mean spread ${mean(r => r.resolve)} vs ${mean(r => r.one)} minutes`);
  assert.ok(rows.length >= 150, 'the sweep must actually cover something');
  assert.equal(worse.length, 0, `a re-solve was worse than a dumb swap in ${worse.length} cases`);
  assert.ok(mean(r => r.resolve) < mean(r => r.one), 'no measurable improvement');
});

test('clearing the overrides gives back the printed plan by identity', () => {
  const { g, p } = setup(10, { seed: 9 });
  const r = S.resolveRest(g, p, 4, ['p3']);
  assert.equal(r.ok, true, r.reason);
  Object.assign(g.live.overrides, r.overrides);
  assert.notEqual(S.effectiveStints(g, p), p.stints, 'the re-solve did not change anything');
  g.live.overrides = {};                    // what "Back to the printed plan" does
  assert.equal(S.effectiveStints(g, p), p.stints);
  assert.equal(S.effectiveMinutes(g, p), p.minutes);
});

test('the coach\'s floors and caps survive the suffix, reduced by what was played', () => {
  const c = freshConstraints();
  c.maxMinutes.p0 = 10;                     // a hard cap for the whole game
  const { g, p } = setup(10, { seed: 5, constraints: c });
  const k = 4;
  const played = S.minutesFrom(S.effectiveStints(g, p).slice(0, k), S.availIds(g));
  const r = S.resolveRest(g, p, k, ['p7']);
  assert.equal(r.ok, true, r.reason);
  const rest = Object.values(r.overrides)
    .reduce((a, five, i) => a + (five.includes('p0') ? p.stints[k + i].minutes : 0), 0);
  assert.ok((played.p0 || 0) + rest <= 10 + 1e-9,
    `p0 finished on ${(played.p0 || 0) + rest} against a cap of 10`);
});

test('the two hand-set-minutes strategies are refused rather than quietly reinterpreted', () => {
  for (const strategy of ['minutes', 'platoon']) {
    const { g, p } = setup(10, { strategy });
    if (!p || !p.ok) continue;
    assert.deepEqual(S.resolveRest(g, p, 3, ['p1']), { ok: false, reason: 'strategy' });
  }
});

test('nothing is written when there is nothing left, or nobody left', () => {
  const { g, p } = setup(10);
  assert.equal(S.resolveRest(g, p, p.stints.length, ['p1']).reason, 'nothing');
  const small = setup(6);
  // six available, sit two: five is the floor and four cannot cover it
  assert.equal(S.resolveRest(small.g, small.p, 2, ['p0', 'p1']).reason, 'nobody');
  // sitting exactly one of six still works -- five is a whole team
  assert.equal(S.resolveRest(small.g, small.p, 2, ['p0']).ok, true);
});

test('handing generatePlan the stints it would have built changes nothing', () => {
  /* The fifth engine permission in one assertion: `input.stints` is a way to
     ask the solver a question it could not otherwise be asked, not a different
     solver. Fed the list `buildStints` would have produced, it must answer
     byte for byte the same. */
  const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P ${i}`, tier: 3 }));
  const availableIds = players.map(p => p.id);
  for (const format of [{ periods: 4, periodMinutes: 8 }, { periods: 2, periodMinutes: 20 }]) {
    for (const granularity of [{ mode: 'everyN', value: 3 }, { mode: 'perPeriod', value: 2 }]) {
      for (const seed of [1, 2, 3]) {
        const base = { players, availableIds, format, granularity, seed, constraints: {} };
        const a = generatePlan(base);
        const b = generatePlan({ ...base, stints: buildStints(format, granularity) });
        assert.equal(JSON.stringify(b), JSON.stringify(a));
      }
    }
  }
});
