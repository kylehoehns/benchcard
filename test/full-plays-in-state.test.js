import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withTeam, bareGame, player } from './state-fixture.js';

/* #450 / #451 composed by state.js: the league minimum counted in full periods
   and Everyone plays in each half or period. Spec 450, J-L. Runs at the
   `computeAll` / `resolveRest` seam on a fixture team. */

const ids = n => Array.from({ length: n }, (_, i) => `p${i}`);
function game({ n = 10, every = 4, mode = 'everyN', settings, constraints }, fn) {
  const g = bareGame({ id: 'g450', seed: 1234, granMode: mode, granValue: every, late: [],
    live: { at: 0, overrides: {} }, constraints: { ...S.emptyConstraints(), ...constraints } });
  return withTeam(ids(n).map(id => player(id)), [g], settings, () => { S.computeAll(); return fn(g); });
}
const wholeQuarters = (rows, id) => [1, 2, 3, 4]
  .filter(q => rows.filter(s => s.period === q).every(s => s.onFloor.includes(id))).length;
const FULL2 = { minMinutes: 2, minUnit: 'full' };

test('J. league minimum of 2 full periods: every kid plays 2 whole quarters, and the Rules sentence says so', () => {
  game({ settings: FULL2 }, g => {
    const p = S.plans[0];
    assert.ok(p.ok, p.issues.map(i => i.code).join());
    for (const id of ids(10)) assert.ok(wholeQuarters(p.stints, id) >= 2, `${id} has ${wholeQuarters(p.stints, id)}`);
    assert.ok(S.ruleItems(g).some(i => i.text === 'Everyone plays at least 2 full periods (16 min)'),
      S.ruleItems(g).map(i => i.text).join(' | '));
  });
});

test('J. switching the unit from periods to full re-solves', () => {
  const g = bareGame({ id: 'g450', seed: 1234, granMode: 'everyN', granValue: 4, late: [],
    live: { at: 0, overrides: {} }, constraints: S.emptyConstraints() });
  const settings = { minMinutes: 2, minUnit: 'periods' };
  withTeam(ids(10).map(id => player(id)), [g], settings, () => {
    S.computeAll();
    const before = S.plans[0];
    assert.ok(ids(10).some(id => wholeQuarters(before.stints, id) < 2), 'fixture: minutes alone leave a kid short of 2 whole quarters');
    S.state.settings.minUnit = 'full';
    S.computeAll();
    assert.notEqual(S.plans[0], before);
    for (const id of ids(10)) assert.ok(wholeQuarters(S.plans[0].stints, id) >= 2, id);
  });
});

test('K. Everyone plays in each period: every kid is on in every quarter, and Rules says so', () => {
  game({ mode: 'perPeriod', every: 2, settings: { playsIn: 'periods' } }, g => {
    const p = S.plans[0];
    assert.ok(p.ok);
    for (const id of ids(10)) for (let q = 1; q <= 4; q++) {
      assert.ok(p.stints.filter(s => s.period === q).some(s => s.onFloor.includes(id)), `${id} misses Q${q}`);
    }
    assert.ok(S.ruleItems(g).some(i => i.text === 'Everyone plays in every quarter'), S.ruleItems(g).map(i => i.text).join(' | '));
    assert.equal(S.ruleItems(g).length, S.ruleCount(g));
  });
  game({ settings: { playsIn: 'halves' } }, g => {
    assert.ok(S.ruleItems(g).some(i => i.text === 'Everyone plays in each half'));
    assert.equal(S.ruleItems(g).length, S.ruleCount(g));
  });
});

const played = (g, p, from, r) => p.stints.map((s, i) => (i >= from ? r.overrides[i] || s.onFloor : S.effectiveStints(g, p)[i].onFloor));

test('L. a re-plan from Q2 keeps full periods, counting the quarter already played', () => {
  game({ settings: FULL2 }, g => {
    const p = S.plans[0];
    const r = S.resolveRest(g, p, 2);
    assert.ok(r.ok, r.reason);
    const rows = played(g, p, 2, r).map((onFloor, i) => ({ period: p.stints[i].period, onFloor }));
    for (const id of ids(10)) assert.ok(wholeQuarters(rows, id) >= 2, `${id} ends with ${wholeQuarters(rows, id)}`);
  });
});

test('L. a re-plan under each half does not call back a kid who already played in the first half', () => {
  game({ settings: { playsIn: 'halves' } }, g => {
    const p = S.plans[0];
    const r = S.resolveRest(g, p, 2);
    assert.ok(r.ok, r.reason);
    const rows = played(g, p, 2, r);
    const inQ1 = new Set(rows.slice(0, 2).flat());
    const left = ids(10).filter(id => !inQ1.has(id));
    for (const id of left) assert.ok(rows[2].includes(id) || rows[3].includes(id), `${id} sat the first half`);
    assert.ok(rows[3].filter(id => !rows[2].includes(id)).length <= 3, 'break over the change limit');
    assert.ok(!r.issues.some(i => i.code === 'PLAYS_IN_SUBS' || i.code === 'PLAYS_IN_MISSED'), r.issues.map(i => i.code).join());
    for (const id of ids(10)) assert.ok(rows.slice(4).some(row => row.includes(id)), `${id} misses the second half`);
  });
});

test('a re-plan mid-game places the full periods that fit and names the rest, never an error', () => {
  game({ settings: FULL2 }, g => {
    for (const from of [1, 3, 5]) {
      const r = S.resolveRest(g, S.plans[0], from);
      assert.ok(r.ok, `from stint ${from}: ${r.reason}: ${(r.issues || []).filter(i => i.severity === 'error').map(i => i.code).join()}`);
    }
    const r = S.resolveRest(g, S.plans[0], 3);
    assert.ok(r.issues.some(i => i.code === 'FULL_PERIODS_SHORT'), r.issues.map(i => i.code).join());
  });
});

test('a Platoon game does not list Everyone plays in, which it ignores, and the count still matches the list', () => {
  const g = bareGame({ id: 'g450', seed: 1234, strategy: 'platoon', late: [], live: { at: 0, overrides: {} }, constraints: S.emptyConstraints() });
  withTeam(ids(10).map(id => player(id)), [g], { playsIn: 'halves' }, () => {
    assert.ok(!S.ruleItems(g).some(i => i.kind === 'playsIn'), S.ruleItems(g).map(i => i.text).join(' | '));
    assert.equal(S.ruleItems(g).length, S.ruleCount(g));
  });
});
