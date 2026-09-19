import { evalIn, TODAY_HOME, FIRST_RUN_STEPS, FR_SNAPSHOT, FR_RESTORE } from './dom.mjs';
import { nameOf, TOUCH_CHECK, TOUCH_FLOOR, TOUCH_WIDTHS } from './registry.mjs';
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
  /* #37 review: `.bal-step` -- the level meter's five steps, built by
     `app/balance.js` as `role="radio"` buttons and rendered into
     `#playerLevel` -- is named at the top of this file as one of the two
     controls the widened sweep exists for, and no state here ever opened the
     sheet that holds it. It sat at 44px, asserted by a comment in `app.css`
     rather than measured by anything. Opened the way `overlay.mjs` opens it:
     the Team screen, then the first roster row. */
  { name: 'team, player sheet open',
    open: `document.querySelector('#todayTeam').click();
           document.querySelector('#rosterlist .rrow').click()` },
  /* Closes the player sheet above the way `add a game, step 1` closes
     `#addGameFlow`: a state that needs a clean slate clears the previous
     state's dialog itself (`widthSweep` runs `close` once, at the end). */
  { name: 'season',
    open: `document.querySelector('#sheetPlayer')?.close();
           document.querySelector('#todaySeason').click()` },
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
  /* #25: the picker's last choice and its close control both have to stay
     on screen and ≥ `TOUCH_FLOOR` (the ticket's mobile-first constraint, 44px
     when #25 wrote this and 48px since #37) -- the same
     claim every other state here makes, at the same three widths. */
  { name: 'settings, color picker open',
    open: `document.querySelector('#settingsBtn').click();
           document.querySelector('#teamColorBtn').click()` },
  { name: 'games, folds open',
    open: `document.querySelector('.today-game').click();
           for (const d of document.querySelectorAll('details')) d.open = true` },
  /* #27 finding: none of the states above ever opens a sheet, so the sweep
     never measured `.bsheet-close` (40px, under the floor) or the drag
     handle. Who's here, at half height, through its real trigger. */
  { name: "games, who's here sheet open",
    open: `document.querySelector('.today-game').click();
           document.querySelector('#phrasePlayers').click()` },
  /* #28: the Plan sheet, full height (its own default) through its real
     trigger -- the segment buttons, the lock icons and every group's rows
     are new controls this sweep has never measured. */
  { name: 'games, plan sheet open',
    open: `document.querySelector('.today-game').click();
           document.querySelector('#phraseStrategy').click()` },
  /* #28 item 11: the add page is its own level-2 pane with its own controls
     (the type chips, the tiles, the stepper buttons and `Add rule` itself),
     none of which the level-1 state above ever measures. */
  { name: 'games, plan sheet, add a rule',
    open: `document.querySelector('.today-game').click();
           document.querySelector('#phraseStrategy').click();
           document.querySelector('.add-rule').click()` },
  /* #32 item 10: every button in the Add-a-game flow is a touch target --
     the ✕, "‹ Back", the primary, "Use it", eleven player tiles and four
     option cards, none of which any state above this one draws. Last in the
     list, and the shared `close` below closes the dialog: a modal covers
     everything, so a state after it would be measuring the flow again. */
  { name: 'add a game, step 1',
    open: `document.querySelector('#addGameFlow')?.close();
           ${TODAY_HOME};
           document.querySelector('#todayAddGame').click()` },
  { name: 'add a game, step 2',
    open: `document.querySelector('#agNext').click()` },
  { name: 'add a game, step 3',
    open: `document.querySelector('#agNext').click()` },
  /* #36: the three first-run steps, appended after the Add-a-game trio and
     resetting from it the way that trio itself resets from whatever ran
     before it -- `close` (below, shared by every state here) runs once, at
     the end of this whole array, not after each state (`widthSweep`'s own
     contract), so `#addGameFlow` would otherwise still be open here. Opened
     through `#welTry`, the door that fills the sample into the draft
     (decision 7), the same one `overlay.mjs`'s identical trio and
     `app-large-text.mjs`'s use. Step 3 commits a team through
     `commitFirstRun` (decision 4: it renders the real card, so the team has
     to exist by then), which overwrites `state.players`/`state.teamName`/
     `state.day.games[0]` -- and every pass `smoke.mjs` runs after `touch`,
     up to `teamscreen`'s own `goRich`, shares this same page load with no
     reload in between. So this state's own `open` snapshots the fixture and
     the shared `close` puts it back whole, through the one
     `FR_SNAPSHOT`/`FR_RESTORE` pair in dom.mjs that `overlay.mjs` drives its
     identical trio with -- and the names come from `FIRST_RUN_STEPS` there
     for the same reason. */
  { name: FIRST_RUN_STEPS[0],
    open: `document.querySelector('#addGameFlow')?.close();
           ${TODAY_HOME};
           document.querySelector('#welTry').click()` },
  { name: FIRST_RUN_STEPS[1],
    open: `document.querySelector('#frNext').click()` },
  { name: FIRST_RUN_STEPS[2],
    open: `${FR_SNAPSHOT};
           document.querySelector('#frNext').click()` },
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
      const chk = (await evalIn(c, source)).checks.find(k => k.name === TOUCH_CHECK);
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
    checkName: TOUCH_CHECK,
    countRe: [/(\d+) controls/, /\/(\d+) under/],
    label: (st, w) => `${st.name}@${w}px`,
    missing: 'the touch check is gone from smoke-checks.js',
    // The picker close is defensive and harmless when it is not open (its
    // handler is a no-op on an already-hidden dialog): without it, the
    // "color picker open" state above would leave the dialog's trap active
    // for `${TODAY_HOME}` below, which a real tap could never trigger while
    // a full-screen `.keyswrap` overlay covers the back button.
    // `#planBack` pops the add-a-rule pane above back to level 1 first
    // (resetPlanChrome and popPane's own reset discard the module-level
    // draft the same way a real Back tap does, decision 10) -- closing the
    // dialog directly, as before, would leave `#planMain` hidden and
    // `#planSub` shown for whichever check opens `#sheetPlan` next. It is a
    // no-op click when no sub pane is pushed (`popPane` returns false).
    // The first-run restore has to run before `${TODAY_HOME}` below: it puts
    // `state.view` back too, and a `#backBtn` click first would just be
    // undone by `Object.assign` a line later.
    close: `document.querySelector('#addGameFlow')?.close();
      document.querySelector('#firstRunFlow')?.close();
      if (window.__frSnap) { ${FR_RESTORE}; }
      document.querySelector('#colorPickerClose')?.click();
      document.querySelector('#sheetWho')?.close();
      document.querySelector('#planBack')?.click();
      document.querySelector('#sheetPlan')?.close();
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
      ? `${allBad.length}/${totalAudited} measurement(s) under ${TOUCH_FLOOR}px: ${allBad.slice(0, 4).join(' | ')}`
      : `${totalAudited} measurements (today, FOUR + ${TOUCH_STATES.map(s => s.name).join(' + ')} × `
        + `${TOUCH_WIDTHS.join('/')}px), up to ${totalSeen} controls, all ≥ ${TOUCH_FLOOR}px`,
  };
}
