import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitize } from '../app/storage.js';

/* Sitting a player out is the other half of `removePlayer`. A live override is
   a five the coach picked by hand; once one of those five is not at the game
   it is no longer a lineup, and it survives into bench mode *and onto the
   printed card* — a coach prints a card naming a kid who is not in the gym,
   while a kid who is there is left off that stint. Found by walking the app:
   swap someone in for the rest of the game, then tap them off in Squad.

   `setAvailable` lives in state.js, which touches `document` at import time,
   so this exercises the source through `new Function` — the same trick
   state-hues.test.js uses. */
const src = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function setAvailable'));
const fn = body.slice(0, body.indexOf('\n}\n') + 2).replace('export function', 'function');
// eslint-disable-next-line no-new-func
const setAvailable = new Function(`${fn}\nreturn setAvailable;`)();

const gameWith = () => ({
  out: [],
  live: {
    at: 0,
    overrides: {
      0: ['a', 'b', 'c', 'd', 'e'],
      3: ['b', 'c', 'd', 'e', 'f'],
    },
  },
});

test('sitting a player out drops the hand-picked fives that name them', () => {
  const g = gameWith();
  setAvailable(g, 'a', false);
  assert.deepEqual(g.out, ['a']);
  assert.deepEqual(Object.keys(g.live.overrides), ['3'],
    'an override naming a player who is not at the game is not a lineup');
});

test('overrides that do not name them are left alone', () => {
  const g = gameWith();
  setAvailable(g, 'f', false);
  assert.deepEqual(Object.keys(g.live.overrides), ['0']);
});

test('bringing a player back in restores availability without touching overrides', () => {
  const g = gameWith();
  g.out = ['a'];
  setAvailable(g, 'a', true);
  assert.deepEqual(g.out, []);
  assert.deepEqual(Object.keys(g.live.overrides), ['0', '3']);
});

test('a game with no live block survives being sat out', () => {
  const g = { out: [] };
  setAvailable(g, 'a', false);
  assert.deepEqual(g.out, ['a']);
});

/* And the same rule on the way in, so a record already corrupted by the bug
   heals on the next load rather than printing a wrong card forever. */
const emptyConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [],
  openingFive: [], lastPeriodFive: [], hardPairs: false, maxConsecutive: 0,
  targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [],
});
const newGame = () => ({ id: 'gnew', label: '', when: '', periods: 4, periodMinutes: 8,
  granMode: 'everyN', granValue: 4, out: [], useCarryover: false, strategy: 'balanced',
  seed: 1, constraints: emptyConstraints() });

test('sanitize drops an override naming a player who is sitting out', () => {
  const raw = {
    version: 4,
    teams: [{
      id: 't1', name: 'Wildcats',
      players: 'abcdef'.split('').map(id => ({ id, name: id.toUpperCase(), number: '' })),
      day: { name: '', games: [{ ...newGame(), out: ['a'],
        live: { at: 0, overrides: { 0: ['a', 'b', 'c', 'd', 'e'], 3: ['b', 'c', 'd', 'e', 'f'] } } }] },
      activeGame: 0,
    }],
    activeTeam: 0,
  };
  const s = sanitize(raw, { emptyConstraints, newGame });
  assert.deepEqual(Object.keys(s.teams[0].day.games[0].live.overrides), ['3']);
});
