# 446 — Plan notes name the rule that bound, and a minimum beats a locked By hand number

## Issue

#446: when two rules collide, the note under the plan gives the wrong reason
(the clock, or "Shuffle"), and a locked By hand number below a minimum beats
the minimum. Make the minimum win, and make every note name the rule that
actually bound.

## Goal

A coach reading the notes under a plan is told the real reason a kid is short
or a rule slipped: the Apart rule on a short bench, the Force Together partner's
cap, the pinned fives that filled a stint. Never the clock when the clock is
not the cause, and never "Shuffle" when shuffling cannot help. A locked By hand
number below a minimum (a rule minimum or the league minimum) is raised to the
minimum, and the coach is told so.

## Survey

On `e4b2cdd`, calling `generatePlan` directly (players `p0`..`pN`, 4x8 every 4
unless said, seed 1). Scratch probe, not committed.

- **Apart, 6 players** (`avoids: [[p0, p1]]`): minutes `[16,16,32,32,32,32]`;
  only note `SPREAD_FLOOR` "Best possible spread with 6 players and 4-minute
  stints is 4 minutes. A and B play 16." Holds.
- **Force Together A-B, A capped 8** (10 players): B 8, others 16-20; only
  note "... is 0 minutes." Holds.
- **Force Together A-B and A-C, B and C Apart** (10 players): B and C play 4;
  same "is 0 minutes" note, no refusal. Holds.
- **Force Together A-B, A minimum 28**: B 28, others 12-16, "is 0 minutes".
  Holds.
- **Lock vs minimum.** The issue's literal shape (every target 16, A 8,
  sum 152) already gives A 16 on seeds 1-20, because the spare 8 floor-minutes
  have to go somewhere. **The shape the app produces** (By hand sums to the
  game, 160: A locked 8, p1 and p2 at 20, the rest 16) gives A **8 on all of
  seeds 1-20**. The claim holds for the app's shape; the tests use it.
- **Locks vs One of two on** (A and B locked 8, `keepOnFloor [[p0,p1]]`):
  `KEEPON_PARTIAL` "both off the floor for 4 stints", no refusal. Holds.
- **Pinned fives fill the slot** (6 players, 1x6 every 4 = stints 4 and 2,
  A minimum 4, Starting five p1-p3, Last-period five p4-p5): A gets 2;
  `MIN_MISSED` "The clock does not divide to hit it exactly." Holds.
- Sweep (scratch `sweep.mjs`, 2000 seeded random games: 6-12 players, six
  formats, random mixes of Apart, Together soft/hard, One of two on, minimums,
  league minimums, caps, starting and last-period fives, Plays at most, By hand
  with locks): 110 plans show `SPREAD_FLOOR` with a spread above the clock
  floor and no other spread note; 29 of 51 `MIN_MISSED` notes blame the clock
  while the minimum is an exact sum of stint lengths; 17 of 18 locked targets
  under a minimum lost the minimum; 36 `HALF_LATE` and 5 `KEEPON_PARTIAL`
  notes give only "no legal lineup".
- `docs/design-decisions.md`'s line numbers in the issue are stale; the
  decisions exist (league minimum vs cap; pinned lineup vs Plays at most;
  minute target is a pin; tie-break; halftime; change limit is a preference).

Choices the issue did not make:

- **Where the raised lock's extra minutes come from.** Raising a lock adds
  minutes to a By hand budget that already sums to the game. They are taken
  back from the *unlocked* By hand numbers in proportion to them, never below a
  player's own minimum, and only when every available player has a By hand
  number (otherwise the players without one absorb it, as today). This is the
  mirror of the existing surplus rule in `computeTargets`. Without it the
  budget goes over and an unrelated `TARGETS_OVER_BUDGET` warning fires.
