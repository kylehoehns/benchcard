/* #498: a new version takes over and the coach is offered a reload. Driven
 * through test/coach.js on RICH's game day: the page is already controlled
 * when it boots and the new worker arrives later (`withWaitingWorker`).
 * Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

// The words are pinned on purpose: a coach reads them, so a change to the copy
// should fail here and be made deliberately.
const OFFER = 'New version ready Reload to get it. Your game stays saved.';
const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('the update offer', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); await coach.withWaitingWorker(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('a new version taking over offers Reload and Dismiss, in words that say the game stays saved; dismissed, it comes back the next time the coach returns', async () => {
    await coach.onGameDay();
    await coach.newVersionTakesOver();

    assert.equal(await coach.toast(), OFFER);
    for (const name of ['Reload', 'Dismiss']) {
      assert.ok((await coach.sizeOf(name)).height >= 48, `${name} is under 48px tall`);
    }

    await coach.tap('Dismiss');
    assert.equal(await coach.toast(), '');

    await coach.leaveAndComeBack();
    assert.equal(await coach.toast(), OFFER);
  });

  test('tapping Reload reloads the page', async () => {
    await coach.onGameDay();
    await coach.markPage();
    await coach.newVersionTakesOver();

    await coach.tap('Reload');

    assert.equal(await coach.reloaded(), true);
  });

  test('over bench mode a takeover shows nothing, and the offer is there once the coach is back on Today', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');

    await coach.newVersionTakesOver();
    assert.equal(await coach.toast(), '', 'the offer came up over bench mode');

    await coach.tap('Leave');
    await coach.leaveAndComeBack();
    assert.equal(await coach.toast(), OFFER);
  });
});
