import { LONG_NAME } from './fixtures.mjs';
import { evalIn } from './dom.mjs';

/* #143 fix pass: a `.prow` row that carries a badge and/or a trailing check
 * (or "Absent") has to keep all of its own parts sharing one line at a 320px/
 * 32px root -- the name may still wrap across several lines inside its own
 * box, but the badge and the check must not fall to a physically separate
 * line. `whoRow` (game-setup.js) measured 236px, with the badge on its own
 * line above the name and the check on a third line below it, before this
 * fix -- `.rrow`'s `flex-wrap: wrap` and
 * `.rrow .prow-t { min-width: min-content }`, right for Team's roster (the
 * page scrolls) but not for a sheet whose own body is half the screen (the
 * cause the spec names). Run only against the sheets whose rows carry a
 * badge or a trailing mark (`ROW_STACK_STATES` below) -- Plan and the card
 * sheet are out of this ticket's surface. "Share one line" is read as
 * "overlap vertically" rather than a pixel-equal baseline, since the name's
 * own box may be taller than the badge/check when it wraps.
 *
 * Its own module, not inlined in `app-large-text.mjs`: that file already sat
 * a few bytes under `test/smoke-size.test.js`'s 40,000-byte ceiling for a
 * check module, and this probe plus its own comment pushed it over. */
// #143 fix pass: a long unbreakable word inside `.prow-t` overflows its own
// box without widening it -- CSS overflow never changes an element's own
// `getBoundingClientRect` (the fact `OVERFLOW_PROBE`'s own comment in
// dom.mjs names for `dialog.bsheet`'s clipping), so comparing the box's own
// rect to anything reports clean even while `.pgrp`'s `overflow: hidden` is
// cutting a word off mid-letter. A `Range` per word -- the same technique
// `add-game-fit.mjs` already uses for the add-game roster tiles -- measures
// what the browser actually painted instead, both for "did a word get cut
// off" (its right edge past the clipping ancestor) and for "did the check
// land on top of the name" (its box intersecting the mark's box in both
// dimensions, not just sharing a line the way `overlapProblem` above wants).
// #143 CI fix pass: `rectsN` -- `Range.getClientRects().length` for the
// word's own range -- is what tells "wrapped onto the next line whole" (1
// rect) apart from "broken mid-word onto two lines" (2+ rects): a `Range`'s
// `getBoundingClientRect()` merges every fragment into one box either way, so
// it alone cannot see a break the deployed preview's screenshot showed with
// its own eyes ("Marcus / William / s"). Both are read off the same `Range`
// so there is only one pass over the name's text per row.
const WORD_RECTS_FN = `function wordRects(nameEl) {
    const out = [];
    const walker = document.createTreeWalker(nameEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const w of n.data.matchAll(/\\S+/g)) {
        const r = document.createRange();
        r.setStart(n, w.index);
        r.setEnd(n, w.index + w[0].length);
        out.push({ word: w[0], rect: r.getBoundingClientRect(), rectsN: r.getClientRects().length });
      }
    }
    return out;
  }`;

export const ROW_STACK_PROBE = `(() => {
  ${WORD_RECTS_FN}
  const rows = [...document.querySelectorAll('.bsheet[open] .prow')];
  let overlapProblem = null, clipProblem = null, checkOverlap = null, splitWord = null;
  for (const row of rows) {
    const parts = [];
    for (const sel of ['.av', '.prow-t', '.prow-check, .prow-v']) {
      const el = row.querySelector(sel);
      if (el) parts.push(el.getBoundingClientRect());
    }
    if (parts.length > 1) {
      const top = Math.max(...parts.map(r => r.top));
      const bottom = Math.min(...parts.map(r => r.bottom));
      if (top >= bottom && !overlapProblem) {
        overlapProblem = parts.map(r => ({ top: Math.round(r.top), bottom: Math.round(r.bottom) }));
      }
    }

    const nameEl = row.querySelector('.prow-t');
    if (nameEl) {
      const words = wordRects(nameEl);
      if (!splitWord) {
        const bad = words.find(w => w.rectsN > 1);
        if (bad) splitWord = { word: bad.word };
      }
      const clipBox = (row.closest('.pgrp') || row).getBoundingClientRect();
      if (!clipProblem) {
        const bad = words.find(w => w.rect.right > clipBox.right + 1);
        if (bad) clipProblem = { word: bad.word, right: Math.round(bad.rect.right), boundary: Math.round(clipBox.right) };
      }
      const markEl = row.querySelector('.prow-check, .prow-v');
      if (markEl && !checkOverlap) {
        const markRect = markEl.getBoundingClientRect();
        const bad = words.find(w => w.rect.left < markRect.right && w.rect.right > markRect.left
          && w.rect.top < markRect.bottom && w.rect.bottom > markRect.top);
        if (bad) {
          checkOverlap = { word: bad.word, wordRight: Math.round(bad.rect.right), markLeft: Math.round(markRect.left) };
        }
      }
    }
  }
  return JSON.stringify({ rows: rows.length, overlapProblem, splitWord, clipProblem, checkOverlap });
})()`;

