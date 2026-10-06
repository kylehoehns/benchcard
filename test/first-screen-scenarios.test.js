/* First-screen scenarios (#326): the screen a coach opens the app on slides
 * in without fading, so it is on screen in the first frame -- and Chrome
 * counts it as painted, which is what FCP and LCP measure. Moving to another
 * screen afterwards still fades, as it always has. Driven in real Chrome
 * through `test/coach.js`; each test asserts only what is on screen.
 *
 * Phone-sized, apart from the one wide-screen test.
 *
 * Skipped where there is no Chrome, as game-day-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('the first screen paints at once', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); await coach.realMotion(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('a first-time visitor sees the welcome screen without a fade', async () => {
    await coach.onFreshDevice();
    assert.deepEqual(await coach.fadedIn(), []);
  });

  test('a returning coach sees Today without a fade', async () => {
    await coach.onGameDay();
    assert.deepEqual(await coach.fadedIn(), []);
  });

  test('opening a game from Today still fades the game screen in', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.deepEqual(await coach.fadedIn(), ['view-games']);
  });

  test('going back to Today from a game fades Today in again', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Back to Smoke Test');
    assert.deepEqual(await coach.fadedIn(), ['view-games', 'view-today']);
  });

  test('on a wide screen the game beside Today still fades in', async () => {
    await coach.onGameDayWide();
    assert.deepEqual(await coach.fadedIn(), ['view-games']);
  });
});
