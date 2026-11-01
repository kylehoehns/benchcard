# Chart pages: Try first, chart above the fold, Print, Hardwood, count arrivals

## Issue

#433 — make the chart pages lead a search visitor to "Try it with N sample
players", show the chart on the first screen of a small phone, add a Print
button, wear the app's Hardwood tint, and count how many arrivals came from a
chart page's Try button.

## Goal

A coach who lands on a chart page from a search sees the chart they searched
for without scrolling, one tap from a finished plan built with their roster
size ("Try it"), one tap from printing it, in the same orange as About and
Advanced. And the owner can finally tell how many first runs began on a chart
page.

## What the survey found (choices made where the issue did not decide)

- **There is no "Open the app" in the hero.** The hero (h1 to trust line)
  holds three buttons: "Build one for your roster" (`./`), "Try it with N
  sample players" (`./?try=N`) and "How it works" (`./about`). The header has
  "Open the app" (`./`) and the footer has "Open the app" and "How it works".
  Closest to the intent (no hero link that duplicates the page's chrome, and
  fewer buttons above the chart): the hero keeps the two buttons the issue
  names and **drops "How it works"**, which stays in the footer. The header's
  "Open the app" stays.
- **There is no deep link to setup.** `./` opens the welcome screen for a
  visitor with no team; the app has no URL that opens the setup flow. Adding
  one means new routing in `app/onboarding.js`, which the issue does not ask
  for. So the issue's other option: **"Build one for your roster" becomes the
  secondary button** and still goes to `./`.
