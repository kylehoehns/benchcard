# 533 — Swaps take the cap retry; sit-in-a-row notes follow the plan; a period in progress counts

Three engine tickets shipped as one batch: #533, #534 and #535. Each keeps its
own section under **What would settle it** and **Design**.

## Issue

- **#533** — The This stint swap and Sit for the rest skip the cap retry a
  change of plan uses (#490, shipped in #524), so they refuse or skip the
  re-plan where a change of plan would work. Also: a pinned overtime five can
  show `CAP_RELAXED` and `PIN_BREAKS_RULE` for one broken cap.
- **#534** — The "Longest sit" note, and any "sits N in a row" wording, may
  still show the old plan after a swap. Check first; fix if real.
- **#535** — A change of plan partway through a period gives no full-period
  credit (#450) to a kid who has played every stint of it so far, so the
  planner may sub them off and look for two other whole periods.

## Goal

- A coach who sits a kid for the rest, or swaps one in for this stint, gets a
  plan back in the same spots a change of plan gives one, and the plan says who
  ends up over their Plays at most. One note per kid for one broken cap.
- After any swap, the plan's warning about a kid sitting too many stints in a
  row describes the lineups on screen.
- A kid who has played all of a quarter so far, when the coach changes the plan
  mid-quarter, can finish it, and it counts as one of their full periods.

## Survey (on `main` 5948ac2, probes in the lane scratchpad, not committed)

### #533

- Sweep: 300 seeds, 6-7 players, 2-3 kids with Plays at most, shapes 2x7 every
  3, 4x6 every 3, 4x8 every 4, 2x10 every 5. **Sit for the rest** was refused
  with `CAPS_UNSATISFIABLE` in **112 of 129** refusals. The **This stint**
  re-plan was refused with `CAPS_UNSATISFIABLE` in **27 of 105** swaps; the swap
  is then kept alone and the rest of the game is not re-planned.
- Small fixture: 6 players `p0`-`p5`, 4x8 every 4 (8 stints), seed 1234, Plays
  at most 16 on `p0` and `p1`. At `live.at` 1, 2 and 3, sitting any kid on the
  floor other than `p0`/`p1` is refused `CAPS_UNSATISFIABLE`, and swapping the
  capped kid who is off in for one who is on (This stint) is refused
  `CAPS_UNSATISFIABLE`.
- `replanRest` (app/state.js ~1719) already retries with `relaxCaps: true` on
  `CAPS_UNSATISFIABLE`. `applySwap` (app/gamemode.js ~1025) and `sitRest`
  (~1098) call `resolveRest` directly.
- The double note reproduces: 10 players (tiers 3,5,5,1,1,4,4,4,2,2), 4x8 every
  4, seed 1, Apart `p1`/`p2`, One of two on `p3`/`p4`, Plays at most 16 on `p1`,
  `live.at` 7, `addOvertime(g, 4, 'strongest')`. The plan shows both
  "Strongest five gives p1 20 minutes; Plays at most is 16." (`PIN_BREAKS_RULE`)
  and "This game puts p1 over Plays at most 16." (`CAP_RELAXED`).

### #534

- The "Longest sit" note (app/plan-view.js ~248) and the timeline detail
  (app/timeline.js ~481) both read `effectiveStints`. **They are current after
  every swap.** That part of #534 does not reproduce.
- The engine's `BENCH_EXCEEDED` note ("X sits N stints in a row against a limit
  of L — no legal lineup kept them under it.", engine.js ~2261) **is** stale:
  #519 rebuilt `CONSEC_EXCEEDED` from the shown fives but never touched this
  one. Sweep (8-11 players, Sits at most 1 or 2, seeds 1-5, `live.at` 2): a kid
  shown sitting past the limit with no note after a This stint swap in **18 of
  40** games, after a Rest of game swap in **33 of 40**, after Sit for the rest
  in **3 of 40**. A re-plan's own notes are never kept, so its over-limit runs
  never show either.
- Bench mode and the card carry no "in a row" wording; only the plan's notes
  list does.
- Separately found, out of scope: after a mid-game arrival, `effectiveStints`
  lists the late kid on the bench for the stints before they arrived, so the
  Longest sit note counts that time. Filed as a follow-up.

### #535

- Sweep: 4x9 every 3 (3 stints a quarter), 8-10 players, seeds 1-20, league
  minimum 2 full periods (`minMinutes: 2, minUnit: 'full'`), change of plan
  from mid-period stints 4, 5, 7, 8, 10, 11. Of **1711** kids who had played
  every stint of the period so far, **632** were subbed off before it ended.
- Fixture: 9 players `p0`-`p8`, 4x9 every 3, seed 1, league minimum 2 full
  periods, `live.at` 8, change of plan from 8. `p1` has one whole period and
  played stints 6 and 7 of Q3; today the re-plan benches `p1` at stint 8 and
  gives them all of Q4.
- Cause: `eligiblePeriods` drops the period in progress, and `resolveRest`'s
  `wholePlayed` counts only periods the played stints cover whole.

## Choices the issues left open

1. **#533 reverses choice 4 of the #489 spec** ("a sit or a swap still
   refuses"). That was a scope cut, and #533 asks for the opposite. The swap
   and the sit now retry the same way a change of plan does.
2. **#533: no new toast wording.** The existing toasts stay ("... The rest of
   the game was re-planned to keep minutes even." for This stint). The cap note
   on the plan says who went over, as it does after a change of plan.
3. **#533: which of the two notes stays.** `PIN_BREAKS_RULE` stays, because it
   names the cause (the overtime five). `CAP_RELAXED` leaves out any kid that a
   pinned-five cap note already names. Other kids over their cap still get it.
4. **#534: the Longest sit note was current, so the fix is the
   `BENCH_EXCEEDED` note.** Read as "any 'sits N in a row' wording on the
   plan", which the issue asked to check. The proving scenario for the Longest
   sit note is kept and is green on today's code; the PR says so.
5. **#535: credit only when the kid finishes.** A kid on every stint so far is
   offered the rest of the period first. If a rule stops it (five on the floor,
   Apart, their cap), they get no credit for it, as today.
6. **#535: only kids who still owe a full period are kept on.** A kid already
   at the league's number is not held on to finish a period they do not need.

## What would settle it

### #533 (cap retry)

- Fixture (6 players, 4x8 every 4, seed 1234, Plays at most 16 on `p0`, `p1`,
  `live.at` 1): **Sit for the rest** of a non-capped kid on the floor ends with
  that kid on the bench for every stint left, and the plan's notes include
  `CAP_RELAXED`. Red today: refused, nothing changes.
- Same fixture: **This stint** swap of the capped kid who is off for a
  non-capped kid on the floor re-plans the rest (later stints change, and the
  This stint toast says the rest was re-planned). Red today: swap kept alone.
- A change of plan in the same spot still ends with a plan and `CAP_RELAXED`
  (green today; kept as the comparison).
- With no Plays at most anywhere, `resolveRest` and the new path give the same
  result over seeds 1-20 and the four shapes above.
- Double-note fixture above: exactly one note names `p1`'s cap (the
  `PIN_BREAKS_RULE` one); no `CAP_RELAXED` names `p1`.

### #534 (sit-in-a-row note)

- A game with Sits at most N where a This stint swap, a Rest of game swap, or
  Sit for the rest leaves a kid shown sitting more than N in a row: the plan's
  notes include "X sits K stints in a row against a limit of N — no legal
  lineup kept them under it." with K the longest run on screen. Red today.
- A shown run within the limit gets no such note, even when the engine's plan
  had one (the old note is removed). Red today if a fixture has one; the
  developer looks for one in the sweep.
- Kids sat for the rest get no note. A kid who arrived late is counted only
  from the stint after the one they walked in during. Nothing when the engine
  said `BENCH_TOO_FEW`.
- The Longest sit note after This stint, Sit for the rest and a change of plan
  matches the longest run on screen. Green today, kept as proof.

### #535 (period credit)

- Fixture above (9 players, seed 1, from 8): after the change of plan, `p1` is
  on stint 8 (finishes Q3), and is not forced into all of Q4. Red today.
- The issue's own example: a kid with no whole period yet, league minimum 2,
  who played stints 6 and 7 of Q3 (set up with hand swaps on earlier stints).
  After a change of plan from 8, they finish Q3 and end with 2 whole periods
  (Q3 and one more). Red today.
- A kid who sat one stint of Q3 is not kept on for the rest of Q3 by this rule.
- A change of plan from 9 (a period break) and a game with full periods off give
  byte-identical results to today, over seeds 1-20.
- The #535 sweep's 632 losses fall to 0 or to cases a rule explains (cap,
  Apart, five on the floor); the PR quotes the after number.
