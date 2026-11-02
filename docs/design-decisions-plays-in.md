# Design decisions: full periods, Everyone plays in, and the run stepper

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

This file also carries what the older rules now say about these three:

- The halftime default (`HALF_LATE`, `HALF_EARLY` and its 200-per-kid cost) is
  off when Everyone plays in is on.
- The league minimum's unit picker has a fourth unit, `full`, ranging 0 to 8.

## Rows for the table in design-decisions.md

Same columns as "When rules disagree": the two rules, what wins, what the plan says, and where the reasoning is.

| When these meet | What wins | What the plan says | Why |
| --- | --- | --- | --- |
| Everyone plays in (each half or each period) and the halftime default | The setting. The halftime default steps aside: no halftime cost term, no `HALF_LATE`, no `HALF_EARLY`. | `PLAYS_IN_MISSED` names each kid and the half or period they miss. | "Everyone plays in is a setting, and it steps the halftime default aside (#451)" |
| Everyone plays in and the change limit | The setting. The change limit gives way, as Sits at most does, when holding it would leave a kid out of a half or period. | `PLAYS_IN_SUBS` names the changes needed. `PLAYS_IN_TOO_FEW` says when the clock cannot seat everyone. | "It outranks the change limit, and the plan says so" (under Everyone plays in, #451) |
| A full-periods minimum and a cap on the same player | The cap. The number of full periods is lowered to the whole periods the cap can hold, and no pin goes past it. | Nothing, as for a league minimum under a cap. | "A league minimum can count whole periods, start to finish (#450)" |
| A full-periods minimum that the periods cannot hold | Nothing: a whole-game plan is refused, with the numbers. | Error `FULL_PERIODS_TOO_MANY` on a whole-game plan, in place of the minutes error `MINS_UNSATISFIABLE` for this case. A mid-game re-plan gets `FULL_PERIODS_SHORT` instead. | "A league minimum can count whole periods, start to finish (#450)" |
| A kid the full-period picks cannot place | The plan as built, after one repair: another kid moves to a period with room. | Warning `FULL_PERIODS_SHORT` names the kid and how many full periods they got. Never an error. | "A league minimum can count whole periods, start to finish (#450)" |

## Cost weight

| What is charged | Cost |
| --- | --- |
| A kid not on the floor in a half or period Everyone plays in covers (on only; in both search passes) | 200 each (`LATE_WEIGHT`), in place of the halftime charge |

## Choices

- **A league minimum can count whole periods, start to finish (#450).**
  `settings.minUnit` `full` is a fourth unit beside `min`, `pct` and `periods`,
  with the same 0–8 range. `periods` still means minutes, so two periods is 16
  minutes in a 4×8, however they fall. `full` means each kid plays two whole
  periods. The rule reads "Everyone plays at least 2 full periods (16 min)".
  Saved teams hold `min`, `pct` or `periods`, so they load with the setting
  off. A "sits at least one full period" rule is not built.
  - **A minute minimum does not give whole periods, so the engine pins them.**
    The [spec](specs/450-full-periods-plays-in-run-stepper.md) found that a
    minute minimum alone leaves kids short of whole periods. `state.js` tells
    the engine each kid's number (`constraints.fullPeriods`), and `engine.js`
    picks each kid's periods once, before the search (`assignFullPeriods`). The
    picks go in as pins through `buildForced`, so the feasibility check, the
    cost and the notes after the fact all read the same pins.
  - **The pick, in order.** It never puts more than five pinned kids on a stint
    (the other pins count), never seats two Apart kids in one period, and never
    pins a kid past their cap. Within that it keeps the kid's pinned run (in
    stints, across breaks) under Plays at most N in a row, preferring periods
    that are not back to back; a single period longer than the limit is picked
    anyway and the rest warnings say so. Then it takes a period in a half the kid
    has none in, then the least-loaded period, then a period the kid already
    plays in the plan on screen (so a rule edit does not reshuffle, #449), then
    the seed. A kid it cannot place gets one repair: another kid moves to a
    period with room. A kid still short gets `FULL_PERIODS_SHORT`, a warning,
    never an error, so a blocked plan stays blocked for every seed.
  - **The number per kid.** The league's number, lowered so the pinned minutes
    fit under the kid's cap and never more than the regulation periods. A late
    arrival's is the scaled league minutes divided by the period length, rounded
    down. The cap lowers it without a message, as a league minimum under a cap.
  - **Refused up front.** `FULL_PERIODS_TOO_MANY` is an error when the full
    periods asked for add up to more than the eligible periods times five on the
    floor. It replaces `MINS_UNSATISFIABLE` for this case, and says the same in
    periods: "Everyone plays 2 full periods needs 22 player-periods (2 x 11
    players), but 4 periods have room for 20 (4 x 5 on the floor)." When kids
    are owed different numbers, the parenthetical is left out. Only a plan that
    covers the whole regulation game is refused: a mid-game re-plan places what
    fits and `FULL_PERIODS_SHORT` names the rest.
  - **Eligible periods.** A period is eligible when it is regulation and its
    stints in the list add up to the whole period. A mid-game re-plan leaves out
    the period in progress and any period with a hand-chosen stint. A kid's need
    there is their number less the whole periods they already played start to
    finish.
  - **Platoon ignores it.** Platoon applies no pins. A full period missed is
    said like any pin, `FULL_PERIOD_MISSED`.
- **Everyone plays in is a setting, and it steps the halftime default aside (#451).**
  `settings.playsIn` is `off` (the default, and what every saved team means),
  `halves` (each half) or `periods` (each period: each quarter in a 4-period
  game). It sits in Settings beside Everyone plays at least. Its rule sentence is
  "Everyone plays in each half", or "Everyone plays in every quarter" (or half,
  or period, by the game's period count). With it on, the halftime default does
  not run: `HALF_LATE` and `HALF_EARLY` are not said, and the halftime cost term
  is not charged. The setting's own term charges `LATE_WEIGHT` (200) for each
  kid who is not on in a half or period, level-blind, in both search passes.
  It is not the default because it can outrank the change limit, which the
  halftime default never does. With it off, every plan is what it was before.
  - **It outranks the change limit, and the plan says so.** When a half or
    period needs more changes at a break than `maxSubs` allows, `PLAYS_IN_SUBS`
    says how many: "Allow 5 changes at a time, or turn it off." It replaces
    `SUBS_EXCEEDED` for that case, as `BENCH_SUBS` does for Sits at most. When
    the clock itself cannot seat everyone (a half or period seats five per
    stint, and there are fewer seats than kids who need one), no number of
    changes helps, so
    `PLAYS_IN_TOO_FEW` says so instead, and `SUBS_EXCEEDED` steps aside for it
    too: "Sub more often, or turn it off."
  - **Halves.** A half is split at the regulation midpoint, by each stint's end
    on the clock, so a re-plan splits the same way. `playsInGroup` in
    `engine.js` is the one answer to "which half or period is this stint in",
    and `state.js` uses it too. In a re-plan, `coveredIn` says which halves or
    periods a kid already played in, and those are not charged again.
  - **After the fact.** `PLAYS_IN_MISSED` names each kid who still misses one,
    and which ("Ava misses the second half."), unless `PLAYS_IN_TOO_FEW` already
    said it.
- **The run limits count the unit a stint is read in, under Breaks only (#452).**
  Under Breaks only a stint is a whole period, so the Plays at most and Sits at
  most steppers, their rows and their rule sentences say quarters, halves or
  periods, by the game's period count: "Quarters in a row", "2 quarters in a row
  is 16 min.", "Each player plays at most 2 quarters in a row (16 min)". The
  minutes are the hint line #441 added. Other games say stints, as before. The
  stored value is still in stints (`maxConsecutive`, `maxBench`).
  - **The top of each stepper.** Plays at most goes up to one less than the
    game's regulation stints (at least 1), since a limit that takes in every
    stint is no limit. Sits at most stays at 1 to 4, because the engine's
    advice for Sits at most depends on that range (`MAX_BENCH_LIMIT`).
  - **Breaks do not reset either count.** Both help texts say so, and say that
    a limit of 1 under Plays at most means the whole five changes at every
    break. The counting itself did not change.
