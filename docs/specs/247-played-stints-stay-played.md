# #247 — a game underway never rewrites stints already played

## Issue

#247: changing anything during a game rewrites stints that were already
played, a one-stint swap leaves minutes uneven for good, and a finished game
shows two different stories until a reload.

## Goal

What a coach saw happen on the floor stays on the card, in bench mode and in
the season record, whatever they change afterwards. Changes made mid-game
re-plan only what is left, and the minutes even out over that time.

## What the survey found

All three bugs were reproduced at 390×844 on `main` (f79e7f5). The setup was
9 players p0–p8, 4 × 8 minutes, sub every 4 (8 stints), even minutes, seed
1234, with Lily (p5) out at the start. With 8 players every kid plans for 20
minutes.

1. **Late arrival.** Start the game, press › twice (`live.at = 2`), then mark
   Lily in through Who's here.
   - Stints 0 and 1 are rewritten with Lily in both. She is credited 8 played
     minutes and Nora drops to 0.
   - `syncOverrides` (`app/state.js:1396`) sees the stamp change and empties
     `live.overrides`, so any hand swap is lost too.
2. **Two stories.** The data is right but the screen is stale.
   - `closeGameMode` (`app/gamemode.js:375`) and `gmFinish` (`:395`) repaint
     `cards timeline summary gameview resume tabs`, but not `plan` (the stint
     table and the minute bars) and not `issues`.
   - A reload shows the right numbers.
3. **One-stint swap.** Ava on for Isabella in stint 0 with This stint leaves
   Ava at 24 and Isabella at 16 for good. Stints 1–7 are not re-planned.
4. **More places that erase the past** (found by reading the code):
   - `setAvailable(g, id, false)` (`app/state.js:782`) deletes every override
     naming the kid, played stints included.
   - `storage.js`'s cleanup of `live` (~line 492) drops any override that
     names a kid who is out.
   - So marking out a kid who already played erases the swaps behind their
     played minutes.

## Decisions (made with the human, recorded on #247)

1. Attendance, rules and strategy changes during a game freeze the played
   stints and re-plan the rest with `resolveRest`.
2. A change to the format or the sub interval changes the stints themselves,
   so it keeps #134's behavior: the whole plan is rewritten, and a toast says
   so with Undo.
3. After a This stint swap, the rest of the game re-plans automatically, and
   the swap and the re-plan are undone together with one Undo.
4. A late arrival aims for an **even share of what is left**. Kids who were
   there from the start do not give up minutes to cover the time the late kid
   missed.
5. A kid marked out after playing keeps their played minutes, on screen and
   in the season record.

## What would settle it

Use the survey's setup (9 players, 4 × 8, sub every 4, even minutes, seed
1234, Lily out at the start) unless a case says otherwise. "Played stints"
means stints `0 .. live.at - 1`.

- **A. Late arrival.** At `live.at = 2`, mark Lily in.
  - Stints 0 and 1 are exactly the same fives as before.
  - Played minutes are unchanged for every kid, and Lily's are 0.
  - Stints 2–7 include Lily.
  - Her projected total is within one stint (4 min) of the remaining time's
    even share: 24 × 5 / 9 ≈ 13.3.
  - The eight on-time kids' totals are within one stint of each other.
  - No "Rotation changed" toast appears, because nothing played moved.
- **B. Late arrival after a swap.** Same as A, but with a This stint swap at
  stint 0 first.
  - The swapped five in stint 0 survives.
  - The "swaps you made by hand were cleared" toast does not appear.
- **C. Rule change mid-game.** At `live.at = 3`, add a Plays at most 12 rule
  for Ava.
  - Stints 0–2 are unchanged.
  - Ava ends at no more than 12, or at the minutes she has already played if
    that is more.
- **D. Format change mid-game.** At `live.at = 2`, change the sub interval
  from 4 to 8. The #134 behavior is unchanged: the rotation is rewritten, and
  a toast offers Undo.
- **E. Strategy fallback.** Mid-game changes to a game using Set minutes or
  Platoon keep #134's behavior (`resolveRest` refuses them).
- **F. Swap re-plans the rest.** Swap Ava on for Isabella in stint 0 with
  This stint.
  - Stint 0 has Ava and not Isabella.
  - Stints 1–7 are re-planned, and the projected spread is ≤ 4 (one stint),
    not 8.
  - The toast gives the new totals ("Ava now ends at N min, Isabella at M").
  - One Undo restores the plan exactly: `live.overrides` is empty again.
  - With Set minutes or Platoon, the swap behaves as it does today.
- **G. Marked out after playing.** At `live.at = 3`, mark Ava out through
  Who's here after she played in stint 0 (either by plan or by a swap).
  - Stints 0–2 are unchanged and still show her.
  - Her played minutes show in the plan table, the card and the Timeline.
  - They survive a reload.
  - `archiveDay` files them into the season.
- **H. No stale screen.** After a swap, closing bench mode (✕, Done or Finish
  game) shows the swapped five in the stint table and the new totals in the
  minute bars, with no reload.
