/* #575: the Sub interval sheet lists only the choices that give different
 * subs for this game's length. Driven in real Chrome through test/coach.js.
 * The day is RICH's: Hawks is 4 × 8, subbed every 4 minutes. Skipped where
 * there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';
const CHOICE = /^(Every \d min|\d× a period|Only at breaks)$/;

describe('a coach opens the Sub interval sheet', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const choices = async () => (await coach.controls()).filter(n => CHOICE.test(n));

  test('4 × 8 lists no choice twice, and the one in use shows', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Sub interval, every 4 min');
    assert.deepEqual(await choices(), ['Every 2 min', 'Every 3 min', 'Every 4 min', 'Every 5 min',
      '3× a period', 'Only at breaks']);
  });

  test('a 4 × 8 game set to 4× a period shows 4× a period and not Every 2 min', async () => {
    await coach.onGameDayWith({ granMode: 'perPeriod', granValue: 4 });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Sub interval, 4× a period');
    assert.deepEqual(await choices(), ['Every 3 min', 'Every 4 min', 'Every 5 min',
      '3× a period', '4× a period', 'Only at breaks']);
  });
});
