import { evalIn, evensOutWant, step, HEIGHT } from './dom.mjs';
import { evalJSON, click, closedWithFocus, settle, settlePane, sheetRect, setGame, statusOk, tap, tapPane, titleFocused, waitClosed } from './sheet-drive.mjs';
import { planClosePass } from './plan-closes.mjs';

/* #28's own guard (docs/specs/28-plan-sheet.md's Proof section), extended by
 * #73 (docs/specs/73-sheet-polish.md) for its own "plan sheet" row: the Plan
 * sheet, its Rules and Lineups groups, the "across the day/season" switches,
 * and #73's focus/close/resize behavior, all driven with real buttons, keys
 * and pointer events. Runs on `RICH`, which lands on the Hawks game already
 * open. State is read from `state.js`'s own exports, never recomputed here.
 *
 * Drive helpers (`evalJSON`..`waitClosed`) live in `sheet-drive.mjs`, shared
 * with #27's `sentence-sheets.mjs`.
 *
 * Leaves Hawks and Ravens as it found them (Even, no rules, `useCarryover`
 * off, balance Steady). */

// item 1: a group header's offset from the scrolling body's top, shared by
// the Rules and "Across the day" scrolled-to-section checks below.
async function headerOffset(c, headerSel) {
  return evalJSON(c, `(() => {
    const hd = document.querySelector(${JSON.stringify(headerSel)});
    const body = document.getElementById('sheetPlanBody');
    if (!hd || !body) return 'null';
    return JSON.stringify(hd.getBoundingClientRect().top - body.getBoundingClientRect().top);
  })()`);
}

