import { toGameOne, TODAY_HOME } from './dom.mjs';
import { nameOf, TOUCH_WIDTHS } from './registry.mjs';
import { widthSweep } from './width-sweep.mjs';

/* #28 item 11: every row AND tile in the Plan sheet, at least 48px, at the
   same three widths `touchPass`, `settingsRowPass` and `whoRowsPass` sweep
   (`TOUCH_WIDTHS` -- same phone-widths rationale, one copy of the three
   numbers). Opened through the real trigger, same as `overlay.mjs`'s "plan
   sheet" state: from Today, into the first game, then the strategy phrase.

   `toGameOne` (`dom.mjs`, shared with `who-rows.mjs`) is Today -> the first
   game, awaited on its own -- see its own comment for why. Only the sheet's
   own open is left for `widthSweep`'s `open` field, matching
   `whoRowsPass`'s shape.

   Two states, not one: level 1's own tiles only paint when the strategy is
   "closing" (RICH's g0 is "balanced"), so the level-1 state alone would
   sweep `.prow` while silently never exercising a single `.plr` -- a check
   that claims to cover tiles but never does. The add page's default draft
   (`kind: 'minimum'`) paints a player-picker tile grid the moment it opens,
   no extra clicks needed, so a second state opening it is what actually
   puts a tile in front of `smoke-checks.js`'s new `.plr` selector. Reached
   through `#phraseRules` + `#constraints .add-rule`, the same path
   `overlay.mjs`'s own add-a-rule state uses, rather than re-deriving
   another. */
const PLAN_STATES = [
  { name: 'plan sheet', open: `document.getElementById('phraseStrategy').click()` },
  { name: 'add a rule',
    open: `document.getElementById('phraseRules').click();
           document.querySelector('#constraints .add-rule').click()` },
];

export async function planRowsPass(c, source) {
  await toGameOne(c);
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: PLAN_STATES,
    checkName: 'plan rows ≥ 48px',
    countRe: [/(\d+) rows/],
    label: (st, w) => `${st.name}@${w}px`,
    missing: 'the plan-row check is gone from smoke-checks.js',
    close: `$('#planBack')?.click(); $('#sheetPlan').close(); ${TODAY_HOME}`,
  });

  return {
    name: nameOf('planrows'),
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 48px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${PLAN_STATES.map(s => s.name).join(' + ')} × ${TOUCH_WIDTHS.join('/')}px), `
        + `up to ${seen} rows/tiles, all ≥ 48px`,
  };
}
