/* The card's numbers and rules that more than one file needs, kept in a module
   with no DOM so the build script that draws the chart pages (scripts/charts.mjs)
   reads the same ones the app's fit does, rather than a typed copy. */

/* Two shapes, both cut from one letter sheet: the pocket card two-up across,
   the clipboard half-sheet two-up down the page (2 × 5.1in + the .15in
   gutter is 10.35in, comfortably inside the .25in margins). Everything downstream reads
   these numbers, so the auto-fit and the pagination follow the shape.

   The rest of each entry is the judged prototype's (docs/specs/622-card-redesign/):
   box sizes (`chip*`), the OUT/STAY caps and floors, and the fixed geometry of a
   row. `header`/`key` are the measured heights of the header and the key line;
   `strip` is what a two-line (pocket) or one-line (half) minutes strip adds. */
export const CARD_SIZES = {
  // oppPx/whenPx/markPx must match `.card-hd .opp` / `.when` / `.card-mark`
  // in card.css (and their `.card.half` overrides): the header elision is
  // measured from them, so a mismatch elides at the wrong width.
  pocket: {
    w: 3.45, h: 5.0, padX: 9, padTop: 7, padBot: 5, header: 27, key: 15, strip: 20, minRow: 44,
    oppPx: 15, whenPx: 11, markPx: 8.5,
    tick: 13, tCol: 38, tH: 29, colGap: 6, rowPad: 5, midPadR: 0,
    chip: 19, chipMin: 13, chipPadY: 3, padFew: 5, padBig: 4, gapFew: 6, gapBig: 5, chipsPadR: 6, rowGap: 3,
    o: 13, oMin: 11, oCap: 0.8, s: 12, sMin: 10.5, sCap: 0.74, st: 16, stMin: 12, minO: 11, minS: 10.5, minB: 10.5,
    ebH: 9.5, ebMb: 2, tagPx: 9, tagH: 14.5, tagMin: 31, tagGap: 4, subTop: 4, stackGap: 0, txtLs: -0.01, ws: 0.15, stripPx: 7, stripLh: 8.5,
  },
  half: {
    w: 8.0, h: 5.1, padX: 16, padTop: 10, padBot: 6, header: 37, key: 19, strip: 14, minRow: 50,
    oppPx: 24, whenPx: 16, markPx: 11,
    tick: 20, tCol: 104, tH: 26, colGap: 12, rowPad: 6, midPadR: 16, rwLo: 205, rwHi: 230,
    chip: 28, chipMin: 16, chipPadY: 4, padFew: 9, padBig: 7, gapFew: 10, gapBig: 7, chipsPadR: 0, rowGap: 4,
    o: 17, oMin: 14, oCap: 0.72, s: 15.5, sMin: 13.5, sCap: 0.66, st: 21, stMin: 15, minO: 14, minS: 13, minB: 14,
    ebH: 13, ebMb: 3, tagPx: 12, tagH: 19, tagMin: 52, tagGap: 8, subTop: 0, stackGap: 3, txtLs: 0, ws: 0.3, stripPx: 9, stripLh: 11,
  },
};
export const KEY_LINE = 'BLACK BOX = send in · tick the box as you sub';

/* A row sending in this many kids gets the smaller "big" boxes. */
const BIG_ROW = 4;
export const isBigRow = ins => ins >= BIG_ROW;

/* A row with no sub has nothing to say: it is not printed (the first row, the
   starting five, always is). Dropped before paginating, so the period rule
   lands on the first row that is. */
export const printable = stints => stints.filter(s => s.index === 0 || s.in.length > 0);

