# 437 — A re-plan that refuses over a pin keeps the past

## Issue

#437: a late arrival or a departure mid-game can rewrite stints already
played when a kid with a Plays at most cap is also fixed to a stint (Starts
the last period, or the closing group). Drop the pin that cannot hold, warn,
and never rewrite the past.

## Goal

A coach whose kid has used up their Plays at most minutes marks a late kid
here, or a kid out. The stints already played stay exactly as they were. The
rest of the game is re-planned without holding the capped kid to their fixed
stint, and the coach is told once, by name.

## Survey (on 2277670, after #412 and #436 merged)

- **The cause holds.** `resolveRest` (`app/state.js`) reduces each cap by the
  minutes played but keeps `lastPeriodFive` and `closing` as set. The engine
  places `lastPeriodFive` on the first *remaining* stint of the real last
  period. When the suffix starts after that period's first stint, the capped
  kid is pinned again, the engine refuses (`FORCED_OVER_CAP` /
  `PINS_OVER_CAP`), `freezePlayedAndReplan` returns false and the #134
  fallback in `syncOverrides` shows a fresh whole-game plan.
- **The issue's stint numbers no longer reproduce.** #436 (merged after the
  issue was written) makes the plan keep p0 on Q4's first stint. Probe on
  this tree, 9 players, 4x8 every 4, cap p0 8, Starts the last period [p0],
  seeds 1-8:
  - arrival of p8 at stints 1-5 and 7: 0/8 moved. **At stint 6: 8/8 moved.**
    Seed 1: Q1 8:00 goes from `p2 p4 p5 p6 p7` to `p1 p2 p4 p5 p7`, and
    Q1 4:00 to `p1 p2 p3 p6 p8` (p8 was not there).
  - departure of an on-floor kid (not p0) at stints 1-6: 0/8. **At stint 7:
    8/8 moved.**
  - Stint 6 is Q4's first stint: p0 plays it, the re-plan starts at 7, and
    the engine pins p0 onto 7 with 0 cap left.
  - **Choice:** the acceptance tests use the stints that reproduce today
    (arrival at 6, departure at 7) and keep the issue's own stints (arrival at
    4, departure at 6) as tests too. Those already pass; they stay as guards.
- **By hand and Platoon still rewrite the past by design** (spec 247 test E:
  `resolveRest` refuses those strategies, #134 runs). Probe: By hand, p8
  arriving at stint 4 shows p8 in Q2 on 8/8 seeds. The issue's "never shown
  on the floor before they arrived" cannot hold there without changing spec
  247's decision. **Choice:** this change covers the strategies the freeze
  re-plans (everything but By hand and Platoon). By hand is filed as a
  follow-up issue.

## What would settle it

Through the `state.js` seam (`computeAll` + `setAvailable`), each red on
today's code except where noted:

1. 9 players p0-p8, 4x8 sub every 4 (8 stints), Even, cap p0 8, Starts the
   last period [p0], p8 out. At `live.at = 6`, p8 arrives: stints 0-5 are
   byte-identical (`effectiveStints(...).slice(0, 6)` fives) to before, on
   seeds 1-8. Same at `live.at = 4` (passes today; kept as a guard).
2. Same game with p8 in. At `live.at = 7`, an on-floor kid other than p0 is
   marked out: stints 0-6 unchanged, seeds 1-8. Same at `live.at = 6`
   (guard).
3. In case 1 at stint 6, the re-plan's `resolveRest` result carries a
   warning (`severity: 'warn'`) whose `playerIds` is `['p0']` and whose
   message names p0's call name and says the Starts the last period rule is
   dropped because Plays at most is used up. Same for a closer (Closers
   strategy, closing group containing a capped kid whose cap is spent).
4. When the re-plan of the remaining stints still refuses after that, it
   retries once with every fixed group cleared (Starts the last period and
   closing), warns naming the kids it stopped holding, and only then falls
   back to #134.
5. The coach is told once, for the game on screen, in the same toast
   machinery #412 uses: ` Not enough minutes left to keep {names} fixed to a
   stint.` (case 3) and ` Could not keep {names} fixed to a stint.` (case 4),
   names are call names joined with `joinNames`. One Coach scenario through
   `test/coach.js` shows the case 3 sentence after the arrival in bench
   mode.
6. Fuzz property in `test/fuzz.test.js`: random games (5-11 players, random
   caps, Starts the last period, Closers, Together/Apart), strategies other
   than By hand and Platoon, random `live.at`, then a random `setAvailable`
   (arrival or departure). Every stint before `live.at` is unchanged. Fixed
   seed, bounded case count, runs in under 5 s.

## Surfaces

- Change: `app/state.js` (`resolveRest`, `replanRest`, a read-and-reset
  notice beside `satShortBench`), `app/render.js` (append the notice where
  #412's `notKept` is appended), tests (`test/played-stints.test.js` or a new
  `test/replan-pins.test.js`, `test/fuzz.test.js`, a Coach scenario),
  `docs/` via doc-writer.
- Must not change: `app/engine.js` (pure; its refusals are what this reads),
  `scripts/smoke*` (another lane is editing them).

## Constraints

- **Reuse the engine's judgement, do not re-derive it.** Which kid a pin
  cannot cover is what `generatePlan` already reports as `FORCED_OVER_CAP` /
  `PINS_OVER_CAP` with `playerIds`. Drop exactly those ids from
  `lastPeriodFive` and `closing.players` on the cloned `c` and solve again;
  do not recompute pinned minutes in `state.js`.
- **Reuse #412's notice shape**: a module-level map by game id, read-and-reset
  like `satShortBench`, called from `render.js` next to it. One toast, never
  two.
- The past is never written: `resolveRest` still returns fives for `k..n-1`
  only.
- The four pure modules are untouched.
- `gamemode.js`'s sit flow also calls `resolveRest`: a sit that used to be
  refused only for `FORCED_OVER_CAP`/`PINS_OVER_CAP` now succeeds with the
  warning. The clear-all retry (case 4) lives in `replanRest`, not
  `resolveRest`, so a sit keeps its other refusals.
- Copy: American spelling, coach's rule names (Plays at most, Starts the last
  period), call names.

## Design

1. `resolveRest`: after the existing solve (and its sit retry) refuses with
   any `FORCED_OVER_CAP`/`PINS_OVER_CAP` error, remove those players from
   `c.lastPeriodFive` and `c.closing.players`, solve again, and on success
   add a `warn` issue per dropped kid, code `PIN_CAP_USED`, to the returned
   `issues`, and return the dropped ids (e.g. `pinsDropped: [...]`).
2. `replanRest`: if the re-plan still refuses, retry once with every fixed
   group cleared (passed to `resolveRest` as an option), recording the kids
   who were in those groups and available. Return the result with the
   dropped ids and which case.
3. `freezePlayedAndReplan` / the #134 path keep calling `replanRest`; the
   dropped names go into the notice map for the game.
4. `render.js` appends the sentence after `notKept`, the same way.

## Proof

| Seam | Covers |
| --- | --- |
| `node --test` on `state.js` (`computeAll`, `setAvailable`, `resolveRest`) | 1, 2, 3, 4 |
| Coach scenario via `test/coach.js` (bench mode, Here now) | 5 |
| `node --test test/fuzz.test.js` property | 6 |
| `scripts/look.mjs` at 320/390, 16/32px, long names | the toast fits |

## Out of scope

- By hand and Platoon rewriting the past on an arrival (spec 247 E). Filed as
  a follow-up.
- Whether Starts the last period should apply at all once Q4's first stint is
  played. The engine's suffix rule stays as is.
