# 444 — A re-plan during the last period leaves the Last-period five alone

## Issue

#444: a re-plan made after the last period has started pins the Last-period
five ("Starts the last period", `lastPeriodFive`) again on the first stint
still to come, in the middle of the period, undoing the coach's own swaps and
raising a false "is set to start the last period but is not available" note.

## Goal

"Starts the last period" means the last period's first stint. Once that stint
has been played, a re-plan (Sit for the rest, a This-stint swap, an arrival)
treats the five as done: it does not put them back on mid-period, and it does
not warn that a kid who already started the period cannot start it.

## Survey

The issue's claims hold on `d0b42ab` (scratch probe through `resolveRest`,
10 players, five p0-p4, re-plan from the last period's second stint):

- 4x8 every 3 seeds 1 and 3, 4x8 every 4, 2x16 every 4: `plan 2/5 -> replan 5/5`.
- `resolveRest(g, p, k, ['p0'])` at that stint: "Player 0 is set to start the
  last period but is not available." every time.
- Cause as stated: `resolveRest` keeps `c.lastPeriodFive` and passes the real
  `format.periods`; `lastPeriodStintIndex` (`app/engine.js`) returns the first
  stint of the last period *in the suffix*, which mid-period is not its start.
- #412 (the issue's blocker) is merged. #442 (`d0b42ab`) added `streakBefore`;
  this change does not touch it.

Choice the issue did not make: `replanRest`'s #437 last resort names every
fixed kid at the game (`pinnedRules(g, g.constraints)`) as "Could not keep X
fixed to a stint". After the last period has started, the Last-period five is
no longer holding anyone, so naming them would be the same false note in
other words. That list leaves the Last-period five out once the last period's
first stint is behind the cut, the same test `resolveRest` uses.

## What the build found

- Item 1 as first written (the exact five the plan had) does not hold: the
  re-plan re-picks the other seats (2x16: `[p0,p2,p5,p6,p7]` against the
  plan's `[p1,p3,p5,p7,p8]`). The issue's point is "not 5/5 of the five", so
  the test asserts the re-plan puts the same number of p0-p4 on stint f+1 as
  the plan had.
- Item 2: after the fix the solver may still put p0 on f+1, as a fairness
  make-up for the stint p0 lost. The issue asks that p0 not be put back *by
  the Last-period five*, so the test asserts the full p0-p4 five is not
  rebuilt.
- Item 5 is not reachable by a test: once the mid-period re-pin is gone, a
  pin crowds a re-plan only when it would crowd the printed plan too, and a
  spent cap goes through `PIN_CAP_USED` instead. The fix pass searched for a
  closers setup that reaches it (crowded and Apart closers, small caps, an
  arrival, ~7,500 fuzzed `resolveRest` calls with `dropPins`): after the cut,
  the plan's own `CLOSERS_TOO_MANY` / `CLOSERS_AVOID` refuse first, and cap
  refusals are not rescued by dropping pins. The `who` argument stays as a
  guard so the notice can never name the Last-period five mid-period; it has
  no test.
- Existing #437 tests re-planned from stint 7 of a 4x8/4 game (the last
  period starts at stint 6) and leaned on the mid-period re-pin to make a
  pin refuse. They now assert the new behavior; the cap-spent notice test
  moved to stint 6, where the five still holds, and a Coach scenario
  re-plans at stint 6 and reads the "Not enough minutes left" toast. The "Could not keep ... fixed
  to a stint" last resort lost its only test, because the setup that reached
  it was this bug.

## What would settle it

Tests through the `state.js` seam, red on `d0b42ab`, green after:

1. 10 players, Last-period five p0-p4, formats 4x8 every 3 (seeds 1 and 3),
   4x8 every 4 and 2x16 every 4: `resolveRest(g, p, f + 1)` (f = the last
   period's first stint) returns for stint f+1 exactly the five the plan had
   there (`p.stints[f+1].onFloor`, as a set), not 5/5 of p0-p4. (Each case
   prints `plan 2/5 -> replan 5/5` today.)
2. 4x8 every 3, seed 3: the coach swaps p0 off for p5 at stint f (a This-stint
   swap is what `gamemode.js` does: write `g.live.overrides[f]` with p5 in
   p0's seat, then `resolveRest(g, p, f + 1)`): stint f+1 of the re-plan is
   not the full p0-p4 five, and p0 is not on it. (Today p0 is put straight
   back on f+1.)
3. `resolveRest(g, p, f + 1, ['p0'])` on the formats in 1: no issue whose
   message contains "is set to start the last period".
4. A re-plan before the last period starts (`resolveRest(g, p, f - 1)` and
   `resolveRest(g, p, f)`) still puts all of p0-p4 on stint f.
5. `replanRest`'s last resort after stint f does not name a Last-period five
   kid as "Could not keep ... fixed to a stint" (only if a test can reach it
   through the existing #437 harness, `test/replan-pins.test.js`; otherwise
   the reviewer reads the change).

## Surfaces

- `app/engine.js`: export `lastPeriodStintIndex` (no behavior change); fix
  the `input.stints` comment in `generatePlan` that says a suffix's first
  remaining last-period stint "is the right answer".
- `app/state.js`: `resolveRest` clears `c.lastPeriodFive` when the last
  period's first stint (`lastPeriodStintIndex(p.stints, gameFormat(g).periods)`)
  is before `k`; the same test in `replanRest`'s `who`. Update the comment
  block above `resolveRest` ("`lastPeriodFive` still lands on the first
  remaining stint...").
- `app/sw.js`: nothing. `SHELL` is `'unbuilt'` in the tree and the build
  writes it as a digest (#408), so there is no `sw:bump` to run.
- `test/`: the tests above, in `test/resolve-rest.test.js` or a new
  `test/last-period-replan.test.js`.
- `docs/specs/378-*.md` lines 55-62: the five is kept only while the last
  period's first stint is still ahead.
- Must not change: any UI file, `budget.js`, `storage.js`, `roster.js`; the
  chart-page generator and public pages (another lane, #433).

## Constraints

- `engine.js` is one of the four pure modules: export only, no logic change;
  the engine suite stays green unchanged.
- **Do not re-derive "the first stint of the last period".**
  `lastPeriodStintIndex` is the one place; call it on the full plan's stints
  with the real period count.
- Keep #442's `streakBefore` exactly as it is.
- `openingFive`'s handling (cleared, and the #376 sit seed) is unchanged.
- Reuse the existing issue codes and copy; no new copy.

## Design

- In `state.js`, one small helper (e.g. `lastPeriodAhead(g, p, k)` =
  `lastPeriodStintIndex(p.stints, gameFormat(g).periods) >= k`).
- `resolveRest`: after `c.openingFive = []`, `if (!lastPeriodAhead(g, p, k))
  c.lastPeriodFive = []`. That also removes `droppedLastPeriod` /
  `LAST_PERIOD_MISSED` notes mid-period, since both read `c.lastPeriodFive`.
- `replanRest`: `pinnedRules` is read over constraints with `lastPeriodFive`
  empty when the helper says the stint is behind `from`.

## Proof

- `node --test` through `state.js` (stubbed `localStorage`/`document`, as
  `test/resolve-rest.test.js` does): items 1-4; item 5 if reachable.
- No coach-facing markup changes, so no Coach scenario, no smoke row and no
  look check. The preview check plays a game to the last period's second
  stint with a Last-period five set and reads the re-planned stint.

## Out of scope

- Overtime "Starts the last period" (overtime has no Last-period five).
- Any wording change to the Last-period five rule.
