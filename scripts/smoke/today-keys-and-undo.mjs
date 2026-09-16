import { evalIn, SETTLE, step, onScreen } from './dom.mjs';
import { RICH, withSecondTeam, reloadWithRecord } from './fixtures.mjs';
import { nameOf } from './registry.mjs';

/* #23: Today's keyboard shortcuts and its undo-backed actions. Items 9 and
   11. Runs against the standard RICH record (`view: 'games'`, one team --
   whatever the previous check left the fixture as), so it starts by
   returning to Today itself rather than assuming it is already there. */
export async function todayKeysAndUndoPass(c, origin) {
  const problems = [];
  // Guarded the same way `todayAndBackPass` is: a missing control is a named
  // problem below, never a thrown exception.
  const key = k => step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}' }))`);
  const onToday = () => onScreen(c, 'view-today');
  const onGames = () => onScreen(c, 'view-games');
  try {

  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  if (!(await onToday())) problems.push('could not reach Today to start the check');

  // V on Today opens Team; V on Team returns to Today.
  await evalIn(c, key('v'));
  const onTeam = await evalIn(c, `!!(document.getElementById('view-team') && !document.getElementById('view-team').hidden)`);
  if (!onTeam) problems.push('V on Today did not open Team');
  await evalIn(c, key('v'));
  if (!(await onToday())) problems.push('V on Team did not return to Today');

  // P from Today opens the game and "prints" it (stubbed).
  await evalIn(c, `window.__printed = 0; window.print = () => { window.__printed++; }`);
  await evalIn(c, key('p'));
  const printedFromToday = await evalIn(c, 'window.__printed');
  const onGamesAfterP = await onGames();
  if (!onGamesAfterP) problems.push('P from Today did not open the game');
  if (printedFromToday !== 1) problems.push(`P from Today called window.print() ${printedFromToday} time(s), want 1`);

  // S and B are inert off the Game screen; back to Today to prove it there.
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, key('s'));
  const gmOpenAfterS = await evalIn(c, `!!(document.getElementById('gamemode') && !document.getElementById('gamemode').hidden)`);
  await evalIn(c, key('b'));
  const gmOpenAfterB = await evalIn(c, `!!(document.getElementById('gamemode') && !document.getElementById('gamemode').hidden)`);
  if (gmOpenAfterS || gmOpenAfterB) problems.push('S or B did something off the Game screen, where neither is wired');
  if (!(await onToday())) problems.push('S/B moved the screen off Today');

  // New day + Undo on Today.
  const gamesBefore = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  await evalIn(c, step(`document.getElementById('todayNewDay')?.click()`));
  const gamesAfterNewDay = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  const stillTodayAfterNewDay = await onToday();
  const undoShown = await evalIn(c, `!!document.querySelector('#toasts .toast[data-undo]')`);
  if (!undoShown) problems.push('New day did not show an Undo toast');
  if (!stillTodayAfterNewDay) problems.push('New day left Today');
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const gamesAfterUndo = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  if (gamesAfterUndo !== gamesBefore) {
    problems.push(`New day + Undo left ${gamesAfterUndo} game(s), started with ${gamesBefore}`);
  }
  if (!(await onToday())) problems.push('undoing New day left Today');

  // Add a game opens the new game's own screen.
  await evalIn(c, step(`document.getElementById('todayAddGame')?.click()`));
  const onGamesAfterAdd = await onGames();
  if (!onGamesAfterAdd) problems.push('Add a game did not open the new game\'s screen');
  const titleAfterAdd = await evalIn(c, `document.getElementById('barTitle')?.textContent.trim()`);
  if (!/Game \d/.test(titleAfterAdd) && !/Hawks|Ravens/.test(titleAfterAdd)) {
    problems.push(`the new game's title reads "${titleAfterAdd}"`);
  }

  // Remove this game -> Today -> Undo -> that game's screen again.
  /* #23 review, item A: the click and the FIRST read happen in one
     `evalIn` call, with nothing awaited in between -- so this measures
     what is true the instant the synchronous click handler returns, before
     the page has had a chance to paint a frame or run a microtask. Before
     the fix, `setView('today')` returned immediately on `history.back()`
     and left the actual screen change to the async `popstate` that
     followed, so `#view-games` was still visible and `state.view` (and the
     saved record) still said 'games' right here -- a real, reachable,
     reload-durable mid-transition state, not a rendering nicety. */
  const immediate = JSON.parse(await evalIn(c, `(async () => {
    document.getElementById('removeGame')?.click();
    const hiddenNow = document.getElementById('view-games')?.hidden;
    const { state } = await import('${origin}/state.js');
    const viewNow = state.view;
    let savedView = null;
    try { savedView = JSON.parse(localStorage.getItem('benchcard.v6')).view; } catch {}
    return JSON.stringify({ hiddenNow, viewNow, savedView });
  })()`));
  if (immediate.hiddenNow !== true) {
    problems.push(`Remove this game: #view-games.hidden is ${immediate.hiddenNow} immediately after the click, want true`);
  }
  if (immediate.viewNow !== 'today') {
    problems.push(`Remove this game: state.view is "${immediate.viewNow}" immediately after the click, want "today"`);
  }
  if (immediate.savedView !== 'today') {
    problems.push(`Remove this game: the saved record's view is "${immediate.savedView}" immediately after the click, want "today"`);
  }
  await evalIn(c, SETTLE);
  const onTodayAfterRemove = await onToday();
  const undoShown2 = await evalIn(c, `!!document.querySelector('#toasts .toast[data-undo]')`);
  if (!onTodayAfterRemove) problems.push('Remove this game did not return to Today');
  if (!undoShown2) problems.push('Remove this game did not show an Undo toast');
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const onGamesAfterUndoRemove = await onGames();
  const titleAfterUndoRemove = await evalIn(c, `document.getElementById('barTitle')?.textContent.trim()`);
  if (!onGamesAfterUndoRemove) problems.push('undoing Remove this game did not reopen that game\'s screen');
  if (titleAfterUndoRemove !== titleAfterAdd) {
    problems.push(`undoing Remove this game reopened "${titleAfterUndoRemove}", not "${titleAfterAdd}"`);
  }
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Remove team + Undo -> Settings. A SECOND team first: RICH ships with
  // one, and removing the LAST team is a different, welcome-bound case
  // (item 11's own parenthetical) that this check is not about.
  await reloadWithRecord(c, origin, withSecondTeam(RICH));

  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  await evalIn(c, step(`document.getElementById('removeTeam')?.click()`));
  await evalIn(c, step(`document.getElementById('confirmYes')?.click()`));
  const onTodayAfterRemoveTeam = await onToday();
  if (!onTodayAfterRemoveTeam) problems.push('removing the team did not return to Today');
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const onSettingsAfterUndo = await evalIn(c, `!!(document.getElementById('view-settings') && !document.getElementById('view-settings').hidden)`);
  if (!onSettingsAfterUndo) problems.push('undoing the team removal did not return to Settings');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  /* #23 review, item B: removing the LAST team on a single-team record
     (RICH ships with one), so this is the welcome-bound case the two-team
     test above deliberately is not. Going to welcome touches no history at
     all, so the `Settings` entry the coach was standing on stays live in
     the session history -- and the physical back button (simulated with a
     real `history.back()`, not `setView`) must still be able to land on
     it. Before the fix, `popstate` applied whatever `e.state` named with no
     onboarding check, painting a stale Settings (or Today) over an app that
     no longer has a team. */
  await reloadWithRecord(c, origin, RICH);
  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  await evalIn(c, step(`document.getElementById('removeTeam')?.click()`));
  await evalIn(c, step(`document.getElementById('confirmYes')?.click()`));
  const onWelcomeAfterLastRemove = await evalIn(c,
    `!!(document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden)`);
  if (!onWelcomeAfterLastRemove) problems.push('removing the last team did not show the welcome screen');

  await evalIn(c, `history.back()`);
  await evalIn(c, SETTLE);
  const stillWelcomeAfterBack = await evalIn(c,
    `!!(document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden)`);
  const todayHiddenAfterBack = await evalIn(c, `document.getElementById('view-today')?.hidden`);
  if (!stillWelcomeAfterBack) problems.push('history.back() after removing the last team left welcome for a stale screen');
  if (todayHiddenAfterBack !== true) {
    problems.push(`#view-today.hidden is ${todayHiddenAfterBack} after history.back() with no team left, want true`);
  }

  // Undo from welcome restores Settings, on the SAME [Today, Settings] pair
  // -- not a third entry stacked on top of the one the coach was already
  // standing on.
  const beforeUndoLen = await evalIn(c, `history.length`);
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const onSettingsAfterLastUndo = await evalIn(c,
    `!!(document.getElementById('view-settings') && !document.getElementById('view-settings').hidden)`);
  const afterUndoLen = await evalIn(c, `history.length`);
  if (!onSettingsAfterLastUndo) problems.push('undoing the removal of the last team did not restore Settings');
  if (afterUndoLen !== beforeUndoLen) {
    problems.push(`undoing the removal of the last team changed history.length ${beforeUndoLen} -> `
      + `${afterUndoLen}, want no change (the same [Today, Settings] pair, not a third entry)`);
  }
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  /* #23 review, third round: two more paths that change `state.activeGame`
     (or which game a fresh Games screen has to show) and then show a screen
     without a render of their own -- `addGame` and `printCard`. A fresh
     reload of RICH (two games, Hawks and Ravens) rather than trusting
     whatever the checks above left behind, since both need a KNOWN
     activeGame to start from. */
  await reloadWithRecord(c, origin, RICH);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Add a game opens the new game's own, still-empty opponent input -- not
  // whichever game (Hawks, activeGame 0) the Games screen last painted.
  await evalIn(c, step(`document.getElementById('todayAddGame')?.click()`));
  const addedOpp = await evalIn(c, `document.getElementById('label')?.value ?? null`);
  if (addedOpp !== '') problems.push(`Add a game: the opponent input reads "${addedOpp}", want it empty (the new game's own)`);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // P from Today, with activeGame already moved to the second game (Ravens)
  // by a Today entry, prints the card THAT entry would open, not whichever
  // one is still on screen from before. Its own fresh reload, not whatever
  // the Add-a-game step above left the Games screen painted with -- the
  // point is that the CARD reads Ravens, and starting from Hawks (the
  // fixture's own boot screen) says that unambiguously.
  await reloadWithRecord(c, origin, RICH);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelectorAll('.today-game')[1]?.click()`));
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, `window.__printed = 0; window.print = () => { window.__printed++; }`);
  await evalIn(c, key('p'));
  const printedCard = await evalIn(c, `document.querySelector('.card .opp')?.textContent ?? null`);
  if (!/Ravens/i.test(printedCard || '')) {
    problems.push(`P from Today with the second game active printed a card reading "${printedCard}", want it to name Ravens`);
  }
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Same courtesy `todayAndBackPass` pays: leave RICH (one team, `view:
  // 'games'`) the way every other 'rich' check expects to find it.
  await reloadWithRecord(c, origin, RICH);

  } catch (e) {
    problems.push(`threw before finishing: ${e.message.split('\n')[0]}`);
  }
  return {
    name: nameOf('todaykeys'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}`
      : 'V both ways, P from Today (window.print stubbed), S/B inert off Games, New day + Undo, '
        + 'Add a game, Remove this game -> Today -> Undo -> that game, remove team + Undo -> Settings',
  };
}
