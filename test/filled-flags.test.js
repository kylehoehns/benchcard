/* #569: whether the app filled in Platoon's groups (`unitsBuilt`) or Closers'
   five (`closersBuilt`) survives a save and load only as a plain true, and
   travels with the plan when a game's setup is copied. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];

test('unitsBuilt and closersBuilt survive a save and load only when they are true', async () => {
  const { sanitize } = await import('../app/storage.js');
  const emptyConstraints = () => ({ minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], openingFive: [],
    lastPeriodFive: [], maxConsecutive: 0, targetSlots: {}, lockedTargets: [],
    closing: { stints: 2, players: [] }, units: [] });
  const newGame = () => ({ id: 'gnew', label: '', tipoff: '', periods: 4, periodMinutes: 8, granMode: 'everyN',
    granValue: 4, out: [], useCarryover: false, strategy: 'balanced', balance: 'even',
    live: { at: 0, overrides: {} }, seed: 1, constraints: emptyConstraints() });
  const H = { emptyConstraints, newGame, migrateLegacy: () => null };
  const loaded = extra => sanitize({ version: 4, onboarded: true, teams: [{ id: 't', name: 'T',
    players: ids.map(id => ({ id, name: id })),
    days: [{ name: '', date: '2026-09-26', games: [{ id: 'g1', strategy: 'platoon', ...extra }] }] }] }, H)
    .teams[0].days[0].games[0];

  assert.equal(loaded({ unitsBuilt: true }).unitsBuilt, true);
  assert.equal(loaded({ closersBuilt: true }).closersBuilt, true);
  for (const flag of ['unitsBuilt', 'closersBuilt']) {
    assert.equal(flag in loaded({ [flag]: 'yes' }), false);
    assert.equal(flag in loaded({ [flag]: 1 }), false);
    assert.equal(flag in loaded({}), false);
  }
});

test('copying how a game plans carries the two flags with the plan, and clears them when the source has none', async () => {
  const { S, bareGame } = await import('./state-fixture.js');
  const plan = { rules: false, plan: true, format: false, here: false };
  const built = bareGame({ strategy: 'platoon', unitsBuilt: true, closersBuilt: true });
  const a = bareGame({});
  S.copySetup(a, built, plan);
  assert.equal(a.unitsBuilt, true);
  assert.equal(a.closersBuilt, true);

  const b = bareGame({ unitsBuilt: true, closersBuilt: true });
  S.copySetup(b, bareGame({ strategy: 'platoon' }), plan);
  assert.equal('unitsBuilt' in b, false);
  assert.equal('closersBuilt' in b, false);

  const c = bareGame({ unitsBuilt: true });
  S.copySetup(c, built, { rules: true, plan: false, format: true, here: true });
  assert.equal(c.unitsBuilt, true, 'the plan switch off leaves the target\'s own flag alone');
});
