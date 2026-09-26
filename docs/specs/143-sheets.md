# #143 — The list sheets share one background, one row, one check

## Issue

#143 (item 13 of #153, no blockers). The bottom sheets do not match each
other or the prototype. Who's here and Sub interval are white with
full-width rows. Format and Plan are gray with white inset groups. The
chosen sub interval is a solid ink bar. Who's here has no player badges and
a thin gray check. On the card sheet the preview is large, so the options
start low. Rules named: C3, C6, K2, L1.

## Goal

Every list sheet looks like one family: a gray sheet, white inset groups,
48px rows, and a bold ink check on the chosen row with no fill. Who's here
shows each player's badge. The card sheet shows a smaller preview, so the
buttons and the first options fit on a phone screen without scrolling.

## Survey (main at 280dad6, 390×844, RICH fixture, light and dark)

Measured with a scratch probe built on `scripts/smoke/chrome.mjs`,
`dom.mjs` and `fixtures.mjs` (`goRich`). The full smoke suite was not run.

| # | Claim in the issue | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Who's here and Sub interval are white, no group | holds | `#sheetWho`, `#sheetInterval` are `bsheet` without `.grouped`: background rgb(255,255,255) light, rgb(28,28,30) dark. No `.pgrp`. Rows are full-width `.sheetrow`s with a top border. |
| 2 | Format and Plan are gray with white groups | holds | `.grouped`: rgb(241,241,245) light, rgb(20,20,22) dark (`--sheet`). Rows sit in `.pgrp` (`--surface`). |
| 3 | The chosen row is a solid ink bar, `.sheetrow` has .1rem side padding at app.css:3418 | holds, line changed | Rule is now app.css:3777-3791. `.sheetrow.sel` fills with `--tint` = ink: rgb(28,28,30) light, rgb(244,244,246) dark, text inverted, weight 600, radius 12px. Side padding 1.6px: "Every 4 min" text starts at x=19.2, the bar at x=17.6. |
| 4 | Sub interval and first-run step 2 use the fill; the rest use a check | holds | Both go through `paintGranRows` (game-setup.js:339, shared with onboarding.js `stepFormat_`). |
| 5 | Who's here rows have no badge | holds | `whoRow` (game-setup.js:~208) builds `.sheetrow-t` + `.sheetrow-state` only. The badge went away when #27 (8071ee5) replaced the old availability pill, which had one. |
| 6 | Who's here checks are thin and gray | holds | `.sheetrow-state` is a "✓" text glyph in `--muted` (rgb(108,108,114) light, rgb(152,152,159) dark), 14px, weight 600. |
| 7 | Card preview is about 331px on a darker band | holds (band barely darker) | Card 331.2px wide at zoom 1. `.stage#sheetCardPreview` spans the full 390px. Band is `--bg-2` + a radial gradient: rgb(240,240,242) vs the sheet's rgb(241,241,245) light; rgb(19,19,20) vs rgb(20,20,22) dark. |
| 8 | Print/Share sit around y=690 | changed-since (close) | Top at y=664. |
| 9 | The settings rows fall off the screen | partly falsified | The sheet opens full height (top y=68). The first option row ("Print") spans y=729-779 and is on screen. Copies is 779-829. Size (829-879) and the rest are below the fold. Body scrollHeight 877 vs clientHeight 701. So the issue's own bar ("at least the first settings row") is already met; the real gap is the preview size. |
| 10 | "Print" appears twice | holds, but matches the prototype | The button and the first option row both say Print. The prototype's card sheet has the same "Print — This game ›" row, so this is not a difference from the prototype. |
| 11 | Share image is outlined | mostly holds | `#shareCard` is `btn press`: `--surface` fill plus a 1px border (rgba(28,28,30,.15) light, rgba(244,244,246,.16) dark). The prototype's `.primary.quiet` is a surface fill with no border. |

Other facts found:
- `.prow-check` (app.css:3557, ink, weight 700) already exists: the Lineup
  balance picker (balance.js) uses it for its chosen row.
- The app's player badge is `.rrow .av` (app.css:1377): a 2rem circle, an
  18% tint of `--c`, `--av-ink` text and an `--av-ring` ring, filled by
  `initials(p)` (state.js:54, jersey number or first two letters) with
  `--c` = `colorOf(p.id)`. It is tinted on purpose for contrast (tokens.css
  comments on `--av-ink`/`--av-ring`). The prototype's badge is a solid
  30px disc with white text.
- app.css:3321 says `.prow` is kept apart from `.sheetrow` on purpose, so
  the two sheet kinds read differently. This issue reverses that choice.
