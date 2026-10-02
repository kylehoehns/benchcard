# 277: card mark

## Issue

#277: replace the basketball mark with a tilted card of player-colored stint rows, everywhere the ball is drawn.

## Goal

A coach who installs Benchcard sees an icon that shows what the app makes: a rotation card with each kid's minutes in their own color. The same mark is in the browser tab, the page headers and the link-preview image, so the brand has one mark and not two.

## What would settle it

1. **One drawing.** The mark is defined once in `scripts/` (the geometry below), and every other place gets it from there. No ball seam paths (`M4.6 3.7…`, `M4.5 3.6…`, `M12 1.5v21…`) remain anywhere in `app/` or `scripts/` outside `app/vendor`.
2. **Install icons.** `node scripts/og.mjs --icons` redraws `app/icon-192.png`, `app/icon-512.png`, `app/apple-touch-icon.png` and `app/favicon.ico` with the card mark. The PNGs are checked in, regenerated.
3. **Maskable safe zone.** On `icon-512.png`, every pixel of the card and its shadow lies inside the centered circle of radius 0.4 × 512 = 204.8px. Outside that circle there is only the ground color `#D2500A`. If the sketch geometry pokes out, scale the whole card group down about the icon center until it fits. Keep the tilt, the proportions and the colors.
4. **Tab icon.** The `rel="icon"` data URI on all 9 pages (index, about, advanced and the 6 chart pages) is the card mark. It stays a data URI, so `test/favicon.test.js` still passes and the page costs no icon request. The chart pages come from `node scripts/charts.mjs`, so `--check` must pass.
5. **Header logo.** The 26px logo beside "Benchcard" in the header of about, advanced and the chart pages is the card mark, and it keeps `aria-hidden="true"`.
6. **Share image.** The 42px brand mark in the `og.png` composition is the card mark. Regenerate `og.png` with `node scripts/og.mjs`.
7. **Shared card image.** When a coach shares the card as an image (`app/share.js`), the band under the card shows the card mark, about the band's text height, to the left of `benchcard.app`. The band keeps its height, the card rect is untouched, and there is still no wordmark or strapline. Update the comment at `share.js:30-34`, which says the band holds only the URL, to say why the mark is there now: the owner asked for the brand mark on everything that leaves the app.
8. **README.** `README.md` shows the new mark, the 192px icon at 64px, above or beside the title. Its `og.png` banner is regenerated through item 6.
9. **About pages and docs.** The about and advanced headers are covered by item 5. Any doc that describes the mark as a ball (`docs/operations.md`, the comments in `og.mjs`) is updated to describe the card.
10. **Readable small.** At 16px (tab) and 26px (header), the mark reads as a light card with colored rows on orange. Check with a screenshot at 16, 26 and 192px.

## The geometry (100-unit square, from the sketch the owner picked)

- Ground: `#D2500A`, full bleed on the install icons. The tab icon and header logo may round its corners, like the app's other rounded marks, but they must be square or rounded-square, never the old circle.
- Card: `#F4F4F6`, x=25 y=17, 50×68, rx=6, rotated -8° about (50, 52). Drop shadow: dx 0, dy 2, stdDeviation 2.2, black, opacity .28. The shadow may be dropped at 16px and 26px if it muddies the mark.
- Rows: x=31, first row at y=27, 38 wide, 6 tall with a 5-unit gap between rows (11 from one row's top to the next), rx=3. Each row has a track `#E4DED7`, with stints in that row's hue on top. Rows rotate with the card.
  - hues, top to bottom: `#C0504D`, `#C9762F`, `#A8952E`, `#5E8A3A`, `#2E8A7A`
  - stints as start%–end% of the row width: [0–30, 55–82], [18–48, 70–100], [0–18, 38–66], [30–58, 82–100], [0–22, 48–76]

## Surfaces

- Change: `app/share.js`, `README.md`, `scripts/og.mjs` (`markSvg`, the composition's brand mark, the `SEAMS` constant and the comments that describe the ball), `scripts/charts.mjs`, `app/index.html`, `app/about.html`, `app/advanced.html`, the 6 generated chart pages, `app/icon-192.png`, `app/icon-512.png`, `app/apple-touch-icon.png`, `app/favicon.ico`, `app/og.png`, and tests under `test/`.
- Must not change: `app/vendor/`, the manifest's icon list and `purpose` values, how the favicon is referenced (data URI, no `<link>` to `favicon.ico`), `sw.js`'s precache list.

## Constraints

- **Reuse, do not re-derive.** The inline SVG in the HTML pages is the same markup `scripts/` produces. Do not hand-copy a second version of the geometry. If HTML files must hold a literal copy (they are static), a test fails when that copy differs from what the generator produces.
- **The precache bump.** Any precached file that changes (`index.html` and possibly the icons) means `npm run sw:bump`.
- **The byte budget.** The data URI grows. If a payload budget fails, widen `bytesAbs` and say so. Do not run `--update-budgets`.
- **Do not edit `app/vendor`.**
- The player hues are fixed hex values chosen for the mark. Do not derive them from `state.js`'s runtime `oklch()` palette.

## Design

One function in `scripts/` returns the mark's SVG for a given pixel size and options (with or without shadow, square or rounded ground). `og.mjs` uses it for the icon PNGs and the og brand mark. `charts.mjs` uses it for the chart pages' favicon and header. A small generator step, or a check like `charts.mjs --check`, keeps the static copies in `index.html`, `about.html` and `advanced.html` equal to its output.

## Proof

- **Module seam (`node --test`):** the mark function's output holds the geometry above: 5 rows, the 5 hues in order, -8° tilt, ground `#D2500A`. Covers item 1.
- **Drift test (`node --test`):** every `rel="icon"` data URI and every header `.mark svg` on the 9 pages equals the generator's output, and no ball seam path is left in `app/` or `scripts/`. Covers items 1, 4 and 5.
- **Safe-zone test (`node --test`):** decode `app/icon-512.png` and assert that every pixel outside the radius-204.8 circle is `#D2500A`, within ±2 per channel. Covers items 2 and 3.
- **`test/favicon.test.js`, unchanged, passes.** Covers item 4.
- **Share seam:** the existing share-image smoke or unit test extends to assert the mark is drawn in the band (the band's pixels hold `#D2500A`) and the band height is unchanged. Covers item 7.
- **`/browser-verify`:** screenshots of the mark at 16, 26 and 192px, and of a shared card image. Covers items 7 and 10.

## Out of scope

- Changing the app name, the wordmark text or the brand colors.
- A dark-mode variant of the mark.
- The in-app top bar of `index.html`, if it draws no mark today.
