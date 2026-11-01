/* #446: when two rules collide, the notes under the plan name the rule that
 * bound, and a minimum beats a locked By hand number. RICH's game day (Hawks,
 * 9:00 AM; 4 x 8, 8 stints), driven through test/coach.js. Skipped where
 * there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('the notes under the plan name the rule that bound', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('two Apart players on a six-player bench: the note names Apart and never says Shuffle', async () => {
    await coach.onGameDayWith({ constraints: { avoids: [['p0', 'p1']] } }, 6);
    await coach.tap('Hawks, 9:00 AM, planned');
    const notes = await coach.text('#issues');
    assert.match(notes, /Apart/);
    assert.doesNotMatch(notes, /Shuffle/);
  });

  test('a By hand number locked under the league minimum is raised, and the note says the league minimum', async () => {
    // 2 slots is 8 minutes; the 40 slots of a 10-player, 8-stint game are all handed out
    const targetSlots = { p0: 2, p1: 5, p2: 5, p3: 4, p4: 4, p5: 4, p6: 4, p7: 4, p8: 4, p9: 4 };
    await coach.onGameDayWith({ strategy: 'minutes', constraints: { targetSlots, lockedTargets: ['p0'] } }, 10);
    await coach.tap('Settings');
    await coach.fill('How much everyone plays at least', '16');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.equal((await coach.planMinutes())['Marcus Williams'], 16);
    const notes = await coach.text('#issues');
    assert.match(notes, /Marcus Williams's By hand number was raised from 8 to 16 to meet the league minimum\./);
  });

  test('a cap under the league minimum lowers the number a lock is raised to, and the note says their minimum', async () => {
    const targetSlots = { p0: 2, p1: 5, p2: 5, p3: 4, p4: 4, p5: 4, p6: 4, p7: 4, p8: 4, p9: 4 };
    await coach.onGameDayWith({ strategy: 'minutes', constraints: { targetSlots, lockedTargets: ['p0'], maxMinutes: { p0: 12 } } }, 10);
    await coach.tap('Settings');
    await coach.fill('How much everyone plays at least', '16');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    const notes = await coach.text('#issues');
    assert.match(notes, /Marcus Williams's By hand number was raised from 8 to 12 to meet their 12-minute minimum\./);
    assert.ok(lacks(notes, /league\s+minimum/));
  });

  test('the page for a minimum says a locked By hand number below it loses', async () => {
    await coach.onGameDayWith({ constraints: { minMinutes: { p0: 20 } } }, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
    await coach.tap((await coach.controls()).find(n => /plays at least 20 min/.test(n)));
    assert.match(await coach.text('#planSub'),
      /If a locked By hand number is lower, the minimum wins and the plan notes say so\./);
  });

  test('the page for the league minimum says it too', async () => {
    await coach.onGameDayWith({}, 10);
    await coach.tap('Settings');
    await coach.fill('How much everyone plays at least', '16');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
    await coach.tap((await coach.controls()).find(n => /Everyone plays at least 16 min/.test(n)));
    assert.match(await coach.text('#planSub'),
      /If a locked By hand number is lower, the minimum wins and the plan notes say so\./);
  });

  test('once the game is finished the Apart note gives way to the minutes the timeline shows', async () => {
    await coach.onGameDayWith({ constraints: { avoids: [['p0', 'p1']] } }, 6);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 40, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');
    const notes = await coach.text('#issues');
    assert.ok(lacks(notes, /share one spot/));
    assert.match(notes, /everyone else 32\./);
  });
});
