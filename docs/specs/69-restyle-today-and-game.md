# 69 — Restyle Today and the game screen to match the prototype

## Issue

#69: restyle Today and the game screen so they read as the same design as
`notes/mockups/prototype/` (`light-today.png`, `dark-today.png`,
`light-game-timeline.png`, `dark-game-timeline.png`), with the prototype's
values moved into `app/tokens.css`. No new features, no new sheets.

## Goal

A coach opens Benchcard courtside, one-handed, and sees the calm, grouped,
iOS-like look of the prototype. Games are big cards, lists are grouped rows,
the sentence is large with underlined choices, and the rotation is a clean
row per player. Every control still works the same way and is still at least
48px.

## Survey (2026-09-16, on `bf2ec25`)

- **Today.** `#barToday` holds `#teamBtn` (popover `#teamMenu`, a chevron
  icon), `#keysHint`, `#todayNewDay` (`btn ghost`) and `#settingsBtn`.
  `main#view-today` holds `h1.today-h1`, `#todayGames` (passes painted by
  `renderPass` in `app/teams-view.js`), `.today-acts > #todayAddGame.btn`,
  and `#todayTeam` / `#todaySeason` (`.today-entry`, a bordered surface with
  a `›` `::after`).
- **Pass.** `button.today-game` > `.pass-top` (`.pass-when`,
  `.pass-status.ok|warn` with a `::before` dot), `.pass-title`,
  `.pass-rot` (rows painted by `rowGradient` in `app/state.js`), and
  `.pass-summary`. `rowGradient` paints off-floor and the period gaps both
  `transparent`; `test/game-pass.test.js` pins that string.
- **Game header.** `#barBack` holds `#backBtn` (icon, "Back to Today") and
  `h1#barTitle`, which `renderTabs` sets to `gameLabel(...)` on the games
  view. The game screen also has `.dayhead > input#dayName.daytitle`, shown
  at the sentence size on the phone.
- **Sentence.** `p#sentence.sentence` at `--fs-body`, line-height 3, with
  `.phrase` buttons (48px inline-flex, 2px underline in `--phrase-line`).
- **Timeline.** `.surface > #timeline.tl + #stats` inside `section.s-rot`.
  Name and total sit on one row above the track; below 620px they stack.
  Blocks have a gloss `::after` and opacity .92. `test/timeline-names.test.js`
  pins full names on the timeline.
- **Action bar.** `#actionbar` (phone, <900px): `#abBench.ab-main` (tint
  fill), a help `?`, `#abCard.ab-side` (printer). `test/actionbar-split.test.js`
  pins that the bar owns both bench and print.
- **Phone order** is set by `order:` in `app/app.css` (s-thisgame 0, s-plan 1,
  s-balance 2, consdetails 3, s-rot 4, ...).
- **Token guards.** `test/type-scale.test.js` pins the seven `--fs-*` sizes.
  `test/graphite-tokens.test.js` pins `--bg`, `--surface`, `--ink`, `--muted`
  and requires `--surface-2`, `--faint`, `--pc-track` to be neutral grays.
  `test/contrast.test.js` needs every text token at 4.5:1 (7:1 in more
  contrast) on every ground, `--surface-2` included.

## Decisions made in this spec without asking

The ticket is `ready-for-agent`. Where the prototype and
`docs/interface-guidelines.md` disagree, the guidelines win.

1. **No tab bar.** The prototype's bottom tabs are not built.
2. **48px targets beat the prototype's sizes.** Timeline rows stay at least
   48px (prototype 31px). Sentence lines stay at least 48px apart (prototype
   about 36px), so no two phrase targets overlap.
3. **Type stays on the seven-step scale.** Prototype sizes that are off the
   scale map to the nearest step: 34px → `--fs-large`, 30px pass title →
   `--fs-large`, 25px sentence → `--fs-sentence`, 15px → `--fs-secondary`,
   14px → `--fs-secondary`, 13px/11px → `--fs-footnote`.
4. **Back control.** `#backBtn` becomes a round chevron (a 2.25rem circle in
   `--surface-2`, 48px hit area). The prototype's text "‹ Today" is not
   copied: the icon keeps its accessible name "Back to Today".
