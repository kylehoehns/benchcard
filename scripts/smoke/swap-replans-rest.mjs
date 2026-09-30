/* #247, "What would settle it" F and H: a This stint swap in bench mode
 * re-plans the rest of the game, one Undo takes both back, and closing bench
 * mode leaves no stale stint table or minute bars behind. Run on RICH's Hawks
 * game (11 players, 4 x 8, sub every 4, seed 1234) at 390x844, not started.
 *
 * The expected numbers are the spec's: stints 1-7 carry overrides after the
 * swap, the projected spread is at most one stint (4 min) rather than 8, the
 * toast names both kids' new totals, one Undo empties `live.overrides`, and
 * with Set minutes the swap writes stint 0 only, as it did before #247.
 * The plan table and minute bars are read off their own DOM, never from a
 * number the page computes the same way the table does.
 */
import { evalIn, step, wait } from './dom.mjs';
import { goRich } from './fixtures.mjs';
import { setGame, readToastExpr } from './sheet-drive.mjs';

const SETTLE_MS = 450;

// One This stint swap from the bench-mode UI: the first kid on the floor
// comes off, the first kid on the bench goes on.
const SWAP = `
  document.getElementById('abBench').click();
  document.querySelector('#gmFloor .gm-p')?.click();
  document.querySelector('#gmBench button.gm-b')?.click();
`;

const readGame = `(async () => {
  const s = await import('/state.js');
  const g = s.state.day.games[0];
  const p = s.plans[0];
  const mins = s.effectiveMinutes(g, p);
  const v = Object.values(mins);
  return JSON.stringify({
    stints: p.stints.length,
    overrides: g.live.overrides,
    planFive: p.stints[0].onFloor,
    spread: Math.max(...v) - Math.min(...v),
    short: p.shortNames,
  });
})()`;

const readToast = readToastExpr(undefined, true);

export async function swapReplansRestPass(c, origin) {
  const problems = [];
  const notes = [];
  try {
    await goRich(c, origin);
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: 0, overrides: {} };`));
    await wait(SETTLE_MS);

    /* ---- F: swap, re-plan, toast ---- */
    await evalIn(c, step(SWAP));
    await wait(SETTLE_MS);
    const after = JSON.parse(await evalIn(c, readGame));
    const ov0 = after.overrides[0] || [];
    const outId = after.planFive.find(id => !ov0.includes(id));
    const inId = ov0.find(id => !after.planFive.includes(id));
    if (!outId || !inId) problems.push(`F: stint 0 is ${JSON.stringify(ov0)}, want the swapped five (Ava on, Isabella off)`);
    const missing = [];
    for (let k = 1; k < after.stints; k++) if (!after.overrides[k]) missing.push(k);
    if (missing.length) problems.push(`F: stints ${missing.join(', ')} were not re-planned (overrides ${Object.keys(after.overrides)})`);
    if (after.spread > 4) problems.push(`F: projected spread is ${after.spread} min, want at most 4`);
    const toast = JSON.parse(await evalIn(c, readToast));
    if (!toast.shown || !/ on for .* this stint\. .* now ends at [\d.]+ min, .* at [\d.]+\.$/.test(toast.text || '') || !toast.hasUndo) {
      problems.push(`F: the toast reads ${JSON.stringify(toast)}, want "<in> on for <out> this stint. <in> now ends at N min, <out> at M." with Undo`);
    }
    notes.push(`F: a This stint swap re-plans stints 1-${after.stints - 1}, spread ${after.spread}, toast names both totals`);

    /* ---- F: one Undo takes the swap and the re-plan back ---- */
    await evalIn(c, step(`document.querySelector('.toast[data-undo] .tundo')?.click()`));
    await wait(SETTLE_MS);
    const undone = JSON.parse(await evalIn(c, readGame));
    if (Object.keys(undone.overrides).length) {
      problems.push(`F: one Undo left overrides at stints ${Object.keys(undone.overrides)}, want none`);
    }
    notes.push('F: one Undo empties live.overrides');

    /* ---- H: close bench mode, the plan screen is not stale ---- */
    await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
    await evalIn(c, step(SWAP));
    await wait(SETTLE_MS);
    const swapped = JSON.parse(await evalIn(c, readGame));
    const inH = (swapped.overrides[0] || []).find(id => !swapped.planFive.includes(id));
    const outH = swapped.planFive.find(id => !(swapped.overrides[0] || []).includes(id));
    await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
    await wait(SETTLE_MS);
    const screen = JSON.parse(await evalIn(c, `(() => {
      document.getElementById('tabledetails').open = true;
      const floor = document.querySelector('#plan .grid tr:nth-child(2) .floor')?.textContent ?? '';
      const bars = {};
      document.querySelectorAll('#plan .mrow').forEach(r => { bars[r.querySelector('.nm').textContent] = r.querySelector('.v').textContent; });
      return JSON.stringify({ floor: floor.split(' '), bars });
    })()`));
    const inName = swapped.short[inH];
    const outName = swapped.short[outH];
    if (!screen.floor.includes(inName) || screen.floor.includes(outName)) {
      problems.push(`H: the stint table's first five reads ${JSON.stringify(screen.floor)} after closing, want ${inName} on and ${outName} off`);
    }
    const toastNow = JSON.parse(await evalIn(c, readToast));
    const m = /now ends at ([\d.]+) min, .* at ([\d.]+)\.$/.exec(toastNow.text || '');
    if (!m) problems.push(`H: no totals toast to compare the bars against (${JSON.stringify(toastNow)})`);
    else if (screen.bars[inName] !== m[1] || screen.bars[outName] !== m[2]) {
      problems.push(`H: the minute bars read ${inName} ${screen.bars[inName]}, ${outName} ${screen.bars[outName]}; the swap said ${m[1]} and ${m[2]}`);
    }
    notes.push('H: closing bench mode repaints the stint table and the minute bars');

    /* ---- F: with Set minutes, the swap behaves as before #247 ---- */
    await evalIn(c, setGame(`const g = s.state.day.games[0]; g.live = { at: 0, overrides: {} }; g.strategy = 'minutes';`));
    await wait(SETTLE_MS);
    await evalIn(c, step(SWAP));
    await wait(SETTLE_MS);
    const minutesStrategy = JSON.parse(await evalIn(c, readGame));
    if (Object.keys(minutesStrategy.overrides).join() !== '0') {
      problems.push(`F: with Set minutes the swap wrote overrides at ${Object.keys(minutesStrategy.overrides)}, want stint 0 only`);
    }
    await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
    notes.push('F: with Set minutes the swap writes stint 0 only');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await goRich(c, origin).catch(() => {});
  }
  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`
      : notes.join('; '),
  };
}
