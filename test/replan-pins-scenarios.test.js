/* #437, #444: a re-plan with a kid fixed to a stint (Starts the last period for
 * the first player). Once the last period has begun that rule is done, so a
 * late kid marked Here now or a sit for the rest says nothing about the first
 * player (tests 1 and 2); before it begins, a Plays at most that is spent is
 * dropped and the coach is told once that the kid is no longer held (test 3).
 * Driven through test/coach.js, the Hawks game with nine at the game (p8 out).
 * Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a spent Plays at most does not rewrite the game already played', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('1. Here now at stint 7 keeps the played stints and does not say the first player is no longer fixed', async () => {
    await coach.onGameDayWith({
      out: ['p8'], late: ['p8'],
      constraints: { minMinutes: {}, maxMinutes: { p0: 8 }, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: ['p0'] },
    }, 9);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 6; i++) await coach.tap('Next stint');
    assert.equal(await coach.stint(), '7 of 8', 'the premise');
    await coach.tap('Here now, Casey Lindqvist');

    /* #444: stint 6 began the last period, so Starts the last period is done and
       Marcus is not held to stint 7: nothing to say about him. */
    assert.equal(await coach.toast(), 'Casey is here.');
  });

  test('2. Sit for the rest at the last stint does not say the first player is no longer fixed', async () => {
    await coach.onGameDayWith({
      out: ['p8'], late: ['p8'],
      constraints: { minMinutes: {}, maxMinutes: { p0: 8 }, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: ['p0'] },
    }, 9);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    const sat = (await coach.onFloor()).find(n => n !== 'Marcus Webb');
    await coach.tapPlayer(sat);
    await coach.tap('Sit for the rest');

    assert.match(await coach.toast(), /sits for the rest\. The others share those minutes\.$/);
  });

  test('3. A This stint swap at stint 6 that spends the first player\'s Plays at most says they are no longer fixed', async () => {
    await coach.onGameDayWith({
      out: ['p8'], late: ['p8'],
      constraints: { minMinutes: {}, maxMinutes: { p0: 4 }, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: ['p0'] },
    }, 9);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 5; i++) await coach.tap('Next stint');
    assert.equal(await coach.stint(), '6 of 8', 'the premise: the last period starts next stint');
    const off = (await coach.onFloor())[0];
    await coach.tapPlayer(off);
    await coach.tapPlayer('Marcus Williams');

    assert.match(await coach.toast(), / Not enough minutes left to keep Marcus fixed to a stint\.$/);
  });
});
