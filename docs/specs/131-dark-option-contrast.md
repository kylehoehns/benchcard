# #131 — The Dark option in Settings can't be seen in light mode

## Issue

#131. In light mode, the "Dark" choice under Settings › Appearance draws
near-white text on a light gray control (1.11:1), so it reads as blank space.

## Goal

A coach in light mode sees all three Appearance choices, Automatic, Light and
Dark, as clearly as each other. Picking any of them still switches the theme,
and dark mode looks exactly as it does today.

## Decisions

The ticket left two fixes open. This spec picks one, from the tree:

- **Scope the dark palette to the root element.** `app/tokens.css:178`
  becomes `:root[data-theme="dark"] { … }`. The button keeps its
  `data-theme="dark"` attribute; `app.js:59` and `render.js:830` are
  untouched.
  - Why this one: the cause is that the palette matches *any* element with
    the attribute, not the button's name. Renaming the button fixes this
    button and leaves the trap for the next element. Scoping removes the trap.
  - The tint blocks below it already name `:root` this way
    (`tokens.css:240–391`), so this makes the file consistent.
- **Specificity rises from (0,1,0) to (0,2,0).** Checked against every rule
  that competes on the root element:
  - the light `:root` block (0,1,0) — dark still wins, as before;
  - the tint blocks `:root[data-theme="dark"][data-tint="…"]` (0,3,0) — still
    win over the base dark palette, as before;
  - the more-contrast `:root[data-theme="dark"]` inside
    `@media (prefers-contrast: more)` (0,2,0) — ties, and wins on source order
    because the media block comes later in the file, as before.
- **Three more bare selectors carry the same trap, and are fixed here too.**
  The first survey missed them; the developer found them on `main` at 699987e:
  - `app/app.css:989` — `[data-theme="dark"] input, … select, … textarea`
  - `app/app.css:1002` — `[data-theme="dark"] #view-games input[type=text], … select`
  - `app/about.html:362` (inline `<style>`) — `[data-theme="dark"] .tl-div.onblk`
  Each matches inside *any* element with the attribute, the Settings button
  included. Nothing sits inside that button today, so nothing shows, but it
  is the same flaw. Each gets a leading `:root`. That is one token per
  selector, and it lets the guard in item 6 hold the whole of `app/`, with no
  list of exceptions.
- **The three descendant rules keep their old specificity:
  `:where(:root)[data-theme="dark"] …`.** The first build gave them a plain
  `:root` prefix. That added one class, and item 7 then measured ten fields
  on `main` that changed paint in dark mode: the four print selects, the
  minutes switch and the five roster-sheet inputs. They went from
  transparent to filled. Three deliberate overrides had been sized to win
  against the old specificity: `#sheetCard .pgrp .prow-select` (1,2,0),
  `.pgrp .prow-in` (0,2,0) and `input[switch]` (0,1,1). `:where(:root)` adds
  nothing, so the rules are anchored at the root and weigh exactly what they
  did. `tokens.css` keeps `:root[data-theme="dark"]` like its tint and
  more-contrast siblings; nothing competes with it on the root (above).

## What would settle it

1. At 390×844, light theme, Settings open: the "Dark" label in
   `#themeSeg` measures **≥ 4.5:1** against its own painted background
   (today 1.11:1). "Automatic" and "Light" are unchanged.
2. The Dark button's computed `color-scheme` is `light` in light mode (today
   `dark`).
3. Tapping Automatic, Light and Dark each still switches `<html>`'s
   `data-theme` and repaints: `--bg` read by paint on `<body>` is the light
   `--bg` after Light and the dark `--bg` after Dark.
4. Dark mode is unchanged: `node scripts/compare-shots.mjs` passes its
   painted-`--bg` check for every dark shot.
5. `test/contrast.test.js` and `test/graphite-tokens.test.js` still resolve
   the same dark, dark + more contrast and dark tint values as before — no
   expected value in them changes.
6. A guard fails if any selector in `app/*.css`, or in an inline `<style>` in
   `app/*.html`, applies `[data-theme="dark"]` to anything but the root
   element (i.e. the attribute selector is not directly on `:root` or `html`,
   or inside a `:not()` directly on one of them). It fails on the tree before
   this change, naming `tokens.css`, `app.css` and `about.html` and each
   bare selector.
7. Dark mode, 390×844: the computed `background-color` of every `input`,
   `select` and `textarea` on Games, Roster, Settings and the welcome screen
   is the same before and after the change. The same goes for
   `.tl-div.onblk` on `about.html`. Record the values from `main` first.

## Surfaces

- Changes: `app/tokens.css` (one selector, plus its comment if it describes
  the bare form), `app/app.css` (two rules at 989 and 1002), `app/about.html`
  (one rule at 362), `scripts/tokens-css.mjs` (the exact selector text it merges
  at line 78, and its comments), `app/sw.js` (VERSION and SHELL), a new or
  extended test for item 6.
- Must not change: `app/app.js`, `app/render.js`, `app/index.html`'s
  Appearance markup, any token value.

## Constraints

- **Precache bump.** `tokens.css`, `app.css` and `about.html` may be precached: bump `VERSION` in `app/sw.js`
  and set `SHELL` to the digest `npm test` names, in the same change.
- **Reuse `scripts/tokens-css.mjs`** for anything that needs to resolve token
  values. Do not write a second CSS token parser. The guard in item 6 may
  reuse its block splitter if one is exported, or the CSS parsing another
  test already uses (`test/css-collide.test.js`, `test/dead-class.test.js`);
  look before writing a new one.
- **The guard is built under `/new-guard`**: watch it fail on the old
  selector for the right reason before the fix lands.
- **Guidelines:** K5 (text 4.5:1), S3 (Appearance: Automatic, Light, Dark).
- Mobile first: measure at 390×844.

## Design

Anchor the four selectors at `:root`. Update the parser's exact-text lookup to the new
selector so `dark` still resolves. Add the guard. Bump the precache.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Token resolution | `node --test test/contrast.test.js test/graphite-tokens.test.js` (existing, through `parseTokensCss`) | 5 |
| Root-only dark selector guard | a `node --test` file reading `app/*.css` and inline `<style>` in `app/*.html` — a source-reading guard, named here on purpose | 6 |
| Painted theme in a browser | `/browser-verify` at 390×844 on `npm run serve`, then the preview | 1, 2, 3 |
| Dark shots unchanged | `node scripts/compare-shots.mjs --issue 131` | 4 |
| Dark input backgrounds unchanged | `/browser-verify` computed styles, `main` vs branch | 7 |

## Out of scope

- Renaming the button attribute.
- The header-chip contrast in light mode (#137) and every other item under
  #153.
