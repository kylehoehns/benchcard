import { evalIn, step, WIDTH, HEIGHT } from './dom.mjs';
import { nameOf } from './registry.mjs';
import { evalJSON, checkTitleFocused, click, closedWithFocus, drag, flick, resizeCheck, settle, sheetRect, setGame, statusOk } from './sheet-drive.mjs';

// item 6's second assertion, on top of `statusOk`'s own `planSay`-equality
// check: all three sheets' status line also has to read either the
// minutes-each wording or "Plan blocked: ", which #28's Plan sheet does not
// additionally claim -- see `statusOk`'s own comment (sheet-drive.mjs) for
// why that check does not bake this in.
const minutesOrBlocked = (r, ck, sel) => ck(
  /^\d+(\.\d+)? (to \d+(\.\d+)? )?minutes each, \d+ changes?$/.test(r.got) || r.got.startsWith('Plan blocked: '),
  `${sel} reads "${r.got}", which matches neither the minutes-each wording nor "Plan blocked: "`);

/* #27's own guard (docs/specs/27-sentence-and-sheets.md's Proof section): the
 * sentence, and the three sheets its phrases open, driven with the real
 * buttons, keys and pointer events a coach would use -- not a source read.
 * Runs on `RICH` (`setup: 'rich'`), which lands on the Hawks game already
 * open (`view: 'games'`, `activeGame: 0`), exactly the state item 1 names.
 *
 * State is read from `state.js`'s own exports (`import('/state.js')` in the
 * page, cached the same as `app.js`'s own import of it -- one module, one
 * instance) rather than recomputed here: `plans[state.activeGame]` and
 * `planSay(g, p)` are the same values the app itself would show, so a bug
 * that reached both the DOM and a hand-typed expectation here would still be
 * caught.
 *
 * The eight drive helpers (`evalJSON` through `statusMatches`) live in
 * `sheet-drive.mjs`, shared with #28's `plan-sheet.mjs` -- see that file's
 * own comment for why. */

