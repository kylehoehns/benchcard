# #231: Welcome, about and advanced pages carry the Hardwood orange

## Issue

#231. The welcome screen, `about.html` and `advanced.html` read as too plain.
The owner wants them to carry the Hardwood orange that new teams start in (#205).

## Goal

A coach who opens Benchcard for the first time, or lands on the About page from
a search, sees the same warm orange the app itself uses: an orange main button,
orange links, and a soft orange glow behind the page's headline. The page
should feel like Benchcard, not like a gray template.

## Decisions (locked by the owner, 2026-09-29)

The owner chose **accent plus a warm hero**. The other options were accent only
and a bold solid-orange hero.

1. **about.html and advanced.html are always Hardwood.** They do not read the
   coach's saved team color. The request named Hardwood, and these are public
   pages a visitor may reach with no saved data.
2. **The welcome screen uses `--tint`,** the app's current tint. A new visitor
   has no saved color, so it is Hardwood (the default since #205). The welcome
   screen shows only when there is no team, so in practice it is Hardwood.
3. **Each page's top section gets a soft orange band** behind the headline and
   main button. It is built from the Hardwood tokens.
4. **One headline phrase is set in orange:**
   - welcome: "The whole game" in "The whole game, worked out before you leave the house."
     This was "the house" until the owner saw the preview; it moved so the
     orange lands on the promise at the start of the line, as on About.
   - about: "Even minutes" in "Even minutes, worked out before the game."
   - advanced: "reference" in "The reference".
5. **The rest of each page keeps its current background.** This adds warmth; it
   is not a repaint.

## What the survey found (tree facts the design depends on)

- `about.html` and `advanced.html` link `tokens.css` and style themselves with
  **`--accent`**: `.btn.primary`, links, `ul li::marker`, focus outlines, and
  the demo plates' `.tl-tot.hi`. In `tokens.css`, `--accent` is Graphite
  (`#1C1C1E` light, `#F4F4F6` dark). The Hardwood block sets only `--tint*`, so
  **adding `data-tint="hardwood"` alone changes nothing** on these pages.
- `about.html` already has a warm-hero hook: `.plate`'s
  `radial-gradient(… color-mix(in srgb, var(--accent) 7%, transparent) …)`.
  Once the accent is Hardwood, that glow turns orange with it.
- The welcome screen (`#view-welcome`, `index.html` ~line 906; styles in
  `app.css` ~line 2025 onward) already uses the tint for its main button and
  its selected demo tab. The headline is `h1.wel-h`, inside `.wel-hero`.

## What would settle it

At **390×844 and 320px wide with 32px text**, in **light and dark**, on the
branch preview:

1. On `about.html` and `advanced.html`, `.btn.primary`'s computed background
   resolves (through a 1×1 canvas, per `/browser-verify` §5) to Hardwood:
   `#D2500A` in light mode and `#FF7A2A` in dark mode. Link color resolves to
   the same value.
2. On each of the three pages, the top band has a computed `background-image`
   that is not `none`, and it sits behind the `h1`. It is a real painted
   background, not a CSS string.
3. On each page, the orange headline phrase's computed color resolves to the
   same Hardwood value, and the rest of the `h1` does not.
4. Contrast: the orange phrase on its band is at least **3:1**, which is WCAG's
   floor for large text (the `h1` is large). Body text on the band is at least
   **4.5:1**. The main button's label on the orange is at least **4.5:1**.
   `--tint-ink` is `#000` light and `#1C1C1E` dark, which is what the welcome
   button already uses.
5. There is no horizontal overflow and no clipped text at 320px/32px. The
   existing smoke sweeps (large text, clip sweep, overflow) must stay green,
   and neither page gains a `CLIP_SWEEP_KNOWN_ISSUES` entry.
6. The Graphite team color still works in the app. Pick Graphite in Settings:
   the app's buttons go black again, and `about.html` stays orange.
7. Screenshots of all three pages, before and after, in light and dark at
   390px, go in the PR.

## Surfaces

- **Change:** `app/about.html`, `app/advanced.html` (their `<style>` blocks,
  plus the `h1` markup for the orange phrase), `app/index.html` (the `h1.wel-h`
  markup), `app/app.css` (the `.wel-hero` band and the phrase style), a new
  smoke module under `scripts/smoke/` with its row in `registry.mjs` and
  `scripts/smoke/README.md`, `app/sw.js` (from `npm run sw:bump`), and
  about.html's "last updated" dateline.
- **Must not change:** `app/tokens.css`'s Graphite base values, or any other
  tint block. The in-app team color is not part of this. The six
  `N-player-basketball-rotation-chart.html` pages are also out.

## Constraints

- **Use the tokens, not new hex literals.** On about and advanced, point the
  page's `--accent*` at the Hardwood `--tint*` values. For example, set
  `data-tint="hardwood"` on `<html>` and map `--accent` to `var(--tint)`,
  `--accent-2` to `--tint-2`, `--accent-soft` to `--tint-soft`, `--accent-line`
  to `--tint-line`, and `--accent-ink` to `--tint-ink`. Do not copy `#D2500A`
  into either page.
- **The selector trap** (`tokens.css`'s own header and the comment above its
  tint blocks): `:root[data-theme="dark"]` and the
  `prefers-color-scheme`/more-contrast blocks outrank a plain `:root` rule. A
  page-level remap must win in dark mode and more-contrast too. Prove it in
  dark mode in a browser; a CSS grep does not count (`/browser-verify` §4).
- **The welcome band uses `--tint*`,** so a saved non-Hardwood color stays
  honest on it.
- **`npm run sw:bump`**, since precached files change.
- **The about-date check:** changing `about.html` needs its "last updated"
  dateline moved to the commit date (`scripts/check-about-date.mjs`).
- **Byte budget:** if a payload or size ceiling trips, widen it and move on.
- **Mobile first:** 390px first, then 320px/32px. Long headlines wrap; the
  orange phrase is an inline `<span>` that wraps with its line, with no
  `nowrap`.
- **Crawlable page:** about.html is the one crawled document. The phrase is
  plain text in a `<span>`, so the `h1`'s text content is unchanged.

## Design

- **about / advanced:** put `data-tint="hardwood"` on `<html>` plus a page-level
  remap of `--accent*` to `--tint*`, written with enough specificity to beat the
  dark and more-contrast blocks. Add a top band: a full-bleed block behind the
  hero (about: the section holding the `h1`, lead and buttons; advanced: the
  `h1` block). Its background is
  `radial-gradient(… var(--tint-soft) …)` or a soft linear wash from
  `--tint-soft` to transparent. The hero keeps its own gutter inside the band.
  Add `<span class="hl">` around the phrase, colored `var(--tint)`.
- **welcome:** give `.wel-hero` the same soft band (or the welcome page's top
  area, if `.wel-hero`'s box is the wrong shape; the developer measures), plus
  the `h1` span with the same class idea in `app.css`.

## Proof

- **A new smoke check** (for example `hardwood-pages.mjs`, row name
  "welcome, about and advanced carry the Hardwood orange") loads `about.html`,
  `advanced.html` and the welcome screen (first-run, wiped record) at 390×844
  in light and dark, and asserts items 1–3. It resolves colors through a canvas
  and requires the elements to exist (rule 2a: a missing `.hl` or band fails,
  it is not skipped). It covers items 1, 2 and 3.
- **Contrast (item 4):** computed in the same check from the resolved colors,
  or in a `node --test` unit over those token values, whichever the developer
  can make fail first.
- **Items 5 and 6:** the existing sweeps, plus one assertion in the new check
  that with a Graphite record the app's `--tint` is Graphite while `about.html`
  is still Hardwood.
- **Item 7:** `/browser-verify` screenshots, by the orchestrator, on the
  preview.

## Out of scope

- The six chart pages (`N-player-basketball-rotation-chart.html`).
- Changing any team color's values, or the in-app screens beyond the welcome.
- A solid-orange hero (the rejected "bold" option).