5. **One large title on the game screen.** The opponent (`gameLabel`) shows
   as a new in-page `h1` at `--fs-large` 700, with a sub line
   `"<tip-off> · ● <status>"` under it at `--fs-secondary` muted, reusing the
   pass's "Planned" / "Needs a fix" words and dot. `#barTitle` stays in the
   DOM but is visually hidden on the games view (so the header title does not
   repeat it); it keeps its text for other back screens, where it shows as now.
   The day name input (`#dayName`) moves out of the large-title spot: it shows
   as a normal Body-size labeled field in the "This game" group.
6. **The action bar stays where it is.** Start game (`#abBench`) is restyled
   to the prototype's primary button (54px tall, 16px radius, 600 weight),
   still using `--tint` (K1 allows tint on the primary action). The help `?`
   and `#abCard` stay beside it. The bar loses its top border. Moving print
   to the header was considered and dropped: `test/actionbar-split.test.js`
   pins print in the bar for thumb reach.
7. **Timeline without a box.** The `.surface` box around `#timeline` goes.
   Each row: color dot, full name (`--fs-secondary` 500), track, total
   (`--fs-footnote` 600, tabular) on one line, when the timeline is wider than
   about 22em. Narrower (320px, large text) keeps the stacked layout.
   Period labels (Q1–Q4) above the tracks: `--fs-footnote` 500, muted,
   no uppercase. Track about 1rem tall in a new `--track` color. Blocks flat
   (no gloss, no opacity), radius 4px. The divider between periods becomes a
   3px gap. The "Rotation" header stays as a quiet group header with Shuffle.
   Full names stay (a test pins them); the prototype's first names are not
   copied.
8. **Phone order.** The rotation moves right after the sentence (order 0),
   then Plan, Balance, Rules, This game, card, and the rest in their current
   relative order. Nothing is added or removed.
9. **Grouped rows.** Folds (`details` summaries for Plan, Balance, Rules,
   Across the day, Stint by stint), `.today-entry` rows, `#todayAddGame` and
   `#cardToggle` become grouped rows: `--surface`, 12px radius, no border,
   min 48px, label in ink, hint in muted, chevron in `--faint`. Headings in
   these areas drop uppercase and letter-spacing (sentence case).
10. **Surfaces and inputs.** Cards and group surfaces drop their 1px borders.
    Inputs are filled (`--surface` on the ground), no border, 48px.
    The segmented control (`.seg`) is `--surface-2`, ~9px radius, 2px inset,
    with a raised "on" segment (`--seg-on` plus a small shadow), 48px tall.
