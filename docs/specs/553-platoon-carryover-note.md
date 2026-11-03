# 553 — Platoon's plan notes stop saying it evens out the day

## Issue

#553: on a later game of the day, a Platoon plan's notes still say its minutes
are "deliberately uneven here to even out the day", though Platoon's fives come
from the units the coach set and earlier games cannot change who plays.

## Goal

A coach planning a later game with fixed fives reads notes that are true: no
sentence about evening out the day, the same notes a first game would get.
Switch the same game to Even, with minutes uneven from earlier games, and the
note about catching kids up comes back.

## Survey (on `3e1eb6b`)

- The note is the engine's `CARRYOVER_ACTIVE` info (`app/engine.js`, the
  `else if (ctx.hasCarryover)` branch in `finish`, around line 2746).
  `ctx.hasCarryover` is true whenever a `carryover` was passed and any
  clamped credit is non-zero. Order never reaches the branch because its
  `SPREAD_ORDER` branch comes first. Platoon does reach it. Claim holds.
- `app/state.js` `computeAll` → `solveDay` builds
  `carry = (g.useCarryover && any) ? { ...cum } : null` and passes it to
  `generatePlan` as `carryover`. It does not consult `evensOutDay`.
- `evensOutDay(g, i)` (`app/state.js`) is
  `i > 0 && g.useCarryover && !fivesAreSet(g.strategy)`; since #552 it is
  false for Platoon and Order. It is what the summary line, the sentence's
  second line and the Plan sheet's switch read.
- Other readers of `carry`: only the plan cache signature (`rest` in
  `solveDay`). The season targets (`seasonTargetsFor`) read `deficitOf`, the
  tie-break priority reads `priorityOf`, the day totals read `effectiveMinutes`
  and `cum` itself still accumulates every game: none of them read `carry`.
  `app/plan-view.js` reads the `CARRYOVER_ACTIVE` issue to add
  "· uneven on purpose to balance the day" to the spread line, so that phrase
  goes away for Platoon with the note, as it should.
- Inside the engine `credit` feeds only the minute targets the search aims at
  and `hasCarryover`. Platoon's fives come from `platoonLineups` and Order's
  from the order, so neither should move. The fingerprints below prove it
  rather than trusting this reading.

## What would settle it

1. A Platoon game 2 of a day, switch on, game 1 left someone out (so the
   carryover is uneven): its plan's `issues` contain no `CARRYOVER_ACTIVE`,
   and the notes under the plan do not contain "even out the day".
2. The same game switched to Even (`balanced`): the notes contain
   "even out the day" again (`CARRYOVER_ACTIVE` is back).
3. Platoon fives are byte for byte the same as before: for `test/platoon-day.test.js`'s
   fixture, the plan with `issues` removed hashes the same as it did on
   `3e1eb6b`. Only `issues` change, plus `targets` (see the build note).
4. Even, By hand, Closers and Order plans are byte for byte the same as before,
   `issues` included: a seeded fingerprint (sha256 of the JSON of game 2's plan
   under each strategy, a day where game 1 sat a player out, switch on)
   recorded on `3e1eb6b` before the change, asserted after. Order's
   fingerprint leaves out `targets` (see the build note).

   **Build note.** The plan also carries `targets`, the minute goals the
   engine aimed at. They are built from the carryover credit, so they move for
   Platoon and Order once the carryover stops reaching the solver. Nothing in
   `app/` reads `plan.targets` (the only other `.targets` reader, in
   `rules.js`, is the season adjustment's own map), and fives, minutes and
   Order's notes do not move. So the Platoon and Order goldens hash the plan
   without `targets`. By hand pins every player, so its fingerprint cannot
   depend on the carryover: it guards that nothing moved, and Even and Closers
   carry the proof that the fixture's carryover is live.
5. A Platoon game 2 plan with the switch on equals the same plan with the switch
   off, `issues` included: the switch no longer reaches the solver under Platoon.

## Surfaces

- Changes: `app/state.js` (`solveDay`'s `carry` line only),
  `test/platoon-day.test.js` (the golden that hashed the whole Platoon plan,
  `issues` included, is now false by design: replaced by items 3 and 5), a new
  or extended test for item 4, a Coach scenario for items 1 and 2.
- Must not change: `app/engine.js` (one of the four pure modules: no engine
  change), `app/plan-view.js`, `app/rules.js`, `evensOutDay` itself.

## Constraints

- One answer decides whether a game evens out the day: `evensOutDay(g, i)`.
  Reuse it in `solveDay`; do not re-derive `fivesAreSet(g.strategy)` or
  `g.useCarryover` there.
- `g.useCarryover` stays stored as it is (#552): switching back to Even must
  bring the carryover back.
- `cum`, `any`, `deficitOf`, `priorityOf` and the season targets keep working
  as now; only what is passed as `carryover` (and so the cache signature)
  changes.
- Do not lower `scripts/coverage.json`.

## Design

In `solveDay`, `day.games.map((g, i) => …)` and
`const carry = (evensOutDay(g, i) && any) ? { ...cum } : null;`. Platoon and
Order then get `carryover: null`, exactly as a first game does. Order's plan
does not change (its `SPREAD_ORDER` note wins already); Platoon's `issues` lose
`CARRYOVER_ACTIVE` and get whatever note a first game gets.

## Proof

- **`node --test` on `state.js`'s plan** (`test/platoon-day.test.js`, through
  `test/state-fixture.js`): items 3, 4 and 5, plus `CARRYOVER_ACTIVE` absent
  for Platoon and present for Even in the plan's `issues`. Goldens for items 3
  and 4 are recorded on the unchanged tree first.
- **Coach scenario** (`test/coach.js`): items 1 and 2, reading `#issues` on
  the game screen: a day whose game 2 is Platoon with the switch on, then
  the same game switched to Even through the Plan sheet.

## What's new

No coach note: #552's entry of 2026-11-02 already tells coaches that a later
fixed-fives game no longer says it evens out the day. This makes the plan's
notes match that entry. A second entry would say the same thing twice.

## Out of scope

- Option 2 (dropping the note in `plan-view.js`).
- Any change to the engine's notes or wording.
