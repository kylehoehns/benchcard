/* #437: a late kid marked Here now, with a kid fixed to a stint whose Plays at
 * most is spent: the stints already played stay, and the coach is told once
 * that the kid is no longer held to a stint. Driven through test/coach.js, the
 * Hawks game with nine at the game (p8 out), Plays at most 8 on the first
 * player and Starts the last period for them. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a spent Plays at most does not rewrite the game already played', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('1. Here now at stint 7 keeps the played stints and says the first player is no longer fixed', async () => {
    await coach.onGameDayWith({
      out: ['p8'],
      constraints: { minMinutes: {}, maxMinutes: { p0: 8 }, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: ['p0'] },
    }, 9);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 6; i++) await coach.tap('Next stint');
    assert.equal(await coach.stint(), '7 of 8', 'the premise');
    await coach.tap('Here now, Casey Lindqvist');

    assert.equal(await coach.toast(),
      'Casey is here. Not enough minutes left to keep Marcus fixed to a stint.');
  });

  test('2. Sit for the rest at the last stint says the first player is no longer fixed', async () => {
    await coach.onGameDayWith({
      out: ['p8'],
      constraints: { minMinutes: {}, maxMinutes: { p0: 8 }, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: ['p0'] },
    }, 9);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    const sat = (await coach.onFloor()).find(n => n !== 'Marcus Webb');
    await coach.tapPlayer(sat);
    await coach.tap('Sit for the rest');

    assert.match(await coach.toast(), /sits for the rest\. The others share those minutes\. Not enough minutes left to keep Marcus fixed to a stint\.$/);
  });
});
