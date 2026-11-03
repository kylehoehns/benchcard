/* #159's own guard (docs/specs/159-platoon-undo.md's Proof section): removing
 * a unit in the Platoon editor acts at once and offers Undo, the way "Remove
 * rule" does (rule-edit.mjs item 7) -- items 1 to 4 of "What would settle
 * it", driven with real taps on RICH's own Hawks game. Expected values are
 * the spec's own literals (the three seeded units, "Removed group 2.") and
 * `RICH`'s own player names (fixtures.mjs), never recomputed the way
 * `platoonEditor`/`pickFive` build them. Item 5 (existing tests/rows
 * unchanged) is covered by `test/button-names.test.js`,
 * `test/one-control-each.test.js` and the `plan sheet` row -- nothing here
 * repeats them. Leaves the Hawks game back at `even` with no units, the way
 * `plan-sheet.mjs` and `rotation-undo.mjs` both restore what they seeded. */
import { evalIn } from './dom.mjs';
import { evalJSON, tap, setGame, readToastExpr } from './sheet-drive.mjs';

const SEED_UNITS = `
  const g = s.game();
  g.strategy = 'platoon';
  g.constraints.units = [['p0','p1','p2','p3','p4'], ['p5','p6','p7','p8','p9'], ['p10']];
`;

const CLEAR_UNITS = `s.game().strategy = 'even'; s.game().constraints.units = [];`;

const headersExpr = `[...document.querySelectorAll('#stratbody .pgrp-h')].map(h => h.textContent)`;
const removeRowsExpr = `[...document.querySelectorAll('#stratbody .prow')].filter(b => b.textContent.startsWith('Remove group'))`;
const unitsExpr = `(async () => JSON.stringify((await import('/state.js')).game().constraints.units))()`;
const sheetOpenExpr = `JSON.stringify(document.getElementById('sheetPlan')?.open)`;

const readToast = readToastExpr('#sheetPlan');