- `.stage` is also used by the game's Card view (`#sheet`) and by first-run
  step 3 (`#frStage`). `fitStage`/`fitPreview` (card.js) size every stage.
- `icons.js` has no check icon.
- `#sheetPaste` is plain (not grouped), but it is a text-entry commit
  sheet, not a list.

## What would settle it

All at 390×844 unless stated, in light and dark.

1. **One background.** `#sheetWho`, `#sheetInterval`, `#sheetFormat`,
   `#sheetPlan` and `#sheetCard` all compute `--sheet`: rgb(241,241,245)
   light, rgb(20,20,22) dark. Every row in them sits inside a `.pgrp` whose
   background is `--surface` (rgb(255,255,255) / rgb(28,28,30)), inset 16px
   from each sheet edge.
2. **One row.** Who's here, Sub interval and first-run step 2 rows are
   `.prow` rows (min-height 48px, 16px text inset from the group edge, the
   standard inset divider). No `.sheetrow` is left in `app/`, and its rules
   are gone from app.css.
3. **Chosen row = check, no fill.** In Sub interval and first-run step 2 the
   chosen row's background is transparent (it shows the group's
   `--surface`). Its text color is `--ink`, not inverted. It carries a
   `.prow-check` mark in `--ink` at weight 700. Unchosen rows carry no mark.
   `aria-pressed` still marks the chosen row.
4. **Who's here.** Each row reads: badge, name, then the state at the
   trailing edge. A present player's state is the `.prow-check` mark (ink,
   700). An absent player's state is the word "Absent" in `--muted`. The
   badge is the app's `.av` (same size, tint and ring as the roster list),
   holding `initials(p)` in the player's `colorOf(p.id)`. The badge stays
   full strength for absent players. The row's accessible name is still the
   player's name plus its pressed state.
