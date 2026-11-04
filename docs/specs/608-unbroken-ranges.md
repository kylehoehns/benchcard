# #608 brief: number ranges on the chart pages stay on one line

Small lane, light review. The issue and this brief are the record.

**Issue** -- #608: at 390px wide and 16px text, the 6-player chart page's intro
paragraph (`p.lede`) breaks "24–28" after the dash, so a reader sees "24–" at
the end of one line and "28" on the next.

**Cause** -- the browser may break a line right after an en dash (Unicode line
breaking puts "–" in the break-after class). The lede text comes from
`facts(plan).minutes` in `scripts/charts.mjs`, which writes `${lo}–${hi}`.

**Fix** -- in the generator, the page body (the lede and the figcaption) writes
a WORD JOINER (U+2060, as the entity `&#8288;`) right after any en dash that
sits between two digits. A word joiner is invisible and forbids a break at that
spot. No break is allowed before an en dash anyway, so one joiner after it is
enough. The `<meta>`/Open Graph/JSON-LD descriptions keep the plain "24–28":
they are never laid out, and a crawler should read the plain text.

Choice not decided by the issue: a word joiner rather than a
`<span>` with `white-space: nowrap`. It needs no new CSS and no markup inside
`esc()`'d text, and covers every range the copy will ever print.

## Acceptance values and the seam that tests each

| Value | Seam |
| --- | --- |
| Every lede and figcaption on all eight chart pages has no en dash between digits that is not followed by `&#8288;` (6, 7, 9, 11, 12-player pages have ranges today) | `test/charts.test.js`, over `pages()` |
| The 6-player lede reads `24–&#8288;28 minutes each` | `test/charts.test.js` |
| The meta, og and twitter descriptions still read the plain `24–28` | `test/charts.test.js` |
| `scripts/look.mjs` reports no finding on the seven chart pages and the two-halves page at 390px, 16px (and is checked at 320/390, 16/32, top and bottom) | `/browser-verify` step by the lane, through `ci-slot.sh` |
| Changed pages' `<lastmod>` in `app/sitemap.xml` moves to 2026-11-04 | `npm run check:history` |

No coach note: a line-break fix on the public chart pages; the words and
numbers a reader sees are unchanged.

## Added during the look check: the footer email

At 32px text (320 and 390 wide), look.mjs also found the chart pages' footer
link `hello@benchcard.app` split mid-word ("hello@benchcard.ap" / "p"). That is
older than this change, and the issue's done line (390px, 16px) does not cover
it. It is the same kind of defect on the same pages, and about.html already
fixed it (#283) with `hello@<wbr>benchcard.app`, so the chart footer reuses
that exact markup: the link may break after the `@` and nowhere else.

| Value | Seam |
| --- | --- |
| Every chart page's footer mail link text is `hello@<wbr>benchcard.app`, the same as about.html's | `test/charts.test.js`, over `pages()` |
| look.mjs reports no finding on the eight pages at 320/390, 16/32, top and bottom | `/browser-verify` step by the lane |
| All eight pages' `<lastmod>` move to 2026-11-04 | `npm run check:history` |
