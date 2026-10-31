# 423 — SEO: visible copy and links that match what people search

## Issue

#423: make each page's visible text use the words its title targets, link
the six chart pages from home and Advanced, give home a WebSite entity, use
the app's sample cast on the chart pages, and fix a wrong maintainer comment.

## Goal

A coach who searches "basketball rotation planner", "substitution chart" or
"equal playing time" lands on a page that says those words where a reader can
see them. A coach on the welcome screen can reach a chart for their roster
size in one tap. A coach who taps "Try it with 8 sample players" on a chart
page sees the same kids the chart printed.

## What would settle it

1. **Welcome line.** On a fresh device (Coach seam), `.wel-hero`'s text
   contains the exact sentence
   `A basketball rotation and substitution planner for equal playing time.`
   It sits directly under the `h1.wel-h`, one sentence, muted body-step text.
2. **Home links the six charts.** `index.html` (source, comments and
   `<noscript>` cut, as `test/link-graph.test.js` already does) carries an
   `href="./<n>-player-basketball-rotation-chart"` for each of 7, 8, 9, 10,
   11, 12, inside a `nav` labelled `Rotation charts by team size` in the
   welcome tail (`.wel-tail`). On a fresh device the six links are visible
   (Coach seam: the nav's text shows `7`, `8`, `9`, `10`, `11`, `12`).
3. **Advanced links the six charts.** `advanced.html` carries the same six
   hrefs, in a section headed `A chart for your roster size` before the
   footer, styled as About's `.sizes` chips.
4. **Visible text carries the title's target words** (source with `<head>`,
   `<script>`, `<style>` and comments cut, whitespace flattened,
   case-insensitive):
   - `index.html`: `basketball`, `rotation`, `substitution`, `planner`.
   - `about.html`: `equal playing time`, `youth basketball`, `substitution`.
   - each chart page: `<n>-player basketball rotation chart`,
     `substitution`, `printable`, `equal playing time`.
   - `advanced.html`: `setting`, `rule`, `card`.
5. **Chart copy.** Each chart page's lede (or caption) uses `substitution`,
   `printable` and `equal playing time`, and still hedges: the minutes are
   "as close to equal playing time as the arithmetic allows", never a flat
   claim of equal minutes.
6. **About.** The H1 stays `Even minutes, worked out before the game.` (see
   Decisions). The first paragraph (`p.lede`) contains `substitution`,
   `equal playing time` and `youth basketball`. Exact new lede:
   `Benchcard is a free substitution planner for youth basketball, built
   around equal playing time. Give it your roster and say how the minutes
   should be split, and it works out who is on the floor for every stint,
   then prints it on a card that fits in your pocket.`
7. **About's description** is exactly
   `Equal playing time, and how to plan a youth basketball substitution rotation: even minutes, the rules a coach needs, and how to read the printed card.`
   (150 characters; ≤ 160; `youth basketball` once). og:description and
   twitter:description follow if they carry the same sentence.
8. **Home WebSite entity.** `index.html`'s JSON-LD has a node with
   `@type` `WebSite`, `name` `Benchcard`, `url` `https://benchcard.app/`,
   and still has the `SoftwareApplication` node unchanged.
9. **Sample cast on chart pages.** For every size n, `planFor(n)`'s player
   names are exactly `sampleRoster(n).map(p => p.name)` from `app/roster.js`
   (the first n of the "Try" cast: Maya Webb, Eli Tran, …). Every short name
   the cards print has a measured width in `WIDTH_AT_100`, and every card's
   widest row still fits (existing `test/charts.test.js` checks).
10. **Comment.** `scripts/charts.mjs`'s header and `test/charts.test.js`'s
    placeholder test comment say `grep -l 'data-draft="1"' app/*.html`.
11. **Look.** Welcome at 320 and 390 wide, 16 and 32px text, full height and
    scrolled to the bottom: the new line and the chart row are not clipped,
    and the two doors are still above the fold at 390×844 at 16px. About,
    Advanced and one chart page at the same cells: nothing clipped.

## Decisions the issue left open

- **About: first paragraph, not the H1.** The H1 "Even minutes, worked out
  before the game." is also the headline baked into `og.png` (scripts/og.mjs)
  and quoted in every page's og:image:alt. Changing it would split the brand
  line from the share image. The issue allows "H1 or first paragraph"; the
  first paragraph carries the words.
