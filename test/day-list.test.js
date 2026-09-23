import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, player, withDays } from './state-fixture.js';

/* #101: a team's day of games has become a list of days
 * (docs/specs/101-plan-another-date.md). This file holds the state-layer
 * seam over that list: `computeAll` solving each day on its own (item 7),
 * `addGame`/`dayFor` (item 2), `moveGame` (item 3) and `removeGame` (item
 * 10). Built the way `test/season.test.js` builds its own multi-day fixture
 * -- straight onto `S.state.teams`, the shape `sanitizeTeam` produces --
 * rather than through the one-day `withTeam` harness, because every case
 * here needs more than one day (`withDays`, state-fixture.js). */

const SIX = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => player(id));
const FORMAT = { periods: 4, periodMinutes: 8 }; // 32-minute game, 4-minute stints

/* ---------------------------- item 7: per-day solving ---------------------------- */

test('evening out stays within a day: Saturday\'s carryover does not reach Sunday', () => {
  // Saturday game 1: `f` sits out entirely, so the other five split the whole
  // game and `f` finishes 16 minutes behind everyone who played.
  const satG0 = S.newGame(0, null, FORMAT);
  satG0.out = ['f'];
  // Saturday game 2: carries over by default (n=1) -- pushes to pay that
  // deficit back within Saturday. `out` is cloned from game 1 by `newGame`
  // (players at the gym hold all day); `f` is back for this one.
  const satG1 = S.newGame(1, satG0, FORMAT);
  satG1.out = [];
  // Sunday's only game: first game of ITS day. Carryover is forced ON here,
  // deliberately against the UI default (item 2 covers that default), so a
  // pass proves the day boundary itself blocks the deficit, not the switch.
  const sunG0 = S.newGame(0, null, FORMAT);
  sunG0.useCarryover = true;

  // Reference: the same game, solved with no Saturday and no history at all
  // -- the plan a day boundary that actually resets carryover should match.
  const saved = S.state.teams;
  S.state.teams = [{
    id: 't', name: 'T', players: SIX, days: [
      { name: '', date: '2026-09-27', games: [structuredClone(sunG0)] },
    ], activeDay: 0, season: { games: [] }, activeGame: 0, settings: FORMAT,
  }];
  S.state.activeTeam = 0;
  S.computeAll();
  const reference = S.dayPlans[0][0];
  assert.equal(reference.ok, true, 'fixture check: the reference game solves');
  S.state.teams = saved;

  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [satG0, satG1] },
    { name: '', date: '2026-09-27', games: [sunG0] },
  ], FORMAT, () => {
    S.computeAll();
    assert.equal(S.dayPlans.length, 2, 'fixture check: two days solved');
    const [satPlans, sunPlans] = S.dayPlans;
    assert.equal(satPlans[0].ok, true);
    assert.equal(satPlans[1].ok, true);
    assert.equal(sunPlans[0].ok, true);

    // Sanity: carryover really does work WITHIN Saturday -- `f` gains
    // minutes from game 1 (where they sat out entirely) to game 2.
    assert.ok(satPlans[1].minutes.f > (satPlans[0].minutes.f || 0),
      'fixture check: Saturday\'s second game corrects for the first');

    // Sunday, with Saturday ahead of it, matches the reference byte for
    // byte: nothing about Saturday's deficit reached Sunday's solve.
    assert.deepEqual(sunPlans[0].minutes, reference.minutes,
      'Sunday\'s plan should match the same game solved with no Saturday at all');
  });
});

test('dayPlans holds one solved day per entry, in team.days order; plans is the open day\'s', () => {
  const g0 = S.newGame(0, null, FORMAT);
  const g1 = S.newGame(0, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0] },
    { name: '', date: '2026-09-27', games: [g1] },
  ], FORMAT, () => {
    S.computeAll();
    assert.equal(S.dayPlans.length, 2);
    assert.equal(S.dayPlans[0].length, 1);
    assert.equal(S.dayPlans[1].length, 1);
    assert.deepEqual(S.plans, S.dayPlans[0], 'plans is the open day (activeDay 0)');

    S.state.activeDay = 1;
    S.computeAll();
    assert.deepEqual(S.plans, S.dayPlans[1], 'plans follows activeDay once it moves');
  });
});

/* ---------------------------- item 2: sameAsLast is the team's last game ---------------------------- */

test('sameAsLast offers the team\'s last game -- the last day\'s last game, not the open day\'s', () => {
  const players = [player('a'), player('b'), player('c'), player('d'), player('e')];
  const satG0 = S.newGame(0, null, FORMAT);
  satG0.label = 'Hawks';
  const sunG0 = S.newGame(0, null, FORMAT);
  sunG0.label = 'Ravens';
  withDays(players, [
    { name: '', date: '2026-09-26', games: [satG0] }, // the open day (activeDay 0)
    { name: '', date: '2026-09-27', games: [sunG0] }, // the team's LAST day
  ], FORMAT, () => {
    assert.equal(S.state.activeDay, 0, 'fixture check: Saturday is the open day');
    assert.equal(S.sameAsLast().title, 'Same as Ravens?',
      'sameAsLast should name the last day\'s last game, not the open day\'s');
  });
});

/* ---------------------------- item 2: addGame / dayFor ---------------------------- */

