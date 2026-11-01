# 442 — The Rest limit counts across a re-plan

## Issue

#442: a mid-game re-plan, and Next rotation / Even out overtime, break the
Rest limit ("Plays at most N in a row", `maxConsecutive`) with no note,
because the solver never sees the stints played just before the cut.

## Goal

A coach who set "no more than 2 in a row" never gets a kid playing 3 or 4 in a
row because the plan was re-made mid-game. When the limit truly cannot hold,
the plan says so with a `CONSEC_EXCEEDED` note, the same as before tip-off.

## Survey

The issue's claims hold on `f837a8f`:

- `resolveRest` (`app/state.js`) hands `generatePlan` only the open stints of
  the suffix; `greedy()` starts `onStreak` at 0; `longestRun`, `cost()` and
  `finish()` see only the suffix.
- Reproduced through `resolveRest`: 10 players, limit 2, formats 4x8/4,
  2x16/4, 4x8/3, seeds 1-8, a plain re-plan from every stint 1..n-1: 200
  re-plans, 110 player runs over the limit, all 110 crossing the cut, 0
  `CONSEC_EXCEEDED` notes. (The issue says 108; the count method differs, the
  finding is the same.)
- `runEndingAt` (used by `SUBS_EXCEEDED`'s "the Rest limit forced it"
  attribution) has the same blind spot and gets the same fix, so the two
  readers of a run cannot disagree.

Choice the issue did not make: when pinned overtime stints (Keep this five /
Strongest five) sit between the cut and the first open stint, the streak at
the cut counts them too, with the fives `pinFives` gives them. A pinned stint
is played by the time the open one starts, so leaving it out would bring the
bug back one period later. Pinned stints after the first open one are not
handled (the solver already treats the open stints as contiguous; that is
#369's existing shape and is out of scope).

Recorded limit: the `CONSEC_EXCEEDED` note is in `resolveRest`'s issues,
which bench mode's Sit for the rest and swap paths show. The freeze re-plan
(overtime added, roster change underway) does not surface re-plan issues
today (#456: stale and dropped lineup notes).

## What would settle it

Tests red on `f837a8f`, green after:

1. `state.js` seam: 10 players, Rest limit 2, 4x8 every 4, seeds 1-8, a
   `resolveRest(g, p, k)` from every stint `k` in 1..n-1. For every player,
   the longest run over played stints `0..k-1` (from `effectiveStints`)
   followed by the re-plan's stints is at most 2, or the re-plan carries a
   `CONSEC_EXCEEDED` issue naming that player. A run already over the limit
   wholly inside the played stints is not the re-plan's to answer for.
2. Same check for overtime: the game underway at stint 7, `addOvertime(g, 4,
   'next')` and `addOvertime(g, 4, 'even')`, seeds 1-8, counted over the
   regulation and overtime stints.
3. `generatePlan` seam: `streakBefore: { p0: 2 }`, Rest limit 2: p0 is not on
   the first stint, over seeds 1-8.
4. Without `streakBefore`, `generatePlan` output is unchanged (the existing
   engine suite stays green, plus one test: `streakBefore: {}` / absent give
   identical plans).

## Surfaces

- `app/engine.js`: `generatePlan` reads `input.streakBefore`
  (`{ [id]: stints in a row on the floor at the cut }`, default none); greedy
  seeds `onStreak` with it; `longestRun` and `runEndingAt` add it to a run
  that starts at stint 0. `cost()` and `finish()` read runs only through
  those two, so both count it.
- `app/state.js`: `resolveRest` builds `streakBefore` from
  `effectiveStints(g, p).slice(0, k)`, plus the leading pinned stints before
  the first open one, for the available players, and passes it.
- `test/`: the tests above.
- `docs/design-decisions.md`: the Rest limit section says the count carries
  across a re-plan and into overtime.
- Must not change: any UI file; `budget.js`, `storage.js`, `roster.js`.

## Constraints

- `engine.js` is one of the four pure modules: the change is the new input
  only. An absent `streakBefore` must leave every plan byte-identical
  (item 4).
- Reuse `effectiveStints` for what was played; do not read `p.stints` for the
  past (hand swaps change who played).
- Reuse the existing `CONSEC_EXCEEDED` issue and message; no new code or copy.
- One place counts a run: `longestRun` / `runEndingAt`. Do not add a second
  run counter in `state.js` beyond building the streak at the cut.
- `CONSEC_TOO_FEW` / `CONSEC_IMPOSSIBLE` / `CONSEC_MIN_CONFLICT` keep their
  current meaning and suppression rules.

## Design

- `generatePlan`: `ctx.leadOf = id => streakBefore?.[id] || 0`.
- `greedy`: `onStreak[id] = ctx.leadOf(id)` instead of 0.
- `longestRun(lineups, id, lead = 0)`: the run starts at `lead`, and `best`
  only moves when the kid is on the floor, so a past run never counts by
  itself.
- `runEndingAt(lineups, id, end, lead = 0)`: if the run reaches stint 0,
  add `lead`.
- `cost()`, `finish()`'s `CONSEC_EXCEEDED` and `SUBS_EXCEEDED` pass
  `ctx.leadOf(id)`.
- `resolveRest`: trailing run per available id over
  `[...before, ...leading pinned fives]`, only non-zero entries, passed as
  `streakBefore`.

## Proof

- `node --test` on `generatePlan` (engine has many input cases): items 3, 4.
- `node --test` through `state.js` (`resolveRest`, `addOvertime` +
  `computeAll`), as `test/resolve-rest.test.js` and
  `test/overtime-grow.test.js` do: items 1, 2.
- No coach-facing markup changes, so no Coach scenario and no smoke row. The
  preview check re-plans a game with a Rest limit and reads the runs.

## Out of scope

- Keep this five / Strongest five pinned periods breaking the limit (#369
  item 8: the pin wins).
- The number of subs across the cut (`maxSubs` between the last played stint
  and the first re-planned one).
- Renaming the rule (#441).