11. **Tokens.** Add to `app/tokens.css`: `--track` (#EBEBEF light, #26262A
    dark), `--seg-on` (#FFF light, #4A4A4F dark), `--r-2xs: 4px`.
    Change `--r-sm` 11px → 12px, `--r-lg` 22px → 20px,
    `--ease` → `cubic-bezier(.32,.72,0,1)`. `--surface-2` moves toward the
    prototype (#E8E8ED light, #2C2C2F dark) **only if** the contrast and
    neutral-gray tests stay green without weakening them; otherwise keep it
    and say so. The prototype's `--faint` (#AEAEB3) and green are not adopted
    (they fail 4.5:1). Player color lightness/chroma (`--pc-l`, `--pc-c`) are
    not changed.
12. **Today header.** `#teamBtn` is plain text (`--fs-headline` 600, ink) with
    a chevron-down, no box. `#todayNewDay` is plain text (`--fs-headline` 600).
    The gear stays. All three at least 48×48.
13. **Pass.** `--surface`, 20px radius (`--r-lg`), no border, padding about
    1rem 1.125rem, 0.75rem between passes. Tip-off `--fs-secondary` 600 muted;
    status `--fs-footnote` muted text with a colored dot (`--ok` / `--warn`);
    opponent `--fs-large` 700, letter-spacing -.03em; mini rotation rows 4px
    with 3px between them, **off-floor in `--track`**, period gaps still
    transparent; summary `--fs-secondary` muted.
14. **Add a game** is a row with a `plus` icon (from `app/icons.js`), left
    aligned, in the row style of decision 9. Same id, same handler.
15. **Team color.** `--tint` shows only where K1 allows it (primary action,
    phrases, selected states). Rows, cards and the timeline stay neutral.

## What would settle it

1. Side-by-side screenshots at 390×844, light and dark, of Today and the game
   screen next to `light-today.png`, `dark-today.png`,
   `light-game-timeline.png`, `dark-game-timeline.png`, with the prototype's
   sample data (`Sample team`, 9 players, Panthers 9:00, Hawks 11:30, 4×8, sub
   every 4). They read as the same design.
2. The same two screens with the team color set to Royal, light and dark.
3. The two screens at 320px wide with a 32px default font size: no cut-off
   text and no scroll on either axis.
4. Every restyled control is at least 48×48: `#teamBtn`, `#todayNewDay`,
   `#settingsBtn`, `.today-game`, `#todayAddGame`, `#todayTeam`,
   `#todaySeason`, `#backBtn`, each `.phrase`, each timeline row, `#regen`,
   each fold summary, `.seg` buttons, `#abBench`, `#abCard`. The smoke touch
   check covers them.
5. `npm test` passes, including the contrast and token guards, unweakened.
6. The printed card is unchanged (`app/card.css` untouched; the smoke card
   checks stay green).
7. No extra taps: every action on both screens is reached with the same
   number of taps as before. Same ids, same handlers, same sheets.
8. The game screen shows one large title, the opponent, with
   `"9:00 · Planned"` under it for the sample's first game.
9. `--ease` is `cubic-bezier(.32,.72,0,1)`.

## Surfaces

Change: `app/tokens.css`, `app/app.css`, `app/index.html`,
`app/teams-view.js`, `app/state.js` (`rowGradient`), `app/render.js` (title
visibility, if needed), `app/sw.js` (VERSION and SHELL), `test/` (new and
updated cases), `scripts/smoke/` (touch coverage), `scripts/budgets.mjs`
(only if the byte ceiling is crossed).

Must not change: `app/card.css`, the printed card markup, the four pure
modules' behavior, `scripts/budgets.json` `requests`, any element id.

## Constraints

- `docs/interface-guidelines.md`: L1–L3, L5, L6, C1, C2, C6, K1, K3,
  T1–T3, M1, I1, N5, A2, W1. No tab bar. 48px targets. rem type from the
  seven `--fs-*` tokens only; no new font-size token. Tint only where K1
  allows.
- Colors come from tokens. No raw hex in `app.css` for new rules.
- Reuse: `gameLabel` for the title, the pass status words and dot for the
  sub line, `icons.js` `plus` and chevrons, `rowGradient` for the mini rows,
  the existing `.phrase` markup. Do not re-derive plan status; read
  `plans[i].ok` as `renderPass` does.
- Every `[data-tint]` block names its theme explicitly (the selector trap in
  `tokens.css`).
- If a precached file changes, bump `VERSION` in `app/sw.js` and set `SHELL`
  to the digest `npm test` names, in the same edit.
- Byte budget overruns: widen the slack in `scripts/budgets.mjs`. Never
  re-record `requests`; never run `--update-budgets`.
- American spelling.

## Design

See the decisions above; they are the design. Values come from the
prototype's CSS in `notes/mockups/prototype/index.html` (`.lt h1`, `.sent`,
`.tl*`, `.primary`, `.seg`, `.grp*`, `.row`, `.gcard`, `.spark`), expressed in
rem and tokens.

## Proof

- **`node --test` on `rowGradient`** (`test/game-pass.test.js`): off-floor
  stretches paint the track color, period gaps stay transparent. Covers 13.
- **`node --test` on tokens** (`test/graphite-tokens.test.js` or a new small
  test): `--ease` value, `--track` and `--seg-on` declared in light and dark.
  Covers 9 and 11. The existing contrast/type-scale guards cover 5.
- **Smoke touch check** (`scripts/smoke/`): the restyled controls in item 4
  are all measured at 48×48 on Today and the game screen. Covers 4.
- **Smoke `app-large-text`**: 320px at a 32px default font, both axes, on
  Today and the game screen. Covers 3.
- **Smoke card checks** stay green. Covers 6.
- **A smoke or node check for the title block**: on the game screen, one
  visible `h1`, its text the opponent, the sub line containing the tip-off and
  the status word. Covers 8.
- **`/browser-verify`**: the side-by-sides in 1 and 2, measured by the
  orchestrator. Covers 1, 2, 7.

## Out of scope

- #29: the Timeline/Card switch, the summary line under the timeline, the
  card sheet.
- #33: floating controls and collapsing titles.
- #28, #31, #32: new sheets. #37: removing the old interface.
- A share button in the game header.
- Changing player colors, `--faint` or the status greens to the prototype's
  values.
