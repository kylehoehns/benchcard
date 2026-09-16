import { evalIn, step, TODAY_HOME } from './dom.mjs';
import { nameOf, TOUCH_WIDTHS } from './registry.mjs';
import { widthSweep } from './width-sweep.mjs';

/* #27 item 10: every row in the Who's here sheet, at least 48px, at the same
   three widths `touchPass` and `settingsRowPass` sweep (`TOUCH_WIDTHS` --
   same phone-widths rationale, one copy of the three numbers). Opened
   through the real trigger, same as `overlay.mjs`'s "who's here sheet"
   state: from Today, into the first game, then the players phrase.
   Getting there is two `step()`s of its own, awaited separately, rather
   than one script with three clicks back to back: the Today -> Games ->
   Today -> Games round trip each click makes rebuilds the screen, and
   `#phrasePlayers`'s own handler is only live once that rebuild has
   actually run -- chaining all three in a single synchronous script
   outran it and opened nothing (caught by running this state's own tab
   count against zero, per rule 2a, before landing on this fix). Only the
   sheet's own open is left for `widthSweep`'s `open` field, matching
   `settingsRowPass`'s one-click shape. */
async function toGameOne(c) {
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));
}
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
    name: nameOf('whorows'),
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 48px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${TOUCH_WIDTHS.join('/')}px), up to ${seen} rows, all ≥ 48px`,
  };
}
