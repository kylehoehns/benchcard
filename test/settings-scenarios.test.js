/* Settings scenarios (the BDD pilot): a coach changes Settings and they
 * stick -- Appearance, a Backup they can restore, removing a Team -- driven
 * in real Chrome through `test/coach.js`. The day is RICH's: 11 players,
 * 4 x 8 quarters subbed every 4 minutes, Hawks at 9:00 AM and Ravens at
 * 11:30 AM, the clock pinned to Sat, Sep 12, 2026, 12:00. Each test asserts
 * only what a coach sees, or what is kept across a reload.
 *
 * Skipped where there is no Chrome, as day-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const LIGHT = 'rgb(244, 244, 246)';
const DARK = 'rgb(11, 11, 12)';

describe('a coach changes Settings', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('switching Appearance to Dark makes the page dark, and it stays dark after reopening', async () => {
    await coach.onGameDay();
    await coach.tap('Settings');
    assert.equal(await coach.isPressed('Light'), true);
    assert.equal(await coach.pageBackground(), LIGHT);

    await coach.tap('Dark');
    assert.equal(await coach.isPressed('Dark'), true);
    assert.equal(await coach.isPressed('Light'), false);
    assert.equal(await coach.pageBackground(), DARK);

    await coach.comeBackLaterOn('settings');
    assert.equal(await coach.isPressed('Dark'), true);
    assert.equal(await coach.pageBackground(), DARK);
  });

  test('a saved Backup, restored after the Roster changed, brings the original 11 players back', async () => {
    await coach.onGameDay();
    await coach.tap('Team Smoke Test · 11 players ›');
    const original = await coach.rosterNames();
    assert.equal(original.length, 11);
    await coach.tap('Back to Smoke Test');
    await coach.tap('Settings');

    const backup = await coach.download('Save a backup file');
    assert.equal(backup.filename, 'benchcard-smoke-test-2026-09-12.json');
    assert.equal(await coach.toast(), 'Backup saved. Keep it somewhere safe.');

    await coach.tap('Back to Smoke Test');
    await coach.tap('Team Smoke Test · 11 players ›');
    await coach.openPlayer('Ana Reyes');
    await coach.tap('Remove from team');
    assert.equal((await coach.rosterNames()).length, 10);
    await coach.tap('Back to Smoke Test');
    await coach.tap('Settings');

    await coach.pickFile('Restore from a file', backup);
    assert.equal(await coach.toast(), 'Restored 11 players.');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Team Smoke Test · 11 players ›');
    assert.deepEqual(await coach.rosterNames(), original);

    await coach.comeBackLaterOn('team');
    assert.deepEqual(await coach.rosterNames(), original);
  });

  test('removing a Team asks first, removes it, and leaves the other Team as it was', async () => {
    await coach.onGameDayWithTwoTeams();
    await coach.tap('Settings');

    await coach.tap('Remove this team');
    const ask = await coach.dialog();
    assert.notEqual(ask, null, 'the app asks before it removes a team');
    assert.equal(ask.modal, true);
    assert.equal(ask.title, 'Remove Smoke Test?');
    assert.ok(ask.body.startsWith('11 players, their levels and every game go with it.'), ask.body);
    assert.ok(await coach.sees('Cancel'));
    assert.ok(await coach.sees('Remove team'));

    await coach.tap('Cancel');
    assert.equal(await coach.dialog(), null);
    assert.ok(await coach.sees('Back to Smoke Test'));

    await coach.tap('Remove this team');
    await coach.tap('Remove team');
    assert.equal(await coach.toast(), 'Removed Smoke Test.');
    assert.ok(await coach.sees('Undo'));
    assert.ok(await coach.sees('Team JV Ravens · 10 players ›'));
    await coach.tap('Team JV Ravens · 10 players ›');
    const kept = await coach.rosterNames();
    assert.deepEqual(kept, ['Maya Webb', 'Eli Tran', 'Devon Ellis', 'Nia Bell', 'Caleb Ruiz',
      'Harper Pratt', 'Silas Hart', 'Jonah Reed', 'Ruby Marsh', 'Isaac Lowe']);

    await coach.comeBackLaterOn('team');
    assert.deepEqual(await coach.rosterNames(), kept);
    await coach.tap('Back to JV Ravens');
    assert.equal(await coach.sees('Smoke Test'), false);
  });
});
