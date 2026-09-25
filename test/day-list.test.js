import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, player, withDays, finishGame } from './state-fixture.js';

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
  satG0.tipoff = '09:00';
  const sunG0 = S.newGame(0, null, FORMAT);
  sunG0.tipoff = '11:30';
  withDays(players, [
    { name: '', date: '2026-09-26', games: [satG0] }, // the open day (activeDay 0)
    { name: '', date: '2026-09-27', games: [sunG0] }, // the team's LAST day
  ], FORMAT, () => {
    assert.equal(S.state.activeDay, 0, 'fixture check: Saturday is the open day');
    assert.match(S.sameAsLast().title, /^Same as 11:30\s*AM\?$/,
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

/* #102 item 3: addGame sorts the day it lands in, and opens the new game at
   its sorted index -- not the index it was pushed at. */
test('addGame sorts the day by tip-off and opens the new game at its sorted index', () => {
  const early = S.newGame(0, null, FORMAT); early.tipoff = '09:00';
  const untimed = S.newGame(1, null, FORMAT);
  const gNew = S.newGame(2, null, FORMAT); gNew.tipoff = '08:00';
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [early, untimed] },
  ], FORMAT, () => {
    S.addGame(gNew, '2026-09-26');
    assert.deepEqual(S.team().days[0].games, [gNew, early, untimed],
      'the new 8:00 game sorts ahead of the 9:00 one; the untimed game stays after both');
    assert.equal(S.state.activeDay, 0);
    assert.equal(S.state.activeGame, 0, 'opens at the sorted index, not the push index');
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

/* #102 item 3: moveGame sorts the day the game lands in, and opens the game
   at its sorted index there. */
test('moveGame sorts the day it lands in', () => {
  const dest0 = S.newGame(0, null, FORMAT); dest0.tipoff = '10:00';
  const moving = S.newGame(0, null, FORMAT); moving.tipoff = '09:00';
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [moving] },
    { name: '', date: '2026-09-27', games: [dest0] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.moveGame('2026-09-27');
    assert.deepEqual(S.team().days.map(d => d.date), ['2026-09-27']);
    assert.deepEqual(S.team().days[0].games, [moving, dest0], '9:00 sorts ahead of 10:00');
    assert.equal(S.state.activeDay, 0);
    assert.equal(S.state.activeGame, 0, 'opens at the sorted index');
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

/* ---------------------------- #102: setTipoff ---------------------------- */

test('setTipoff writes, sorts the day and re-points activeGame at the same game', () => {
  const first = S.newGame(0, null, FORMAT); first.tipoff = '09:00';
  const open = S.newGame(1, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [first, open] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 1; // `open` is open, currently after `first`
    S.setTipoff('08:00');
    assert.deepEqual(S.team().days[0].games, [open, first],
      '8:00 sorts ahead of the 9:00 game already there');
    assert.equal(S.state.activeDay, 0);
    assert.equal(S.state.activeGame, 0, 'activeGame follows the same game to its new index');
    assert.equal(open.tipoff, '08:00');
  });
});

test('setTipoff treats a malformed value as absent, the same gate sanitize writes through', () => {
  const g0 = S.newGame(0, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.setTipoff('9:00');
    assert.equal(g0.tipoff, '', 'not zero-padded, so treated as absent');
  });
});

/* #102 item 3 (corrected): C(08:00), A(09:00), B(''), D('') -- clearing A's
 * tip-off gives C, A, B, D. A stable sort of the current array: a cleared
 * game does not jump to the end, it keeps its place among the untimed
 * games. */
test('setTipoff clearing a tip-off keeps the game\'s place among the untimed ones (stable sort)', () => {
  const C = S.newGame(0, null, FORMAT); C.tipoff = '08:00';
  const A = S.newGame(1, null, FORMAT); A.tipoff = '09:00';
  const B = S.newGame(2, null, FORMAT); B.tipoff = '';
  const D = S.newGame(3, null, FORMAT); D.tipoff = '';
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [C, A, B, D] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 1; // A is open
    S.setTipoff('');
    assert.deepEqual(S.team().days[0].games, [C, A, B, D],
      'A loses its time but keeps its place ahead of B and D');
    assert.equal(S.team().days[0].games[S.state.activeGame], A,
      'the open game is still A across the re-sort');
    assert.equal(A.tipoff, '');
  });
});

/* #102 item 3: changing a tip-off through `setTipoff` re-sorts a carryover
 * day, and the games after the moved game are re-planned against the new
 * order -- not just re-labelled. The proof table's own words for this row:
 * "dayPlans with a carryover day". Mirrors the spec's own worked example --
 * A tips off first (opens the day carryover-cold), C tips off later with `f`
 * sitting out entirely, so whichever game follows C inherits `f`'s deficit
 * through the carryover. */
test('setTipoff re-sorts a carryover day: the game that ends up behind the moved game is replanned to match a day built directly in that order', () => {
  const A = S.newGame(0, null, FORMAT); A.tipoff = '09:00'; A.useCarryover = true;
  const B = S.newGame(1, null, FORMAT); B.tipoff = '';
  const C = S.newGame(1, null, FORMAT); C.tipoff = '13:00'; C.out = ['f']; C.useCarryover = true;
  const D = S.newGame(1, null, FORMAT); D.tipoff = '';

  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [A, C, B, D] }, // sorted: A, C, B, D
  ], FORMAT, () => {
    S.computeAll();
    const day = S.team().days[0];
    const beforeA = structuredClone(S.dayPlans[0][day.games.indexOf(A)].minutes);

    S.openGame(0, day.games.indexOf(C));
    S.setTipoff('08:00'); // C moves ahead of A
    assert.deepEqual(day.games, [C, A, B, D], 'fixture check: C sorts ahead of A');

    S.computeAll();
    const afterA = S.dayPlans[0][day.games.indexOf(A)].minutes;
    assert.notDeepEqual(afterA, beforeA,
      'A now opens behind C\'s carryover instead of opening the day cold');

    // Reference: the same four games, cloned onto fresh ids so the plan
    // cache cannot just hand back the run above, built directly in the
    // C, A, B, D order -- the plan a real re-sort should land on.
    const saved = S.state.teams;
    const cloneWithNewId = g => ({ ...structuredClone(g), id: g.id + '-ref' });
    S.state.teams = [{
      id: 't', name: 'T', players: SIX, days: [
        { name: '', date: '2026-09-26', games: [C, A, B, D].map(cloneWithNewId) },
      ], activeDay: 0, season: { games: [] }, activeGame: 0, settings: FORMAT,
    }];
    S.state.activeTeam = 0;
    S.computeAll();
    const reference = S.dayPlans[0][1].minutes; // A's clone, at index 1
    S.state.teams = saved;

    assert.deepEqual(afterA, reference,
      'the re-sorted plan matches the same day built directly in the new order');
  });
});

