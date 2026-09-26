/* #134, "What would settle it" items 1, 2, 3 and 5: on RICH's Hawks game
 * (`g0`) underway at `live.at` 2 with one hand swap already in `live.overrides`
 * -- seeded with `setGame`, the way `pass-underway.mjs` seeds a part-played
 * game, rather than driving Start/swap/step-forward by hand each time this
 * check runs -- four different edits that rebuild the rotation (Format's
 * minutes-per-period stepper, Sub interval, Who's here, and the Plan sheet's
 * strategy seg) each get the same "Rotation changed." toast with an Undo
 * button, and Undo puts the game's periods/period minutes, `live.overrides`,
 * `live.at` and the plan table's own played-minutes column back exactly as
 * they read before the edit (item 2's own list). Item 6 (the toast fitting at
 * 390x844 and 320px/32px) is `/browser-verify`'s job, per the spec's Proof
 * table -- nothing here repeats it.
 *
 * Item 5's two smoke-seam bullets: "out for the rest" (`sitRest`, gamemode.js)
 * already calls its own `undoable` and only ever touches `live.overrides` for
 * stints still ahead of `live.at` -- the base plan a rotation stamp is taken
 * from never moves, so this is also the regression guard for a future change
 * that routes it through a real `render()` and would otherwise show a second,
 * competing toast. The other bullet -- no second toast from Undo's own
 * restore -- is checked after every one of the four edits above, not just
 * once.
 *
 * The played-minutes comparison reads `#plan .mrow`'s own `.nm`/`.v` text,
 * before the edit and again after Undo, and asserts the two lists are
 * byte-for-byte the same -- never a number recomputed from `effectiveMinutes`
 * the way the page itself computes it, which would just be the app checking
 * itself. `countTo` (fx.js) animates a changed number over up to 250ms with
 * no CSS/WAAPI animation behind it, so `step()`'s own `SETTLE` (which polls
 * `document.getAnimations()`) does not wait for it and every read here does
 * so by hand, on top of the 140ms `edit()` debounce a non-`now` edit kind
 * (Format, Sub interval, Who's here) schedules its repaint behind.
 */
import { evalIn, step } from './dom.mjs';
import { goRich } from './fixtures.mjs';
import { setGame } from './sheet-drive.mjs';

const wait = ms => new Promise(r => setTimeout(r, ms));

// Debounced kinds (`format`, `availability`) repaint 140ms after the edit;
// `countTo` can still be counting up to 250ms after that. `now: true` kinds
// (`strategy`) repaint synchronously, but the wait is harmless there too.
const SETTLE_MS = 450;

const readGame = `(async () => {
  const s = await import('/state.js');
  const g = s.state.day.games[0];
  return JSON.stringify({
    periods: g.periods, periodMinutes: g.periodMinutes,
    granMode: g.granMode, granValue: g.granValue, strategy: g.strategy,
    overrides: g.live.overrides, at: g.live.at,
  });
})()`;

const readMinutes = `(() => {
  const d = document.getElementById('tabledetails');
  if (d) d.open = true;
  return JSON.stringify([...document.querySelectorAll('#plan .mrow')].map(r => ({
    nm: r.querySelector('.nm')?.textContent ?? null,
    v: r.querySelector('.v')?.textContent ?? null,
  })));
})()`;

const readToast = `(() => {
  const t = document.querySelector('.toast[data-undo]');
  if (!t) return JSON.stringify({ shown: false });
  return JSON.stringify({
    shown: true,
    text: t.querySelector('.tmsg')?.textContent ?? null,
    hasUndo: !!t.querySelector('.tundo'),
  });
})()`;

// Item 6 follow-up: a half sheet (`dialog.bsheet.bsheet-half`) has to stay at
// its ordinary 422px-tall resting height at 390x844/16px root once the Undo
// toast mounts inside it -- the `:has()` rule that grows the sheet for a
// toast that does not fit (app.css) must not also let a long `.bsheet-body`
// (Who's here's player list) pull the whole dialog taller than the toast
// itself needs. Reads the dialog's own rect, not anything computed from the
// body/header/status boxes the way the CSS derives it.
const readSheetRect = sel => `(() => {
  const d = document.querySelector(${JSON.stringify(sel)});
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return JSON.stringify({ top: r.top, height: r.height });
})()`;

