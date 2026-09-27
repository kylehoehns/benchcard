# Contrast, headings, motion, forced colors and landscape

## Issue

#151 (`ready-for-agent`, parent #153). This issue collects several small
accessibility and motion gaps that the smoke suite does not check: three
contrast failures, missing and skipped headings, a bouncing easing, no
forced-colors support, and no landscape smoke check.

## Goal

A coach can read and use the app with any phone setting turned on:

- dark mode, and dark mode with more contrast
- Windows High Contrast (forced colors)
- a phone turned sideways

A screen reader user can move through each screen by its headings. Nothing
the coach does many times a minute bounces or animates.

## Survey (44e016c)

Every claim in the issue held. Some line numbers have moved:

- **`.alert.info`.** The rule is at `app.css:1046`. Its text is `--info`
  (#6C6C72, the same value as `--muted`) on `--info-soft` rgba(28,28,30,.06).
  That tint sits over body `--bg` #F4F4F6, which gives **4.23:1** in light
  mode. `test/contrast.test.js:98-115` only blends soft tints over
  `--surface`, so it never sees this case.
- **The phrase underline.** `--phrase-line` rgba(28,28,30,.32), used at
  `app.css:2713`, measures **2.00:1** against `--bg` in light mode. Dark mode
  measures 3.55:1, which passes.
- **`.btn.danger`.** The rule is at `app.css:285`. Its text is the literal
  `#fff` on `--err`. That gives **2.93:1** in dark mode and **1.91:1** in dark
  mode with more contrast. Light mode gives 6.06:1. The only filled danger
  button is `#confirmYes`.
- **Headings.** The game screen has only `h1#gameTitle`. "This game" is a
  `div.side-hd` (`index.html:715`), and the timeline has no heading at all.
  - Bench mode (`#gamemode`) has no headings.
  - `#help` uses a `div.keys-t` for its title, followed by seven `h4`s.
  - `#confirm` and `#keys` use a `div.keys-t` for their titles.
- **`--spring`.** It is defined at `tokens.css:67` and used 9 times in
  `app.css`: lines 678, 803, 1130, 1136, 1178, 1244, 1981, 2397 and 3783.
  Other easing literals in JS:
  - `timeline.js:97`: `BLK_EASE` `cubic-bezier(.22,.61,.36,1)`
  - `fx.js:63`: `SPRING`, a physics spring used by `popIn`
  - `fx.js:64`: `SNAP`
  - `fx.js:87`: `swapIn`
  - `fx.js:150`: `EASE [0.32,0.72,0,1]`
  - `fx.js:206`: a hand-rolled ease-out
  - `gamemode.js:838`: `120ms ease-out`
- **Forced colors.** There is no `forced-colors` rule anywhere. Many
  selected states are shown with a background color or box-shadow alone.
- **Landscape.** Two `(orientation: landscape) and (max-height: 560px)`
  blocks exist, at `app.css:1784` (14 rules) and `app.css:4362` (7 rules).
  They are only guarded by source-reading tests. No smoke check sets a
  landscape viewport.

## What would settle it

Contrast is measured with the WCAG 2.x formula that `scripts/tokens-css.mjs`
already implements. An alpha tint is blended over the ground it actually
sits on.

1. **Info alert.** `.alert.info` text on `--info-soft`, blended over `--bg`,
   is **≥ 4.5:1** in light mode.
   - Dark mode stays at or above 4.5:1.
   - Light mode with more contrast stays at or above its current 6.60:1.
   - `test/contrast.test.js` gains a case that blends every soft status
     tint over `--bg` as well as `--surface`, and asserts 4.5:1. The case is
     shown red before the fix.
2. **Phrase underline.** `--phrase-line` blended over `--bg` is
   **≥ 3:1** against `--bg` in light mode and in light mode with more
   contrast. Dark mode stays at or above 3:1.
   - Team colors that set `--phrase-line: transparent` are unchanged.
   - `test/contrast.test.js` gains this case, shown red before the fix.
3. **Danger button.** Filled `.btn.danger` text measures **≥ 4.5:1**
   against its fill in all four themes: light, dark, light with more
   contrast, and dark with more contrast. The hover state is checked too.
   - The fix changes the **text color** in the dark themes. `--err` itself
     is not changed, because it is used as a text color elsewhere.
   - The text color is a token with a value per theme, not a literal in
     the rule.
   - `test/contrast.test.js` gains this case for all four themes, shown red
     before the fix.
4. **Headings.** In the rendered DOM, every screen's heading outline starts
   at one `h1` and never skips a level (no h1 → h3, no h2 → h4). Each
   dialog's own outline starts at `h2`.
   - **Game screen.** "This game" becomes an `h2` and keeps its current
     look. The timeline area gets an `h2`. It should be visible if the
     screen already shows a label there. Otherwise use a `.sr-only` h2
     reading "Timeline".
   - **Bench mode (`#gamemode`).** Gets an `h2` naming it, which may be
     `.sr-only`. Its visible sections that already have labels ("Bench",
     the floor, "Next change") become `h3`s and keep their look.
   - **`#help`.** Its title becomes an `h2`, and the seven `h4`s become
     `h3`s, each keeping its look.
   - **`#confirm` and `#keys`.** Their titles become `h2`s, keeping their
     look.
   - A new smoke check walks the rendered heading outline and asserts no
     skipped levels, exactly one `h1` per screen, and each open dialog's
     headings starting at `h2`. It covers Today, the game screen, Team,
     Season and Settings, and opens `#help`, `#confirm` and bench mode. It
     is shown red before the fix (the game screen's skip or `#help`'s
     h4s).
   - Where the look depends on the old element or class, keep the class.
     Reset only the heading's default margins and font so that nothing
     moves. The pixel positions of those titles are unchanged at 390.
5. **Easing.** `--spring` is removed from `tokens.css`. Every former use
   either uses `--ease` (`cubic-bezier(.32,.72,0,1)`) or has no transition
   (item 6).
   - JS reads the easing from **one place**: `fx.js` exports it, and
     `timeline.js` and `gamemode.js` import it.
   - `BLK_EASE`, `SNAP`, `swapIn`'s curve, the `EASE` literal, the
     hand-rolled ease-out at `fx.js:206` and `gamemode.js`'s `ease-out` all
     use it.
   - `fx.js`'s physics `SPRING` (`popIn`) becomes a tween with that easing,
     because its damping ratio of about 0.88 overshoots.
   - Durations stay as they are unless one is outside M1's 250–450ms, and
     then only if the animation is not a tap response (`--t-tap` is left
     alone).
   - A guard test (named seam, `/new-guard`) fails if app CSS or JS
     contains any `cubic-bezier(` or bare `ease-out` / `ease-in` /
     `ease-in-out` easing outside `tokens.css`'s `--ease` and `fx.js`'s
     one export. It also fails if any spring config appears. It is shown
     red by planting one.
6. **Instant repeated actions (M4).** These have **no transition** on the
   property that changes when toggled:
   - the switch knob: `input[switch]::after`, and `.switch input::after` in
     advanced.html's CSS
   - the checkbox tick: `input[type=checkbox].box`
   - the player chip avatar: `.plr .av`

   Their state still changes. A smoke or unit check reads the computed
   `transition-duration` (or `transition-property`) on the live switch knob
   and on a player chip, and asserts 0s or none.
7. **Forced colors.** One `@media (forced-colors: active)` block gives each
   selected, picked or on state a visible border or outline in a system
   color (`Highlight` or `CanvasText`). The unselected state has none, or a
   different one. It covers:
   - segmented buttons (`.seg button.on` / `[aria-selected=true]`)
   - picker tiles (`.plr.on`)
   - option rows (`.opt[aria-checked=true]`), whose radio dot is drawn as a
     border
   - `.chip.sel`
   - switches (`input[switch]`): the track has a border and the knob is
     visible in both states
   - `.gm-p.picked` in bench mode
   - `.color-opt.on`
   - progress dots (`.tour-dots i.on`, `.flow-prog i.on`)
   - timeline blocks (`.tl-blk`): each block has a border so it shows
     against its track
   - status dots that carry meaning without a word (`.gm-dot.now`)

   A new smoke check emulates `forced-colors: active` (via
   `Emulation.setEmulatedMedia`, then reset) on **Today**, the **game
   screen** and **bench mode**. On each, it finds a selected or on control
   and an unselected one, and asserts that they differ in computed
   `outline-style`/`outline-width` or `border-width`/`border-style`. It also
   asserts that timeline blocks have a non-zero border. It is shown red
   before the block exists.
8. **Landscape.** A new smoke check runs at **844×390**
   (`setWidth(c, 844, 390)`), then resets to 390×844. It covers the game
   screen and bench mode.
   - The document does not scroll sideways (`scrollWidth ≤ 844`).
   - A rule from each landscape block is live. For example, a computed
     style that `app.css:1784`'s block sets on `.gm-foot` or `.gm-body`, and
     one that `app.css:4362`'s block sets on `.bar` or `.wrap`.
   - Bench mode's step buttons (`.gm-nav`) are fully inside the viewport.

   It is shown red by breaking one landscape rule temporarily.

## Surfaces

Change:
- `app/tokens.css`:
  - remove `--spring`
  - a new danger-button text token with light, dark and both more-contrast
    values
  - `--info` (or `--info-soft`) and `--phrase-line` values as needed
- `app/app.css`: the `--spring` uses, the three no-transition rules, the
  `.btn.danger` text color, heading resets, the forced-colors block
- `app/index.html`: the heading elements listed in item 4
- `app/advanced.html`: `.switch` CSS (its `--spring` and knob transition),
  if it carries its own copy
- `app/fx.js`, `app/timeline.js`, `app/gamemode.js`: the one easing
- `app/plan-view.js`, `app/render.js` or any JS that builds or looks up the
  changed heading elements
- `test/contrast.test.js`, a new easing guard test, new smoke modules plus
  `scripts/smoke/registry.mjs` entries
- `app/sw.js` VERSION and SHELL

Do not change:
- the four pure modules (`app/engine.js`, `app/budget.js`, `app/storage.js`,
  `app/roster.js`)
- `--err`'s values
- the card's print styles
- `docs/specs/` other than this file

## Constraints

- **Interface guidelines:** K5 (contrast, including `prefers-contrast: more`
  values for every new color), M1 (one easing, no bounce), M4 (instant
  repeated actions), A4 and P5 (respect the phone's settings).
- **One answer lives in one place.** The easing lives once in CSS
  (`--ease`) and once in JS (`fx.js`'s export). The danger text color is a
  token, not a literal. The forced-colors rules live in one block.
- **Reuse, do not re-derive:**
  - contrast math: `scripts/tokens-css.mjs` (`contrast`, `over`,
    `luminance`)
  - the `.sr-only` class: `app.css:1293`
  - smoke helpers: `setWidth` and `evalIn` in `scripts/smoke/dom.mjs`,
    `goRich` in `fixtures.mjs`, `tap` in `sheet-drive.mjs`
  - media emulation: the `Emulation.setEmulatedMedia` pattern in
    `bench-look.mjs` / `first-run-flow.mjs`
  - smoke check shape: `export async function xPass(c, origin)` returning
    `{ pass, detail }`, registered in `registry.mjs` like `dark-input-bg.mjs`
- **Headings must not move anything.** The same text at the same place, at
  390 and at 320/32.
- **Existing guards stay green:**
  - `test/gm-landscape.test.js` and `test/landscape-chrome.test.js`
  - #171's focus-on-heading tests. Any h1 or sheet h2 that carries
    `tabindex="-1"` keeps it.
  - `scripts/smoke/team-color.mjs`'s `--phrase-line: transparent`
    assertion
- **Budget.** Smoke has 43 requests as its hard budget. A byte or DOM node
  alarm is re-pinned or widened, never escalated.
- **Precache bump.** Bump `VERSION` and set `SHELL` to the digest `npm test`
  names.
- American spelling.

## Design

- Tokens:
  - Remove `--spring`.
  - Add `--on-err` (the danger text color): `#fff` in the light themes, and
    a near-black ink such as `#1C1C1E` in the dark themes.
  - Darken light `--info`, or lighten `--info-soft`, just enough to reach
    4.5:1 over `--bg`. Prefer the change that keeps `--info` equal to
    `--muted` if that holds up. If not, `--info` gets its own value.
  - Raise light `--phrase-line` alpha until it reaches 3:1, around 0.5.
- CSS:
  - Swap `var(--spring)` for `var(--ease)`.
  - Set `transition: none` on the three M4 targets.
  - Change `.btn.danger` text to `color: var(--on-err)`.
  - Add a heading reset, e.g. `h2.side-hd, #help h3 { margin:0; font:inherit }`,
    where the old class carried the look.
  - Add one `@media (forced-colors: active)` block near the end of
    `app.css`, before the reduced-motion sweep.
- JS:
  - `fx.js` exports `EASE` as a CSS string (and the array form if motion
    needs it).
  - `timeline.js` and `gamemode.js` import it.
  - `popIn` uses a tween.
- Markup: change the elements named in item 4. JS that queries them by
  class keeps working because the classes stay.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Contrast cases (soft tint over `--bg`, `--phrase-line`, `--on-err` across four themes, and hover) | `node --test test/contrast.test.js` | 1, 2, 3 |
| Easing guard (named source-reading seam, `/new-guard`), shown red by planting | `node --test test/<easing guard>.test.js` | 5 |
| Heading outline smoke check | `node scripts/smoke.mjs --no-tests --only "<name>"` | 4 |
| M4 no-transition check (smoke, reading computed style) | smoke `--only` | 6 |
| Forced-colors smoke check | smoke `--only` | 7 |
| Landscape smoke check | smoke `--only` | 8 |
| Existing guards | `npm test` | all |
| Look: game screen, bench mode, `#help`, `#confirm` at 390 light/dark and 320/32; the Remove team confirm in dark mode; forced colors and landscape on the preview | `/browser-verify` (me, on the preview) | 3, 4, 7, 8 |

## Out of scope

- The phrase text against plain sentence words in dark mode (2.61:1). The
  underline carries that difference in Graphite. For other team colors,
  it is a separate question for a later issue.
- Light mode with more contrast reaching 7:1 on `.alert.info`. K5 says
  "aiming for" 7:1 on small text, and this change only fixes the 4.5:1
  failure.
- Plan sheet group titles (`div.pgrp-h`) becoming headings. They are not
  headings today, so they skip no level.
- Dead CSS and tokens (#152).