export async function platoonUndoPass(c, origin, rec) {
  const notes = [];

  try {
    /* ---- seed: platoon, three units, the Plan sheet open on strategy ---- */
    await evalIn(c, setGame(SEED_UNITS));
    await tap(c, `document.getElementById('phraseStrategy').click()`);

    /* ---- item 1 ---- */
    const opened = await evalJSON(c, `JSON.stringify({
      headers: ${headersExpr},
      removeRows: ${removeRowsExpr}.map(b => b.textContent),
    })`);
    rec.check(JSON.stringify(opened.headers) === JSON.stringify(['Group 1', 'Group 2', 'Group 3']),
      `item 1: #stratbody's headers read ${JSON.stringify(opened.headers)}, want ["Group 1","Group 2","Group 3"]`);
    rec.check(JSON.stringify(opened.removeRows) === JSON.stringify(['Remove group 1', 'Remove group 2', 'Remove group 3']),
      `item 1: #stratbody's remove rows read ${JSON.stringify(opened.removeRows)}, want the three "Remove group N" rows`);

    /* ---- item 2: tap "Remove group 2" ---- */
    await tap(c, `${removeRowsExpr}[1].click()`);
    const unitsAfterRemove = await evalJSON(c, unitsExpr);
    rec.check(JSON.stringify(unitsAfterRemove) === JSON.stringify([['p0', 'p1', 'p2', 'p3', 'p4'], ['p10']]),
      `item 2: game().constraints.units is ${JSON.stringify(unitsAfterRemove)}, want [["p0","p1","p2","p3","p4"],["p10"]]`);
    const headersAfterRemove = await evalJSON(c, `JSON.stringify(${headersExpr})`);
    rec.check(JSON.stringify(headersAfterRemove) === JSON.stringify(['Group 1', 'Group 2']),
      `item 2: #stratbody's headers read ${JSON.stringify(headersAfterRemove)}, want ["Group 1","Group 2"]`);
    const toastAfterRemove = await evalJSON(c, readToast);
    rec.check(toastAfterRemove.shown && toastAfterRemove.text === 'Removed group 2.' && toastAfterRemove.hasUndo && toastAfterRemove.insideSheet,
      `item 2: the toast reads ${JSON.stringify(toastAfterRemove)}, want exactly "Removed group 2." with Undo, inside #sheetPlan`);
    const sheetOpenAfterRemove = await evalJSON(c, sheetOpenExpr);
    rec.check(sheetOpenAfterRemove === true, `item 2: #sheetPlan.open is ${sheetOpenAfterRemove} after Remove group 2, want true`);
    notes.push('item 2: removing unit 2 leaves units [[p0..p4],[p10]], two headers, and "Removed group 2." with Undo inside #sheetPlan');

    /* ---- item 3: tap that toast's Undo ---- */
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    const unitsAfterUndo = await evalJSON(c, unitsExpr);
    rec.check(JSON.stringify(unitsAfterUndo) === JSON.stringify([['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8', 'p9'], ['p10']]),
      `item 3: game().constraints.units is ${JSON.stringify(unitsAfterUndo)} after Undo, want the original three units`);
    const headersAfterUndo = await evalJSON(c, `JSON.stringify(${headersExpr})`);
    rec.check(JSON.stringify(headersAfterUndo) === JSON.stringify(['Group 1', 'Group 2', 'Group 3']),
      `item 3: #stratbody's headers read ${JSON.stringify(headersAfterUndo)} after Undo, want the three headers again`);
    const unit2Labels = await evalJSON(c, `JSON.stringify([...[...document.querySelectorAll('#stratbody .pgrp')][1]
      .querySelectorAll('.plr[aria-pressed="true"]')].map(b => b.getAttribute('aria-label')).sort())`);
    rec.check(JSON.stringify(unit2Labels) === JSON.stringify(['Casey Lindqvist', 'Jordan Bell', 'Riley Novak', 'Sam Okafor', 'Theo Alvarez']),
      `item 3: unit 2's picker shows ${JSON.stringify(unit2Labels)} pressed, want p5..p9's names (Jordan Bell, Sam Okafor, Riley Novak, Casey Lindqvist, Theo Alvarez)`);
    const toastAfterUndo = await evalJSON(c, readToast);
    rec.check(!toastAfterUndo.shown, `item 3: a toast is still up after Undo (${JSON.stringify(toastAfterUndo)})`);
    const sheetOpenAfterUndo = await evalJSON(c, sheetOpenExpr);
    rec.check(sheetOpenAfterUndo === true, `item 3: #sheetPlan.open is ${sheetOpenAfterUndo} after Undo, want true`);
    notes.push("item 3: Undo restores the original three units in order, unit 2's own five players pressed, no live toast, #sheetPlan still open");

    /* ---- item 4: another edit retires the Undo toast (through edit()) ---- */
    await tap(c, `${removeRowsExpr}[1].click()`);
    const toastBeforeOtherEdit = await evalJSON(c, readToast);
    rec.check(toastBeforeOtherEdit.shown, `item 4: no toast is up before the other edit (${JSON.stringify(toastBeforeOtherEdit)})`);
    await tap(c, `document.querySelector('#stratbody .pgrp .plr')?.click()`);
    const toastAfterOtherEdit = await evalJSON(c, readToast);
    rec.check(!toastAfterOtherEdit.shown, `item 4: the Undo toast is still up after tapping a player tile (${JSON.stringify(toastAfterOtherEdit)}), want retireUndo (through edit()) to have cleared it`);
    notes.push('item 4: tapping a player tile after a remove retires the Undo toast, the existing retireUndo behavior through edit()');
  } finally {
    await tap(c, `document.getElementById('sheetPlanClose')?.click()`).catch(() => {});
    await evalIn(c, setGame(CLEAR_UNITS)).catch(() => {});
  }

  rec.ok(notes.join('; '));
}
