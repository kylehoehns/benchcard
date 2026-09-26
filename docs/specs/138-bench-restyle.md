# #138 Bench mode matches the prototype

## Issue

#138. Bench mode (after Start game) was never restyled, and it is the biggest
gap between the app and `notes/mockups/prototype/`.

## Goal

A coach who taps Start game sees the same screen as `light-bench.png` /
`dark-bench.png`: a quiet header that names the stretch of clock, five white
rows, a soft gray "Next change" box, the bench, and floating round controls
at the bottom. Nothing a coach can do in bench mode changes; only how it looks.

## What would settle it

Measured at 390×844 on the rich fixture (`goRich`), light and dark, with
bench mode open on stint 1, unless a line says otherwise.

1. **Header.** The ✕ (`#gmClose`) is round: a visible fill, width equals
   height, border-radius ≥ half its width, hit area ≥ 48px, accessible name
   "Leave bench mode" unchanged. The title reads exactly
   `Q1 · 8:00 to 4:00` (period name, a middle dot, start, the word "to", end).
   Under it, small and muted, `1 of 8`. The opponent ("vs Hawks") and the
   word "stint" are no longer in the header. `#gmReset` (↺) is round the same
   way when it shows.
2. **No uppercase or letter-spaced labels.** No element in `#gamemode` that
   paints text has computed `text-transform: uppercase` or a
   `letter-spacing` above 0.
3. **No lines between controls and content (L3).** `.gm-bar` has no bottom
   border and `.gm-foot` has no top border (width 0 or transparent), and
   neither paints an opaque bar: the foot's controls float over the content
   the way the prototype's do, with a fade where content meets them. The
   separators between bench rows stay: the prototype has them.
4. **Floor rows** (`.gm-p`) are white (the surface color, dark surface in
   dark), borderless (border width 0 or transparent) when not selected, with
   names at the type scale's 22px step (prototype README: "22px bench names").
   A selected floor row (`light-bench-selected.png`) gets a 2px outline in the
   selected-state color (ink, or the team tint per K1).
5. **Floor labels.** No visible "On the floor" or "played / projected"
   heading above the floor rows, as in the prototype. The meaning is kept for
   screen readers: the floor list has an accessible name that says the
   numbers are minutes played of projected.
6. **Next change box** (`#gmNext`): a soft gray fill (a fill token, not the
   surface and not the page ground), no border, no arrow icons. Header, 600
   weight: `Next change at 4:00`. When the next change is in a different
   period from the current stint, the period stays: `Next change at Q2 8:00`.
   Under it, two columns headed `Off` and `On` in muted footnote text, one
   first name (the call name the box uses today) per line. Off names are
   muted, On names are ink at 600. Every text color inside the box computes
   to the ink or the muted token: no red, no green, no player color (K2, K3).
   The two other states keep their words and take the same look:
   - same five stay on: `Next break at 4:00` then `Same five stay on.`
   - last stint: `Last stint` then `Game ends at 0:00.`
7. **Bench label.** Nothing picked: `Bench · tap a player on the floor to
   swap`. A floor player picked: `Bench · tap who goes on for <call name>`
   (for example `Bench · tap who goes on for Ana`). Sentence case, muted
   footnote, one line, as in the prototype. The This stint / Rest of game /
   Sit for the rest control stays where it is in the picked state; it is not
   in the prototype, and S1 lets the app hold more.
8. **Bench rows.** Badges (`.gm-b .av`) are filled with the player's color
   with the same number color as the floor badges (the app's existing badge
   text, chosen for contrast on the player colors; the prototype's white is
   not used); no outlined ring. Bench rows
   have no outline in the picked state either: they look the same picked or
   not.
9. **Bottom controls.** Done (`#gmDone`) is a pill: border-radius ≥ half its
   height. ‹ (`#gmPrev`) and › (`#gmNext2`) are round: width equals height,
   border-radius ≥ half the width. › is the solid primary (ink fill, surface
   glyph); ‹ and Done are the raised surface. Finish game (`#gmFinish`, last
   stint) is a pill like Done. Every one keeps a hit area ≥ 48px (I1) and
   stays in the bottom half (I2). The dots stay.
10. **Side by side.** `node scripts/compare-shots.mjs --issue 138` writes
    `bench-light`, `bench-dark`, `bench-selected-light` and
    `bench-selected-dark`, and they show the same structure, labels, fills
    and control shapes as the four prototype PNGs, apart from the README's
    deliberate differences (48px hit areas, a named ✕, ink rather than tint
    on the Next change box, rem sizes).
11. **Large text.** The existing 320px / 32px bench mode rows in
    `scripts/smoke/app-large-text.mjs` (`bench mode`, `bench mode, swap
    picker`, `bench mode, last stint`, and the rest) still pass: nothing
    clips, and the Next change box's two columns fit.
