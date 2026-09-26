# #134 — A mid-game change that rebuilds the rotation offers Undo

## Issue

#134: while a game is underway, changing Format, Sub interval, Who's here or
a Plan setting rebuilds the whole rotation, drops the coach's hand swaps and
rewrites the minutes already played, and the only button is Dismiss.

## Goal

One stray tap on the sideline is one tap to take back. When a change
rebuilds the rotation of a game that is underway, the change still goes
through, and the snackbar offers Undo. Undo puts back the plan, the hand
swaps and the current stint exactly as they were.

## Decided (owner, on the issue, 2026-09-25)

Option 1 only: act, then offer Undo (P6, C9). "Keep what's been played"
(option 2) and "lock the sentence while underway" (option 3) are out of
scope; either would be its own issue.

## What would settle it

"Underway" means part-played: `stage(p, g.live) === 'part-played'` from
`app/live.js`. It does not mean not-started or finished.

1. The issue's steps, on RICH's Hawks game (`g0`):
   - Start the game.
   - Make a "This stint" hand swap.
   - Step forward two stints.
   - Change Format with the − stepper on minutes per period.
   The snackbar reads "Rotation changed. The swaps you made by hand were
   cleared." and carries an **Undo** button, not only Dismiss.
2. Tapping Undo restores all of these to their values before the change:
   - the game's periods and period minutes
   - `live.overrides` (the swap is back)
   - `live.at` (the same stint is current)
   - every player's played minutes as the game screen shows them (the
     same numbers as before the change)
3. The same holds, with the same toast and the same Undo, when the change is
   Sub interval, Who's here (marking a player absent from the sentence), or a
   Plan-sheet setting (the strategy seg is enough to prove it). Each is a
   test.
4. An underway game with **no** hand swaps whose rotation changes also gets
   an Undo. The toast reads "Rotation changed." with no sentence about swaps,
   because the played minutes were rewritten all the same.
5. No new toast when:
   - the game is not started or finished, which is today's behavior (a
     not-started game with swaps still gets today's no-Undo "swaps cleared"
     message, unchanged)
   - the change leaves the rotation identical (a rename, an opponent name,
     a tip-off time)
   - the repaint is Undo's own restore
   - the change came through an existing `undoable` action that already
     offers its own Undo (for example "out for the rest"). That action keeps
     its own toast; it must not be replaced by a second one.
6. The toast fits at 390×844 and at 320px wide with 32px root text. It
   reuses the existing undo toast, so this is a check, not new CSS.

## Surfaces

- Likely changes:
  - `app/render.js`, where `overridesDropped()` → `flash(...)` lives today
  - `app/state.js`: `syncOverrides` and the rotation stamp. The stamp must
    now be kept for an underway game even when it has no overrides.
  - `app/toast.js`: the snapshot handed to `showUndo`
  - `app/sw.js`: the precache bump
  - tests
  - a smoke check
- Must not change:
  - `app/engine.js` (AGENTS.md: leave it alone unless the task is about it)
  - `app/live.js`'s `stage` rules
  - the Regenerate button's own message at `app/app.js:135`
  - how `undoable` behaves for its existing callers

## Constraints

- Reuse `stage()` from `app/live.js` for "underway". Do not re-derive it
  from `live.at` or `live.finished`; `test/live-guard.test.js` enforces this.
- Reuse the existing undo toast: `showUndo` / `undoable` in `app/toast.js`,
  its 9-second window, and its "one live undo toast" rule. Undo restores a
  whole-record snapshot, the way every other Undo in the app does. Do not
  write a per-field inverse.
- Every edit already goes through `edit()` (`app/edit.js`), which retires
  any pending Undo before the change. The snapshot Undo restores has to be
  the record **before** the edit. By the time `render()` runs, the mutation
  has already happened. The design below is one way to get the pre-edit
  record; the developer may choose another if it is simpler, and should say
  why.
- A snapshot costs a `clone(state)` (a few KB). Take one only while some game
  in the day is underway, not on every repaint of every screen.
- Precache: app files change, so bump `VERSION` in `app/sw.js` and set
  `SHELL` to the digest `npm test` names.
- P6 (act, then offer Undo), C9 (snackbar with Undo).

## Design (suggested)

1. Keep a "settled" snapshot: at the end of each `render()` (after
   `computeAll()` and `save()`), if a game in the active day is underway,
   hold `clone(state)` as the last settled record. Otherwise hold nothing.
2. In `computeAll()`, record for each underway game whether its rotation
   stamp moved since the last settled render. Record this whether or not it
   had overrides, alongside the existing `dropped` count.
3. In `render()`, if an underway game's rotation moved and a settled snapshot
   exists:
   - show the undo toast with that snapshot
   - the message is "Rotation changed." plus " The swaps you made by hand
     were cleared." when swaps were dropped
   Otherwise keep today's `flash` for dropped swaps.
4. Suppress the new offer during an Undo restore and during an `undoable`
   refresh. A module flag set around both is fine, as long as there is one
   flag, not one per caller.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Rotation-moved detection for underway games; no detection for not-started, finished, or an identical rotation | `node --test` against `state.js` exports (`computeAll`, the stamp) | 4, 5 |
| Edit → toast has Undo → Undo restores periods, minutes, overrides, `live.at` and played minutes | new smoke check "mid-game rotation change offers Undo", on RICH with Hawks underway at `live.at` 2 plus one override | 1, 2 |
| Same for Sub interval, Who's here, strategy seg | the same smoke check, one step each | 3 |
| No second toast after "out for the rest"; none after Undo's own restore | the same smoke check | 5 |
| Toast fit | `/browser-verify` on the preview at 390×844 and 320px/32px | 6 |

## Out of scope

- Keeping the played stints when the rest of the game is rebuilt (option 2).
- Locking the sentence while underway (option 3).
- Any change to not-started or finished games' behavior.
