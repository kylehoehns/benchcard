# 24 — Text follows the phone's text size

## Issue

#24 (parent #18): the app's text follows the text size set on the coach's
iPhone or Android phone, the screens hold together at twice the normal size,
and the printed card keeps its fixed sizes.

## Goal

A coach who has turned their phone's text size up opens Benchcard and can read
it in the gym: names, minutes and buttons are as big as everything else on
their phone, and nothing slides off the side of the screen. The card they print
is the same card as before, to the pixel.

## Survey (2026-09-15)

What the tree looks like today, checked against the ticket. Every claim in the
ticket held up; nothing went to the human.

- **Only `index.html` loads `app.css`.** `about.html`, `advanced.html` and the
  six chart pages link `tokens.css` (and the charts `card.css`) and carry their
  own `<style>` blocks. #18 puts the static pages out of scope, so this ticket
  touches `app.css`, `tokens.css`'s new type tokens, and `index.html` only.
- **The root is already free.** Nothing sets a `font-size` on `html` or
  `:root`; `test/big-text.test.js` ("nothing pins the root font size") pins
  that. But `body` is `font-size: 15px` (`app.css` line ~15), so everything
  that inherits ignores the reader.
- **There is no type scale.** `app.css` has 176 `font-size` declarations over
  about 55 distinct values, from `.58rem` to `clamp(1.55rem, 5.4vw, 2.1rem)`,
  plus `15px`, `1.2em` and `.72em`. Roughly 70 are below footnote
  (`.8125rem`): uppercase eyebrow labels, timeline period labels, jersey
  numbers in discs, table headers, the welcome screen's sample rotation, bench
  mode's key hints.
- **Weights are variable.** 20 distinct `font-weight` values in `app.css`
  (470, 520, 540, 550, 560, 570, 580, 610, 620, 640, 650, 660, 670, 680, 690,
  740, 750 as well as 500, 600, 700). `h1,h2,h3,h4` default to 650.
- **`index.html` has inline type:** the noscript `<h1>` (`font-size:1.35rem`)
  and Today's `<h1>` (`font-size:clamp(1.6rem,3.4vw,2.05rem)`).
- **No `text-scale` meta, no `-apple-system-body`** anywhere in `app/`.
- **`-apple-system-body` on a Mac is 13px.** Measured in Playwright's WebKit
  on this machine (macOS, Safari 26.5 user agent): `font: -apple-system-body`
  computes to `13px`, family `UICTFontTextStyleBody`, and
  `CSS.supports('-webkit-touch-callout', 'none')` is `false`. Applied to every
  WebKit, the whole app would shrink to 81% on a Mac. `-webkit-touch-callout`
  is supported by iOS and iPadOS WebKit only, so it is the gate (decision 1).
- **px spacing is mostly not about text.** The px in `app.css` are borders,
  radii, shadows, hairlines, decorative dots and tracks, and touch-target
  minimums (44/48/52px). The ones that size a box around text are few:
  `body`'s `15px`, `.row`'s `minmax(130px, 1fr)`, and anything the sweep finds
  of the same kind.
- **The large-text pass exists.** Smoke's `applargetext` row
  (`app shell at 320px/32px text`) loads the app with CDP
  `Page.setFontSizes` at 32px and walks `APP_LARGE_TEXT_STATES` (the five
  screens, the team menu, bench mode, bench mode with the undo toast, the swap
  picker, the welcome screen twice, the sample flash) for sideways overflow and
  stranded boxes. `APP_LARGE_TEXT_ALLOW` is empty.
- **The wordmark is already capped at big text.** Inside
  `@media (max-width: 19em)`, `.wel-h { font-size: min(2rem, 15vw) }`, because
  "Benchcard" is one unbreakable word; `test/big-text.test.js` pins the `min(`.
- **The card is inches and px.** `card.css` sizes in `in` and `px`, and
  `card.js` sets `.chg` and `.five` sizes in px from canvas `measureText`. The
  `cardsize` smoke row checks 3.45 × 5in at the default font size only.
- **`test/dead-var.test.js` fails on a declared token nobody reads,** unless
  it is in `KEEP_UNREAD` with a reason on the line.

