/* #566: loading a team works out its two team "in a row" values from its
 * saved games (the strictest), keeps a value the settings already hold, and
 * does the same thing twice. The games keep their own values. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTeam, sanitizeSettings, DEFAULT_SETTINGS } from '../app/storage.js';
import { emptyConstraints } from '../app/team-ops.js';

const helpers = { emptyConstraints, newGame: (n, from, settings) => {
  const g = { id: 'fallback', constraints: emptyConstraints() };
  g.constraints.maxConsecutive = settings?.maxConsecutive ?? 0;
  g.constraints.maxBench = settings?.maxBench ?? 0;
  return g;
}, today: new Date(2026, 8, 22) };

const game = (id, rest = 0, bench = 0) => ({
  id, tipoff: '10:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
  constraints: { maxConsecutive: rest, maxBench: bench },
});
const team = (days, settings) => ({
  id: 't', name: 'T', players: [], activeDay: 0, activeGame: 0, season: { games: [] }, settings,
  days: days.map((games, i) => ({ name: '', date: `2026-09-${15 + 7 * i}`, games })),
});
const load = (days, settings) => sanitizeTeam(team(days, settings), helpers);
const teamValues = t => [t.settings.maxConsecutive, t.settings.maxBench];
const gameValues = t => t.days.flatMap(d => d.games).map(g => [g.constraints.maxConsecutive, g.constraints.maxBench]);

test('the defaults are off', () => {
  assert.equal(DEFAULT_SETTINGS.maxConsecutive, 0);
  assert.equal(DEFAULT_SETTINGS.maxBench, 0);
  assert.deepEqual([sanitizeSettings({}).maxConsecutive, sanitizeSettings({}).maxBench], [0, 0]);
});

test('no game has either rule: both team values are 0', () => {
  assert.deepEqual(teamValues(load([[game('a')]], {})), [0, 0]);
});

test('one game with Plays at most 3: team 3, game 3', () => {
  const t = load([[game('a', 3)]], {});
  assert.deepEqual(teamValues(t), [3, 0]);
  assert.deepEqual(gameValues(t), [[3, 0]]);
});

test('Sits at most 3 and 2 across two days: the team takes 2, each game keeps its own', () => {
  const t = load([[game('a', 0, 3)], [game('b', 0, 2)]], {});
  assert.deepEqual(teamValues(t), [0, 2]);
  assert.deepEqual(gameValues(t), [[0, 3], [0, 2]]);
});

test('a game with the rule and a game without: the team takes the non-zero value, the other game stays 0', () => {
  const t = load([[game('a', 0, 0), game('b', 4, 0)]], {});
  assert.deepEqual(teamValues(t), [4, 0]);
  assert.deepEqual(gameValues(t), [[0, 0], [4, 0]]);
});

test('both rules on different games are derived on their own', () => {
  const t = load([[game('a', 3, 0), game('b', 0, 2)]], {});
  assert.deepEqual(teamValues(t), [3, 2]);
});

test('settings that already hold a valid value keep it, whatever the games say', () => {
  const t = load([[game('a', 1, 2)]], { maxBench: 4, maxConsecutive: 0 });
  assert.deepEqual(teamValues(t), [0, 4]);
  assert.deepEqual(gameValues(t), [[1, 2]]);
});

test('junk team values are derived from the games', () => {
  for (const junk of [-1, 'x', 99, null, '', 2.5]) {
    const t = load([[game('a', 3, 2)]], { maxConsecutive: junk, maxBench: junk });
    assert.deepEqual(teamValues(t), [3, 2], `junk ${JSON.stringify(junk)}`);
  }
});

test('a numeric string is a valid team value', () => {
  assert.deepEqual(teamValues(load([[game('a', 3, 3)]], { maxConsecutive: '2', maxBench: '0' })), [2, 0]);
});

test('no days at all: the fallback game takes the team values (0)', () => {
  const t = sanitizeTeam({ id: 't', name: 'T', players: [], settings: {} }, helpers);
  assert.deepEqual(teamValues(t), [0, 0]);
  assert.deepEqual(gameValues(t), [[0, 0]]);
});

test('no days, settings holding values: the fallback game takes them', () => {
  const t = sanitizeTeam({ id: 't', name: 'T', players: [], settings: { maxConsecutive: 2, maxBench: 3 } }, helpers);
  assert.deepEqual(gameValues(t), [[2, 3]]);
});

test('loading twice gives the same team', () => {
  const once = load([[game('a', 3, 0), game('b', 2, 4)], [game('c', 0, 2)]], { maxBench: 'x' });
  const twice = sanitizeTeam(structuredClone(once), helpers);
  assert.deepEqual(twice, once);
});
