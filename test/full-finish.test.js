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
function handPlay(g, p, kid, onAt, upTo = 8) {
  const swaps = {};
  for (let k = 0; k < upTo; k++) {
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
    // p1 sits stints 3 and 7: one whole period (Q2), owes one more, and missed a stint of Q3
    handPlay(g, p, 'p1', k => k !== 2 && k !== 6);
    S.computeAll();
    const eff = S.effectiveStints(g, S.plans[0]).map(s => s.onFloor);
    assert.equal(wholes(eff.slice(0, 6), 'p1'), 1, 'the premise: p1 still owes a period');
    assert.ok(!eff[6].includes('p1') && eff[7].includes('p1'), 'the premise: p1 sat stint 7 of the quarter and played 8');
    const r = S.resolveRest(g, S.plans[0], 8);
    assert.equal(r.ok, true);
    assert.ok(!five(r, S.plans[0], 8).includes('p1'), 'p1 is held on for a period they cannot complete');
  });
});

test('a kid already at the league\'s number is not kept on to finish the quarter', () => {
  room(1, 8, (g, p) => {
    // p1 plays every stint so far: two whole periods (the league asks 2) and stints 7 and 8 of Q3
    handPlay(g, p, 'p1', () => true);
    S.computeAll();
    const eff = S.effectiveStints(g, S.plans[0]).map(s => s.onFloor);
    assert.equal(wholes(eff.slice(0, 6), 'p1'), 2, 'the premise: p1 is at the league number');
    const r = S.resolveRest(g, S.plans[0], 8);
    assert.equal(r.ok, true);
    assert.ok(!five(r, S.plans[0], 8).includes('p1'), 'p1 is held on for a period they do not need');
  });
});

test('a kid whose finishing would go past Plays at most N in a row is not kept on', () => {
  const extra = { constraints: { ...S.emptyConstraints(), maxConsecutive: 2 } };
  room(1, 8, (g, p) => {
    // p1 sits stints 3 and 6, plays 7 and 8: a run of two at the cut, three if they finish the quarter
    handPlay(g, p, 'p1', k => ![2, 5].includes(k));
    S.computeAll();
    const r = S.resolveRest(g, S.plans[0], 8);
    assert.equal(r.ok, true);
    assert.ok(!five(r, S.plans[0], 8).includes('p1'), 'p1 is held on past their limit of 2 in a row');
  }, LEAGUE, extra);
});

test('a change of plan that stops before the quarter ends offers no finisher', () => {
  // 4 x 8 minutes, a change every 2: four stints a quarter, Q3 is stints 9-12. p1 sat stints 3 and 7 and played stint 9.
  const shape = { periodMinutes: 8, granValue: 2 };
  room(1, 9, (g, p) => {
    handPlay(g, p, 'p1', k => ![2, 6].includes(k), 9);
    S.computeAll();
    const p1 = S.plans[0];
    assert.equal(p1.stints.length, 16);
    const open = S.resolveRest(g, p1, 9);
    assert.ok(open.ok && five(open, p1, 9).includes('p1'), 'the premise: to the end of the game p1 is kept on');
    const r = S.resolveRest(g, p1, 9, [], 11);
    assert.equal(r.ok, true);
    assert.ok(!five(r, p1, 9).includes('p1'), 'p1 is held on to finish a quarter the plan does not reach the end of');
  }, { minMinutes: 1, minUnit: 'full' }, shape);
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
  '4x8/2': { engine: 'd08fad28bc2e', break: 'dfd870f02899', off: '9d31d9547ced' },
  '2x12/4': { engine: '875b1eafffa4', break: '5abe1fd52428', off: '5c652d45e01c' },
  '4x9/3': { engine: '331ba1b62761', break: 'c0e348f2954a', off: '8ada7288f82a' },
};
/* Distinct stint structures: a 6- and an 8-minute quarter changing every 3 and 4
   minutes both make two stints, so 4x6/3 and 4x8/4 (and 2x7/3 and 2x10/5) planned
   the same rows. These make 2, 2, 4, 3 and 3 stints a period. */
const SHAPES = [[2, 7, 3], [4, 6, 3], [4, 8, 2], [2, 12, 4], [4, 9, 3]];
const sha = text => createHash('sha1').update(text).digest('hex').slice(0, 12);
const fingerprints = () => {
  const out = {}, good = {};
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
    // rows that are real plans: the engine planned, and the change of plan wrote fives
    good[key] = {
      engine: rows.engine.filter(r => JSON.parse(r)[0]).length,
      break: rows.break.filter(r => r !== 'blocked' && JSON.parse(r)[0] && Object.keys(JSON.parse(r)[2] || {}).length).length,
      off: rows.off.filter(r => r !== 'blocked' && JSON.parse(r)[0] && Object.keys(JSON.parse(r)[2] || {}).length).length,
    };
  }
  return { out, good };
};

test('with no finisher the engine and a change of plan at a break or with full periods off are as they were', () => {
  const { out: got, good } = fingerprints();
  if (process.env.PRINT_FINGERPRINTS) console.log(JSON.stringify(got, null, 2));
  assert.deepEqual(got, FINGERPRINTS);
  // each row guards real plans: most of the 20 seeds plan and write fives, and no two shapes share a row
  for (const [key, rows] of Object.entries(good)) for (const [row, n] of Object.entries(rows)) assert.ok(n >= 15, `${key} ${row}: only ${n} of 20 seeds gave a plan`);
  for (const row of ['engine', 'break', 'off']) assert.equal(new Set(Object.values(FINGERPRINTS).map(f => f[row])).size, SHAPES.length, `two shapes share a ${row} fingerprint`);
});
