import { evalIn, SETTLE, step, WIDTH, HEIGHT, onScreen } from './dom.mjs';
import { RICH, withSecondTeam, reloadWithRecord } from './fixtures.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './registry.mjs';

export async function todayAndBackPass(c, origin) {
  const problems = [];
  /* Every DOM read below is written so a MISSING control is a named problem,
     never a thrown exception -- a check that crashes on a control that does
     not exist yet reports nothing about the controls that DO. `onToday`,
     `text`/`click` and the object literals all guard with `?.` for the same
     reason `/new-guard` names: a check that measures nothing must fail
     loudly, not disappear into an unhandled rejection. The whole body is
     also wrapped in a `try` below, as a last line of defence, not a
     substitute for the guards. */
  const onToday = () => onScreen(c, 'view-today');
  const rich2 = withSecondTeam(RICH);
  rich2.view = 'today';
  // `Page.navigate` to the exact URL already loaded does not truncate the
  // forward session-history entries the way `reloadWithRecord`'s genuinely
  // new navigation does -- verified: a `today` -> `team` push straight after
  // it read as +0, not +1, because a stale forward entry from the PREVIOUS
  // opener's own reload-and-back test absorbed the push instead of growing
  // the list. Every reload below needs that, so every reload below uses it.
  const reloadWith = record => reloadWithRecord(c, origin, record);
  try {

  await reloadWith(rich2);
  const href0 = await evalIn(c, 'location.href');

  // item 1: Today's own contents.
  const today = JSON.parse(await evalIn(c, `JSON.stringify((() => {
    const $ = s => document.querySelector(s);
    const gear = $('#settingsBtn');
    const t = s => $(s)?.textContent.trim() ?? null;
    return {
      teamBtn: t('#teamBtnLabel'),
      gearName: gear && gear.getAttribute('aria-label'),
      heading: t('#view-today h1'),
      games: [...document.querySelectorAll('.today-game')].map(b => ({
        text: b.textContent.trim(), label: b.getAttribute('aria-label') })),
      teamEntry: t('#todayTeam'),
      seasonEntry: t('#todaySeason'),
      hasAddGame: !!$('#todayAddGame'), hasNewDay: !!$('#todayNewDay'),
      keysHintExists: !!$('#keysHint'),
    };
  })())`));
  // `activeTeam: 0` in `rich2` is still "Smoke Test" -- "JV Ravens" is the
  // second team, added so the menu below has something to switch to.
  if (today.teamBtn !== 'Smoke Test') problems.push(`Today's header names "${today.teamBtn}", not the active team`);
  if (today.gearName !== 'Settings') problems.push(`the gear's accessible name is "${today.gearName}", not "Settings"`);
  if (today.heading !== 'Today') problems.push(`Today's heading reads "${today.heading}"`);
  if (today.games.length !== 2) problems.push(`Today lists ${today.games.length} game entries, want 2`);
  if (!today.games.some(g => /Hawks/.test(g.text) && /9:00/.test(g.text))) problems.push('the first game entry does not name "Hawks" and "9:00"');
  if (!today.games.some(g => /Ravens/.test(g.text) && /11:30/.test(g.text))) problems.push('the second game entry does not name "Ravens" and "11:30"');
  if (!/Team/.test(today.teamEntry) || !/Smoke Test/.test(today.teamEntry) || !/11 players/.test(today.teamEntry)) {
    problems.push(`the Team entry reads "${today.teamEntry}", want "Team", the team name and "11 players"`);
  }
  if (!/Season/.test(today.seasonEntry) || !/3 games filed/.test(today.seasonEntry)) {
    problems.push(`the Season entry reads "${today.seasonEntry}", want "Season" and "3 games filed"`);
  }
  if (!today.hasAddGame || !today.hasNewDay) problems.push('Today is missing "Add a game" or "New day"');
  if (!today.keysHintExists) problems.push('#keysHint is gone from Today\'s header');

  /* #23 review, third round: opening a DIFFERENT game from Today has to show
     THAT game, not whichever one the Game screen last painted. `setView`
     only ever toggled visibility and the header title -- the opponent input
     and the card are their own sections, repainted by `render()`, and
     nothing called it here. Opens Hawks first (index 0, the same game the
     fixture already boots on, so this alone cannot tell a real repaint from
     no repaint at all), backs out, opens Ravens (index 1 -- the one a stale
     screen would still be showing Hawks on), then backs out and reopens
     Hawks -- the same staleness the other way, so a fix that only handles
     "index 0 -> 1" cannot pass by accident. */
  const gameScreen = async (label) => {
    const r = JSON.parse(await evalIn(c, `JSON.stringify({
      opp: document.getElementById('label')?.value ?? null,
      card: document.querySelector('.card .opp')?.textContent ?? null,
    })`));
    return { label, ...r };
  };
  await evalIn(c, step(`document.querySelectorAll('.today-game')[0]?.click()`));
  const hawks1 = await gameScreen('Hawks (first open)');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelectorAll('.today-game')[1]?.click()`));
  const ravens = await gameScreen('Ravens');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelectorAll('.today-game')[0]?.click()`));
  const hawks2 = await gameScreen('Hawks (reopened)');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  for (const [want, got] of [[/Hawks/i, hawks1], [/Ravens/i, ravens], [/Hawks/i, hawks2]]) {
    if (!want.test(got.opp || '')) {
      problems.push(`${got.label}: the opponent input reads "${got.opp}", want it to name ${want}`);
    }
    if (!want.test(got.card || '')) {
      problems.push(`${got.label}: the card header reads "${got.card}", want it to name ${want}`);
    }
  }

  // item 2: the team menu -- two teams, current one checked, Add a team offered.
  await evalIn(c, step(`
    $('#teamBtn')?.click();
    window.__menuItems = () => [...document.querySelectorAll('.teammenu-item')];
  `));
  const menu = JSON.parse(await evalIn(c, `JSON.stringify({
    items: window.__menuItems().map(b => ({
      text: b.textContent.trim(), current: b.getAttribute('aria-current'),
    })),
  })`));
  if (menu.items.length !== 3) {
    problems.push(`the team menu lists ${menu.items.length} item(s), want 2 teams + "Add a team"`);
  } else {
    const [t0, t1, add] = menu.items;
    if (t0.current !== 'true' || !/Smoke Test/.test(t0.text) || !/✓/.test(t0.text)) {
      problems.push(`the first menu item is "${JSON.stringify(t0)}", want the current team checked`);
    }
    if (t1.current) problems.push(`the second menu item carries aria-current, and should not — it is not the active team`);
    if (!/Add a team/.test(add.text)) problems.push(`the last menu item reads "${add.text}", not "Add a team"`);
  }

  /* Item 2, C8: "a popover menu anchored to it" -- the button, not a fixed
     point on the screen. Read both rects fresh each time rather than trust
     an earlier measurement: `positionTeamMenu()` runs on the popover's own
     `toggle` event, so a stale position would mean it never ran, not that it
     ran wrong. Checked at the default viewport and again at 320px/32px root
     text -- the one place `APP_LARGE_TEXT_ALLOW` stays empty and a fixed rem
     offset would drift furthest from the button it is supposed to track. */
  const checkMenuAnchored = async (label) => {
    const pos = JSON.parse(await evalIn(c, `JSON.stringify((() => {
      const b = document.getElementById('teamBtn')?.getBoundingClientRect();
      const m = document.getElementById('teamMenu')?.getBoundingClientRect();
      if (!b || !m || (!m.width && !m.height)) return null;
      return { btnBottom: b.bottom, btnLeft: b.left, menuTop: m.top, menuLeft: m.left,
               vw: innerWidth, menuW: m.width };
    })())`));
    if (!pos) { problems.push(`${label}: could not measure an open #teamBtn/#teamMenu pair`); return; }
    const dTop = pos.menuTop - pos.btnBottom;
    if (dTop < -1 || dTop > 16) {
      problems.push(`${label}: the menu's top is ${pos.menuTop.toFixed(1)}px against the button's `
        + `bottom at ${pos.btnBottom.toFixed(1)}px (Δ${dTop.toFixed(1)}px) -- not anchored just below it`);
    }
    const wantLeft = Math.max(8, Math.min(pos.btnLeft, pos.vw - 8 - pos.menuW));
    if (Math.abs(pos.menuLeft - wantLeft) > 1) {
      problems.push(`${label}: the menu's left is ${pos.menuLeft.toFixed(1)}px, want `
        + `${wantLeft.toFixed(1)}px (the button's left edge, clamped on screen)`);
    }
  };
  await checkMenuAnchored(`${WIDTH}px`);

  /* Today's own hierarchy (#23 review, item 2): the PRIMARY label in each
     row -- a game's own name, "Team", "Season" -- has to stay at least as
     large as the secondary text beside it (a tip-off time, a player count),
     at every text size, not just the one the app was eyeballed at. `.btn`
     and `#teamBtnLabel`'s own `.95rem` already scale with the root; the two
     labels checked here were the ones that did not (both inherited the
     body's bare `15px`, an absolute unit a reader's "bigger text" setting
     cannot touch, while their secondary text already used `rem`). */
  // #26: the pass's title/tip-off replace .today-game-lb/.today-game-when.
  const checkLabelHierarchy = async (label) => {
    const sizes = JSON.parse(await evalIn(c, `JSON.stringify((() => {
      const size = s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
      return {
        gameLb: size('.pass-title'), gameWhen: size('.pass-when'),
        entryLab: size('.today-entry-lab'), entrySub: size('.today-entry-sub'),
      };
    })())`));
    if (sizes.gameLb == null || sizes.gameWhen == null) {
      problems.push(`${label}: could not measure .pass-title/.pass-when`);
    } else if (sizes.gameLb < sizes.gameWhen) {
      problems.push(`${label}: .pass-title is ${sizes.gameLb}px, smaller than `
        + `.pass-when's ${sizes.gameWhen}px -- the game's own name reads smaller than its tip-off`);
    }
    if (sizes.entryLab == null || sizes.entrySub == null) {
      problems.push(`${label}: could not measure .today-entry-lab/.today-entry-sub`);
    } else if (sizes.entryLab < sizes.entrySub) {
      problems.push(`${label}: .today-entry-lab is ${sizes.entryLab}px, smaller than `
        + `.today-entry-sub's ${sizes.entrySub}px -- "Team"/"Season" reads smaller than their own subtitle`);
    }
  };
  await checkLabelHierarchy(`${WIDTH}px`);

  await evalIn(c, step(`document.getElementById('teamMenu')?.hidePopover?.()`));
  try {
    await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
    await checkLabelHierarchy(`${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`);
    await evalIn(c, step(`document.getElementById('teamBtn')?.click()`));
    await checkMenuAnchored(`${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`);
    await evalIn(c, step(`document.getElementById('teamMenu')?.hidePopover?.()`));
  } finally {
    // Never leave the emulated viewport/font behind for whatever check runs
    // next, even if a measurement above threw.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
  await evalIn(c, step(`document.getElementById('teamBtn')?.click()`));

  // switching team closes the menu and repaints Today, not the menu mid-tap
  await evalIn(c, step(`window.__menuItems()[1]?.click()`));
  const afterSwitch = await evalIn(c, `document.getElementById('teamBtnLabel')?.textContent.trim() ?? null`);
  if (afterSwitch !== 'JV Ravens') problems.push(`choosing the other team left the header reading "${afterSwitch}"`);
  const menuStillOpen = await evalIn(c, `document.getElementById('teamMenu')?.matches(':popover-open') ?? false`);
  if (menuStillOpen) problems.push('the team menu is still open after choosing a team');

  /* Item 3/4/5/6/8, #23 review third round: the HEADER is part of the first
     frame too, not just the `<main>` the pre-paint rules already swap. Runs
     from inside the page itself, installed via `addScriptToEvaluateOnNewDocument`
     so it is there for the reload's very first `requestAnimationFrame` --
     anything measured by a round trip out to this Node process and back would
     already be looking at a frame `applyView` has long since fixed. Removed
     again straight after each read, same as `firstRun`/`tryLanding` above:
     left registered it would go on recording (uselessly, and not for free)
     for every check that reloads after this one. */
  const FIRST_FRAME_SCRIPT = `(() => {
    window.__firstFrames = [];
    // checkVisibility, not getComputedStyle on the element itself: the fix
    // hides #barToday and leaves #settingsBtn's OWN display untouched, relying
    // on the ancestor to take it out of rendering -- own-display alone would
    // read the gear as shown right through a correct fix.
    const vis = id => { const e = document.getElementById(id);
      return !!e && e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }); };
    const read = () => ({ boot: document.documentElement.getAttribute('data-boot'),
      barToday: vis('barToday'), barBack: vis('barBack'), gear: vis('settingsBtn'), backBtn: vis('backBtn') });
    let n = 0;
    const tick = () => { window.__firstFrames.push(read()); if (++n < 12) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })();`;
  const recordFirstFrames = async (reload) => {
    const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FIRST_FRAME_SCRIPT });
    try {
      await reload();
      return JSON.parse(await evalIn(c, `JSON.stringify(window.__firstFrames || [])`));
    } finally {
      await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  };

  // items 3, 4, 5, 6, 8: each pushed screen, its header, and its way home.
  const openers = [
    ['games', `document.querySelector('.today-game')?.click()`, 'Hawks'],
    ['team', `document.getElementById('todayTeam')?.click()`, 'Team'],
    ['season', `document.getElementById('todaySeason')?.click()`, 'Season'],
    ['settings', `document.getElementById('settingsBtn')?.click()`, 'Settings'],
  ];
  for (const [name, openJs, wantTitle] of openers) {
    /* Fresh boot per opener, or the delta below is measured against whatever
       forward entry the PREVIOUS opener's own reload-then-back left dangling
       -- pushing after a back() truncates a stale forward entry and replaces
       it, which is correct browser history behaviour and exactly why a length
       delta is only a meaningful measurement starting from a known state. */
    await reloadWith(rich2);
    const before = await evalIn(c, 'history.length');
    await evalIn(c, step(openJs));
    const opened = JSON.parse(await evalIn(c, `JSON.stringify((() => {
      const $ = s => document.querySelector(s);
      const back = $('#backBtn');
      const gear = $('#settingsBtn');
      return {
        length: history.length,
        backName: back && back.getAttribute('aria-label'),
        title: $('#barTitle')?.textContent.trim() ?? null,
        gearVisible: !!gear && gear.getClientRects().length > 0 && getComputedStyle(gear).display !== 'none',
        href: location.href,
      };
    })())`));
    if (opened.length !== before + 1) problems.push(`${name}: history.length went ${before} -> ${opened.length}, want +1`);
    if (opened.backName !== 'Back to Today') problems.push(`${name}: the back button's name is "${opened.backName}"`);
    if (name !== 'games' && opened.title !== wantTitle) problems.push(`${name}: the title reads "${opened.title}", want "${wantTitle}"`);
    if (name === 'games' && !/Hawks/.test(opened.title || '')) problems.push(`games: the title reads "${opened.title}", want the game's label`);
    if (opened.gearVisible) problems.push(`${name}: the Settings gear is visible off Today`);
    if (opened.href !== href0) problems.push(`${name}: location.href changed to ${opened.href}`);

    // history.back() lands on Today.
    await evalIn(c, `history.back()`);
    await new Promise(r => setTimeout(r, 200));
    await evalIn(c, SETTLE);
    if (!(await onToday())) problems.push(`${name}: history.back() did not land on Today`);

    // reopen, then use the back BUTTON, which must land on Today too.
    await evalIn(c, step(openJs));
    await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
    if (!(await onToday())) problems.push(`${name}: the back button did not land on Today`);
    const hrefAfter = await evalIn(c, 'location.href');
    if (hrefAfter !== href0) problems.push(`${name}: location.href changed to ${hrefAfter} after the back button`);

    // opening one pushed screen from another replaces, not pushes: the four
    // openers above all start from Today, so this exercises it from `team`
    // specifically, the same "P on Team" case the design calls out — printing
    // is stubbed so it never opens a real dialog.
    if (name === 'team') {
      await evalIn(c, step(openJs));
      const pushedLength = await evalIn(c, 'history.length');
      await evalIn(c, `window.print = () => {}`);
      await evalIn(c, step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))`));
      const replacedLength = await evalIn(c, 'history.length');
      if (replacedLength !== pushedLength) {
        problems.push(`P from Team changed history.length ${pushedLength} -> ${replacedLength}, want no change (replace, not push)`);
      }
      await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
    }

    /* Reloading a pushed screen resets the module's in-memory `shown`/`pushed`
       to null/false, but not the tab's session history -- boot has to read
       `history.state` to tell "this entry already IS the pushed screen" from
       a fresh tab, or it stacks a dead Today entry under the reopened one
       every time. Reloading TWICE and then backing out TWICE catches what
       reloading once and backing out once can't: after a single reload the
       first `history.back()` lands on Today either way, because there is at
       most one dead entry to absorb it; a second reload adds a second dead
       entry, so a fix that only relabels instead of also pushing shows up as
       `history.length` growing between the two reloads, and as the second
       `history.back()` landing on yet another Today instead of actually
       leaving. */
    await evalIn(c, step(openJs));
    const reloadOnce = async () => {
      const reloaded = new Promise(ok => c.on('Page.loadEventFired', ok));
      await evalIn(c, `location.reload()`);
      await reloaded;
      await evalIn(c, `(async () => { await document.fonts.ready;
        for (let i = 0; i < 60 && !document.querySelector('.today-game, #barBack'); i++) await new Promise(r => setTimeout(r, 50));
        await ${SETTLE}; })()`);
      return evalIn(c, 'history.length');
    };
    const firstFrames = await recordFirstFrames(reloadOnce);
    /* The pre-paint stamp names the screen (`data-boot="games"` etc.) until
       `applyView` removes it a moment later -- exactly the window a coach's
       eyes, not just a round trip out to this process, would catch #barToday
       or the gear sitting over the wrong screen. A frame recorded AFTER that
       attribute is gone is a frame `applyView` has already fixed, and is not
       evidence of anything. */
    const pushedFrames = firstFrames.filter(f => f.boot && f.boot !== 'welcome' && f.boot !== 'today');
    const todayShowing = pushedFrames.find(f => f.barToday);
    if (todayShowing) {
      problems.push(`${name}: a first frame over data-boot="${todayShowing.boot}" still shows `
        + `#barToday (${JSON.stringify(todayShowing)})`);
    }
    const gearShowing = pushedFrames.find(f => f.gear);
    if (gearShowing) {
      problems.push(`${name}: a first frame over data-boot="${gearShowing.boot}" still shows `
        + `the Settings gear (${JSON.stringify(gearShowing)})`);
    }
    if (!firstFrames.length) {
      problems.push(`${name}: no first frames were recorded across the reload`);
    } else if (!firstFrames[0].backBtn) {
      problems.push(`${name}: the first recorded frame does not show #backBtn (${JSON.stringify(firstFrames[0])})`);
    }
    const lenAfterReload1 = await evalIn(c, 'history.length');
    const lenAfterReload2 = await reloadOnce();
    if (lenAfterReload2 !== lenAfterReload1) {
      problems.push(`${name}: a second reload on the pushed screen grew history.length `
        + `${lenAfterReload1} -> ${lenAfterReload2}, want no growth`);
    }
    const hrefAfterReloads = await evalIn(c, 'location.href');

    // one `history.back()` from the twice-reloaded pushed screen lands on
    // Today -- still the same document, a same-page pushState/replaceState
    // entry, not a navigation.
    await evalIn(c, `history.back()`);
    await new Promise(r => setTimeout(r, 200));
    await evalIn(c, SETTLE);
    if (!(await onToday())) {
      problems.push(`${name}: two reloads then one history.back() did not land on Today `
        + `(history.length was ${lenAfterReload1} -> ${lenAfterReload2})`);
    }

    // a SECOND `history.back()` has to leave for good: the entry before the
    // one boot ever created for this document, a real navigation to a
    // different document (`location.href` changes), not another Today.
    await evalIn(c, `history.back()`);
    let hrefAfterSecondBack = hrefAfterReloads;
    for (let i = 0; i < 40 && hrefAfterSecondBack === hrefAfterReloads; i++) {
      await new Promise(r => setTimeout(r, 50));
      hrefAfterSecondBack = await evalIn(c, 'location.href').catch(() => hrefAfterSecondBack);
    }
    if (hrefAfterSecondBack === hrefAfterReloads) {
      problems.push(`${name}: a second history.back() after Today stayed on `
        + `${hrefAfterSecondBack} instead of leaving for the previous document`);
    }
  }

  await reloadWith(RICH);
  } catch (e) {
    problems.push(`threw before finishing: ${e.message.split('\n')[0]}`);
  }
  return {
    name: nameOf('todayback'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}`
      : `Today's contents, the team menu (switch, checkmark, Add a team), the gear off Today, `
        + `and history.back()/#backBtn/a reload all landing on Today across games/team/season/settings, `
        + `location.href unchanged throughout`,
  };
}
