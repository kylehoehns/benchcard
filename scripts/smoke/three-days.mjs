import { evalIn, SETTLE, WIDTH, HEIGHT, OVERFLOW_PROBE } from './dom.mjs';
import { RICH, reloadWithRecord, goRich } from './fixtures.mjs';
import { openAddGameFlow, realTap, tap, typeIn, waitClosed } from './sheet-drive.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';
import { seasonDate } from '../../app/storage.js';

/* #101 (docs/specs/101-plan-another-date.md), Proof row 5: a three-day
   fixture, items 2, 4, 5, 6, 11. RICH's team/roster/season, unmodified --
   only its one day is replaced by three dated relative to whatever day this
   actually runs on, so none of them is ever in the past (which would file
   itself on boot, `dated-day.mjs`'s own concern, not this one). "Tomorrow"
   (today+1) is deliberately left with no day of its own: the add-a-game step
   below lands there, so its own heading and its sort position (first) are
   both live results of this run, never assumed. */

// Exactly 30 characters -- item 5's own number for the title that has to
// wrap or truncate with no horizontal scroll. RICH's own team name ('Smoke
// Test', 10 characters) never stresses that path, so THREE_DAY overrides it
// below rather than reusing RICH.teams[0].name as earlier drafts of this
// fixture did.
const TEAM_NAME = 'Riverside Regional Junior Club';

const addDays = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return seasonDate(d);
};
// The spec's own format, item 4: "the phone's short weekday, month and day
// (en-US 'Sat, Sep 27')" -- computed independently here, never read back from
// `dayHeading`/`weekdayLabel` (state.js), which `node --test` already pins
// against a clock it controls (Proof row 3).
const weekday = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const mkGame = (id, label, tipoff, seed) => ({
  id, label, tipoff, periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
  out: [], strategy: 'balanced', seed,
});

// Exactly 40 characters -- item 11's own number for the long day name.
const DAY_NAME = 'Riverside Regional Tournament Weekend #1';

const THREE_DAY = {
  ...RICH,
  teams: [{
    ...RICH.teams[0],
    name: TEAM_NAME,
    days: [
      { date: addDays(2), games: [mkGame('t0', 'Panthers', '09:00', 201), mkGame('t1', 'Ravens', '11:30', 202)] },
      { date: addDays(4), games: [mkGame('t2', 'Wolves', '10:00', 203)] },
      { date: addDays(7), name: DAY_NAME, games: [
        mkGame('t3', 'Comets', '09:00', 204), mkGame('t4', 'Hawks', '11:00', 205), mkGame('t5', 'Owls', '01:00', 206),
      ] },
    ],
    activeDay: 0,
    activeGame: 0,
  }],
};

const dayGroups = c => evalIn(c, `JSON.stringify([...document.querySelectorAll('.day-group')].map(g => ({
  heading: (g.querySelector('.day-heading')?.textContent || '').trim(),
  passes: g.querySelectorAll('.today-game').length,
})))`).then(JSON.parse);

/* Item 5's second half: the 30-character name must not push the title button
   past the viewport's edge, and the gear (`#settingsBtn`) has to stay
   reachable beside it -- on screen, visible, and the element a real tap at
   its own center would actually hit, not just present in the DOM. `#teamBtn`
   (not just `#teamBtnLabel`) is measured: a regression that widens the
   button's own box past the label's ellipsis -- padding, gap, the chevron --
   still pushes the page sideways without the label's text ever reaching the
   edge. `document.documentElement.clientWidth/clientHeight` match
   `OVERFLOW_PROBE`'s own viewport read; `window.innerWidth` reports a scaled,
   wrong value once the 32px root font is emulated (measured on this tree:
   400 in a 320px viewport). Read at both viewports the spec names (390x844
   and 320px/32px text), never assumed from one. */
const TITLE_GEAR_PROBE = `(() => {
  const title = document.getElementById('teamBtn');
  const gear = document.getElementById('settingsBtn');
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const tr = title ? title.getBoundingClientRect() : null;
  const gr = gear ? gear.getBoundingClientRect() : null;
  const cx = gr ? gr.left + gr.width / 2 : null, cy = gr ? gr.top + gr.height / 2 : null;
  const hit = gr ? document.elementFromPoint(cx, cy) : null;
  return JSON.stringify({
    titleLeft: tr ? tr.left : null, titleRight: tr ? tr.right : null, vw,
    titleWithinViewport: !!tr && tr.left >= 0 && tr.right <= vw,
    gearVisible: !!gear && gear.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
    gearOnScreen: !!gr && gr.left >= 0 && gr.top >= 0 && gr.right <= vw && gr.bottom <= vh,
    gearTappable: !!gear && !!hit && (hit === gear || gear.contains(hit)),
  });
})()`;

