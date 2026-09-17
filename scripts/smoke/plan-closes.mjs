import { evalIn, WIDTH, HEIGHT } from './dom.mjs';
import { evalJSON, click, closedWithFocus, drag, flick, ringGivenBack, resizeCheck, settle, sheetRect, tap, tapPane } from './sheet-drive.mjs';

/* #28 item 10 and #73 item 20: how the Plan sheet closes and resizes, split
 * out of `plan-sheet.mjs` when that file reached the 40,000-byte ceiling
 * `test/smoke-size.test.js` guards. Every way out of the sheet -- the back
 * button, the backdrop, a drag, a flick -- plus the handle's half/full toggle
 * and the one-sheet-at-a-time rule.
 *
 * Runs inside `planSheetPass`'s try block, sharing its `ck`, and starts and
 * ends on the Hawks game with no sheet open. */
export async function planClosePass(c, ck) {
  await tap(c, `document.getElementById('phraseStrategy').click()`);
  await evalIn(c, `history.back()`);
  await settle(c);
  const historyBack = await evalJSON(c, `JSON.stringify({
    openDialogs: [...document.querySelectorAll('dialog[open]')].length,
  })`);
  ck(historyBack.openDialogs === 0, `${historyBack.openDialogs} dialog(s) still open after history.back()`);

  // history.back() lands on Today for real -- back to Hawks before continuing.
  await tap(c, `document.querySelectorAll('.today-game')[0].click()`);
  await tap(c, `document.getElementById('phraseStrategy').click()`);
  await click(c, WIDTH / 2, 10);
  let r20 = await closedWithFocus(c, '#sheetPlan', '#phraseStrategy');
  ck(r20.closed, 'backdrop click did not close #sheetPlan within the slide');
  ck(r20.focusBack, 'focus not back on #phraseStrategy after a backdrop close');
  ck(r20.noring, 'the phrase has no data-noring after a backdrop close, so Safari would draw a ring on it');

  await tap(c, `document.getElementById('phraseStrategy').click()`);
  let rect = await sheetRect(c, '#sheetPlan');
  if (ck(!!rect.handle, '#sheetPlan has no .bsheet-handle to drag')) {
    await drag(c, rect.handle.x, rect.handle.y, rect.handle.y + rect.height * 0.4);
    r20 = await closedWithFocus(c, '#sheetPlan', '#phraseStrategy');
    ck(r20.closed, '40%-height drag did not close #sheetPlan within the slide');
    ck(r20.focusBack, 'focus not back on #phraseStrategy after a drag close');
    // The reported bug: sliding the sheet shut with a finger left a box drawn
    // around the phrase, while the ✕ did not. Focus still goes back to the
    // phrase; only the drawn ring is held off, and only for this one close.
    ck(r20.noring, 'the phrase has no data-noring after a drag close, so Safari would draw a ring on it');
    await ringGivenBack(c, ck, '#sheetPlan', '#phraseStrategy',
      () => tap(c, `document.getElementById('phraseStrategy').click()`));
  }

  // item 20: a flick closes the whole sheet even from a pushed pane.
  await tap(c, `document.getElementById('phraseRules').click()`);
  await tapPane(c, `document.querySelector('#constraints .add-rule').click()`);
  rect = await sheetRect(c, '#sheetPlan');
  if (ck(!!rect.handle, '#sheetPlan has no .bsheet-handle to flick')) {
    await flick(c, rect.handle.x, rect.handle.y, rect.handle.y + rect.height * 0.15);
    r20 = await closedWithFocus(c, '#sheetPlan', '#phraseRules');
    ck(r20.closed, 'flick from Add-a-rule did not close #sheetPlan within the slide');
    ck(r20.focusBack, 'focus not back on #phraseRules after a flick close');
  }

  // the handle toggles half and full.
  await tap(c, `document.getElementById('phraseStrategy').click()`);
  await resizeCheck(c, '#sheetPlan', ck, top => Math.abs(top - HEIGHT * 0.5) <= HEIGHT * 0.05);

  // one sheet at a time.
  await tap(c, `document.getElementById('phrasePlayers').click()`);
  const oneOpen = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('dialog[open]')].map(d => d.id))`);
  ck(oneOpen.length === 1 && oneOpen[0] === 'sheetWho',
    `opening Who's here while the Plan sheet was open left ${JSON.stringify(oneOpen)} open, want exactly ["sheetWho"]`);
  await tap(c, `document.getElementById('sheetWhoClose').click()`);
}
