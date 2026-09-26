# #144 Season uses one list style and the prototype's row sizes

## Issue

#144. The Season screen mixes three list styles, and its "Minutes so far"
rows are about twice as tall as the prototype's (`light-season.png`).

## Goal

A coach who opens Season sees the prototype's quiet ledger: one short line per
player (first name, a thin bar, muted minutes), then Across the day and Filed
games in the same white grouped boxes Team and Settings use. Nothing a coach
can do on Season changes; what it shows changes only as item 3 says.

## What would settle it

Measured at 390×844 on the rich fixture (`goRich`), Season opened from
`#todaySeason`, light and dark, unless a line says otherwise.

1. **Inset groups (L1).** Each section's rows sit in a `.pgrp` (the shared
   white grouped surface): one for Minutes so far, one for Across the day, and
   one per filed day (or one for all Filed games, if day headers go inside it
   as `.pgrp-h`). Section headers (`h2.sn-h`) and day subheaders line up on
   the same left edge as the group's own inset (± 1px). No filed game sits on
   its own separate card.
2. **Minutes so far rows** match the prototype, ±2px:
   - row height 30px at 16px root (the row's own box; the ≥48px hit-area rule
     does not apply because these rows are not controls);
   - the name is the player's call name (`callNames` in `app/roster.js`,
     the first-name form bench mode uses), `--fs-secondary` (14px), weight
     400–500, ink, one line, ellipsis if long;
   - the bar is 8px tall, track `var(--track)`, radius `var(--r-full)`, the
     fill the player's own color (K2);
   - minutes are `--fs-footnote` (13px), `var(--muted)`, weight 400,
     tabular numbers, right-aligned;
   - no dividers between rows: no border, no inset box-shadow line;
   - the rows keep their current order (most behind first).
3. **The "N games · M behind" line is not visible, but it is still there for
   screen readers.** Decided with the maintainer: each row's second line
   ("2 games · 16 behind", "3 games", "3 games · 2 ahead") leaves the screen
   and moves into visually hidden text inside the row, so a screen reader
   reads for example "Nia, 12.5 minutes, 2 games, 16 behind". The row is one
   line visually. The words are the ones `offNote` builds today, unchanged.
4. **Across the day:**
   - names are call names (`callNames`), not the uppercase 4-letter card
     names (no "ELI", "JORD", "RILE"); computed `text-transform` none;
   - legend swatches are round (`border-radius` ≥ half the width);
   - the "2 games" subheader (`#dayhint`) is muted footnote text, not
     body-size ink;
   - each row carries each game's minutes as text a screen reader reads,
     for example "Game 1: 8, Game 2: 6" (use `gameLabel` so the wording
     matches the legend, e.g. "Hawks: 16, Ravens: 16"), visible or visually
     hidden. No per-game minutes only in a `title` attribute;
   - with 5 games in the day, every row's text names all 5 games and nothing
     clips at 320px.
5. **Filed games:** each game row uses the shared chevron (`.prow-chev`,
   the same size and color as Team's and Today's), and the rows are `.prow`
   rows inside the group with the group's separators. Opening a filed game
   still works the way it does today.
6. **No uppercase or letter-spaced labels** anywhere in `#view-season`:
   computed `text-transform` is never `uppercase`, `letter-spacing` never
   above 0 on text.
7. **Side by side.** `node scripts/compare-shots.mjs --issue 144 --states
   season-light,season-dark,bottom-season-light,bottom-season-dark` shows
   the same structure, sizes, fills and weights as `light-season.png` /
   `dark-season.png`, apart from the README's deliberate differences (no tab
   bar, rem sizes) and the two sections the prototype does not have (Across
   the day, Filed games), which follow item 1.
8. **Large text.** At 320px with 32px text, Season's existing large-text
   smoke rows still pass: no name, number or legend clips, no horizontal
   page scroll. A long call name (the rich fixture's longest) ellipsizes or
   wraps; it does not push the minutes off the row.

## Surfaces

Change:

- `app/season-view.js`: `playerRow` / the Minutes so far list and the Filed
  games markup (groups, chevrons, the hidden subline text, call names).
- `app/plan-view.js`: `renderDayTotals` (call names, per-game text, legend).
- `app/index.html`: `#view-season` markup only.
- `app/app.css`: the `.sn-*`, `.dayrow`, `.legend` rules the change needs.
  Delete rules the change leaves unused (`test/dead-class.test.js` will say
  which).
- `scripts/smoke/`: one new check module for items 1–6 and 8's clip check,
  plus its one registry entry (#130).
- `test/`: whatever any pure helper needs.
- `app/sw.js`: VERSION and SHELL.

Must not change: `engine.js`, `live.js`, `balance.js`'s math and the other
pure modules; what filing, opening, deleting or exporting a game does; the
order of the Minutes so far rows; the Across the day spread note's words.

## Constraints

- **Reuse, do not re-derive:** `callNames` (`app/roster.js`) for first
  names; `.pgrp` / `.pgrp-h` / `.prow` / `.prow-chev` for groups, rows and
  chevrons; `--track` and `--r-full` for bars; `gameLabel` for game names;
  one visually-hidden class for hidden text (the app has none today: add a
  single `.sr-only` rule to `app.css` and use it in both sections, rather
  than two ad-hoc copies; `aria-label` on a plain `div` is not read, so it
  is not a substitute); `offNote` for the behind/ahead words.
- **Type sizes from `app/tokens.css`** (T2, T3): nothing below
  `--fs-footnote`. No new hex values; colors from existing tokens in both
  themes.
- **K2:** player colors only on the bar fill, the day chart segments and the
  dots. **K5** as the ticket names it. **C6** as the ticket names it.
- **L1:** soft gray ground, white grouped surfaces.
- **Precache bump:** any precached file change bumps `VERSION` past the
  branch's committed value and sets `SHELL` to the digest `npm test` names.
- **Budgets:** the request budget has one left (42 of 43): add no new boot
  module. A byte-budget widen is routine if needed.
- **Smoke checks** go through the registry (#130). Use
  `scripts/smoke/chrome.mjs`, `dom.mjs`, `fixtures.mjs`; no second launcher.
- American spelling. They/them or names, never he/she.

## Design

- Minutes so far: a `.pgrp` holding one-line grid rows (name, bar, minutes)
  at the prototype's sizes; the subline becomes visually hidden text.
- Across the day: the same `.pgrp`; `.dayrow` names from `callNames`; each
  row gets hidden text listing each game's minutes by `gameLabel`; round
  legend dots; `#dayhint` muted footnote.
- Filed games: day subheaders aligned with section headers; games as `.prow`
  rows with `.prow-chev` inside a group.

## Proof

- **New smoke check** (e.g. `scripts/smoke/season-look.mjs`), rich fixture,
  390×844, light and dark, in the real browser: reads computed sizes,
  colors, radii, borders and text for items 1–6. For item 4's five-game case
  it builds a day with 5 games in the fixture (or adds them the way other
  smoke checks do) and reads each row's per-game text. At 320px / 32px it
  checks item 8's clipping. Covers 1–6 and 8.
- **`scripts/compare-shots.mjs`** existing `season` and `bottom-season`
  states. Covers 7 (checked by eye at review).
- **Existing large-text smoke rows** for Season. Covers 8.
- A pure helper for the per-game text, if one is extracted, gets `node --test`
  cases (2 games, 5 games, a player with 0 in one game).

## Out of scope

- Adding Across the day or Filed games to the prototype's picture; they stay.
- What a filed game's opened detail shows.
- Season's Export and its file format.
- The wide layout beyond not breaking it.
