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

const sha = o => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const planOf = g => withTeam(IDS.map(id => player(id)), g, {}, () => { S.computeAll(); return S.plans[1]; });
const platoonDay = on => { const d = day(); d[1].useCarryover = on; return d; };
const codes = plan => plan.issues.map(i => i.code);

/* Game 2 of a day where game 1 sat p9 out, under `strategy`, with a fixture
   that makes that strategy valid (a closing group, a rotation order). */
const fixtures = {
  balanced: {},
  minutes: {},
  closers: { constraints: { ...S.emptyConstraints(), closing: { stints: 2, players: IDS.slice(0, 5) } } },
  order: { constraints: { ...S.emptyConstraints(), order: IDS.slice() } },
};
const dayOn = (strategy, on) => [
  bareGame({ id: 'g0', seed: 1, out: ['p9'], useCarryover: false }),
  bareGame({ id: 'g1', seed: 2, strategy, useCarryover: on, ...fixtures[strategy] }),
];

/* #553 GOLDENS: recorded on the tree before #553 changed `solveDay`'s carry
   line (3e1eb6b), game 2 of the day above, switch on.
   - Platoon: the plan with `issues` and `targets` removed.
   - Even, By hand, Closers: the whole plan, `issues` included.
   - Order: the whole plan minus `targets`.
   `targets` is the engine's minute goals; nothing in the app reads it, and for
   Platoon and Order it is the one field besides `issues` that moves, because
   the carryover no longer reaches the solver. Fives do not.
   #572 re-recorded `balanced` and `closers` only: they hash `issues`, and the
   CARRYOVER_ACTIVE note's wording changed (it names who gets more and less). */
const GOLDEN_PLATOON_NO_ISSUES = 'b9652402f6306ffc900654cc317d614f2d259cbfb630a3b14b9403c662a9d728';
const GOLDEN = {
  balanced: '4e1184926c32ce936c3d44f4aa846758623dcdad8ad4c132a761d418e8a5aa38',
  minutes: '166c287277978de921beb954465c52dd252ab5cfbe9b1bfa5b025c61e7c62f9e',
  closers: 'c7711d9c91a0f9e2cc3f3a80888f9253bcc4aea05526daff0c02264a0dacb350',
  order: '0454cc5bef8ea6894f59093a9907e766474f2bedf0363e8d2a8cc6fb3e91a69e',
};

test('Platoon game 2 of a day, switch on and carryover live: the fives are byte for byte as before #553; only the notes and minute goals change', () => {
  const plan = planOf(day());
  assert.equal(plan.ok, true, 'fixture check: the platoon game solves');
  const { issues, targets, ...rest } = plan;
  assert.equal(sha(rest), GOLDEN_PLATOON_NO_ISSUES);
});

test('fixture check: the carryover in that day is live on Even, so the goldens prove something', () => {
  for (const strategy of ['balanced', 'closers']) {
    const on = planOf(dayOn(strategy, true)), off = planOf(dayOn(strategy, false));
    assert.equal(on.ok, true, strategy);
    assert.notEqual(sha(on), sha(off), `${strategy}: carryover on or off should differ, or the golden proves nothing`);
  }
});

test('Platoon game 2: the switch no longer reaches the solver, and the plan carries no CARRYOVER_ACTIVE note', () => {
  const on = planOf(platoonDay(true));
  assert.deepEqual(on, planOf(platoonDay(false)));
  assert.ok(!codes(on).includes('CARRYOVER_ACTIVE'), JSON.stringify(codes(on)));
});

/* Fresh solves, not cache hits: the plan cache keys on the carry, so a hit
   only happens when the carry is equal, and equal carry could not hide a
   difference. Order shares the day's distinct game ids with nothing else. */
test('Order game 2: the switch no longer reaches the solver, on equals off', () => {
  const on = planOf(dayOn('order', true));
  assert.deepEqual(on, planOf(dayOn('order', false)));
  assert.ok(!codes(on).includes('CARRYOVER_ACTIVE'), JSON.stringify(codes(on)));
});

test('Even with the same uneven carryover still carries CARRYOVER_ACTIVE', () => {
  assert.ok(codes(planOf(dayOn('balanced', true))).includes('CARRYOVER_ACTIVE'));
});

test('Even, By hand, Closers and Order plans are byte for byte as before #553', () => {
  for (const strategy of Object.keys(GOLDEN)) {
    const plan = planOf(dayOn(strategy, true));
    assert.equal(plan.ok, true, `fixture check: ${strategy} solves`);
    const { targets, ...noTargets } = plan;
    assert.equal(sha(strategy === 'order' ? noTargets : plan), GOLDEN[strategy], strategy);
  }
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
    assert.equal(S.passSummary(g, 1, S.plans[1]), '10 players · fixed fives · 16 min each');
    g.strategy = 'balanced';
    assert.equal(S.passSummary(g, 1, S.plans[1]), '10 players · even minutes · 16 min each · evens out the day');   // #572: the range is the Platoon plan's, which this test does not re-solve
  });
});
