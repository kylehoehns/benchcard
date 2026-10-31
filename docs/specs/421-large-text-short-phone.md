# 421 — Large text on a short phone: sheets, bench mode and the tour leave room

## Issue

#421: at 32px text on a 320 × 568 phone, the half-height sheets, bench mode
and the tour each leave almost no room for their own content. Make each one
leave room, and pin each with a smoke check.

## Goal

A coach on a small phone with the largest text setting can open Who's here,
Format or Sub interval and see rows to tap, can glance at bench mode and read
at least one whole player card with its minutes, and can follow the tour
without its box sitting on top of the control it is pointing at.

## Survey (measured on 3ada5af, smoke font, `LONG_AND_SQUEEZE` record)

Measured with the harness's own `land`/`openState` (`scripts/smoke/`), long
names loaded, reduced motion. `body` is the sheet body's visible height
(`clientHeight`) over its `scrollHeight`.

| Cell | Who's here body | Format body | Sub interval body |
| --- | --- | --- | --- |
| 320×568 / 16 | 169 / 728 (half) | 169 / 169 | 169 / 484 |
| 320×568 / 32 | 32 / 1839 (half), status line runs off the bottom (472–590) | 32 / 358 | 32 / 1063 |
| 390×844 / 16 | 307 / 704 (half) | 307 / 307 | 307 / 484 |
| 390×844 / 32 | 148 / 1455 (half) | 154 / 310 | 148 / 967 |

At 320×568/32 the sheet header is 156px (the 96×96 close button and the empty
left slot squeeze the title to 134px wide, so "Who's here" wraps to two
lines) and the status line is 118px (two lines). A Who's here row for the
42-character fixture name is 340px tall; for the issue's own example name it
is about 200px.

Bench mode (`.gm-bar` bottom → `.gm-foot` top, floor cards):

| Cell | Bar | Foot | Floor card height | Whole cards in the window |
| --- | --- | --- | --- | --- |
| 320×568 / 16 | 0–70 | 488–568 | 53 | 5 |
| 320×568 / 32 | 0–158 | 280–568 (Leave+Back row 1, Next row 2) | 207 | **0** |
| 390×844 / 32 | 0–158 | 556–844 (same wrap) | 217 | 1 |

On the last stint at 320×568/32 the foot is 210–568 and no card is whole.

Tour, box overlap with the ring (`#tourHole`), and `#tourBody` visible/total:

- 320×568/32: every step's box is y 10–558; it covers 91–100% of the ring on
  steps 1–5 and 7. Body shows 59–135px.
- 390×844/32: steps 1–5 cover 92–100% of the ring.
- 320×568/16: step 2 covers 100% (box 198–558, ring 241–291); step 4
  (`#timeline`) 17%.
- 390×844/16: step 4 covers 4%. `scripts/smoke/tour-steps.mjs` exempts step 4
  from its no-overlap check (`capped`), citing an older spec that kept
  `placeTour` frozen. This issue lifts that: the box never covers its control,
  step 4 included.

Every claim in the issue held. Two things it did not decide, and the choice
made for each (closest to the issue's intent):

1. **When is a screen "short or large text"?** One media query,
   `(max-height: 40em)`. `em` in a media query resolves against the
   browser's default text size (the same idiom as the existing
   `@media (max-width: 14em)` in `app.css`), so it is 640px tall at 16px text
   and 1280px at 32px. That makes 320×568 at 16px open full (a short screen)
   and every phone at 32px open full (large text), while 390×844 at 16px keeps
   the half-height default guideline C3 asks for.
2. **"Usable rows" needs a number.** Who's here's 340px row for the
   42-character fixture name is taller than the room any sheet has on a 568px
   phone, so "two whole rows" cannot hold there. The number is the body's own
   visible height: at least 45% of the viewport height on open (256px at 568,
   380px at 844). That is room for several ordinary rows and most of a long
   one.
3. **The tour body's minimum.** At least one full line of body text shows,
   and the body scrolls when the text is longer. The issue's complaint was
   the box covering the control; one line plus a scroll is the floor that
   still leaves the box readable.

## What would settle it

Cells: **320×568 and 390×844, each at 16px and 32px text**, record
`LONG_AND_SQUEEZE` (long names), reduced motion, each state opened the way
`CLIP_STATES` opens it.