- **`welcome_seen` already fires on a `?try=` arrival.** `initOnboarding`
  fires it whenever there is no saved team, before it reads `?try=`. So the
  field goes on `welcome_seen` (the issue's first choice): `from: 'try'` when
  the URL carried `?try=`, else `'direct'`. Only the chart pages link to
  `?try=` (checked: no other page in `app/` does), so `try` counts chart-page
  Try taps. A chart page's "Build one" tap is `direct`, the same as any other
  visit to `./`; telling them apart would need a second parameter, which the
  issue does not ask for.
- **The "rule in the guidelines"** that names About and Advanced as always
  Hardwood is the bullet "Public pages always carry Hardwood orange" in
  `docs/design-decisions.md`. `docs/interface-guidelines.md` has no such rule.
  That bullet gets the chart pages.
- **Hardwood text contrast.** The chart pages paint links with
  `var(--accent)`. Under Hardwood that is orange small text at 3.9:1 in light
  (#332). About and Advanced fixed this with `--accent-text`; the chart pages
  take the same mapping, and `test/contrast.test.js`'s #332 checks extend to
  them.
- **Shortening the lede alone does not bring the chart up.** Measured in
  Chrome at 320 × 568, 16px, on the 6-player page: today the first stint's
  bottom is at 926px. With a one-sentence lede, the "How it works" button gone
  and Try/Build one still above the chart, it is at 757px (the halves page
  837px): two 48px button rows and the trust line sit in the way. So the
  issue's other option is taken too: **the chart moves above the button
  row.** The button row follows the card and its caption, which is where a
  visitor who has just read the chart decides to try it or print it. A
  prototype of exactly this design measured the first stint's bottom at
  557px on the 6-player page and 525px on the halves page (320 × 568, 16px),
  so there is only about 11px to spare: add nothing above the card.
- **Print with no page script.** The pages carry no script but the theme one
  (`test/charts.test.js` pins that). The button is a `<button type="button"
  onclick="print()">`, an attribute rather than a `<script>`, and a
  `<noscript><style>` hides it when JavaScript is off, the same way
  `index.html` hides `.app`. With scripts off, a dead button would be worse
  than none.

## What would settle it

1. **Order and buttons.** The page reads, top to bottom: header (mark and
   "Open the app", unchanged), h1, lede, the figure (card and caption), then
   the button row `.cta`, then the trust line, then the sibling-chart
   sections and the footer. The `.cta` holds, in this order: `<a class="btn
   primary" href="./?try=N">Try it with N sample players</a>`, `<a
   class="btn" href="./">Build one for your roster</a>`, and the Print button
   (item 4). No "How it works" button there; the footer keeps its link. On
   the halves page N is 10.
2. **Lede.** One sentence per page, keeping the words `substitution`,
   `printable` and the hedge `as close to equal playing time as the
   arithmetic allows`, and the minutes from `facts(plan)`:
   - size page: `A printable substitution chart for N players over four
     8-minute quarters, subbing every 4 minutes: <minutes>, as close to equal
     playing time as the arithmetic allows.`
   - halves page: `A printable substitution chart for 10 players over two
     20-minute halves, subbing every 4 minutes: <minutes>, as close to equal
     playing time as the arithmetic allows.`
3. **Above the fold.** At 320 × 568, 16px root text, light theme, on every
   chart page (all eight): the bottom of the card's first `.stint` is at or
   above 568px with the page scrolled to the top. Measured in Chrome.
4. **Print.** `<button type="button" class="btn" onclick="print()">Print
   this chart</button>`, the last button in `.cta`, 48px tall. Under print
   media only the card is laid out: every element outside `.card` (and not
   an ancestor of it) is `display: none` or has no box. The card prints at
   3.45 × 5in (card.css's own print rules; nothing new is added for print).
   With JavaScript off the button is not shown (a `<noscript><style>` in the
   head hides it).
5. **Hardwood.** `<html lang="en" data-tint="hardwood">` on all eight, with
   the same `--accent*` → `--tint*` mapping and the three #332
   `--accent-text` arms that About and Advanced carry; links paint
   `var(--accent-text)`. `test/contrast.test.js`'s two #332 tests run on all
   eight chart pages (the `.hl` requirement applies only to pages that have a
   headline phrase; the chart pages have none).
6. **Analytics.** `EVENTS.welcome_seen` is `{ from: ['direct', 'try'] }`.
   A test pins it: the field list is exactly `['from']`, the literals are
   exactly those two, `payload('welcome_seen', { from: 'try' })` keeps it,
   and any other value (`'chart'`, a URL, a number) is dropped.
   `initOnboarding` sends `from: 'try'` when the landing URL had `?try=` and
   `'direct'` otherwise, and the Coach scenario shows it (Proof).
7. **Docs.** The `design-decisions.md` Hardwood bullet names the chart pages;
   `docs/operations.md` says what `welcome_seen{from}` counts.
8. **Look.** Every chart page at 320 and 390 wide, 16 and 32px root text,
   light and dark, top of page and full height: no sideways overflow, no new
   clipped or cut text (#179 probe), no cramped wrapping of the button row.

## Surfaces

Change: `scripts/charts.mjs` and the eight generated pages (regenerated with
`node scripts/charts.mjs`, never hand edited), `app/analytics.js` (the
allowlist entry and its comment), `app/onboarding.js` (the one `track` call),
`test/charts.test.js`, `test/analytics.test.js`, `test/contrast.test.js`, a
Coach scenario and, if needed, a `test/coach.js` reader for sent events,
`docs/design-decisions.md`, `docs/operations.md`, `app/sitemap.xml` lastmods
only if `check:history` asks.

Must not change: `app/engine.js`, `app/state.js` (another lane), `app/card.css`
(its print rules are used as they are), `app/sw.js`, `app/about.html`,
`app/advanced.html`. No shared public stylesheet (that is #434).

## Constraints

- Generated pages change only through `node scripts/charts.mjs`;
  `charts.mjs --check` and `test/charts.test.js` must pass.
- Exactly one inline `<script>` (the theme one) per chart page stays true.
- The lede keeps its hedge, never a flat "equal minutes".
- The privacy line (trust line) is unchanged.
- 48px touch targets on every button.
- The Hardwood block is copied from about/advanced into the generator's
  `<style>` for now. **#434 moves all three into one shared stylesheet**, so
  this is a known, short-lived third copy, not a new pattern.
- `analytics.js`: a string field is a closed list of literals. Nothing that
  carries the page address or the roster size.
- American spelling.

## Design

`renderPage` in `scripts/charts.mjs`: `data-tint="hardwood"` on `<html>`, the
Hardwood/accent-text block in the page `<style>`, `a` paints
`var(--accent-text)`; the figure moves up to sit right after the lede; the
`.cta` row (Try primary, Build one, Print) and the trust line follow it; the
"How it works" hero button goes; the size and halves `lede` builders become
the one-sentence forms above; a `<noscript><style>` in the head hides the
Print button. `onboarding.js`
reads `?try=` once and passes `from` to `track('welcome_seen', …)`.

## Proof

- `node --test test/charts.test.js` (generator and page source, existing
  guards extended under `/new-guard`): items 1, 2, 4 (markup and noscript), 5
  (attribute).
- `node --test test/contrast.test.js`: item 5 (contrast in four states).
- `node --test test/analytics.test.js`: item 6 (allowlist pin).
- Coach seam, `test/first-run-scenarios.test.js` (or the file holding the
  `?try=` scenarios): a fresh device opening `/` sends `welcome_seen` with
  `from: 'direct'`; a fresh device opening `/?try=7` sends it with
  `from: 'try'`. Read through a `sendBeacon` spy the driver installs.
- `/browser-verify` with a probe in Chrome: item 3 (fold at 320 × 568) and
  item 4 (print media leaves only the card; `Page.printToPDF` page size).
- Look probe at 320/390 × 16/32 × light/dark, top and full height: item 8.
- Smoke `static` row covers the eight pages for overflow and touch targets.

## Out of scope

- A setup deep link (`./?setup` or similar) for "Build one for your roster".
- Telling a chart page's "Build one" arrival apart from any other direct visit.
- The shared public stylesheet (#434).
