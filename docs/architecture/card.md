# Card

3.45 x 5.0 in by default, tiled on letter with dashed cut lines, sized to tuck
in a pocket Moleskine (there is a wider Half sheet variant too, below). Type is
auto-fitted: the rows are measured and the fit picks box and text sizes that
fill the width, so short first names print bigger for free. Everything
is sized in inches, so screen CSS pixels (96/in) map 1:1 to print.

- **Rows are the card.** One row per printed sub. Left to right: an empty tick
  box to tick when you make the sub; the period name over the clock (`Q2` over
  `4:00`; overtime prints its `periodName`, `OT`); the kids going in, each as a
  black box with white text; an outlined `OUT` tag followed by the names coming
  off, or `ALL 5` when all five come off; an outlined `STAY` tag followed by the
  names who stay on. A thick rule above a row starts a new period, and a thin
  rule marks a sub within one.
- **The first row is the starting five.** It prints `STARTING FIVE` over the five
  names, and a `BENCH` tag with the rest of the roster. Page 2 of a two-card game
  starts with an ordinary sub row, because the first row is picked by stint
  index, not by page.
- **No-sub stints have no row.** A stint where nobody goes in, other than the
  first, is dropped before pagination (`printable` in `card.js`). The period rule
  still goes above the first printed row of each period.
- **The footer is the key line.** Every card prints `BLACK BOX = send in · tick
  the box as you sub`. When Settings shows minutes (`state.ui.showMinutes`), the
  per-kid minutes strip prints under it.
- **Jersey numbers.** With the card set to numbers (`state.ui.cardId === 'number'`),
  `labelsFor` swaps every name for its number, so the boxes, OUT, STAY, the
  starters and BENCH all print numbers.
- **Paper.** The card is `#000` on `#fff` in both themes, with no grays for names.

## The fit

`buildCard` hands the rows to `fitCard` (in `card.js`) before anything goes in
the DOM. The decisions are a port of the judged prototype's
(`docs/specs/622-card-redesign/prototype.mjs`; the spec is
`docs/specs/622-card-redesign.md`). Widths come from canvas `measureText`
(`widthAt`), not from DOM measuring, because `#sheet` can be hidden and the
previews are clones that are never fitted. The numbers it works from are the
`CARD_SIZES` entries.

- **Box sizes, per tier.** Rows sending in 1-3 kids share one box size. Rows
  sending in 4-5 share another, which is never under 85% of the first. Boxes
  shrink in 0.5px steps down to a floor (`chipMin`: 13px pocket, 16px half)
  before a row wraps. A row that still overflows wraps after `ceil(n/2)` boxes,
  so five boxes split 3 + 2.
- **OUT and STAY.** OUT is capped at a fraction of its row's box size (`oCap`),
  and STAY at a smaller one (`sCap`), and both are clamped to their own floors.
  OUT is weight 800, STAY weight 600, both black.
- **Pocket: one line or no STAY.** OUT and STAY share one line under the boxes.
  If any row can't fit both, even with both shrunk to their floors, STAY is
  dropped from **every** row of that card (the `nostay` class hides it). OUT is
  never dropped.
- **Half sheet: four columns.** The columns are tick, time, boxes, then OUT over
  STAY. The OUT/STAY column is as wide as its longest line plus the tag, clamped
  to 205-230px (`rwLo`, `rwHi`). The boxes get the rest of the width.
- **Height.** The time column never shrinks. When a card is too tall, the boxes
  shrink first, up to 5px in 0.5px steps. Then the row padding drops to 3px.
  Only then does the names area scale, down to 0.8.
- **Lineup row.** The starting five and the BENCH line size and wrap the same way,
  with their own floors.

The `CARD_SIZES` comment says which CSS values must match the fit's numbers
(`oppPx`, `whenPx`, `markPx` and the rest). Change them together. The fit's
visual results are checked by the `cardlayout` smoke check
(`scripts/smoke/card-layout.mjs`), which renders the four reference games at
both sizes.

## Long games split by period

A card holds the rows that fit at the minimum row height (`minRow`: 44px pocket,
50px half). `rowsPerCard` works that out from the list height, and reserves a
fixed strip height when minutes are on. A game with more rows than that splits
across cards by period, using `paginate`'s rule. The Half sheet does not get a
second column; it is one column at both sizes.

## The Half sheet

`ui.cardSize` picks `pocket` (3.45 x 5.0 in, two across a letter sheet) or `half`
(8 x 5.1 in, two down it) for coaches who carry a clipboard instead of a
notebook. Both are cut from one letter page inside the .25in `@page` margin.
`CARD_SIZES` in `card.js` holds each shape's width, height, padding, header and
key heights, the minimum row height, and the box, OUT and STAY sizes and floors.
The auto-fit and `paginate()` read them. The preview is laid out at true print
size and shrunk to the column with `zoom` (reset to 1 in print), so an 8in card
still fits a phone.

## Shared PNG

The card also leaves as a PNG. Printing needs a printer; "text me your
rotation" is how a card actually reaches another coach, and that is the whole
word-of-mouth story for an app nobody advertises. In the iOS Home Screen app,
where `window.print()` does nothing, this PNG is also how the card gets printed
(see [interface.md](interface.md)). `share.js` clones the card into an offscreen
host (outside `#sheet`, so the preview's `--cardzoom` is unset and every rect is
a real 96dpi print pixel), walks it, and paints each leaf's text, and each box's
background fill, borders and outline, onto a 3x canvas. The tick boxes, the
black boxes and the outlined tags are drawn that way. No library, and no
`foreignObject`, which cannot see the vendored Inter without inlining the whole
woff2. Then `navigator.share({files})` where it exists, the clipboard where it
does not, a download where neither does. The whole path from tap to `share()` is
synchronous, including a hand-rolled `toDataURL` decode instead of `toBlob`:
`navigator.share` needs transient activation, and an `await` in front of it
loses that on iOS, the platform the feature exists for.
