# #438 — Force Together gives the pair most of the game

## Issue

#438 (from the rules review, parent #453). With "Force Together pairs every
stint" on, the engine gives the pair far more than an even share and takes the
minutes from other kids, even though an even plan with the pair together every
stint exists.

## Goal

A coach who forces a pair together gets the same even minutes as without the
rule, with the pair on and off the floor as one, whenever such a plan exists.
A hard pair costs evenness only when no even plan keeps them together.

## Decisions

The ticket is `ready-for-agent`. The survey confirmed every number in it on
today's tree (seeds 1-20 through `generatePlan`): 4x8 every 4 with 10 players,
pair average 21.8 (max 28), lowest other kid 8, a spread above 0 on 18 seeds;
2x20 every 5, pair average 27.3 (max 35); 4x8 every 3 with 12 players, pair
17.9. The soft pair on the same roster gives everyone 16 and keeps the pair
together every stint. The cause is as stated: every local-search move changes
one player at a time, and taking one of a hard pair off a stint costs 400 a
minute before the partner can follow.

The ticket offers two changes (a paired move, and greedy seating the pair
together) and says the acceptance tests decide. One choice the ticket left
open, made here:

- **Only the paired move is built; greedy is left alone.** A prototype of the
  paired move alone met both acceptance values on all 20 seeds (spread 0, pair
  at 16 and 20, never split). Adding partner-seating to greedy on top changed
  nothing on those two cases and made the 4x8 every 3 case slightly worse (pair
  average 14.1 against 13.8 without it, even share 13.3). The greedy pair bonus
  that is added after the sort is not this ticket's cause once the search can
  move the pair, so it stays as it is.

## What would settle it

1. Through `generatePlan`, 4x8 every 4, 10 players `p0`-`p9`, constraints
   `{ pairs: [['p0','p1']], hardPairs: true }`, seeds 1-20: `spread` is 0, and
   in every stint `p0` and `p1` are either both on the floor or both off.
2. Through `generatePlan`, 2x20 every 5, 10 players, the same hard pair, seeds
   1-20: `minutes.p0` and `minutes.p1` are each within 5 (one stint) of the
   even share, 20.
3. Both tests fail on today's code.
4. A fuzz property in `test/fuzz.test.js`: on a flat roster (no caps, minimums,
   targets, pins, avoids, carryover, rest limit, overtime) with one hard pair
   and stints all the same length, the hard plan's spread is no worse than the
   same input's soft-pair plan when that soft plan already keeps the pair
   together every stint and carries no note above `info` (a soft plan that
   breaks the sub limit to get its spread is a real trade-off, not a search
   failure: seen on 2x20 every 5 with 13 players). Keep it to a few dozen
   inputs so the suite stays fast. (The soft plan is then a legal hard plan, so a hard
   solve that does worse is a search failure, which is this bug.)
5. `test/engine.test.js`, `test/fuzz.test.js` and the rules tests stay green;
   `npm run smoke` passes.
6. `docs/design-decisions.md` (the "Pairs are soft by default" line near 375)
   says a hard pair costs even minutes only when no even plan keeps them
   together.

## Surfaces

Changes: `app/engine.js` (local search only: a new move generator, and
`applyMove`/`undoMove`/`descend`/`localSearch` learning the new move kind),
`test/engine.test.js`, `test/fuzz.test.js`, `docs/design-decisions.md`.

Must not change: `cost()` weights, `greedy()`, `analyzeFeasibility`, the
result shape, soft-pair behavior, or any plan without a hard pair (the new
generator yields nothing unless `ctx.hardPairs` and a pair exist).

## Constraints

- `engine.js` is one of the four pure modules (`AGENTS.md` § Rules); this
  ticket is explicitly about it. Keep the diff to the cause. Another lane
  (#436) edits `engine.js` at the same time, in a different area.
- **Reuse, do not re-derive:** the avoid check is `ctx.avoidSet` with
  `pairKey`; the forced-player check is `forcedByStint[i]`; the minute-neutral
  pass's rule is `ctx.neutralOnly` with equal stint lengths, exactly as
  `exchangeSwaps` applies it. A paired move must respect all three, or it can
  field an Apart pair together, unseat a pinned player, or move minutes in the
  neutral pass.
- The move generators are lazy and an accepted move rewrites the lineup while
  they yield (`swapLegal`'s comment). The new generator re-checks against the
  live lineup before each yield.

## Design

A third generator, `pairSwaps`, put **first** in the move list in both passes.
It yields nothing unless `ctx.hardPairs`, so for every other plan the order
is unchanged in effect. First, not last, is measured: the search spends its
move budget in list order, and with 16 two-minute stints the single and
exchange neighborhoods use up the 4000 moves before a last-place generator
is reached. In the prototype, last place still lost the fuzz property (item
4) on 6 of 100 inputs, all 4x8 every 2; first place lost 0 of 412. For each
pair `[a, b]` and stint `i`:

- **In / out together** (ordinary pass only, since it moves minutes): if both
  are on, swap both out for any two bench players; if both are off, swap them
  in for any two non-forced players on the floor.
- **Trade across two stints**: if both are on in `i` and both off in `j`, trade
  them for two players who are on in `j` and off in `i`. In the minute-neutral
  pass only when `i` and `j` are the same length, as `exchangeSwaps` does.

A move carries its stints and the out/in lists; `applyMove` replaces each out
with its in (and the reverse in `j`), and `undoMove` restores the saved
lineups for every stint the move touched. Legality: every out is on and not
forced in that stint, no in is already on, and the resulting five has no
Apart pair.

## Proof

- `node --test test/engine.test.js`: items 1-3, calling `generatePlan`
  directly (the engine seam, many input cases).
- `node --test test/fuzz.test.js`: item 4.
- `npm run smoke`: item 5. No coach-facing markup changes, so no Coach
  scenario and no look check; the card shows the new minutes through the
  existing rendering.

## Out of scope

- Greedy's pair bonus (see Decisions).
- Soft pairs, and more than one hard pair sharing a player beyond what the
  generator does pair by pair.
- New plan notes or warnings.
