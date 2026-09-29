/* #199: the demo plan's stint bars on the welcome screen, at a 320px/32px
 * root. `renderDemo` (onboarding.js) builds one `.wel-row` per demo player
 * under `#welRows`, each holding an `.wel-nm` name, an `.wel-track` of eight
 * `.wel-c` cells, and an `.wel-min` minutes figure. Side by side, the track
 * got whatever the name and minutes columns left over -- 0 to 0.78px per
 * cell at this size (the spec's Survey) -- so the plan showed names and
 * minutes but no bars. This probe reads the boxes the browser actually
 * painted and fails on a cell too thin to see, an overlap between a row's
 * own name and track, or a track that runs into the next row or past
 * `.wel-show`'s own clip.
 *
 * Its own module, not inlined in `app-large-text.mjs`: that file is already
 * ~47 KB against `test/smoke-size.test.js`'s ceiling, the same reason
 * `row-stack.mjs` (whose per-word `Range` technique this does not need) got
 * its own file. */
import { evalIn } from './dom.mjs';

/* rule 2a of /new-guard: a selector that stops matching has to fail rather
 * than pass on nothing, so this counts what it found (rows, and the fewest
 * `.wel-c` any one row carried) before it judges any of it -- it never
 * hard-codes the demo's own row count. */
export const WELCOME_BARS_PROBE = `(() => {
  const rows = [...document.querySelectorAll('#welRows .wel-row')];
  const show = document.querySelector('.wel-show');
  const showRect = show && show.getBoundingClientRect();
  let minCells = Infinity, smallCell = null, overlap = null, trackPastRow = null, trackPastShow = null;
  rows.forEach((row, i) => {
    const cells = [...row.querySelectorAll('.wel-c')];
    minCells = Math.min(minCells, cells.length);
    if (!smallCell) {
      const bad = cells.map(c => c.getBoundingClientRect()).find(r => r.width < 12 || r.height <= 0);
      if (bad) smallCell = { row: i, width: Math.round(bad.width * 100) / 100, height: Math.round(bad.height * 100) / 100 };
    }
    const nameEl = row.querySelector('.wel-nm');
    const trackEl = row.querySelector('.wel-track');
    if (!nameEl || !trackEl) return;
    const nameRect = nameEl.getBoundingClientRect();
    const trackRect = trackEl.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (!overlap && trackRect.top < nameRect.bottom - 0.5) {
      overlap = { row: i, trackTop: Math.round(trackRect.top), nameBottom: Math.round(nameRect.bottom) };
    }
    if (!trackPastRow && trackRect.bottom > rowRect.bottom + 0.5) {
      trackPastRow = { row: i, trackBottom: Math.round(trackRect.bottom), rowBottom: Math.round(rowRect.bottom) };
    }
    if (i === rows.length - 1 && showRect && trackRect.bottom > showRect.bottom + 0.5) {
      trackPastShow = { trackBottom: Math.round(trackRect.bottom), showBottom: Math.round(showRect.bottom) };
    }
  });
  return JSON.stringify({ rows: rows.length, minCells: minCells === Infinity ? 0 : minCells,
    smallCell, overlap, trackPastRow, trackPastShow });
})()`;

// The one problem line `app-large-text.mjs` reports for a `WELCOME_BARS_PROBE`
// result, kept here rather than there for the same byte-ceiling reason
// `rowStackMessage` lives in `row-stack.mjs`. `null` means nothing was wrong.
export function welcomeBarsMessage(wb) {
  if (!wb.rows) return 'no #welRows .wel-row to check';
  if (wb.minCells < 8) return `a .wel-row has only ${wb.minCells} .wel-c cell(s), expected 8`;
  if (wb.smallCell) {
    return `row ${wb.smallCell.row}'s stint cell is ${wb.smallCell.width}px wide, `
      + `${wb.smallCell.height}px tall (need >=12px wide, >0px tall)`;
  }
  if (wb.overlap) {
    return `row ${wb.overlap.row}'s track starts at y ${wb.overlap.trackTop}, `
      + `above its own name's bottom at y ${wb.overlap.nameBottom}`;
  }
  if (wb.trackPastRow) {
    return `row ${wb.trackPastRow.row}'s track ends at y ${wb.trackPastRow.trackBottom}, `
      + `past its own row's bottom at y ${wb.trackPastRow.rowBottom}`;
  }
  if (wb.trackPastShow) {
    return `the last row's track ends at y ${wb.trackPastShow.trackBottom}, `
      + `past .wel-show's own bottom at y ${wb.trackPastShow.showBottom}`;
  }
  return null;
}

/* The large-text sweep's call: run the probe in the open state and return
   welcomeBarsMessage's problem, or null. */
export async function welcomeBarsProblem(c) {
  const wb = JSON.parse(await evalIn(c, WELCOME_BARS_PROBE));
  return welcomeBarsMessage(wb);
}
