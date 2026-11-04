# #611 — Today clips in WebKit at 32px: the large-text breakpoints miss iOS

## Issue

#611. `look.mjs --engine webkit --view today` at 32px text found the team name,
the game title and "Planned" cut off on Today (at 320 wide, "S…" and "Ha…"),
while Chrome showed the same state cleanly. Is that a real iPhone bug or a
side effect of how the WebKit run fakes large text?

## Lane

Full lane by size (a new `app/` module and two callers), reviewed light by the
orchestrator's instruction for this batch: this spec, a test-first build,
`quality-reviewer` and `doc-writer`. No refactorer pass, no reuse or
efficiency reviewer.

## What the survey found

There is no iOS Simulator and no iPhone on this machine, so the answer comes
from how the two engines and iOS size text, measured here and cited.

1. **The clipping is not WebKit's.** The same fake in Chrome clips the same
   way. Run through Playwright's Chromium with the WebKit adapter
   (`scripts/webkit/cdp.mjs`, `:root { font-size: 32px !important }`), Today
   at 320/32 has the same 8 unexcused findings as WebKit (`clip
   span#teamBtnLabel`, `clip span.pass-title` twice, `clip
   span.pass-status.ok`, …) and 390/32 the same 4. Screenshots:
   `notes/mockups/look/611/before-webkit-320-32.png`,
   `before-chrome-same-fake-320-32.png`, and Chrome's own
   `Page.setFontSizes` run, which is clean, `chrome-default-size-320-32.png`.
2. **Why the two fakes differ.** Every large-text layout in `app.css` sits
   behind an `em` media query: `(max-width: 19em)`, `(max-width: 18em)`,
   `(max-width: 14em)`, `(max-height: 40em)`, `(max-height: 43.75em)`,
   `(orientation: landscape) and (max-height: 35em)`. An `em` in a media query
   is based on the initial font size, the browser's default, never on the
   root element's style (Media Queries 4, § 1.3 "Units": "Relative length
   units in media queries are based on the initial value",
   https://www.w3.org/TR/mediaqueries-4/#units). Measured in both engines
   here, with `:root { font-size: 32px }` at 320 wide:
   `matchMedia('(max-width: 19em)').matches` is `false` in WebKit **and**
   Chromium, `(max-width: 608px)` is `true`, and `font-size: medium` is
   `16px`. Chrome's `Page.setFontSizes` changes the default, so the queries
   fire there; the WebKit adapter changes only the root, so they do not.
