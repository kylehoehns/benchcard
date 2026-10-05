/* Plan scenarios (the BDD pilot, third journey): a coach shapes a game's plan
 * on the game screen -- who is here, the format, the sub interval, the
 * strategy, a shuffle, a lock -- driven in real Chrome through
 * `test/coach.js`. The day is RICH's: 11 players, 4 × 8 quarters subbed every
 * 4 minutes (8 stints, 160 player-minutes). Each test opens the Hawks game
 * and asserts only what a coach sees, or what is still there after a reopen.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const total = minutes => Object.values(minutes).reduce((a, b) => a + b, 0);

describe('a coach shapes the plan', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function openHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
  }

  test('marking a player absent takes her out of the plan, and she stays out after a reopen', async () => {
    await openHawks();
    assert.ok(await coach.sees("Who's here, 11 players"));
    await coach.tap("Who's here, 11 players");
    await coach.tap('Ana Reyes');
    await coach.tap('Close');

    assert.ok(await coach.sees("Who's here, 10 players"));
    const minutes = await coach.planMinutes();
    assert.equal(Object.keys(minutes).length, 10);
    assert.equal('Ana Reyes' in minutes, false, 'Ana is not on the timeline');
    assert.equal(total(minutes), 160);

    await coach.comeBackDaysLater(0);
    assert.ok(await coach.sees("Who's here, 10 players"));
  });

  test('changing the format to 2 periods of 16 minutes keeps the minutes at 160', async () => {
    await openHawks();
    await coach.tap('Format, 4 × 8');
    for (let i = 0; i < 2; i++) await coach.tap('Fewer periods');
    for (let i = 0; i < 8; i++) await coach.tap('More minutes');
    await coach.tap('Close');

    assert.ok(await coach.sees('Format, 2 × 16'));
    assert.equal(total(await coach.planMinutes()), 160);
  });

  test('subbing every 2 minutes doubles the stints and keeps the minutes at 160', async () => {
    await openHawks();
    assert.equal(await coach.planStints(), 8);
    await coach.tap('Sub interval, every 4 min');
    await coach.tap('Every 2 min');
    await coach.tap('Close');

    assert.ok(await coach.sees('Sub interval, every 2 min'));
    assert.equal(await coach.planStints(), 16);
    assert.equal(total(await coach.planMinutes()), 160);
  });

  test('choosing By hand gives every player a minutes slider', async () => {
    await openHawks();
    const names = Object.keys(await coach.planMinutes());
    assert.equal(names.length, 11);
    await coach.tap('Plan, even minutes');
    assert.equal(await coach.sees('Target minutes for Ana Reyes'), false, 'Even has no sliders');
    await coach.tap('By hand');

    for (const name of names) assert.ok(await coach.sees(`Target minutes for ${name}`), `a slider for ${name}`);
    await coach.tap('Close');
    assert.ok(await coach.sees('Plan, minutes set by hand'));
  });

  test('shuffling changes the starting five and keeps the minutes at 160', async () => {
    await openHawks();
    await coach.tap('Card');
    const first = await coach.starters();
    assert.equal(first.length, 5);

    /* A shuffle draws a new seed and the same five can come back by chance
       (about 1 in 462), so give it up to 3 taps to change the five. */
    let latest = first;
    for (let i = 0; i < 3 && latest.join() === first.join(); i++) {
      await coach.tap('Shuffle');
      latest = await coach.starters();
    }

    assert.notDeepEqual(latest, first, 'three shuffles left the same starting five');
    assert.equal(total(await coach.planMinutes()), 160);
  });

  test('a locked player keeps her 16 minutes through an absence, a shuffle and a reopen', async () => {
    await openHawks();
    await coach.tap('Plan, even minutes');
    await coach.tap('By hand');
    assert.deepEqual(await coach.lockedMinutes(), []);
    await coach.lockMinutes('Ana Reyes');
    assert.deepEqual(await coach.lockedMinutes(), ['Ana Reyes']);
    await coach.tap('Close');

    /* Marcus's 16 minutes are shared out among the players who are not
       locked. Without the lock Ana takes some of them (20) on most seeds. */
    await coach.tap("Who's here, 11 players");
    await coach.tap('Marcus Williams');
    await coach.tap('Close');
    let minutes = await coach.planMinutes();
    assert.equal(total(minutes), 160);
    assert.equal(minutes['Ana Reyes'], 16);

    await coach.tap('Shuffle');
    assert.equal((await coach.planMinutes())['Ana Reyes'], 16);

    await coach.comeBackDaysLater(0);
    minutes = await coach.planMinutes();
    assert.equal(minutes['Ana Reyes'], 16);
    assert.equal(total(minutes), 160);
    await coach.tap('Plan, minutes set by hand');
    assert.deepEqual(await coach.lockedMinutes(), ['Ana Reyes'], 'the lock was saved');
  });
});
