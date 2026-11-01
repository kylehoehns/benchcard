import { toGameOne, TODAY_HOME } from './dom.mjs';
import { TOUCH_FLOOR, TOUCH_WIDTHS } from './sizes.mjs';
import { widthSweep, recordSweep } from './width-sweep.mjs';

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
  /* A kid turned Out is what puts a Running late chip in the sheet (#504), and
     the chip is measured too. The fixture has nobody out, so the sweep turns
     the first row off and `WHO_CLOSE` puts that kid back. */
  { name: "who's here", open: `document.getElementById('phrasePlayers').click();
    if (!document.querySelector('#sheetWhoBody .who-late')) {
      const row = document.querySelector('#sheetWhoBody .who-row');
      if (row) { row.click(); window.__whoRowsTurnedOff = row.getAttribute('aria-label'); }
    }` },
];
const WHO_CLOSE = `(() => {
  const name = window.__whoRowsTurnedOff;
  delete window.__whoRowsTurnedOff;
  const row = name && [...document.querySelectorAll('#sheetWhoBody .who-row')].find(r => r.getAttribute('aria-label') === name);
  if (row) row.click();
})(); $('#sheetWho').close(); ${TODAY_HOME}`;
export async function whoRowsPass(c, source, rec) {
  await toGameOne(c);
  const { bad, gone, audited, seen } = await widthSweep(c, source, {
    states: WHO_STATES,
    checkName: "who's here rows ≥ 48px",
    countRe: [/(\d+) rows/],
    label: (st, w) => `${w}px`,
    missing: "the who's-here-row check is gone from smoke-checks.js",
    close: WHO_CLOSE,
  });

  recordSweep(rec, { bad, gone, audited }, { what: "who's-here row", floor: TOUCH_FLOOR });
  rec.ok(`${audited} measurements (${TOUCH_WIDTHS.join('/')}px), up to ${seen} rows, all ≥ 48px`);
}
