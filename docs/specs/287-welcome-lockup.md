# 287: welcome logo under the iPhone status bar, and a small lockup

## Issue

#287: on an iPhone the welcome screen's logo sits under the status-bar strip and reads blurred, and the logo and wordmark look small above the bold headline.

This started in the small-fix lane. A fit guard pushed it past the 20-line limit, so it switched to the full lane, and this spec was written from the small-lane brief at that point.

## Goal

A coach opening Benchcard for the first time on an iPhone sees a crisp logo below the status bar. The logo and the word "Benchcard" are big enough to read as the app's name.

## What would settle it

1. The welcome logo svg renders at 36×36 CSS px (it was 26). The wordmark (`.wel-lockup`) is `var(--fs-title)`, which is 22px. The owner asked for 1.35rem (21.6px), but `test/type-scale.test.js` allows only `--fs-*` tokens. The gap is .55rem.
2. `.welcome`'s top padding is the old clamp plus `env(safe-area-inset-top)`, the same pattern `.bar` uses. With a 59px inset emulated, the logo's top is at least 75px (59 plus the old 16).
3. At 390×745 with no inset (a Safari tab, where the status bar is outside the viewport), the welcome page is no taller than on main. On main it was already 71px taller than the viewport. That is a pre-existing problem and is not fixed here.
4. Unchanged: the 26px header logos on about, advanced and the chart pages; the welcome logo markup (`test/mark-drift.test.js`); the tint and card colors.

## Surfaces

- **Change:** `app/app.css` (`.welcome`, `.wel-lockup`, `.wel-mark svg`, `.wel-stage`); `app/sw.js` through `npm run sw:bump`; a new smoke row, `scripts/smoke/welcome-lockup.mjs`, with its registry and README rows.
- **Must not change:** `scripts/mark.mjs` (`markSvg`, `logoSvg`, `welcomeLogoSvg`); the svg markup in `index.html`; `app/vendor/`.

## Constraints

- Size the logo with CSS only. The header logos share `logoSvg`.
- Font sizes come from the type-scale tokens.
- Any growth in the lockup's height is paid for by its margins. The headline and the stage's 12rem floor stay as they are.
- `app.css` is precached, so `npm run sw:bump` runs after the last change.

## Design

- `.welcome` padding-top becomes `calc(clamp(1rem, 4vw, 3rem) + env(safe-area-inset-top))`.
- `.wel-mark svg` is 36×36. `.wel-lockup` uses `font-size: var(--fs-title)` with `gap: .55rem`.
- `.wel-lockup` margin-bottom goes from .62rem to .22rem, and `.wel-stage` margin-top from .7rem to .45rem. Together they give back the lockup's 10px.

## Proof

- **Smoke row `welcome lockup: clears the top inset, 36px logo`** covers items 1 to 3:
  - It emulates a 59px top inset with CDP `Emulation.setSafeAreaInsetsOverride`, waits for the mark's entry animation to finish, and checks the logo's size, the logo's top, the wordmark size and the gap.
  - Then, with no inset at 390×745, it checks the page is no taller than main's 71px overflow.
  - **Red on the old CSS:** logo 26×26, top at 16px, wordmark 17px, gap 7.2px. Before the margin fix, the page was 81px over.
- **Item 4:** `test/mark-drift.test.js` and the existing welcome, Hardwood and team-color smoke rows stay green.
- **Preview:** the owner checks the PR preview on an iPhone before merge. Playwright's WebKit is not iOS Safari.

## Out of scope

- The 71px overflow at 745px that main already has.
- Changing `markSvg` or the header logos.