- **League wording.** The engine never learns the league setting exists
  (design-decisions). Its note says "their 16-minute minimum"; `state.js`
  swaps that phrase for "the league minimum" when the composed minimum came
  from the league setting (the coach's own minimum for that player is lower),
  the same way `sayWhyTheyAreShort` finishes `SPREAD_FLOOR`.
- **One coach-facing line on the rule detail page** is read as one line, on
  the minimum rule's detail page and on the league minimum's page, since this
  ticket's decision is about the minimum: "If a locked By hand number is lower,
  the minimum wins and the plan notes say so." The other table rows are older
  decisions and stay in the docs.
- **The Together-chain refusal is an error** (`PAIR_CHAIN_APART`), like
  `PAIR_AVOID_CONFLICT`, only with Force Together on.
- **Locks in the One of two on cover sum** stay the existing error
  `KEEPON_UNSATISFIABLE`, with wording that names the By hand numbers.
- **PAIR_PARTIAL** is listed as a cause but nothing in "What to do" changes
  it; left as it is.

## What would settle it

All through `generatePlan`, players `p0`..`pN` named A, B, C ..., 4x8 every 4,
seed 1 unless said. Red on `e4b2cdd`, green after.

1. **Apart, 6 players** (`avoids [[p0,p1]]`): no `SPREAD_FLOOR` issue; an
   info issue (`SPREAD_RULE`) whose message contains "Apart" and "6", names A
   and B, and has `playerIds` A and B. In the app (Coach seam), a 6-player game
   with A and B Apart shows a note naming Apart, and `#issues` does not match
   `/Shuffle/`.
2. **Force Together A-B, A capped 8** (10 players, `hardPairs: true`): a
   `SPREAD_RULE` message containing "Force Together", "capped at 8", and B's
   name; no `SPREAD_FLOOR`.
3. **Force Together A-B and A-C, B and C Apart** (10 players,
   `hardPairs: true`): `ok: false`, error `PAIR_CHAIN_APART` naming B and C.
   With `hardPairs: false` the same rules are not refused.
4. **Lock below a minimum** (10 players, `strategy: 'minutes'`, targets A 8,
   B 20, C 20, rest 16, `lockedTargets [p0]`, `minMinutes {p0: 16}`): A plays
   16 on seeds 1-20; a `warn` `TARGET_UNDER_MIN` with `playerIds [p0]` whose
   message is exactly "A's By hand number was raised from 8 to 16 to meet
   their 16-minute minimum."; no `TARGETS_OVER_BUDGET`. Same with
   `minMinutes` 16 for every player (the league shape): A plays 16. In the app
   (Coach seam), league minimum 16 in Settings and a By hand lock at 8 shows
   "... was raised from 8 to 16 to meet the league minimum."
5. **Locks against One of two on** (10 players, `strategy: 'minutes'`, A and
   B locked at 8, rest summing to 160, `keepOnFloor [[p0,p1]]`): `ok: false`,
   error `KEEPON_UNSATISFIABLE` whose message names the By hand numbers.
6. **Pinned fives fill the slot** (6 players, 1x6 every 4, A minimum 4,
   `openingFive [p1,p2,p3]`, `lastPeriodFive [p4,p5]`): the `MIN_MISSED`
   message names "Starting five" and "Starts the last period" (the Add-a-rule
   names; `CONTEXT.md` retires "last-period five") and does not match
   `/clock/`.
7. **A minimum off the stint grid keeps the clock wording** (7 players, 2x20
   every 5, every player minimum 6, B capped at 8, seed 9): B gets 5 and the
   `MIN_MISSED` message still contains "The clock does not divide to hit it
   exactly."
8. **The sweep** (`sweep.mjs` shape, 2000 games, recorded in the PR): every
   plan that is `ok` both before and after has byte-identical lineups except
   those with a lock under a minimum; "SPREAD_FLOOR above floor, unexplained"
   falls from 110; "MIN_MISSED clock wording while the minimum is a sum of
   stints" falls from 29 to 0; "lock under minimum, minimum lost" falls from 17
   to 0. Because lineups are unchanged elsewhere, the #443 measurements
   (long-sit and change-limit numbers) cannot move; `test/engine.test.js` and
   `test/fuzz.test.js` stay green with every existing assertion unchanged.
9. `docs/design-decisions.md` has a "When rules disagree" table with the
   issue's rows and the cost weights; the minimum and league-minimum detail
   pages carry the one line in Choices.

## Surfaces

- `app/engine.js`: `normalize` or a helper beside it (the lock raise),
  `analyzeFeasibility` (`TARGET_UNDER_MIN`, `PAIR_CHAIN_APART`, locks in
  `KEEPON_UNSATISFIABLE`), `finish()` (`SPREAD_RULE`, the reason picked for
  `MIN_MISSED`, `HALF_LATE`, `KEEPON_PARTIAL`).
- `app/state.js`: the league wording swap beside `sayWhyTheyAreShort`.
- `app/plan-view.js`: `SPREAD_RULE` is replaced by `minutesNote` once the
  minutes move, exactly like `SPREAD_FLOOR` (`issuesList`, the `moved`
  branch).
- `app/gamemode.js`: a `SIT_RULES` clause for `PAIR_CHAIN_APART`
  (`test/sit-rules.test.js` fails a new `err(` code with none).
- `app/rules.js`: the one detail-page line.
- `test/engine.test.js`, a new Coach scenario file, `test/coach.js` only if a
  verb is missing.
- `docs/design-decisions.md` (doc-writer).
- Must not change: `cost()`, the solve in `generatePlan` (greedy, local search,
  the long-sit fallback), `app/toast.js` and `app/app.css` (another lane),
  `budget.js`, `storage.js`, `roster.js`.

## Constraints

- `engine.js` is one of the four pure modules and this task is explicitly
  about it. Notes only, plus the one target change: no cost weight, no move,
  no search change. Any plan without a lock under a minimum keeps
  byte-identical lineups (settle item 8 checks it).
- One place decides the raised lock; `analyzeFeasibility` and `generatePlan`
  both read it (they both call `normalize` today, which is why `normalize` is
  the natural home). Do not compute it twice.
- Reuse: `andList`, `plural`, `fmtMinutes`, `label`; `pinGroups` and
  `buildForced` for which group pins which stint (never re-derive pins);
  `pinGroups`' `say` words for the groups. The coach's names for rules are
  the Add-a-rule labels in `rules.js` `KINDS` (Apart, Force Together, One of
  two on, By hand); use the same words.
- `sayWhyTheyAreShort` keys on `SPREAD_FLOOR`; suppressing `SPREAD_FLOOR`
  when `SPREAD_RULE` is emitted is what removes "Shuffle". Do not add a second
  check in `state.js`.
- Expected values in tests come from this spec, never recomputed the way the
  code computes them.
- The privacy and spelling guards apply to new strings (American spelling;
  none of the banned phrasings).
- The detail-page line uses the existing `pgrp-f` class; no CSS change.

## Design

1. **Lock raise.** For each id in `lockedTargets` with a target below its
   minimum, set the target to the minimum. If every available player has a
   target, take the added minutes back from the unlocked targets in proportion
   to their targets, none below its own minimum. Record `{id, from, to}`.
   `analyzeFeasibility` warns `TARGET_UNDER_MIN`, one per raised id:
   "`<name>`'s By hand number was raised from `<from>` to `<to>` to meet their
   `<to>`-minute minimum." The `TARGETS_*_BUDGET` check reads the targets
   after the raise.
2. **`PAIR_CHAIN_APART`** (only `hardPairs`): connected groups of the
   Together graph; an Apart pair inside one group is an error naming the two,
   e.g. "B and C are set Apart, but Force Together ties both to A, so they
   would always be on together. Drop one of the rules." (name the linking
   player or players). A direct pair is still `PAIR_AVOID_CONFLICT` only.
