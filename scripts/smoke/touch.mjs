import { evalIn, TODAY_HOME } from './dom.mjs';
import { nameOf, TOUCH_WIDTHS } from './registry.mjs';
import { widthSweep } from './width-sweep.mjs';
import { FOUR, RICH, reloadWithRecord } from './fixtures.mjs';

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
  /* #25: the picker's last choice and its close control both have to stay
     on screen and ≥ 44px (the ticket's mobile-first constraint) -- the same
     claim every other state here makes, at the same three widths. */
  { name: 'settings, color picker open',
    open: `document.querySelector('#settingsBtn').click();
           document.querySelector('#teamColorBtn').click()` },
  { name: 'games, folds open',
    open: `document.querySelector('.today-game').click();
           for (const d of document.querySelectorAll('details')) d.open = true` },

];

/* #26 item 12: "the pass and #todayNewDay are touch targets of at least
 * 44px" — measured against `FOUR` (four passes on screen at once, the state
 * the ticket's own fit claim is about), not `RICH`'s two-game Today.
 *
 * A standalone reload-measure-reload rather than a `TOUCH_STATES` entry: that
 * array runs every state back to back with no navigation between them (only
 * in-page clicks), so swapping the fixture for one entry would leave every
 * state after it measuring `FOUR` too, and `close` never reloads `RICH` back.
 * Reusing `reloadWithRecord` before AND after keeps this self-contained and
 * leaves `widthSweep`'s own sweep, below, on `RICH` exactly as before. */
async function fourTodayTouch(c, origin, source) {
  const bad = [];
  let audited = 0, seen = 0;
  await reloadWithRecord(c, origin, FOUR);
  try {
    for (const w of TOUCH_WIDTHS) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: true });
      await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
      const chk = (await evalIn(c, source)).checks.find(k => k.name === 'touch targets ≥ 44px');
      const where = `today, FOUR@${w}px`;
      if (!chk) { bad.push(`${where}: the touch check is gone from smoke-checks.js`); continue; }
      audited++;
      const n = Number(([/(\d+) controls/, /\/(\d+) under/].map(re => chk.detail.match(re)).find(Boolean) || [])[1] || 0);
      seen = Math.max(seen, n);
      if (!chk.pass) bad.push(`${where}: ${chk.detail}`);
    }
  } finally {
    await reloadWithRecord(c, origin, RICH);
  }
  return { bad, audited, seen };
}

export async function touchPass(c, origin, source) {
  const four = await fourTodayTouch(c, origin, source);
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: TOUCH_STATES,
    checkName: 'touch targets ≥ 44px',
    countRe: [/(\d+) controls/, /\/(\d+) under/],
    label: (st, w) => `${st.name}@${w}px`,
    missing: 'the touch check is gone from smoke-checks.js',
    // The picker close is defensive and harmless when it is not open (its
    // handler is a no-op on an already-hidden dialog): without it, the
    // "color picker open" state above would leave the dialog's trap active
    // for `${TODAY_HOME}` below, which a real tap could never trigger while
    // a full-screen `.keyswrap` overlay covers the back button.
    close: `document.querySelector('#colorPickerClose')?.click();
      ${TODAY_HOME};
      for (const d of document.querySelectorAll('details')) d.open = false`,
  });

  const allBad = [...four.bad, ...bad];
  const totalAudited = four.audited + audited;
  const totalSeen = Math.max(four.seen, seen);
  return {
    name: nameOf('touch'),
    pass: allBad.length === 0,
    detail: allBad.length
      ? `${allBad.length}/${totalAudited} measurement(s) under 44px: ${allBad.slice(0, 4).join(' | ')}`
      : `${totalAudited} measurements (today, FOUR + ${TOUCH_STATES.map(s => s.name).join(' + ')} × `
        + `${TOUCH_WIDTHS.join('/')}px), up to ${totalSeen} controls, all ≥ 44px`,
  };
}
