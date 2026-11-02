# 450 — Full periods, everyone plays in each half or period, and the run stepper

## Issue

One pull request for three tickets:

- #450: a league minimum counted in **full periods** (each kid plays N whole
  periods, start to finish).
- #451: an **Everyone plays in** setting (off, each half, each period).
- #452: the Plays at most N in a row stepper reads in quarters or halves under
  "only at breaks", reaches longer limits, and its help says period breaks do
  not reset the count.

## Goal

A coach whose league says "two full quarters" sets that once in Settings, and
every kid plays two whole quarters, with minutes still even. A coach whose
league says "everyone plays in each half" (or "every quarter") sets that once,
and the plan puts every kid on in each one. When either cannot hold, a line up
front says so with the numbers. A coach picking Plays at most N in a row can
enter "3 quarters in a row", sees what it comes to in minutes and in the unit
they think in, and the help tells the truth about breaks.

## Survey

On `f3593a0` (main after #524). Probe `probe.mjs` (scratchpad, not
committed) calls `generatePlan` directly over 7 shapes (4x8/4, 4x8 perPeriod 2,
4x6/3, 2x16/4, 2x20/5, 4x5 breaksOnly, 4x8 breaksOnly) x 7-12 players x seeds
1-20, iterations 1500.

- **#450 holds.** With a minute minimum of N periods' worth (N = half the
  periods) and no other rule: of 560 solvable cases, **400** have a kid with
  fewer than N whole periods (20/20 in every every-N and perPeriod shape at
  7-10 players; breaksOnly is already whole periods). The other 280 (11 and 12
  players) are refused by `MINS_UNSATISFIABLE` today, which is right: 2 x 11
  = 22 > 20.
- **#447 already added a unit picker** (`settings.minUnit`: `min`, `pct`,
  `periods`; `leagueMinFor` in `app/state.js`). Its `periods` unit is minutes
  (2 periods = 16 min in a 4x8), pieced together from part-periods. What #450
  still needs on top: the "whole periods, start to finish" reading, which only
  the engine can hold (pins). It is added as a fourth unit, not a second
  league-minimum control (choice 1).
- **#451 holds.** "Each period": 20/20 plans miss someone in some quarter at
  9-12 players in every 4-quarter every-N/perPeriod shape, and at every size
  under breaksOnly. "Halves": misses only under breaksOnly at 9+ players
  (20/20), at the default 3 changes. Every-N shapes already reach everyone in
  each half because of `HALF_LATE`'s cost and the minute balance.
- **#452 partly holds.** The picker already shows the minutes: since #441 a
  hint line under the stepper reads "2 stints in a row is 8 min."
  (`runHint`, pinned by `test/rules-scenarios.test.js`). The rest holds: the
  stepper stops at 4 (`app/rules.js` `kindControls`), the row and hint say
  "stints" under breaksOnly, and the help (`app/index.html` "Plays at most N
  in a row" and "Sits at most N in a row") says "the whole half" and nothing
  about breaks. `longestRun` ignores periods, as the issue says. #441 renamed
  the rule "Plays at most N in a row"; that name is used.

## Choices the issues did not make

1. **Full periods is a fourth unit in the existing picker**: `full periods`
   (stored `settings.minUnit: 'full'`, range 0-8 like `periods`). The amount
   box is the N. Saved teams have `min`, `pct` or `periods`, so they load with
   the setting off. `periods` keeps meaning minutes. Rule sentence: "Everyone
   plays at least 2 full periods (16 min)".
2. **Tulsa's optional "sits at least one full period" is out of scope** (the
   issue marked it optional).
3. **The engine is told per kid**: `constraints.fullPeriods = { [id]: N }`,
   next to `minMinutes`. `state.js` composes it: the league's N (scaled for a
   late arrival: the scaled league minutes divided by the period length,
   rounded down), lowered so the pinned minutes fit under the kid's cap
   (`floor(composedMinimum / periodMinutes)`), and never more than the
   regulation periods. The minute minimum still composes as for `periods`
   (N x period minutes), so the minute floor and the pins agree.