test('addGame to a date with no day creates it in date order', () => {
  const g0 = S.newGame(0, null, FORMAT);
  const gNew = S.newGame(0, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-20', games: [g0] },
    { name: '', date: '2026-09-27', games: [S.newGame(0, null, FORMAT)] },
  ], FORMAT, () => {
    S.addGame(gNew, '2026-09-24');
    assert.deepEqual(S.team().days.map(d => d.date), ['2026-09-20', '2026-09-24', '2026-09-27'],
      'the new day sits between the two it falls between, not at either end');
    assert.equal(S.team().days[1].games.length, 1);
    assert.equal(S.team().days[1].games[0], gNew);
    assert.equal(S.state.activeDay, 1, 'the new day opens');
    assert.equal(S.state.activeGame, 0, 'the new game opens');
  });
});

test('addGame to a date that already has a day appends at the end of it', () => {
  const g0 = S.newGame(0, null, FORMAT);
  const gNew = S.newGame(1, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0] },
  ], FORMAT, () => {
    S.addGame(gNew, '2026-09-26');
    assert.equal(S.team().days.length, 1, 'no second day for the same date');
    assert.deepEqual(S.team().days[0].games, [g0, gNew]);
  });
});

/* ---------------------------- item 3: moveGame ---------------------------- */

test('moveGame moves the open game to another date, dropping its now-empty source day', () => {
  const g0 = S.newGame(0, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0] },
    { name: '', date: '2026-09-27', games: [S.newGame(0, null, FORMAT)] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.moveGame('2026-09-28');
    assert.deepEqual(S.team().days.map(d => d.date), ['2026-09-27', '2026-09-28'],
      'the empty 26th is gone; a new day for the 28th holds the moved game');
    assert.equal(S.team().days[1].games[0], g0);
    assert.equal(S.state.activeDay, 1, 'the game screen stays on the moved game');
    assert.equal(S.state.activeGame, 0);
  });
});

test('moveGame leaves the source day alone when it still has other games', () => {
  const g0 = S.newGame(0, null, FORMAT);
  const g1 = S.newGame(1, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0, g1] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.moveGame('2026-09-27');
    assert.deepEqual(S.team().days.map(d => d.date), ['2026-09-26', '2026-09-27']);
    assert.deepEqual(S.team().days[0].games, [g1], 'the day keeps the game that did not move');
  });
});

test('moveGame ignores a past date or an empty one', () => {
  const g0 = S.newGame(0, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.moveGame('2026-09-01', new Date(2026, 8, 26));
    assert.deepEqual(S.team().days.map(d => d.date), ['2026-09-26'], 'a past date is ignored');
    S.moveGame('');
    assert.deepEqual(S.team().days.map(d => d.date), ['2026-09-26'], 'an empty date is ignored');
    assert.equal(S.team().days[0].games[0], g0, 'the game never moved');
  });
});

/* ---------------------------- item 10: removeGame ---------------------------- */

test('removeGame drops the day when it removes that day\'s last game', () => {
  const g0 = S.newGame(0, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0] },
    { name: '', date: '2026-09-27', games: [S.newGame(0, null, FORMAT)] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.removeGame();
    assert.deepEqual(S.team().days.map(d => d.date), ['2026-09-27'], 'the emptied day is gone');
    assert.equal(S.state.activeDay, 0);
    assert.equal(S.state.activeGame, 0);
  });
});

test('removeGame leaves the day alone when other games remain in it', () => {
  const g0 = S.newGame(0, null, FORMAT);
  const g1 = S.newGame(1, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0, g1] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.removeGame();
    assert.equal(S.team().days.length, 1, 'the day itself is not dropped');
    assert.deepEqual(S.team().days[0].games, [g1]);
  });
});

/* ---------------------------- item 8's counterpart: openGame ---------------------------- */

test('openGame sets both activeDay and activeGame', () => {
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [S.newGame(0, null, FORMAT)] },
    { name: '', date: '2026-09-27', games: [S.newGame(0, null, FORMAT), S.newGame(1, null, FORMAT)] },
  ], FORMAT, () => {
    S.openGame(1, 1);
    assert.equal(S.state.activeDay, 1);
    assert.equal(S.state.activeGame, 1);
  });
});

/* ---------------------------- item 9: filing every past day ---------------------------- */

test('fileIfPast files every past day under its own date, in one toast, and keeps a day that is not past', () => {
  // #101 item 9's worked example: clock at 2026-09-28, days dated
  // 2026-09-26, 2026-09-27 and 2026-09-29.
  const TODAY = new Date(2026, 8, 28);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [S.newGame(0, null, FORMAT), S.newGame(1, null, FORMAT)] },
    { name: '', date: '2026-09-27', games: [S.newGame(0, null, FORMAT)] },
    { name: '', date: '2026-09-29', games: [S.newGame(0, null, FORMAT)] },
  ], FORMAT, () => {
    S.computeAll();
    const msg = S.fileIfPast(TODAY);

    assert.equal(msg, '2 past days: 3 games saved to the season.');
    assert.equal(S.team().season.games.length, 3, 'both past days\' games filed');
    assert.deepEqual(S.team().season.games.map(g => g.date), ['2026-09-26', '2026-09-26', '2026-09-27']);
    assert.equal(S.team().days.length, 1, 'the 29th is the only day left');
    assert.equal(S.team().days[0].date, '2026-09-29', 'the 29th was kept, not filed or replaced');
    assert.equal(S.team().activeDay, 0, 'the surviving day is the open one');
  });
});
