# #368 — add overtime from bench mode when a game ends tied

## Issue

#368 (parent #366): on the game's last stint in bench mode, the coach can add
an overtime period, planned as "Next rotation" — the game's strategy and rules
carry on around the minutes already played. #367 (PR #371) built the
`g.overtime` field, the OT/OT2 stints and the freeze for a grid that grows at
the end; this ticket adds the button, the sheet, the live step into overtime,
Undo, the remembered length, and By hand and Platoon overtime. The three
review notes carried over in the ticket's comment are in **Constraints**.

## Goal

A tied game no longer ends the app's help. The coach taps "Tied? Add
overtime", confirms a length, and bench mode moves to the first overtime stint
with a five planned the way the rest of the game was. Overtime minutes count
in Played, the filed game, the season and the day's evening-out. A mis-tap is
one Undo away. A game that never goes to overtime looks exactly as today.

## What would settle it

Default fixture: a game underway, 8 players, 2 × 16, `everyN` 4 (8 regulation
stints), seed fixed, Even strategy unless said.

1. **The button.** On the last stint only, the Next box (`#gmNext`, today
   "Last stint" / "Game ends at 0:00.") also shows a button
   **"Tied? Add overtime"**. It is not in the footer beside Finish game, and no
   earlier stint shows it. It is hidden once the game is finished.
2. **The sheet.** Tapping it opens a commit sheet titled **"Overtime"** with a
   number field **"Minutes"** (whole minutes) and a primary button
   **"Add overtime"**. The field is prefilled with the length this team used
   last time, or **2** for a team that has never added overtime.
3. **Validation.** `0`, `11`, blank and `2.5` disable "Add overtime"; `1` and
   `10` enable it.
4. **After adding.** The game moves to the first OT stint. With an 8-minute
   overtime the header reads **"OT · 8:00 to 4:00"**, and a snackbar reads
   **"Overtime added, 8 min."** with Undo. The stints already played, and every
   hand swap in them, are unchanged.
5. **Sub interval.** 8 min at every 4 gives 2 OT stints; 2 min at every 4
   gives 1; "Only at breaks" gives 1 (engine cases, lengths 1–10 × each mode).
6. **Next rotation per strategy.**
   - Even: the OT five is planned around minutes played (the player with the
     fewest minutes after regulation is on the floor in the first OT stint).
   - Closers: the closing group is on the floor for the last OT stint.
   - Platoon: the first OT stint sends out the next unit in order (unit
     `index % units.length`, as if the game had one more stint).
   - By hand: OT stints are planned as Even around minutes played; the
     coach's saved per-player targets (`targetSlots`) are unchanged, and the
     regulation stints are unchanged.
   - Plays at most: a player at their cap after regulation is not on the floor
     in OT.
   No strategy shows the #134 "rotation moved" toast, and none drops a swap.
7. **Undo** restores the game exactly: no overtime, back on the last
   regulation stint, every swap and every minute as before, button back.
8. **Swap in OT** works as in any stint (pick a floor row, choose a bench
   player).
9. **Second overtime.** On the last OT stint the same button shows; adding
   gives stints named **OT2**.
10. **Played and reopen.** Played includes OT minutes. Closing and reopening
    the app lands on the same OT stint with the same five.
11. **Filing.** After Finish game and filing, the season's minutes and
    behind/ahead include the OT minutes, and a later game the same day is
    evened out against them.
12. **Finish and Undo.** Within the Undo window after Finish game, Undo brings
    the Overtime button back.
13. **Remembered length.** Adding a 3-minute overtime makes the next sheet
    (any game of the team, after a reopen) prefill 3. The setting survives
    storage: an integer 1–10, anything else falls back to 2.
14. **No overtime, no change.** A game that never adds overtime renders and
    plans as today (existing suites unchanged).
15. **Smoke.** The Overtime sheet does not clip or scroll sideways at 320px
    wide with 32px text, and the bench-mode last stint with the button does
    not either.

## Surfaces

Change:
- `app/gamemode.js` — the button in the last-stint Next box, the handler,
  the toast.
- `index.html` — the `#sheetOvertime` markup, a **direct child of `.app`**
  (`inertBehind` inerts everything else under bench mode; prior art
  `#addGameFlow`). Copy the commit-sheet shape of `#sheetAddPlayer`: ✕ top
  left, `.pgrp > label.prow` with a numeric input, `.bsheet-cta` primary.