- `test/engine.test.js`, `test/fuzz.test.js` stay green; `npm run evals` no
  worse than 6 passed, 0 failed, 2 not run.

## Surfaces

- Change: `app/state.js`, `app/gamemode.js`, `app/engine.js`,
  `app/plan-view.js`, new tests under `test/`, `scripts/whats-new.json` (and its
  generated output from `npm run whats-new`), `app/sitemap.xml` (whats-new
  `<lastmod>`).
- Do not touch: public pages, the Help sheet, `app/tour.js` (lane #536 is
  rewording them).

## Constraints

- The four pure modules stay pure; the re-plan inputs are composed in
  `state.js`, never in `gamemode.js` (the comment above `resolveRest` says so).
- **Reuse, do not re-derive:**
  - The cap retry lives in one place. `replanRest`, `applySwap` and `sitRest`
    all go through one helper; no second copy of the `CAPS_UNSATISFIABLE` test.
  - The pinned-five cap check lives in one place: extract it from `pinNotes`'s
    cap loop and have both `pinNotes` and `capNotes` use it. No matching on
    message text.
  - The sit-in-a-row note uses the engine's own words (same sentence as
    engine.js `BENCH_EXCEEDED`) and is built next to `consecNotes`, the same
    way; `plan-view.js` adds `BENCH_EXCEEDED` to its stale list.
  - Full-period pins stay in `assignFullPeriods`; `generatePlan` keeps one
    `fullPins` set. The finishing rule rides on the existing `normalize`
    whitelist.
