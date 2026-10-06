/* Reopen scenarios (#306): a coach closes the app on the Hawks Game and
 * comes back, driven in real Chrome through `test/coach.js`. The day is
 * RICH's, as game-day-scenarios.test.js has it: Hawks at 9:00 and Ravens at
 * 11:30, 8 stints. A reopen on a later day lands on Today with the Filing
 * toast; a reopen the same day stays where the coach left it. Each test
 * asserts only what a coach sees.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { GAMES_VIEW_READY } from '../scripts/smoke/fixtures.mjs';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

// the day files after the first paint, so the page is ready once its toast is up
const FILED_TOAST_READY = `document.querySelector('.toast')`;

describe('a coach reopens the app', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* Run Hawks to the end, then open its Game screen and leave the app there. */
  async function leaveOnFinishedHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');
  }

  test('reopened the next day on the Game screen, the coach lands on Today with the Filing toast', async () => {
    await leaveOnFinishedHawks();
    assert.ok(await coach.showing('game'), 'the coach left the app on the Game screen');
    await coach.comeBackDaysLater(1, FILED_TOAST_READY);

    assert.equal(await coach.toast(), 'Sat, Sep 12: 1 game filed to the season. Ravens was never started, so it was left out.');
    assert.ok(await coach.showing('today'), 'Today is showing');
    assert.equal(await coach.showing('game'), false, 'the Game screen is not');
    assert.ok(await coach.sees('Season 1 game filed ›'));
  });

  test('reopened the same day on the Game screen, the coach is still on it with no Filing toast', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.comeBackDaysLater(0, GAMES_VIEW_READY);

    assert.ok(await coach.showing('game'), 'the Game screen is showing');
    assert.equal(await coach.showing('today'), false, 'Today is not');
    assert.equal(await coach.toast(), '', 'nothing was filed, so no toast');
  });

  test('Undo on the Filing toast after a next-day reopen puts the coach back on the Game screen', async () => {
    await leaveOnFinishedHawks();
    await coach.comeBackDaysLater(1, FILED_TOAST_READY);
    await coach.tap('Undo');

    assert.ok(await coach.showing('game'), 'back on the Game screen');
  });
});
