import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';

/* #540: a kid with Plays at most who has played all of the period so far, and
   whose cap covers the rest of it, finishes it on a change of plan (#535).
   Seam: `resolveRest` (state.js). Eight players, 4 x 9 minutes, a change every
   3 (three stints a quarter, 12 in all, 3 minutes each), the league asks 2
   full periods, Plays at most 12 on p0-p2. */

const IDS = Array.from({ length: 8 }, (_, i) => `p${i}`);
const LEAGUE = { minMinutes: 2, minUnit: 'full' };
function room(cap, at, fn) {
  const maxMinutes = { p0: cap, p1: cap, p2: cap };
  const g = bareGame({
    id: 'g0', seed: 1, periods: 4, periodMinutes: 9, granValue: 3, live: { at: 0, overrides: {} },
    constraints: { ...S.emptyConstraints(), maxMinutes },
  });
  return withTeam(IDS.map(id => player(id)), [g], LEAGUE, () => {
    S.computeAll();
    g.live.at = at;
    S.computeAll();
    return fn(g, S.plans[0]);
  });
}
const five = (r, p, k) => r.overrides[k] || p.stints[k].onFloor;
const playedMin = (g, p, r, id, from) => 3 * S.effectiveStints(g, p).filter((s, k) => (k < from ? s.onFloor : five(r, p, k)).includes(id)).length;

test('a kid with 6 minutes of cap left and 3 minutes left in the quarter is kept on to finish it, and stays under the cap', () => {
  room(12, 5, (g, p) => {
    const eff = S.effectiveStints(g, p);
    assert.ok(eff[3].onFloor.includes('p2') && eff[4].onFloor.includes('p2'), 'the premise: p2 played the first two stints of Q2');
    const r = S.resolveRest(g, p, 5);
    assert.equal(r.ok, true);
    assert.ok(five(r, p, 5).includes('p2'), 'p2 is subbed off with 3 minutes of the quarter to go');
    assert.ok(playedMin(g, p, r, 'p2', 5) <= 12, 'p2 is over the cap');
  });
});

test('a kid whose cap left is less than the rest of the quarter is not kept on to finish it', () => {
  room(12, 5, (g, p) => {
    const eff = S.effectiveStints(g, p);
    assert.ok(eff[3].onFloor.includes('p2') && eff[4].onFloor.includes('p2'), 'the premise: p2 played the first two stints of Q2');
    const before = 3 * eff.slice(0, 5).filter(s => s.onFloor.includes('p2')).length;
    g.constraints.maxMinutes.p2 = before + 2;   // 2 minutes left, and the stint is 3
    const r = S.resolveRest(g, p, 5);
    assert.equal(r.ok, true);
    assert.ok(!five(r, p, 5).includes('p2'), 'p2 has 2 minutes of cap left and is held on for a 3-minute stint');
  });
});