- **I. Nothing changes before tip-off.** For a game that is not underway
  (`live.at = 0` and no swaps), every change re-plans the whole game exactly
  as today.

## Surfaces

- **Changes:**
  - `app/state.js`: `syncOverrides`, `computeAll`'s call to it, `setAvailable`,
    `resolveRest`'s fairness targets.
  - `app/gamemode.js`: `applySwap`'s This stint path, and the repaint lists in
    `closeGameMode` and `gmFinish`.
  - `app/storage.js`: the `live` cleanup, which must keep played overrides and
    the new `live.arrived`.
  - `test/`, and this spec.
- **Must not change:**
  - `app/engine.js` and `app/budget.js`. `carryoverTargets` is called, not
    edited.
  - `app/roster.js`.
  - The card's size and layout.
  - The #134 path for format and sub-interval changes.

## Constraints

- **Pure modules.**
  - `storage.js` is one of the four pure modules. The change to its `live`
    cleanup is asked for by this task (item G), and nothing else in it moves.
  - `engine.js` and `budget.js` do not change.
- **Reuse, do not re-derive.**
  - Re-plan the rest with `resolveRest` (`app/state.js:1644`). It already
    handles played minutes, min/max rules and the league floor.
  - Freeze through `live.overrides`, the one place a lineup other than the
    plan's is recorded. Do not add a second store of played lineups.
  - Read minutes through `effectiveStints` and `effectiveMinutes`, as every
    minute readout already does.
  - Use `undoable` in `gamemode.js` for the swap and re-plan, with one Undo
    for both.
- **The freeze must use the lineups the game was showing** before the change,
  meaning the old plan's effective lineups. Build it from the old plan in
  `plans[i]` before the re-solve replaces it. The new plan's stints `0..at-1`
  are not what was played.
- **"Same grid"** means the same number of stints, each with the same
  `periodName`, `startSec` and `endSec`. Anything else is decision 2's path.
- **Precache.** `state.js`, `gamemode.js` and `storage.js` are precached, so
  run `npm run sw:bump`.
- **Mobile first.** Proof in the browser is at 390×844.

## Design

1. **Freeze, then re-plan (`computeAll` / `syncOverrides`).** When an
   underway game's stamp moves, the grid is the same, and the strategy is
   neither `minutes` nor `platoon`:
   - Write `live.overrides[k]` = the old effective lineup for every
     `k < live.at` that does not already have one.
   - Run `resolveRest(g, p, live.at)` and write its overrides for `k ≥ at`.
   - Set `live.stamp` to the new plan's stamp so the overrides are kept.
   - Do not mark the game moved (no #134 toast).

   If `resolveRest` refuses, or the grid changed, fall back to today's
   behavior.
2. **Arrival (`setAvailable`).** When a kid is marked available in an
   underway game, record `live.arrived[id] = live.at`. `storage.js` keeps
   `arrived` as an `{id: stint index}` map of real player ids.
3. **Fairness (`resolveRest`).** Each kid's fair share of the past counts
   only the stints since they arrived (all stints if they were never late).
   `deficit` is that fair share minus what they played. A late kid therefore
   owes and is owed nothing for time before they arrived, which gives
   decision 4.
4. **Marked out (`setAvailable`, `storage.js`).** In an underway game,
   marking a kid out deletes only the overrides at `k ≥ live.at` that name
   them. The storage cleanup keeps overrides at `k < live.at` even when they
   name a kid who is out.
5. **Swap re-plans the rest (`applySwap`).** In This stint scope, after
   writing `overrides[i]`, run `resolveRest(g, p, i + 1)` and write its
   overrides inside the same `undoable` mutate. If it refuses, keep today's
   behavior.
6. **Repaint.** Add `'plan'` and `'issues'` to both repaint lists.

## Proof

Seams for `/tdd`:

| Seam | Runs from | Covers |
| --- | --- | --- |
| `computeAll` on a fixture day, reading `plans` and `g.live` | `node --test`, new `test/played-stints.test.js` importing `app/state.js` | A, B, C, D, E, G (on-screen minutes via `effectiveMinutes`), I |
| `resolveRest` with `live.arrived` set | `node --test`, `test/resolve-rest.test.js` | A's 13.3 target, decision 4 |
| `setAvailable` in an underway game | `node --test`, `test/availability.test.js` | G's kept overrides, `arrived` recorded |
| `sanitize` round-trip of `live` | `node --test`, the existing storage test | G's reload, `arrived` kept or dropped |
| `archiveDay` after G | `node --test`, `test/played-stints.test.js` | G's season record |
| Swap + re-plan + Undo | a smoke check in bench mode at 390×844 | F, H |

`test/override-stamp.test.js` lifts `syncOverrides` out of the source with
`new Function`. If the new `syncOverrides` needs more than it can lift, move
those cases to the `computeAll` seam rather than widening the lift.

`/browser-verify` on the preview runs A, F, G and H with the survey's setup.

## Out of scope

- A late kid catching up toward a full-game share (decision 4 says no).
- Changing what #134 does for format and sub-interval changes.
- Set minutes and Platoon re-planning mid-game.
- Any change to the card's layout.