5. **Card sheet.**
   - The pocket preview is 238px ±4 wide (zoom about .72) and centered. The
     `#sheetCardPreview` band is no wider than the group inset (x ≥ 16,
     right edge ≤ 374), or has no band at all.
   - Print is unchanged (`btn primary`). Share image has a `--surface` fill,
     `--ink` text and no visible border (border width 0 or transparent).
     The two are equal halves, as today.
   - Without scrolling the body, the preview, Print, Share, and the Print,
     Copies and Size option rows are all fully inside the viewport
     (bottom ≤ 844 and ≤ the body's visible bottom).
   - The half-sheet card (full card size) scales the same way, and nothing
     in it clips.
6. **Large text.** At 320px wide with a 32px root, in each of Who's here,
   Sub interval, Format and the card sheet: no horizontal overflow, no
   clipped text, a long name wraps inside its row, and the check or
   "Absent" stays on screen.
7. **Dark mode.** Items 1-6 hold in dark, with the dark values given above.
   The check reads `--ink` (rgb(244,244,246)) on `--surface`
   (rgb(28,28,30)).
8. **Nothing else moves.** The game Card view (`#sheet`) and first-run
   step 3 (`#frStage`) keep today's preview size. First-run `#frPrint` and
   `#frShare` stay outlined equal halves (decided in #145).

## Surfaces

- `app/index.html`: add `grouped` to `#sheetWho` and `#sheetInterval`;
  give their bodies a `.pgrp` holder. Card sheet markup only if the preview
  change needs it.
- `app/game-setup.js`: `whoRow` / `paintWhoRow` / `paintWhoBody` and
  `paintGranRows` build `.prow` rows in a `.pgrp`, with `.av` and
  `.prow-check`.
- `app/onboarding.js`: `stepFormat_`'s `.fr-gran` box holds a `.pgrp`, or
  becomes one, so the rows get the group background.
- `app/app.css`: remove `.sheetrow*`; a scoped rule for `#sheetCardPreview`
  and `#shareCard`; widen the badge selector so `.av` in Who's here gets the
  roster's badge style (for example `.rrow .av, .who-row .av`, or give the
  rows `rrow`). Update the app.css:3321 comment, which says the two row
  kinds are meant to differ.
- `app/card.js`: only if a preview scale for `#sheetCardPreview` must come
  from `fitStage`.
- `sw.js` VERSION and SHELL bump (precache).
- Smoke checks that name today's markup, which must follow it:
  `scripts/smoke/sentence-sheets.mjs`, `sheet-spacing.mjs`,
  `first-run-flow.mjs` (line 198, `.fr-gran .sheetrow`), `who-rows.mjs`,
  `timeline-card-sheet.mjs`, and `test/dead-class.test.js` (line 56
  comment).
- `scripts/smoke/overlay.mjs` `STATES` and `app-large-text.mjs`: add Sub
  interval and Format sheet states (Who's here and card sheet exist).
- `scripts/smoke/compare-shots.mjs`: add Who's here, Sub interval, Format
  and card sheet states at 390 to compare with the prototype PNGs.

## Constraints

- **Reuse, do not re-derive.**
  - Rows: `.pgrp` / `.prow` (app.css:3343-3397), the same row Format,
    Plan, Settings and Team use. Do not add a new row class, and do not
    restyle `.sheetrow` to look like `.prow`: retire it. One row, one place
    (the #141 precedent).
  - Check: `.prow-check` (app.css:3557), as balance.js uses it. Do not add
    a check icon or a second check style.
  - Badge: `.av` + `initials(p)` + `--c` = `colorOf(p.id)`, as
    roster-view.js `playerRow` does. Not the prototype's solid disc: the
    tint is there for contrast (K5), and every other badge in the app is
    tinted.
  - Divider: whatever `.rrow` rows use in the roster list, so badge rows
    look the same everywhere. Do not invent a 58px inset for this sheet
    only.
  - Colors: `--sheet`, `--surface`, `--ink`, `--muted` tokens only.
- **Keep what works (#153 list).** Escape and tap-outside close every
  sheet. Who's here still opens at half height (C3). The ✕ close stays
  (C4), and so do the 28px top corners. Tapping a Who's here row still
  toggles the player at once and the rotation repaints ("The rotation
  updates as you tap" stays true). Undo and Resume are untouched.
- **C6.** The whole row is the one button; the badge and check are not
  separate targets.
- **L1 and large text.** 48px minimum rows; long names wrap within the row
  (`min-width: min-content` as `.rrow .prow-t` does), never clip.
- **Wording.** Keep the word "Absent"; the check is a mark, not text.
  Names and labels belong to #149. No quoting the maintainer in code
  comments.
- **Scope the preview change** to `#sheetCardPreview`. `#sheet` and
  `#frStage` must measure the same before and after.
- American spelling. No tab bar.

## Design

- Who's here and Sub interval become `.grouped` sheets whose body is one
  `.pgrp`. Rows are `button.prow` with `.prow-t` for the text and a
  trailing slot: `.prow-check` when chosen or present, "Absent" (`.prow-v`,
  muted) when absent, nothing otherwise.
- `paintGranRows` keeps its signature `(box, get, onPick)` so onboarding.js
  keeps working; it now fills `box` with `.prow` rows, and the caller
  passes a `.pgrp` (or `box` gets the class).
- No new copy. The prototype's Who's here footnote ("n of n here…") is
  not added here; whatever status line the sheet shows today stays.
- Card sheet: scale the pocket card to about .72 inside
  `#sheetCardPreview`, drop the full-bleed band to the group inset (or
  remove its gradient), and make `#shareCard` the "quiet" button: surface
  fill, ink text, no border.

## Proof seams

| Seam | Runs from | Covers |
| --- | --- | --- |
| Background and group per sheet: the five sheets compute `--sheet`, rows inside `.pgrp` at x=16 | a new smoke check (for example `sheet-family.mjs`), light and dark | 1, 7 |
| Chosen-row style: transparent background, ink text, `.prow-check` 700 ink; unchosen rows no mark | same new check, Sub interval and first-run step 2 | 2, 3 |
| Who's here badge: `.av` present, text = `initials(p)`, computed style equals a roster `.av`'s | same new check | 4 |
| Card sheet: card width 238±4, band inside [16, 374], Share border 0, five boxes inside the viewport, `#sheet` and `#frStage` widths unchanged | same new check, or `timeline-card-sheet.mjs` | 5, 8 |
| Existing checks follow the new markup | `sentence-sheets.mjs`, `sheet-spacing.mjs`, `first-run-flow.mjs`, `who-rows.mjs` | 2-4 |
| Large text: Sub interval and Format states added to `STATES`; the existing large-text pass runs them at 320/32 | `app-large-text.mjs` | 6 |
| Dead class: no `.sheetrow` rule or use left | `test/dead-class.test.js` | 2 |
| Look | `/browser-verify` and `compare-shots.mjs` next to `sheet-who`, `sheet-interval`, `sheet-format`, `sheet-card` prototype PNGs, light and dark, plus long-name and scrolled-to-bottom states at 390 and 320/32 | 1-8 |

## Out of scope

- `#sheetPaste` (a text-entry sheet, not a list).
- Renaming the card sheet's "Print" option row. It matches the prototype
  (see Survey item 10).
- The prototype's "Done" header word: the app keeps its ✕ (C4).
- The prototype's solid badge and 40% opacity for absent players.
- First-run step 3's Print and Share buttons (#145).
- Any wording change in these sheets (#149).
