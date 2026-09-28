# #159 Removing a unit in a Platoon plan can be undone

## Issue

#159: tapping "Remove unit N" in the Plan sheet's Platoon editor removes the
unit at once with no way back. Make it act now and offer Undo, the way every
other remove action does. Rules: P6, C9.

## Goal

A coach running a Platoon plan taps "Remove unit 2" by mistake. The unit goes,
and a snackbar at the bottom of the still-open Plan sheet says
"Removed unit 2." with an Undo button. One tap on Undo puts unit 2 back, with
the same players, between unit 1 and unit 3, for the same 9 seconds every other
Undo in the app gets.

## Survey (before building)

Read on this branch's base, `main` at 4ed4d19.

| Issue claim | Holds? | What the tree says |
| --- | --- | --- |
| The row is at `app/strategy.js:303` | Yes | `platoonEditor` builds `Remove unit ${i + 1}` at line 303. Its handler (line 305) is `c.units.splice(i, 1); renderStrategy(); edit('unitCount');`. |
| "The snackbar offers no Undo" | Half | There is **no snackbar at all**. `edit()` (`app/edit.js`) saves, retires any live Undo and repaints; it never shows a toast. So the fix adds the snackbar, not just a button on one. |
| Player, rule and game removes go through `undoable` in `app/toast.js` and offer Undo for 9 seconds | Yes | `UNDO_MS = 9000` (`toast.js:66`). Callers: `roster-view.js:580` (player), `rules.js:375` (rule), `teams-view.js:419` and `:630` (team, game), `season-view.js:432` (season game), plus several in `app.js` and `gamemode.js`. |
| Undo would put the unit back with its players, in place | Yes, for free | `undoable` snapshots the whole `state` with `clone(state)` before the change, and Undo calls `replaceState(snap)`. `c.units` is an array of arrays of player ids inside `state`, so order and players come back exactly. No per-action inverse is needed, and `toast.js`'s header says not to write one. |
| The toast is reachable while the Plan sheet is open | Yes | `toastHost()` (`toast.js`) mounts the toast inside the open `dialog.bsheet` (`.bsheet-toasts`), because `showModal()` makes `#toasts` inert. "Remove rule" already relies on this in the same sheet. |

Nothing here needs a product call beyond the toast wording (see Decisions).

## Decisions

1. **Copy:** `Removed unit N.` where N is the number the row showed before the
   tap (`i + 1`). Matches C9's "Removed Harper" shape and the player remove's
   `Removed ${who}.` The units after it renumber on screen; the toast does not
   try to explain that.
2. **Every unit remove gets Undo**, including an empty unit. One rule for one
   control is simpler than a special case, and an empty unit costs nothing to
   put back.
3. **Focus is not changed by this ticket.** Today the removed button takes
   focus with it; that stays as it is (see Out of scope).

## What would settle it

