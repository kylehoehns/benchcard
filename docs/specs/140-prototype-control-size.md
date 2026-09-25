# #140 — Draw controls at the prototype's size, keep 48px as the tap area

## Issue

#140 (item 10 of #153). The sentence, the steppers, the segmented controls
and the switch rows are drawn at the 48px tap size. The prototype draws them
smaller and keeps 48px only as the area a finger can hit. The off switch
also has almost no visible track.

## Goal

A coach sees the game screen, the Format sheet, the Plan sheet and Settings
at the prototype's size: a tighter sentence, 32px segmented controls, 44×32
stepper halves, 48px rows and an off switch they can see. Every control
still takes a 48px tap, as I1 requires.

## Decisions

Measured on `main` at 699987e, 390×844, 16px root, RICH fixture, against
`notes/mockups/prototype/index.html` served the same way.

| Control | App today | Prototype |
| --- | --- | --- |
| Sentence line pitch | 48 (`line-height: max(48px, 1.38em)`) | 34.5 (25px × 1.38) |
| Sentence box, 3 lines | 144 | 121.5 (incl. 18px top padding) |
| `#timeline` top | 356 | 345 |
| `#viewSeg` | 36 track, 32 buttons | 36 track, 32 buttons |
| Plan `#stratseg` | 52 track, 48 buttons, 14px/600 | 36 track, 32 buttons, 14px |
| Settings segs (`#maxSubsSeg`, `#tieBreakSeg`, `#seasonDefSeg`, `#themeSeg`) | 52 track, 48 buttons, 14px/600 | no seg in Settings (see below) |
| Format stepper row | 74 | 46 |
| `.pstep` | 96×48, two 48×48 buttons, fill `#F6F6F8` | 88×32, two 44×32, fill `#E8E8ED` |
| Switch row ("Even out earlier games") | 74 | 46 |
| Switch off track | 51×31, `#F6F6F8` on `#FFF` (1.08:1) | 51×31, `#E8E8ED` on `#FFF` (1.22:1) |

What the survey found against the ticket's claims:

- **The seg text is 14px semibold, not 16px.** It uses `--fs-secondary`. The
  prototype's own Plan seg is also 14px (an inline style on its line 567), so
  the Plan seg text already matches. Only the prototype's default seg is 13px.
- **The prototype has no segmented control in Settings.** Appearance is a row
  that opens a sheet, and "Players changing at once" is a stepper row. So
  "match the prototype" for the Settings segs means the drawn height of the
  prototype's seg (32 on a 36 track), not a Settings screen to copy.
- **"Pushes the timeline ~40px down" is only half right.** The sentence is
  22.5px taller than the prototype's. But the app has no gap around
  `#viewSeg` (removed so `game rows fit` keeps nine rows), and the prototype
  has 16px above it and 10px below. Net, the app's timeline is 11px lower,
  not 40.
  - Tightening the pitch alone puts the timeline near 315.5, about 29.5px
    *above* the prototype. That fails "within 8px".
  - Tightening the pitch and restoring the 16/10 gaps puts it near 338, about
    7px off. That passes, and the game screen still gains about 18px for rows.
  - Q4 took the absolute reading, so the gaps come back.
- **"Match the prototype" and "≥3:1" conflict for the switch.** The
  prototype's off track is 1.22:1 on white. K5 wins, so the track color
  departs from the prototype. See Q3.
- **Phrases cannot keep 48px hit areas at a 34.5px pitch.** Phrases on
  adjacent lines overlap horizontally (players over interval, interval over
  rules, format over strategy at 390). Their 48px hit areas would overlap by
  about 13.5px, and the touch sweep fails one of each pair. See Q1.

Settled here:

- **The drawn size changes; the hit area does not.** Every control keeps a
  box, or an `::after` hit area, of at least 48×48. `#viewSeg` already does
  this (a 32px button with a 48px `::after`) and is the model for the other
  segs.
- **The stepper fill uses the seg track color** (`--seg-track`: `#E8E8ED`
  light, `#2C2C2F` dark), which is the prototype's `surface-2`. `--surface-2`
  itself does not move: its token comment records that `#E8E8ED` failed the
  text-contrast tests there.
- **The switch input box stays 51×48.** The "last control in an open dialog is
  reachable" check reads the raw box of the last focusable element, not the
  hit area, and a switch can be the last control in `#sheetPlan`. Its row
  shrinks to 48 by giving the input negative block margin, not by shrinking
  the input.

