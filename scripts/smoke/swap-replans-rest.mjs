/* #247, "What would settle it" F and H: a This stint swap in bench mode
 * re-plans the rest of the game, one Undo takes both back, and closing bench
 * mode leaves no stale stint table or minute bars behind. Run on RICH's Hawks
 * game (11 players, 4 x 8, sub every 4, seed 1234) at 390x844, not started.
 *
 * The expected numbers are the spec's: stints 1-7 carry overrides after the
 * swap, the projected spread is at most one stint (4 min) rather than 8, the
 * toast names both kids' new totals, one Undo empties `live.overrides`, and
 * with By hand the swap re-plans the rest too (#489), while Platoon, which
 * cannot re-plan, writes stint 0 only, as every strategy did before #247.
 * The plan table and minute bars are read off their own DOM, never from a
 * number the page computes the same way the table does.
 */
import { evalIn, step, wait } from './dom.mjs';
import { setGame, readToastExpr } from './sheet-drive.mjs';
import { land } from './page-state.mjs';

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
    first: Object.fromEntries(s.state.players.map(x => [x.id, String(x.name).split(' ')[0]])),
  });
})()`;

const readToast = readToastExpr(undefined, true);

export async function swapReplansRestPass(c, origin, rec) {
  const notes = [];
  await land(c, origin);
  await evalIn(c, setGame(`s.state.day.games[0].live = { at: 0, overrides: {} };`));
  await wait(SETTLE_MS);

  /* ---- F: swap, re-plan, toast ---- */
  await evalIn(c, step(SWAP));
  await wait(SETTLE_MS);
  const after = JSON.parse(await evalIn(c, readGame));
  const ov0 = after.overrides[0] || [];
  const outId = after.planFive.find(id => !ov0.includes(id));
  const inId = ov0.find(id => !after.planFive.includes(id));
  rec.check(outId && inId, `F: stint 0 is ${JSON.stringify(ov0)}, want the swapped five (Ava on, Isabella off)`);
  const missing = [];
  for (let k = 1; k < after.stints; k++) if (!after.overrides[k]) missing.push(k);
  rec.check(!missing.length, `F: stints ${missing.join(', ')} were not re-planned (overrides ${Object.keys(after.overrides)})`);
  rec.check(after.spread <= 4, `F: projected spread is ${after.spread} min, want at most 4`);
  const toast = JSON.parse(await evalIn(c, readToast));
  const wantToast = `${after.first[inId]} on for ${after.first[outId]} this stint. The rest of the game was re-planned to keep minutes even.`;
  rec.check(toast.shown && toast.text === wantToast && toast.hasUndo, `F: the toast reads ${JSON.stringify(toast)}, want "${wantToast}" with Undo`);
  notes.push(`F: a This stint swap re-plans stints 1-${after.stints - 1}, spread ${after.spread}, toast says the rest was re-planned`);

  /* ---- F: one Undo takes the swap and the re-plan back ---- */
  await evalIn(c, step(`document.querySelector('.toast[data-undo] .tundo')?.click()`));
  await wait(SETTLE_MS);
  const undone = JSON.parse(await evalIn(c, readGame));
  rec.check(!Object.keys(undone.overrides).length, `F: one Undo left overrides at stints ${Object.keys(undone.overrides)}, want none`);
  notes.push('F: one Undo empties live.overrides');

  /* ---- H: close bench mode, the plan screen is not stale ---- */
  await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
  await evalIn(c, step(SWAP));
  await wait(SETTLE_MS);
  const swapped = JSON.parse(await evalIn(c, readGame));
  const inH = (swapped.overrides[0] || []).find(id => !swapped.planFive.includes(id));
  const outH = swapped.planFive.find(id => !(swapped.overrides[0] || []).includes(id));
  // Bench mode's own rows show `played / projected` per kid; read the totals
  // there, before closing, as the number the plan screen's bars must agree with.
  const rowsBench = JSON.parse(await evalIn(c, `(async () => {
    const s = await import('/state.js');
    const name = id => (s.state.players.find(x => x.id === id) || {}).name;
    const proj = r => (r?.querySelector('.proj')?.textContent ?? '').replace(/[^\\d.]/g, '');
    const inRow = document.querySelector('#gmFloor [data-pid="' + CSS.escape(${JSON.stringify(inH)}) + '"]');
    const outRow = [...document.querySelectorAll('#gmBench .gm-b')].find(r => r.querySelector('.nm')?.textContent === name(${JSON.stringify(outH)}));
    return JSON.stringify({ inProj: proj(inRow), outProj: proj(outRow) });
  })()`));
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
  rec.check(screen.floor.includes(inName) && !screen.floor.includes(outName), `H: the stint table's first five reads ${JSON.stringify(screen.floor)} after closing, want ${inName} on and ${outName} off`);
  if (!rowsBench.inProj || !rowsBench.outProj) rec.fail(`H: bench mode's rows gave no projected totals to compare the bars against (${JSON.stringify(rowsBench)})`);
  else {
    rec.check(screen.bars[inName] === rowsBench.inProj && screen.bars[outName] === rowsBench.outProj, `H: the minute bars read ${inName} ${screen.bars[inName]}, ${outName} ${screen.bars[outName]}; bench mode's rows said ${rowsBench.inProj} and ${rowsBench.outProj}`);
  }
  notes.push('H: closing bench mode repaints the stint table and the minute bars');

  /* ---- G: a kid marked out after playing keeps their Timeline row ---- */
  await evalIn(c, setGame(`const g = s.state.day.games[0]; g.live = { at: 3, overrides: {} }; g.strategy = 'fair'; s.computeAll();`));
  await wait(SETTLE_MS);
  const rowsBefore = await evalIn(c, `document.querySelectorAll('#timeline .tl-row').length`);
  const avaId = JSON.parse(await evalIn(c, readGame)).planFive[0];
  await evalIn(c, setGame(`s.setAvailable(s.state.day.games[0], ${JSON.stringify(avaId)}, false); s.computeAll();`));
  await wait(SETTLE_MS);
  const gScreen = JSON.parse(await evalIn(c, `(() => {
    document.getElementById('tabledetails').open = true;
    const row = document.querySelector('#timeline .tl-row[data-id=${JSON.stringify(avaId)}]');
    const bars = [...document.querySelectorAll('#plan .mrow')].map(r => [r.querySelector('.nm').textContent, r.querySelector('.v').textContent]);
    return JSON.stringify({
      rows: document.querySelectorAll('#timeline .tl-row').length,
      name: row?.querySelector('.nm')?.textContent ?? null,
      tot: row?.querySelector('.tl-tot .num')?.textContent ?? null,
      label: row?.querySelector('.tl-name')?.getAttribute('aria-label') ?? null,
      bars,
    });
  })()`));
  const gName = (await evalIn(c, `(async () => { const s = await import('/state.js'); return s.plans[0].shortNames[${JSON.stringify(avaId)}]; })()`));
  const gBar = gScreen.bars.find(b => b[0] === gName);
  if (!gBar || !(parseFloat(gBar[1]) > 0)) rec.fail(`G: the minute bars show ${JSON.stringify(gBar)} for the kid marked out, want played minutes above 0`);
  else {
    rec.check(gScreen.rows === Number(rowsBefore) && gScreen.tot === gBar[1], `G: after marking out, the Timeline has ${gScreen.rows} rows (was ${rowsBefore}) and the kid's total reads ${JSON.stringify(gScreen.tot)}, want their row kept at the bars' ${gBar[1]}`);
  }
  notes.push('G: a kid marked out after playing keeps a Timeline row showing their played minutes');

  /* ---- F: By hand re-plans the rest too (#489); Platoon, which still
     cannot re-plan, writes stint 0 only, as every strategy did before #247 ---- */
  await evalIn(c, setGame(`const g = s.state.day.games[0]; g.live = { at: 0, overrides: {} }; g.strategy = 'minutes';`));
  await wait(SETTLE_MS);
  await evalIn(c, step(SWAP));
  await wait(SETTLE_MS);
  const byHand = JSON.parse(await evalIn(c, readGame));
  const handMissing = Array.from({ length: byHand.stints }, (_, i) => i).filter(i => !(i in byHand.overrides));
  rec.check(!handMissing.length, `F: with By hand the swap left stints ${handMissing.join(', ')} without overrides, want the rest re-planned (#489)`);
  await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
  notes.push('F: with By hand the swap re-plans the rest');
  await evalIn(c, setGame(`const g = s.state.day.games[0]; g.live = { at: 0, overrides: {} }; g.strategy = 'platoon'; const ids = s.state.players.map(pl => pl.id).filter(id => !g.out.includes(id)); g.constraints.units = [ids.slice(0, 5), ids.slice(5, 10)];`));
  await wait(SETTLE_MS);
  await evalIn(c, step(SWAP));
  await wait(SETTLE_MS);
  const platoon = JSON.parse(await evalIn(c, readGame));
  rec.check(Object.keys(platoon.overrides).join() === '0', `F: with Platoon the swap wrote overrides at ${Object.keys(platoon.overrides)}, want stint 0 only`);
  await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
  notes.push('F: with Platoon the swap writes stint 0 only');
  rec.ok(notes.join('; '));
}
