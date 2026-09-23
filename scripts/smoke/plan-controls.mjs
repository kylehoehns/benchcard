import { evalIn, step, toGameOne, TODAY_HOME } from './dom.mjs';

/* #28 review finding: item 11 asks the Plan sheet's OTHER controls -- not
   only its rows (`plan-rows.mjs` already sweeps those) -- to clear 48x48:
   the strategy segments, the kind/closing chips, the player tiles, the
   stepper buttons, the back button, the ✕ and "Add rule". `smoke-checks.js`'s
   `plan sheet controls ≥ 48px` is what actually measures a fixed list of
   them (the same shape `today-game-rows.mjs` drives for its own named list);
   this drives the two states that between them show every one on the list:
   level 1 (segments, rows, ✕) and the add page (chips, tiles, stepper
   buttons, the back button, "Add rule"). One viewport only -- 320/360/390px
   is `plan rows ≥ 48px`'s own claim (item 11's row-and-tile-height bullet),
   not this one's. */
const PLAN_CONTROL_STATES = [
  { name: 'level 1', open: `document.getElementById('phraseStrategy').click()` },
  { name: 'add a rule',
    open: `document.getElementById('phraseStrategy').click();
           document.querySelector('#constraints .add-rule').click()` },
];

export async function planControlsPass(c, source) {
  await toGameOne(c);
  const problems = [];
  let widest = 0;
  for (const st of PLAN_CONTROL_STATES) {
    await evalIn(c, step(st.open));
    const chk = (await evalIn(c, source)).checks.find(k => k.name === 'plan sheet controls ≥ 48px');
    if (!chk) { problems.push(`${st.name}: the plan-sheet-controls check is gone from smoke-checks.js`); continue; }
    if (!chk.pass) problems.push(`${st.name}: ${chk.detail}`);
    const n = chk.detail.match(/(\d+) controls/);
    if (n) widest = Math.max(widest, Number(n[1]));
    await evalIn(c, step(`document.getElementById('sheetPlan').close();`));
  }
  await evalIn(c, step(TODAY_HOME));

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${PLAN_CONTROL_STATES.length} states (${PLAN_CONTROL_STATES.map(s => s.name).join(' + ')}), `
        + `up to ${widest} controls, all ≥ 48px`,
  };
}