/* ---------------------------- item 9: filing every past day ---------------------------- */

// #133: mark every game across every day started, so a test whose point is
// filing across several days is not derailed by the newer rule that a
// never-started game is left out.
function startEveryGame() {
  S.team().days.forEach((day, d) => {
    day.games.forEach((g, i) => {
      const p = S.dayPlans[d][i];
      if (p && p.ok) finishGame(g, p);
    });
  });
  S.computeAll();
}

// #101 item 9's worked example, and #133 item 6's: clock at 2026-09-28, days
// dated 2026-09-26 (two games), 2026-09-27 (one) and 2026-09-29 (not past).
const THREE_DAYS = () => [
  { name: '', date: '2026-09-26', games: [S.newGame(0, null, FORMAT), S.newGame(1, null, FORMAT)] },
  { name: '', date: '2026-09-27', games: [S.newGame(0, null, FORMAT)] },
  { name: '', date: '2026-09-29', games: [S.newGame(0, null, FORMAT)] },
];

test('fileIfPast files every past day under its own date, in one toast, and keeps a day that is not past', () => {
  const TODAY = new Date(2026, 8, 28);
  withDays(SIX, THREE_DAYS(), FORMAT, () => {
    S.computeAll();
    startEveryGame();
    const msg = S.fileIfPast(TODAY);

    assert.equal(msg, '2 past days: 3 games saved to the season.');
    assert.equal(S.team().season.games.length, 3, 'both past days\' games filed');
    assert.deepEqual(S.team().season.games.map(g => g.date), ['2026-09-26', '2026-09-26', '2026-09-27']);
    assert.equal(S.team().days.length, 1, 'the 29th is the only day left');
    assert.equal(S.team().days[0].date, '2026-09-29', 'the 29th was kept, not filed or replaced');
    assert.equal(S.team().activeDay, 0, 'the surviving day is the open one');
  });
});

/* ---------------------------- #133 item 6: several past days, mixed ---------------------------- */

test('fileIfPast: several past days report their never-started games in one count, across all of them', () => {
  // game A (2026-09-26) finishes; game B (2026-09-26) and game C (2026-09-27)
  // stay never-started; 2026-09-29 is not past and stays put.
  const TODAY = new Date(2026, 8, 28);
  withDays(SIX, THREE_DAYS(), FORMAT, () => {
    S.computeAll();
    const gameA = S.team().days[0].games[0];
    finishGame(gameA, S.dayPlans[0][0]);
    S.computeAll();

    const msg = S.fileIfPast(TODAY);

    assert.equal(msg, '2 past days: 1 game saved to the season. 2 games were never started, so they were left out.');
    assert.equal(S.team().days.length, 1, 'only the 29th is left in days');
    assert.equal(S.team().days[0].date, '2026-09-29');
  });
});

/* ---------------------------- #126: a team with no games ---------------------------- */

test('hasGames is false with no days and true with one', () => {
  withDays(SIX, [], FORMAT, () => {
    assert.equal(S.hasGames(), false);
  });
  withDays(SIX, [{ name: '', date: '2026-09-26', games: [S.newGame(0, null, FORMAT)] }], FORMAT, () => {
    assert.equal(S.hasGames(), true);
  });
});

test('game() and lastGame() are undefined, not a throw, with no days', () => {
  withDays(SIX, [], FORMAT, () => {
    assert.equal(S.game(), undefined);
    assert.equal(S.lastGame(), undefined);
  });
});

test('sameAsLast is null with no days, not a throw', () => {
  withDays(SIX, [], FORMAT, () => {
    assert.equal(S.sameAsLast(), null);
  });
});

test('computeAll does not throw with no days: plans and dayPlans are both empty', () => {
  withDays(SIX, [], FORMAT, () => {
    assert.doesNotThrow(() => S.computeAll());
    assert.deepEqual(S.dayPlans, []);
    assert.deepEqual(S.plans, []);
  });
});

test('removeGame drops the team\'s only day when it removes the team\'s only game', () => {
  const g0 = S.newGame(0, null, FORMAT);
  withDays(SIX, [
    { name: '', date: '2026-09-26', games: [g0] },
  ], FORMAT, () => {
    S.state.activeDay = 0;
    S.state.activeGame = 0;
    S.removeGame();
    assert.equal(S.team().days.length, 0);
    assert.equal(S.state.activeDay, 0);
    assert.equal(S.state.activeGame, 0);
    assert.equal(S.hasGames(), false);
  });
});
