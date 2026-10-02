# 284: three-bar mark

## Issue

#284: replace #277's five-row card mark with a simpler three-bar card, everywhere the mark is drawn, so it reads at tab size.

## Goal

At 16px in a browser tab and 26px in a page header, a coach sees a light card with three colored bars on orange, not a speckled rectangle. The owner compared four options in a mockup at 16px, 26px and home-screen size, and picked this one (option "C"). It is still one mark everywhere: install icons, tab icon, header logos, the welcome logo, the link-preview image and the shared card image.

## What would settle it

1. **The geometry below is the mark.** `markSvg` in `scripts/mark.mjs` draws the geometry below, and nothing else. There are no row tracks, and no `#E4DED7`, `#A8952E` or `#5E8A3A` is left in its output.
2. **Every copy is regenerated from it.** This covers:
   - the static copies in `index.html`, `about.html`, `advanced.html` and `share.js`;
   - the 6 chart pages;
   - the four install icons;
   - `og.png`.

   `node scripts/mark.mjs --check` and `node scripts/charts.mjs --check` both pass, and `test/mark-drift.test.js` passes.
3. **The maskable safe zone still holds.** `test/icon-safe-zone.test.js` passes on the regenerated `icon-512.png`: outside the radius-204.8px circle there is only `#D2500A`. The card is now larger, so `ICON_FIT` in `scripts/og.mjs` is lowered until it fits, and the new value is the largest one that passes, to two decimals.
4. **The welcome logo keeps #277's rules.**
   - The ground follows `var(--tint)`.
   - The card is `var(--mark-card)`.
   - The ground-vs-card contrast of 3:1 or more in `hardwood-pages`, and the paper-where-paper-reads assertions, still pass.
5. **The shared card image.** The band still shows the mark at `MARK_SIZE` 12, and the band height is unchanged. The share-image check's floor of at least 500 `#D2500A` pixels was sized for #277's smaller card. The new card covers about half of the 36-device-px mark, and 466 pixels were measured. The floor becomes 300: still well above zero, and a band with no mark has none.
6. **Readable small.** Screenshots of the tab icon at 16px, the header logo at 26px and `icon-192.png` show a light card with three colored bars.
7. **Docs.**
   - `docs/operations.md` describes the mark as "a tilted card of three player-colored bars".
   - The header comment in `scripts/mark.mjs` matches.
   - `docs/specs/277-card-mark.md` is history, and is not edited.

## The geometry (100-unit square)

- **Ground:** `#D2500A`, unchanged, along with its options: square or rounded with rx 22, and the `ground` override.
- **Card:** `#F4F4F6` (or the `card` option), x=17 y=10, 66×80, rx=9, rotated -8° about (50, 50).
  - Drop shadow: unchanged, still opt-in.
  - `scale`: unchanged, still about (50, 50).
- **Bars:** three, each 11 tall with rx=5.5, at y = 24, 44, 64. The row runs from x=26 and is 48 wide. Stints are start%–end% of that width:
  - row 1, `#C0504D`: 0–70
  - row 2, `#C9762F`: 30–100
  - row 3, `#2E8A7A`: 0–45 and 70–100
- **Paint order:** ground, card, then the stints in row order.

## Surfaces

- **Change:**
  - scripts: `scripts/mark.mjs` (the constants and `rowBars`, the pivot, and the header comment), and `scripts/og.mjs` (`ICON_FIT` and its comment);
  - regenerated: `app/index.html`, `app/about.html`, `app/advanced.html`, `app/share.js` (the generated block only), the 6 chart pages, `app/icon-192.png`, `app/icon-512.png`, `app/apple-touch-icon.png`, `app/favicon.ico` and `app/og.png`;
  - `app/sw.js`, through `npm run sw:bump`;
  - `docs/operations.md`;
  - tests: `test/mark.test.js`, and any other test that types out the old geometry.
- **Must not change:**
  - `app/vendor/`;
  - the manifest;
  - how the favicon is referenced (a data URI);
  - the `markSvg` option names and what each one means;
  - `app/tokens.css`'s `--mark-card` rule;
  - share.js outside its generated block.

## Constraints

- **Reuse, do not re-derive.** `mark.mjs` stays the one place the geometry lives. Every other copy comes from running its generators: `node scripts/mark.mjs`, `node scripts/charts.mjs`, `node scripts/og.mjs --icons` and `node scripts/og.mjs`. Never hand-edit a copy.
- **The precache bump.** Run `npm run sw:bump` after the last regeneration, then re-run `mark.mjs --check`.
- **The about-page date.** `about.html` changes, so its footer `<time>` must be today's date (`npm run check:history` fails otherwise). Update it, then bump.
- **The byte budget.** If a payload budget fails, widen `bytesAbs`. Do not run `--update-budgets`.
- **The hues stay fixed hex values**, a subset of #277's: red, orange and teal. Do not derive them from `state.js`.

## Design

Swap the constants in `mark.mjs`:
- `HUES` holds the three hues and `STINTS` the three rows.
- `ROW_X`, `ROW_Y`, `ROW_W`, `ROW_H` and `ROW_STEP` become 26, 24, 48, 11 and 20.
- The card rect is x=17 y=10, 66×80 with rx 9. Lift it into constants so the card and `shareShapesSource` share one source.
- The pivot is (50, 50). `MARK_TILT` in the generated share.js block follows it.
- `rowBars` stops emitting the track rect, and bar `rx` is `ROW_H / 2`.

Then run the generators and lower `ICON_FIT` until the safe-zone test passes.

## Proof

- **Module seam (`test/mark.test.js`, under `node --test`):** the card rect, the -8° tilt about (50, 50), and three rows giving four stints with the exact x and width typed out, the hues in order, and no track rects. Covers item 1. Watch it fail on the old geometry first.
- **Drift and safe zone (`test/mark-drift.test.js`, `test/icon-safe-zone.test.js`):** these are unchanged and pass after regeneration. Covers items 2 and 3.
- **Smoke rows, run under the lock:**
  - "welcome, about and advanced carry the Hardwood orange";
  - "team color tints K1 only, and switches with the team";
  - the share-image row.

  Covers items 4 and 5.
- **`/browser-verify`:** screenshots at 16px, 26px and 192px. Covers item 6.

## Out of scope

- B-letter variants, and any other change to the concept.
- The ground color, the wordmark and the app name.
- A separate small-size mark. The one geometry serves every size.
