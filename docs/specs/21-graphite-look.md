# 21 — Graphite look

## Issue

#21 (parent #18): the current screens take the Graphite look. That means neutral
grays, ink as the action color, players as the only color, light, dark and
increased-contrast values, and the phone's own font. The printed card keeps
Inter.

## Goal

A coach opens Benchcard and the screen is gray and white (or near-black), with
dark ink on the button they are meant to press. The only colors are the
players' own and the three status colors: planned, needs a fix and
destructive. With increased contrast turned on, it gets sharper. The text is in
the phone's own font. The card they print is the same card, to the pixel.

## Decisions the survey needed (human, 2026-09-14)

The ticket and #18 did not settle these. The human decided each one:

1. **The static pages inherit Graphite.** `about.html`, `advanced.html` and the
   six chart pages link `tokens.css` and read `--font`. They take the new values
   because there is one palette, not two. Their `theme-color` metas and
   pre-paint scripts move to the new ground too. Their markup and layout do not
   change. This is narrower than #18's "static pages are out of scope", which is
   about redesigning them.
2. **App icons and `og.png` stay as they are.** They are the brand mark, not
   the interface. A new issue covers them.
3. **`--info` blue becomes neutral.** It takes the secondary-text value, so
   `.alert.info` is gray and `.tl-tot.lo` is secondary text. The word next to
   the total already says which end it is (the comment above `.tl-tot .ex`).
4. **Increased-contrast values are the developer's choice**, held to a stricter
   floor. Text tokens must reach ≥ 7:1 and control tokens ≥ 4.5:1 under
   `prefers-contrast: more`. Normal light and dark keep the ticket's 4.5:1 and
   3:1.

## What would settle it

1. **Tokens.** In `app/tokens.css`, the light block (`:root`) and dark block
   (`[data-theme="dark"]`) hold exactly:

   | Ticket name | Token | Light | Dark |
   | --- | --- | --- | --- |
   | ground | `--bg` | `#F4F4F6` | `#0B0B0C` |
   | surface | `--surface` | `#FFFFFF` | `#1C1C1E` |
   | ink | `--ink` | `#1C1C1E` | `#F4F4F6` |
   | secondary text | `--muted` | `#6C6C72` | `#98989F` |

   Every other color token (`--bg-2`, `--surface-2`, `--surface-3`, `--ink-2`,
   `--faint`, `--line`, `--line-2`, `--pc-track`, the shadows) takes a neutral
   gray value in both themes. Warm tints like `#F6F4F0`, `#EFECE6`,
   `rgba(20, 18, 15, …)` and `rgba(35, 28, 18, …)` no longer appear. Each
   color token also gets a `prefers-contrast: more` value for light and for
   dark (see Design for the selector trap).
2. **No ember.** `--accent` equals `--ink` and `--accent-ink` equals
   `--surface` in every block, so the primary action (`.btn.primary`,
   `.gm-nav.next`, etc.) is filled with ink. `--accent-soft` and `--accent-line`
   are ink at the same alpha they use today. The ember values `#C33F08`,
   `#A83505`, `#FF7A38`, `#FF9257`, `rgba(195, 63, 8, …)` and
   `rgba(255, 122, 56, …)` appear in no file under `app/` (excluding
   `app/vendor/` and binary images) and not in `scripts/charts.mjs`.
3. **Status colors.** `--ok` (planned, green), `--warn` (needs a fix, amber)
   and `--err` (destructive, red) are distinct from each other and from `--ink`
   in every block, and none is gray. They keep their hues. Their values may move
   to pass item 6 on the new grounds.
4. **Info.** `--info` equals `--muted` and `--info-soft` is neutral in every
   block (decision 3).
5. **Players unchanged.** `--pc-l`, `--pc-c` and `--av-ink` keep their values
   (`63%`/`.145`/`60%` light, `72%`/`.15`/`100%` dark), and no player-hue code
   in `app/*.js` changes. The same player gets the same hue.
6. **Contrast test.** A new `test/contrast.test.js` reads the token values from
   `app/tokens.css`. It resolves light, dark, light + more contrast and dark +
   more contrast, and checks each against WCAG 2.2 relative luminance:
   - **Text tokens** `--ink`, `--ink-2`, `--muted`, `--faint`, `--ok`, `--warn`,
     `--err`, `--info`, on **every ground/surface token** (`--bg`, `--bg-2`,
     `--surface`, `--surface-2`, `--surface-3`): ≥ 4.5:1 in light and dark,
     ≥ 7:1 with more contrast.
   - **Pairs that sit together:** `--accent-ink` on `--accent`, and each of
     `--ok`/`--warn`/`--err`/`--info` on its own `-soft` tint composited over
     `--surface`: same floors as text.
   - **Control tokens** `--accent`, `--ok`, `--warn`, `--err` on every
     ground/surface token: ≥ 3:1 in light and dark, ≥ 4.5:1 with more contrast.
   - Alpha tokens are composited over the background they are checked against,
     never read as opaque. Hairlines (`--line`, `--line-2`) are decoration and
     are not checked. A token the test cannot parse fails the test. It does not
     get skipped.