const checkTitleAndGear = async (c, problems, label) => {
  const r = JSON.parse(await evalIn(c, TITLE_GEAR_PROBE));
  if (!r.titleWithinViewport) {
    problems.push(`${label}: #teamBtn reaches ${r.titleRight}px in a ${r.vw}px viewport`);
  }
  if (!r.gearOnScreen || !r.gearVisible || !r.gearTappable) {
    problems.push(`${label}: #settingsBtn is not on screen and tappable `
      + `(onScreen=${r.gearOnScreen}, visible=${r.gearVisible}, tappable=${r.gearTappable})`);
  }
};

export async function threeDaysPass(c, origin) {
  const problems = [];
  try {
    await reloadWithRecord(c, origin, { ...THREE_DAY, view: 'today' });

    // Items 4, 11: three headings in day order, each over its own passes.
    const groups = await dayGroups(c);
    const want = [
      { heading: weekday(2), passes: 2 },
      { heading: weekday(4), passes: 1 },
      { heading: `${weekday(7)} · ${DAY_NAME}`, passes: 3 },
    ];
    if (JSON.stringify(groups) !== JSON.stringify(want)) {
      problems.push(`Today's day groups are ${JSON.stringify(groups)}, want ${JSON.stringify(want)}`);
    }

    // Item 5: the large title is the team's own name and opens the team menu.
    const title = await evalIn(c, `document.getElementById('teamBtnLabel')?.textContent.trim() ?? null`);
    if (title !== TEAM_NAME) problems.push(`the large title reads "${title}", want the team name "${TEAM_NAME}"`);
    await tap(c, `document.getElementById('teamBtn')?.click()`);
    const menuOpen = await evalIn(c, `document.getElementById('teamMenu')?.matches(':popover-open') ?? false`);
    if (!menuOpen) problems.push('tapping the title did not open #teamMenu');
    await tap(c, `document.getElementById('teamMenu')?.hidePopover?.()`);

    // Item 6: opening a game on a day that is not the first still names the
    // back button after the team, not the day.
    await tap(c, `[...document.querySelectorAll('.day-group')].at(-1).querySelector('.today-game').click()`);
    const backName = await evalIn(c, `document.getElementById('backBtn')?.getAttribute('aria-label') ?? null`);
    if (backName !== `Back to ${TEAM_NAME}`) problems.push(`#backBtn reads "${backName}", want "Back to ${TEAM_NAME}"`);

    // Item 2: add a game for tomorrow through the real flow. `dayFor`
    // inserts a new day in date order and `dayHeading` special-cases
    // "Tomorrow" -- both proven at the node seam with a pinned clock; this is
    // the UI path a coach actually uses to reach them.
    await openAddGameFlow(c);
    await typeIn(c, '#agBody input[type=date]', addDays(1));
    await realTap(c, '#agNext');
    await realTap(c, '#agNext');
    await realTap(c, '#agNext');
    if (await waitClosed(c, '#addGameFlow')) {
      await tap(c, `document.querySelector('#barBack').hidden || document.querySelector('#backBtn').click()`);
      const after = await dayGroups(c);
      if (after.length !== 4) {
        problems.push(`adding a game for tomorrow left ${after.length} day group(s) on Today, want 4`);
      } else if (after[0].heading !== 'Tomorrow' || after[0].passes !== 1) {
        problems.push(`the new day reads ${JSON.stringify(after[0])}, want {"heading":"Tomorrow","passes":1} leading the list`);
      }
    } else {
      problems.push('"Plan it" did not close the add-a-game flow for the new date');
    }

    // Item 11: no horizontal overflow at 390×844...
    const o390 = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
    if (o390.pans || o390.worst) {
      problems.push(`390×844: ${o390.worst ? `${o390.worst.el} reaches ${o390.worst.right}px` : 'page pans sideways'}`);
    }
    // Item 5, at 390×844: the title stays in the viewport and the gear is
    // still on screen and tappable beside it.
    await checkTitleAndGear(c, problems, '390×844');

    // ...and at 320px/32px text (T2/T4). `Page.setFontSizes` only takes
    // effect on the next navigation (`app-large-text.mjs`'s own note), so
    // this reloads the record already seeded above rather than rewriting it.
    await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.today-game'); i++) await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
    const o320 = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
    if (o320.pans || o320.worst) {
      problems.push(`${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text: `
        + `${o320.worst ? `${o320.worst.el} reaches ${o320.worst.right}px in a ${o320.vw}px viewport` : 'page pans sideways'}`);
    }
    // Item 5, at 320px/32px text: the 30-character name wraps or truncates
    // rather than pushing the title (or the gear) off screen.
    await checkTitleAndGear(c, problems, `${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`);
  } catch (e) {
    problems.push(`threw: ${e.message.split('\n')[0]}`);
  } finally {
    // Never leave the emulated font size or viewport on for whatever check
    // runs next (the same restore `app-large-text.mjs` pays).
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } }).catch(() => {});
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true }).catch(() => {});
    await goRich(c, origin).catch(() => {}); // restore RICH for every check that runs after this one
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}`
      : `3 days (2/1/3 games, a 40-char day name) stack in order, the large title is the team name and `
        + `opens the team menu, #backBtn names the team, adding a game for tomorrow lands as a new `
        + `leading day, no horizontal overflow at 390×844 or ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`,
  };
}
