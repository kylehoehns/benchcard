# 537 — One count of sitting: late arrivals and overtime; a capped kid finishes the period

Three engine tickets shipped as one batch: #537, #540 and #541. Each keeps its
own section under **What would settle it**. #537 and #541 share one design,
because both are about how bench time is counted.

## Issue

- **#537** — A kid who walks in late is counted as sitting for the stints
  before they arrived. The Longest sit note reads that, and maybe the On the
  bench column too.
- **#540** — With full-period minimums, a change of plan partway through a
  period keeps a kid on to finish it (#535), except when the kid's Plays at
  most leaves enough to finish this period but not a whole new one.
- **#541** — The Sits at most warning counts overtime. Decide whether overtime
  counts, write it down, and make the warning, the Longest sit note and the
  solver agree with no second way of counting.

## Goal

- A kid who walks in late is never shown or counted as sitting before they got
  there: not in the On the bench column, not in the Longest sit note, not in
  their timeline detail, not in the sits-in-a-row warning.
- Overtime is extra time the Sits at most limit was never set for. A kid who
  sits at the end of the fourth quarter and again in overtime is not warned
  about, and the planner does not rush them on in overtime to meet the limit.
- A kid with a Plays at most limit who has played all of the current period so
  far finishes it when the limit covers the rest of it.

## Survey (on `main` 37375dc; probes in the lane scratchpad, not committed)

### #537

- Reproduces. 9 players, `p8` out and late, 4x8 every 4, seed 1, `live.at` 4,
  `setAvailable(g, 'p8', true)`: `live.arrived = { p8: 4 }` and the bench
  pattern from `effectiveStints(...).sitting` is `BBBBBBFB`.
- Cause: `effectiveStints` (state.js) rebuilds `sitting` for every stint with
  an override as "available and not on the floor", and the late kid is
  available now. Only two places read `sitting`: the plan grid's On the bench
  column and `longestSit` (plan-view.js). The timeline detail's Longest sit
  (timeline.js `renderPinned`) counts "not on the floor", so it has the same
  bug. Bench mode has no sit count (its bench rows show minutes played).
- `benchNotes` (state.js, #534) already skips a late kid's stints up to the
  one they walked in during, reading `live.arrived` as recorded.
  `resolveRest`'s `sitBefore` (#441) does its own late cut with
  `lateArrivals(g, p, k)`. That is two late cuts and three run counts today.

### #540

- Reproduces. Sweep: 4x9 every 3, 8-10 players, seeds 1-20, Plays at most 12,
  15, 18, 21 or 24 on `p0`-`p2`, league minimum 2 full periods, change of plan
  (`resolveRestRelaxing`) from stints 4, 5, 7, 8, 10, 11. Of **1133** capped
  kids who had played every stint of the period so far, owed a full period,
  and had cap left at least the rest of the period but under a whole period,
  **365** were subbed off before it ended.
- Example: 8 players, seed 1, cap 12, from stint 5: `p2` has no whole period,
  6 minutes of cap left, 3 minutes left in the period, and is subbed off.
- Cause: `resolveRest` clamps the full periods owed to
  `floor(capLeft / periodMinutes)`, which is 0 here, so the kid is not in
  `fullLeft` and never becomes a `fullFinish` candidate. The engine's `can`
  already checks the cap against the stints actually added.

### #541

- Reproduces. 9 players, Sits at most 1, 4x8 every 4, `live.at` 7, a 4-minute
  overtime with Keep this five: `benchNotes` warns 4 kids "sits 2 stints in a
  row" in seeds 1, 2 and 3. Strongest five and Next rotation also produce some.
- The engine counts bench runs over every stint it is handed, overtime
  included, in five places: `broken`, `cost`, `greedy`'s due-on rule, the
  `BENCH_EXCEEDED` note and the `SUBS_EXCEEDED` attribution. The
  `BENCH_TOO_FEW` / `BENCH_SUBS` arithmetic counts `stints.length`.
- Overtime is always after regulation (`buildStints`), so "does not count and
  does not reset" is the same as "count regulation stints only".

## Choices the issues left open

1. **#541: overtime does not count toward Sits at most, and does not reset
   it.** The issue's suggestion. Since overtime always comes last, the count
   is over regulation stints only. It applies everywhere sitting is counted:
   the warning, the Longest sit note, the timeline detail's Longest sit and the
   solver. The On the bench column still lists who is on the bench in
   overtime: it is a list, not a count.
2. **#537: a late kid is cut by `live.arrived` as recorded**, not by a fresh
   `lateArrivals` call. Every freeze already prunes the record with
   `lateArrivals` (`freezePlayedAndReplan`), so the two agree after any
   re-plan. The one case they differ (a kid swapped on during the very stint
   they walked in during, before any re-plan) is pinned by a #534 test that
   counts them only after it. `resolveRest`'s `sitBefore` moves to the same
   reading. Its other uses of `lateArrivals` (fair shares, minimums) are
   unchanged.
3. **#537: the On the bench column is fixed too.** It is the same `sitting`
   value. A late kid's cell is empty before they arrived, as for a kid who is
   out.
4. **#540: credit only when the kid finishes,** as #535. A kid whose cap left
   covers the rest of the period is offered it; whole periods after that are
   still limited by what the cap has left once the finish is paid for.

## What would settle it

### #537 (late arrivals)

- The issue's fixture (9 players, `p8` late, 4x8 every 4, seed 1, arrival at
  stint 4 through `setAvailable`): no stint at or before 4 lists `p8` in the
  counted `sitting`, and the Longest sit note names a run for `p8` of at most
  the stints after 4. Red today (`BBBBBBFB`, a 6-stint run).
- Coach seam: a coach marks a late kid arrived mid-game and opens the plan; the
  On the bench column has no late kid before the arrival stint, and the Longest
  sit note's minutes are no more than the longest sit counted by hand from the
  stint after the arrival. The kid's timeline detail Longest sit agrees. Red
  today.
- Games with nobody late: `sitting`, the Longest sit note and `benchNotes` are
  unchanged over seeds 1-20 and the three shapes 4x8/4, 4x6/3, 2x10/5.
- Sweep (3 shapes, 7-10 players, seeds 1-10, every arrival stint): games where
  the Longest sit for the late kid counts time before they walked in. Before:
  **560 of 560** on 37375dc. After: **0**.

### #540 (cap covers the rest of the period)

- State seam, red today: 8 players, 4x9 every 3, seed 1, league minimum 2 full
  periods, Plays at most 12 on `p0`-`p2`, `live.at` 5, change of plan from 5:
  `p2` is on stint 5 (finishes the period) and stays at or under 12 minutes.
- A kid whose cap left is less than the rest of the period is not kept on by
  this rule.
- Games with no Plays at most limit: `resolveRest` overrides byte-identical to
  today over seeds 1-20, the #535 sweep shapes and cut points.
- The sweep above: 365 of 1133 falls to 0, or to cases a rule explains (Apart,
  five on the floor, Plays at most N in a row); the PR quotes the after number.

### #541 (overtime)

- State seam, red today: 9 players, Sits at most 1, 4x8 every 4, seeds 1-3,
  `live.at` 7, `addOvertime(g, 4, 'keep')`: `benchNotes` gives no warning for a
  kid whose run over regulation is within the limit.
- Coach seam: the same game played through bench mode, overtime added with
  Keep this five; the plan's notes have no "sits ... in a row" note. Red today.
- Engine under `node --test`: a plan with overtime stints and `maxBench` puts
  out no `BENCH_EXCEEDED` caused only by overtime stints, and the greedy pass
  does not bring a kid on in overtime because of Sits at most.
- Games with no overtime: `generatePlan` output byte-identical to today over
  seeds 1-20, with and without `maxBench`, the three shapes.
- Sweep (3 shapes, 7-10 players, Sits at most 1 and 2, seeds 1-6, overtime
  Keep / Strongest / Next / Even): games with a Sits at most warning caused by
  overtime. Before: **170 of 576** on 37375dc. After: **0**.

### All three

- `test/engine.test.js`, `test/fuzz.test.js` stay green; `npm run evals` no
  worse than 6 passed, 0 failed, 2 not run.

## Surfaces

- Change: `app/engine.js`, `app/state.js`, `app/plan-view.js`,
  `app/timeline.js`, new tests under `test/`, `scripts/whats-new.json` and its
  generated `app/whats-new.html`, `app/sitemap.xml` (whats-new `<lastmod>`),
  docs.
- Do not touch: `scripts/redirect-check.mjs`, `scripts/smoke/hardwood-pages.mjs`
  (lane #542 edits them).

## Constraints

- The four pure modules stay pure. The engine never learns about late
  arrivals; it is told the run at the cut (`sitBefore`), as now.
- **Reuse, do not re-derive — one count of sitting:**
  - **Which stints count** lives in one engine export (name may change):
    `benchSpan(stints)`, the number of stints before the first overtime stint
    (`isOvertimeStint`), `stints.length` when there is none. Every bench-run
    count in the engine reads it; so does state.js. No other test for
    overtime in a sit count.
  - **Who sits at a stint** lives in one state.js export (name may change):
    `benchStints(g, p)`, `effectiveStints` with each stint's `sitting` less a
    kid who walked in late (`live.arrived`), up to and including the stint
    they walked in during. Returns `effectiveStints`'s array untouched when
    nobody is late. The On the bench column reads it.
  - **The stints a sit run is counted over** is
    `sitStints(g, p) = benchStints(g, p).slice(0, benchSpan(p.stints))`, and
    `benchNotes`, the Longest sit note (`longestSit`), the timeline detail's
    Longest sit and `resolveRest`'s `sitBefore` all count over it, reading
    `sitting`. `longestSit` stays the minutes counter and `longestRun` /
    `runEndingAt` the stints counter; neither is copied.
  - `benchNotes` loses its own late cut; `resolveRest`'s `sitBefore` loses its
    own late cut and its own `lead` read for the bench.
- `effectiveStints` itself is unchanged (26 callers, and `lateArrivals` reads
  it).
- An absent overtime keeps every engine call byte-identical (measured). An
  absent Plays at most keeps every `resolveRest` byte-identical (measured).
- Full-period pins stay in `assignFullPeriods`; the #540 fix is in
  `resolveRest`'s `fullLeft` clamp only.
- Coach-read text is plain words (ship-feature's What's new rule). No new note
  text.

## Design

### #537 #541 — the one count

- engine.js: export `benchSpan(stints)`. In `broken`, `cost` and `finish`
  (`BENCH_EXCEEDED`), count `longestRun(lineups.slice(0, span), ...)`. In
  `greedy`, the due-on rule runs only for `s < span` (`sitStreak` and its
  scoring are left as they are, so games with no Sits at most do not move). In
  the `SUBS_EXCEEDED` attribution, `bench` is counted only for `i < span`. The
  `BENCH_TOO_FEW` / `BENCH_SUBS` arithmetic and line ~2324 use `span` for `S`.
- state.js: `benchStints(g, p)` and `sitStints(g, p)` as above.
  `benchNotes` counts `longestRun(sitStints(g, p).map(s => s.sitting), id, 0,
  true)`. `resolveRest`'s `sitBefore` is the run of `sitting` ending at the
  last of `sitStints(g, p).slice(0, k)`.
- plan-view.js: the grid's On the bench cell reads `benchStints`; the Longest
  sit note calls `longestSit(sitStints(g, p), ids)` (its `gameMins` follows).
- timeline.js: the detail's Longest sit is
  `longestSit(sitStints(g, p), [id]).minutes`. Longest run is unchanged.

### #540

- `resolveRest`: for a `fullFinish` candidate (the #535 conditions: mid-period
  cut, on every stint of q so far, owes a period, fits Plays at most N in a
  row), the cap clamp becomes "finish q, then whole periods from what is left":
  `1 + floor((capLeft - restOfQ) / periodMinutes)` when `capLeft >= restOfQ`,
  where `restOfQ` is the minutes of q's open stints. Everyone else keeps
  `floor(capLeft / periodMinutes)`. The engine's `can` still checks the cap.

## Proof

| Seam | Covers |
|---|---|
| State seam (`test/state-fixture.js`, like `test/bench-notes.test.js` and `test/full-finish.test.js`) calling `setAvailable`, `addOvertime`, `resolveRest`, `benchStints`, `sitStints`, `benchNotes` | #537 fixture and no-late identity, #540 fixture, cap-short case and no-cap identity, #541 fixture |
| Coach seam (`test/coach.js`): a late kid marked arrived, then the plan's On the bench column, Longest sit note and timeline detail; overtime added with Keep this five, then `text('#issues')` | #537, #541 |
| `generatePlan` under `node --test` with overtime stints and `maxBench`, plus byte-identity with no overtime | #541 solver |
| `test/engine.test.js`, `test/fuzz.test.js`, `npm run evals`, the lane's before/after sweeps | no regression, the measured numbers |

## Out of scope

- A kid sat for the rest still counts in the Longest sit note (unchanged).
- Overtime for full-period credit (it never counted).
- The timeline detail's Longest run (play runs) and Plays at most N in a row
  in overtime.
