# 279: SEO pass — each page owns its own search phrase

## Issue

#279: a coach who searches for something like "youth basketball rotation planner" should find Benchcard.

## Goal

A coach searching for a rotation planner, a printable chart for their roster size, or how to give every kid equal playing time lands on the Benchcard page that answers that search, not on a page that only half answers it.

## Where we stand (Search Console, 2026-10-02)

- All 9 sitemap pages are indexed. The 5 "not indexed" URLs are `.html`/`http://` redirects and one alternate with a correct canonical, which is expected.
- `sitemap.xml` reads Success, 9 pages discovered, last read 2026-10-02.
- 90 days (data from about 2026-08-22): **67 impressions, 6 clicks, average position 20.5.**
- Queries seen include "basketball rotation planner", "basketball substitution planner" and "basketball substitution generator", at 1 or 2 impressions each.
- The 8-, 11- and 12-player charts get 42 impressions between them at positions 25 to 37, with 0 clicks. About averages position 10.5 and home 19.4.

Nothing is broken or unindexed. The problem is weak ranking on low-volume phrases.

## What would settle it

1. **Phrase ownership.** One page per intent:

   | Page | Owns |
   | --- | --- |
   | `/` | basketball rotation planner, basketball substitution planner/generator |
   | `/N-player-basketball-rotation-chart` | N-player basketball rotation chart (unchanged) |
   | `/about` | equal playing time in youth basketball; how to plan basketball substitutions |
   | `/advanced` | nothing (reference) |

2. **Home title** is `Basketball rotation & substitution planner | Benchcard`, which is 54 characters. The text is escaped as `&amp;` in the markup. `og:title` and `twitter:title` match it. The description keeps its opening, "Free youth basketball rotation planner". `apple-mobile-web-app-title` stays `Benchcard`. `render.js`'s `HOME_TITLE` reads `document.title`, so the today view shows the new title with no code change.
3. **About title** is `Equal playing time in youth basketball | Benchcard`, which is 50 characters. Its description leads with equal playing time and keeps "how to plan a youth basketball substitution rotation". `og:title` and `twitter:title` match. The visible h1 ("Even minutes, worked out before the game.") stays.
4. **Structured data:**
   - Each chart page gets a JSON-LD block. Its `WebPage` names the page and is `isPartOf` the site, and its `BreadcrumbList` reads Benchcard › About › N-player chart. It is emitted by `scripts/charts.mjs`, so `--check` keeps all six in sync.
   - `advanced.html` gets a `WebPage` with the same breadcrumb shape (Benchcard › Reference).
   - Every JSON-LD block on every shipped page parses as JSON, and every URL in it is an extensionless `https://benchcard.app/...` URL that the sitemap lists.
5. **Accurate `lastmod`:**
   - Every `<lastmod>` in `sitemap.xml` is updated to the date its page last really changed. This is the last commit touching the page's HTML file, or for a chart page, its file or `scripts/charts.mjs` copy.
   - A new history check, `scripts/check-sitemap-lastmod.mjs`, fails when a branch changes a sitemap page's HTML but not that page's `<lastmod>`. It is wired into `npm run check:history` and the CI history job, like `check-about-date.mjs`.
6. **Baseline recorded.** `docs/operations.md` gets a short "Search" section that holds:
   - the numbers under "Where we stand";
   - the date they were read;
   - a reminder to compare in about 8 weeks (around 2026-11-27).

   Ranking itself is not a CI fact.

## Surfaces

- **Change:**
  - `app/index.html` and `app/about.html` (head only);
  - `app/advanced.html` (head only);
  - `scripts/charts.mjs` and the six generated chart pages;
  - `app/sitemap.xml`;
  - the new `scripts/check-sitemap-lastmod.mjs` and its unit test;
  - `package.json` (`check:history`);
  - `.github/workflows/test.yml` (the history job);
  - `test/charts.test.js` or a new `test/seo.test.js`;
  - `docs/operations.md`;
  - `app/sw.js` through `npm run sw:bump`.
- **Must not change:**
  - any visible copy or layout;
  - `app/vendor/`;
  - the noscript h1 (Googlebot runs JS; `docs/operations.md` says so);
  - `robots.txt`;
  - canonical URLs.

## Constraints

- **Chart pages are generated.** Edit `scripts/charts.mjs` and run it; never hand-edit the six pages.
- **Escape the `&`.** `&` in a `<title>` and in attribute values is written `&amp;`.
- **Copy the existing history-check pattern.** The lastmod check reuses `check-about-date.mjs`'s shape:
  - a pure decision function, unit-tested with no git;
  - a CLI that exits 0 when the base ref cannot be read.

  Do not invent a second pattern.
- **Clean the about meta tags.** About's `og:description`/`twitter:description` mention "eleven kids". Leave that copy alone unless it contradicts the new title.
- **Precached HTML changes,** so run `npm run sw:bump` after the last change.
- **Privacy.** No analytics, no Search Console tag in the page. The domain is already verified by DNS TXT.

## Design

- Head-only edits on index, about and advanced.
- `charts.mjs` gains one JSON-LD template, built from the same `n`, title and URL it already computes.
- The sitemap's dates are set by hand once from `git log -1 --format=%cs -- <file>`. After that the history check keeps them honest.

## Proof

- **`node --test`** (`test/seo.test.js`, or extending `test/charts.test.js`) covers items 2 to 4:
  - It reads each page's head: the exact titles, matching og/twitter titles, and the description openings.
  - It parses every `application/ld+json` block on every shipped page, and checks types, breadcrumb positions and URLs against the sitemap.

  This is a source-reading test, and it is the seam on purpose: a crawler reads source.
- **`charts.mjs --check`** (already in the suite) keeps the six generated pages equal to the template.
- **`test/sitemap-lastmod.test.js`** unit-tests the pure decision for item 5. It must cover:
  - changed page with the same lastmod → fail;
  - changed page with a new lastmod → pass;
  - an unchanged page → pass;
  - an unreadable base → pass.
- **`npm run check:history`** runs the new script against `origin/main`.
- **Preview check.** On the PR preview, read `document.title` and the JSON-LD on `/`, `/about` and one chart page. If Google's Rich Results Test is reachable, run it on one chart page and note the result. Don't block on it.

## Out of scope

- New pages (age groups, game formats). Revisit once Search Console shows real query volume.
- Moving the noscript h1.
- Any visible copy, layout or link change.
- Requesting indexing or changing anything inside Search Console.
