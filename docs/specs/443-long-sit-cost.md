# 443 — Long sits cost more than short ones

## Issue

#443: the solver charges a flat 30 for every bench stint after the first in a
row, so one long sit costs the same as two short ones, and kids sit 16-20
minutes in a row or play only the first half when a normal-shaped plan with
the same minutes exists. Make long sits cost more as they grow, without ever
making the plan break the change limit.

## Goal

A kid's afternoon has a normal shape: no 20-minute sit, no starter who plays
the first stint and then never again after halftime, when a plan with the
same minutes and the same change limit avoids it. Even minutes stay exactly
as even as today, and the plan never changes more players at once than the
coach allowed because of this.

## Survey

The issue's numbers hold on `d136736` (scratch probe through `generatePlan`,
players `p0`..`pN`, 4x8 every 4 unless said):

- Capped starter (10 players, Starting five p0-p4, p0 capped at 8): p0 plays
  in both halves in 2/30 plans (seeds 1-30). 8 players: 0/30. 2x16 every 4:
  2/30.
- No rules, default change limit 3, seeds 1-20: longest sit with 11 players
  `{12: 14, 16: 2, 20: 4}`; 12 players `{12: 2, 16: 13, 20: 5}`; 12 players
  2x20 every 5 `{15: 2, 20: 13, 25: 5}`.
- Starting five p0-p4, 12 players, seeds 1-30: 44/150 starter cases with 2+
  stints sit half the game or more; 5/210 for the others.
- Cause as stated: `cost()` in `app/engine.js` adds `30` per bench stint once
  the run reaches 2, and nothing else depends on run length.
- SUBS_EXCEEDED, maxSubs 2, 10-12 players, five formats (4x8/4, 2x20/5,
  2x16/4, 4x6/3, 4x8/2), seeds 1-8: today 1 plan of 120 (4x8/2, 10 players,
  seed 6).

Choices the issue did not make, measured in a scratch copy of the engine:

- **The free run length comes from the change limit.** The issue's patch
  charges extra from the 4th stint of a run. Any fixed number broke the
  change limit: with that patch SUBS_EXCEEDED went 0 to 87 of 480 plans
  (every 10-11 player game at maxSubs 2). So a run is free up to
  `max(3, ceil((n - 5) / maxSubs))` stints, the bench queue at the coach's
  change limit, where n is players available. It is also capped below half
  the game, `ceil(S / 2) - 1` stints for S stints (never under 1), because a
  6-stint game otherwise let a kid sit 3 stints, half the game, for free.
- **Each stint past the free length costs 60 times how far past it is**
  (60, then 120, then 180 ...), on top of the existing 30, as the issue's
  patch did. Weights tried: 15, 25, 35, 60, 120. None of them alone kept the
  change limit, because the flat 30 already rewards one extra change; the
  fallback below is what holds it.
