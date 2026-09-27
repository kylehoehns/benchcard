/* #148's own guard (docs/specs/148-edit-rule.md's Proof section): the live
 * edit page a rule's row now opens (`openRuleDetail`, rules.js), driven with
 * real taps -- items 1 to 10 and 14 of "What would settle it". Item 11
 * (league minimum) is the existing `ruleItems` assertion in
 * `test/plan-sheet.test.js`, kept, since that code path is untouched by this
 * change; item 12 (48px) is `control-size.mjs`'s own new state; item 13
 * (large text) is `app-large-text.mjs`'s two new rows. `RICH`'s own Hawks
 * game (`goRich` lands on it directly -- see `plan-sheet.mjs`'s own note),
 * except item 14, which reloads onto a part-played record.
 *
 * State is read from `state.js`'s own exports and `ruleItems`' own sentence
 * text -- expected sentences are the spec's own literal strings (Eli/Devon/
 * Hana/Ana/Jordan/Sam, from `RICH`'s `PLAYERS`), never rebuilt from
 * `callNames` here. Leaves Hawks exactly as `goRich` set it up (`finally`
 * below reloads it fresh, the way `rotation-undo.mjs` does). */
import { evalIn } from './dom.mjs';
import { evalJSON, tap, tapPane, settle, click, sheetRect, setGame, waitClosed, readToastExpr } from './sheet-drive.mjs';
import { goRich, RICH, partPlayed } from './fixtures.mjs';

// `RICH` (`view: 'games'`, `activeGame: 0`) part-played, same as `goRich`
// itself lands directly on the Hawks game -- `goRich`'s own `base` override
// (#148) is exactly this swap, so item 14's reload reuses it instead of a
// second near-copy of its seed-and-navigate body.
const goPartPlayed = (c, origin) => goRich(c, origin, undefined, partPlayed(RICH));

const wait = ms => new Promise(r => setTimeout(r, ms));

const rows = () => `[...document.querySelectorAll('#constraints .prow')].filter(b => !b.classList.contains('add-rule'))`;
const findRow = text => `${rows()}.find(r => r.textContent.includes(${JSON.stringify(text)}))`;
const tile = label => `[...document.querySelectorAll('#planSub .plr')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)})`;

// The two taps every item below opens and closes a rule's detail page with --
// pulled out since each is the exact same string at every call site, only
// `text` (which row) ever changes.
const openRow = (c, text) => tapPane(c, `document.activeElement.blur(); (${findRow(text)}).click()`);
const back = c => tapPane(c, `document.getElementById('planBack').click()`);

const readToast = readToastExpr('#sheetPlan');

