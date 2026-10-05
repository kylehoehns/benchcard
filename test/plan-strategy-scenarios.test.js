/* Plan scenarios (the BDD pilot, third journey), part 2: a coach picks the
 * strategy, shuffles and locks a player's minutes on the game screen --
 * driven in real Chrome through
 * `test/coach.js`. The day is RICH's: 11 players, 4 × 8 quarters subbed every
 * 4 minutes (8 stints, 160 player-minutes). Each test opens the Hawks game
 * and asserts only what a coach sees, or what is still there after a reopen.
 *
 * Who's here, format and sub interval are in plan-scenarios.test.js.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const total = minutes => Object.values(minutes).reduce((a, b) => a + b, 0);

describe('a coach shapes the plan by strategy, shuffle and lock', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function openHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
  }

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
       locked. With the fixture's seed, Ana would take some of them (20)
       without the lock. */
    await coach.tap("Who's here, 11 players");
    await coach.tap('Marcus Williams');
    await coach.tap('Close');
    let minutes = await coach.planMinutes();
    assert.equal(total(minutes), 160);
    assert.equal(minutes['Ana Reyes'], 16);

    await coach.tap('Shuffle');
    assert.equal((await coach.planMinutes())['Ana Reyes'], 16);
    await coach.tap('Plan, minutes set by hand');
    assert.deepEqual(await coach.lockedMinutes(), ['Ana Reyes'], 'the lock survived the shuffle');
    await coach.tap('Close');

    await coach.comeBackDaysLater(0);
    minutes = await coach.planMinutes();
    assert.equal(minutes['Ana Reyes'], 16);
    assert.equal(total(minutes), 160);
    await coach.tap('Plan, minutes set by hand');
    assert.deepEqual(await coach.lockedMinutes(), ['Ana Reyes'], 'the lock was saved');
  });
});
