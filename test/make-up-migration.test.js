/* #563: the two per-game flags load as one of three choices, and the team's old
 * `seasonDefault` becomes `settings.makeUp`. Pure cases on storage.js's cleaner. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTeam, sanitizeSettings, DEFAULT_SETTINGS } from '../app/storage.js';

const emptyConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [],
  openingFive: [], lastPeriodFive: [], maxConsecutive: 0,
  targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [],
});
const newGame = () => ({ id: 'gnew', label: '', tipoff: '', periods: 4, periodMinutes: 8,
  granMode: 'everyN', granValue: 4, out: [], useCarryover: false, useSeasonTargets: false,
  strategy: 'balanced', seed: 1, constraints: emptyConstraints() });
const H = { emptyConstraints, newGame, today: new Date(2026, 8, 22) };

const load = (flags, settings) => sanitizeTeam({
  id: 't', name: 'T', players: [{ id: 'a', name: 'Avery' }], activeDay: 0, activeGame: 0,
  days: [{ name: '', date: '2026-09-22', games: [{ id: 'g1', ...flags }] }],
  ...(settings ? { settings } : {}),
}, H);
const flagsOf = t => { const g = t.days[0].games[0]; return [g.useCarryover, g.useSeasonTargets]; };

test('each of the four flag pairs loads as one of the three choices', () => {
  assert.deepEqual(flagsOf(load({ useCarryover: false, useSeasonTargets: false })), [false, false], 'this game only');
  assert.deepEqual(flagsOf(load({ useCarryover: true, useSeasonTargets: false })), [true, false], 'earlier today');
  assert.deepEqual(flagsOf(load({ useCarryover: false, useSeasonTargets: true })), [true, true], 'season only is the season so far');
  assert.deepEqual(flagsOf(load({ useCarryover: true, useSeasonTargets: true })), [true, true], 'the season so far');
  assert.deepEqual(flagsOf(load({})), [false, false], 'absent flags');
});

test('seasonDefault becomes makeUp: true is season, false or absent is day, junk is day', () => {
  const at = raw => sanitizeSettings(raw).makeUp;
  assert.equal(at({ seasonDefault: true }), 'season');
  assert.equal(at({ seasonDefault: false }), 'day');
  assert.equal(at({}), 'day');
  assert.equal(at(undefined), 'day');
  for (const junk of [null, 1, 'season', 'true', {}, []]) assert.equal(at({ seasonDefault: junk }), 'day', String(junk));
  for (const junk of [undefined, null, 'week', 3, {}, [], 'Season']) assert.equal(at({ makeUp: junk }), 'day', String(junk));
  for (const ok of ['game', 'day', 'season']) assert.equal(at({ makeUp: ok }), ok);
  assert.equal(at({ makeUp: 'game', seasonDefault: true }), 'game', 'a saved choice wins over the old key');
  assert.equal(DEFAULT_SETTINGS.makeUp, 'day');
});

test('seasonDefault is gone from the cleaned settings, and cleaning twice changes nothing', () => {
  const once = sanitizeSettings({ seasonDefault: true, maxSubs: 4 });
  assert.equal('seasonDefault' in once, false);
  assert.deepEqual(sanitizeSettings(once), once);
  const t = load({ useCarryover: false, useSeasonTargets: true }, { seasonDefault: true });
  assert.equal('seasonDefault' in t.settings, false);
  assert.equal(t.settings.makeUp, 'season');
  const again = sanitizeTeam(JSON.parse(JSON.stringify(t)), H);
  assert.deepEqual(again, t);
});
