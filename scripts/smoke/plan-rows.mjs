import { evalIn, step, TODAY_HOME } from './dom.mjs';
import { nameOf, TOUCH_WIDTHS } from './registry.mjs';
import { widthSweep } from './width-sweep.mjs';

/* #28 item 11: every row in the Plan sheet, at least 48px, at the same three
   widths `touchPass`, `settingsRowPass` and `whoRowsPass` sweep
   (`TOUCH_WIDTHS` -- same phone-widths rationale, one copy of the three
   numbers). Opened through the real trigger, same as `overlay.mjs`'s "plan
   sheet" state: from Today, into the first game, then the strategy phrase.

   Two calls to `toGameOne`-style navigation rather than one script with
   every click chained: `who-rows.mjs`'s own comment on this exact trap
   (`#phrasePlayers`'s handler only live once the games-view rebuild has
   run) applies here just the same, so Today -> the first game is awaited on
   its own before the sheet's own trigger runs. Only the sheet's own open is
   left for `widthSweep`'s `open` field, matching `whoRowsPass`'s shape. */
async function toGameOne(c) {
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));
}

const PLAN_STATES = [
  { name: 'plan sheet', open: `document.getElementById('phraseStrategy').click()` },
];

export async function planRowsPass(c, source) {
  await toGameOne(c);
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: PLAN_STATES,
    checkName: 'plan rows ≥ 48px',
    countRe: [/(\d+) rows/],
    label: (st, w) => `${w}px`,
    missing: 'the plan-row check is gone from smoke-checks.js',
    close: `$('#sheetPlan').close(); ${TODAY_HOME}`,
  });

  return {
    name: nameOf('planrows'),
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 48px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${TOUCH_WIDTHS.join('/')}px), up to ${seen} rows, all ≥ 48px`,
  };
}
