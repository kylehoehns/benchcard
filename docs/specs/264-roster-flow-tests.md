# #264 — Test roster reorder, add/paste commit and the level meter

## Issue

#264: No test has ever reordered the roster, committed an added or pasted
player, or changed a player's level. That is about 175 uncovered lines across
`roster-view.js` (70.5%), `balance.js` (83.0%), `toast.js` and `state.js`.

## Goal

Every way a coach changes the roster's order, adds to it, or sets a level is
driven by a test that checks what the coach then sees: the order of the rows,
the number of players, the level word. The coverage record goes up, and the
smoke run gets no new rows.

## What the survey found

On `main` (cc2ad7f):

- **Reorder** lives in `app/roster-view.js`:
  - `movePlayer` (65-74) is the grip's ArrowUp/ArrowDown path (keydown at
    495-497). It rebuilds the list and puts focus back by `data-fk`.
  - `arrowMove` (82-89) is the ▲▼ buttons. It reuses `rosterDrop`.
  - The drag (123-246) is `rosterDown` → `rosterMove` (5px threshold) →
    `rosterTrack` / `rosterShift` → `rosterUp` → `rosterDrop`. Autoscroll
    (`rosterEdgeScroll`) starts within `DRAG_EDGE` = 60px of the viewport's
    top or bottom. A `pointercancel` puts the row back where it started.
  - `rosterDown` only starts on an Edit row (`.rrow-edit`), on its `.rord` or
    `.av`.
  - `test/roster-order.test.js` reads the source only. Nothing has run a
    reorder.
- **Add and paste** (`roster-view.js`):
  - `#addPlayerGo` (656-658) pushes a player and closes the sheet.
  - `commitPaste` (738-755) appends every parsed line. When some names were
    already on the roster, it shows the offer "N of these were already on the
    roster." (singular: "was") with a Skip them button (`toast.js` `offer`,
    204-205), which removes just the pasted copies.
  - Typing in the player sheet's `#playerNumber` (551-555) is never driven.
- **Smoke today.** `scripts/smoke/team-screen.mjs` `teamScreenPass` opens the
  add sheet (`addSheetOk`) and paste sheet (`pasteSheetOk`) and checks the
  confirm labels and the discard ask, then closes them without committing.
  `editModeOk` turns Edit on and checks every row's grip and arrows, but moves
  nothing. The pass ends by calling `goRich`, so anything it changes is reset
  for the next row.
- **The rich fixture** (`scripts/smoke/fixtures.mjs`) has 11 players, in order
  Marcus Williams, Devon Ellis, Hana Kim, … Nia Brooks. Hana Kim is level 5
  and Nia Brooks level 1, so the "Put everyone back to the same level" row
  (`resetLevels`, wired at `roster-view.js:794`) is on screen.
- **The level meter** (`balance.js` `levelMeter`, 270-363): keys go through
  `levelFromKey`, pointers through `pointerdown`/`pointermove`/`pointerup` on
  the strip, and `pointercancel` repaints the saved level. A tap on the level
  already set (no movement) clears to `DEFAULT_TIER` (3). `test/balance.test.js`
  already builds a meter with `fakeElement()`, whose `addEventListener` drops
  every listener.
- **`state.js` 388** is `removeRule` for `lastq`. `test/plan-sheet.test.js`
  covers `starts` and `rest`, not `lastq`.
- **Helpers to reuse** (`scripts/smoke/sheet-drive.mjs`): `drag`, `dragSlow`,
  `realTap`, `key`, `typeIn`, `evalJSON`, `readToastExpr`.

## Decisions (made with the human)

1. **Node first.** Anything that imports under `test/dom-stub.js` or a fake
   element is tested in `node --test`. Here that is the level meter and
   `removeRule('lastq')`.
2. **Extend rows, do not add them.** Browser flows go into existing smoke
   rows on a page they already loaded. No new row, no new reload.
3. **Assert what a coach sees**, not that a line ran.
4. **Bugs.** A fix of about 20 lines of `app/` or fewer goes in this PR and is
   named in its body. Anything bigger is filed as its own issue.
5. **Report the smoke time** before and after, and re-record
   `scripts/coverage.json` upward.

## What would settle it

On the rich fixture at 390×844, under the smoke clock:

- **A. Arrows.** In Edit mode, tap Devon Ellis's ▲. The rows read Devon
  Ellis, Marcus Williams, Hana Kim, … and `state.players` (read from storage
  after the save) has the same order. Devon's ▲ is now disabled and Marcus's
  is enabled.
- **B. Grip keys.** Focus Marcus Williams's grip and press ArrowDown. Marcus
  moves down one place. Focus is still on Marcus's grip, and its accessible
  name now says his new position ("position N of 11").
