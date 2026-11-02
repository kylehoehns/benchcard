import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';
import { createHash } from 'node:crypto';
import { writeOverrides } from '../app/live.js';
import { generatePlan } from '../app/engine.js';

/* #535: a change of plan partway through a period lets a kid who has played all
   of it so far finish it, and it counts as one of their full periods. Seam:
   `resolveRest` (state.js), the fixtures of docs/specs/533-*.md. Nine players,
   4 x 9 minutes, a change every 3 (three stints a quarter, 12 in all), the
   league asks 2 full periods. */

const IDS = Array.from({ length: 9 }, (_, i) => `p${i}`);
const LEAGUE = { minMinutes: 2, minUnit: 'full' };
const mk = (seed, extra = {}) => bareGame({
  id: 'g0', seed, periods: 4, periodMinutes: 9, granValue: 3, live: { at: 0, overrides: {} },
  constraints: S.emptyConstraints(), ...extra,
});
const room = (seed, at, fn, settings = LEAGUE, extra = {}) => {
  const g = mk(seed, extra);
  return withTeam(IDS.map(id => player(id)), [g], settings, () => {
    S.computeAll();
    g.live.at = at;
    S.computeAll();
    return fn(g, S.plans[0]);
  });
};
const five = (r, p, k) => r.overrides[k] || p.stints[k].onFloor;
const periodOf = k => Math.floor(k / 3);
/* whole periods of kid `id` in the fives `floors` (12 of them), counted here */
const wholes = (floors, id) => [0, 1, 2, 3].filter(q => q * 3 + 2 < floors.length && [0, 1, 2].every(i => floors[q * 3 + i].includes(id))).length;

test('a kid with one whole period who played stints 7 and 8 finishes the quarter on stint 9', () => {
  room(1, 8, (g, p) => {
    const eff = S.effectiveStints(g, p);
    assert.ok(eff[6].onFloor.includes('p1') && eff[7].onFloor.includes('p1'), 'the premise: p1 played stints 7 and 8');
    assert.equal(wholes(eff.slice(0, 6).map(s => s.onFloor), 'p1'), 1, 'the premise: p1 has one whole period');
    const r = S.resolveRest(g, p, 8);
    assert.equal(r.ok, true);
    assert.ok(five(r, p, 8).includes('p1'), 'p1 is subbed off before the quarter ends');
  });
});

/* Hand swaps on stints 1-8 so that `kid` is on the floor exactly when `onAt`
   says, whoever else is there. `plan` is the printed plan. */
function handPlay(g, p, kid, onAt) {
  const swaps = {};
  for (let k = 0; k < 8; k++) {
    const floor = p.stints[k].onFloor;
    if (onAt(k) === floor.includes(kid)) continue;
    if (onAt(k)) {
      const out = floor.find(id => id !== kid);
      swaps[k] = floor.map(id => (id === out ? kid : id));
    } else {
      const bench = IDS.find(id => !floor.includes(id));
      swaps[k] = floor.map(id => (id === kid ? bench : id));
    }
  }
  writeOverrides(g.live, swaps, true);
}
const floorsAfter = (g, p, r, from) => S.effectiveStints(g, p).map((s, k) => (k < from ? s.onFloor : five(r, p, k)));

test('a kid with no whole period who played stints 7 and 8 of the quarter finishes it and ends with two whole periods', () => {
  room(1, 8, (g, p) => {
    // p1 sits one stint in each of the first two quarters (stints 3 and 6), plays 7 and 8
    handPlay(g, p, 'p1', k => ![2, 5].includes(k));
    S.computeAll();
    const eff = S.effectiveStints(g, S.plans[0]).map(s => s.onFloor);
    assert.equal(wholes(eff.slice(0, 6), 'p1'), 0, 'the premise: no whole period yet');
    assert.ok(eff[6].includes('p1') && eff[7].includes('p1'), 'the premise: p1 played stints 7 and 8');
    const r = S.resolveRest(g, S.plans[0], 8);
    assert.equal(r.ok, true);
    assert.ok(five(r, S.plans[0], 8).includes('p1'), 'p1 does not finish the quarter');
    assert.equal(wholes(floorsAfter(g, S.plans[0], r, 8), 'p1'), 2, 'two whole periods in all');
  });
});

