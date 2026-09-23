import { TODAY_HOME } from './dom.mjs';
import { TOUCH_WIDTHS } from './sizes.mjs';
import { widthSweep } from './width-sweep.mjs';

/* #69 (restyle Today and the game screen), "What would settle it" item 4:
   the fixed control list the restyle names -- #teamBtn,
   #settingsBtn, .today-game, #todayAddGame, #todayTeam, #todaySeason,
   #backBtn, each .phrase, each timeline row, #regen, each fold summary,
   .seg buttons, #abBench -- all at least 48x48, at the same three
   phone widths `touchPass` and `settingsRowPass` sweep. #29 retired #abCard
   (the phone bar's printer button); #shareBtn, its replacement door into the
   card sheet, is checked by `timeline-card-sheet.mjs` instead, alongside the
   rest of that sheet's own controls. Today alone does not
   show the game screen's controls (the back button, the phrases, the
   timeline, the action bar, the fold summaries), so a second state opens a
   game; a third also opens every fold, since a fold summary and the
   timeline's own rows are the two things a closed fold hides from the
   first state. */
const ITEM4_STATES = [
  { name: 'today', open: TODAY_HOME },
  { name: 'games', open: `document.querySelector('.today-game').click()` },
  { name: 'games, folds open',
    open: `document.querySelector('.today-game').click();
           for (const d of document.querySelectorAll('details')) d.open = true` },
];

export async function todayGameRowsPass(c, source) {
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: ITEM4_STATES,
    checkName: 'today and game controls ≥ 48px',
    countRe: [/(\d+) controls/],
    label: (st, w) => `${st.name}@${w}px`,
    missing: 'the today-and-game-controls check is gone from smoke-checks.js',
    close: `${TODAY_HOME}; for (const d of document.querySelectorAll('details')) d.open = false`,
  });

  return {
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 48px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${ITEM4_STATES.map(s => s.name).join(' + ')} × ${TOUCH_WIDTHS.join('/')}px), `
        + `up to ${seen} controls, all ≥ 48px`,
  };
}
