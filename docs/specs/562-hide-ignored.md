# 562 — The Plan sheet hides what a strategy ignores

## Issue

#562 (part of #561, the ease-of-use pass): hide each per-game switch the
current strategy ignores, and say in one line under the strategy segment which
team settings it skips. A short brief (light-review lane, display only).

## Goal

A coach on Platoon, Order or By hand sees only the Plan sheet switches that
change their plan, and one line saying which team settings don't apply.
Switching back to Even shows every switch as they left it. No plan changes.

## Survey (on `775b29f`)

- Lineup balance: `renderBalance` (`app/balance.js`) returns early only under
  Order. Platoon's fives are fixed, so the shape does nothing there.
- Even out earlier games: `renderDayGroup` (`app/rules.js`) disables the
  switch under Platoon and Order (`fivesAreSet`) with `fivesSetNote`.
  `evensOutDay` (`app/state.js`) already ignores it for both.
- Even out the season so far: `renderSeasonGroup` always offers it;
  `seasonTargetsFor` ignores it under By hand, Platoon and Order
  (reason `'strategy'`), and `renderSeasonAdjust` says "Not used…" only once
  it is on.
- Team settings each strategy skips, checked by running `computeAll` on the
  same game with each setting changed (a throwaway probe, 10 players):
  - Platoon: Players changing at once, Everyone plays in, full periods, and
    "Extra minutes go to" all leave the plan identical. A league minimum in
    minutes still holds and blocks (`MINS_UNSATISFIABLE`).
  - Order: Everyone plays in and full periods leave it identical. Players
    changing at once and Extra minutes go to DO change it (the order is built
    from them). A league minimum still holds, as a warning (`MIN_MISSED`);
    in full periods it counts as minutes (`leagueMinFor`).
  - By hand: Extra minutes go to leaves it identical (every kid has a
    hand-set target, so `applyTieBreak` has no one to nudge). Everything else
    applies. The season switch is ignored.
- #563 (one make-up-minutes row) has not merged, so the day and season
  switches are still two rows.

## Choices the issue left open

- **"Extra minutes go to" is not named** in any skip line, though Platoon and
  By hand ignore it. It is a tie-break behind Fine-tuning that only matters
  when minutes can't split evenly; under those two there is nothing to split,
  and naming it would make the line longer for a setting few coaches set.
- **"full periods", not "whole periods"**: Settings' own option says "full
  periods", so the line uses the word the coach will find there.
- **Evening out is named** in the line ("evening out other games" for
  Platoon, "the two Even out switches" for Order, "evening out the season"
  for By hand), because the line is what tells a coach why those switches
  disappeared. Order names the switches, not evening out itself: it still
  builds its list with kids behind on the day and season near the top
  (`deficitOf`), whatever the switches say.
- The line always names full periods and Everyone plays in (the issue's
  example), whether or not they are set; the league minimum clause appears
  only when one is set.

## What would settle it

1. Per strategy, the Plan sheet's switch and setting rows (Coach seam,
   `coach.controls()`; game 2 of a day, a filed season, levels set):
   - Even, Closers: Lineup balance, Even out earlier games, Even out the
     season so far all show.
   - By hand: Lineup balance and Even out earlier games show; the season
     switch is not on screen.
   - Platoon: none of the three is on screen.
   - Order: none of the three is on screen.
   A control not on screen cannot be tapped.
2. A Starting five rule set before switching to Order is still listed, with
   "Not used: the order picks who starts".
3. The line under the segment (`#stratskip`), exact copy, no league minimum:
   - Platoon: "Platoon plays whole groups, so Players changing at once,
     Everyone plays in, full periods and evening out other games don't apply."
   - Order: "The order decides who plays, so Everyone plays in, full periods
     and the two Even out switches don't apply."
   - By hand: "By hand plays the minutes you set, so evening out the season
     doesn't apply."
   - Even, Closers: no line (hidden, empty).
4. With a league minimum set, one more sentence on Platoon and Order only:
   - minutes, percent or periods, Platoon: "Your league minimum still counts."
   - same, Order: "Your league minimum still counts, but the plan only warns
     when someone falls short."
   - full periods, Platoon: "Your league minimum still counts in minutes, not
     as full periods."
   - full periods, Order: "Your league minimum still counts in minutes, not as
     full periods, and the plan only warns when someone falls short."
   With no league minimum, the word "league" is not in the line.
5. Game 2 on Platoon with both evening-out switches on and Lineup balance on
   Start strong: switch to Even, every switch is on as left and the shape
   still reads Start strong; back to Platoon, they hide again; to Even again,
   unchanged. Also after a reopen.
6. `test/hide-562-fingerprint.test.js` stays at the hash recorded on
   `775b29f` before any edit.
7. Look checks: each of the five strategies, long names ("Alexandria
   Montgomery-Okafor"), the Plan sheet scrolled to the bottom and at full
   height, 320 and 390 wide, 16 and 32px text, with a league minimum set. No
   clipping or cramped wrapping.

## Surfaces

Change: `app/balance.js` (`renderBalance`), `app/rules.js` (`renderDayGroup`,
`renderSeasonGroup`, `renderSeasonAdjust`, `fivesSetNote` if it ends unused),
`app/strategy.js` (`renderStrategy` paints the line), `app/index.html` (the
`#stratskip` paragraph), tests, `scripts/whats-new.json` + generated page +
sitemap lastmod. Must not change: `engine.js`, what `state.js` plans, any
saved value (`useCarryover`, `useSeasonTargets`, `balance` keep theirs).

## Constraints

- Display only: hiding never writes the hidden value.
- Rules the coach added stay visible (`docs/design-decisions-rotation-order.md`
  "Starting five is not offered, and one already set says it is not used").
- Interface guidelines S2: the Plan sheet holds only this game's choices; the
  line names team settings but edits none.
- Read the strategy test once: `fivesAreSet` (engine) for Platoon/Order, the
  league reading from `state.js` (`leagueMinFor` or the settings it reads), not
  a second copy of either.
- Coach copy: plain words, no "stint", "cap", "re-plan".

## Proof

- Coach seam (`test/coach.js`), one scenario file: items 1-5.
- `node --test` fingerprint: item 6.
- Existing scenarios that asserted the disabled day switch under Platoon and
  Order (`test/platoon-day-scenarios.test.js` 1-2,
  `test/rotation-order-scenarios.test.js` ~347) change to "not on screen".
- `scripts/look.mjs` and `/browser-verify`: item 7.

## Out of scope

Merging the day and season switches (#563). Add a game's step 3 switch
(#565). Pairs' Force Together switch. What the engine plans.

## Found in review, left for a follow-up

- By hand also ignores "Even out earlier games": every kid has a hand-set
  target, so the carryover credit has no one to move (a probe flipping
  `useCarryover` on game 2 under By hand gave identical plans in 14 of 14
  seeds). The app still says the game "evens out the day". Hiding the switch
  alone would leave that sentence; fixing it means changing `evensOutDay`,
  which feeds the plan, so it is not display only and is filed separately.