3. **iOS is the WebKit fake's shape, not Chrome's.** On an iPhone, Larger
   Text (Dynamic Type) does not change the browser's default font size for a
   page. It reaches a page only through the system text styles,
   `font: -apple-system-body` and its siblings (WebKit, "Using the System
   Font in Web Content", https://webkit.org/blog/3709/using-the-system-font-in-web-content/,
   which ties Dynamic Type to those text styles only). The app uses exactly
   that hook: `app.css` sets `html { font: -apple-system-body; }` inside
   `@supports (-webkit-touch-callout: none)` (#24, `docs/specs/24-text-size.md`
   decision 1). So on an iPhone with text turned up, the root grows (Apple's
   body style is 17pt at the default size and 33pt at the second
   accessibility size, Human Interface Guidelines, Typography,
   https://developer.apple.com/design/human-interface-guidelines/typography#Specifications),
   every `rem` grows with it, and every `em` media query stays at 16px.
   That is precisely what the WebKit adapter fakes.

**So it is real.** A coach on an iPhone with Larger Text turned up gets none of
the large-text layouts: on Today the heading and the game titles stay at their
big sizes and are cut off, exactly as the WebKit shots show. The same holds
for every other screen behind those queries; Today is where the issue saw it.
The WebKit fake stays as it is: it is the faithful one.

## Goal

When a coach turns text up on an iPhone, the app switches to its large-text
layouts the way it already does in Chrome and Android, so Today shows a long
team name and long opponent names without cutting them off.

## What would settle it

1. `node scripts/look.mjs --engine webkit --view today --widths 320,390 --font 32`
   reports **0 unexcused findings** in every shot (top and bottom), and the
   reason is that the large-text rules now apply, not a new excuse:
   `knownIssueFor`, `APP_LARGE_TEXT_ALLOW` and `LARGE_TEXT_ALLOW` are not
   changed.
2. In WebKit (and Chromium through the same adapter) with the root at 32px and
   the default at 16px, at 320 wide, the app's `(max-width: 19em)` rules apply:
   `.today-h1` computes to `--fs-headline` (34px at a 32px root) and
   `.pass-title` wraps (`white-space: normal`).
3. A new WebKit row, **`today at large text`**, in `scripts/webkit/checks.mjs`:
   Today at 320×844 and 390×844 with the 32px fake, a team named
   **"Riverside Thunder Travel"** and opponents **"Westfield Wildcats Blue"**
   and **"Northgate Hornets Gold"** (several short words, so they may wrap but
   must not clip), scrolled top and bottom. It fails on any unexcused
   `CLIP_PROBE` finding, and fails if it found no `.pass-title` to measure.
   Its verdict is a pure function in `verdicts.mjs`, tested in
   `test/webkit.test.js`.
4. **Nothing changes where text is not turned up.** Chrome under
   `Page.setFontSizes` (root equals default): no media rule is rewritten.
   iOS at the default text size (root 17px from `-apple-system-body`): no
   media rule is rewritten either. Smoke stays green with no allow-map change.
5. The two `em` media queries read from JavaScript — `trap.js`'s
   `(max-height: 40em)` and `toast.js`'s `GM_LANDSCAPE` — scale the same way as
   the stylesheet rules.

## Surfaces

- New `app/text-size.js`: the scaling. Joins the boot graph on purpose:
  re-pin `REQUESTS_BASELINE` in `scripts/budgets.mjs` by one, saying which
  module and why, and add it to `sw.js`'s `PRECACHE`.
- `app/app.js` (call it at boot), `app/trap.js`, `app/toast.js` (their
  `matchMedia` strings).
- `scripts/webkit/checks.mjs`, `scripts/webkit/verdicts.mjs`,
  `test/webkit.test.js`, and the table of rows wherever `docs/` names them.
- `scripts/whats-new.json`, `app/whats-new.html`, `app/sitemap.xml`
  (coach note).
- Must not change: `app.css`'s media queries themselves, the four pure
  modules, `state.js`, `live.js`, `scripts/webkit/cdp.mjs`'s fake.

## Constraints

- Mobile first, at 320 and 390. Clipping is a blocker.
- Do not raise an allow map or add a `knownIssueFor` excuse (AGENTS.md
  § Layout).
- `docs/specs/24-text-size.md` decision 1 stays: exactly one
  `-apple-system-body` rule in `app.css`, gated as it is.
- Reuse `CLIP_PROBE`, `findingsOf`/`knownIssueFor`, `land`, `SCROLL_TO_BOTTOM`
  and the WebKit check shape (`onPage`, `rowOf`); do not write a second probe.
- Cross-origin or unreadable stylesheets are skipped, never thrown on.

## Design

`app/text-size.js` exports:

- `scaleEm(mediaText, factor, basePx)` — pure: every `<n>em` in a media
  condition becomes `<n × basePx × factor>px`. Other units untouched.
- The factor (internal, not exported: `test/dead-export.test.js` fails an
  export nobody outside the file reads): the root's computed font size over
  its base. The base is **17px on iOS/iPadOS** (where the root comes from
  `-apple-system-body`; gate `CSS.supports('-webkit-touch-callout', 'none')`,
  the same gate as `app.css`) and **the browser default** elsewhere (measured:
  an element at `font-size: medium`). So the factor is 1 at the default iPhone
  size and wherever no author rule sets the root, and nothing is rewritten.
  When it is not 1, `<n>em` becomes `n x base x factor`, which is `n` times
  the root's px: the same thing `19em` means in Chrome at a 32px default
  (608px). Decided in the build: on an iPhone this jumps from 304px to 323px
  the moment text goes one notch above the default, which only matters on a
  320px-wide screen, and keeps "19 lines of the coach's own text" exact.
- `scaleBreakpoints()` — walks every readable stylesheet's rules, recursing
  into grouping rules (`@supports`, nested `@media`), and sets each
  `CSSMediaRule`'s `media.mediaText` from its **original** text (kept in a
  `WeakMap`), so calling it twice, or after the factor returns to 1, is
  exact. Measured here: setting `media.mediaText` re-evaluates the rule in
  both WebKit and Chromium. Called once at boot before the first render, and
  again when the page becomes visible (a coach who changed Larger Text in
  Settings and came back).
- `mq(query)` — `scaleEm(query, …)` for a `matchMedia` string.

## Proof

- `node --test` on `scaleEm` (pure, many cases: integer, decimal, several
  `em` in one condition, `rem` and `px` left alone, factor 1 identity).
- The `today at large text` WebKit row (item 3), run with `node
  scripts/webkit.mjs`; its verdict under `node --test`.
- `look.mjs --engine webkit` (item 1) and the same through Chromium, pictures
  in `notes/mockups/look/611/after-*.png`.
- `npm run smoke` green with no allow-map change (item 4).

## Out of scope

- The static pages (`about`, `advanced`, the chart pages) do not use
  `-apple-system-body`, so on an iPhone they do not follow Larger Text at all
  and their `em` queries are consistent with their root. The WebKit fake's
  findings on them, if any, are a fake artifact; not touched here.
- Changing the WebKit fake. It already matches iOS.