export const ROW_STACK_STATES = new Set(["who's here sheet", "who's here sheet, long name", 'sub interval sheet', 'format sheet']);

// The one problem line `app-large-text.mjs` reports for a `ROW_STACK_PROBE`
// result, kept here rather than there so its wording does not count against
// that file's own byte ceiling. `null` means nothing was wrong.
//
// #143 CI fix pass: the flat `sheetH / 2` height cap this replaced was a
// proxy that measured neither real defect it was meant to catch -- a
// deployed preview at 320/32 (Linux Chrome fonts, wider than the macOS ones
// this harness runs) had "Marcus Williams" break mid-word ("Marcus /
// William / s") inside a 111px-wide name column, which the cap missed
// because it was never actually the window's own height. `splitWord` (no
// word in an ordinary name splits mid-word) catches that directly. A CI-only
// run later flagged a "wide word" and a "tall row" reading on names and
// descriptions that still fit and still scrolled fine -- both were font-
// metric guesses on real content, not defects -- so neither survived: a
// column-width margin can't tell a wide-but-fitting word from a genuine
// overflow (`clipProblem` already measures the actual paint for that), and a
// row taller than the sheet's own scroll window is normal for a
// legitimately-wrapping description, not a bug, since the row can still be
// scrolled to. `longName` skips `splitWord`: `LONG_NAME` is three long,
// some-hyphenated words seeded on purpose to force wrapping, and its own
// "What would settle it" item 6 asks only for no clipping and no check/name
// overlap, never an unbroken word -- unlike `sub interval sheet` and
// `format sheet`'s and Who's here's own default-fixture names, which stand
// in for what a coach's own roster actually looks like.
export function rowStackMessage(rs, longName) {
  if (!rs.rows) return 'no .prow rows to check';
  if (rs.overlapProblem) return `a row's badge/name/check don't share a line -- ${JSON.stringify(rs.overlapProblem)}`;
  if (!longName && rs.splitWord) return `"${rs.splitWord.word}" splits across lines mid-word`;
  if (rs.clipProblem) return `"${rs.clipProblem.word}" is clipped at ${rs.clipProblem.right}px (boundary ${rs.clipProblem.boundary}px)`;
  if (rs.checkOverlap) return `the check/state mark sits over "${rs.checkOverlap.word}" (word right ${rs.checkOverlap.wordRight}px, mark left ${rs.checkOverlap.markLeft}px)`;
  return null;
}

// #143 fix pass: `LONG_NAME` (fixtures.mjs, already `sheet-spacing.mjs`'s
// long name at 390px) put on the first roster player, through `state.js` +
// `render.js` the same way `sheet-drive.mjs`'s `setGame` mutates the page,
// then opened through Who's here's own trigger. Undone on close so no later
// `app-large-text.mjs` state inherits the rename. Built here, not inlined in
// `app-large-text.mjs`, to stay clear of that file's own byte ceiling.
export const ROW_STACK_LONG_NAME_STATE = {
  name: "who's here sheet, long name",
  open: `const st = await import('/state.js');
         window.__longName143 = st.team().players[0].name;
         st.team().players[0].name = ${JSON.stringify(LONG_NAME)};
         (await import('/render.js')).renderAll();
         $('.today-game').click(); $('#phrasePlayers').click()`,
  close: `$('#sheetWho').close(); $('#backBtn').click();
          const st = await import('/state.js');
          st.team().players[0].name = window.__longName143;
          (await import('/render.js')).renderAll();`,
};

/* The large-text sweep's call: run the probe in the open state and return
   rowStackMessage's problem, or null. */
export async function rowStackProblem(c, name) {
  const rs = JSON.parse(await evalIn(c, ROW_STACK_PROBE));
  return rowStackMessage(rs, name === ROW_STACK_LONG_NAME_STATE.name);
}
