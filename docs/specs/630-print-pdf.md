# 630: Share to print shares a true-size US Letter PDF

## Issue

#630 — in the iOS Home Screen app, Share to print shares a PNG, which iOS
scales to fill the page; share a US Letter PDF instead, so the card prints at
its real size.

## Goal

A coach using the installed iPhone app taps Share to print, picks Print in the
share sheet, and gets the same page Safari's `window.print()` gives: Pocket
cards 3.45 x 5.0 in, Half sheets 8 x 5.1 in, laid out on letter paper the way
print lays them out. Share image (the group-chat PNG) is untouched.

## What would settle it

1. `test/pdf.test.js` reads the bytes the PDF builder returns and checks:
   every page's `/MediaBox [0 0 612 792]`; each card image is drawn with a
   `cm` matrix of its true size in points (Pocket `248.4 0 0 360`, Half
   `576 0 0 367.2`) at the 18 pt margin; every `xref` offset points at the
   first byte of its `N 0 obj`; `startxref` points at `xref`; the image is
   `/Filter /DCTDecode` with the JPEG's pixel `/Width` and `/Height`.
2. The layout mirrors `window.print()` page by page (surveyed: Chrome's
   `Page.printToPDF` of the RICH game day, see Survey). With PDF y measured
   from the page bottom, the `cm` translations are:
   - Pocket, one game, 2 copies (2 cards): 1 page, `18 414`, `277.2 414`.
   - Pocket, whole day, 2 games x 2 copies (4 cards): 1 page, `18 414`,
     `277.2 414`, `18 43.2`, `277.2 43.2`.
   - Half, one game, 2 copies (2 cards): 1 page, `18 406.8`, `18 28.8`.
   - Half, whole day (4 cards): 2 pages, each `18 406.8`, `18 28.8`.
   - A game that splits across cards (more pages of the card than fit) flows
     on to as many letter pages as it needs, in DOM order.
3. In the Home Screen app (Coach `asHomeScreenApp()`), Share to print on
   Today, on the share sheet and under the Card view shares one file,
   `benchcard-<slug>.pdf`, type `application/pdf`, inside the tap, prints
   nothing; the shared file's own bytes have the page count and `cm`
   placements of item 2 for the case on screen.
4. When `navigator.canShare` refuses the PDF (but would take a PNG), Share to
   print falls back to today's PNG path: it shares `benchcard-<slug>.png`,
   with today's toasts.
5. Share image in a browser tab still shares `benchcard-<slug>.png`,
   `image/png`, painted exactly as before (gray ground, `benchcard.app` band).
   Existing scenarios for it pass unchanged.
