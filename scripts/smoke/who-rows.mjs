import { toGameOne, TODAY_HOME } from './dom.mjs';
import { TOUCH_WIDTHS } from './sizes.mjs';
import { widthSweep } from './width-sweep.mjs';

/* #27 item 10: every row in the Who's here sheet, at least 48px, at the same
   three widths `touchPass` and `settingsRowPass` sweep (`TOUCH_WIDTHS` --
   same phone-widths rationale, one copy of the three numbers). Opened
   through the real trigger, same as `overlay.mjs`'s "who's here sheet"
   state: from Today, into the first game, then the players phrase.
   Getting there is `toGameOne` (`dom.mjs`, shared with `plan-rows.mjs`) --
   see its own comment for why Today -> Games is awaited on its own before
   the sheet's trigger runs. Only the sheet's own open is left for
   `widthSweep`'s `open` field, matching `settingsRowPass`'s one-click
   shape. */
const WHO_STATES = [
  { name: "who's here", open: `document.getElementById('phrasePlayers').click()` },
];
export async function whoRowsPass(c, source) {
  await toGameOne(c);
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: WHO_STATES,
    checkName: "who's here rows ≥ 48px",
    countRe: [/(\d+) rows/],
    label: (st, w) => `${w}px`,
    missing: "the who's-here-row check is gone from smoke-checks.js",
    close: `$('#sheetWho').close(); ${TODAY_HOME}`,
  });

  return {
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 48px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${TOUCH_WIDTHS.join('/')}px), up to ${seen} rows, all ≥ 48px`,
  };
}