const CLEARED = 'Rotation changed. The swaps you made by hand were cleared.';

// Repeated after every one of the four edits below: click the toast's own
// Undo, let the debounce and countTo settle, then confirm the restore did
// not itself raise a second, competing toast (item 5's "no second toast from
// Undo's own restore" bullet).
const clickUndo = async (c) => {
  await evalIn(c, step(`document.querySelector('.toast[data-undo] .tundo')?.click()`));
  await wait(SETTLE_MS);
};

const checkNoStaleToast = async (c, problems, label) => {
  const stale = JSON.parse(await evalIn(c, readToast));
  if (stale.shown) {
    problems.push(`item 5: a second Undo toast (${JSON.stringify(stale.text)}) appeared from Undo's own restore`
      + (label ? ` (${label})` : ''));
  }
};

// Hawks underway at live.at 2, one hand swap at stint 1 -- the exact seed
// `rotationUndoPass` below drives item 1's Format edit from. Exported so
// `app-large-text.mjs`'s own large-text state for the same edit (item 6)
// reuses this literal rather than re-deriving a second "underway with one
// swap" fixture that could quietly drift from this one.
export const UNDERWAY_SEED = `
  const p = s.plans[0];
  const five = p.stints[1].onFloor.slice();
  const benchId = s.state.players.map(pl => pl.id).find(id => !five.includes(id));
  five[0] = benchId;
  s.state.day.games[0].live = { at: 2, overrides: { 1: five } };
`;