7. **Font.** `--font` is exactly
   `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif`.
   `InterVar` appears only in the `@font-face` rules in `tokens.css`, in `.card`'s
   `font-family` in `card.css`, and in `CARD_FONT` in `card.js`. The last two
   stay byte-identical. It appears nowhere else under `app/` (comments aside).
   `test/card-*.test.js` and `test/charts.test.js` pass unchanged.
8. **The card font still loads before the card is fitted.** The UI no longer
   uses Inter, so nothing starts loading it at boot, and
   `document.fonts.ready` can resolve before the card face is fetched. On a
   cold load of the RICH fixture, after the app settles:
   `document.fonts.check('800 16px InterVar')` is `true`, and the rendered
   `.card .five` font size matches what a re-fit with the loaded font produces.
   A cold load never leaves a card sized for the fallback face.
9. **theme-color.** `site.webmanifest` `theme_color` and `background_color` are
   `#F4F4F6`. The `theme-color` meta and the pre-paint script's two values are
   `#F4F4F6` (light) and `#0B0B0C` (dark) in `index.html`, `about.html`,
   `advanced.html`, `render.js`'s `applyTheme` and the chart-page template in
   `scripts/charts.mjs` (so all six generated pages match). A test reads the
   ground from `tokens.css` and checks every one of those against it. Adding a
   page with a mismatched `theme-color` would fail it.
10. **Card and budgets.** `npm run smoke`'s `card is 3.45 × 5in` row passes, and
    so do the three budget rows, without any edit to `scripts/budgets.json`.
11. `npm test` and `npm run smoke` pass. Tests written against the ember
    accent are updated in this change. Today that is
    `test/rules-position.test.js`, which reads `var(--accent)` in a rule. It
    keeps its meaning (the zero hint is not painted in the tint), not the old
    color.

## Surfaces

Change:

- `app/tokens.css` — the palette, the more-contrast blocks, `--font`, the header
  comment (it still says "warm" and describes Inter as the UI face).
- `app/app.css` — only where a hard-coded warm color or `var(--info)` needs
  it: `.tl-tot`, `.alert.info`, the handful of literal `rgba(20, 18, 15, …)` /
  `#14120F` / `#F6F4F0` / `#080706` values. No layout changes.
- `app/card.css` — only `.stage`'s ember glow (`color-mix(… var(--accent) 7% …)`)
  if it still reads as color. `.card` and everything inside the card must not
  change.
- `app/app.js` — the card-font load and re-fit (item 8).
- `app/render.js` — the two `theme-color` values in `applyTheme`.
- `app/index.html`, `app/about.html`, `app/advanced.html` — `theme-color` meta and
  pre-paint values. Inline `style="color:var(--accent)"` stays as is (it is ink
  now).
- `app/site.webmanifest` — `theme_color`, `background_color`.
- `scripts/charts.mjs` — the `theme-color` meta and pre-paint values in the
  template. Then regenerate the six chart pages with the script (`guard-edit.sh`
  denies hand edits to them).
- `app/sw.js` — `VERSION` bump and `SHELL` digest.
- `test/contrast.test.js` (new), a theme-color test (new or folded into
  it), `test/rules-position.test.js`, and a smoke check for item 8 if a node
  test cannot prove it.
- `AGENTS.md` — the smoke check count ("21 of them") if a check is added.

Must not change:

- `.card` and every rule inside the card in `card.css`, `CARD_FONT` in `card.js`,
  `share.js`'s `PAGE`/`EDGE` (the shared image is paper, not UI), card fitting.
- The player hue formula and its tokens (`--pc-l`, `--pc-c`, `--av-ink`,
  `--av-ring`).
- `app/icon-*.png`, `apple-touch-icon.png`, `favicon.ico`, `og.png`,
  `scripts/og.mjs`, and the raster samples (decision 2).
- Markup structure, copy, stored keys, `engine.js` / `budget.js` / `storage.js` /
  `roster.js`, `scripts/budgets.json`, `app/vendor/**`.

## Constraints