12. **First run's demo.** `onboarding.js` builds a copy of bench mode from
    the same classes (`.gm-next`, `.gm-b`). It follows the new look and
    words: `Next change at Q2 4:00`, Off / On columns with no arrows, and the
    bench line `Bench · tap a player on the floor to swap`.

## Surfaces

Change:

- `app/gamemode.js`: header text (`#gmGame` / `#gmClock` content), the
  minutes key, the bench label, the Next change box's markup (columns, no
  icons), the `at` string.
- `app/index.html`: bench mode's markup under `#gamemode` only (header
  structure, the floor list's accessible name, removing the visible
  "On the floor" heading); and the help sheet only if it quotes a label this
  changes.
- `app/app.css` (or wherever `.gm-*` rules live): the bench-mode rules.
- `app/onboarding.js`: the demo's Next change box and bench line (item 12).
- `scripts/compare-shots.mjs`: two new states, `bench` and `bench-selected`,
  light and dark.
- `scripts/smoke/`: one new check module for items 1–9, plus its one
  registry entry (#130: adding a smoke check is one module and one registry
  entry).
- `test/`: whatever the new states and any pure helper need.
- `app/sw.js`: VERSION and SHELL.

Must not change: `engine.js`, `live.js` and the other pure modules' behavior;
what any bench-mode button does; the swap, undo, sit-for-the-rest and finish
flows; `fitCallRows`' job of keeping names on one line (the columns may make
it simpler, but a long call name must not wrap or clip).

## Constraints

- **Reuse the tokens, not the prototype's CSS** (prototype README, "Use the
  values, not the CSS"). Type sizes come from `app/tokens.css` (T2, T3): no
  size below the footnote step, the 22px step for floor names, Body for
  bench rows. Fills and colors come from the existing tokens in both themes;
  do not add hex values.
- **Reuse the app's round header button and pill styles** where they already
  exist (sheets' round ✕, the floating round controls elsewhere) rather than
  a third copy. If a shared class fits, use it.
- **K1/K2/K3.** Player colors only on badges. The Next change box is ink and
  muted only. A team color tints the selected row outline and the primary ›,
  nothing else.
- **L2/L3.** Floating controls; no bar, no line. Translucent with blur,
  solid under `prefers-reduced-transparency` / `prefers-contrast: more`, the
  way the other floating controls do it.
- **C10.** Still full screen, ✕ top left, Done at the bottom.
- **I1.** Every control ≥ 48px hit area, including a visually smaller ✕.
- **Precache bump.** Any precached file change: bump `VERSION` past the
  branch's committed value and set `SHELL` to the digest `npm test` names.
- **Budgets.** The request budget has one left (42 of 43): add no new boot
  module. A byte-budget widen is routine if needed.
- **Smoke checks** go through the registry (#130). Do not hand-roll a second
  launcher; use `scripts/smoke/chrome.mjs`, `dom.mjs`, `fixtures.mjs`.
- American spelling. Use they/them or names, never he/she, in any text.

## Design

- Header: `.gm-bar` becomes the round ✕ left, a centered two-line title,
  and ↺ right (hidden as today). Title line from the current row's period
  name and clock, formatted `Q1 · 8:00 to 4:00`; the subtitle `i+1 of N`.
- Floor: the heading row goes; `#gmFloor` gets the accessible name. Rows lose
  their border and take the surface fill; selected gets a 2px outline.
- Next change: header text `Next change at <at>`, where `<at>` drops the
  period when it equals the current stint's; below, a two-column grid (Off,
  On), each a column of names. No icons.
- Bench: label text as item 7; badges filled; no picked-state outline.
- Foot: no background or border; a fade (gradient from the ground color)
  behind the controls; Done pill left, dots, ‹ and › round right.

## Proof

- **New smoke check** (`scripts/smoke/bench-look.mjs` or a name that fits the
  registry), rich fixture, 390×844, light and dark, running in the real
  browser: items 1–9, reading computed styles and text. For item 6's
  cross-period case it steps to the stint whose next change is in the next
  period and reads the header. For item 6's colors it compares every text
  node's computed color inside `#gmNext` against the computed ink and muted
  token colors. Covers 1–9.
- **`scripts/compare-shots.mjs`** new `bench` / `bench-selected` states,
  with `test/compare-shots.test.js` updated the way the other states are.
  Covers 10 (the picture itself is checked by eye at review).
- **Existing `scripts/smoke/app-large-text.mjs`** bench rows. Covers 11.
- **The existing first-run smoke check** (whichever module already opens
  the first-run demo) gains the item 12 assertions. Covers 12.
- A pure helper for the header and `at` strings, if one is extracted, gets
  `node --test` cases (same period, next period, overtime or a period name
  like `H1`).

## Out of scope

- Behavior of any control, the swap flow, Sit for the rest, Finish game.
- The This stint / Rest of game / Sit for the rest control's own look beyond
  items 2 and 3.
- The dots' behavior.
- The wide layout beyond not breaking it.
- The team-color tint on the Next change box (the README says ink).