3. **`KEEPON_UNSATISFIABLE`**: each side's cover is the smaller of its cap and
   its locked By hand number (after the raise). The message says caps, By hand
   numbers, or both, as the case is.
4. **`SPREAD_RULE`** in `finish()` (not platoon), only when the spread is above
   the clock floor (`minPossibleSpread`'s minutes when exact, the longest
   stint otherwise). Reasons, each with its own condition read off the final
   minutes:
   - Force Together group that plays every minute: a group of k tied players
     with k more than the bench seats (n - 5), all at the game's minutes.
   - Force Together tied to a capped or minimum (or locked) partner: B has no
     minimum, cap or target, A does, B's minutes equal A's, and B is the
     lowest or highest of everyone but A. "B plays 8 because Force Together
     ties them to A (capped at 8)." / "(minimum 28)".
   - Apart on a short bench: A and B Apart, their minutes add to the game's,
     and everyone else plays more than either. "A and B share one spot because
     they are Apart and only 6 are here, so they play 16 each." (or "16 and
     12").
   - Apart from a whole-game player: A plays 0 and is Apart from someone at
     the game's minutes.
   - One of two on: A and B's minutes add to the game's and everyone else
     plays less than either. Names One of two on.
   One info issue, the sentences joined, `playerIds` the players named. When
   it is emitted, `SPREAD_FLOOR` is not. `SPREAD_CONSTRAINED` is unchanged.
5. **`MIN_MISSED` reason.** If the minimum is a sum of some of the stint
   lengths: name the pin groups that fill (5 pinned) a stint the player sat
   ("Starting five and Starts the last period fill the 4-minute stint", the
   coach's rule names, since `test/one-name.test.js` bans the retired ones);
   else name other players whose minimum or locked number holds a stint the
   player sat (taking it away would drop them under); else "No legal lineup
   gave them more." The clock sentence stays only when the minimum is not a
   sum of stint lengths.
6. **`HALF_LATE`** (the branch that today says "No legal lineup got them on any
   sooner."): if every first-half stint is filled by pins, name the groups; if
   the player is Apart from someone on in every first-half stint, name that
   rule and player; else today's sentence.
7. **`KEEPON_PARTIAL`**: if a stint both sat is filled by pins, name the
   groups; if both are at their cap or locked number, say so; else today's
   sentence.
8. `state.js`: for a `TARGET_UNDER_MIN` whose player's own minimum is below
   the league minimum, swap "their N-minute minimum" for "the league minimum".
9. `rules.js`: the one line on the minimum and league-minimum detail pages.

## Proof

- `node --test test/engine.test.js` through `generatePlan` and
  `analyzeFeasibility`: settle items 1 (engine half), 2-7.
- A Coach scenario (`test/coach.js`, `AGENTS.md` § Test seams): item 1's
  "no Shuffle" in `#issues` on a 6-player Apart game; item 4's league wording
  in `#issues`; item 9's line on the minimum detail page.
- `test/fuzz.test.js` and `test/engine.test.js` unchanged and green: item 8's
  "no existing assertion changes".
- The scratch sweep before/after, run by the orchestrator and recorded in the
  PR: item 8's counts and byte-identical lineups.

## Out of scope

- `CONSEC_EXCEEDED` and `SUBS_EXCEEDED` wording (#439, closed).
- `PAIR_PARTIAL`'s ceiling.
- Any change to which plan is chosen beyond the raised lock.
- Detail-page lines for the other table rows.