- An absent `fullFinish` keeps every engine call byte-identical (measured).
- Coach-read text is plain words (ship-feature's What's new rule). No new note
  text except through the existing sentences.

## Design

### #533

- `state.js` exports `resolveRestRelaxing(g, p, from, sitIds = [])` (name may
  change): calls `resolveRest(g, p, from, sitIds)`; if refused as
  `infeasible` with a `CAPS_UNSATISFIABLE` issue, calls again with
  `{ relaxCaps: true }` and returns that when it is ok, else the first refusal.
- `replanRest` uses it for its cap step (its order is kept: sit-drop, cap,
  pins). `applySwap` (stint scope) and `sitRest` call it in place of
  `resolveRest`. A refusal after the retry behaves as today.
- Extract `pinnedOverCap(g, p)` (name may change): per pinned overtime stint,
  the ids the pinned five and the shown five both put on and who are over
  their cap, with the label. `pinNotes` builds its cap sentences from it;
  `capNotes` leaves those ids out.

### #534

- `state.js` exports `benchNotes(g, p, issues, nameOf)` (or `consecNotes`
  grows to cover both): for each available kid not sat for the rest, the
  longest run of stints off the floor in `effectiveStints` (a late kid counted
  from the stint after `lateArrivals` says they walked in), and a
  `BENCH_EXCEEDED` warning in the engine's words when it is over
  `g.constraints.maxBench`. Nothing when `issues` has `BENCH_TOO_FEW`.
- `plan-view.js`'s #456 block adds `'BENCH_EXCEEDED'` to `stale` and pushes the
  rebuilt notes.

### #535

- `resolveRest`: when the suffix starts mid-period (`p.stints[from - 1].period
  === p.stints[from].period`, a regulation period `q`), every available kid
  with a full period still owed (`fullLeft[id] > 0`) who was on the floor for
  every stint of `q` outside the open suffix goes in `c.fullFinish = { [id]: q }`.
- `normalize` passes `fullFinish` through (available kids only).
- `assignFullPeriods`: before the rounds, each `fullFinish` kid (seeded order)
  is pinned to the stints of `q` in the list when `can` allows it (five on the
  floor, Apart, cap). A kid so placed counts that as one owned period: their
  `owed`/`want` drop by one. `q` is never offered to anyone else. `buildForced`
  already pins a kid to every listed stint of a period in `fullPins`.
- `generatePlan` runs the full-period block when `fullFinish` is set too.

## Proof

| Seam | Covers |
|---|---|
| State seam (`test/state-fixture.js`, inline stubs like `test/replan-past.test.js`) calling the gamemode handlers or the new helper | #533 sit, swap, change of plan, no-caps identity, double note |
| Coach seam (`test/coach.js`) where a coach taps it: Sit for the rest and This stint under caps; a swap then `text('#issues')` for the sit-in-a-row note and the Longest sit note | #533, #534 |
| `consecNotes`/`benchNotes` export under `node --test` | #534 suppressions (sat, late, `BENCH_TOO_FEW`) |
| `resolveRest` under `node --test` with the #535 fixtures, plus `generatePlan` byte-identity with no `fullFinish` | #535 |
| `test/engine.test.js`, `test/fuzz.test.js`, `npm run evals` | no regression |

## Out of scope

- The late kid's pre-arrival stints counted as bench time in the Longest sit (#537)
  note and the On the bench column (follow-up issue).
- Overtime periods for full-period credit (they never counted).
- New toast wording for a relaxed cap.