Decided by the owner on 2026-09-25:

- **Q1. Phrase hit areas: (a).** Each phrase's hit area is its full line box,
  34.5 tall, meeting the next line at the midline. Phrases are exempt from
  the 48 floor the way `skipRowPitchName` exempts `.tl-name` (#72), and a
  sentence check owns a 34px floor instead. That is still above WCAG 2.5.8's
  24px.
- **Q2. Seg text size: 14px everywhere.** The Settings segs do not move to
  13px. Weight (500 vs 600) is left to #141.
- **Q3. Off switch track: (a), a new token.** About `#8E8E93` light
  (3.26:1), `#6C6C70` to `#757579` dark (3.25 to 3.71:1), plus
  more-contrast values at ≥4.5:1. This departs from the prototype; K5 wins.
- **Q4. The timeline criterion: the absolute top.** `#timeline` top is
  within 8px of 345. The 16px gap above `#viewSeg` and the 10px gap below it
  come back to get there.

## What would settle it

At 390×844, light and dark, unless a line says otherwise. Drawn size is the
painted box (background or track), ±2px.

1. **Sentence.** Line pitch is 34–36 (34.5 expected). Each phrase's hit area
   follows Q1: its full line box, 34.5 tall, and never under 34.
2. **Timeline.** `#timeline` top is within 8px of **345**. `game rows fit` still shows all nine rows and Start game.
3. **Segs.** In `#stratseg`, `#maxSubsSeg`, `#tieBreakSeg`, `#seasonDefSeg`
   and `#themeSeg`, each button is drawn 32 tall on a 36 tall track.
   `#viewSeg` is unchanged. Text stays 14px.
4. **Steppers.** On the Format sheet, the first-run step 2 and Add a rule,
   each stepper is drawn 88×32, two halves of 44×32, in `--seg-track`. Each
   `.pstep-btn` box is still at least 48×48, and the two boxes do not overlap.
5. **Stepper rows.** Each `.pstep-row` is 48 tall on one line, and both
   buttons sit inside the row (±0.5).
6. **Switch rows.** Each `switchRow` row (Plan sheet pairs, even out the
   day, even out the season, Add a game step 3) and the `#showMinutes` row is
   48 tall. The input box is still 51×48 and inside its row.
7. **Switch track.** The off track is 51×31 and measures at least 3:1
   against `--surface` in light and dark, and at least 4.5:1 in both
   more-contrast themes. The on track is unchanged.
8. **Tap areas.** The touch sweep passes at 320, 360 and 390 for every state
   in `TOUCH_STATES`, with phrases exempt (Q1). `plan sheet controls ≥
   48px` and `settings rows ≥ 48px` pass.
9. **Large text.** At 320px with a 32px root, nothing overflows,
   `app-large-text` is green, the Format sheet geometry checks are green, and
   every stepper button and seg button box is still at least 48×48.
10. **Rows and dividers.** Format, Plan and Settings rows keep their dividers
    and 16px side padding. Nothing on those screens moves except by the
    height the controls lost.

## Surfaces

- Changes:
  - `app/app.css`:
    - `.seg` and `.seg.wide` buttons.
    - `.sentence` and `.phrase`.
    - The 16px/10px gaps around `#viewSeg` (Q4).
    - `.pstep-row`, `.pstep` and `.pstep-btn`.
    - `input[switch]` and its track.
  - `app/tokens.css`: the new off-track token (Q3), in all four theme blocks.
  - `app/sw.js`: VERSION and SHELL.
  - `test/contrast.test.js`: a pinned pair for the off track.
  - A new or extended smoke check for the drawn sizes (items 1, 3 to 7).
  - The phrase exemption in `scripts/smoke-checks.js` (Q1).
- Must not change:
  - The markup built by `stepperRow` (`app/game-setup.js:273`) and
    `switchRow` (`app/rules.js:79`), or their callers.
  - `app/index.html`'s seg markup.
  - `.wel-seg`.
  - Engine files.
  - `TOUCH_FLOOR` and `TOUCH_TOL` in `scripts/smoke/sizes.mjs`.

## Constraints

- **Guidelines:**
  - I1: 48px tap area; a smaller drawn control keeps a 48px hit area.
  - C6: rows at least 48px, switches are `<input type=checkbox switch>`.
  - C7: segmented controls, text only, equal widths.
  - K5: 3:1 for controls, and a more-contrast value for every color.
  - L6: the 8px grid.
  - T2 and T3: sizes in rem, nothing below the footnote size.
- **Prototype rules** (`notes/mockups/prototype/README.md`): keep the look,
  make the hit area 48px. Use the app's tokens, not the prototype's CSS. Row
  text stays Body at 16px, not the prototype's 17px. No tab bar.
- **Precache bump.** `app.css` and `tokens.css` are precached: bump `VERSION`
  in `app/sw.js` and set `SHELL` to the digest `npm test` names, in the same
  change. #131 also bumps them and changes the dark selector in `tokens.css`.
  If it merges first, rebase and take the next VERSION.
- **Reuse `#viewSeg`'s `::after` hit area** for the other segs. Do not invent
  a second way to widen a tap area.
- **Reuse `--seg-track`** for the stepper fill. Do not add a token with the
  same value.
- **Reuse `hitBox`, `TOUCH_MIN` and `scripts/smoke/sizes.mjs`** for any size
  floor. `test/touch-floor.test.js` bans a hand-typed 48.
- **Reuse `scripts/tokens-css.mjs`** (`parseTokensCss`) to resolve token
  values in tests. Do not write a second parser.
- **Reuse `skipRowPitchName`'s pattern** for the phrase exemption. The check
  that exempts phrases must name the check that owns their floor instead.
- **Any new check is built under `/new-guard`**: watch it fail on `main` for
  the right reason first.
- Measure in a browser (`/browser-verify`), not by reading CSS. Serve with
  `node scripts/serve.mjs`.

## Design

Draw each control smaller and hang its hit area outside the drawing.

- **Segs.** Buttons get `min-height: 2rem` and a 48px `::after` with
  `position: relative` on the button, as `#viewSeg` does. At 320/32 the text
  drives the height, and the box is over 48 anyway.
- **Steppers.** Each button's box stays at least 48×48. The 88×32 pill is
  painted smaller than the boxes, for example a pseudo-element or a `.pstep`
  sized 5.5rem × 2rem with the buttons spilling past it. The row gets less
  block padding so it lands on 48 while the buttons stay inside it.
- **Switch.** The input keeps its 51×48 box with `margin-block: -.8125rem`,
  so it adds only 22px to the row's line. The off track takes the new token (Q3).
- **Sentence.** `line-height: 1.38em`. Phrase hit areas are their line boxes
  (Q1). The 16/10 gaps around `#viewSeg` come back (Q4).

The developer picks the exact CSS. These are outcomes.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Off-track contrast | `node --test test/contrast.test.js`, a new pinned pair against `--surface` in four themes, through `parseTokensCss` | 7 |
| Drawn sizes | a new or extended smoke check under `/new-guard`: sentence pitch, seg button and track height, stepper pill and halves, row heights, track size. Nothing pins drawn size today | 1, 3, 4, 5, 6 |
| Tap areas | `npm run smoke -- --no-tests`: touch sweep at 320/360/390, `plan sheet controls ≥ 48px`, `settings rows ≥ 48px`, last control in an open dialog | 4, 6, 8 |
| Format sheet steppers | `sheet-spacing.mjs` (`buttonsBigEnough`, `colsAligned`, `stepperLabelsFit`), `sentence-sheets.mjs`, `first-run-flow.mjs`, `add-game-flow.mjs` | 4, 5, 6, 9 |
| Game screen | `game-rows-fit.mjs`, plus the timeline top measured by `/browser-verify` beside the prototype | 1, 2 |
| Large text | `app-large-text.mjs`, `type-scale.mjs` | 3, 9 |
| Looks | `node scripts/compare-shots.mjs --issue 140`, light and dark, beside the prototype | 3, 4, 6, 7, 10 |

The Format sheet is not in `TOUCH_STATES`. Its steppers are held only by
`sheet-spacing.mjs`, which reads raw boxes. The developer should add it to
`TOUCH_STATES` if the hit-area changes touch the stepper.

## Out of scope

- #141, which comes next and gives these same controls one version each:
  one seg class, one destructive style, one `.barrow`, one input style,
  `#gmOpen` as a filled primary, and removing `.wel-seg`. #140 is size only.
- Seg label weight (500 vs 600). That is #141's.
- `.bal-step`, the player level meter. The ticket does not name it.
- Contrast of the stepper fill. Its glyphs carry the contrast, and the
  ticket does not ask for 3:1 there.
- The 11px side margin (#132), which will change where the sentence wraps.
- The unused `.switch` label pair (#152), and every other item under #153.
