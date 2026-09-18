# 31 — The roster, and a player sheet

## Issue

[#31](https://github.com/kylehoehns/benchcard/issues/31), cut from parent
[#18](https://github.com/kylehoehns/benchcard/issues/18). The Team screen
becomes a plain roster list; tapping a player opens a sheet with everything
about them; reordering, adding and pasting keep working, and every drag has a
button that does the same.

## Goal

A coach opens Team and sees their roster the way they'd read it on paper: one
line per kid, their number in their color, their name, and what level they're
at. Tapping a kid opens one place that holds everything about them — number,
name, the short name the card prints, their level, and the way to take them off
the team. Nothing is edited in the row itself, so the list stays readable at
arm's length and a mis-tap cannot change a jersey number.

## Survey

Read on `efc4692` (main, 2026-09-17), in the worktree for this issue.

**The claims in the ticket all hold.**

- Blockers #22 and #27 are closed. #69 (the Today and game restyle this builds
  on) merged as `38c1a77`/`efc4692`'s ancestors, so the header grammar
  (`#barBack`, `#backBtn` named "Back to Today", `h1#barTitle`), the sheet
  primitive in `app/trap.js`, and the `.pgrp`/`.prow` grouped-list CSS all
  exist already.
- Today's Team screen is a six-column editable grid: `.rhead` +
  `.rlist#rosterlist` of `.rrow`s, each holding a drag grip and two arrow
  buttons (`.rord`), a tinted `.av` disc, `input.num`, `input.pname`, a hidden
  `input.short`, a ✕ `button.xbtn`, and a five-step level meter. Under it,
  `.rfoot` with "Add player", "Paste a list", a "Card names" toggle, a count
  and a note; then `#levelsfoot`; then the `#bulkwrap` fold.
- The prototype's Team screen (`notes/mockups/prototype/index.html:494-496`,
  `light-team.png` / `dark-team.png`) is a large in-page title (team name,
  34px/700/-.025em) with a muted sub ("11 players"), then one `.grp` of `.row`s
  — 30px badge, name, muted level name, chevron — at `min-height: 46px`,
  `padding: 0 16px`, `--inset: 58px` dividers.
- The prototype **does** have a player sheet
  (`notes/mockups/prototype/index.html:614-622`): a 56px badge, a 24px/700
  name, a 15px muted level line, a "Level" group heading, a five-button numeric
  segment, a footnote, then a centered red "Remove from team" row. It has **no**
  Number / Name / Card name fields; the ticket adds those.
- The prototype has no Edit mode, and its `+` opens the same paste sheet. The
  ticket asks for both a real Edit mode and a separate add-one-player sheet.

**What the current tree pins that this change moves** (from the test inventory
run over `test/` and `scripts/`):

| File | What it pins | What has to happen |
| --- | --- | --- |
| `test/roster-order.test.js` (all 4 cases) | the `.obtn`/`.rgrip` grip + arrows in `roster-view.js` and the `max-width: 620px` CSS that hides the arrows | re-point at the Edit-mode reorder |
| `test/note-placement.test.js:71-77` | the card-name note sits next to `#cardnames` inside `.rfoot` | re-point at the player sheet's card-name row |
| `test/remove-player.test.js:111-115` | a source slice between `x.onclick` and `row.append(num` | re-anchor on the sheet's remove handler |
| `test/team-tab-copy.test.js` (both cases) | fails **closed** (`found > 0`) if the "Team page" levels sentence leaves `index.html` and `balance.js` | keep a levels sentence that names the Team page, or move the guard with the copy |
| `test/settings.test.js:256-265` | the `tieBreak === 'levels'` note lives in `roster-view.js` | keep it in `roster-view.js` |
| `test/leak.test.js:54-66` | the "never printed / never shown in bench mode" promise lives in `balance.js` + `roster-view.js` | keep it in `roster-view.js` |
| `test/render-sections.test.js:28-34` | the `levels` KEEP reason says meters live inside roster rows | reword the reason |
| `test/dead-id.test.js`, `dead-class.test.js`, `dead-icon.test.js`, `dead-var.test.js`, `dead-export.test.js` | every id/class/icon/custom property/export has a reader, both directions | delete what stops being used in the same commit |
| `scripts/smoke/rich-fixture.mjs:22-23,51` | a `#view-team` button whose text matches `/back to the same level/i` | keep that button on the Team screen |
| `scripts/smoke/overlay.mjs:30-32` | the `team + bulk add` state opens `#bulktoggle` and shows `#bulkwrap` | replace with the new sheets |
| `scripts/og.mjs:473` | counts `#rosterlist .rrow` into `box.names`, which nothing reads | dead line; delete it |

