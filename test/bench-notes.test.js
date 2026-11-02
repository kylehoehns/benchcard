import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';
import { writeOverrides, sitOut } from '../app/live.js';

/* #534: the engine's "sits N stints in a row" note is rebuilt from the fives on
   screen, as `consecNotes` does for "plays N stints in a row". Seam: the
   `benchNotes` export. Eight players, eight stints; the fives are written by
   hand so the longest runs are known without asking the code: p0-p4 play
   stints 1-4 and p3-p7 play stints 5-8, so p5, p6 and p7 sit the first four,
   p0, p1 and p2 sit the last four, and p3 and p4 never sit. */

const IDS = Array.from({ length: 8 }, (_, i) => `p${i}`);
const FIRST = ['p0', 'p1', 'p2', 'p3', 'p4'];
const LAST = ['p3', 'p4', 'p5', 'p6', 'p7'];
const WORDS = (id, run, limit) => `${id} sits ${run} stints in a row against a limit of ${limit} — no legal lineup kept them under it.`;

function shown(limit, fn) {
  const g = bareGame({ id: 'g0', seed: 1, live: { at: 0, overrides: {} }, constraints: { ...S.emptyConstraints(), maxBench: limit } });
  return withTeam(IDS.map(id => player(id)), [g], {}, () => {
    S.computeAll();
    const p = S.plans[0];
    assert.equal(p.stints.length, 8);
    writeOverrides(g.live, Object.fromEntries(p.stints.map((s, k) => [k, k < 4 ? FIRST : LAST])), true);
    return fn(g, p);
  });
}
const said = (g, p, issues = []) => S.benchNotes(g, p, issues, id => id).map(n => n.message).sort();

test('a kid shown sitting past the limit gets the engine\'s sentence with the run on screen', () => {
  shown(2, (g, p) => {
    assert.deepEqual(said(g, p), ['p0', 'p1', 'p2', 'p5', 'p6', 'p7'].map(id => WORDS(id, 4, 2)));
    const n = S.benchNotes(g, p, [], id => id)[0];
    assert.equal(n.code, 'BENCH_EXCEEDED');
    assert.equal(n.severity, 'warn');
    assert.deepEqual(n.playerIds, ['p0']);
  });
});

test('runs within the limit get no note', () => {
  shown(4, (g, p) => assert.deepEqual(said(g, p), []));
});

test('a kid sat for the rest gets no note', () => {
  shown(2, (g, p) => {
    sitOut(g.live, 'p7');
    assert.deepEqual(said(g, p), ['p0', 'p1', 'p2', 'p5', 'p6'].map(id => WORDS(id, 4, 2)));
  });
});

test('a late arrival is counted only from the stint after the one they walked in during', () => {
  shown(2, (g, p) => {
    g.live.arrived = { p7: 1 };   // walked in during the second stint: two on the bench after it
    assert.deepEqual(said(g, p), ['p0', 'p1', 'p2', 'p5', 'p6'].map(id => WORDS(id, 4, 2)));
    g.live.arrived = { p7: 0 };   // walked in during the first stint: three on the bench after it
    assert.deepEqual(said(g, p), [...['p0', 'p1', 'p2', 'p5', 'p6'].map(id => WORDS(id, 4, 2)), WORDS('p7', 3, 2)].sort());
  });
});

test('a kid already on the floor in the stint they walked in during is counted only after it', () => {
  const g = bareGame({ id: 'g0', seed: 1, live: { at: 0, overrides: {} }, constraints: { ...S.emptyConstraints(), maxBench: 2 } });
  withTeam(IDS.map(id => player(id)), [g], {}, () => {
    S.computeAll();
    const p = S.plans[0];
    // p5 is off for stints 1-3, walks in during stint 4 (swapped on that stint) and plays on to the end
    const fives = p.stints.map((s, k) => (k < 3 ? FIRST : k === 3 ? ['p0', 'p1', 'p2', 'p3', 'p5'] : LAST));
    writeOverrides(g.live, Object.fromEntries(fives.map((f, k) => [k, f])), true);
    g.live.arrived = { p5: 3 };
    assert.ok(!said(g, p).includes(WORDS('p5', 3, 2)), 'the stints before p5 got there are counted as bench time');
  });
});

test('the engine\'s own note goes when a swap leaves the run on screen within the limit', () => {
  // p0 is capped at 8 minutes (two stints), so the engine plans [off off on off off on off off]
  // and says p0 sits 2 in a row against a limit of 1
  const g = bareGame({ id: 'g0', seed: 1, live: { at: 0, overrides: {} }, constraints: { ...S.emptyConstraints(), maxBench: 1, maxMinutes: { p0: 8 } } });
  withTeam(IDS.map(id => player(id)), [g], {}, () => {
    S.computeAll();
    const p = S.plans[0];
    assert.deepEqual(p.issues.filter(i => i.code === 'BENCH_EXCEEDED').map(i => i.message), [WORDS('p0', 2, 1)], 'the premise: the engine says p0 sits 2 in a row');
    assert.deepEqual(p.stints.map(s => s.onFloor.includes('p0')), [false, false, true, false, false, true, false, false]);
    assert.deepEqual(said(g, p, p.issues), [WORDS('p0', 2, 1)], 'the run on screen is the engine\'s, so the rebuilt note is its note');
    // the coach swaps p0 on for stints 1, 4 and 8, each time for a kid who plays the stints either side
    const swaps = {};
    for (const k of [0, 3, 7]) {
      const out = p.stints[k].onFloor.find(id => [k - 1, k + 1].every(j => !p.stints[j] || p.stints[j].onFloor.includes(id)));
      swaps[k] = p.stints[k].onFloor.map(id => (id === out ? 'p0' : id));
    }
    writeOverrides(g.live, swaps, true);
    assert.deepEqual(S.effectiveStints(g, p).map(s => s.onFloor.includes('p0')), [true, false, true, true, false, true, false, true], 'the premise: p0 never sits twice running on screen');
    assert.deepEqual(said(g, p, p.issues), [], 'a run within the limit on screen gets no note');
  });
});

test('nothing is said when the engine said the limit cannot hold', () => {
  shown(2, (g, p) => assert.deepEqual(said(g, p, [{ severity: 'warn', code: 'BENCH_TOO_FEW', message: 'x', playerIds: [] }]), []));
});

test('no limit, no note', () => {
  shown(0, (g, p) => assert.deepEqual(said(g, p), []));
});
