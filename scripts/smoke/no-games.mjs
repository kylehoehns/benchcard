import { evalIn, step, onScreen, WIDTH, HEIGHT } from './dom.mjs';
import { land, resize } from './page-state.mjs';
import { RICH, ONE_GAME, withSecondTeam, GAMES_VIEW_READY } from './fixtures.mjs';
import { LAPTOP } from './sizes.mjs';

/* #126's own guard (see docs/specs/126-remove-last-game.md's Proof section):
   removing a team's last game leaves Today with zero games, not a fallback
   one -- the note and Add a game beside it, no game-pane frame forced open
   beside Today at 1280px, Undo putting the game and its day back, the state
   surviving a reload, and every door into a game screen that no longer
   exists staying shut. Starts from `ONE_GAME` (RICH with Ravens dropped, so
   Hawks is the one game this check removes) rather than building that state
   from RICH's two games itself. */
export async function noGamesPass(c, origin, rec) {
  const key = k => step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}' }))`);
  const onToday = () => onScreen(c, 'view-today');
  const onGames = () => onScreen(c, 'view-games');
  // `ONE_GAME` keeps RICH's own `view: 'games'` -- see `GAMES_VIEW_READY`'s
  // own comment (fixtures.mjs) for why this names it.
  await land(c, origin, { record: ONE_GAME, ready: GAMES_VIEW_READY, freshHistory: true });
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  rec.check(await onToday(), 'could not reach Today to start the check');

  const before = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  const noteHiddenBefore = await evalIn(c, `document.getElementById('todayNoGames')?.hidden`);
  rec.check(before === 1, `the fixture shows ${before} game(s) on Today before Remove, want 1`);
  rec.check(noteHiddenBefore === true, 'the empty-state note shows while the team still has a game');

  // Open the one game and remove it -- the game screen is the only place
  // #removeGame lives (teams-view.js).
  await evalIn(c, step(`document.querySelector('.today-game').click()`));
  rec.check(await onGames(), 'opening the only game did not reach the Games screen');
  await evalIn(c, step(`document.getElementById('removeGame')?.click()`));

  rec.check(await onToday(), 'removing the last game did not return to Today');
  const toast = await evalIn(c, `document.querySelector('#toasts .toast[data-undo] .tmsg')?.textContent.trim() ?? null`);
  // Exact copy (spec Constraints): the toast drops "The day rebalanced." --
  // there is no day left to rebalance.
  rec.check(toast === 'Removed Hawks.', `the toast reads "${toast}", want "Removed Hawks."`);

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
  rec.check(emptyState.noteHidden === false, 'the empty-state note stayed hidden after the last game was removed');
  // Exact copy (spec Constraints).
  rec.check(emptyState.noteText === 'No games yet. Add one to see it here.', `the empty-state note reads "${emptyState.noteText}", want "No games yet. Add one to see it here."`);
  rec.check(emptyState.addHidden === false, 'Add a game is hidden with no games on the team');
  rec.check(emptyState.teamHidden === false, 'Team is hidden on an empty Today');
  rec.check(emptyState.seasonHidden === false, 'Season is hidden on an empty Today');
  rec.check(emptyState.games === 0, `${emptyState.games} game pass(es) still show after the last game was removed`);

  // Decision 7's resting state (`html[data-view="today"] #view-games[hidden]`)
  // is scoped `:not(.no-games)` -- with no game to rest on, the right pane at
  // a wide window stays empty rather than a frame with nothing in it.
  await resize(c, LAPTOP, 800);
  const wide = await evalIn(c, `(() => {
    const el = document.getElementById('view-games');
    const r = el.getBoundingClientRect();
    return JSON.stringify({ display: getComputedStyle(el).display, hidden: el.hidden, w: r.width, h: r.height });
  })()`);
  const wideGames = JSON.parse(wide);
  rec.check(wideGames.hidden === true && (wideGames.display === 'none' || (wideGames.w === 0 && wideGames.h === 0)), `at ${LAPTOP}px with no games #view-games reads ${wide}, want it left empty, not forced open`);
  await resize(c, WIDTH, HEIGHT);

  // Undo puts the game -- and its day -- back, and reopens that game's own
  // screen (the same undo shape `todaykeys` already proves for a day that
  // still has another game left).
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  rec.check(await onGames(), 'undoing Remove this game did not reopen that game\'s screen');
  const titleAfterUndo = await evalIn(c, `document.getElementById('barTitle')?.textContent.trim()`);
  rec.check(/Hawks/.test(titleAfterUndo || ''), `undoing Remove this game reopened "${titleAfterUndo}", not Hawks`);

  // Remove it again and reload -- the empty state has to survive a real
  // navigation, not just the in-page render the checks above already saw.
  await evalIn(c, step(`document.getElementById('removeGame')?.click()`));
  await land(c, origin, { record: 'kept', ready: `!!document.getElementById('todayAddGame')` });
  const afterReload = await evalIn(c, `(() => {
    return JSON.stringify({
      onToday: !!(document.getElementById('view-today') && !document.getElementById('view-today').hidden),
      noteHidden: document.getElementById('todayNoGames')?.hidden,
      games: document.querySelectorAll('.today-game').length,
    });
  })()`);
  const reloadState = JSON.parse(afterReload);
  rec.check(reloadState.onToday, 'a reload with no games left did not land on Today');
  rec.check(reloadState.noteHidden === false, 'a reload with no games left did not show the empty-state note');
  rec.check(reloadState.games === 0, `a reload with no games left still shows ${reloadState.games} game pass(es)`);

  // Every door into a game screen that no longer exists stays shut, and
  // throws nothing.
  await evalIn(c, `window.__printed = 0; window.print = () => { window.__printed++; }`);
  const blocked = JSON.parse(await evalIn(c, `(async () => {
    const render = await import('${origin}/render.js');
    render.setView('games');
    const afterSetView = document.documentElement.dataset.view;
    return JSON.stringify({ afterSetView });
  })()`));
  rec.check(blocked.afterSetView === 'today', `setView('games') with no games landed on "${blocked.afterSetView}", want "today"`);

  await evalIn(c, key('p'));
  const printedNoGames = await evalIn(c, `window.__printed`);
  rec.check(printedNoGames === 0, `P with no games called window.print() ${printedNoGames} time(s), want 0`);
  rec.check(await onToday(), 'P with no games moved the screen off Today');

  await evalIn(c, `(async () => { const tour = await import('${origin}/tour.js'); tour.startTour(); })()`);
  const tourOpen = await evalIn(c, `!document.getElementById('tour')?.hidden`);
  rec.check(!tourOpen, 'startTour() opened the tour with no games to walk');

  await evalIn(c, step(`(() => {
    history.pushState({ view: 'games' }, '', location.href);
    dispatchEvent(new PopStateEvent('popstate', { state: { view: 'games' } }));
  })()`));
  rec.check(await onToday(), 'a stale "games" history entry did not fold to Today with no games');

  // V still opens Team and comes back.
  await evalIn(c, key('v'));
  const onTeam = await evalIn(c, `!!(document.getElementById('view-team') && !document.getElementById('view-team').hidden)`);
  rec.check(onTeam, 'V did not open Team with no games on the team');
  await evalIn(c, key('v'));
  rec.check(await onToday(), 'V did not return to Today from Team');

  // Tour buttons hidden: Settings' "Show me around again", and the same
  // control inside the help sheet.
  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  const tourBtnHidden = await evalIn(c, `document.getElementById('helpTourSettings')?.hidden`);
  rec.check(tourBtnHidden === true, '"Show me around again" shows in Settings with no games');
  await evalIn(c, step(`document.getElementById('helpBtn')?.click()`));
  const helpTourHidden = await evalIn(c, `document.getElementById('helpTour')?.hidden`);
  rec.check(helpTourHidden === true, '"Show me around again" shows in the help sheet with no games');
  await evalIn(c, step(`document.getElementById('helpClose')?.click()`));

  // Removing a player on Team still works with no games on the team.
  await evalIn(c, step(`document.getElementById('todayTeam')?.click()`));
  const rowsBefore = await evalIn(c, `document.querySelectorAll('#rosterlist .rrow').length`);
  await evalIn(c, step(`document.querySelector('#rosterlist .rrow')?.click()`));
  await evalIn(c, step(`[...document.querySelectorAll('#sheetPlayer button')].find(b => b.textContent.trim() === 'Remove from team')?.click()`));
  const rowsAfter = await evalIn(c, `document.querySelectorAll('#rosterlist .rrow').length`);
  rec.check(rowsAfter === rowsBefore - 1, `removing a player with no games left ${rowsAfter} row(s), want ${rowsBefore - 1}`);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Changing a team setting still works with no games on the team.
  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  await evalIn(c, step(`document.getElementById('teamColorBtn')?.click()`));
  await evalIn(c, step(`document.querySelector('.color-opt[data-color="royal"]')?.click()`));
  await evalIn(c, step(`document.getElementById('colorPickerClose')?.click()`));
  const colorName = await evalIn(c, `document.getElementById('teamColorName')?.textContent.trim()`);
  rec.check(colorName === 'Royal', `changing the team color with no games left it reading "${colorName}", want "Royal"`);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Switching teams still works with no games on the active one. Same
  // `view: 'games'` gutter as the first reload above.
  await land(c, origin, { record: withSecondTeam(ONE_GAME), ready: GAMES_VIEW_READY, freshHistory: true });
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelector('.today-game')?.click()`));
  await evalIn(c, step(`document.getElementById('removeGame')?.click()`));
  await evalIn(c, step(`document.getElementById('teamBtn')?.click()`));
  await evalIn(c, step(`[...document.querySelectorAll('.teammenu-item')][1]?.click()`));
  const switchedOk = await onToday();
  const switchedGames = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  rec.check(switchedOk, 'switching to the second team from an empty Today did not stay on Today');
  rec.check(switchedGames === 1, `switching teams shows ${switchedGames} game(s) on the second team, want its own 1`);
  rec.ok('Remove this game -> Today\'s empty state (note, Add a game, no forced frame at '
    + `${LAPTOP}px) -> Undo -> that game, reload, setView/P/startTour/a stale "games" `
    + 'history entry all blocked, V, remove a player, a team setting, switch teams');
}
