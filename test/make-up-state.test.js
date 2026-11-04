/* #563 / #581: the one reader and writer of "Make up minutes from", which
 * choices a game offers, the new-game rule, and By hand no longer evening out
 * the day. Pure helpers in state.js; the row itself is a Coach scenario. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withTeam, player, bareGame } from './state-fixture.js';
import { lacks } from './prose.js';

const g = (extra) => bareGame(extra);
const team = (games, season, fn) => withTeam([player('a'), player('b')], games, {}, () => {
  S.state.teams[0].season = { games: season ? [{ id: 's1', date: '2026-09-01', minutes: {} }] : [] };
  return fn();
});

test('the three choices read from, and write to, the two flags', () => {
  const x = g({});
  for (const [choice, flags] of [['game', [false, false]], ['day', [true, false]], ['season', [true, true]]]) {
    S.setMakeUp(x, choice);
    assert.deepEqual([x.useCarryover, x.useSeasonTargets], flags, choice);
    assert.equal(S.makeUpOf(x), choice);
  }
});

test('a new game: the season if that was the last choice, else earlier today from game 2 on, else this game only', () => {
  for (const [n, last, want] of [
    [0, 'season', 'season'], [2, 'season', 'season'],
    [0, 'day', 'game'], [1, 'day', 'day'],
    [0, 'game', 'game'], [3, 'game', 'day'],
    [0, undefined, 'game'], [1, undefined, 'day'],
  ]) {
    assert.equal(S.newGameMakeUp(n, last === undefined ? undefined : { makeUp: last }), want, `${n} games, last ${last}`);
    assert.equal(S.makeUpOf(S.newGame(n, null, last === undefined ? undefined : { makeUp: last })), want);
  }
});

test('which choices a game offers, and which one it shows', () => {
  const day = () => [g({}), g({}), g({})];
  const offers = (i, filed, strategy = 'balanced') => {
    const games = day(); games[i].strategy = strategy;
    return team(games, filed, () => S.makeUpOffers(games[i], i));
  };
  assert.deepEqual(offers(1, true), ['game', 'day', 'season']);
  assert.deepEqual(offers(1, true, 'closers'), ['game', 'day', 'season']);
  assert.deepEqual(offers(0, true), ['game', 'season']);
  assert.deepEqual(offers(1, false), ['game', 'day']);
  assert.deepEqual(offers(0, false), [], 'game 1, nothing filed: no row');
  for (const s of ['minutes', 'platoon', 'order']) assert.deepEqual(offers(1, true, s), [], s);

  const shows = (i, filed, flags) => {
    const games = day(); S.setMakeUp(games[i], flags);
    return team(games, filed, () => [S.makeUpShown(games[i], i), games[i].useCarryover, games[i].useSeasonTargets]);
  };
  assert.deepEqual(shows(1, false, 'season'), ['day', true, true], 'the season with nothing filed shows earlier today, and writes nothing');
  assert.deepEqual(shows(0, true, 'day'), ['game', true, false], 'earlier today on game 1 shows this game only');
  assert.deepEqual(shows(1, true, 'season')[0], 'season');
  assert.deepEqual(shows(1, true, 'game')[0], 'game');
  assert.deepEqual(shows(0, false, 'season')[0], 'game');
});

test('#581: By hand does not even out the day, whatever the switch says', () => {
  const games = [g({ tipoff: '09:00' }), g({ strategy: 'minutes', useCarryover: true, tipoff: '11:00' })];
  const r = withTeam([player('a'), player('b')], games, {}, () => ({
    evens: S.evensOutDay(games[1], 1),
    line: S.evensOutLine(1),
    summary: S.passSummary(games[1], 1, null),
  }));
  assert.equal(r.evens, false);
  assert.equal(r.line, '');
  assert.ok(lacks(r.summary, 'evens out the day'), r.summary);
  const even = g({ useCarryover: true });
  assert.equal(S.evensOutDay(even, 1), true, 'Even still does');
  assert.equal(S.evensOutDay({ ...even, strategy: 'closers' }, 1), true);
  assert.equal(S.evensOutDay(even, 0), false);
});

/* The solver's carryover input is part of the plan cache's signature, so a
   flag that changes that input forces a new solve, and one that does not
   leaves the cached plan object in place. That is the seam: nothing else shows
   whether the day credit reached the solver, because By hand plans the same
   either way. */
test('#581: flipping the day switch re-solves Even, and leaves By hand\'s plan alone', () => {
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => player(id));
  const solvedAgain = strategy => {
    const games = [g({ id: 'g1', out: ['a', 'b'], seed: 3 }), g({ id: 'g2', strategy, useCarryover: true, seed: 4 })];
    return withTeam(players, games, {}, () => {
      S.state.onboarded = true;
      S.computeAll();
      const before = S.plans[1];
      assert.ok(before?.ok, `${strategy}: game 2 planned`);
      games[1].useCarryover = false;
      S.computeAll();
      return S.plans[1] !== before;
    });
  };
  assert.equal(solvedAgain('balanced'), true, 'control: Even takes the day credit, so turning it off re-solves');
  assert.equal(solvedAgain('minutes'), false, 'By hand takes none, so turning it off changes nothing the solver sees');
});
