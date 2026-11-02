import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withDays, player, bareGame } from './state-fixture.js';

/* #548: the games "Copy from another game" lists, in the order and the words
 * the issue decided. The clock is pinned to Monday 2026-09-28; every expected
 * line is written out by hand. */
const TODAY = new Date(2026, 8, 28);
const ROSTER = ['a', 'b', 'c', 'd'].map(id => player(id));
const game = (id, over = {}) => bareGame({ id, ...over });

const days = () => [
  { name: '', date: '2026-09-21', games: [game('old', { label: 'Lions', tipoff: '', strategy: 'minutes' })] },
  { name: 'Tournament', date: '2026-09-28', games: [
    game('t1', { label: 'Hawks', tipoff: '09:00' }),
    game('t2', { label: '', tipoff: '', periods: 2, periodMinutes: 16, out: ['d'], strategy: 'order' }),
    game('t3', { label: 'Barnaby-Featherstonehaugh Elementary Wildcats', tipoff: '13:30' }),
  ] },
  { name: '', date: '2026-10-03', games: [
    game('f1', { label: 'Owls', tipoff: '08:00' }),
    game('f2', { label: 'Bears', tipoff: '' }),
  ] },
];


function listFor(openDay, openGame) {
  return withDays(ROSTER, days(), {}, () => {
    S.team().activeGame = openGame;
    return S.copySources(TODAY);
  }, openDay);
}

test('this game\'s own day first, latest game first, then other days newest first; this game is left out', () => {
  assert.deepEqual(listFor(1, 0).map(s => s.game.id), ['t3', 't2', 'f2', 'f1', 'old']);
});

test('a team with one game has nothing to copy from', () => {
  const only = withDays(ROSTER, [{ name: '', date: '2026-09-28', games: [game('x')] }], {}, () => S.copySources(TODAY));
  assert.deepEqual(only, []);
});

test('a row is titled like the rest of the app, with the day, the tip-off and the summary under it', () => {
  const list = listFor(1, 0);
  const by = id => list.find(s => s.game.id === id);
  assert.equal(by('t3').title, 'Barnaby-Featherstonehaugh Elementary Wildcats');
  assert.equal(by('t3').line, 'Today · Tournament · 1:30 PM · 4 players, 4 × 8, even minutes');
  assert.equal(by('t2').title, 'Game 2');
  assert.equal(by('t2').line, 'Today · Tournament · 3 players, 2 × 16, rotation order');
  assert.equal(by('f1').title, 'Owls');
  assert.equal(by('f1').line, 'Sat, Oct 3 · 8:00 AM · 4 players, 4 × 8, even minutes');
  assert.equal(by('old').line, 'Mon, Sep 21 · 4 players, 4 × 8, minutes set by hand');
});

test('the summary is the one the Same as card shows', () => {
  const g = game('s', { strategy: 'closers', out: ['a'] });
  withDays(ROSTER, [{ name: '', date: '2026-09-28', games: [g] }], {}, () => {
    assert.equal(S.setupSummary(g), '3 players, 4 × 8, a closing group');
  });
});
