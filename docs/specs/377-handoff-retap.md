# 377 — Re-tapping a hand-off link keeps a game that is further along

## Issue

#377: opening a hand-off link a second time replaces the assistant's game in
progress with the link's older copy, with no Undo.

## Goal

An assistant who reopens the link from the group text to get back into the
app keeps their place and their swaps. A link that really is newer still
comes in, and a mistaken tap can be undone.

## What would settle it

From the issue's acceptance criteria:

1. A phone has the game in bench mode at stint 6 (clock `6 of 8`) with one
   hand swap. The same link, shared before the game started, is opened again.
   The phone is still at `6 of 8` with the swapped five on the floor, and the
   toast reads exactly `You already have this game, further along.`
2. A phone has the game at `2 of 8`. A link for the same game from a sender at
   `4 of 8` is opened. The phone moves to `4 of 8`, and the toast offers Undo.
   Undo puts it back at `2 of 8`.
3. A link for a game the phone does not have imports as today: toast
   `Smoke Test game added. Open bench mode to run subs.`, with no Undo.

## Surfaces

- Changes: `app/handoff.js` (`receive`), `app/app.js` (the boot hand-off block),
  `app/sw.js` (version bump), `test/coach.js` (one verb), a new
  `test/handoff-scenarios.test.js`.
- Must not change: `decode`/`encode` and the link format; `live.js`; `toast.js`.

## Constraints

- "Further along" reuses the `live.js` readers `playedStints`, `handStints`
  and `finishedGame`. It is not re-derived from `live.at` or `live.hand`.
- The Undo is the existing snapshot undo: `clone(state)` before `receive`,
  then toast.js's exported `showUndo`. There is no second undo mechanism (P6, C9).
- The toast is the polite live region A3 asks for; no new announcer.
- `receive()` stays small: #379 changes the same path next.
- Precached files change, so `npm run sw:bump`.

## Design

- `receive()` finds the phone's own copy of the game before it writes
  anything. If that copy is further along than the link's (more stints played,
  more hand swaps, or finished where the link is not), it writes nothing,
  opens the phone's copy, and returns `outcome: 'kept'`. Otherwise it imports
  as before and returns `'replaced'` when the phone had the game, `'added'`
  when it did not.
- `app.js` boot: kept → flash `You already have this game, further along.`;
  replaced → today's message through `showUndo` with the snapshot, after the
  first `renderAll`; added → `flash` as today.

Choices the issue did not decide:

- On the kept path the phone opens its own copy of the game, on the game
  screen (the coach tapped the link to get back into it).
- The replaced path keeps today's toast wording and only adds Undo.
- RICH's 11-player, 8-stint Hawks game stands in for the issue's 9-player
  game; the player count does not change what is tested.

## Proof

| Seam | Covers |
| --- | --- |
| Coach scenario, `test/handoff-scenarios.test.js`, "a link behind the phone changes nothing, and says so" | 1 |
| Coach scenario, same file, "a link ahead of the phone imports, and Undo puts the phone back" | 2, and 3's toast |
| Coach scenario, `test/card-scenarios.test.js`, "a game handed off opens on another phone with the same plan" (unchanged) | 3 |

## Out of scope

- Carrying the day with the game (#379).
- Merging the two copies stint by stint.