## Decisions made in this spec without asking

The ticket and its cited rules already point one way on each of these.

1. **The Apple root rule is gated on iOS and iPadOS.** In `app.css`:
   `@supports (-webkit-touch-callout: none) { html { font: -apple-system-body; } }`.
   That is "on Apple devices, applied so other platforms are unaffected" for
   the devices this ticket is about (phones and tablets), and it leaves Macs at
   16px instead of 13px. A consequence to know, not a defect: on an iPhone at
   the default text size, `-apple-system-body` is 17px, so 1rem is 17px there
   and 16px on Android. Apple's own body size is 17pt; CSS cannot rescale it.
2. **Each step has a default weight; weights are not locked to sizes.** The
   ticket allows 500, which no step uses, so a step's weight is its default and
   an element may take any of 400, 500, 600 or 700 for emphasis.
3. **A screen's title is a large title; everything else takes the nearest
   step.** Today's `<h1>`, the game's title (`.dayhead input.daytitle`) and the
   welcome wordmark (`.wel-h`) are large titles. For every other declaration,
   the nearest step by value, ties going down:

   | Current value | Step |
   | --- | --- |
   | below `.84375rem` (and every `em` that computes below it) | footnote `.8125rem` |
   | `.84375rem` to below `.9375rem` | secondary `.875rem` |
   | `.9375rem` to below `1.03125rem` (and `body`'s `15px`) | body `1rem` |
   | `1.03125rem` to below `1.21875rem` | headline `1.0625rem` |
   | `1.21875rem` to below `1.46875rem` | title `1.375rem` |
   | `1.46875rem` to below `1.84375rem` | sentence `1.5625rem` |
   | `1.84375rem` and up, and the three large titles | large title `2.125rem` |

   `clamp()` and `vw` sizes are replaced by the step their maximum maps to.
   Weights go to the nearest hundred, ties going down: 470 → 500, 550 → 500,
   650 → 600, 660 → 700, 750 → 700. `h1,h2,h3,h4` take 600.
4. **A large title may be capped against the viewport at big text, and only
   there.** T4 lets headers scale less than the plan. Inside the
   `@media (max-width: 19em)` block, a large title that would otherwise pan at
   320px/32px may be `min(var(--fs-large), 15vw)`, as `.wel-h` is today. Nowhere
   else, and never for anything but a large title.
5. **Glyph icons are type.** A `›` chevron, `✕`, `✓` or an emoji icon sized
   with `font-size` takes a step like any other text. SVG icons from `icons.js`
   are sized in `em` on the SVG, not with `font-size`, and are unaffected.

## What would settle it

1. **rem everywhere text is sized.** Every `font-size` in `app.css` and in a
   `style` attribute in `index.html` is `var(--fs-*)`, `inherit`, or (inside
   the `19em` block, on a large title only) `min(var(--fs-large), <n>vw)`.
   `body` is `font-size: var(--fs-body)`. `.row`'s `minmax(130px, 1fr)` and
   any other length that sizes a box to fit text is in `rem`. Borders, radii,
   shadows, hairlines, decorative dots and tracks, and touch-target minimums
   stay `px`.
2. **The platform hooks.** `index.html`'s `<head>` has
   `<meta name="text-scale" content="scale">`. `app.css` has exactly one rule
   using `-apple-system-body`, `html { font: -apple-system-body; }`, and it is
   inside `@supports (-webkit-touch-callout: none)`. In headless Chrome at the
   default font size, `getComputedStyle(document.documentElement).fontSize` is
   `16px`, and at a 32px default it is `32px`.
3. **The scale, exactly.** `tokens.css` declares these seven and no other
   `--fs-*`:

   | Token | Size | Default weight |
   | --- | --- | --- |
   | `--fs-large` | `2.125rem` | 700 |
   | `--fs-sentence` | `1.5625rem` | 600 |
   | `--fs-title` | `1.375rem` | 700 |
   | `--fs-headline` | `1.0625rem` | 600 |
   | `--fs-body` | `1rem` | 400 |
   | `--fs-secondary` | `.875rem` | 400 |
   | `--fs-footnote` | `.8125rem` | 400 |

   Every `font-weight` in `app.css` and in `index.html`'s `style` attributes
   is 400, 500, 600 or 700 (or `inherit`). At 390×844 with a 16px root, on
   every state in `APP_LARGE_TEXT_STATES` plus the help sheet, the keyboard
   shortcuts dialog and the first tour step, every rendered element that has
   its own non-blank text, outside `.card`, computes to a font size in
   {13, 14, 16, 17, 22, 25, 34}px and a weight in {400, 500, 600, 700}.
4. **Twice the size holds together.** The smoke row
   `app shell at 320px/32px text` passes on every state it walks, with
   `APP_LARGE_TEXT_ALLOW` still empty. The help sheet, the keyboard shortcuts
   dialog and the first tour step are added to `APP_LARGE_TEXT_STATES` if no
   existing 320px/32px pass already opens them, and pass.
5. **The card does not scale.** With the root at 32px, `.card` measures
   3.45 × 5in (331.2 × 480 CSS px before `zoom`), as it does at 16px, and its
   `.five` and `.chg` font sizes are the same px values as at 16px for the same
   game.
6. **Green.** `npm test` and `npm run smoke` pass. `test/big-text.test.js`'s
   root-pin test still fails on `html { font-size: … }` anywhere and still fails
   on an unguarded `-apple-system-body`, and accepts only the gated rule.

## Surfaces

Change:

- `app/tokens.css` — the seven `--fs-*` tokens, with a comment naming the
  scale's source (T2–T4) and the iPhone 17px note.
- `app/app.css` — every `font-size` and `font-weight`, `body`, the gated root
  rule, the text-fitting px lengths, and any wrap or cap the 320px/32px pass
  now needs.
- `app/index.html` — the `text-scale` meta; the two inline `<h1>` styles move
  to classes in `app.css`.
- `app/sw.js` — `VERSION` bump and `SHELL` digest (precached files change).
- `scripts/smoke.mjs` — the new type-scale row, the extended `cardsize` row,
  any added large-text states.
- `test/` — a new source guard for the scale (below), `test/big-text.test.js`
  (root-pin test, wordmark cap now `min(var(--fs-large)`), `test/dead-var.test.js`
  (`KEEP_UNREAD` for `--fs-sentence` only if nothing reads it, reason: "#27's
  sentence"), and any test that pinned a size or weight this ticket replaces.
- `AGENTS.md` — the smoke row count ("25 of them") if a row is added.
- `scripts/budgets.mjs` — widen the bytes ceiling if it trips.

Must not change:

- `app/card.css`, `app/card.js`'s fitting, `app/share.js` — the card.
- `about.html`, `advanced.html`, the six chart pages and `scripts/charts.mjs`.
- `engine.js`, `budget.js`, `storage.js`, `roster.js`.
- `app/vendor/**`, `scripts/budgets.json`.

## Constraints

- **Never regress the card** (`AGENTS.md` § Rules). `card.css` is untouched;
  item 5 proves it at 32px. The card's measurement font stack still matches
  `.card` exactly (§ Traps).
- **Mobile first.** Verify at 390×844 first, then 320px/32px.
- **Precache bump.** `app.css`, `tokens.css`, `index.html` are precached: bump
  `VERSION` and set `SHELL` to the digest `npm test` names.
- **Budgets.** `requests` is the pin and must not move: no new stylesheet or
  module. Bytes and nodes are alarms; widen `bytesAbs` in
  `scripts/budgets.mjs` if needed, never `--update-budgets`.
- **Do not raise `APP_LARGE_TEXT_ALLOW` or `LARGE_TEXT_ALLOW`** to clear a
  failure (§ Layout). Fix the layout: wrap, or (large titles only) cap.
- **Reuse `APP_LARGE_TEXT_STATES`** for the type-scale row's states; do not
  copy the list. Reuse the existing `Page.setFontSizes` idiom for the 32px
  card measurement.
- **Reuse the `19em` big-text block** for any new big-text rule; it must stay
  after the px breakpoints (`test/big-text.test.js`).
- **Interface guideline rules:** T2 (rem, the phone sets 1rem, lay out for
  200%), T3 (weights 400–700, nothing below footnote), T4 (the plan grows
  first; headers may scale less, which is decision 4), A4 (test with text at
  200%, which is item 4 and the `/browser-verify` step).
- **Traps in the way.**
  - `card.js` `sheet.clientWidth - 32` assumes `.stage`'s side padding is 16px
    each. If the preview's zoom goes wrong at 32px root, measure the stage's
    computed padding there; do not change `card.css`.
  - `font: -apple-system-body` also sets family and line-height on `html`.
    `body` must keep setting `font-family: var(--font)` and its line-height.
  - `/browser-verify` owns the measurement traps; load it before any browser
    measurement.

## Design

**Tokens.** Add the seven `--fs-*` to `:root` in `tokens.css`. They are not
theme-dependent, so they appear once.

**Root.** In `app.css`, next to the `html` rule:

```css
@supports (-webkit-touch-callout: none) {
  html { font: -apple-system-body; }
}
```

`body` becomes `font-size: var(--fs-body)`. In `index.html`'s `<head>`, after
the viewport meta: `<meta name="text-scale" content="scale">`.

**The sweep.** Apply decision 3 to every `font-size` and `font-weight` in
`app.css`, and move the two inline `<h1>` styles into classes. Convert
text-fitting px lengths to rem. Then run the 320px/32px pass and fix what it
finds the way the `19em` block already does: let a row wrap, let a nowrap
label wrap, and for a large title only, cap with `min(var(--fs-large), 15vw)`.

**The type-scale smoke row.** New row, id `typescale`, name
`type scale: 7 sizes, 4 weights`, setup `rich`, selectable. At 390×844 and a
16px root, for each of `APP_LARGE_TEXT_STATES` plus the help sheet, keyboard
shortcuts dialog and first tour step: open it, collect every element that is
rendered (a non-empty client rect, not `visibility: hidden`), has a direct
non-whitespace text node (or is an `input`, `select` or `textarea`), and is not
inside `.card`; read computed `fontSize` and `fontWeight`; report each offender
as the state, a short selector, the size and the weight. Also assert
`meta[name="text-scale"]`'s content is `scale`. Passes on zero offenders.

**The card at 32px.** Extend `cardsize`: after the existing measurement, set
the default font to 32px, reload, measure `.card` and the first `.five` and
`.chg` font sizes, compare to the 16px values, and restore 16px.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `test/type-scale.test.js`, a **source guard** (built under `/new-guard`, falsified by hand: a `font-size: .7rem`, a `font-weight: 650`, an `--fs-extra`, an ungated `-apple-system-body` each turn it red) | `node --test` reading `tokens.css`, `app.css`, `index.html` | 1, 2 (the Apple rule and the meta in source), 3 (tokens and weights in source) |
| `test/big-text.test.js`, root-pin and wordmark tests updated | `node --test` | 2, 6 |
| `typescale` smoke row | `node scripts/smoke.mjs --only "type scale: 7 sizes, 4 weights"` | 2 (root 16px and meta at runtime), 3 (computed sizes and weights) |
| `app shell at 320px/32px text` smoke row, states added if missing | `--only "app shell at 320px/32px text"` | 2 (root 32px), 4 |
| `cardsize` smoke row, extended | `--only "card is 3.45 × 5in"` | 5 |
| `/browser-verify` | Chrome at 390×844 at 16px, then 320px at a 32px default font, screenshots of Today, the game screen, bench mode and the card preview | 4, 5, what a coach sees |
| full proof pair | `npm test`, `npm run smoke -- --no-tests` | 6 |

The iOS half of item 2 cannot run on this machine: headless Chrome does not
match `-webkit-touch-callout`, and macOS WebKit does not either. The source
guard is its only proof here; whether it follows Dynamic Type inside an
installed web app stays unverified (T2, #18 § Further Notes).

## Out of scope

- The static pages (`about.html`, `advanced.html`, the chart pages). They have
  their own styles and #18 leaves them out.
- The card: its sizes, face, fitting, and `card.js`'s px padding constant
  unless item 4 or 5 fails because of it.
- Raising the touch-target floor to 48px (#37).
- Evening out the 17px vs 16px root between iPhone and Android.
- Checking `-apple-system-body` and `text-scale` on a real phone.
