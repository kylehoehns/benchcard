import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';
import { scenario } from './fuzz-gen.js';

/* ------------------------------------------------------------------ *
 * the promises, over the whole knob space
 *
 * The tests in fuzz-invariants.test.js ask "is the output structurally legal". These ask the
 * different and more important question: does adding a knob quietly cost
 * a coach something they were already relying on? Every one of these
 * runs the same scenario twice -- once with the knob, once without --
 * and compares, so they keep meaning something as the solver is tuned.
 * ------------------------------------------------------------------ */

test('property: a rotation level never moves anyone\'s minutes', () => {
  /* The guard on the tie-break, and the strongest form the claim has: hold
     every other input still, change only the levels, and every player's TOTAL
     comes back byte-identical.

     It is structural, not lucky. The search runs twice -- once with the balance
     term switched off, which is what fixes the totals, and once with it on but
     restricted to exchanges between equal-length stints, which cannot move a
     total. Before that split the minutes term was exactly flat across who plays
     the odd stint and the tiers were left holding the casting vote, so marking
     a child developing quietly cost them four minutes a game.

     Three rosters, because "flat vs lopsided" alone would pass on a solver that
     merely ignored the SHAPE of the tiers rather than the tiers themselves. */
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const dress = f => sc.players.map((p, i) => ({ ...p, tier: f(i) }));
    const base = generatePlan({ ...sc, players: dress(() => 3) });
    if (!base.ok) continue;
    checked++;
    for (const [name, f] of [['lopsided', i => (i % 5) + 1], ['reversed', i => 5 - (i % 5)]]) {
      const p = generatePlan({ ...sc, players: dress(f) });
      assert.ok(p.ok, `scenario ${n}: ${name} roster failed to plan`);
      assert.deepEqual(p.minutes, base.minutes,
        `scenario ${n} (${sc.balance}, ${sc.strategy}): the ${name} roster moved somebody's minutes`);
    }
  }
  assert.ok(checked > 100, `only ${checked} scenarios compared`);
});