1. **Sheets.** For Who's here, Format and Sub interval:
   - when `(max-height: 40em)` matches (320×568/16, 320×568/32, 390×844/32),
     the sheet opens with class `full` (handle reads "Half height"); at
     390×844/16 it still opens half (`bsheet-half`);
   - in the three cells that open full, the body's `clientHeight` is at least
     45% of the viewport height (≥ 256px at 568, ≥ 380px at 844);
   - the header, body and status line all sit inside the viewport (status
     line's bottom ≤ viewport height);
   - the close button stays ≥ 48 × 48.
2. **Bench mode.** In `bench mode` and `bench mode, last stint`, with
   `.gm-body` at its opening scroll, at least one floor card
   (`#gmFloor > *`) lies wholly between the bottom of `.gm-bar` (or of
   `#gmMoved` when it shows) and the top of `.gm-foot`. In `bench mode`,
   Leave (`#gmDone`), Back (`#gmPrev`) and Next (`#gmNext2`) share one row
   (tops equal within 1px), each ≥ 48 × 48, and Leave's accessible name still
   says Leave.
3. **Tour.** On every step 1–7: `#tourBox` and `#tourHole` do not overlap
   (no exemption for `#timeline`), the box is inside the viewport, `#tourNext`
   is inside the viewport and ≥ 48 × 48, `#tourBody` shows at least one line
   (`clientHeight` ≥ its computed `line-height`), and when its text is longer
   than that it scrolls (`overflow-y` is `auto`/`scroll`).
4. **Nothing else regresses.** The full `npm run smoke` stays green,
   including `app shell at 320px/32px text`, the clip sweep, touch targets and
   the existing tour row at 390, 1280 and 320/32.
5. **A smoke check pins 1–3** at the four cells, and is shown failing on
   3ada5af's `app/` (falsified per `/new-guard`).

## Surfaces

Change:
- `app/trap.js` — `openSheet`: promote a half open to full when
  `(max-height: 40em)` matches.
- `app/tour.js` — `placeTour` (box side, height cap, ring cap for a tall
  anchor) and, if needed, `tourGo`'s scroll target.
- `app/app.css` — the sheets section, bench mode (`.gm-bar`, `.gm-foot`,
  `.gm-nav`, `.gm-exit`), the tour section, and large-text blocks for these
  only.
- `app/index.html` — only if Leave needs an icon/label split.
- `scripts/smoke/` — one new check module and its registry entry, the
  README index row; `tour-steps.mjs` drops the `capped` exemption.

Must not change: the four pure modules, `state.js`, `live.js`, the card.
Other large-text CSS (Today, settings, flows, pages) is #422's; stay inside
the sheets, bench mode and the tour.

## Constraints

- Mobile first; touch targets stay ≥ 48px (I1). Bench mode controls stay in
  the bottom half (I2).
- Guideline C3 keeps two resting heights. The handle still toggles; a sheet
  that opened full can still go to half. Only the opening height changes.
- Prefer transform/opacity; `placeTour` sets positions directly (already
  measured, never transitioned) — keep it cheap, it runs on every scroll.
- `placeTour` must never move the page sideways (see its own comment).
- Reuse, do not re-derive: `land`, `openState`, `CLIP_STATES`,
  `LONG_AND_SQUEEZE`, `REDUCED_MOTION`, `TOUCH_MIN`, `step`, `SETTLE`;
  the tour states from `overlay.mjs`'s `STATES`; `RING_CAP_RATIO` stays one
  name in `tour.js`.
- The new check follows `/new-guard`: a state that never opened fails
  (rule 2a), and it is shown red against the old `app/`.
- `smoke-size` LIMIT applies to every file under `scripts/smoke/`.
- No allow-map numbers raised; no blanket tolerance.

## Design

1. **Sheets.** `openSheet` computes
   `full = full || matchMedia('(max-height: 40em)').matches` before
   `setSheetHeight`. In a large-text CSS block, compact what a sheet's chrome
   takes so the body clears 45%: the close button to its 48px floor rather
   than `3rem`, and the empty header slots no wider than they need, so the
   title gets one line where it fits; trim the status line's padding. Keep
   inside the sheets section.
2. **Bench mode.** In a large-text block: Leave becomes an icon (the
   existing `x`/exit glyph or similar) with its visible text kept for screen
   readers (accessible name "Leave"), and `.gm-nav` sizes to the 48px floor
   plus a little rather than `3.2rem`, so Leave, Back, the dots and Next fit
   one row at 320px; the bar's padding and title shrink so the bar is about
   one row. Finish game may still wrap on the last stint, as long as a whole
   card shows.
3. **Tour.** `placeTour`: compute the room above and below the ring; pick
   the side with more room (or below when the box fits there); set the box's
   `max-height` to that room so `.tour-bd` (already the flex column's
   scrolling child) scrolls; then place. When even the larger side cannot
   hold the box's fixed parts plus one body line, shorten the ring for a
   tall anchor (the `#timeline` cap) and/or have `tourGo` scroll a
   non-fixed anchor to whichever edge leaves the most room (below the sticky
   `.bar`). At large text the step dots may hide (`aria-hidden` decoration;
   "Step N of 7" says the same) so Skip and Next share one row.

## Proof

| Seam | Covers |
| --- | --- |
| New smoke row (`scripts/smoke/short-phone.mjs`), the four cells, long names | 1, 2, 3, 5 |
| `tour-steps.mjs`, `capped` exemption removed | 3 at 390×844 |
| Full `npm run smoke` | 4 |
| `/browser-verify` and `scripts/look.mjs` at 320/390 × 16/32, scrolled to bottom | 1–3 by eye |

Layout and text size are smoke's (AGENTS.md § Test seams); no Coach scenario
is added, since nothing here changes what a coach can do, only how much of
it fits.

## Out of scope

- Who's here row height for very long names (the rows themselves).
- Large-text CSS outside the sheets, bench mode and the tour (#422).
- Changing what the status line says.
- The welcome / first-run and landscape `.bar` height queries, still in px,
  and one general room sweep across every overlay: filed as #429.

## After review

- Bench mode's two height queries (`max-height: 700px` portrait, `560px`
  landscape) were in px, so they never fired at large text. They are now
  `43.75em` and `35em`: the same at a 16px default, and live at 32px. This is
  the same cause as items 1-3 (chrome sized in rem, queries in px), fixed here
  only where it touches bench mode.
- The tour box is never capped below its fixed parts plus one line. Where
  even that does not fit beside the ring, the box stays whole and on screen,
  and Next stays reachable, rather than shrinking to nothing.
- A fifth cell, 568 × 320 at 32px, checks that bench mode's large-text nav
  buttons stay 52 × 52 in landscape.