- **One palette in one place.** Every color comes from `tokens.css`. Do not add
  a second token file, do not give the static pages their own palette, and do
  not add a dark or contrast variant of any component rule in `app.css`
  (`tokens.css`'s header says why).
- **Keep the token names.** `--bg`, `--surface`, `--ink`, `--muted` are the
  ticket's ground, surface, ink and secondary. `--accent` stays as the name of
  the tint, because #25 (team color) sets it. Do not rename tokens across
  `app.css`.
- **Never regress the card** (`AGENTS.md` § Rules). The card is black on white
  and reads no theme token. Its font stack must match `CARD_FONT` exactly
  (`AGENTS.md` § Traps).
- **The card re-fits on the font it prints in** (`AGENTS.md` § Traps). Once
  the UI stops using Inter, `document.fonts.ready` alone no longer guarantees
  the card face is loaded. Load it explicitly with
  `document.fonts.load('800 16px InterVar')` or an equivalent, and re-fit when
  that settles. Reuse the existing re-fit in `app.js` (`render('cards')`). Do not
  add a second one. `pills.js` and `gamemode.js` measure from computed style and
  need no change.
- **Precache bump.** `tokens.css`, `app.css`, `app.js`, `render.js`, the HTML
  and the manifest are precached. Bump `VERSION` in `app/sw.js` and set `SHELL`
  to the digest `npm test` names.
- **Generated pages come from their generator.** Edit `scripts/charts.mjs` and
  re-run it. Never hand-edit the six chart pages.
- **`requests` budget.** No new module or stylesheet. The card font request
  already exists, so loading it on purpose adds nothing.
- **Interface guidelines:** K1 (tint = ink on the primary fill and selected
  states), K2 (player colors untouched), K3 (green/amber/red, none equal to the
  ink), K5 (4.5:1 text, 3:1 controls, plus a more-contrast value for every
  color), T1 (system font stack for the UI, Inter only on the card), L1 (soft
  gray ground, white surfaces).
- **Mobile first.** Check 390×844 in light and dark before anything wider.
- **The privacy claim** is untouched: no copy changes.

## Design

**Tokens.** Rewrite the two blocks with the table above. Pick neutral grays in
the same roles for the rest, for example `--bg-2` a step below ground,
`--surface-2`/`--surface-3` stepping away from surface, `--line` as ink at low
alpha, and shadows in neutral black. Status colors keep their hues and move
only as far as the contrast test needs.

**More contrast.** Add after the dark block:

```css
@media (prefers-contrast: more) {
  :root:not([data-theme="dark"]) { … }
  :root[data-theme="dark"] { … }
}
```

Watch the selectors. A bare `:root` inside the media query has the same
specificity as `[data-theme="dark"]` and comes later in the file, so it would
put the light values onto a dark phone. The two selectors above avoid that.
`test/dead-var.test.js` says `tokens.css` has "no media queries". Its
block-matching regex still works on nested blocks, but its comment has to change.

**Accent.** `--accent: var(--ink)`-equivalent values, written as literals if
`test/dead-var.test.js` or the contrast parser needs them. `--accent-ink` is the
surface. `.btn.primary`'s colored glow (`0 6px 16px -8px var(--accent)`)
becomes a neutral shadow when it is ink.

**Font.** Change `--font` only. `@font-face` stays because the card uses it. In
`app.js`, replace the bare `document.fonts.ready` re-fit with one that waits for
`document.fonts.load('800 16px InterVar')` (falling back to `ready` where
`load` is missing) before `render('cards')`.

**theme-color.** Replace the literals in the five places listed. The test from
item 9 holds them to `tokens.css`.

## Proof

- **`npm test`** — `test/contrast.test.js` (item 6), the theme-color test
  (item 9), the ember/InterVar absence checks (items 2 and 7), and the existing
  card, chart, first-paint, SHELL and dead-var tests, all green.
- **`npm run smoke`** — all rows. `card is 3.45 × 5in` and the budgets are
  unchanged. Item 8 is proven either by a new row on a cold load or by a
  documented extension of the existing cold-load setup.
- **`guard-falsifier`** on the new tests. Each must go red when:
  - one light `--muted` is set to `#8E8E93` (≈3.3:1 on white);
  - the more-contrast block's dark selector is changed to bare `:root`;
  - `--accent` is put back to `#C33F08`;
  - `InterVar` is put back at the front of `--font`;
  - one chart page's (or the template's) `theme-color` is left at `#F6F4F0`;
  - the explicit card-font load is removed from `app.js` (item 8's check).
- **`/browser-verify`** — at 390×844, light and dark, with
  `prefers-contrast: more` emulated. Screenshots of Games, Team, Settings, bench
  mode and the welcome screen. Computed `--bg`/`--ink`/`--accent` read from the
  real page. `getComputedStyle(document.body).fontFamily` does not start with
  InterVar. The card's `font-family` still does, and `document.fonts.check`
  is true for it on a cold load.

## Out of scope

- App icons, `og.png`, the raster sample images (a new issue, decision 2).
- Team color (#25), text size and `rem` (#24), 48px targets (#37), floating
  controls (#33), and any markup or layout change.
- Redesigning the static pages. They only take the new token values.
- Making hairlines or input borders meet 3:1.