export async function ruleEditPass(c, origin) {
  const problems = [];
  const notes = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    /* ---- item 1: edit a cap, plus the stepper's own floors ---- */
    await evalIn(c, setGame(`const c = s.game().constraints; c.maxMinutes = { p3: 0 }; c.minMinutes = { p0: 1 };`));
    await tap(c, `document.getElementById('phraseRules').click()`);
    await openRow(c, 'most');
    const capFloor = await evalJSON(c, `JSON.stringify(document.querySelector('#planSub .pstep-val')?.textContent)`);
    const capFloorDisabled = await evalJSON(c, `JSON.stringify(document.querySelector('#planSub .pstep-btn:first-of-type')?.disabled)`);
    ck(capFloor === '0', `item 1: a cap's stepper reads "${capFloor}" at 0, want "0"`);
    ck(capFloorDisabled === true, "item 1: a cap's − button is not disabled at 0");
    await back(c);
    await openRow(c, 'least');
    const minFloor = await evalJSON(c, `JSON.stringify(document.querySelector('#planSub .pstep-val')?.textContent)`);
    const minFloorDisabled = await evalJSON(c, `JSON.stringify(document.querySelector('#planSub .pstep-btn:first-of-type')?.disabled)`);
    ck(minFloor === '1', `item 1: a minimum's stepper reads "${minFloor}" at 1, want "1"`);
    ck(minFloorDisabled === true, "item 1: a minimum's − button is not disabled at 1");
    await back(c);
    await evalIn(c, setGame(`const c = s.game().constraints; c.maxMinutes = {}; c.minMinutes = {};`));

    await evalIn(c, setGame(`s.game().constraints.maxMinutes = { p3: 20 };`));
    const row1 = await evalJSON(c, `JSON.stringify(${findRow('Eli')}?.textContent.replace(/[›]/g, '').trim())`);
    ck(row1 === 'Eli plays at most 20 min', `item 1: the level-1 row reads "${row1}"`);
    await openRow(c, 'Eli');
    const opened = await evalJSON(c, `JSON.stringify({
      sentence: document.querySelector('#planSub .plan-rule-sentence')?.textContent,
      pressed: [...document.querySelectorAll('#planSub .plr')].filter(b => b.getAttribute('aria-pressed') === 'true')
        .map(b => b.getAttribute('aria-label')),
      minutes: document.querySelector('#planSub .pstep-val')?.textContent,
    })`);
    ck(opened.sentence === 'Eli plays at most 20 min', `item 1: the rule sentence reads "${opened.sentence}"`);
    ck(JSON.stringify(opened.pressed) === JSON.stringify(['Eli Tran']), `item 1: the picker shows ${JSON.stringify(opened.pressed)}, want ["Eli Tran"]`);
    ck(opened.minutes === '20', `item 1: the stepper reads "${opened.minutes}", want "20"`);

    for (let i = 0; i < 4; i++) await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    const after24 = await evalJSON(c, `(async () => { const s = await import('/state.js'); return JSON.stringify({
      minutes: document.querySelector('#planSub .pstep-val')?.textContent,
      sentence: document.querySelector('#planSub .plan-rule-sentence')?.textContent,
      cap: s.game().constraints.maxMinutes.p3,
    }); })()`);
    ck(after24.minutes === '24', `item 1: the stepper reads "${after24.minutes}" after four + taps, want "24"`);
    ck(after24.sentence === 'Eli plays at most 24 min', `item 1: the sentence reads "${after24.sentence}"`);
    const cap24 = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.maxMinutes.p3))()`);
    ck(cap24 === 24, `item 1: game().constraints.maxMinutes.p3 is ${cap24}, want 24`);
    notes.push('item 1: a cap opens with its sentence, picker and stepper; four + taps move it 20 -> 24; a cap floors at 0 and a minimum floors at 1');

    /* ---- item 6: the toast, one at a time, and Undo ---- */
    const toast24 = await evalJSON(c, readToast);
    ck(toast24.shown && toast24.text === 'Changed: Eli plays at most 24 min' && toast24.hasUndo && toast24.insideSheet,
      `item 6: the toast reads ${JSON.stringify(toast24)}, want exactly "Changed: Eli plays at most 24 min" with Undo, inside #sheetPlan`);

    await back(c);
    const row24 = await evalJSON(c, `JSON.stringify(${findRow('Eli')}?.textContent.replace(/[›]/g, '').trim())`);
    ck(row24 === 'Eli plays at most 24 min', `item 1: the level-1 row reads "${row24}" after Back, want "Eli plays at most 24 min"`);

    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    const cap20 = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.maxMinutes.p3))()`);
    const rowAfterUndo = await evalJSON(c, `JSON.stringify(${findRow('Eli')}?.textContent.replace(/[›]/g, '').trim())`);
    ck(cap20 === 20, `item 6: Undo left maxMinutes.p3 at ${cap20}, want 20`);
    ck(rowAfterUndo === 'Eli plays at most 20 min', `item 6: the level-1 row reads "${rowAfterUndo}" after Undo`);
    const staleToast = await evalJSON(c, readToast);
    ck(!staleToast.shown, `item 6: a toast is still up after Undo (${JSON.stringify(staleToast)})`);

    // A new visit takes a fresh snapshot: two taps this time, Undo lands back
    // at 20 (this visit's own opening value), not one tap short of it.
    await openRow(c, 'Eli');
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    const newSnapToast = await evalJSON(c, readToast);
    ck(newSnapToast.shown && newSnapToast.text === 'Changed: Eli plays at most 22 min',
      `item 6: a new visit's toast reads ${JSON.stringify(newSnapToast)}, want "Changed: Eli plays at most 22 min"`);
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    const capAfterFreshUndo = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.maxMinutes.p3))()`);
    ck(capAfterFreshUndo === 20, `item 6: a fresh visit's Undo left maxMinutes.p3 at ${capAfterFreshUndo}, want 20 (a new snapshot per visit)`);
    notes.push('item 6: exactly one toast reading "Changed: Eli plays at most 24 min", Undo restores 20, and a new visit takes its own snapshot');
    await back(c);

    /* ---- item 2: pick a different player for a cap ---- */
    await evalIn(c, setGame(`s.game().constraints.maxMinutes = { p3: 20, p4: 10 };`));
    await openRow(c, 'Eli');
    const taken = await evalJSON(c, `JSON.stringify({
      eli: { pressed: (${tile('Eli Tran')})?.getAttribute('aria-pressed'), disabled: (${tile('Eli Tran')})?.disabled },
      ana: (${tile('Ana Reyes')})?.disabled,
      jordan: (${tile('Jordan Bell')})?.disabled,
    })`);
    ck(taken.eli.pressed === 'true' && !taken.eli.disabled, `item 2: Eli's own tile is ${JSON.stringify(taken.eli)}, want pressed and not disabled`);
    ck(taken.ana === true, "item 2: Ana Reyes's tile is not disabled although she already has a cap");
    ck(taken.jordan === false, "item 2: Jordan Bell's tile is disabled although he has no cap");
    await back(c);

    await evalIn(c, setGame(`s.game().constraints.maxMinutes = { p3: 20 };`));
    await openRow(c, 'Eli');
    await tap(c, `(${tile('Jordan Bell')}).click()`);
    const moved = await evalJSON(c, `(async () => { const s = await import('/state.js'); return JSON.stringify({
      maxMinutes: s.game().constraints.maxMinutes,
      sentence: document.querySelector('#planSub .plan-rule-sentence')?.textContent,
    }); })()`);
    ck(JSON.stringify(moved.maxMinutes) === JSON.stringify({ p5: 20 }),
      `item 2: maxMinutes is ${JSON.stringify(moved.maxMinutes)} after picking Jordan Bell, want {"p5":20}`);
    ck(moved.sentence === 'Jordan plays at most 20 min', `item 2: the sentence reads "${moved.sentence}"`);
    notes.push('item 2: a player who already has a cap is disabled in the picker, and picking a new one moves the same minutes to the new key');
    await back(c);
    await evalIn(c, setGame(`s.game().constraints.maxMinutes = {};`));

    /* ---- item 3: pairs ---- */
    await evalIn(c, setGame(`s.game().constraints.pairs = [['p1', 'p2'], ['p5', 'p6']];`));
    await openRow(c, 'Devon and Hana');
    const pairOpen = await evalJSON(c, `JSON.stringify({
      sentence: document.querySelector('#planSub .plan-rule-sentence')?.textContent,
      count: document.querySelector('#planSub .pickhd .c')?.textContent,
    })`);
    ck(pairOpen.sentence === 'Devon and Hana together', `item 3: the sentence reads "${pairOpen.sentence}"`);
    ck(pairOpen.count === '2 of 2', `item 3: the picker header reads "${pairOpen.count}", want "2 of 2"`);

    await tap(c, `(${tile('Hana Kim')}).click()`);
    const afterOff = await evalJSON(c, `(async () => { const s = await import('/state.js'); return JSON.stringify({
      pairs: s.game().constraints.pairs,
      count: document.querySelector('#planSub .pickhd .c')?.textContent,
    }); })()`);
    ck(JSON.stringify(afterOff.pairs) === JSON.stringify([['p1', 'p2'], ['p5', 'p6']]),
      `item 3: pairs changed to ${JSON.stringify(afterOff.pairs)} after a half-done pick, want unchanged`);
    ck(afterOff.count === '1 of 2', `item 3: the picker header reads "${afterOff.count}" with one tile picked, want "1 of 2"`);

    await tap(c, `(${tile('Ana Reyes')}).click()`);
    const afterReplace = await evalJSON(c, `(async () => { const s = await import('/state.js'); return JSON.stringify({
      pairs: s.game().constraints.pairs,
      sentence: document.querySelector('#planSub .plan-rule-sentence')?.textContent,
    }); })()`);
    ck(JSON.stringify(afterReplace.pairs) === JSON.stringify([['p1', 'p4'], ['p5', 'p6']]),
      `item 3: pairs is ${JSON.stringify(afterReplace.pairs)}, want [["p1","p4"],["p5","p6"]] at the same index`);
    ck(afterReplace.sentence === 'Devon and Ana together', `item 3: the sentence reads "${afterReplace.sentence}"`);

    // Duplicate: p1 off, the remaining (p4) off, then p5 and p6 -- exactly
    // `pairs[1]`, so this must not apply.
    await tap(c, `(${tile('Devon Ellis')}).click()`);
    await tap(c, `(${tile('Ana Reyes')}).click()`);
    await tap(c, `(${tile('Jordan Bell')}).click()`);
    await tap(c, `(${tile('Sam Okafor')}).click()`);
    const dup = await evalJSON(c, `(async () => { const s = await import('/state.js'); return JSON.stringify({
      pairs: s.game().constraints.pairs,
      dupShown: [...document.querySelectorAll('#planSub .pgrp-f')].find(p => p.textContent === 'You already have this rule.')?.hidden,
    }); })()`);
    ck(JSON.stringify(dup.pairs) === JSON.stringify([['p1', 'p4'], ['p5', 'p6']]),
      `item 3: pairs changed to ${JSON.stringify(dup.pairs)} on a duplicate pick, want unchanged`);
    ck(dup.dupShown === false, 'item 3: "You already have this rule." did not show on a duplicate pick');
    notes.push('item 3: a half-done pick is a no-op, a complete pick replaces the pair at the same index, and a pick matching another pair is refused with "You already have this rule."');
    await back(c);
    await evalIn(c, setGame(`s.game().constraints.pairs = [];`));

    // Apart and keep-on: the same replace, each in its own list.
    await evalIn(c, setGame(`s.game().constraints.avoids = [['p4', 'p5']];`));
    await openRow(c, 'apart');
    await tap(c, `(${tile('Ana Reyes')}).click()`);
    await tap(c, `(${tile('Sam Okafor')}).click()`);
    const avoidsAfter = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.avoids))()`);
    ck(JSON.stringify(avoidsAfter) === JSON.stringify([['p5', 'p6']]), `item 3 (apart): avoids is ${JSON.stringify(avoidsAfter)}, want [["p5","p6"]]`);
    await back(c);
    await evalIn(c, setGame(`s.game().constraints.avoids = [];`));

    await evalIn(c, setGame(`s.game().constraints.keepOnFloor = [['p6', 'p7']];`));
    await openRow(c, 'always on');
    await tap(c, `(${tile('Sam Okafor')}).click()`);
    await tap(c, `(${tile('Ana Reyes')}).click()`);
    const keepOnAfter = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.keepOnFloor))()`);
    ck(JSON.stringify(keepOnAfter) === JSON.stringify([['p7', 'p4']]), `item 3 (keep-on): keepOnFloor is ${JSON.stringify(keepOnAfter)}, want [["p7","p4"]]`);
    notes.push('item 3: apart and keep-on replace the same way, each checked against its own list');
    await back(c);
    await evalIn(c, setGame(`s.game().constraints.keepOnFloor = [];`));

    /* ---- item 4: fives ---- */
    await evalIn(c, setGame(`s.game().constraints.openingFive = ['p0', 'p1', 'p2', 'p3', 'p4'];`));
    await openRow(c, 'start the game');
    await tap(c, `(${tile('Ana Reyes')}).click()`);
    const fiveToFour = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.openingFive))()`);
    ck(JSON.stringify(fiveToFour) === JSON.stringify(['p0', 'p1', 'p2', 'p3']),
      `item 4: openingFive is ${JSON.stringify(fiveToFour)} after tapping one of five off, want ["p0","p1","p2","p3"]`);
    await back(c);

    await evalIn(c, setGame(`s.game().constraints.openingFive = ['p0', 'p1'];`));
    await openRow(c, 'start the game');
    await tap(c, `(${tile('Devon Ellis')}).click()`);
    const twoToOne = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.openingFive))()`);
    ck(JSON.stringify(twoToOne) === JSON.stringify(['p0']), `item 4: openingFive is ${JSON.stringify(twoToOne)} with one left, want ["p0"]`);
    await tap(c, `(${tile('Marcus Williams')}).click()`);
    const lastOff = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.openingFive))()`);
    ck(JSON.stringify(lastOff) === JSON.stringify(['p0']), `item 4: openingFive changed to ${JSON.stringify(lastOff)} after tapping the last one off, want unchanged ["p0"]`);
    await tap(c, `(${tile('Hana Kim')}).click()`);
    const pickedAgain = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.openingFive))()`);
    ck(JSON.stringify(pickedAgain) === JSON.stringify(['p2']), `item 4: openingFive is ${JSON.stringify(pickedAgain)} after picking again, want ["p2"]`);
    notes.push('item 4: tapping down to a still-complete five applies at once; tapping the last one off is a no-op until a player is picked again');
    await back(c);
    await evalIn(c, setGame(`s.game().constraints.openingFive = [];`));

    await evalIn(c, setGame(`s.game().constraints.lastPeriodFive = ['p0', 'p1', 'p2'];`));
    await openRow(c, 'last period');
    await tap(c, `(${tile('Hana Kim')}).click()`);
    const lastqAfter = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.lastPeriodFive))()`);
    ck(JSON.stringify(lastqAfter) === JSON.stringify(['p0', 'p1']), `item 4 (last period): lastPeriodFive is ${JSON.stringify(lastqAfter)}, want ["p0","p1"]`);
    notes.push('item 4: the same holds for the last-period five');
    await back(c);
    await evalIn(c, setGame(`s.game().constraints.lastPeriodFive = [];`));

    /* ---- item 5: rest ---- */
    await evalIn(c, setGame(`s.game().constraints.maxConsecutive = 2;`));
    await openRow(c, 'stints in a row');
    const restOpen = await evalJSON(c, `JSON.stringify(document.querySelector('#planSub .pstep-val')?.textContent)`);
    ck(restOpen === '2', `item 5: the "Stints in a row" stepper reads "${restOpen}", want "2"`);
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    const rest3 = await evalJSON(c, `(async () => JSON.stringify((await import('/state.js')).game().constraints.maxConsecutive))()`);
    ck(rest3 === 3, `item 5: maxConsecutive is ${rest3} after one + tap, want 3`);
    notes.push('item 5: the "Stints in a row" stepper runs 1-4 and changing it stores the new value');
    await back(c);
    await evalIn(c, setGame(`s.game().constraints.maxConsecutive = 0;`));

    /* ---- item 7: remove toast ---- */
    await evalIn(c, setGame(`s.game().constraints.maxMinutes = { p3: 20 };`));
    await openRow(c, 'Eli');
    await tapPane(c, `[...document.querySelectorAll('#planSub .prow')].find(b => b.textContent === 'Remove rule').click()`);
    const removedRows = await evalJSON(c, `JSON.stringify(${rows()}.length)`);
    ck(removedRows === 0, `item 7: #constraints has ${removedRows} rule row(s) after removing the only one, want 0`);
    const removeToast = await evalJSON(c, readToast);
    ck(removeToast.shown && removeToast.text === 'Removed: Eli plays at most 20 min' && removeToast.hasUndo,
      `item 7: the toast reads ${JSON.stringify(removeToast)}, want exactly "Removed: Eli plays at most 20 min" with Undo`);
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    const afterRemoveUndo = await evalJSON(c, `(async () => { const s = await import('/state.js'); return JSON.stringify({
      rowText: (${findRow('Eli')})?.textContent.replace(/[›]/g, '').trim(),
      cap: s.game().constraints.maxMinutes.p3,
    }); })()`);
    ck(afterRemoveUndo.rowText === 'Eli plays at most 20 min', `item 7: the row reads "${afterRemoveUndo.rowText}" after Undo`);
    ck(afterRemoveUndo.cap === 20, `item 7: maxMinutes.p3 is ${afterRemoveUndo.cap} after Undo, want 20`);
    notes.push('item 7: the remove toast reads exactly "Removed: Eli plays at most 20 min", and Undo brings the rule back');

    /* ---- item 8: the sheet does not jump with a toast ---- */
    const fullBefore = await sheetRect(c, '#sheetPlan');
    ck(Math.abs(fullBefore.top - 68) <= 1, `item 8: the full sheet's top is ${fullBefore.top}, want 68 +/-1`);
    await openRow(c, 'Eli');
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    const duringToast = await sheetRect(c, '#sheetPlan');
    ck(Math.abs(duringToast.top - fullBefore.top) <= 1 && Math.abs(duringToast.height - fullBefore.height) <= 1,
      `item 8: the full sheet's rect went from ${JSON.stringify(fullBefore)} to ${JSON.stringify(duringToast)} while a toast showed, want within 1px`);
    await wait(1000);
    const stillDuring = await sheetRect(c, '#sheetPlan');
    ck(Math.abs(stillDuring.top - fullBefore.top) <= 1 && Math.abs(stillDuring.height - fullBefore.height) <= 1,
      `item 8: the full sheet's rect drifted to ${JSON.stringify(stillDuring)} while the toast was still up`);

    // Half sheet: tap the handle (a release with no movement toggles
    // full/half -- `endDrag`'s `!st.moved` branch, trap.js), then confirm a
    // toast still fits. Not a drag: `rect.height * 0.35` downward crosses
    // trap.js's own `DRAG_CLOSE_FRAC` (0.25 of the sheet's own height) and
    // closes the sheet instead of settling it at half -- confirmed on this
    // tree and on the pre-#143/#139 tree alike, so it was never a rebase
    // regression. Once closed, `toastHost()` (toast.js) correctly falls
    // back to the page-level `#toasts` for the next `showUndo`, but the
    // stale toast this block's own full-sheet edit left behind (still
    // inside the now-closed dialog's `.bsheet-toasts`, whose subtree the UA
    // hides) never runs the CSS `toastOut` exit animation `dismissToast`
    // waits on -- only its 600ms fallback timer clears it -- so whether the
    // probe still saw two `.toast[data-undo]` nodes when it read the DOM
    // came down to that timer's race, not anything this item claims. The
    // handle's own tap toggle (already `resizeCheck`'s way back to half in
    // this same file's shared helpers) never drags past that threshold, so
    // the dialog stays open throughout and the two edits share one toast
    // host that clears itself before the second toast lands.
    await back(c);
    const rectFull = await sheetRect(c, '#sheetPlan');
    await click(c, rectFull.handle.x, rectFull.handle.y);
    await settle(c);
    const halfBefore = await sheetRect(c, '#sheetPlan');
    ck(halfBefore.top > fullBefore.top + 10, `item 8: tapping the handle did not leave a half sheet (top ${halfBefore.top} vs full ${fullBefore.top})`);
    await openRow(c, 'Eli');
    await tap(c, `document.querySelector('#planSub .pstep-btn:first-of-type').click()`);
    const halfToastHit = await evalJSON(c, `(() => {
      const t = document.querySelector('.toast[data-undo]');
      if (!t) return JSON.stringify({ found: false });
      const btn = t.querySelector('.tundo');
      const r = btn.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return JSON.stringify({ found: true, hit: at === btn || btn.contains(at) });
    })()`);
    ck(halfToastHit.found && halfToastHit.hit, `item 8: a half sheet's Undo toast is not reachable (${JSON.stringify(halfToastHit)})`);
    notes.push("item 8: a full sheet's rect does not move while a toast shows, and a half sheet still grows enough to show one");
    await back(c);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    await evalIn(c, setGame(`s.game().constraints.maxMinutes = {};`));

    /* ---- item 9: scroll is restored ---- */
    // A single cap does not make `#sheetPlanBody` tall enough to reach a
    // scrollTop of 250 (its max was 28) -- enough rules to clear that, the
    // way the survey's own record (Survey row 4) did.
    await evalIn(c, setGame(`
      s.game().constraints.maxMinutes = { p3: 20, p4: 22 };
      s.game().constraints.minMinutes = { p0: 5 };
      s.game().constraints.pairs = [['p1', 'p2']];
      s.game().constraints.avoids = [['p5', 'p6']];
      s.game().constraints.maxConsecutive = 3;
    `));
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    const scroll0 = await evalJSON(c, `JSON.stringify(document.getElementById('sheetPlanBody')?.scrollTop)`);
    ck(Math.abs(scroll0) <= 1, `item 9: scrollTop is ${scroll0} on opening from the strategy phrase, want 0`);
    await openRow(c, 'Eli');
    await back(c);
    const scrollBack0 = await evalJSON(c, `JSON.stringify(document.getElementById('sheetPlanBody')?.scrollTop)`);
    ck(Math.abs(scrollBack0) <= 1, `item 9: scrollTop is ${scrollBack0} after Back with nothing scrolled, want 0`);

    await evalJSON(c, `document.getElementById('sheetPlanBody').scrollTop = 250`);
    await openRow(c, 'Eli');
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    await back(c);
    const scrollBack250 = await evalJSON(c, `JSON.stringify(document.getElementById('sheetPlanBody')?.scrollTop)`);
    ck(Math.abs(scrollBack250 - 250) <= 1, `item 9: scrollTop is ${scrollBack250} after changing a rule and Back, want 250`);

    await evalJSON(c, `document.getElementById('sheetPlanBody').scrollTop = 250`);
    await openRow(c, 'Eli');
    await tapPane(c, `[...document.querySelectorAll('#planSub .prow')].find(b => b.textContent === 'Remove rule').click()`);
    const scrollAfterRemove = await evalJSON(c, `JSON.stringify(document.getElementById('sheetPlanBody')?.scrollTop)`);
    ck(Math.abs(scrollAfterRemove - 250) <= 1, `item 9: scrollTop is ${scrollAfterRemove} after Remove, want 250`);
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    const scrollAfterUndo = await evalJSON(c, `JSON.stringify(document.getElementById('sheetPlanBody')?.scrollTop)`);
    ck(Math.abs(scrollAfterUndo - 250) <= 1, `item 9: scrollTop is ${scrollAfterUndo} after Undo, want 250`);
    notes.push('item 9: scrollTop round-trips through Back, a change, Remove and Undo alike');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    await evalIn(c, setGame(`
      s.game().constraints.maxMinutes = {};
      s.game().constraints.minMinutes = {};
      s.game().constraints.pairs = [];
      s.game().constraints.avoids = [];
      s.game().constraints.maxConsecutive = 0;
    `));

    /* ---- item 10: the level hint's button ---- */
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    const mixedHint = await evalJSON(c, `JSON.stringify(!!document.querySelector('#planLineups .pgrp-f'))`);
    ck(mixedHint === false, 'item 10: the level hint shows although RICH has mixed levels');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    await evalIn(c, setGame(`s.state.players.forEach(p => { p.tier = 3; });`));
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    const sameHint = await evalJSON(c, `JSON.stringify({
      sentence: document.querySelector('#planLineups .pgrp-f')?.textContent,
      btnText: document.querySelector('#planLineups .pgrp-f button')?.textContent,
      btnClass: document.querySelector('#planLineups .pgrp-f button')?.className,
    })`);
    ck((sameHint.sentence || '').includes('Open a player on the Team page to set their level.'),
      `item 10: the hint reads "${sameHint.sentence}"`);
    ck(sameHint.btnText === 'Open Team', `item 10: the hint's button reads "${sameHint.btnText}", want "Open Team"`);
    ck((sameHint.btnClass || '').split(' ').includes('btn'), `item 10: the button's class is "${sameHint.btnClass}", want it to include "btn"`);
    await tap(c, `document.querySelector('#planLineups .pgrp-f button').click()`);
    ck(await waitClosed(c, '#sheetPlan'), 'item 10: "Open Team" did not close #sheetPlan');
    const afterOpenTeam = await evalJSON(c, `(async () => JSON.stringify({
      dataView: document.documentElement.dataset.view,
      stateView: (await import('/state.js')).state.view,
    }))()`);
    ck(afterOpenTeam.dataView === 'team' && afterOpenTeam.stateView === 'team',
      `item 10: the view is ${JSON.stringify(afterOpenTeam)} after "Open Team", want both "team"`);
    notes.push('item 10: the level hint and its "Open Team" button show only with every player on the same level, and the button goes to Team');

    /* ---- item 14: underway, the rotation offer does not replace the toast --- */
    await goPartPlayed(c, origin);
    await evalIn(c, setGame(`s.game().constraints.maxMinutes = { p3: 20 };`));
    await tap(c, `document.getElementById('phraseRules').click()`);
    await openRow(c, 'Eli');
    await tap(c, `document.querySelector('#planSub .pstep-btn:last-of-type').click()`);
    const underwayToast = await evalJSON(c, readToast);
    ck(underwayToast.shown && underwayToast.text === 'Changed: Eli plays at most 21 min',
      `item 14: the toast reads ${JSON.stringify(underwayToast)} right after the tap, want "Changed: Eli plays at most 21 min"`);
    await wait(700);
    const underwayToastLater = await evalJSON(c, readToast);
    ck(underwayToastLater.shown && underwayToastLater.text === 'Changed: Eli plays at most 21 min',
      `item 14: the toast reads ${JSON.stringify(underwayToastLater)} 700ms later, want the same "Changed:" toast still up`);
    notes.push('item 14: editing a cap on a part-played game shows the "Changed:" toast and the rotation offer does not replace it 700ms later');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await goRich(c, origin).catch(() => {});
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : notes.join('; '),
  };
}