- **C. Drag.** Drag the first row's grip down by a little over two row
  heights with `drag()`. The dragged player lands third, the two below it
  move up one, and the order in storage matches. The ▲▼ disabled states match
  the new ends.
- **D. Autoscroll.** Drag a row near the bottom of the list and hold the
  pointer within 60px of the viewport's bottom edge. `scrollY` grows while
  the pointer is held, and the row is dropped below where it could have
  reached without scrolling.
- **E. Cancel.** Start a real drag past the 5px threshold, then end it with a
  `pointercancel` instead of a release. The order on screen and in storage is
  unchanged.
- **F. Add commits.** In the add sheet, type number 30 and name "Pat Quinn",
  then tap Add player. The sheet closes, the roster has 12 rows, and the new
  last row reads Pat Quinn with 30.
- **G. Paste commits, with the offer.** Paste "4 Eli Tran\nZoe Park". Two
  players are added (14 rows after F). A toast reads "1 of these was already
  on the roster." with a Skip them button. Tap it: the pasted Eli Tran is
  removed, the original Eli Tran stays, and Zoe Park stays.
- **H. Jersey number.** In a player's sheet, type a number. The digits show
  in the field (letters are dropped) and on that player's row.
- **I. Level meter, in node.** In `test/balance.test.js`, a fake element that
  records listeners proves:
  - ArrowRight on level 3 commits 4, and ArrowLeft on 1 stays 1;
  - a pointerdown/pointerup at the strip's fourth fifth commits 4;
  - a drag from the first fifth to the last commits 5;
  - a tap with no movement on the level already set clears it to 3;
  - a pointercancel mid-drag leaves the saved level and repaints it;
  - `resetLevels` sets every player to 3.
- **J. Reset, in the browser.** Tap "Put everyone back to the same level".
  Hana Kim and Nia Brooks both read Regular, and the reset row is gone.
- **K. `removeRule('lastq')`.** A case in `test/plan-sheet.test.js` clears the
  last-quarter five and leaves the other rules alone.
- **L. Nothing else moves.** Every existing smoke row stays green. The suite
  stays green. The coverage record is re-recorded higher than 92.2, and
  `roster-view.js` and `balance.js` both rise in the per-file table.

## Surfaces

- **Changes:**
  - `scripts/smoke/team-screen.mjs`: commits in `addSheetOk` and
    `pasteSheetOk`, reorder checks in `editModeOk`, the jersey number in
    `playerSheetOk`, and the reset tap. Order matters: the pass already ends
    in `goRich`, so changes are reset for the next row.
  - `scripts/smoke/sheet-drive.mjs`: only if a helper is missing (for
    example, a drag that holds at its end, or a pointercancel).
  - `test/balance.test.js`: the listener-recording fake element and cases.
  - `test/plan-sheet.test.js`: the `lastq` case.
  - `scripts/coverage.json`: re-recorded.
  - `app/`: only a bug fix under decision 4, with `npm run sw:bump`.
- **Must not change:**
  - any smoke row's count or name, and no new `Page.navigate`/`reload`;
  - the rich fixture and `goRich`;
  - `scripts/budgets.json` (unless bytesAbs needs widening for a fix);
  - `test/roster-order.test.js`'s guards (they stay, alongside the new
    behavioral checks).

## Constraints

- **Real input, not `.click()`, for the drag.** `rosterDown` reads
  `e.target`, `button` and `clientY`, so the drag goes through
  `Input.dispatchMouseEvent` (`drag`). A cancel needs a real pointer that the
  browser then cancels; if CDP cannot produce one, dispatch a
  `PointerEvent('pointercancel')` on `window` mid-drag and say so in the code.
- **The fake clock.** `rosterUp` settles through `transitionend` or a 260ms
  timer. Wait with `settle`, never a fixed sleep.
- **Read order from storage too,** not only the DOM. `rosterDrop` splices
  both, and a check that reads one half would miss the other drifting.
- **Timing.** If a row flakes only with these checks in, stop and report.
  Do not retry until it passes.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Meter keys, pointer, cancel, reset | `node --test`, `test/balance.test.js` | I |
| `removeRule('lastq')` | `node --test`, `test/plan-sheet.test.js` | K |
| Arrows, grip keys, drag, autoscroll, cancel | `teamScreenPass` `editModeOk` | A–E |
| Add, paste and offer, jersey number, reset row | `teamScreenPass` | F, G, H, J |
| Everything still green, coverage re-recorded | one full `npm run smoke -- --update-coverage` | L |

## Out of scope

- Touch-only sheet drag (`trap.js` `wireBodyDrag`) and the bench-mode swipe.
- Share image, backup, season CSV (#263) and Settings and rules (#265).
- Any change to how reorder, add, paste or levels behave, beyond a small fix
  under decision 4.