`scripts/smoke/touch.mjs`, `sweep.mjs`, `app-large-text.mjs` and
`type-scale.mjs` already visit `team` and will re-measure the new screen for
free. `touch.mjs`'s header comment records that `input.num` (38.4px) and
`.bal-step` (41.9px at 320px) are the two controls that make the current Team
screen the tightest in the app — this change deletes both.

The RICH fixture (`scripts/smoke/fixtures.mjs:12-16, 83-118`) is 11 players,
`p0`–`p10`, every `shortName` empty, no duplicate jersey numbers, and only two
players off the default level (Hana Kim at 5, Nia Brooks at 1).

## The look to match

`notes/mockups/prototype/light-team.png` and `dark-team.png` at 390×844, plus
the player sheet from `notes/mockups/prototype/index.html:614-622` (which has
no PNG of its own — the sheet chrome is `light-sheet-who.png`'s).

Values read out of the prototype, mapped to `app/tokens.css`:

| Prototype | Token |
| --- | --- |
| title 34px / 700 / -.025em | `--fs-large` |
| row text 17px | `--fs-headline` |
| sub, level line 15px | *no 15px token* — `--fs-secondary` (.875rem = 14px) is the nearest step, and T2 says the scale wins |
| footnote 13px | `--fs-footnote` |
| group radius 12px | `--r-sm` |
| group background | `--surface` |
| sub / level name / footnote color | `--muted` |
| chevron | `--faint` |
| row min-height 46px | **48px** — I1 wins |
| badge 30px, white text on solid hue | **kept as the app's tinted `.av` disc** — see Decision 1 |

## Decisions made in this spec without asking

The ticket is `ready-for-agent` and every acceptance criterion has a concrete
value, so these are settled here rather than raised.

1. **The number badge keeps the app's tinted disc, not the prototype's solid
   hue with white text.** The prototype paints `background: oklch(var(--pc-l)
   var(--pc-c) HUE)` with `color: #fff` at 13px/700. White on
   `oklch(63% .145 h)` measures about **2.9:1**, and K5 sets the floor at
   **4.5:1** for text. The app's existing `.rrow .av` — an 18% tint of the
   player hue behind `color-mix(in srgb, var(--c) var(--av-ink), #000)` text,
   with a 1.5px inset ring in the full hue — reads as the same "this player's
   color" signal (K2) and clears 4.5:1 in both themes. Keeping it also keeps
   `--av-ink` / `--av-ring` read, which `test/dead-var.test.js:80` and
   `test/graphite-tokens.test.js:215-230` both require. Size stays `2rem`
   (32px, on the 8px grid) rather than the prototype's 30px.

2. **The header is back + "Edit" + "+", not the prototype's "Settings" + "+".**
   N4 puts the gear on Today only, and #22 already moved every team setting
   into Settings, so a second door from Team would be a second answer. C1 allows
   at most two actions on the right: "Edit" (which becomes "Done") and a `+`
   named "Add a player". Both are shown only on `team`, the same way `#shareBtn`
   is shown only on `games`.

3. **`team` joins `NO_BAR_TITLE`.** The screen gets the prototype's in-page
   `h1` (the team's own name) with a muted "N players" sub, so `#barTitle`
   would be a second copy of the screen's identity. `applyView` still *writes*
   "Team" into `#barTitle` before hiding it, which is what
   `scripts/smoke/today-and-back.mjs:263` reads (`textContent`, not
   visibility) — the same arrangement `games` and `season` already have.

4. **Everything stays in `app/roster-view.js`; no new module.** A
   `player-sheet.js` would have to be added to `app/sw.js`'s hand-maintained
   precache list, and would move the two sentences that `test/leak.test.js:54`
   and `test/settings.test.js:256` read out of `roster-view.js` by name. One
   file keeps both guards true without editing them and keeps the precache list
   alone. The file goes from 23.6KB to roughly 30KB, well under the 60KB
   read-in-parts threshold, and there is no size cap on `app/` files.

5. **"Closing with text entered asks before discarding" is asked *inside* the
   sheet, not in a second overlay.** `confirmAction` in `app/toast.js` shows
   `#confirm`, a `div.keyswrap` at `z-index: 320`. A sheet opened with
   `showModal()` sits in the browser's top layer and marks everything outside
   it inert, so `#confirm` would paint *behind* the sheet and take no taps.
   C5 also caps the app at one overlay, at most one level deep. So `app/trap.js`
   gains a close-guard seam — a registry a dialog can opt into, which
   `closeSheet` consults before it starts closing — and the paste sheet uses it
   to swap its footer for an ask row: "Discard what you typed?" with
   **Keep editing** and **Discard** (W2: buttons are verbs). Escape, the ✕ and
   a backdrop tap all route through the same guard.

6. **The levels legend and the levels footnote leave the Team screen; the reset
   button stays.** Every row now spells its level out in words, so `#levelskey`
   (the shape-and-color legend) and `#levelsfoot`'s explanation are a second
   copy of what the rows already say. The explanation moves to the player
   sheet's footnote under Level, where the `tieBreak === 'levels'` branch and
   the "never printed, never shown in bench mode" promise go with it (keeping
   `test/settings.test.js:256` and `test/leak.test.js:54` true). **"Put
   everyone back to the same level" keeps its exact wording** and moves to a
   second `.pgrp` on Team below the roster, shown only when `levelledCount()`
   — `scripts/smoke/rich-fixture.mjs` reads that button's text as its "the rich
   fixture is really loaded" probe, and the copy staying identical is what lets
   that check survive with no rewrite.

7. **Edit mode keeps the grip *and* shows the arrows on a phone.** Today's CSS
   hides `.rrow .obtn` below 620px, so a phone has only the drag. I3 says every
   drag needs a visible button that does the same, and a phone is the only
   device this app is designed for — so the `max-width: 620px` rule that hides
   the arrows is deleted and Edit rows show grip + move-up + move-down at every
   width. Removal is **not** in the Edit row: C6 says every row is removable
   from its detail, and the detail is the player sheet.

8. **The first-run/empty state is designed, not inherited.** With no players the
   screen shows a short heading, one sentence saying what to do, and the two
   ways to do it (W4). #30 shipped a visible defect in exactly this state
   because nobody opened it; it is a required screenshot here.

9. **`#dupewarn` stays** — a duplicate jersey number is a fact about the whole
   roster, not about one player, so it keeps its `role="status"` line, moved to
   sit between the in-page title and the roster group.

## What would settle it

Measured against the RICH fixture (11 players) at 390×844 unless a width is
named.

1. Team shows **11 rows in roster order**, each one a single button containing,
   left to right: a 2rem number badge tinted with the player's hue, the
   player's full name, the name of their level (`Developing`, `Learning`,
   `Regular`, `Reliable`, `Go-to`), and a chevron. Row height **≥ 48px**. Hana
   Kim's row reads `Go-to`; Nia Brooks's reads `Developing`; the other nine read
   `Regular`.
2. No text input, no ✕, no level meter and no "Card names" control appears
   anywhere on the Team screen outside a sheet.
3. Tapping Marcus Williams's row opens a sheet whose heading is his name, with
   rows for **Number** (`4`), **Name** (`Marcus Williams`), **Card name**
   (empty field showing the automatic short name as its placeholder — for
   Marcus Williams that is `MARC`, which is what `deriveShortNames` yields and
   what the card prints; changing that derivation would move the printed card
   and is out of scope),
   a **Level** group of five steps with `3` selected, a footnote naming the
   selected level, and a **Remove from team** row.
4. Tapping **Remove from team** closes the sheet, drops the row from the list
   (10 rows), and shows an undo snackbar whose text names the player and any
   games affected. Undo restores him at his original index.
5. The header `+`, named **Add a player**, opens a commit sheet: ✕ at the top
   **left**, a **Number** and a **Name** field, and a confirm reading exactly
   **Add player** (C4).
6. **Paste a list** opens a commit sheet with a textarea that accepts the
   formats `parseRoster` accepts today. With three lines typed the confirm reads
   exactly **Add 3 players**; with one line, **Add player**. Typing text and then
   pressing ✕, Escape or the backdrop does **not** close the sheet — it shows
   an ask with **Keep editing** and **Discard**. With the textarea empty, ✕
   closes immediately.
7. **Edit** in the header switches the list to reorder mode: every row shows a
   drag grip and a move-up and a move-down button, each **≥ 48px**, at 320px as
   well as 390px. The first row's move-up and the last row's move-down are
   disabled. The grip's accessible name says it takes the arrow keys and names
   the position it is at. A drag cancelled with `pointercancel` puts the row
   back where it started. **Done** returns to the tapping list.
8. Every control on the screen and in all three sheets measures **≥ 44px** in
   the smoke audit at 320, 360 and 390px, and no element's box crosses the
   viewport edge across 300–420px.
9. At **320px with a 32px root font size**, the screen and all three sheets lay
   out with no sideways pan beyond what `APP_LARGE_TEXT_ALLOW` permits — which
   is empty and stays empty.
10. With **zero players**, Team shows a heading, one sentence of what to do, and
    both an "Add a player" and a "Paste a list" control, with nothing clipped
    and no empty group box.
11. `npm test` and `npm run smoke` are both green, with `requests` still pinned
    at 39.

## Surfaces

**Changes**

- `app/index.html` — the `#view-team` markup, the two new header buttons, and
  three new `<dialog class="bsheet">` sheets (player, add player, paste a list).
- `app/roster-view.js` — the screen's painter and the player sheet, the Edit
  mode, the add and paste sheets, `removalCosts` (kept, same name and shape).
- `app/app.css` — the roster blocks at 495-526, 1204-1266, 3448 and 3477-3490
  go; the `.pgrp`/`.prow` grammar is reused with a `#view-team` modifier the way
  `#view-season .pgrp` already does.
- `app/app.js` — the `#addplayer` / `#bulktoggle` / `#cardnames` / `#bulkadd` /
  `#bulk` wiring (lines 200-241) is replaced by the sheets' wiring.
- `app/render.js` — `team` joins `NO_BAR_TITLE`; the two header buttons get the
  same show-on-one-screen treatment `#shareBtn` has; `SECTIONS.levels`'s KEEP
  reason is reworded. `test/storage.test.js` bans the literal `'roster'` in
  every `app/*.js` (it is the superseded view key), so structural edits call
  `renderRoster()` directly rather than `soon('roster', …)`, and a field or
  level edit repaints only its own row.
- `app/trap.js` — the close-guard seam (Decision 5).
- `app/balance.js` — `noLevelsLine()`'s pointer at "Set a level under each name
  on the Team page" is reworded for the sheet; `levelMeter` is reused unchanged.
- `app/roster.js` — a pure `confirmAddLabel(n)` for the two confirm strings.
- `app/sw.js` — `VERSION` bumped and `SHELL` set to the digest `npm test`
  prints, in the same edit.
- `app/icons.js` — `clipboard-list` and `trash-2` removed once nothing asks for
  them. `test/dead-icon.test.js` also holds `app/vendor/fetch.sh`'s download
  list to `app/icons.js` in both directions, so the two names come out of
  `fetch.sh` and the two SVGs under `app/vendor/icons/` are deleted with them.
  That is the only `app/vendor/**` change and a guard forces it.
- `scripts/budgets.mjs` — `bytesAbs` widened with a reason if the new sheets
  cross it. Routine; not a decision.
- `scripts/og.mjs` — the dead `#rosterlist .rrow` count at line 473.
- `test/roster-order.test.js`, `test/note-placement.test.js`,
  `test/remove-player.test.js`, `test/render-sections.test.js`,
  `test/roster.test.js`, `test/team-tab-copy.test.js` — re-pointed.
- `scripts/smoke/team-screen.mjs` (new), `scripts/smoke/registry.mjs`,
  `scripts/smoke/overlay.mjs` — the new states and checks.
- `notes/mockups/prototype/compare/31/` — the side-by-side screenshots.

**Must not change**

- `scripts/budgets.json` — recorded baseline; never hand-edited, never
  `--update-budgets`.
- The `requests` budget, hand-pinned at 39.
- `APP_LARGE_TEXT_ALLOW` — empty, stays empty.
- `app/vendor/**`, the generated chart pages.
- `app/state.js`'s `removePlayer` sweep and the `MUST_SWEEP` list in
  `test/remove-player.test.js:1-52`.
- `app/roster.js`'s `parseRosterLine` / `parseRoster` / `callNames` /
  `duplicateNumbers` / `repeatIndexes` behavior.
- `levelFromKey`, `LEVELS`, `SHAPES` in `app/balance.js` and the contract
  `test/level-keys.test.js` holds them to.
- The header grammar: `#backBtn` named "Back to Today", `#barTitle`'s
  `textContent`, the gear hidden off Today.
- `app/card.js` and the printed card. Levels are never printed.

## Constraints

- **Mobile first.** 390×844 is the design width; 320px is the floor. One-thumb
  reach: the two header actions are the only controls above the fold that are
  not rows, and the primary action of every sheet sits at its bottom.
- **The precache trap.** `app/index.html`, `app/app.js`, `app/app.css`,
  `app/roster-view.js`, `app/render.js`, `app/trap.js`, `app/balance.js`,
  `app/roster.js` and `app/icons.js` are all precached. Bump `VERSION` and set
  `SHELL` to the digest `npm test` names, **in the same edit**. `scripts/` and
  `test/` are not precached.
- **Reuse, do not re-derive.**
  - Reuse `.pgrp` / `.pgrp-h` / `.pgrp-f` / `.prow` / `.prow-t` / `.prow-v` /
    `.prow-chev` from `app/app.css`. Do not write a second grouped-list
    grammar. `#sheetCard .pgrp .prow-select` is the prior art for a real form
    control inside a `.prow`.
  - Reuse `openSheet` / `closeSheet` / `wireSheet` / `pushPane` / `popPane` /
    `returnFocus` from `app/trap.js`. Do not hand-roll a dialog.
  - Reuse `levelMeter(p)`, `levelKey()`, `levelFromKey`, `paintMeter`,
    `repaintLevels`, `levelledCount`, `resetLevels` from `app/balance.js`. The
    sheet's level control **is** `levelMeter`, restyled by CSS only.
  - Reuse `removalCosts(id)` and keep the name — `test/remove-player.test.js`
    lifts it out of `roster-view.js` by that name and runs it.
  - Reuse `undoable` / `offer` / `flash` from `app/toast.js` for remove and for
    the paste-repeats offer. P6: undo, don't ask.
  - Reuse `parseRoster` / `repeatIndexes` / `focusAfterRemoval` / `dropIndex`
    from `app/roster.js`.
  - Reuse `movePlayer`, the pointer-drag block and `paintDupes` /
    `dupeMessage` from `app/roster-view.js` rather than rewriting them.
  - Reuse `stepperRow`'s `.prow` shape from `app/game-setup.js` for any row
    that carries a control.
- **Interface guidelines this ticket names.** C3 (sheets on `<dialog>`, half
  and full rest heights), C4 (live sheet = ✕ only, top right; commit sheet = ✕
  top left plus a named confirm; ask before losing typed text), C6 (rows ≥48px,
  one control per row, a chevron means it opens, every row removable from its
  detail), I1 (48px touch targets), I3 (a gesture is a shortcut — every drag
  has a visible button), P6 (undo, don't ask).
- **Also binding here:** C1 (back left, title, at most two actions right), C5
  (one overlay, at most one level deep), C9 (undo snackbar), K1 (tint on three
  things only), K2 (a player's color means that player, name always beside it),
  K5 (4.5:1 text contrast), W1 (sentence case), W2 (buttons are verbs), W3 (no
  help icons, at most one gray line under a group), W4 (problems say what to
  do), T2/T3 (rem sizes, nothing under footnote), L6 (8px grid, 16px margins),
  N4 (gear on Today only), N5 (icon back button).
- **American spelling** in every string, comment and doc this change writes.
- Smoke modules stay under **40,000 bytes** each (`test/smoke-size.test.js`).
  If `team-screen.mjs` would cross it, split along a real seam — the player
  sheet and the add/paste sheets are two seams — not by raising the limit.
- A guard or test edited here is run **red before it is trusted green**.

## Proof

Seams, agreed here so the build runs unattended.

| # | Seam | Where it runs | Settles |
| --- | --- | --- | --- |
| P1 | `confirmAddLabel(n)` in `app/roster.js` | `node --test`, `test/roster.test.js` | 5, 6 (the confirm copy, both singular and plural) |
| P2 | `parseRoster` / `repeatIndexes` / `focusAfterRemoval` / `dropIndex` in `app/roster.js` | `node --test`, `test/roster.test.js` (existing cases) | 6, 7 |
| P3 | `removalCosts` lifted out of `app/roster-view.js` and run | `node --test`, `test/remove-player.test.js` (existing cases) | 4 |
| P4 | `levelFromKey` / `LEVELS` in `app/balance.js` | `node --test`, `test/level-keys.test.js` (existing cases) | 3 |
| P5 | **Guard** (`/new-guard`): the Edit row carries a drag grip *and* two move buttons, the grip's name promises the arrow keys and names its position, no CSS hides the move buttons at any width, and `pointercancel` restores the row | `node --test`, `test/roster-order.test.js`, rewritten | 7 |
| P6 | **Guard** (`/new-guard`): the card-name note sits inside the player sheet next to the card-name field, and no `p.note` is a loose direct child of `#view-team` | `node --test`, `test/note-placement.test.js` | 3 |
| P7 | **Guard** (`/new-guard`): every id, class, icon, custom property and export that leaves the Team screen stops being referenced, and every one it adds has a reader | `node --test`, the existing `test/dead-*.test.js` family — no new file | 2 |
| P8 | Smoke check **`team screen: roster rows, the player sheet, add and paste`**, new `scripts/smoke/team-screen.mjs`, `setup: 'rich'`, registered in `scripts/smoke/registry.mjs` | `npm run smoke` | 1, 3, 4, 5, 6, 7, 10 |
| P9 | Smoke state list in `scripts/smoke/overlay.mjs`: `team view`, `team player sheet`, `team add a player`, `team paste a list`, `team edit mode` | `npm run smoke`, `a11y in overlays and dialogs` | 1, 3, 5, 6, 7 |
| P10 | Existing sweeps `touch.mjs`, `sweep.mjs`, `app-large-text.mjs`, `type-scale.mjs`, which already carry a `team` state | `npm run smoke` | 8, 9 |
| P11 | `scripts/smoke/rich-fixture.mjs`, re-scoped to the reset-levels button's new home | `npm run smoke`, `rich fixture is live` | 1 |
| P12 | `/browser-verify` at 390×844 light and dark, at 320px with a 32px root, and on the Cloudflare preview | browser | the look, and 8, 9, 10 |

Screenshots committed to `notes/mockups/prototype/compare/31/`, side by side
with the matching prototype PNG, light and dark: the roster list, the player
sheet, the add sheet, the paste sheet with its discard ask, Edit mode, the
**empty / first-run state**, a roster of long real-length names that wrap, every
scroll area scrolled to its bottom, the full-height sheet, everything-open, and
320px at a 32px root font size.

## Out of scope

- The card and its printed output. Levels are never printed and that does not
  change.
- Team color, team name, and every other per-team setting — #22 moved those to
  Settings and they stay there.
- The Today screen's `#todayTeam` entry, its "11 players" text, and the
  `#backBtn` / `#barTitle` / gear chrome.
- Multi-team switching (`#teamMenu`).
- The RICH fixture's player list. It grows only if a state proved here needs a
  duplicate jersey number or a `shortName` override, and neither is in the
  acceptance criteria.
- Any change to `app/state.js`'s `removePlayer`.
