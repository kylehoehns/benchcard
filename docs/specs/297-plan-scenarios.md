# #297 — Plan scenarios: Who's here, Format, Sub interval, Strategy, Shuffle and Lock

## Issue

#297 (a sub-issue of #293): cover the Plan journey with Coach scenarios — a
coach marks a Player Absent, changes the Format and Sub interval, picks a
Strategy, Shuffles, and Locks a Player's Minutes under By hand.

## Goal

A coach who shapes a Game's Plan on the game screen sees the Plan change the
way they meant it to, and what they set is still there when they reopen the
app. If a tap on any of those controls stops doing its job, a scenario goes
red.

## What would settle it

Fixture: the smoke harness's rich Team through `Coach.onGameDay()` — 11
Players, Format 4 × 8, Sub interval every 4 min (8 Stints, 160 Minutes),
Hawks at 9:00 AM and Ravens at 11:30 AM, clock pinned to Sat, Sep 12, 2026,
12:00. Each scenario opens the Hawks Game with a tap on
`Hawks, 9:00 AM, planned`.

1. **Absent.** In Who's here, tapping `Ana Reyes` marks her Absent. The
   phrase reads `Who's here, 10 players`. The Plan's timeline lists 10
   Players, without Ana Reyes, and their Minutes add up to 160. After
   reopening the app, the phrase still reads `Who's here, 10 players`.
2. **Format.** In Format, two taps on `Fewer periods` and eight on `More
   minutes` make it 2 × 16. The phrase reads `Format, 2 × 16`. The Minutes
   still add up to 160. (No reopen here: each stepper tap waits out the
   app's re-plan, about 270ms, so this scenario is already the slowest, and
   the Absent and Lock scenarios already prove a reopen keeps the Plan.)
3. **Sub interval.** Before, the timeline reads `of 8 stints`. After tapping
   `Every 2 min` in Sub interval, the phrase reads `Sub interval, every 2 min`
   and the timeline reads `of 16 stints`. Minutes still add up to 160.
4. **Strategy.** In the Plan sheet, tapping `By hand` changes the phrase from
   `Plan, even minutes` to `Plan, minutes set by hand`, and shows a `Target minutes
   for <name>` slider for each of the 11 Players.
5. **Shuffle.** In Card view, the starting five on the card changes after
   tapping `Shuffle`. The Minutes still add up to 160. A Shuffle draws a new
   seed from `Math.random`, and the same five can come back by chance (about
   1 in 462; 0 of 60 measured). So the scenario taps Shuffle up to 3 times
   and passes on the first tap that changes the five. If Shuffle does
   nothing, all 3 taps leave the same five, and the scenario fails.
6. **Lock.** Under By hand, locking Ana Reyes's row shows her Lock as on.
   Then Marcus Williams is marked Absent, so his 16 Minutes are shared out
   among the Players who are not locked (without the lock, Ana takes some of
   them, 20, on about two seeds in three). Ana stays at 16 and the total at
   160. After a Shuffle, and again after reopening the app, she is still at
   16 and her Lock is still on.

And, from the ticket:

- Scenarios are named in a coach's words. They act only through taps and
  typing, and assert only what is on screen or kept across a reload.
- Every verb the journey needs lives in `test/coach.js`.
- Mutation proof: at least 4 realistic breaks of this journey's handlers in
  `app/`, each turning a named scenario red, then restored. Recorded in the
  PR.
- Each scenario file passes 20 runs in a row locally (through the smoke
  lock), each run under 10s, and `npm test` is green.
  All six scenarios in one file ran 9.4-11.1s on this machine, so they are
  split in two: items 1-3 in `test/plan-scenarios.test.js`, items 4-6 in
  `test/plan-strategy-scenarios.test.js`.
- No existing unit test is removed (the #293 comment after #296: scenarios
  are additive).

## Surfaces

Changes:

- `test/plan-scenarios.test.js` (new): items 1-3.
- `test/plan-strategy-scenarios.test.js` (new): items 4-6.
- `test/coach.js`: new verbs only, appended. No existing verb is reordered,
  reformatted or changed.
- `docs/specs/297-plan-scenarios.md`: this file.

Must not change: anything under `app/`. This ticket changes no app
behavior. A mutation is made in `app/` only to prove a scenario can fail,
and is restored before the commit.

## Constraints

- `AGENTS.md` § Test seams: the Coach seam. A scenario never reads `state`,
  never imports app code, and asserts only what a coach sees.
- The file is shaped like `test/roster-scenarios.test.js` and
  `test/game-day-scenarios.test.js`: skipped without Chrome (`hasChrome`),
  one `Coach` per file, and an `afterEach` that fails if the page logged an
  error.
- Reuse `Coach.onGameDay()`, `tap`, `sees`, `controls`, `text` and
  `comeBackDaysLater(0)`. Do not write a second fixture or a second way to
  reload.
- Driver changes are add-only. Other lanes (#298, #299) also add verbs to
  `test/coach.js`, and lanes are rebased on each other after each merge.
- American spelling.

## Design

New Coach verbs, appended to `test/coach.js`:

- **`planMinutes()`**: the Plan's Minutes per Player, as `{ name: minutes }`.
  Read from the timeline's name buttons, which a screen reader reads as
  `Ana Reyes, 16 minutes, on the floor for 4 of 8 stints`.
- **`planStints()`**: the Stint count the timeline shows, the `N` in `of N
  stints`.
- **`starters()`**: the starting five the card prints, in card order, as
  the card shows them (short names like `ANA`). Needs Card view.
- **`lockMinutes(name)`**: tap the Lock on `name`'s By hand row. Every
  row's Lock has the same accessible name (`Hold this number exactly`, or
  `Stop holding this number` once on), so the row is found by the Player's
  slider, `Target minutes for <name>`, and its Lock tapped through the same
  hit-tested tap as `tap`.
- **`lockedMinutes()`**: the names of the Players whose Lock is on, read
  from each row's Lock button pressed state and that row's slider name.

The scenarios live in one `describe('a coach shapes the plan')`, one test
per item 1-6 above.

## Proof

- **The Coach seam** (`node --test test/plan-scenarios.test.js
  test/plan-strategy-scenarios.test.js`) covers items 1-6. Each scenario is written first and seen red against a missing
  verb or a wrong expected value that names the behavior, never an import
  error.
- **Mutation proof**, by hand: at least 4 breaks in `app/`, for example the
  Who's here row's tap, the Format stepper, the Sub interval pick, the
  Shuffle handler, and the Lock's tap or its save. Each break is shown
  turning a named scenario red, then restored.
- **Stability**: 20 runs in a row of each file through `with-smoke-lock.sh`,
  with the time of each run.
- The proof pair (`npm run smoke`, which runs `npm test` inside it) on the
  commit.

## Out of scope

- Any app change, including any bug a scenario finds. A bug is reported,
  not fixed here.
- Removing unit tests.
- Rules (#298) and the Day journey (#299).
- Locking a Player into a Stint. The app has no such feature; Lock is the
  By hand Lock in `CONTEXT.md`.
