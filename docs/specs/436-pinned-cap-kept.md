# 436: a pinned kid is held, or the plan is refused, never dropped quietly

## Issue

#436 (from the rules review, parent #453): a kid named in the Last-period
five or the closing group, who also has a Plays at most cap, is left off the
stint they were pinned to, and nothing on screen says so. The same happens in a
one-period game where the Starting five and the Last-period five are both set.

## Goal

When a coach names a kid for a stint, that kid is on the floor for it. If the
coach's own rules make that impossible, the plan is refused up front and the
message says who and why. If the search still misses a pin for some other
reason, the plan carries a warning that names the kid.

## What would settle it

All through `generatePlan` (or `analyzeFeasibility` for the refusals), each red
on `97334dc`. Survey on `97334dc` reproduced every number in the issue
(script: 4x8 every 4, Last-period five `p0`-`p4`): cap 4 missing 30/30, cap 8
missing 30/30, no cap 0/30, closers cap 12 missing 30/30, one period dropped
10/10, cap 4 with both fives not refused.

1. 4x8, everyN 4, 8/10/12 players, Last-period five `[p0..p4]`, `p0` capped at
   4 and at 8, seeds 1-10: `p0` is on stint 6 (Q4's first stint) in all 60
   plans, every plan `ok`.
2. Same format, strategy `closers`, closing `{ stints: 2, players: [p0..p4] }`,
   `p0` capped at 12, 8/10/12 players, seeds 1-10: `p0` is on stints 6 and 7 in
   every plan.
3. A cap that cannot cover the sum of a kid's pinned stints is refused (`ok:
   false`) with a new error `PINS_OVER_CAP`, whose message names the kid, their
   pinned minutes and their cap. Example: 4x8 every 4, both fives `[p0..p4]`,
   `p0` capped at 4 -> refused, message contains the kid's name, `8` and `4`.
   Closers count too: closing 2 stints (8 min), cap 6 -> refused.
4. 1x12 every 4, 10 players, Starting five `p0`-`p4`, Last-period five
   `p5`-`p9` -> refused, `FORCED_GROUP_TOO_BIG`, message says 10 players and
   that only 5 fit.
5. A pin still missed for another reason produces a warning naming the kid:
   `OPENING_MISSED`, `LAST_PERIOD_MISSED`, `CLOSER_MISSED` (severity `warn`,
   `playerIds` = who was left out, message uses their name).
6. Test `378: the last-period five is checked against...`: its `generatePlan`
   case also asserts `p1` is on the floor in H2's first stint.
7. `test/fuzz.test.js`: the starting-five property fails on a missing starter
   (no `|| p.issues.length` escape), and a same-shaped property checks the
   Last-period five on the last period's first stint. Both skip platoon.
8. `docs/design-decisions.md` says a pin is held over a cap, or refused up
   front, never dropped quietly.

## Surfaces

Changes: `app/engine.js`; `app/gamemode.js` (one `SIT_RULES` clause for
`PINS_OVER_CAP`, which `test/sit-rules.test.js` requires of every new `err()`
code); `test/engine.test.js`, `test/fuzz.test.js`, `test/rule-words.test.js`
(only if its `EXPECT_KIND` should name the new code's kind, `cap`);
`docs/design-decisions.md`, `docs/operations.md` (its list of fuzz properties).

Must not change: `app/state.js`, the card, any renderer.

## Constraints

- `engine.js` is a pure module (`AGENTS.md` § Rules). This task is explicitly
  about it, so its behavior changes here, and only for pins.
- One answer in one place: the stints each group is pinned to are decided by
  `buildForced` (and `lastPeriodStintIndex` inside it). `analyzeFeasibility`
  must derive pinned minutes and per-stint unions from `buildForced`, not a
  second copy of the rule. `finish()` reads the same forced sets to decide who
  was missed.
- Another lane (#438) is editing `engine.js` at the same time. Keep the diff on
  this cause only.
- Copy uses the coach's words already in the engine (`is set to start`, `is
  set to start the last period`, `is set to close`). American spelling.
- A cap is reduced by minutes already played in a mid-game re-plan
  (`resolveRest`), so the new checks are correct for a suffix as they stand.

## Design

1. **Feasibility, pinned minutes.** Build the forced sets with `buildForced`.
   For each capped kid, sum the minutes of every stint they are pinned to (a
   stint counted once even if two groups pin it). If the cap is under that sum
   and `FORCED_OVER_CAP` has not already fired for that kid, `err
   PINS_OVER_CAP`. `CLOSER_OVER_CAP` (a warning for the same arithmetic, closers
   only) is removed: the error now covers it. Its formatting test moves to the
   new code.
2. **Feasibility, one stint over-full.** For each stint, the union of the
   groups pinned to it; if it is over 5 and no single group is already over 5,
   `err FORCED_GROUP_TOO_BIG` naming the count. This is the issue's
   `periods === 1` case stated generally: it also catches closers overlapping
   the Last-period five's stint. The same union is checked for an Apart pair
   that spans two groups (`FORCED_GROUP_AVOID`), which the per-group check
   misses; a pair already caught inside one group is not reported twice.
3. **Greedy reserves pinned minutes.** Before greedy, each kid's remaining
   pinned minutes are held back from their cap: seating a kid in an unpinned
   stint is legal only if minutes so far + this stint + their pinned minutes
   still ahead fit under the cap. Seating in a pinned stint checks the cap as
   before (the reserve guarantees it fits).
4. **Cost.** 1000 a minute for each pinned kid not on the floor in a stint
   they are pinned to, so local search repairs a miss (the exchange move can
   trade the kid's earlier unpinned stint for the pinned one).
5. **`finish()` warnings.** For each group, who is not on the floor in a stint
   that group pins them to: `OPENING_MISSED`, `LAST_PERIOD_MISSED`,
   `CLOSER_MISSED`, one issue per group naming everyone missed. Platoon is
   exempt, as it is for `KEEPON_PARTIAL` and `HALF_LATE`: platoon never
   applies pins, the units are the coach's.

## Proof

- `node --test test/engine.test.js`: items 1-6, through `generatePlan` and
  `analyzeFeasibility` exports. Item 5 needs a case the cost cannot repair; if
  none can be built through `generatePlan` with feasibility passing, the
  developer reports that and the warning is covered by the fuzz property
  (item 7) instead.
- `node --test test/fuzz.test.js`: item 7.
- `test/sit-rules.test.js` and `test/rule-words.test.js` stay green with the
  new code mapped.
- No coach-facing screen changes beyond new message text, so no Coach
  scenario and no look check.

## Out of scope

- Platoon applying pins.
- The rename of "Last-period five" (#445), Force Together (#438), re-plan
  warnings being discarded (#414).
- Choices made without the human, the ticket being `ready-for-agent`: the
  over-full stint and cross-group Apart checks are stated per stint rather than
  only for `periods === 1` (same cause, one rule instead of a special case);
  `CLOSER_OVER_CAP` is folded into the new refusal; platoon is exempt from the
  missed-pin warnings.
