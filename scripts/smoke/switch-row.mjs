import { evalIn } from './dom.mjs';

/* #221: at a 320px/32px root a switch row's label can need more width than
 * the row's one-line layout leaves it once the switch's own fixed-width box
 * is subtracted -- `.prow-t`'s general rule (app.css) shrinks to make room
 * (`min-width: 0`) rather than wrapping the row itself, so the label's text
 * wraps inside that squeezed box and paints under the switch beside it.
 *
 * Selected STRUCTURALLY (`label.prow` containing an `input[switch]`), not by
 * the class the fix adds -- this probe finds every switch row on today's
 * tree, before `.prow-toggle` exists, and keeps finding the same rows once it
 * does. Not scoped to one sheet's markup (`.bsheet[open]` vs `.flow[open]`
 * differ), for the same reason: `switchRow` (rules.js) is one builder shared
 * by the Plan sheet and the Add-a-game flow, and `#sheetCard` has its own
 * hand-authored row -- one query serves all three homes.
 *
 * `checkVisibility` keeps a closed sheet's own switch row (still in the DOM,
 * `display: none` up its ancestor chain) from being counted or measured; its
 * `getBoundingClientRect()` would otherwise report a real but meaningless
 * zero box.
 *
 * The label's own text is measured with a `Range` over `.prow-t`'s contents,
 * not the element's own `getBoundingClientRect()` -- CSS overflow never
 * changes an element's own rect (the same reason `row-stack.mjs`'s
 * `WORD_RECTS_FN` exists), so comparing the box to itself would report clean
 * even while wrapped text paints past its right edge. */
export const SWITCH_ROW_PROBE = `(() => {
  const vis = el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  const rows = [...document.querySelectorAll('label.prow')]
    .filter(row => row.querySelector('input[switch]') && vis(row));
  let overflow = null, overlap = null, misaligned = null;
  for (const row of rows) {
    const label = row.querySelector('.prow-t');
    const input = row.querySelector('input[switch]');
    if (!label || !input) continue;
    const text = label.textContent.trim();
    const labelBox = label.getBoundingClientRect();
    const inputBox = input.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(label);
    const rects = [...range.getClientRects()];
    const worstRight = rects.reduce((m, r) => Math.max(m, r.right), 0);
    if (!overflow && worstRight > labelBox.right + 1) {
      overflow = { label: text, right: Math.round(worstRight), box: Math.round(labelBox.right) };
    }
    if (!overlap && rects.some(r => r.left < inputBox.right && r.right > inputBox.left
        && r.top < inputBox.bottom && r.bottom > inputBox.top)) {
      overlap = { label: text };
    }
    const cs = getComputedStyle(row);
    const rowContentRight = row.getBoundingClientRect().right
      - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    if (!misaligned && Math.abs(inputBox.right - rowContentRight) > 1) {
      misaligned = { label: text, inputRight: Math.round(inputBox.right), rowRight: Math.round(rowContentRight) };
    }
  }
  return JSON.stringify({ rows: rows.length, overflow, overlap, misaligned });
})()`;

// The one problem line `app-large-text.mjs` reports for a `SWITCH_ROW_PROBE`
// result, kept here rather than there for the same byte-ceiling reason
// `row-stack.mjs`'s own `rowStackMessage` is. `null` means nothing was wrong.
export function switchRowMessage(r, requireRows) {
  if (requireRows && !r.rows) return 'no switch row on screen -- nothing was measured';
  if (r.overflow) return `"${r.overflow.label}" paints to ${r.overflow.right}px, past its own box's ${r.overflow.box}px right edge`;
  if (r.overlap) return `"${r.overlap.label}"'s text overlaps the switch`;
  if (r.misaligned) return `"${r.misaligned.label}"'s switch right edge is at ${r.misaligned.inputRight}px, not the row's ${r.misaligned.rowRight}px`;
  return null;
}

/* #221's own two named states (Plan sheet, Add a game step 3) get rule 2a: if
 * the sheet never opened, or `switchRow`'s markup changed shape, `rows === 0`
 * fails the state instead of quietly measuring nothing. Every other state in
 * `app-large-text.mjs`'s list legitimately has no switch row on screen, so
 * `requireRows` is false there and 0 rows is not a problem. */
export const SWITCH_ROW_STATES = new Set(['plan sheet', 'add a game, step 3']);

export async function switchRowProblem(c, requireRows) {
  const r = JSON.parse(await evalIn(c, SWITCH_ROW_PROBE));
  return switchRowMessage(r, requireRows);
}