- **Home's chart links are digits** (`7` … `12`) after a short label, so the
  row stays one or two lines at 320px and does not crowd the welcome screen.
  The nav's accessible name says what they are.
- **"equal playing time"** rather than "even playing time" in the welcome
  line: it is the phrase About's title targets and the one people search.
- **Chart names: full sample names.** The plan is built from
  `sampleRoster(n)` itself, so `deriveShortNames` prints the same short names
  the app's own `?try=n` team gets (MAYA, ELI, DEVO, …).
- **"substitution" was a retired word.** `test/one-name.test.js` bans every
  CONTEXT.md `_Avoid_` word from body copy, and "substitution" is retired for
  Break and Change. The ticket asks for the word on screen. Choice: the two
  product phrases, "substitution planner" and "substitution chart", are cut
  before that scan, and CONTEXT.md says so under Change. Any other
  "substitution" in body copy still fails.
- **#331 / #337 removed a line under the welcome headline** because of its
  wording. This ticket asks for a line with a different job (saying what the
  app is in searched words), so one comes back. The first-run scenario that
  pinned "no line between" is renamed to say what it checks.

## Surfaces

- `app/index.html` — welcome line, chart nav in `.wel-tail`, WebSite JSON-LD.
- `app/app.css` — styles for the welcome line and chart row (reuse the
  `.wel-tail-row` treatment; the short-viewport `@media (max-height: 700px)`
  block gives ground for the new line).
- `app/about.html` — lede, meta description (and og/twitter descriptions if
  they repeat it), "last updated" dateline.
- `app/advanced.html` — chart section and its `.sizes` rule.
- `scripts/charts.mjs` — COPY lede/caption, sample cast from `sampleRoster`,
  `WIDTH_AT_100` re-measured, header comment; then regenerate the six pages
  with `node scripts/charts.mjs`.
- `app/sitemap.xml` — `<lastmod>` for every changed page (`npm run
  check:history` enforces it).
- Tests: `test/link-graph.test.js`, `test/seo.test.js`, `test/charts.test.js`,
  `test/first-run-scenarios.test.js`, `test/one-name.test.js`.
- `CONTEXT.md` — the Change entry names the product-phrase exception.
- Must not change: `engine.js`, `budget.js`, `storage.js`, `roster.js`
  behavior; the six chart pages by hand; `app/sw.js`.

## Constraints

- **Reuse `sampleRoster` from `app/roster.js`; do not copy the cast into
  charts.mjs.** One cast, one place.
- **The six chart pages are generated.** Edit `scripts/charts.mjs` and run it;
  `guard-edit.sh` denies hand edits and `node scripts/charts.mjs --check`
  (in `test/charts.test.js`) fails a stale page.
- **`WIDTH_AT_100` is measured, never estimated:** card.js's own `widthAt`
  at 100px, InterVar weight 800, in Chrome, on exactly the short names the
  new cast prints.
- **The privacy claim stays narrow** (`test/analytics.test.js`).
- **American spelling.** **48px touch targets** on every new link (smoke).
- **`class="wel-about"` stays an exact attribute** on the How it works link;
  link-graph's welcome test matches it literally.
- **Hrefs are extensionless** (`./7-player-basketball-rotation-chart`).
- Mobile first: check 390×844 first.

## Proof

- **Coach seam** (`test/first-run-scenarios.test.js`, `test/coach.js`):
  items 1 and 2's visible half.
- **Source-reading guards** (named here, so they are seams, built under
  `/new-guard`'s rules — each must be seen failing against the old tree):
  - `test/link-graph.test.js`: items 2 and 3 (home and Advanced link each of
    the six).
  - `test/seo.test.js`: items 4, 6, 7, 8.
  - `test/charts.test.js`: items 5 and 9 (via `planFor` and the rendered
    pages).
- **Smoke** (`npm run smoke`): overflow, touch targets, large text on welcome,
  About, Advanced and the chart pages.
- **Look check** (`scripts/look.mjs`) and `/browser-verify`: item 11.

## Out of scope

- Changing the About H1 or `og.png`.
- A WebSite entity on About (not asked).
- Any change to the chart pages' format, card or sizes.