export async function sentenceSheetsPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    /* ---- item 1: the sentence, at rest on Hawks ---- */
    const s1 = await evalJSON(c, `(() => {
      const sentence = document.querySelector('#sentence');
      const text = sentence ? sentence.textContent.replace(/\\s+/g, ' ').trim() : null;
      const names = ['phrasePlayers', 'phraseFormat', 'phraseInterval', 'phraseStrategy', 'phraseRules']
        .map(id => document.getElementById(id)?.tagName === 'BUTTON'
          ? document.getElementById(id).getAttribute('aria-label') : null);
      const evensHidden = document.getElementById('sentenceEvens')?.hidden;
      return JSON.stringify({ text, names, evensHidden });
    })()`);
    ck(s1.text === '11 players, 4 × 8, subbing every 4 min for even minutes, with no rules.',
      `#sentence reads "${s1.text}", want "11 players, 4 × 8, subbing every 4 min for even minutes, with no rules."`);
    ck(s1.names[0] === "Who's here, 11 players", `players phrase named "${s1.names[0]}", want "Who's here, 11 players"`);
    ck(s1.names[1] === 'Format, 4 × 8', `format phrase named "${s1.names[1]}", want "Format, 4 × 8"`);
    ck(s1.names[2] === 'Sub interval, every 4 min', `interval phrase named "${s1.names[2]}", want "Sub interval, every 4 min"`);
    ck(s1.names[3] === 'Plan, even minutes', `strategy phrase named "${s1.names[3]}", want "Plan, even minutes"`);
    ck(s1.names[4] === 'Rules, no rules', `rules phrase named "${s1.names[4]}", want "Rules, no rules"`);
    ck(s1.evensHidden === true, 'the second line is not hidden on the Hawks game, which has no carryover');

    /* ---- item 2 (in-page): Ravens with useCarryover on gets the line ----
       Driven the way the ticket itself says to prove it: "turn Ravens'
       useCarryover on, open Ravens". The switch is real (rules.js, only once
       `state.activeGame > 0`), reached through Today -> the second game
       pass -> the rules phrase, which now opens `#sheetPlan`'s "Across the
       day" group (#28) rather than the retired `#consdetails` fold -- no
       direct state write. */
    await evalIn(c, step(`document.getElementById('backBtn').click()`));
    await settle(c);
    await evalIn(c, step(`document.querySelectorAll('.today-game')[1].click()`));
    await settle(c);
    await evalIn(c, step(`document.getElementById('phraseRules').click()`));
    await settle(c);
    await evalIn(c, step(`document.querySelector('#planDay input[switch]').click()`));
    await settle(c);
    const s2 = await evalJSON(c, `(() => {
      const line = document.getElementById('sentenceEvens');
      const btn = document.getElementById('phraseEvens');
      return JSON.stringify({ hidden: line?.hidden, text: btn?.textContent });
    })()`);
    ck(s2.hidden === false, 'Ravens has useCarryover on but the second line stayed hidden');
    ck(s2.text === 'Evens out the 9:00 game.', `the second line reads "${s2.text}", want "Evens out the 9:00 game."`);
    // back to Hawks, useCarryover off, for every section below -- same
    // switch, same path, then back to Hawks through Today.
    await evalIn(c, step(`document.querySelector('#planDay input[switch]').click()`));
    await settle(c);
    await evalIn(c, step(`document.getElementById('sheetPlanClose').click()`));
    await settle(c);
    await evalIn(c, step(`document.getElementById('backBtn').click()`));
    await settle(c);
    await evalIn(c, step(`document.querySelectorAll('.today-game')[0].click()`));
    await settle(c);

    /* ---- item 3: Who's here ---- */
    await evalIn(c, step(`document.querySelector('#phrasePlayers').click()`));
    await settle(c);
    let rect = await sheetRect(c, '#sheetWho');
    ck(rect.open, '#sheetWho did not open on tapping "Who\'s here, 11 players"');
    const halfLo = HEIGHT * 0.40, halfHi = HEIGHT * 0.60;
    ck(rect.top >= halfLo && rect.top <= halfHi,
      `#sheetWho's top edge is ${Math.round(rect.top)}px (${Math.round(rect.top / HEIGHT * 100)}% of ${HEIGHT}), want 40-60%`);
    await checkTitleFocused(c, ck, 'sheetWhoTitle', '#sheetWho');

    const who = await evalJSON(c, `(() => {
      const rows = [...document.querySelectorAll('#sheetWhoBody .sheetrow')];
      return JSON.stringify({
        order: rows.map(r => r.getAttribute('aria-label')),
        pressed: rows.map(r => r.getAttribute('aria-pressed')),
        marks: rows.map(r => r.querySelector('.sheetrow-state')?.textContent),
      });
    })()`);
    ck(who.order.length === 11, `#sheetWhoBody has ${who.order.length} rows, want 11`);
    ck(who.pressed.every(p => p === 'true'), 'not every Who\'s here row starts aria-pressed="true"');
    ck(who.marks.every(m => m === '✓'), 'not every Who\'s here row starts with a checkmark');
    const rosterOrder = await evalJSON(c, `(async () => {
      const s = await import('/state.js');
      return JSON.stringify(s.state.players.map(p => p.name));
    })()`);
    ck(JSON.stringify(who.order) === JSON.stringify(rosterOrder),
      `Who's here reads ${JSON.stringify(who.order)}, want roster order ${JSON.stringify(rosterOrder)}`);

    // Tap Devon Ellis's row -- a real pointer click, not a scripted
    // `.click()`: focus is checked right after, and a script call skips the
    // mousedown a real tap fires, which is what actually moves focus.
    async function tapDevon(c) {
      const r = await evalJSON(c, `(() => {
        const b = [...document.querySelectorAll('#sheetWhoBody .sheetrow')]
          .find(x => x.getAttribute('aria-label') === 'Devon Ellis');
        const rr = b.getBoundingClientRect();
        return JSON.stringify({ x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 });
      })()`);
      await click(c, r.x, r.y);
    }
    await tapDevon(c);
    await settle(c);
    const devon = await evalJSON(c, `(() => {
      const b = [...document.querySelectorAll('#sheetWhoBody .sheetrow')]
        .find(x => x.getAttribute('aria-label') === 'Devon Ellis');
      return JSON.stringify({
        open: document.getElementById('sheetWho').open,
        pressed: b?.getAttribute('aria-pressed'),
        mark: b?.querySelector('.sheetrow-state')?.textContent,
        focused: document.activeElement === b,
      });
    })()`);
    ck(devon.open, 'the sheet closed after marking a player absent');
    ck(devon.pressed === 'false', `Devon Ellis's row is aria-pressed="${devon.pressed}" after tapping it, want "false"`);
    ck(devon.mark === 'Absent', `Devon Ellis's row reads "${devon.mark}" after tapping it, want "Absent"`);
    ck(devon.focused, 'focus did not stay on Devon Ellis\'s row after tapping it');
    // the re-plan: 10 players, 10 timeline rows.
    const afterAbsent = await evalJSON(c, `JSON.stringify({
      phrase: document.getElementById('phrasePlayers').textContent,
      rows: document.querySelectorAll('#timeline .tl-row[data-id]').length,
    })`);
    ck(afterAbsent.phrase === '10 players', `the players phrase reads "${afterAbsent.phrase}" after marking one absent, want "10 players"`);
    ck(afterAbsent.rows === 10, `#timeline has ${afterAbsent.rows} player rows after marking one absent, want 10`);
    await statusOk(c, '#sheetWhoStatus', ck, minutesOrBlocked);

    // Tap Devon Ellis again: back to 11.
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    await tapDevon(c);
    await settle(c);
    const restored = await evalJSON(c, `JSON.stringify({
      pressed: [...document.querySelectorAll('#sheetWhoBody .sheetrow')]
        .find(b => b.getAttribute('aria-label') === 'Devon Ellis')?.getAttribute('aria-pressed'),
      phrase: document.getElementById('phrasePlayers').textContent,
    })`);
    ck(restored.pressed === 'true', 'tapping Devon Ellis a second time did not bring the row back to aria-pressed="true"');
    ck(restored.phrase === '11 players', `the players phrase reads "${restored.phrase}" after undoing the absence, want "11 players"`);

    /* ---- item 7, general behavior, proved once on #sheetWho ---- */
    // Focus on open is already proved by `devon.focused` staying inside the
    // dialog across a repaint; check it fresh on a clean open too.
    const focusOnOpen = await evalJSON(c, `JSON.stringify({
      inside: document.getElementById('sheetWho').contains(document.activeElement),
    })`);
    ck(focusOnOpen.inside, 'focus did not land inside #sheetWho on open');

    // Close by the ✕ button. Item 10: the dialog slides shut rather than
    // closing at once, so `closedWithFocus` polls up to `--t` + 100ms
    // instead of reading `open` the instant the click returns, then confirms
    // focus returned to the trigger (item 3).
    await evalIn(c, step(`document.getElementById('sheetWhoClose').click()`));
    let r10 = await closedWithFocus(c, '#sheetWho', '#phrasePlayers');
    ck(r10.closed, 'the ✕ button did not close #sheetWho within the slide');
    ck(r10.focusBack, 'focus did not return to the players phrase after closing #sheetWho with ✕');

    // Close by Escape.
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    r10 = await closedWithFocus(c, '#sheetWho', '#phrasePlayers');
    ck(r10.closed, 'Escape did not close #sheetWho within the slide');
    ck(r10.focusBack, 'focus did not return to the players phrase after closing #sheetWho with Escape');

    // Close by a backdrop click, above the (half-height) sheet's top edge.
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    await click(c, WIDTH / 2, 10);
    r10 = await closedWithFocus(c, '#sheetWho', '#phrasePlayers');
    ck(r10.closed, 'a backdrop click did not close #sheetWho within the slide');
    ck(r10.focusBack, 'focus did not return to the players phrase after closing #sheetWho with a backdrop click');

    // Close by a downward drag on the handle, past a quarter of its height.
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    rect = await sheetRect(c, '#sheetWho');
    if (ck(!!rect.handle, '#sheetWho has no .bsheet-handle to drag')) {
      await drag(c, rect.handle.x, rect.handle.y, rect.handle.y + rect.height * 0.4);
      r10 = await closedWithFocus(c, '#sheetWho', '#phrasePlayers');
      ck(r10.closed, 'a downward drag past a quarter of the sheet\'s height did not close #sheetWho within the slide');
      ck(r10.focusBack, 'focus did not return to the players phrase after closing #sheetWho by dragging');
    }

    // Close by a fast downward flick: item 12's speed threshold, not the 25%
    // distance one -- a 15% flick stays well short of the distance close.
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    rect = await sheetRect(c, '#sheetWho');
    if (ck(!!rect.handle, '#sheetWho has no .bsheet-handle to flick')) {
      await flick(c, rect.handle.x, rect.handle.y, rect.handle.y + rect.height * 0.15);
      r10 = await closedWithFocus(c, '#sheetWho', '#phrasePlayers');
      ck(r10.closed, 'a fast downward flick (15% of height) did not close #sheetWho within the slide');
      ck(r10.focusBack, 'focus did not return to the players phrase after closing #sheetWho with a flick');
    }

    /* ---- resizing: drag up from half to full, then click back to half ---- */
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    await resizeCheck(c, '#sheetWho', ck, top => top >= halfLo && top <= halfHi);

    /* ---- one sheet at a time ---- */
    await evalIn(c, step(`document.getElementById('phraseFormat').click()`));
    await settle(c);
    const openDialogs = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('dialog[open]')].map(d => d.id))`);
    ck(openDialogs.length === 1 && openDialogs[0] === 'sheetFormat',
      `opening Format while Who's here was open left ${JSON.stringify(openDialogs)} open, want exactly ["sheetFormat"]`);
    await checkTitleFocused(c, ck, 'sheetFormatTitle', '#sheetFormat');

    /* ---- item 5: Format's stepper rows, the shared `.pstep-row` shape ---- */
    const fmt = await evalJSON(c, `(() => {
      const box = document.getElementById('sheetFormatBody');
      const steps = [...box.querySelectorAll('.pstep-row')].map(row => ({
        label: row.querySelector('.prow-t')?.textContent,
        minus: row.querySelector('.pstep-btn:first-of-type')?.getAttribute('aria-label'),
        plus: row.querySelector('.pstep-btn:last-of-type')?.getAttribute('aria-label'),
        value: row.querySelector('.pstep-val')?.textContent,
        minusDisabled: row.querySelector('.pstep-btn:first-of-type')?.disabled,
        plusDisabled: row.querySelector('.pstep-btn:last-of-type')?.disabled,
      }));
      return JSON.stringify(steps);
    })()`);
    ck(fmt.length === 2, `#sheetFormatBody has ${fmt.length} steppers, want 2`);
    ck(fmt[0]?.label === 'Periods', `first stepper is labeled "${fmt[0]?.label}", want "Periods"`);
    ck(fmt[0]?.minus === 'Fewer periods' && fmt[0]?.plus === 'More periods',
      `periods stepper buttons are named "${fmt[0]?.minus}"/"${fmt[0]?.plus}"`);
    ck(fmt[0]?.value === '4', `periods stepper reads "${fmt[0]?.value}", want "4" (RICH's own format)`);
    ck(fmt[0]?.plusDisabled === true, '"More periods" is not disabled at 4, the top of the 1-4 range');
    ck(fmt[1]?.label === 'Minutes each', `second stepper is labeled "${fmt[1]?.label}", want "Minutes each"`);
    ck(fmt[1]?.minus === 'Fewer minutes' && fmt[1]?.plus === 'More minutes',
      `minutes stepper buttons are named "${fmt[1]?.minus}"/"${fmt[1]?.plus}"`);
    ck(fmt[1]?.value === '8', `minutes stepper reads "${fmt[1]?.value}", want "8" (RICH's own format)`);

    // Fewer periods: 4 -> 3, and the phrase/game() follow. (The timeline's
    // own period count is `stepFormat`'s value fed straight to `computeAll`,
    // which `test/sentence.test.js` already covers -- this proves the wiring
    // from the tap to `game().periods`, not the solver again.)
    await evalIn(c, step(`document.querySelector('#sheetFormatBody .pstep-row:first-child .pstep-btn:first-of-type').click()`));
    await settle(c);
    const afterFewer = await evalJSON(c, `(async () => JSON.stringify({
      value: document.querySelector('#sheetFormatBody .pstep-row:first-child .pstep-val').textContent,
      phrase: document.getElementById('phraseFormat').textContent,
      periods: (await import('/state.js')).game().periods,
    }))()`);
    ck(afterFewer.value === '3', `the periods stepper reads "${afterFewer.value}" after "Fewer periods", want "3"`);
    ck(afterFewer.phrase === '3 × 8', `the format phrase reads "${afterFewer.phrase}" after "Fewer periods", want "3 × 8"`);
    ck(afterFewer.periods === 3, `game().periods is ${afterFewer.periods} after "Fewer periods", want 3`);

    // More minutes: 8 -> 9.
    await evalIn(c, step(`document.querySelector('#sheetFormatBody .pstep-row:last-child .pstep-btn:last-of-type').click()`));
    await settle(c);
    const afterMore = await evalJSON(c, `JSON.stringify({
      value: document.querySelector('#sheetFormatBody .pstep-row:last-child .pstep-val').textContent,
    })`);
    ck(afterMore.value === '9', `the minutes stepper reads "${afterMore.value}" after "More minutes", want "9"`);
    await statusOk(c, '#sheetFormatStatus', ck, minutesOrBlocked);

    // Range ends: drive minutes to 20 (More disabled), then to 4 (Fewer disabled).
    await evalIn(c, setGame(`s.game().periodMinutes = 20;`));
    await evalIn(c, step(`document.getElementById('phraseFormat').click()`));
    await settle(c);
    const atHi = await evalJSON(c, `JSON.stringify(document.querySelector('#sheetFormatBody .pstep-row:last-child .pstep-btn:last-of-type').disabled)`);
    ck(atHi === true, '"More minutes" is not disabled at 20, the top of the 4-20 range');
    await evalIn(c, setGame(`s.game().periodMinutes = 4; s.game().periods = 4;`));
    await evalIn(c, step(`document.getElementById('sheetFormatClose').click(); document.getElementById('phraseFormat').click()`));
    await settle(c);
    const atLo = await evalJSON(c, `JSON.stringify(document.querySelector('#sheetFormatBody .pstep-row:last-child .pstep-btn:first-of-type').disabled)`);
    ck(atLo === true, '"Fewer minutes" is not disabled at 4, the bottom of the 4-20 range');
    // restore RICH's own format (4 x 8) for the interval section below.
    await evalIn(c, setGame(`s.game().periodMinutes = 8; s.game().periods = 4;`));
    await evalIn(c, step(`document.getElementById('sheetFormatClose').click()`));
    await settle(c);

    /* ---- item 5: Sub interval ---- */
    await evalIn(c, step(`document.getElementById('phraseInterval').click()`));
    await settle(c);
    await checkTitleFocused(c, ck, 'sheetIntervalTitle', '#sheetInterval');
    const interval = await evalJSON(c, `(() => {
      const rows = [...document.querySelectorAll('#sheetIntervalBody .sheetrow')];
      return JSON.stringify({
        labels: rows.map(r => r.getAttribute('aria-label')),
        pressed: rows.map(r => r.getAttribute('aria-pressed')),
        marks: rows.map(r => r.querySelector('.sheetrow-state')?.textContent),
      });
    })()`);
    const WANT_ROWS = ['Every 2 min', 'Every 3 min', 'Every 4 min', 'Every 5 min', 'Every 6 min',
      '2× a period', '3× a period', 'Only at breaks'];
    ck(JSON.stringify(interval.labels) === JSON.stringify(WANT_ROWS),
      `#sheetIntervalBody reads ${JSON.stringify(interval.labels)}, want ${JSON.stringify(WANT_ROWS)}`);
    const pressedAt = interval.pressed.map((p, i) => p === 'true' ? i : -1).filter(i => i >= 0);
    ck(pressedAt.length === 1 && pressedAt[0] === 2,
      `${pressedAt.length} row(s) pressed (index ${JSON.stringify(pressedAt)}), want only "Every 4 min" (index 2)`);
    ck(interval.marks.filter(m => m === '✓').length === 1, 'more than one checkmark in the Sub interval sheet');

    await evalIn(c, step(`[...document.querySelectorAll('#sheetIntervalBody .sheetrow')]
      .find(b => b.getAttribute('aria-label') === 'Only at breaks').click()`));
    await settle(c);
    const afterBreaks = await evalJSON(c, `(async () => JSON.stringify({
      granMode: (await import('/state.js')).game().granMode,
      open: document.getElementById('sheetInterval').open,
      pressed: [...document.querySelectorAll('#sheetIntervalBody .sheetrow')]
        .find(b => b.getAttribute('aria-label') === 'Only at breaks').getAttribute('aria-pressed'),
      phrase: document.getElementById('phraseInterval').textContent,
    }))()`);
    ck(afterBreaks.granMode === 'breaksOnly', `game().granMode is "${afterBreaks.granMode}" after "Only at breaks", want "breaksOnly"`);
    ck(afterBreaks.open, 'the sheet closed after choosing "Only at breaks"');
    ck(afterBreaks.pressed === 'true', 'the checkmark did not move to "Only at breaks"');
    ck(afterBreaks.phrase === 'only at breaks', `the interval phrase reads "${afterBreaks.phrase}" after "Only at breaks", want "only at breaks"`);
    await statusOk(c, '#sheetIntervalStatus', ck, minutesOrBlocked);
    // restore RICH's own interval (every 4 min) for what follows.
    await evalIn(c, setGame(`Object.assign(s.game(), { granMode: 'everyN', granValue: 4 });`));
    await evalIn(c, step(`document.getElementById('sheetIntervalClose').click()`));
    await settle(c);

    /* ---- item 6, the blocked-plan wording ---- */
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    // mark absent every player but four -- 7 of the 11.
    await evalIn(c, setGame(`const g = s.game();
      const ids = s.state.players.slice(4).map(p => p.id);
      for (const id of ids) s.setAvailable(g, id, false);`));
    await settle(c);
    const blocked = await evalJSON(c, `JSON.stringify(document.getElementById('sheetWhoStatus').textContent)`);
    ck(typeof blocked === 'string' && blocked.startsWith('Plan blocked: '),
      `the status line reads "${blocked}" with only 4 players in, want it to start "Plan blocked: "`);
    // restore the roster.
    await evalIn(c, setGame(`const g = s.game();
      for (const p of s.state.players) s.setAvailable(g, p.id, true);`));
    await evalIn(c, step(`document.getElementById('sheetWhoClose').click()`));
    await settle(c);

    /* ---- item 8: the folds are gone ---- */
    const gone = await evalJSON(c, `JSON.stringify(['#squadFold', '#fmtFold', '#avail', '#gran',
      '#periods', '#periodMinutes', '#availcount', '#fmthint', '.s-squad', '.s-fmt']
      .filter(sel => document.querySelector(sel)))`);
    ck(gone.length === 0, `still present: ${gone.join(', ')}`);

    /* ---- item 7, "Back": history.back() with Who's here open ---- */
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    await settle(c);
    await evalIn(c, `history.back()`);
    await settle(c);
    const backState = await evalJSON(c, `JSON.stringify({
      openDialogs: [...document.querySelectorAll('dialog[open]')].length,
      today: document.getElementById('view-today')?.hidden === false,
    })`);
    ck(backState.openDialogs === 0, `${backState.openDialogs} dialog(s) still open after history.back()`);
    ck(backState.today, 'Today is not on show after history.back() closed the sheet');

    // back to a clean state for whatever runs after this row.
    await evalIn(c, step(`document.querySelector('.today-game').click()`));
    await settle(c);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  return {
    name: nameOf('sentencesheets'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'the sentence reads exactly, item 2\'s evens-out line, Who\'s here, Format and Sub interval all edit '
        + 'and re-plan, every close path and the resize work, one sheet at a time, and the retired folds stay gone',
  };
}
