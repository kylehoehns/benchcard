import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { S, bareGame, withTeam, player } from './state-fixture.js';

/* #552: Platoon, like Order, plays the fives the coach set, so minutes from
   earlier games cannot change who plays and the app must not say they do.
   Seam: `evensOutDay` and `passSummary` (state.js), and the plan state.js
   builds for game 2 of a day. */

const IDS = Array.from({ length: 10 }, (_, i) => `p${i}`);
const UNITS = [IDS.slice(0, 5), IDS.slice(5)];

/* Game 1 sits p9 out, so game 2 has a real deficit to carry. Game 2 is Platoon
   with its switch on. */
const day = () => [
  bareGame({ id: 'g0', seed: 1, out: ['p9'], useCarryover: false }),
  bareGame({ id: 'g1', seed: 2, strategy: 'platoon', useCarryover: true,
    constraints: { ...S.emptyConstraints(), units: UNITS } }),
];

test('Platoon game 2 of a day, switch on and carryover live, is planned byte for byte as before #552', () => {
  withTeam(IDS.map(id => player(id)), day(), {}, () => {
    S.computeAll();
    const plan = S.plans[1];
    assert.equal(plan.ok, true, 'fixture check: the platoon game solves');
    // GOLDEN: recorded on the tree before #552 changed `evensOutDay`.
    assert.equal(createHash('sha256').update(JSON.stringify(plan)).digest('hex'), '7d3ad1dfc37e61c8cae345dd15ab4c8e460da780541a7b8b10be7c70c516c9d7');
  });
});

test('fixture check: the carryover in that day is live, not an empty input', () => {
  const plan = on => withTeam(IDS.map(id => player(id)), (() => { const d = day(); d[1].useCarryover = on; return d; })(), {}, () => {
    S.computeAll();
    return JSON.stringify(S.plans[1]);
  });
  assert.notEqual(plan(true), plan(false), 'carryover on or off should differ, or the golden proves nothing');
});

test('a later game on Platoon or Order does not even out the day; the other strategies do', () => {
  for (const strategy of ['platoon', 'order']) {
    assert.equal(S.evensOutDay({ strategy, useCarryover: true }, 1), false, strategy);
  }
  for (const strategy of ['balanced', 'closers', 'minutes']) {
    assert.equal(S.evensOutDay({ strategy, useCarryover: true }, 1), true, strategy);
  }
});

test('the summary of a later Platoon game does not say it evens out the day, and Even still does', () => {
  withTeam(IDS.map(id => player(id)), day(), {}, () => {
    S.computeAll();
    const [, g] = S.team().days[0].games;
    assert.equal(S.passSummary(g, 1, S.plans[1]), '10 players · fixed fives');
    g.strategy = 'balanced';
    assert.equal(S.passSummary(g, 1, S.plans[1]), '10 players · even minutes · evens out the day');
  });
});
