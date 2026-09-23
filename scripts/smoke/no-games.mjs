import { evalIn, step, SETTLE, onScreen, HEIGHT } from './dom.mjs';
import { RICH, ONE_GAME, withSecondTeam, reloadWithRecord } from './fixtures.mjs';
import { LAPTOP } from './sizes.mjs';

/* #126's own guard (see docs/specs/126-remove-last-game.md's Proof section):
   removing a team's last game leaves Today with zero games, not a fallback
   one -- the note and Add a game beside it, no game-pane frame forced open
   beside Today at 1280px, Undo putting the game and its day back, the state
   surviving a reload, and every door into a game screen that no longer
   exists staying shut. Starts from `ONE_GAME` (RICH with Ravens dropped, so
   Hawks is the one game this check removes) rather than building that state
   from RICH's two games itself. */
export async function noGamesPass(c, origin) {
  const problems = [];
  const key = k => step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}' }))`);
  const onToday = () => onScreen(c, 'view-today');
  const onGames = () => onScreen(c, 'view-games');
  try {

  await reloadWithRecord(c, origin, ONE_GAME);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  if (!(await onToday())) problems.push('could not reach Today to start the check');

  const before = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  const noteHiddenBefore = await evalIn(c, `document.getElementById('todayNoGames')?.hidden`);
  if (before !== 1) problems.push(`the fixture shows ${before} game(s) on Today before Remove, want 1`);
  if (noteHiddenBefore !== true) problems.push('the empty-state note shows while the team still has a game');

  // Open the one game and remove it -- the game screen is the only place
  // #removeGame lives (teams-view.js).
  await evalIn(c, step(`document.querySelector('.today-game').click()`));
  if (!(await onGames())) problems.push('opening the only game did not reach the Games screen');
  await evalIn(c, step(`document.getElementById('removeGame')?.click()`));

  if (!(await onToday())) problems.push('removing the last game did not return to Today');
  const toast = await evalIn(c, `document.querySelector('#toasts .toast[data-undo] .tmsg')?.textContent.trim() ?? null`);
  // Exact copy (spec Constraints): the toast drops "The day rebalanced." --
  // there is no day left to rebalance.
  if (toast !== 'Removed Hawks.') problems.push(`the toast reads "${toast}", want "Removed Hawks."`);

  const empty = await evalIn(c, `(() => {
    const note = document.getElementById('todayNoGames');
    return JSON.stringify({
      noteHidden: note?.hidden,
      noteText: note?.textContent.trim(),
      addHidden: document.getElementById('todayAddGame')?.hidden,
      teamHidden: document.getElementById('todayTeam')?.hidden,
      seasonHidden: document.getElementById('todaySeason')?.hidden,
      games: document.querySelectorAll('.today-game').length,
    });
  })()`);
  const emptyState = JSON.parse(empty);
  if (emptyState.noteHidden !== false) problems.push('the empty-state note stayed hidden after the last game was removed');
  // Exact copy (spec Constraints).
  if (emptyState.noteText !== 'No games yet. Add one to see it here.') {
    problems.push(`the empty-state note reads "${emptyState.noteText}", want "No games yet. Add one to see it here."`);
  }
  if (emptyState.addHidden !== false) problems.push('Add a game is hidden with no games on the team');
  if (emptyState.teamHidden !== false) problems.push('Team is hidden on an empty Today');
  if (emptyState.seasonHidden !== false) problems.push('Season is hidden on an empty Today');
  if (emptyState.games !== 0) problems.push(`${emptyState.games} game pass(es) still show after the last game was removed`);

  // Decision 7's resting state (`html[data-view="today"] #view-games[hidden]`)
  // is scoped `:not(.no-games)` -- with no game to rest on, the right pane at
  // a wide window stays empty rather than a frame with nothing in it.
  await c.send('Emulation.setDeviceMetricsOverride', { width: LAPTOP, height: 800, deviceScaleFactor: 2, mobile: true });
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
  const wide = await evalIn(c, `(() => {
    const el = document.getElementById('view-games');
    const r = el.getBoundingClientRect();
    return JSON.stringify({ display: getComputedStyle(el).display, hidden: el.hidden, w: r.width, h: r.height });
  })()`);
  const wideGames = JSON.parse(wide);
  if (!(wideGames.hidden === true && (wideGames.display === 'none' || (wideGames.w === 0 && wideGames.h === 0)))) {
    problems.push(`at ${LAPTOP}px with no games #view-games reads ${wide}, want it left empty, not forced open`);
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);

  // Undo puts the game -- and its day -- back, and reopens that game's own
  // screen (the same undo shape `todaykeys` already proves for a day that
  // still has another game left).
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  if (!(await onGames())) problems.push('undoing Remove this game did not reopen that game\'s screen');
  const titleAfterUndo = await evalIn(c, `document.getElementById('barTitle')?.textContent.trim()`);
  if (!/Hawks/.test(titleAfterUndo || '')) problems.push(`undoing Remove this game reopened "${titleAfterUndo}", not Hawks`);

  // Remove it again and reload -- the empty state has to survive a real
  // navigation, not just the in-page render the checks above already saw.
  await evalIn(c, step(`document.getElementById('removeGame')?.click()`));
  const reloaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Page.navigate', { url: `${origin}/index.html?_smoke=${Date.now()}` });
  await reloaded;
  await evalIn(c, `(async () => { await document.fonts.ready;
    for (let i = 0; i < 60 && !document.getElementById('todayAddGame'); i++) await new Promise(r => setTimeout(r, 50));
    await ${SETTLE}; })()`);
  const afterReload = await evalIn(c, `(() => {
    return JSON.stringify({
      onToday: !!(document.getElementById('view-today') && !document.getElementById('view-today').hidden),
      noteHidden: document.getElementById('todayNoGames')?.hidden,
      games: document.querySelectorAll('.today-game').length,
    });
  })()`);
  const reloadState = JSON.parse(afterReload);
  if (!reloadState.onToday) problems.push('a reload with no games left did not land on Today');
  if (reloadState.noteHidden !== false) problems.push('a reload with no games left did not show the empty-state note');
  if (reloadState.games !== 0) problems.push(`a reload with no games left still shows ${reloadState.games} game pass(es)`);

  // Every door into a game screen that no longer exists stays shut, and
  // throws nothing.
  await evalIn(c, `window.__printed = 0; window.print = () => { window.__printed++; }`);
  const blocked = JSON.parse(await evalIn(c, `(async () => {
    const render = await import('${origin}/render.js');
    render.setView('games');
    const afterSetView = document.documentElement.dataset.view;
    return JSON.stringify({ afterSetView });
  })()`));
  if (blocked.afterSetView !== 'today') problems.push(`setView('games') with no games landed on "${blocked.afterSetView}", want "today"`);

  await evalIn(c, key('p'));
  const printedNoGames = await evalIn(c, `window.__printed`);
  if (printedNoGames !== 0) problems.push(`P with no games called window.print() ${printedNoGames} time(s), want 0`);
  if (!(await onToday())) problems.push('P with no games moved the screen off Today');

  await evalIn(c, `(async () => { const tour = await import('${origin}/tour.js'); tour.startTour(); })()`);
  const tourOpen = await evalIn(c, `!document.getElementById('tour')?.hidden`);
  if (tourOpen) problems.push('startTour() opened the tour with no games to walk');

  await evalIn(c, step(`(() => {
    history.pushState({ view: 'games' }, '', location.href);
    dispatchEvent(new PopStateEvent('popstate', { state: { view: 'games' } }));
  })()`));
  if (!(await onToday())) problems.push('a stale "games" history entry did not fold to Today with no games');

  // V still opens Team and comes back.
  await evalIn(c, key('v'));
  const onTeam = await evalIn(c, `!!(document.getElementById('view-team') && !document.getElementById('view-team').hidden)`);
  if (!onTeam) problems.push('V did not open Team with no games on the team');
  await evalIn(c, key('v'));
  if (!(await onToday())) problems.push('V did not return to Today from Team');

  // Tour buttons hidden: Settings' "Show me around again", and the same
  // control inside the help sheet.
  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  const tourBtnHidden = await evalIn(c, `document.getElementById('helpTourSettings')?.hidden`);
  if (tourBtnHidden !== true) problems.push('"Show me around again" shows in Settings with no games');
  await evalIn(c, step(`document.getElementById('helpBtn')?.click()`));
  const helpTourHidden = await evalIn(c, `document.getElementById('helpTour')?.hidden`);
  if (helpTourHidden !== true) problems.push('"Show me around again" shows in the help sheet with no games');
  await evalIn(c, step(`document.getElementById('helpClose')?.click()`));

  // Removing a player on Team still works with no games on the team.
  await evalIn(c, step(`document.getElementById('todayTeam')?.click()`));
  const rowsBefore = await evalIn(c, `document.querySelectorAll('#rosterlist .rrow').length`);
  await evalIn(c, step(`document.querySelector('#rosterlist .rrow')?.click()`));
  await evalIn(c, step(`[...document.querySelectorAll('#sheetPlayer button')].find(b => b.textContent.trim() === 'Remove from team')?.click()`));
  const rowsAfter = await evalIn(c, `document.querySelectorAll('#rosterlist .rrow').length`);
  if (rowsAfter !== rowsBefore - 1) {
    problems.push(`removing a player with no games left ${rowsAfter} row(s), want ${rowsBefore - 1}`);
  }
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Changing a team setting still works with no games on the team.
  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  await evalIn(c, step(`document.getElementById('teamColorBtn')?.click()`));
  await evalIn(c, step(`document.querySelector('.color-opt[data-color="royal"]')?.click()`));
  await evalIn(c, step(`document.getElementById('colorPickerClose')?.click()`));
  const colorName = await evalIn(c, `document.getElementById('teamColorName')?.textContent.trim()`);
  if (colorName !== 'Royal') problems.push(`changing the team color with no games left it reading "${colorName}", want "Royal"`);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Switching teams still works with no games on the active one.
  await reloadWithRecord(c, origin, withSecondTeam(ONE_GAME));
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelector('.today-game')?.click()`));
  await evalIn(c, step(`document.getElementById('removeGame')?.click()`));
  await evalIn(c, step(`document.getElementById('teamBtn')?.click()`));
  await evalIn(c, step(`[...document.querySelectorAll('.teammenu-item')][1]?.click()`));
  const switchedOk = await onToday();
  const switchedGames = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  if (!switchedOk) problems.push('switching to the second team from an empty Today did not stay on Today');
  if (switchedGames !== 1) problems.push(`switching teams shows ${switchedGames} game(s) on the second team, want its own 1`);

  // Leave the fixture the way every other 'rich' row expects to find it.
  await reloadWithRecord(c, origin, RICH);

  } catch (e) {
    problems.push(`threw before finishing: ${e.message.split('\n')[0]}`);
  }
  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}`
      : 'Remove this game -> Today\'s empty state (note, Add a game, no forced frame at '
        + `${LAPTOP}px) -> Undo -> that game, reload, setView/P/startTour/a stale "games" `
        + 'history entry all blocked, V, remove a player, a team setting, switch teams',
  };
}