test('a kid who sat one stint of the quarter is not kept on to finish it', () => {
  room(1, 8, (g, p) => {
    handPlay(g, p, 'p1', k => k !== 6);
    S.computeAll();
    const r = S.resolveRest(g, S.plans[0], 8);
    assert.equal(r.ok, true);
    assert.ok(!five(r, S.plans[0], 8).includes('p1'), 'p1 is held on for a period they cannot complete');
  });
});

/* Byte-identity (#535): with no `fullFinish` every call comes out exactly as it
   did before this change. The fingerprints below were taken on main at 5948ac2,
   before the change (a sha1 of the JSON of every result, seeds 1-20, for each
   shape), and are re-taken only when the engine is meant to change. Three calls:
   the engine with full periods asked for and no finisher; a change of plan at a
   period break; a change of plan mid-period with full periods off. */
const FINGERPRINTS = {
  '2x7/3': { engine: 'e839803bb245', break: '92e04d2dfdfc', off: '01d587ace69f' },
  '4x6/3': { engine: 'd9fab2e0354e', break: '127a701d3f19', off: '2f9b3b8458e9' },
  '4x8/4': { engine: 'd9fab2e0354e', break: '127a701d3f19', off: '2f9b3b8458e9' },
  '2x10/5': { engine: '44946c0c0d8f', break: '92e04d2dfdfc', off: '9f2ced97d855' },
  '4x9/3': { engine: '331ba1b62761', break: 'c0e348f2954a', off: '8ada7288f82a' },
};
const SHAPES = [[2, 7, 3], [4, 6, 3], [4, 8, 4], [2, 10, 5], [4, 9, 3]];
const sha = text => createHash('sha1').update(text).digest('hex').slice(0, 12);
const fingerprints = () => {
  const out = {};
  for (const [periods, periodMinutes, granValue] of SHAPES) {
    const key = `${periods}x${periodMinutes}/${granValue}`;
    const full = periodMinutes === 9 ? 2 : 1;
    const rows = { engine: [], break: [], off: [] };
    for (let seed = 1; seed <= 20; seed++) {
      const players = IDS.map(id => player(id));
      const shape = { periods, periodMinutes, granValue };
      const plan = generatePlan({
        players, availableIds: IDS, format: { periods, periodMinutes }, granularity: { mode: 'everyN', value: granValue },
        constraints: { ...S.emptyConstraints(), fullPeriods: Object.fromEntries(IDS.map(id => [id, full])) },
        strategy: 'balanced', balance: 'even', seed, maxSubs: 5,
      });
      rows.engine.push(JSON.stringify([plan.ok, plan.stints.map(s => s.onFloor), plan.issues.map(i => i.code)]));
      const settle = (settings, pick) => {
        const g = mk(seed, shape);
        return withTeam(players, [g], settings, () => {
          S.computeAll();
          const p0 = S.plans[0];
          if (!p0.ok) return 'blocked';
          g.live.at = pick(p0);
          S.computeAll();
          const p = S.plans[0];
          const r = S.resolveRest(g, p, g.live.at);
          return JSON.stringify([r.ok, r.reason ?? null, r.overrides ?? null, (r.issues || []).map(i => i.code)]);
        });
      };
      const period = Math.min(periods, 3);
      rows.break.push(settle({ minMinutes: full, minUnit: 'full' }, p => p.stints.findIndex(s => s.period === period)));
      rows.off.push(settle({}, p => p.stints.findIndex(s => s.period === period) + 1));
    }
    out[key] = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, sha(v.join('\n'))]));
  }
  return out;
};

test('with no finisher the engine and a change of plan at a break or with full periods off are as they were', () => {
  const got = fingerprints();
  if (process.env.PRINT_FINGERPRINTS) console.log(JSON.stringify(got, null, 2));
  assert.deepEqual(got, FINGERPRINTS);
});
