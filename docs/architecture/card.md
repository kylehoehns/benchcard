# Card

3.45 x 5.0 in by default, tiled on letter with dashed cut lines, sized to tuck
in a pocket Moleskine (there is a wider Half sheet variant too, below). Type is auto-fitted: the widest lineup row is measured and the card
scales to fill its width, so short first names print bigger for free. Everything
is sized in inches, so screen CSS pixels (96/in) map 1:1 to print.

- The change line carries **OUT only**. The incoming players are already printed
  in the lineup directly below it, so listing them twice was costing about half
  the line's width and forcing it down to 7pt. Incoming players are underlined
  in the lineup instead.
- **12pt is a hard floor for names.** Past roughly 13 stints the game is split
  across two cards, broken on period boundaries, rather than shrunk to fit.
- **The card also leaves as a PNG.** Printing needs a printer; "text me your
  rotation" is how a card actually reaches another coach, and that is the whole
  word-of-mouth story for an app nobody advertises. `share.js` clones the
  card into an offscreen host (outside `#sheet`, so the preview's `--cardzoom`
  is unset and every rect is a real 96dpi print pixel), walks it, and paints
  each leaf's text and each horizontal rule onto a 3x canvas — no library, and
  no `foreignObject`, which cannot see the vendored Inter without inlining the
  whole woff2. Then `navigator.share({files})` where it exists, the clipboard
  where it does not, a download where neither does. The whole path from tap to
  `share()` is synchronous, including a hand-rolled `toDataURL` decode instead
  of `toBlob`: `navigator.share` needs transient activation, and an `await` in
  front of it loses that on iOS — the platform the feature exists for.

- **Two shapes, same card.** `ui.cardSize` picks `pocket` (3.45 x 5.0 in, two
  across a letter sheet) or `half` (8 x 5.1 in, two down it) for coaches who
  carry a clipboard instead of a notebook. Both are cut from one letter page
  inside the .25in `@page` margin. `CARD_SIZES` in `card.js` holds the width,
  height, padding, header/footer allowance and the name-size floor and ceiling
  for each; the auto-fit and `paginate()` read them, so the Half sheet gets
  bigger type (up to 44px) rather than the same type with more air. The
  preview is laid out at true print size and shrunk to the column with
  `zoom` (reset to 1 in print), so an 8in card still fits a phone.

- **The Half sheet takes a second column of stints once one will not hold
  them.** It was height-bound and width-unbound — its width-fit ceiling
  (44.96px) sat *above* its own 44px `maxName`, so the extra width bought
  nothing at all and the bigger sheet held **9 stints against the pocket
  card's 12**, telling the coach to sub less often. `columnsFor` in `card.js`
  splits the rows into two `.stintcols` columns past that point, which takes
  the Half sheet to **18 stints on one piece of paper** at ~21px names —
  still a third larger than the pocket card's ~16.6px. Deliberately *not*
  unconditional: below one column's worth the sheet is byte-identical to what
  it always was, because two columns on a card that already fits would shrink
  an 8-stint sheet from 23.7px to 22px and make it "merely wider" — which is
  the thing the shape exists to avoid. The `minName` floor stays at **20**; it
  never binds below twenty stints, so there was nothing to relax. Every
  measurement (`widthFit`, `heightFit`, `chgSize`) is per column, so the
  one-column path is arithmetically the same code it was before.
