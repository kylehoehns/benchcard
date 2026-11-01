# Today's team name as a plain large title

## Issue

#501: Today's team switcher (`#teamBtn` inside `h1.today-h1`) drops the
tight glass pill and reads as a large title with a chevron after it.

This started in the small-fix lane and switched to the full lane once the
diff passed 20 lines outside `test/` and `docs/` (most of it comments and the
guard).

## Goal

On a phone, the team name at the top of Today looks like the page's title,
not a cramped pill: the name in large text, a chevron after it, no fill
behind it. A coach can still tell it opens the team menu: the chevron stays,
a press or a pointer hover fills it, and a keyboard focus ring shows.

## What would settle it

1. `#teamBtn` at rest paints no fill: computed `background-color` alpha 0 and
   `backdrop-filter` `none`, in default media and under each of
   `SOLID_FALLBACK_MEDIA` (`prefers-reduced-transparency: reduce`,
   `prefers-contrast: more`), at 320x568 and 390x844, 16px and 32px text.
2. The name's left edge keeps at least 0.5em (the label's own computed font
   size) from the viewport's left edge, and the chevron's right edge keeps
   at least 0.5em from the viewport's right edge, in the same four cells.
3. No clipping and no sideways scroll: the existing #422 checks in
   `long-names.mjs` (label inside the viewport, at most two lines at 32px, no
   word cut) and the 320/32px large-text pass stay green.
4. Hover (pointer devices only) and `:active` fill with `var(--chip)`; the
   chevron (`--muted`) clears each theme's control floor (3:1, 4.5:1 under
   more contrast) on `--chip` and `--chip-hover`, across every theme and
   tint. `--muted` on `--bg` is already held to 4.5:1.
5. `#teamBtn` stays at least 48px tall (`today-game-rows.mjs` already sweeps it).
6. Before and after screenshots of Today at 320 and 390 wide, 16 and 32px,
   light and dark, with "Hawks", "ABC 6th Maroon" and "Northside Lady Thunder
   7th Grade Maroon", plus the team menu open and Today scrolled so the name
   moves into the bar.

## Surfaces

- Change: `app/app.css` (three selector lists lose `#teamBtn`, the pill
  radius rule goes, `.teambtn` hover/active fill, comments),
  `app/tokens.css` (one comment), `scripts/smoke/long-names.mjs`,
  `test/contrast.test.js`.
- Must not change: `app/engine.js`, `app/state.js`, other screens' titles,
  the header icon buttons and the `#agClose`/`#frClose`/`.gm-x` chips,
  `positionTeamMenu`, `syncBarTitle`, #422's `@media (max-width: 19em)`
  block, #478's ellipsis.

## Constraints

- Mobile first: judged at 390x844 first, and at 320 with 32px text.
- Reuse `--chip` (the header chips' fill, whose `--ink` contrast #137 already
  pins) for hover and press; no new token. `--surface-2`, the old hover, is
  #F6F6F8 on `--bg` #F4F4F6 in light, so it could not be seen.
- The guard lives in the existing `LONG_NAMES_CHECK` row (it already lands
  Today with a long team name in the four cells) and reuses its cells,
  `land`, `SETTLE`, `SOLID_FALLBACK_MEDIA`, `setMedia` and `alpha`.

## Design

Remove `#teamBtn` from the glass-chip fill rule and its two solid fallbacks,
and delete `#teamBtn { border-radius: var(--r-full) }`. `.teambtn` keeps its
`background: none`, `.press` scale, 48px floor and `.2rem .3rem` padding
(the measured gap is 21px from the left edge at 16px text, 0.5em is 17px).
Hover and `:active` fill with `--chip`. The global `:focus-visible` ring is
the focus state.

## Proof

| Seam | Covers |
| --- | --- |
| `long-names.mjs` `todayAt` (smoke row `LONG_NAMES_CHECK`), a guard under `/new-guard`, falsified by putting `#teamBtn` back into each rule | 1, 2, 3 |
| `test/contrast.test.js`, chevron on `--chip`/`--chip-hover` | 4 |
| `today-game-rows.mjs` (unchanged) | 5 |
| a screenshot run plus `/browser-verify` on the preview | 6, and whether the plain title reads as tappable |

## Out of scope

- The `@supports not (backdrop-filter)` copy is not reachable from headless
  Chrome (it supports `backdrop-filter`), so the guard does not cover it.
- The issue's fallback, a pill with real padding, is used only if the after
  shots show the plain title does not read as tappable.