- `app/live.js` — no new operation. The existing `step` moves the game onto
  the first new stint after overtime is added (`live.at`), so live.js stays
  the only writer of the live record.
- `app/state.js` — the add-overtime state change (push minutes into
  `g.overtime`, remember the length), By hand and Platoon in `resolveRest`,
  By hand slot math measured against regulation.
- `app/engine.js` only if By hand / Platoon need it there.
- `app/storage.js` — the remembered length setting.
- Styles for the button and sheet in the existing stylesheet, reusing
  existing classes first.
- `test/coach.js` — a verb to add overtime by length; scenarios; engine cases.
- `scripts/smoke/` — the new sheet state in the 320px/32px lists.

Must not change: `app/handoff.js` and `app/card.js` (#370), the who-plays
choices (#369), anything a game without overtime renders.

## Constraints

- **`live.js` is the only writer of the live record** (#356,
  `test/live-guard.test.js`).
- **Undo is the whole-state snapshot** (`undoable` in toast.js, injected into
  gamemode.js). Adding overtime is one `undoable`; Undo needs no removal
  operation and restores `live.at` with the snapshot. Do not write a second
  undo mechanism.
- **Reuse #367's freeze.** Adding overtime goes through `computeAll` →
  `syncOverrides` → `sameGrid` (prefix of OT stints) → `freezePlayedAndReplan`
  → `resolveRest`. Do not re-plan the OT stints a second way.
- **By hand targets** (carried over): `stintShape` counts OT stints, so
  `slotsToMinutes`' average and `normalizeTargets`' capacity move once a By
  hand game has overtime, and `normalizeTargets` can rewrite the coach's
  saved `targetSlots`. By hand slot math is regulation; OT falls back to Even
  and leaves the targets alone.
- **Taking off overtime that is being played** (carried over): Undo restores
  the whole snapshot including `live.at`, so the out-of-range `live.at` case
  cannot arise from Undo. No other path removes overtime in this ticket.
- **Closers** (carried over): the closing window is the last N stints. The
  button only exists on the last stint, so regulation is already played when
  OT arrives; keep it that way.
- **Remembered length** is a team setting in `DEFAULT_SETTINGS` /
  `sanitizeSettings` (add it to the key list comment), integer 1–10, default 2,
  written when overtime is added. The 1–10 rule is the same as
  `cleanOvertime`'s; one answer — reuse it.
- Interface rules P6 (act, then Undo), C3/C4 (commit sheet: ✕ top left,
  confirm named for the result), C9 (one-line snackbar), I1 (48px targets), I2
  (bottom half, thumb reach — the button is in the Next box, not the footer),
  W1/W2 (sentence case, verb buttons), T4, A3 (the plan change is announced
  politely).
- `engine.js`, `budget.js`, `roster.js`, `storage.js` are pure modules:
  changes come with `node --test` cases.
- Run `npm run sw:bump` when a precached file changes.

## Design

Bench mode's last-stint box gains the button. It opens `#sheetOvertime`,
prefilled from the team setting. "Add overtime" runs one `undoable`: append
the minutes to `g.overtime`, store the length on the team, recompute (the
#367 freeze plans the new stints), then the existing `live.js` `step` moves the
game onto the first OT stint; the snackbar reads "Overtime added, N min.".
`resolveRest` stops refusing By hand and Platoon for a suffix that is only
overtime: By hand plans it with Even targets around minutes played, Platoon
continues the unit order by global stint index.

## Proof

- **Coach seam** (`test/coach.js`, a new verb `addOvertime(minutes)`), new
  scenario file beside `test/bench-mode-scenarios.test.js`: items 1–4, 6
  (Even, Closers, By hand, Platoon, Plays at most — what is on the floor),
  7–13.
- **`node --test` on the engine / `buildStints` / `resolveRest`**: item 5
  across lengths 1–10 × `everyN`/`perPeriod`/`breaksOnly` × each strategy
  (five on the floor in every OT stint, no stint before the freeze moved).
- **Storage, `node --test`**: item 13's sanitizing.
- **Smoke** (`scripts/smoke/app-large-text.mjs` / `overlay.mjs`): item 15;
  the existing suites cover item 14.
- **`/browser-verify`** on the preview: items 1, 2, 4 at 390×844.

## Out of scope

- Who-plays choices (#369). Share link and card labels (#370).
- Sudden death. Removing overtime other than by Undo.
- Reopening a finished game into overtime after the Finish Undo window.