4. **Which periods** each kid plays is picked once, before the search, by a
   seeded assignment in `engine.js`, and handed to `buildForced` as pins, so
   every reader of pins (feasibility, `pinnedAhead`, `cost`, `missedPinIssues`)
   sees them with no second copy. The assignment, in order of priority: never
   more than 5 pinned in any stint (counting the other pins: starting five,
   last period, closers), never two Apart kids in one period, never more
   pinned minutes than a kid's cap; then a pinned run (in stints, across
   breaks) under Plays at most N in a row, a period longer than the limit on
   its own being picked anyway; then one period in each half where N allows; then the least-loaded period; then a period the kid already plays
   in `input.start` (#449, so a rule edit does not reshuffle); then the seed.
   A kid it cannot place gets a one-step repair (move another kid to a
   period with room); a kid still short is named in a warning
   `FULL_PERIODS_SHORT`. It never makes an error, so a blocked plan is still
   blocked for every seed (`card.js`'s Shuffle note).
5. **Refused up front**: `FULL_PERIODS_TOO_MANY` (error), on a plan that covers
   the whole regulation game (a mid-game re-plan places what fits and names the
   rest with `FULL_PERIODS_SHORT`), when the full periods
   asked for add up to more than the eligible periods x 5. "Everyone plays 2
   full periods needs 22 player-periods (2 x 11 players), but 4 periods have
   room for 20 (4 x 5 on the floor). Lower the number, or count it in
   minutes." It replaces `MINS_UNSATISFIABLE`, which then says the same thing
   in minutes. When kids are owed different numbers, the parenthetical is
   left out.
6. **Platoon** ignores full periods (it applies no pins). A full period missed
   is said like any pin: `FULL_PERIOD_MISSED`.
7. **A period is eligible** when it is regulation and its stints in the list
   add up to the whole period (`format.periodMinutes`). In a mid-game re-plan
   (`resolveRest`) that leaves out the period in progress and any period with
   a hand-chosen stint. A kid's need there is their N minus the whole periods
   they already played start to finish.
   **Amended 2026-11-02 by #535** (in the [533 spec](533-swaps-cap-retry-sit-notes-period-credit.md)):
   the period in progress is no longer always left out. A kid who was on the
   floor for every stint of it so far is offered the rest of it, and it counts
   as one of their periods. A rule that stops that leaves them no credit.
8. **Everyone plays in is a team setting** in Settings, next to Everyone plays
   at least: `settings.playsIn`, `'off'` (default, and what every saved team
   means), `'halves'` or `'periods'`. Control: a three-button segment like
   Players changing at once, "Off", "Each half", "Each period". Rule sentence
   (Plan sheet Rules, counted by `ruleCount`): "Everyone plays in each half",
   or "Everyone plays in every quarter" / "every half" / "every period" by the
   game's period count.
9. **It outranks the change limit**, as the acceptance requires: "each
   quarter" at 4x8 perPeriod 2 with 10 players cannot hold at 3 changes
   (each quarter seats at most 5 + 3 = 8). So, like Sits at most (#441
   `BENCH_SUBS`): a cost of `LATE_WEIGHT` (200) per kid per half or period
   they do not play in, Level-blind, in both passes; and an up-front warning
   `PLAYS_IN_SUBS` when some half or period needs more changes than the limit:
   "With 10 players and 3 changes at a time, Everyone plays in each quarter
   needs 5 changes at some breaks. Allow 5 changes at a time, or turn it off."
   It replaces `SUBS_EXCEEDED`, as `BENCH_SUBS` does. When the clock itself
   cannot seat everyone (a half or period has fewer than n seats: 5 x its
   stints), `PLAYS_IN_TOO_FEW` says so instead: "With 10 players, Everyone
   plays in each quarter cannot hold: a quarter is 1 stint here, 5 spots on
   the floor. Sub more often, or turn it off." The engine input is
   `input.playsIn` (`'halves'` or `'periods'`, anything else is off).
10. **After the fact**: `PLAYS_IN_MISSED` names each kid who still misses one,
    and which ("Ava misses Q3."), unless `PLAYS_IN_TOO_FEW` already said it.
    With the setting on, `HALF_LATE` and `HALF_EARLY` are not said and the
    `LATE_WEIGHT` halftime term is not charged: the setting covers both.
11. **Halves** are split at the regulation midpoint by each stint's end on the
    clock (the reading `stintsBeforeHalftime` makes), worked out from
    `period`, `endSec` and `format.periodMinutes`, so a re-plan suffix splits
    the same way. One exported helper answers "which half or period is this
    stint in" for the engine and `state.js`. In a re-plan, `input.coveredIn`
    (`{ [id]: [group, ...] }`) says who already played in a half or period, and
    those are not charged again.
12. **The run stepper (#452)**, for Plays at most N in a row: max is the
    game's regulation stints minus 1 (at least 1). Sits at most N in a row
    keeps 1-4 (the engine's `MAX_BENCH_LIMIT` advice depends on it; the issue
    is about the Rest limit). For both kinds, under "only at breaks" the
    stepper's label, noun, hint and rule sentence say quarters, halves or
    periods (4, 2, other) instead of stints: "Quarters in a row", "2 quarters
    in a row is 16 min.", "Each player plays at most 2 quarters in a row (16
    min)". The minutes stay in the hint line #441 added (the issue's "show the
    minutes" is already met there).
13. **Help text** (#452): both run rules' help says breaks between periods do
    not reset the count, and no longer says "the whole half". Plays at most
    adds that 1 means the whole five changes at every break.

## What would settle it

Through `generatePlan` (`node --test`), red on `f3593a0` unless marked:

- **A. Full periods.** 4x8 every 4, 8 and 10 players, `fullPeriods` 2 each
  (and `minMinutes` 16 each): every kid is on for every stint of at least 2
  quarters, seeds 1-20.
- **B. Refused.** Same with 11 players: `ok` false, one error
  `FULL_PERIODS_TOO_MANY` whose message has 22 and 20, no
  `MINS_UNSATISFIABLE`.
- **C. Even.** In A, the spread is at most one stint (4) on every seed.
- **D. Each quarter.** 4x8 perPeriod 2, `minMinutes` 16 each, 10 players,
  `playsIn: 'periods'`: every kid is on in every quarter, seeds 1-20.
- **E. Halves.** 4x5 breaksOnly, 10 players, `minMinutes` 10, maxSubs 5,
  `playsIn: 'halves'`: every kid on in both halves, seeds 1-20.
- **F. Subs limit.** E with maxSubs 3: a `PLAYS_IN_SUBS` warning that names 3
  and 5; no `SUBS_EXCEEDED`.
- **G. Off is unchanged** (green on `f3593a0` too): with no `fullPeriods` and
  no `playsIn`, the plans are identical to `f3593a0`'s (lineups and issue
  codes, 126 cases: 7 shapes x 7-12 players x seeds 1-3, held as one digest).
- **H. Too few seats.** 4x8 breaksOnly, 10 players, `playsIn: 'periods'`:
  `PLAYS_IN_TOO_FEW`, no `PLAYS_IN_MISSED`.

Through `state.js` (`test/state-fixture.js`):

- **I. Saved team** (green on `f3593a0` too): `sanitizeSettings({ minMinutes: 2,
  minUnit: 'periods' })` keeps `periods`; no `playsIn` gives `'off'`; junk
  `playsIn` gives `'off'`; `minUnit: 'full'` keeps `'full'`, 12 clamps to 8.
- **J. Composition.** League minimum 2 `full`, 4x8 every 4, 10 players:
  `computeAll` plays every kid 2 whole quarters; the Rules sentence reads
  "Everyone plays at least 2 full periods (16 min)". Switching the unit from
  `periods` to `full` re-solves (the cache signature moves).
- **K. Everyone plays in, composed.** `playsIn: 'periods'` in settings, 4x8
  perPeriod 2, 10 players: every kid in every quarter; Rules reads "Everyone
  plays in every quarter"; `ruleItems(g).length === ruleCount(g)`.
- **L. Re-plan keeps them.** Full periods 2, 4x8 every 4, 10 players, game
  underway at stint 2 (Q2), `resolveRest` from stint 2: every kid still ends
  with 2 whole quarters counting the played Q1. `playsIn: 'halves'`: a kid who
  played in Q1 is not forced on again before halftime, and every kid plays in
  the second half.

Coach seam (`test/coach.js`):

- **M. Settings.** A coach picks `full periods` with 2 and taps Each half.
  After a reopen Settings still shows both, and the game's Plan sheet lists
  both rule sentences.
- **N. Stepper (#452).** At 4x8 every 4, Add a rule, Plays at most N in a
  row: the hint reads "2 stints in a row is 8 min." and the plus button
  reaches 7 (it reached 4 on `f3593a0`); at 6 the hint reads "6 stints in a
  row is 24 min.". At 4x8 breaksOnly the row reads "Quarters in a row" and the
  hint "2 quarters in a row is 16 min.". The saved rule is `maxConsecutive` in
  stints.
- **O. Help (#452).** `app/index.html`'s help for both run rules says a break
  does not reset the count and no longer says "whole half"
  (`test/prose.js`'s `lacks`).

By the orchestrator:

- **P. Probe** re-run: 0 plans with a kid short of full periods among the
  solvable cases; spread no worse than one stint where it was before; 0 kid
  groups missed for "halves" outside the impossible and subs-limited cells
  the up-front lines name.
- **Q. Evals**: 6 passed, 0 failed, 2 not run, as on `f3593a0`.
- **R. Look**: Settings and the Add a rule page at 320 and 390 wide, 16 and
  32px text, long names, scrolled to the bottom: the unit picker with
  `full periods`, the Everyone plays in segment and the stepper row are not
  clipped, every control 48px.

## Surfaces

- **Changes:** `app/engine.js` (assignment, pins, cost term, feasibility
  lines, after-the-fact notes, the group helper); `app/state.js`
  (`leagueMinFor` for `full`, a per-kid full-periods reader, `playsIn`
  reader, `computeAll` and `resolveRest` pass them and put them in the cache
  signature, `ruleCount`/`ruleItems`, run noun helper, `runHint`, a
  rest-limit max helper); `app/storage.js` (`DEFAULT_SETTINGS.playsIn`,
  `MIN_UNIT_MAX.full`, `sanitizeSettings`); `app/teams-view.js` (the segment
  handler and paint); `app/rules.js` (stepper label, noun, max);
  `app/index.html` (the `full periods` option, the Everyone plays in row, help
  text); `app/app.css` only if a row needs it; `test/`, `test/coach.js`.
- **Must not change:** the card; `app/budget.js`, `app/roster.js`; the
  minute-only meaning of `periods`; plans with both settings off.

## Constraints

- `engine.js` is pure and heavily tested: this task is explicitly about it,
  and with both settings off its output must not move by a byte (G).
- **One reader**: every league setting is read through `state.js` helpers
  beside `leagueMinFor`; `test/league-min.test.js`'s guard (nothing outside
  `state.js`, `storage.js` and the settings editor reads `settings.minMinutes`
  raw) stays and covers the new keys.
- **Reuse, do not re-derive:** pins go through `buildForced` (one place says
  what is pinned, #436); stint lengths from `buildStints`/`regulationLens`;
  `composedMinimum` for the cap-and-own-minimum order; `plural`,
  `fmtMinutes`, `periodLabel`; the halftime split `stintsBeforeHalftime`
  makes; `halfReachSentence`'s arithmetic shape for the reach of a half or
  period; `BENCH_SUBS`'s pattern for a rule that outranks the change limit.
- **Cache signature**: `computeAll`'s `rest` must carry the per-kid full
  periods and `playsIn` (`leagueFor` alone is minutes, the same for
  `periods` and `full`).
- Settings writes with `edit('teamSetting')`, like `#maxSubsSeg`.
- Mobile first at 390x844, and 320 with 32px text: 48px targets, a visible
  label (`docs/interface-guidelines.md`).
- Another lane is editing the Closers panel, the timeline name fitting and
  `scripts/smoke/clip-sweep.mjs`: do not touch those.

## Design

1. `storage.js`: `MIN_UNIT_MAX.full = 8`; `DEFAULT_SETTINGS.playsIn = 'off'`;
   `sanitizeSettings` keeps `'halves'`/`'periods'`, else `'off'`.
2. `engine.js`:
   - `normalize` passes `fullPeriods` (avail only, whole numbers >= 0) and
     `fullPins`; `buildForced` pins each `fullPins` kid on every stint of
     their period; `pinGroups` gains the full-periods group.
   - `assignFullPeriods` (choice 4) runs in `generatePlan` before
     `analyzeFeasibility`, skipped for platoon; its pins ride into
     feasibility and the solve on a constraints copy.
   - `analyzeFeasibility`: `FULL_PERIODS_TOO_MANY` (choice 5),
     `PLAYS_IN_TOO_FEW` / `PLAYS_IN_SUBS` (choice 9).
   - `cost`: the plays-in term; `broken` counts it; the halftime term and
     `HALF_LATE`/`HALF_EARLY` step aside when it is on.
   - `finish`: `FULL_PERIODS_SHORT`, `PLAYS_IN_MISSED`; `SUBS_EXCEEDED` steps
     aside for `PLAYS_IN_SUBS`, and names full periods as the reason when
     the pinned entries alone pass the limit.
   - an exported `playsInGroup(stint, format, mode)`.
3. `state.js`: `leagueMinFor` treats `full` as `periods`; `leagueFullFor(g,
   arrivedAt)` and a per-kid composition; `playsInSetting()`;
   `computeAll` and `resolveRest` pass `fullPeriods`, `playsIn`,
   `coveredIn`; signature; `ruleCount`/`ruleItems`/`leagueRuleText`;
   `runNoun(g)` used by `runHint` and the rule sentences; `restLimitMax(g)`.
4. Settings: the `full periods` option; a row "Everyone plays in" with
   `#playsInSeg`; help text for both.
5. `rules.js`: the stepper's label and noun from `runNoun`, max from
   `restLimitMax` for `rest`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `generatePlan` | `node --test`, `test/full-periods.test.js`, `test/plays-in.test.js` | A-H |
| `sanitizeSettings` | `node --test`, `test/storage.test.js` | I |
| `computeAll` / `resolveRest` on a fixture team | `node --test` through `test/state-fixture.js` | J, K, L |
| Coach scenarios | `test/coach.js` driver | M, N |
| help prose | `test/prose.js` `lacks` in a scenario or an existing help test | O |
| Probe, evals, look | orchestrator | P, Q, R |

## Out of scope

- "Sits at least one full period" (Tulsa).
- Per-half minute minimums (York 16U, Salem), as #451 says.
- Period breaks resetting the run count (the help says they do not).
- Sits at most N in a row's range.
- Any change to the card.