On `RICH` (smoke's rich fixture, 11 players `p0`..`p10`), Hawks game, at
390×844, with the game set to `strategy: 'platoon'` and
`constraints.units = [['p0','p1','p2','p3','p4'], ['p5','p6','p7','p8','p9'], ['p10']]`,
and the Plan sheet open (`#phraseStrategy`):

1. `#stratbody` shows three `.pgrp-h` headers, "Unit 1", "Unit 2", "Unit 3",
   and three "Remove unit N" rows.
2. Tap "Remove unit 2". Then:
   - `game().constraints.units` deep-equals
     `[['p0','p1','p2','p3','p4'], ['p10']]`.
   - `#stratbody` shows two headers, "Unit 1" and "Unit 2".
   - Exactly one `.toast[data-undo]` is live, its `.tmsg` reads exactly
     `Removed unit 2.`, it has a `.tundo` button, and it sits inside
     `#sheetPlan` (read with `readToastExpr('#sheetPlan')`).
   - `#sheetPlan` is still open.
3. Tap that toast's Undo. Then:
   - `game().constraints.units` deep-equals the original three units, in the
     original order.
   - `#stratbody` shows three headers again, and unit 2's picker has exactly
     `p5`..`p9` pressed (`aria-pressed="true"`).
   - No `.toast[data-undo]` is live.
   - `#sheetPlan` is still open.
4. Remove a unit, then make any other edit in the sheet (for example tap a
   player tile in unit 1). The Undo toast is gone. (This is the existing
   `retireUndo` behavior through `edit()`; the check proves the new call
   still goes through it.)
5. `npm test` and `npm run smoke -- --no-tests` are green. Existing checks
   that touch this row keep passing unchanged: `test/button-names.test.js`
   ("Remove unit ${i + 1}" text), `test/one-control-each.test.js` (the row is
   `.prow-danger`), and the `plan sheet` smoke row (0 remove rows with one
   unit, 2 with two).

## Surfaces

Changes:

- `app/strategy.js`: the "Remove unit N" handler, and one new import
  (`undoable` from `./toast.js`).
- `app/sw.js`: `VERSION` and `SHELL`, via `npm run sw:bump` (`strategy.js` is
  precached, `sw.js:62`).
- `scripts/smoke/platoon-undo.mjs` (new) and one row in
  `scripts/smoke/registry.mjs`.
- `docs/specs/159-platoon-undo.md` (this file).

Must not change:

- `app/toast.js`. Everything needed is already exported. No new toast kind,
  no new duration, no second undo mechanism.
- `app/edit.js`'s `EDITS` table. `unitCount` stays as it is.
- `app/state.js` and the other three pure modules.
- `scripts/smoke/plan-sheet.mjs`. It is 37,441 bytes and
  `test/smoke-size.test.js` caps a smoke file at 40,000, so the new check goes
  in its own file.

## Constraints

- **Reuse `undoable(message, mutate, refresh)` from `app/toast.js`.** Do not
  call `clone(state)`/`showUndo` by hand, and do not write an inverse that
  splices the unit back in. The whole-state snapshot is the design
  (`toast.js`, comment above `UNDO_MS`).
- **Pass a `refresh` that does what the handler does today:**
  `renderStrategy(); edit('unitCount');`. This is the same shape as
  "Remove rule" (`rules.js:375`), whose refresh repaints its own section and
  calls `edit('rule')`. Going through `edit()` is what saves the record, marks
  an edit (`editHappened`) and repaints the plan. Do not use `undoable`'s
  default refresh (`setView` + `renderAll`): it skips `edit()`, so it would
  skip `editHappened`. The refresh runs on both the forward tap and the Undo,
  and does the same thing both times, so it can ignore its `isUndo` flag.
- **Order matters, and `undoable` already gets it right:** it runs `mutate`
  then `refresh` (whose `edit()` retires any older toast) and only then shows
  the new toast. Do not call `edit()` after `undoable` returns, or it will
  retire the toast just raised (the comment in `rules.js` above `showUndo`
  says the same).
- **Toast placement is already handled** by `toastHost()`: inside the open
  Plan sheet, above its status line (C9). Nothing to add.
- **Precache bump:** `strategy.js` changes, so run `npm run sw:bump`.
- **American spelling**, and the privacy-claim guard reads string literals in
  `app/*.js`; the new copy "Removed unit N." is safe for both.
- Not a card change, not a layout change: no new CSS.

## Design

In `platoonEditor` (`app/strategy.js`), replace the row's click handler:

```js
rm.onclick = () => undoable(`Removed unit ${i + 1}.`,
  () => { game().constraints.units.splice(i, 1); },
  () => { renderStrategy(); edit('unitCount'); });
```

`game()` is already imported in `strategy.js`. The mutate reads it at tap
time instead of using the `c` the editor captured when it was built. That
matches how `removeRuleFlow` reads `game()` at call time. After an Undo,
`replaceState(snap)` swaps in a new state object, and the refresh's
`renderStrategy()` builds fresh rows, so no stale closure is left over.

Importing `undoable` into `strategy.js` makes no cycle: `toast.js` does not
import `strategy.js`, directly or through `gamemode.js`, `trap.js` or
`backup.js`. `toast.js` is already in the boot graph, so the pinned
`requests` count does not move.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| New smoke row `remove a platoon unit, then Undo` (`scripts/smoke/platoon-undo.mjs`, `setup: 'rich'`, `selectable: true`) | `node scripts/smoke.mjs --no-tests --only "remove a platoon unit, then Undo"` while iterating; the full proof pair at commit | Items 1 to 4 |
| Existing `test/button-names.test.js`, `test/one-control-each.test.js` | `npm test` | Item 5 (row text and class unchanged) |
| Existing smoke row `plan sheet` | the proof pair | Item 5 (remove-row counts unchanged) |

Why a smoke check and not a `node --test` unit test: `strategy.js` imports
`state.js`, which reaches for `localStorage` at import time, and the handler
is a DOM callback. `test/remove-player.test.js` and `test/undo-view.test.js`
say the same about their own subjects. A source-reading test that
`strategy.js` contains `undoable(` would not prove the unit comes back, so it
is not a seam here.

Build the new check the way `scripts/smoke/rule-edit.mjs` item 7 checks
"Remove rule": set the game with `setGame` (`sheet-drive.mjs`), open the
sheet with `tap`, read the toast with `readToastExpr('#sheetPlan')`, click
`.toast[data-undo] .tundo`, and read state from `state.js`'s own exports.
Write it red first: on `main` item 2's toast assertion fails because no
toast appears. Leave the Hawks game as the check found it (back to `even`,
units cleared), the way `plan-sheet.mjs` does. `/new-guard` applies, since it
is a smoke check.

`/browser-verify` once at 390×844: the toast sits inside the Plan sheet above
its status line and the Undo button is on screen and tappable.

## Overlap with work in flight

None. The sibling fixes #187 to #191 and #195 to #198 are about text cut off
at 320px with 32px text, mostly CSS in `app/app.css`'s
`@media (max-width: 19em)` block and entries in `CLIP_SWEEP_KNOWN_ISSUES`.
This change touches `app/strategy.js`, a new smoke file and
`scripts/smoke/registry.mjs`. The only shared file is `app/sw.js`, whose
`VERSION`/`SHELL` conflict the merge driver clears (`npm run setup`, then
`npm run sw:bump` after a rebase). `registry.mjs` may need a trivial
rebase if a sibling adds a row next to this one.

## Out of scope

- **Where focus lands after the remove or the Undo.** Today the focused
  button is removed and focus drops out of the list. "Remove rule" moves
  focus to the next row; "Remove unit" never has. That is a separate
  keyboard-and-screen-reader change, worth its own issue if wanted.
- "Add unit" gets no Undo. It is not destructive.
- No change to how units renumber after a remove.
- The toast still disappears if the coach closes the Plan sheet before
  tapping Undo, as it does for "Remove rule" today.