export async function rotationUndoPass(c, origin) {
  const problems = [];
  const notes = [];

  try {
    /* ---- seed: Hawks underway at live.at 2, one hand swap at stint 1 ---- */
    await evalIn(c, setGame(UNDERWAY_SEED));
    await wait(SETTLE_MS);

    const baseline = JSON.parse(await evalIn(c, readGame));
    if (Object.keys(baseline.overrides).length !== 1) {
      problems.push(`seed: live.overrides is ${JSON.stringify(baseline.overrides)}, want exactly one swap`);
    }
    const beforeMinutes = JSON.parse(await evalIn(c, readMinutes));
    if (!beforeMinutes.length) problems.push('seed: #plan has no .mrow rows -- check is reading the wrong screen');

    /* ---- items 1, 2: Format's − stepper on minutes per period ---- */
    await evalIn(c, step(`document.getElementById('phraseFormat').click()`));
    await evalIn(c, step(
      `document.querySelector('#sheetFormatBody .pstep-row:last-child .pstep-btn:first-of-type').click()`));
    await wait(SETTLE_MS);

    const afterFormat = JSON.parse(await evalIn(c, readGame));
    if (afterFormat.periodMinutes !== baseline.periodMinutes - 1) {
      problems.push(`item 1: periodMinutes is ${afterFormat.periodMinutes} after the − stepper, `
        + `want ${baseline.periodMinutes - 1}`);
    }
    const toast1 = JSON.parse(await evalIn(c, readToast));
    if (!toast1.shown) problems.push('item 1: no Undo toast after the Format change');
    else {
      if (toast1.text !== CLEARED) problems.push(`item 1: the toast reads ${JSON.stringify(toast1.text)}, want ${JSON.stringify(CLEARED)}`);
      if (!toast1.hasUndo) problems.push('item 1: the toast has no Undo button');
    }
    notes.push('item 1: Format\'s − stepper on an underway game with a hand swap offers the cleared-swaps toast with Undo');

    await clickUndo(c);
    const afterUndo1 = JSON.parse(await evalIn(c, readGame));
    if (afterUndo1.periods !== baseline.periods || afterUndo1.periodMinutes !== baseline.periodMinutes) {
      problems.push(`item 2: Undo left periods/periodMinutes at ${afterUndo1.periods}/${afterUndo1.periodMinutes}, `
        + `want ${baseline.periods}/${baseline.periodMinutes}`);
    }
    if (JSON.stringify(afterUndo1.overrides) !== JSON.stringify(baseline.overrides)) {
      problems.push(`item 2: Undo left live.overrides as ${JSON.stringify(afterUndo1.overrides)}, `
        + `want ${JSON.stringify(baseline.overrides)}`);
    }
    if (afterUndo1.at !== baseline.at) problems.push(`item 2: Undo left live.at at ${afterUndo1.at}, want ${baseline.at}`);
    const afterUndoMinutes = JSON.parse(await evalIn(c, readMinutes));
    if (JSON.stringify(afterUndoMinutes) !== JSON.stringify(beforeMinutes)) {
      problems.push('item 2: the plan table\'s played minutes after Undo do not match those from before the change '
        + `(before ${JSON.stringify(beforeMinutes)}, after ${JSON.stringify(afterUndoMinutes)})`);
    }
    await checkNoStaleToast(c, problems);
    notes.push('item 2: Undo restores periods, periodMinutes, live.overrides, live.at and the plan table\'s played minutes; no second toast from the restore');
    await evalIn(c, step(`document.getElementById('sheetFormatClose')?.click()`));

    /* ---- item 3: Sub interval (same toast, same Undo) ---- */
    await evalIn(c, step(`document.getElementById('phraseInterval').click()`));
    // index 7 of GRAN_CHOICES (state.js) is "breaksOnly" -- the one choice
    // furthest from RICH's own "every 4 min", so this always picks a
    // different row rather than depending on which one starts selected.
    await evalIn(c, step(`document.querySelectorAll('#sheetIntervalBody .sheetrow')[7].click()`));
    await wait(SETTLE_MS);
    const afterInterval = JSON.parse(await evalIn(c, readGame));
    if (afterInterval.granMode !== 'breaksOnly') {
      problems.push(`item 3 (sub interval): granMode is ${JSON.stringify(afterInterval.granMode)} `
        + 'after picking "Breaks only", want "breaksOnly"');
    }
    const toast2 = JSON.parse(await evalIn(c, readToast));
    if (!toast2.shown || toast2.text !== CLEARED || !toast2.hasUndo) {
      problems.push(`item 3 (sub interval): toast reads ${JSON.stringify(toast2)}, want ${JSON.stringify(CLEARED)} with Undo`);
    }
    await clickUndo(c);
    const afterUndo2 = JSON.parse(await evalIn(c, readGame));
    if (afterUndo2.granMode !== baseline.granMode || afterUndo2.granValue !== baseline.granValue) {
      problems.push(`item 3 (sub interval): Undo left granMode/granValue at ${afterUndo2.granMode}/${afterUndo2.granValue}, `
        + `want ${baseline.granMode}/${baseline.granValue}`);
    }
    if (JSON.stringify(afterUndo2.overrides) !== JSON.stringify(baseline.overrides) || afterUndo2.at !== baseline.at) {
      problems.push('item 3 (sub interval): Undo did not restore live.overrides/live.at '
        + `(${JSON.stringify(afterUndo2.overrides)}/${afterUndo2.at}, want ${JSON.stringify(baseline.overrides)}/${baseline.at})`);
    }
    await checkNoStaleToast(c, problems, 'sub interval');
    notes.push('item 3: Sub interval offers the same toast and Undo restores it');
    await evalIn(c, step(`document.getElementById('sheetIntervalClose')?.click()`));

    /* ---- item 3: Who's here (marking a player absent) ---- */
    await evalIn(c, step(`document.getElementById('phrasePlayers').click()`));
    const beforeToastRect = JSON.parse(await evalIn(c, readSheetRect('#sheetWho')));
    await evalIn(c, step(`(async () => {
      const s = await import('/state.js');
      const five = s.state.day.games[0].live.overrides['1'];
      const target = s.state.players.find(p => !five.includes(p.id));
      const rows = [...document.querySelectorAll('#sheetWhoBody .sheetrow')];
      const row = rows.find(r => r.getAttribute('aria-label') === (target.name || 'Unnamed'));
      row.click();
    })()`));
    await wait(SETTLE_MS);
    const toast3 = JSON.parse(await evalIn(c, readToast));
    if (!toast3.shown || !(toast3.text || '').startsWith('Rotation changed.') || !toast3.hasUndo) {
      problems.push(`item 3 (who's here): toast reads ${JSON.stringify(toast3)}, want "Rotation changed." with Undo`);
    }
    // Item 6 follow-up: at 390x844/16px root, #sheetWho is a half sheet with
    // room for the header, toast and status line without growing past 422px
    // -- the toast showing must not change its height by more than 1px.
    const afterToastRect = JSON.parse(await evalIn(c, readSheetRect('#sheetWho')));
    if (!beforeToastRect || !afterToastRect) {
      problems.push(`item 6: could not measure #sheetWho's rect (before ${JSON.stringify(beforeToastRect)}, `
        + `after ${JSON.stringify(afterToastRect)})`);
    } else if (Math.abs(afterToastRect.height - beforeToastRect.height) > 1) {
      problems.push(`item 6: #sheetWho's height went from ${beforeToastRect.height} to ${afterToastRect.height} `
        + 'when the Undo toast appeared at 390x844/16px root, want within 1px -- the body should scroll, not grow the sheet');
    }
    await clickUndo(c);
    const afterUndo3 = JSON.parse(await evalIn(c, readGame));
    if (afterUndo3.at !== baseline.at || JSON.stringify(afterUndo3.overrides) !== JSON.stringify(baseline.overrides)) {
      problems.push(`item 3 (who's here): Undo did not restore live.at/live.overrides (${afterUndo3.at}/${JSON.stringify(afterUndo3.overrides)})`);
    }
    await checkNoStaleToast(c, problems, "who's here");
    notes.push('item 3: Who\'s here (marking a player absent) offers Undo and it restores live');
    await evalIn(c, step(`document.getElementById('sheetWhoClose')?.click()`));

    /* ---- item 3: the Plan sheet's strategy seg ---- */
    await evalIn(c, step(`document.getElementById('phraseStrategy').click()`));
    await evalIn(c, step(`[...document.querySelectorAll('#stratseg button')].find(b => b.textContent === 'By hand').click()`));
    await wait(SETTLE_MS);
    const toast4 = JSON.parse(await evalIn(c, readToast));
    if (!toast4.shown || !(toast4.text || '').startsWith('Rotation changed.') || !toast4.hasUndo) {
      problems.push(`item 3 (strategy): toast reads ${JSON.stringify(toast4)}, want "Rotation changed." with Undo`);
    }
    await clickUndo(c);
    const afterUndo4 = JSON.parse(await evalIn(c, readGame));
    if (afterUndo4.strategy !== baseline.strategy) {
      problems.push(`item 3 (strategy): Undo left strategy at ${JSON.stringify(afterUndo4.strategy)}, want ${JSON.stringify(baseline.strategy)}`);
    }
    if (afterUndo4.at !== baseline.at || JSON.stringify(afterUndo4.overrides) !== JSON.stringify(baseline.overrides)) {
      problems.push('item 3 (strategy): Undo did not restore live.at/live.overrides');
    }
    await checkNoStaleToast(c, problems, 'strategy');
    notes.push('item 3: the Plan sheet\'s strategy seg offers the same Undo, which restores strategy along with the rest');
    await evalIn(c, step(`document.getElementById('sheetPlanClose')?.click()`));

    /* ---- item 5: "out for the rest" (an existing `undoable`) keeps its
       own toast; it must not be replaced by a second one. `sitRest`
       (gamemode.js) only ever writes `live.overrides` for stints still
       ahead of `live.at` -- the base plan's own rotation never moves, so
       this also guards against a future change routing it through a real
       `render()` and showing a second, competing toast. ---- */
    await evalIn(c, step(`document.getElementById('abBench').click()`));
    await evalIn(c, step(`document.querySelector('#gmFloor .gm-p')?.click()`));
    await evalIn(c, step(`[...document.querySelectorAll('.gm-scope button')].find(b => b.textContent === 'Sit, rebalance')?.click()`));
    await wait(SETTLE_MS);
    const toasts5 = JSON.parse(await evalIn(c, `JSON.stringify([...document.querySelectorAll('.toast[data-undo]')]
      .map(t => t.querySelector('.tmsg')?.textContent ?? null))`));
    if (toasts5.length !== 1 || !(toasts5[0] || '').endsWith('is out for the rest. The rest of the game rebalanced.')) {
      problems.push(`item 5: after "Sit, rebalance" the live undo toast(s) read ${JSON.stringify(toasts5)}, `
        + 'want exactly one, ending "is out for the rest. The rest of the game rebalanced." -- not replaced');
    }
    await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
    notes.push('item 5: "out for the rest" keeps its own Undo toast, not replaced by a second one');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    // setup:'rich' checks share one page: leave the fixture the way the row
    // after this one expects to find it.
    await goRich(c, origin).catch(() => {});
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`
      : notes.join('; '),
  };
}
