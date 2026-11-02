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

test('nothing is said when the engine said the limit cannot hold', () => {
  shown(2, (g, p) => assert.deepEqual(said(g, p, [{ severity: 'warn', code: 'BENCH_TOO_FEW', message: 'x', playerIds: [] }]), []));
});

test('no limit, no note', () => {
  shown(0, (g, p) => assert.deepEqual(said(g, p), []));
});