6. A share that fails says `Could not share the card.`; a PDF that cannot be
   made says `Could not make the card.` (Home Screen app only, so neither adds
   "Print still works."). A cancelled share counts as nothing; a shared PDF
   counts `card_shared` (same `how` values) and records the card as printed
   (#572), as the PNG did.
7. The WebKit check `home-screen print` (`scripts/webkit/checks.mjs`,
   `homeScreenProblems` in `verdicts.mjs`) expects `["benchcard-ravens.pdf"]`
   of type `["application/pdf"]`.
8. `docs/architecture/interface.md` (#500 paragraph) and
   `docs/architecture/card.md` § Shared PNG describe the PDF route.
9. A `scripts/whats-new.json` entry (coach note), `npm run whats-new`, and the
   What's new `<lastmod>` in `app/sitemap.xml` moved to its date.

## Survey (what the tree says)

- `app/card.css`: `@page { size: letter portrait; margin: .25in; }`; print
  `.stage { display:flex; justify-content:flex-start; gap:.15in }` keeps the
  screen rule's `flex-wrap: wrap`; print `.card { border: 1px dashed #ccc }`
  (inside the box: `* { box-sizing: border-box }`), radius 4px.
- `#sheet` holds every card print prints: `card.js` loops copies (outer),
  then games (`printScope`), then that game's card pages; copies past the
  first carry `.card-copy`. `state.ui.copies` defaults to 2.
- Chrome's print of RICH (scratch run, `Page.printToPDF`, preferCSSPageSize):
  Pocket one game = 1 page, 2 side by side; Pocket whole day = 1 page, a 2 x 2
  grid (two rows fit: 18 + 360 + 10.8 + 360 = 748.8 <= 774); Half whole day =
  2 pages, 2 stacked per page. So print fills rows left to right, wraps rows,
  and starts a new page when the next row would pass the bottom margin. The
  issue's "two Pocket cards side by side" is the one-game case; a whole day
  gets four to a page.
- `share.js` paints at `SCALE = 3` (288 dpi) and stays synchronous;
  `pngBlob` decodes `toDataURL` by hand. `printCard` sends the Home Screen app
  to `shareCardImage`.

## Surfaces

- New `app/pdf.js`: pure, no DOM, no imports from the app. Unit-tested.
- `app/share.js`: a per-card paint for print and the PDF share function.
- `app/app.js`: `printCard`'s Home Screen branch calls a new named,
  zero-argument handler (print-gate test resolves handlers to named
  functions).
- `app/sw.js` `PRECACHE` gains `./pdf.js` if share.js imports it at boot
  (it does, statically — see Constraints on `requests`).
- `scripts/smoke/page-spies.mjs` (`HOME_SCREEN_APP` keeps the shared File so
  its bytes can be read), `test/coach.js` (verbs), the WebKit check and
  verdict, `test/home-screen-print-scenarios.test.js`,
  `test/statements-match-scenarios.test.js` if its asserts need the new
  verb.
- Must not change: Share image's PNG (`drawCards`, `shareCards`, PAD/GAP/FOOT,
  the band), the browser-tab print path, the Home Screen app's button labels
  and hidden controls (#500), `card.css`.

## Constraints

- **Synchronous from tap to `navigator.share`.** No `await`, no `toBlob`, no
  image decode. JPEG bytes come from `canvas.toDataURL('image/jpeg')`, decoded
  by hand like `pngBlob` (share one decoder for both, do not copy it).
- **Reuse, do not re-derive.** The card's size comes from `CARD_SIZES`
  (`app/card-spec.js`) in inches x 72, not from a second typed copy. The page
  geometry (`letter`, `.25in` margin, `.15in` gap) lives in `card.css`;
  `pdf.js` necessarily holds it in points, so a guard test
  (`test/pdf.test.js` or its own file, under `/new-guard`) reads `card.css`
  and fails if the `@page` size/margin or the print `.stage` gap differ from
  `pdf.js`'s constants. That source-reading test is a named seam here.
- **The card is the product.** The JPEG is the card exactly as the PNG paints
  it (same `paint` walk), on white, with print's 1px dashed `#ccc` edge and
  4px radius where `window.print()` draws it, and nothing else: no gray
  ground, no `benchcard.app` band, no PAD. Fill white before painting, or the
  JPEG's transparent pixels come out black.
- **One image per distinct card.** Copies repeat the same JPEG XObject rather
  than painting and embedding it again: paint the `#sheet` cards without
  `.card-copy` once each, and lay out `copies` repeats of that list in order
  (the order `card.js` builds them in).
- **`requests` pin.** If `pdf.js` joins the boot graph, `REQUESTS_BASELINE`
  in `scripts/budgets.mjs` moves by one, said in the commit; bytes re-pinned
  only if the alarm trips. Never `--update-budgets`.
- Analytics: `card_shared`'s allowed `how` values stay as they are.
- American spelling; no British forms in comments.

## Design

`app/pdf.js` exports:

- `PT_PER_IN = 72`, `LETTER = { w: 612, h: 792 }`, `MARGIN = 18`, `GAP = 10.8`.
- `printLayout(sizes)` — `sizes` is a list of `{ w, h }` in points, in print
  order; returns pages, each a list of `{ i, x, y, w, h }` (`i` the index in
  `sizes`, `x`/`y` the top-left from the page's top-left). Rows fill left to
  right while `x + w <= LETTER.w - MARGIN` (first item in a row always goes);
  a row is as tall as its tallest card; the next row starts `GAP` below; a
  row that would pass `LETTER.h - MARGIN` starts a new page at `MARGIN`.
- `letterPdf(pages, images)` — `images` a list of `{ jpeg: Uint8Array,
  width, height }` (pixels); `pages` as `printLayout` returns plus an `img`
  index per placement. Returns a `Uint8Array`: `%PDF-1.4`, a binary comment
  line, Catalog, Pages, one Image XObject per image (`/DCTDecode`,
  `/DeviceRGB`, 8 bits), one Page and one content stream per page, each
  placement `q w 0 0 h x y' cm /ImN Do Q` with `y' = 792 - y - h`, numbers
  written with at most 3 decimals and no trailing zeros, then `xref` with
  correct 10-digit offsets, `trailer << /Size /Root >>`, `startxref`, `%%EOF`.

`app/share.js` adds `shareForPrint(cards, { copies, filename, title })`:
paints each card alone onto a white 3x canvas with the dashed edge, JPEG,
lays out `copies` repeats via `printLayout` with `CARD_SIZES` points, builds
the PDF, and if `navigator.canShare({ files: [pdf] })` shares it (resolving
`'shared'`/`'cancelled'` as `shareCards` does); otherwise returns
`shareCards(cards, { filename: <same slug>.png, title })`, so the fallback is
today's PNG path with its own outcomes.

`app/app.js`: `printCard`'s Home Screen branch calls a new named handler
(e.g. `shareCardForPrint`) built like `shareCardImage`; the outcome handling
(toasts, `card_shared`, `recordPrinted`) is shared between the two, not
copied. Its slug/title come from the same code `shareCardImage` uses.

## Proof

- **`node --test test/pdf.test.js`** (pure module): items 1 and 2 —
  `printLayout` for the four cases and a split game, `letterPdf` byte checks,
  and the `card.css` drift guard.
- **Coach scenarios** (`test/home-screen-print-scenarios.test.js`): items 3,
  4, 6 — start red: the existing PNG expectations change to the PDF, a new
  verb returns the shared file's bytes (latin1) to check page count and `cm`
  placements, and a verb makes `canShare` take only images for the fallback.
  The browser-tab scenario covers item 5.
- **`node --test test/webkit.test.js`** for the verdict change, item 7.
- Item 8 and 9: doc-writer and the developer respectively; `npm run
  check:history`.
- The real-device ruler check is the owner's, after merge (PR says
  `Refs #630`).

## Out of scope

- Showing Share image or Copies in the Home Screen app (#500 hid them; the
  issue says only the print route changes). Copies is still honored from the
  saved setting, as `window.print()` honors it.
- Android, browser tabs, and the PNG's look.
