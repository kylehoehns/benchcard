import { TODAY_HOME } from './dom.mjs';
import { nameOf, TOUCH_WIDTHS } from './registry.mjs';
import { widthSweep } from './width-sweep.mjs';

/* Touch targets, swept — because measuring one width on one screen missed two
 * controls that were under the rule the whole time.
 *
 * `smoke-checks.js` finds controls structurally already (button, a[href],
 * input, select, textarea, the ARIA widget roles), so the selector was never
 * the problem. What it audits is "whatever is on screen now", and the harness
 * only ever showed it one screen at one width: the games view at 390. It
 * therefore could not see `input.num` (roster only, 38.4px wide at EVERY
 * width — a 44px rule broken everywhere, always) or `.bal-step` (roster only,
 * 41.9px at 320, crossing under 44 at about 365, so a 360px Android was
 * affected). Both were found by hand with a tape measure, which is exactly the
 * work a harness exists to stop.
 *
 * So this is the same widening the overflow check got: the states the app has,
 * across the widths a phone can be, rather than the one width somebody thought
 * to name. It replaces the single-viewport touch verdict rather than adding a
 * second one — one question, one answer.
 *
 * Widths: 320 (iPhone SE 1st gen, the narrowest anyone carries), 360 (the
 * common small Android), 390 (the iPhone the app is designed at). Every view
 * the chrome offers, and the games view again with every `details` open, since
 * a fold is where controls hide from a check like this. Season's own folds are
 * not swept: the harness's record has no filed games, and seeding some would
 * cost more cold-load nodes than the budget has slack.
 *
 * Settings is opened by the cog, not by a tab. A screen added to the app and
 * not to this list is a screen whose controls nobody measures, which is how
 * `input.num` sat at 38.4px for months. Today joins the sweep in #23: it is
 * a new screen with its own controls (the team button, the game entries, the
 * Team/Season entries), and the same rule applies to it. */

const TOUCH_STATES = [
  { name: 'today', open: TODAY_HOME },
  { name: 'games', open: `document.querySelector('.today-game').click()` },
  { name: 'team', open: `document.querySelector('#todayTeam').click()` },
  { name: 'season', open: `document.querySelector('#todaySeason').click()` },
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
  { name: 'games, folds open',
    open: `document.querySelector('.today-game').click();
           for (const d of document.querySelectorAll('details')) d.open = true` },

];

export async function touchPass(c, source) {
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: TOUCH_STATES,
    checkName: 'touch targets ≥ 44px',
    countRe: [/(\d+) controls/, /\/(\d+) under/],
    label: (st, w) => `${st.name}@${w}px`,
    missing: 'the touch check is gone from smoke-checks.js',
    close: `${TODAY_HOME};
      for (const d of document.querySelectorAll('details')) d.open = false`,
  });

  return {
    name: nameOf('touch'),
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 44px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${TOUCH_STATES.map(s => s.name).join(' + ')} × `
        + `${TOUCH_WIDTHS.join('/')}px), up to ${seen} controls, all ≥ 44px`,
  };
}