export async function planSheetPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    /* ---- item 1: opening ---- */
    // `goRich` already lands on the Hawks game itself (view: 'games',
    // activeGame: 0) -- no `.today-game` row to click first.
    await tap(c, `document.getElementById('phraseStrategy').click()`);

    const rect = await sheetRect(c, '#sheetPlan');
    ck(rect.open, '#sheetPlan did not open on tapping "Plan, even minutes"');
    ck(rect.top <= HEIGHT * 0.15, `#sheetPlan's top edge is ${Math.round(rect.top)}px, want <= 15% of ${HEIGHT}`);
    const tf = await titleFocused(c, 'sheetPlanTitle'); // item 4
    ck(tf.onTitle && !tf.isHandle, 'focus on open is not #sheetPlanTitle');
    const handleName = await evalJSON(c, `JSON.stringify(document.querySelector('#sheetPlan .bsheet-handle')?.getAttribute('aria-label'))`);
    ck(handleName === 'Half height', `the handle reads "${handleName}", want "Half height"`);

    const chrome = await evalJSON(c, `(() => {
      const d = document.getElementById('sheetPlan');
      const h2 = document.getElementById('sheetPlanTitle');
      const dr = d.getBoundingClientRect(), hr = h2.getBoundingClientRect();
      const hd = d.querySelector('.bsheet-hd');
      return JSON.stringify({
        title: h2.textContent,
        centerOff: Math.abs((hr.left + hr.width / 2) - (dr.left + dr.width / 2)),
        radius: getComputedStyle(d).borderTopLeftRadius,
        hdBorder: getComputedStyle(hd).borderBottomWidth,
      });
    })()`);
    ck(chrome.title === 'Plan', `#sheetPlanTitle reads "${chrome.title}", want "Plan"`);
    ck(chrome.centerOff <= 2, `the h2 is ${chrome.centerOff.toFixed(1)}px off the dialog's center, want <= 2px`);
    ck(chrome.radius === '28px', `#sheetPlan's top-left radius is ${chrome.radius}, want 28px`);
    ck(chrome.hdBorder === '0px', `the header's bottom border is ${chrome.hdBorder}, want 0px`);

    const seg = await evalJSON(c, `(() => {
      const bs = [...document.querySelectorAll('#stratseg button')];
      return JSON.stringify({
        labels: bs.map(b => b.textContent),
        pressed: bs.map(b => b.getAttribute('aria-pressed')),
      });
    })()`);
    ck(JSON.stringify(seg.labels) === JSON.stringify(['Even', 'By hand', 'Closers', 'Platoon']),
      `#stratseg reads ${JSON.stringify(seg.labels)}, want ["Even","By hand","Closers","Platoon"]`);
    ck(JSON.stringify(seg.pressed) === JSON.stringify(['true', 'false', 'false', 'false']),
      `#stratseg aria-pressed is ${JSON.stringify(seg.pressed)}, want only "Even" pressed`);

    // Closing (item 10: waits out the slide) returns focus to the trigger.
    await evalIn(c, step(`document.getElementById('sheetPlanClose').click()`));
    const r10 = await closedWithFocus(c, '#sheetPlan', '#phraseStrategy');
    ck(r10.closed, '✕ did not close #sheetPlan within the slide');
    ck(r10.focusBack, 'focus not back on #phraseStrategy after ✕');

    // Rules phrase: same dialog, full height, "Rules" near the top.
    await tap(c, `document.getElementById('phraseRules').click()`);
    const rulesOpen = await sheetRect(c, '#sheetPlan');
    // `.full` is 92vh (app.css), an 8%-of-viewport gap above it -- not 0.
    ck(rulesOpen.top <= HEIGHT * 0.1, `#sheetPlan's top is ${Math.round(rulesOpen.top)}px at "Rules", want <= 10% of ${HEIGHT}`);
    const rulesHdOff = await headerOffset(c, '#constraints .pgrp-h');
    ck(rulesHdOff !== null && Math.abs(rulesHdOff) <= 8,
      `the Rules header sits ${rulesHdOff}px from the scrolling body's top, want within 8px`);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    // Reopened from the strategy phrase after a Rules open, the picker is back
    // in view, and the body scrolls (once it did not: the picker stayed
    // scrolled off the top with no way to reach it).
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    const reopened = await evalJSON(c, `(() => {
      const body = document.getElementById('sheetPlanBody');
      return JSON.stringify({
        segOff: document.getElementById('stratseg').getBoundingClientRect().top - body.getBoundingClientRect().top,
        overflowY: getComputedStyle(body).overflowY,
      });
    })()`);
    ck(reopened.segOff >= 0 && reopened.segOff <= 24,
      `#stratseg sits ${Math.round(reopened.segOff)}px from the body's top after reopening from the strategy phrase, want 0-24px`);
    ck(reopened.overflowY === 'auto', `#sheetPlanBody's overflow-y is ${reopened.overflowY}, want auto so the coach can scroll it`);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    // Ravens, useCarryover on: the evens phrase scrolls to "Across the day".
    await tap(c, `document.getElementById('backBtn').click()`);
    await tap(c, `document.querySelectorAll('.today-game')[1].click()`);
    await evalIn(c, setGame(`s.game().useCarryover = true;`));
    await settle(c);
    await tap(c, `document.getElementById('phraseEvens').click()`);
    const evensHdOff = await headerOffset(c, '#planDay .pgrp-h');
    ck(evensHdOff !== null && Math.abs(evensHdOff) <= 8,
      `the "Across the day" header sits ${evensHdOff}px from the scrolling body's top after tapping the evens line, want within 8px`);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    await evalIn(c, setGame(`s.game().useCarryover = false;`));
    await tap(c, `document.getElementById('backBtn').click()`);
    await tap(c, `document.querySelectorAll('.today-game')[0].click()`);

    /* ---- item 2: By hand ---- */
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    await tap(c, `[...document.querySelectorAll('#stratseg button')].find(b => b.textContent === 'By hand').click()`);
    const byHand = await evalJSON(c, `(async () => JSON.stringify({
      strategy: (await import('/state.js')).game().strategy,
      open: document.getElementById('sheetPlan').open,
      phrase: document.getElementById('phraseStrategy').textContent,
      ranges: document.querySelectorAll('#stratbody input[type=range]').length,
      rangeNames: [...document.querySelectorAll('#stratbody input[type=range]')].map(r => r.getAttribute('aria-label')),
      locks: document.querySelectorAll('#stratbody .lockbtn').length,
      spread: !!document.getElementById('budgetSpread'),
      reset: [...document.querySelectorAll('#stratbody .prow')].some(b => b.textContent === 'Reset to even'),
    }))()`);
    ck(byHand.strategy === 'minutes', `game().strategy is "${byHand.strategy}" after "By hand", want "minutes"`);
    ck(byHand.open, 'the sheet closed after choosing "By hand"');
    ck(byHand.phrase === 'minutes set by hand', `the strategy phrase reads "${byHand.phrase}", want "minutes set by hand"`);
    ck(byHand.ranges === 11, `#stratbody has ${byHand.ranges} ranges, want 11`);
    ck(byHand.rangeNames.includes('Target minutes for Marcus Williams'),
      `no range is named "Target minutes for Marcus Williams" (${JSON.stringify(byHand.rangeNames)})`);
    ck(byHand.locks === 11, `#stratbody has ${byHand.locks} lock buttons, want 11`);
    ck(byHand.spread, '#budgetSpread ("Even out the rest") is missing');
    ck(byHand.reset, '"Reset to even" is missing');

    // Marcus's range, ArrowRight x2.
    await evalIn(c, step(`const r = [...document.querySelectorAll('#stratbody input[type=range]')]
      .find(x => x.getAttribute('aria-label') === 'Target minutes for Marcus Williams');
      r.focus();`));
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
    // a raw key dispatch does not fire a range's own `input` event -- fire it
    // explicitly so `oninput`'s `soon(...PLAN_ONLY)` runs.
    await evalIn(c, `(() => {
      const r = [...document.querySelectorAll('#stratbody input[type=range]')]
        .find(x => x.getAttribute('aria-label') === 'Target minutes for Marcus Williams');
      r.value = String(Number(r.value) + 2);
      r.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await settle(c);
    const afterArrows = await evalJSON(c, `JSON.stringify({
      spreadDisabled: document.getElementById('budgetSpread')?.disabled,
      mv: document.querySelector('.srow[data-id="p0"] .mv')?.textContent,
    })`);
    ck(afterArrows.mv && afterArrows.mv !== '0', `Marcus Williams's .mv still reads "${afterArrows.mv}" after raising his target`);

    // Lock Marcus's row.
    await tap(c, `document.querySelector('.srow[data-id="p0"] .lockbtn').click()`);
    const afterLock = await evalJSON(c, `JSON.stringify({
      pressed: document.querySelector('.srow[data-id="p0"] .lockbtn')?.getAttribute('aria-pressed'),
      disabled: document.querySelector('.srow[data-id="p0"] input[type=range]')?.disabled,
    })`);
    ck(afterLock.pressed === 'true', `Marcus Williams's lock button reads aria-pressed="${afterLock.pressed}", want "true"`);
    ck(afterLock.disabled === true, "Marcus Williams's range is not disabled after locking it");

    // Even out the rest -> exact -> spread disabled.
    await tap(c, `document.getElementById('budgetSpread').click()`);
    const afterSpread = await evalJSON(c, `JSON.stringify({
      spreadDisabled: document.getElementById('budgetSpread')?.disabled,
      msgClass: document.getElementById('budgetMsg')?.className,
    })`);
    ck(afterSpread.spreadDisabled === true, '#budgetSpread is not disabled after "Even out the rest"');
    ck((afterSpread.msgClass || '').includes('exact'), `the budget message class is "${afterSpread.msgClass}", want "exact"`);

    // Reset to even clears targets/locks.
    await tap(c, `[...document.querySelectorAll('#stratbody .prow')].find(b => b.textContent === 'Reset to even').click()`);
    const afterReset = await evalJSON(c, `(async () => JSON.stringify({
      targetSlots: (await import('/state.js')).game().constraints.targetSlots,
      lockedTargets: (await import('/state.js')).game().constraints.lockedTargets,
    }))()`);
    // normalizeTargets refills targetSlots before this reads it back, so the
    // only visible trace of "reset" is an even refill, not an empty map.
    const slotVals = Object.values(afterReset.targetSlots || {});
    ck(slotVals.length > 0 && Math.max(...slotVals) - Math.min(...slotVals) <= 1,
      `targetSlots is not an even split after "Reset to even": ${JSON.stringify(afterReset.targetSlots)}`);
    ck((afterReset.lockedTargets || []).length === 0, `lockedTargets not cleared: ${JSON.stringify(afterReset.lockedTargets)}`);

    /* ---- item 3: Closers and Platoon ---- */
    await tap(c, `[...document.querySelectorAll('#stratseg button')].find(b => b.textContent === 'Closers').click()`);
    const closers = await evalJSON(c, `JSON.stringify({
      hasChips: !!document.querySelector('#stratbody .chips'),
      hasWho: [...document.querySelectorAll('#stratbody .pickhd .t')].some(t => t.textContent === 'Who closes'),
    })`);
    ck(closers.hasChips, 'the Closing window chips are missing');
    ck(closers.hasWho, 'the "Who closes" tiles are missing');

    // tap two tiles.
    await tap(c, `const tiles = [...document.querySelectorAll('#stratbody .plr')]; tiles[0].click();`);
    await tap(c, `const tiles = [...document.querySelectorAll('#stratbody .plr')]; tiles[1].click();`);
    const afterTwoTiles = await evalJSON(c, `JSON.stringify({
      pressed: [...document.querySelectorAll('#stratbody .plr')].filter(b => b.getAttribute('aria-pressed') === 'true').length,
      count: document.querySelector('#stratbody .pickhd .c')?.textContent,
    })`);
    ck(afterTwoTiles.pressed === 2, `${afterTwoTiles.pressed} tiles are aria-pressed="true" after tapping two, want 2`);
    ck(afterTwoTiles.count === '2 of 5', `the picker count reads "${afterTwoTiles.count}", want "2 of 5"`);

    // Platoon.
    await tap(c, `[...document.querySelectorAll('#stratseg button')].find(b => b.textContent === 'Platoon').click()`);
    const platoon1 = await evalJSON(c, `JSON.stringify({
      unit1: [...document.querySelectorAll('#stratbody .pgrp-h')].some(h => h.textContent === 'Unit 1'),
      addUnit: [...document.querySelectorAll('#stratbody .prow')].some(b => b.textContent.includes('Add unit')),
      removeRows: [...document.querySelectorAll('#stratbody .prow')].filter(b => b.textContent.startsWith('Remove unit')).length,
    })`);
    ck(platoon1.unit1, '"Unit 1" is missing');
    ck(platoon1.addUnit, '"Add unit" is missing');
    ck(platoon1.removeRows === 0, `${platoon1.removeRows} "Remove unit" rows with only one unit, want 0`);

    await tap(c, `[...document.querySelectorAll('#stratbody .prow')].find(b => b.textContent.includes('Add unit')).click()`);
    const platoon2 = await evalJSON(c, `JSON.stringify({
      unit2: [...document.querySelectorAll('#stratbody .pgrp-h')].some(h => h.textContent === 'Unit 2'),
      removeRows: [...document.querySelectorAll('#stratbody .prow')].filter(b => b.textContent.startsWith('Remove unit')).length,
    })`);
    ck(platoon2.unit2, '"Unit 2" did not appear after "Add unit"');
    ck(platoon2.removeRows === 2, `${platoon2.removeRows} "Remove unit" rows with two units, want 2`);

    // Back to Even: #stratbody is empty.
    await tap(c, `[...document.querySelectorAll('#stratseg button')].find(b => b.textContent === 'Even').click()`);
    const backToEven = await evalJSON(c, `JSON.stringify(document.getElementById('stratbody').textContent.trim())`);
    ck(backToEven === '', `#stratbody reads "${backToEven}" back on Even, want empty`);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    /* ---- item 4: Rules list and detail ---- */
    await evalIn(c, setGame(`const g = s.game();
      g.constraints.minMinutes = { p0: 16 };
      g.constraints.pairs = [['p1', 'p2']];`));
    await settle(c);
    await tap(c, `document.getElementById('phraseRules').click()`);
    const rules1 = await evalJSON(c, `(() => {
      const rows = [...document.querySelectorAll('#constraints .prow')].filter(b => !b.classList.contains('add-rule'));
      return JSON.stringify({
        texts: rows.map(r => r.textContent.replace(/[›]/g, '').trim()),
        lastIsAdd: document.querySelector('#constraints .prow:last-child')?.classList.contains('add-rule'),
        phrase: document.getElementById('phraseRules').textContent,
      });
    })()`);
    ck(JSON.stringify(rules1.texts) === JSON.stringify(['Marcus plays at least 16 min', 'Devon and Hana together']),
      `#constraints reads ${JSON.stringify(rules1.texts)}, want ["Marcus plays at least 16 min","Devon and Hana together"]`);
    ck(rules1.lastIsAdd, '"Add a rule" is not the last row in #constraints');
    ck(rules1.phrase === '2 rules', `the rules phrase reads "${rules1.phrase}", want "2 rules"`);

    // Blurred first: a scripted click alone won't move focus, so the push's
    // own focus-move (item 1) would otherwise go unproven.
    await tapPane(c, `document.activeElement.blur(); [...document.querySelectorAll('#constraints .prow')]
      .filter(b => !b.classList.contains('add-rule'))[0].click()`);
    const detail = await evalJSON(c, `JSON.stringify({
      backLabel: document.getElementById('planBack')?.getAttribute('aria-label'),
      backHidden: document.getElementById('planBack')?.hidden,
      title: document.getElementById('sheetPlanTitle')?.textContent,
      tFoc: document.activeElement === document.getElementById('sheetPlanTitle'),
      sentence: document.querySelector('#planSub .plan-rule-sentence')?.textContent,
      removeBtn: [...document.querySelectorAll('#planSub .prow')].some(b => b.textContent === 'Remove rule'),
      openDialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.id),
    })`);
    ck(detail.backHidden === false && detail.backLabel === 'Back to Plan',
      `the back button is hidden=${detail.backHidden}, label "${detail.backLabel}", want visible and "Back to Plan"`);
    ck(detail.title === 'Rule', `the level-2 title reads "${detail.title}", want "Rule"`);
    ck(detail.tFoc, 'focus not on title after the detail push');
    ck(detail.sentence === 'Marcus plays at least 16 min', `the rule sentence reads "${detail.sentence}"`);
    ck(detail.removeBtn, '"Remove rule" is missing on the detail page');
    ck(JSON.stringify(detail.openDialogs) === JSON.stringify(['sheetPlan']),
      `${JSON.stringify(detail.openDialogs)} open on the rule detail page, want only sheetPlan`);

    // Remove rule.
    await tapPane(c, `[...document.querySelectorAll('#planSub .prow')].find(b => b.textContent === 'Remove rule').click()`);
    const afterRemove = await evalJSON(c, `JSON.stringify({
      rows: [...document.querySelectorAll('#constraints .prow')].filter(b => !b.classList.contains('add-rule')).length,
      title: document.getElementById('sheetPlanTitle')?.textContent,
    })`);
    ck(afterRemove.rows === 1, `#constraints has ${afterRemove.rows} rule row(s) after removing one, want 1`);
    ck(afterRemove.title === 'Plan', `the title reads "${afterRemove.title}" back on level 1, want "Plan"`);
    await settle(c);
    const afterRemoveReplan = await evalJSON(c, `JSON.stringify(document.getElementById('phraseRules').textContent)`);
    ck(afterRemoveReplan === '1 rule', `the rules phrase reads "${afterRemoveReplan}" after removing one rule, want "1 rule"`);

    // The snackbar, inside #sheetPlan, Undo not inert.
    const toast = await evalJSON(c, `(() => {
      const btn = [...document.querySelectorAll('#toasts .toast, #toasts button')]
        .find(b => (b.textContent || '').includes('Undo')) || [...document.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Undo');
      if (!btn) return JSON.stringify({ found: false });
      const insideSheet = !!btn.closest('#sheetPlan');
      const inert = !!btn.closest('[inert]');
      const r = btn.getBoundingClientRect();
      const atPoint = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return JSON.stringify({ found: true, insideSheet, inert, hit: atPoint === btn || btn.contains(atPoint),
        x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`);
    ck(toast.found, 'no "Rule removed." snackbar with an Undo button was found');
    if (toast.found) {
      ck(toast.insideSheet, 'the Undo snackbar is not inside #sheetPlan');
      ck(!toast.inert, 'the Undo button is inert while the sheet is open');
      ck(toast.hit, 'a tap at the Undo button\'s own center does not land on it (something covers it)');
      await click(c, toast.x, toast.y);
      await settle(c);
      const afterUndo = await evalJSON(c, `JSON.stringify({
        rows: [...document.querySelectorAll('#constraints .prow')].filter(b => !b.classList.contains('add-rule')).length,
        phrase: document.getElementById('phraseRules').textContent,
        open: document.getElementById('sheetPlan').open,
      })`);
      ck(afterUndo.rows === 2, `#constraints has ${afterUndo.rows} rule row(s) after Undo, want 2`);
      ck(afterUndo.phrase === '2 rules', `the rules phrase reads "${afterUndo.phrase}" after Undo, want "2 rules"`);
      ck(afterUndo.open, 'the sheet closed after clicking Undo');
    }

    // "Back to Plan" returns focus to the row that opened the detail.
    await tapPane(c, `[...document.querySelectorAll('#constraints .prow')]
      .filter(b => !b.classList.contains('add-rule'))[0].click()`);
    await tapPane(c, `document.getElementById('planBack').click()`);
    const afterBack = await evalJSON(c, `JSON.stringify({
      focusedFirstRow: document.activeElement === [...document.querySelectorAll('#constraints .prow')]
        .filter(b => !b.classList.contains('add-rule'))[0],
      title: document.getElementById('sheetPlanTitle')?.textContent,
    })`);
    ck(afterBack.focusedFirstRow, 'focus did not return to the row that opened the rule detail after "Back to Plan"');
    ck(afterBack.title === 'Plan', `the title reads "${afterBack.title}" after "Back to Plan", want "Plan"`);

    await tapPane(c, `[...document.querySelectorAll('#constraints .prow')]
      .filter(b => !b.classList.contains('add-rule'))[0].click()`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await settlePane(c);
    const afterEscOne = await evalJSON(c, `JSON.stringify({
      open: document.getElementById('sheetPlan').open,
      title: document.getElementById('sheetPlanTitle')?.textContent,
    })`);
    ck(afterEscOne.open, 'the first Escape at level 2 closed the sheet instead of popping one level');
    ck(afterEscOne.title === 'Plan', `the title reads "${afterEscOne.title}" after one Escape, want "Plan" (back at level 1)`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    ck(await waitClosed(c, '#sheetPlan'), 'a second Escape did not close the sheet within the slide');

    // restore Hawks: no rules.
    await evalIn(c, setGame(`const g = s.game(); g.constraints.minMinutes = {}; g.constraints.pairs = [];`));
    await settle(c);

    /* ---- item 5: Add a rule ---- */
    await tap(c, `document.getElementById('phraseRules').click()`);
    await tapPane(c, `document.activeElement.blur(); document.querySelector('#constraints .add-rule').click()`);
    const addPage = await evalJSON(c, `JSON.stringify({
      title: document.getElementById('sheetPlanTitle')?.textContent,
      tFoc: document.activeElement === document.getElementById('sheetPlanTitle'),
      backHidden: document.getElementById('planBack')?.hidden,
      closeHidden: document.getElementById('sheetPlanClose')?.hidden,
      addLabel: document.getElementById('planAddRuleBtn')?.textContent,
      addHidden: document.getElementById('planAddRuleBtn')?.hidden,
      addDisabled: document.getElementById('planAddRuleBtn')?.disabled,
      kinds: [...document.querySelectorAll('#planSub .plan-kinds .chip')].map(b => b.textContent),
      pressed: [...document.querySelectorAll('#planSub .plan-kinds .chip')].map(b => b.getAttribute('aria-pressed')),
    })`);
    ck(addPage.title === 'Add a rule', `the level-2 title reads "${addPage.title}", want "Add a rule"`);
    ck(addPage.tFoc, 'focus not on title after the add-rule push');
    ck(addPage.backHidden === false, 'the back button is hidden on the Add-a-rule page');
    ck(addPage.closeHidden === true, 'the ✕ is on show on the Add-a-rule page, want it swapped for "Add rule"');
    ck(addPage.addHidden === false, '"Add rule" is hidden on the Add-a-rule page');
    ck(addPage.addLabel === 'Add rule', `the commit button reads "${addPage.addLabel}", want "Add rule"`);
    ck(addPage.addDisabled === true, '"Add rule" is not disabled with nothing picked yet');
    const WANT_KINDS = ['Plays at least', 'Plays at most', 'Apart', 'Together',
      'One of two on', 'Starting five', 'Last-period five', 'Rest limit'];
    ck(JSON.stringify(addPage.kinds) === JSON.stringify(WANT_KINDS),
      `the kind chips read ${JSON.stringify(addPage.kinds)}, want ${JSON.stringify(WANT_KINDS)}`);
    ck(addPage.pressed[0] === 'true' && addPage.pressed.slice(1).every(p => p === 'false'),
      `chip aria-pressed is ${JSON.stringify(addPage.pressed)}, want only "Plays at least" pressed`);

    // Tap Eli's tile: enables Add rule, minutes start at 12.
    await tap(c, `[...document.querySelectorAll('#planSub .plr')].find(b => b.getAttribute('aria-label') === 'Eli Tran').click()`);
    const eliPicked = await evalJSON(c, `JSON.stringify({
      addDisabled: document.getElementById('planAddRuleBtn')?.disabled,
      minutes: document.querySelector('#planSub .pstep-val')?.textContent,
    })`);
    ck(eliPicked.addDisabled === false, '"Add rule" is still disabled after picking Eli Tran');
    ck(eliPicked.minutes === '12', `the minutes stepper reads "${eliPicked.minutes}" after picking Eli, want "12"`);

    // Tap Hana's tile: the pick moves to Hana (replace: true).
    await tap(c, `[...document.querySelectorAll('#planSub .plr')].find(b => b.getAttribute('aria-label') === 'Hana Kim').click()`);
    const hanaPicked = await evalJSON(c, `JSON.stringify({
      pressed: [...document.querySelectorAll('#planSub .plr')].filter(b => b.getAttribute('aria-pressed') === 'true')
        .map(b => b.getAttribute('aria-label')),
    })`);
    ck(JSON.stringify(hanaPicked.pressed) === JSON.stringify(['Hana Kim']),
      `${JSON.stringify(hanaPicked.pressed)} tile(s) picked after tapping Hana Kim, want only ["Hana Kim"]`);

    // "More minutes" twice -> 14.
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    const at14 = await evalJSON(c, `JSON.stringify(document.querySelector('#planSub .pstep-val')?.textContent)`);
    ck(at14 === '14', `the minutes stepper reads "${at14}" after "More minutes" twice, want "14"`);

    // Add rule: back to level 1, a row reads "Hana plays at least 14 min".
    await tapPane(c, `document.getElementById('planAddRuleBtn').click()`);
    const afterAdd = await evalJSON(c, `JSON.stringify({
      title: document.getElementById('sheetPlanTitle')?.textContent,
      rows: [...document.querySelectorAll('#constraints .prow')].filter(b => !b.classList.contains('add-rule')).map(r => r.textContent.trim()),
    })`);
    ck(afterAdd.title === 'Plan', `the title reads "${afterAdd.title}" after "Add rule", want "Plan"`);
    ck(afterAdd.rows.includes('Hana plays at least 14 min'),
      `#constraints reads ${JSON.stringify(afterAdd.rows)}, want a row "Hana plays at least 14 min"`);

    // Choosing "Together" clears the pick and disables Add rule.
    await tapPane(c, `document.querySelector('#constraints .add-rule').click()`);
    await tap(c, `[...document.querySelectorAll('#planSub .plan-kinds .chip')].find(b => b.textContent === 'Together').click()`);
    const together0 = await evalJSON(c, `JSON.stringify({
      addDisabled: document.getElementById('planAddRuleBtn')?.disabled,
      pressed: [...document.querySelectorAll('#planSub .plr')].some(b => b.getAttribute('aria-pressed') === 'true'),
    })`);
    ck(together0.addDisabled === true, '"Add rule" is not disabled right after choosing "Together"');
    ck(!together0.pressed, 'a tile is still picked right after choosing "Together"');

    await tap(c, `document.querySelectorAll('#planSub .plr')[0].click()`);
    const together1 = await evalJSON(c, `JSON.stringify(document.getElementById('planAddRuleBtn')?.disabled)`);
    ck(together1 === true, '"Add rule" is enabled with only one tile picked for "Together"');

    await tap(c, `document.querySelectorAll('#planSub .plr')[1].click()`);
    const together2 = await evalJSON(c, `JSON.stringify({
      addDisabled: document.getElementById('planAddRuleBtn')?.disabled,
      thirdDisabled: document.querySelectorAll('#planSub .plr')[2]?.disabled,
    })`);
    ck(together2.addDisabled === false, '"Add rule" is still disabled with two tiles picked for "Together"');
    ck(together2.thirdDisabled === true, 'a third tile is not disabled once two are picked for "Together"');

    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    // restore Hawks: no rules.
    await evalIn(c, setGame(`const g = s.game(); g.constraints.minMinutes = {}; g.constraints.pairs = [];`));
    await settle(c);

    /* ---- item 6: Lineup balance ---- */
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    const balRow = await evalJSON(c, `JSON.stringify(document.querySelector('#planLineups .prow-v')?.textContent)`);
    ck(balRow === 'Steady', `the Lineup balance row reads "${balRow}", want "Steady"`);
    await tapPane(c, `document.activeElement.blur(); document.querySelector('#planLineups .prow').click()`);
    const shapes = await evalJSON(c, `JSON.stringify({
      labels: [...document.querySelectorAll('#planSub .prow-shape .prow-t')].map(t => t.textContent),
      pressed: [...document.querySelectorAll('#planSub .prow-shape')].map(b => b.getAttribute('aria-pressed')),
      tFoc: document.activeElement === document.getElementById('sheetPlanTitle'),
    })`);
    ck(JSON.stringify(shapes.labels) === JSON.stringify(['Steady', 'Start strong', 'Finish strong', 'Both ends']),
      `the lineup balance rows read ${JSON.stringify(shapes.labels)}`);
    ck(shapes.pressed[0] === 'true' && shapes.pressed.slice(1).every(p => p === 'false'),
      `aria-pressed is ${JSON.stringify(shapes.pressed)}, want only "Steady" pressed`);
    ck(shapes.tFoc, 'focus not on title after the balance push');

    await tap(c, `[...document.querySelectorAll('#planSub .prow-shape')].find(b => b.textContent.includes('Both ends')).click()`);
    const bothEnds = await evalJSON(c, `(async () => JSON.stringify({
      balance: (await import('/state.js')).game().balance,
      pressed: [...document.querySelectorAll('#planSub .prow-shape')].map(b => b.getAttribute('aria-pressed')),
      open: document.getElementById('sheetPlan').open,
      title: document.getElementById('sheetPlanTitle')?.textContent,
    }))()`);
    ck(bothEnds.balance === 'both', `game().balance is "${bothEnds.balance}" after "Both ends", want "both"`);
    ck(bothEnds.pressed[3] === 'true' && bothEnds.pressed.slice(0, 3).every(p => p === 'false'),
      `aria-pressed is ${JSON.stringify(bothEnds.pressed)} after "Both ends", want only the 4th pressed`);
    ck(bothEnds.title === 'Lineup balance', `the title reads "${bothEnds.title}" after picking a shape, want "Lineup balance"`);

    await tapPane(c, `document.getElementById('planBack').click()`);
    const balRowAfter = await evalJSON(c, `JSON.stringify(document.querySelector('#planLineups .prow-v')?.textContent)`);
    ck(balRowAfter === 'Both ends', `the Lineup balance row reads "${balRowAfter}" after choosing "Both ends", want "Both ends"`);

    // restore Steady.
    await evalIn(c, setGame(`s.game().balance = 'even';`));
    await settle(c);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    /* ---- item 7: evening out ---- */
    await tap(c, `document.getElementById('phraseRules').click()`);
    const dayGroup = await evalJSON(c, `JSON.stringify({
      disabled: document.querySelector('#planDay input[switch]')?.disabled,
      checked: document.querySelector('#planDay input[switch]')?.checked,
      footer: document.querySelector('#planDay .pgrp-f')?.textContent,
    })`);
    ck(dayGroup.disabled === true, 'the "Even out earlier games" switch is not disabled on Hawks (game 0)');
    ck(dayGroup.checked === false, 'the "Even out earlier games" switch is checked on Hawks (game 0)');
    ck(dayGroup.footer === "This is the first game today, so there's nothing to even out.",
      `the day-group footer reads "${dayGroup.footer}"`);
    const seasonGroup = await evalJSON(c, `JSON.stringify(!!document.querySelector('#planSeason input[switch]'))`);
    ck(seasonGroup, '"Even out the season so far" is missing (RICH has filed games)');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    await tap(c, `document.getElementById('backBtn').click()`);
    await tap(c, `document.querySelectorAll('.today-game')[1].click()`);
    await tap(c, `document.getElementById('phraseRules').click()`);
    const ravensDay = await evalJSON(c, `JSON.stringify(document.querySelector('#planDay input[switch]')?.disabled)`);
    ck(ravensDay === false, 'the "Even out earlier games" switch is disabled on Ravens (a later game)');
    await tap(c, `document.querySelector('#planDay input[switch]').click()`);
    const afterCarryOn = await evalJSON(c, `(async () => JSON.stringify({
      useCarryover: (await import('/state.js')).game().useCarryover,
      switchAttr: document.querySelectorAll('#planDay input[switch], #planSeason input[switch]').length === 2,
    }))()`);
    ck(afterCarryOn.useCarryover === true, 'game().useCarryover is not true after turning "Even out earlier games" on');
    ck(afterCarryOn.switchAttr, 'not every switch row carries the boolean `switch` attribute');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    const evensLine = await evalJSON(c, `JSON.stringify({
      hidden: document.getElementById('sentenceEvens')?.hidden,
      text: document.getElementById('phraseEvens')?.textContent,
    })`);
    ck(evensLine.hidden === false, 'turning on "Even out earlier games" did not show the sentence\'s second line');
    // #102: Hawks' 9:00 tip-off, read through the same `tipoffLabel` the
    // sentence itself calls (`evensOutWant`, dom.mjs), rather than a
    // hard-coded "9:00 AM" this ICU version's own AM/PM spacing (an ASCII
    // space or U+202F) could break.
    const wantEvens = await evensOutWant(c, '09:00');
    ck(evensLine.text === wantEvens, `the second line reads "${evensLine.text}", want "${wantEvens}"`);

    // toggle useSeasonTargets.
    await tap(c, `document.getElementById('phraseRules').click()`);
    await tap(c, `document.querySelector('#planSeason input[switch]').click()`);
    const seasonOn = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().useSeasonTargets))()`);
    ck(seasonOn === true, 'game().useSeasonTargets is not true after toggling "Even out the season so far"');
    await tap(c, `document.querySelector('#planSeason input[switch]').click()`);
    // undo the carryover switch too.
    await tap(c, `document.querySelector('#planDay input[switch]').click()`);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    await tap(c, `document.getElementById('backBtn').click()`);
    await tap(c, `document.querySelector('.today-game').click()`);

    /* ---- item 8: the folds are gone ---- */
    const gone = await evalJSON(c, `JSON.stringify(['#planFold', '#balanceFold', '#consdetails', '#stratnote',
      '#balancehint', '#conscount', '.s-plan', '.s-balance',
      '[data-help="help-plan"]', '[data-help="help-balance"]', '[data-help="help-rules"]']
      .filter(sel => document.querySelector(sel)))`);
    ck(gone.length === 0, `still present: ${gone.join(', ')}`);
    const insideSheet = await evalJSON(c, `JSON.stringify(['#stratseg', '#stratbody', '#planLineups', '#constraints']
      .filter(sel => !document.getElementById('sheetPlan')?.querySelector(sel)))`);
    ck(insideSheet.length === 0, `not inside #sheetPlan: ${insideSheet.join(', ')}`);

    /* ---- item 9: the announcement ---- */
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    await tap(c, `[...document.querySelectorAll('#stratseg button')].find(b => b.textContent === 'By hand').click()`);
    await statusOk(c, '#sheetPlanStatus', ck);
    await tap(c, `[...document.querySelectorAll('#stratseg button')].find(b => b.textContent === 'Even').click()`);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    /* ---- item 10 and item 20: closing and resizing ---- */
    await planClosePass(c, ck);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'opening, strategies, rules, add-a-rule, lineup balance, evening out, the retired '
        + 'folds, the status line and every sheet behavior all hold',
  };
}