- **The change limit is held by a fallback, not a weight.** The solve runs
  with the long-sit charge. If that plan changes more players at some break
  than `maxSubs` (or breaks a cap or minimum; see Design), the solve runs
  again from the same seed without the charge (today's exact search), and
  the plan that breaks them less wins; a tie keeps the long-sit plan. So a plan can never break the
  limit more than today's would, and when the limit forces a long sit, the
  plan keeps today's plan and the "Longest sit" note's advice to allow more
  changes is true.
- **No both-halves reward.** The issue asks for one. Measured as a charge of
  20 or 40 for a kid with 2+ stints who plays in only one half: the capped
  starter case is already 30/30 without it; at 20 it cut the plans the change
  improves from 91 to 69 of 840 (it pushes more plans over the change limit,
  which sends them to the fallback); at 40 six plans got a longer longest sit
  than today. It is left out; the long-sit charge does the job the issue
  wanted it for.
- **Runs are counted in stints, not minutes.** A minutes-based version did
  worse on games with a short last stint (11 vs 4 property failures over 400
  random games). Games whose stints are uneven are outside the property
  below; see Out of scope.
- **A re-plan does not carry the earlier bench run into the charge.** The
  charge counts from the first stint solved, like today's flat 30.

## What would settle it

All through `generatePlan`, players `p0`..`pN` with no tiers, red on
`d136736`, green after:

1. 10 players, 4x8 every 4, Starting five p0-p4, p0 capped at 8
   (`maxMinutes: { p0: 8 }`), seeds 1-30: p0 is on the floor in at least one
   stint of periods 1-2 and one of periods 3-4 in at least 28/30 plans.
2. 11 and 12 players, 4x8 every 4, no rules, maxSubs 3, seeds 1-20: the
   longest unbroken bench run of any player is 12 minutes or less in every
   plan.
3. 12 players, 4x8 every 4, Starting five p0-p4, seeds 1-30: no starter with
   2+ stints on the floor sits half the game (16 minutes or more in a row)
   unless the same seed's no-rule plan has a player with 2+ stints who does.
4. maxSubs 2, 10-12 players, formats 4x8/4, 2x20/5, 2x16/4, 4x6/3, 4x8/2,
   seeds 1-8 (120 plans): every plan with `SUBS_EXCEEDED` is one today's code
   also flags; today that list is exactly `4x8/2, 10 players, seed 6`.
5. `test/engine.test.js` and `test/fuzz.test.js` stay green with every
   existing assertion unchanged, spread assertions included.
6. A new property in `test/fuzz.test.js`: over 300 seeded random games (7-12
   players, 2 or 4 periods of 6-20 minutes, stints that divide the period
   evenly, maxSubs 3, random seed), with Starting five p0-p4: when the
   no-rule plan for the same game has no player with 2+ stints sitting half
   the game or more, the Starting five plan has none either. Measured in the
   scratch copy: 7 failures of 298 checked today, 0 of 312 after.

## Surfaces

- `app/engine.js`: `cost()` (the long-sit charge), `generatePlan` (the free
  run length on `ctx`, the fallback solve). Nothing else in the engine.
- `app/plan-view.js`: the comment above the "Longest sit" note only, if its
  reasoning changes (its measured numbers do). No copy change.
- `test/engine.test.js`, `test/fuzz.test.js`, and the Coach scenario tests
  that pin the sample plan.
- `app/11-player-basketball-rotation-chart.html` and the 12-player page:
  regenerated by `node scripts/charts.mjs`, since they print a solved plan.
- `docs/design-decisions.md`: records that long sits cost more than short
  ones, capped by the change limit (doc-writer).
- Must not change: `app/gamemode.js`, `app/game-setup.js`, `app/team-ops.js`
  (another lane), `state.js`, the platoon path, `finish()`'s notes.

## Constraints

- `engine.js` is one of the four pure modules: this task is explicitly about
  it. No new export is needed; keep the change inside `cost()` and
  `generatePlan`.
- Reuse: the existing `streak` loop in `cost()` carries the new charge; do
  not add a second pass over the lineups for it. Count changes at a break
  the way `cost()` and `finish()` already do (`lineups[i]` ids not in
  `lineups[i - 1]`). `ON_FLOOR` is the five.
- The fallback must reproduce today's search exactly: a fresh `makeRng(seed)`
  for each solve, and the long-sit charge off. With the charge off, cost is
  byte-identical to today's.
- The platoon branch is untouched (no search there).
- Expected values in tests come from this spec, never recomputed the way the
  code computes them.
- Runtime: the fallback only runs when the first plan breaks the change
  limit. Measured: 840 plans took 26.6 s today and 29.5 s after.

## Design

- On `ctx`, a free run length:
  `sitFree = max(1, min(max(3, ceil((n - ON_FLOOR) / maxSubs)), ceil(S / 2) - 1))`,
  with n the available players and S the stints solved.
- In `cost()`'s streak loop, when `ctx.shapeSits` is on and a player's run
  reaches `streak > sitFree`, add `60 * (streak - sitFree)` for that stint,
  as a named constant with a comment saying why it grows.
- In `generatePlan`'s non-platoon branch, wrap greedy and the first local
  search in one solve that makes its own `makeRng(seed)`. Run it with
  `shapeSits` on. If the plan breaks a cap, a minimum or the change limit,
  run it again with `shapeSits` off, and keep that plan only if it breaks
  them less, compared in that order (cap overage, then minimum shortfall,
  then changes over the limit); a tie keeps the long-sit plan. The balance
  pass then runs on the kept plan, continuing that solve's rng, with
  `shapeSits` matching it.

  Amended during the build: the first version decided after the balance
  pass and on the change limit alone. With every existing assertion
  unchanged, that turned three properties red: balance could widen the
  spread and move minutes (a shaped and a flat run took different
  decisions), and a kid capped at one stint sat so long that the charge
  outbid the cap (fuzz scenario 75; a settings test where a capped p0
  played 8 against 6). Deciding before the balance pass, and counting caps
  and minimums, fixed all three.
- Changing the cost changes the sample 11-player plan, so Coach scenario
  tests that pin who plays 12 or who is in a five are re-pinned to the new
  plan; a test whose meaning depended on the old plan gets a fixture change
  that keeps its meaning instead.

## Proof

- `node --test test/engine.test.js`: items 1-4, one test each, through
  `generatePlan` (the engine seam, `AGENTS.md` § Test seams). Item 4's
  today-list is written into the test as data from this spec.
- `node --test test/fuzz.test.js`: item 6, a new `property #443` test with
  its own small generator for even-stint games; items 5 by the existing
  tests.
- Measured before/after for the PR (not a test): the scratch probes in the
  Survey, re-run against the built tree.
  Result on the built tree (same probe, same machine, idle): capped starter
  in both halves 30/30 in all three shapes (was 0/30, 2/30, 2/30); longest
  sit 12, 12 and 15 min in 20/20 games (was up to 20, 20 and 25); starters
  sitting half the game 0/150 (was 44/150); change limit broken 0/480 (was
  1/480); spread unchanged. The probe took 21.1 s against 17.2 s before,
  the cost of the second solve when the first breaks a rule. `npm run
  evals`: 6 passed, 0 failed, 2 not run, as before.

## Out of scope

- Uneven stints (a period that does not divide by the stint length): the
  property is not claimed there; 4 of 400 random uneven games at maxSubs 3
  still had a half-game sit the no-rule plan avoided.
- maxSubs 1-2 with a Starting five: the search still misses a normal shape
  in a few games (2 of 302 random games at maxSubs 1-5).
- The both-halves reward (see Survey).
- Carrying a re-plan's earlier bench run into the charge.
- Any copy change to the "Longest sit" note.
