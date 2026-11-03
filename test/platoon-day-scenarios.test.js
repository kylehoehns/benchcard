/* #552: a later game on Platoon does not say it evens out the day, because the
   fives the coach set decide who plays. Driven through test/coach.js. The
   switch keeps its setting, so Even brings the wording back. Skipped where
   there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const ROSTER = ['Webb', 'Kade', 'Brooks', 'Brody', 'Jack', 'Sheeks', 'Cooper', 'Tate', 'Damari', 'Reid'];
const UNITS = [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8', 'p9']];

describe('Platoon: a second game the same day', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function gameTwoOnPlatoon() {
    await coach.onGameDayWith(g => ({
      periods: 2, periodMinutes: 16, granMode: 'everyN', granValue: 4, out: [],
      strategy: 'platoon', useCarryover: true, constraints: { ...g.constraints, units: UNITS },
    }), undefined, { names: ROSTER, settings: { maxSubs: 5 }, alone: true });
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
  }

  test('1. its summary and sentence do not say it evens out the day, and its switch says why it is off', async () => {
    await gameTwoOnPlatoon();
    assert.ok(lacks(await coach.text('body'), 'Evens out the'), 'the page says Platoon evens out the day');
    assert.ok(lacks(await coach.text('body'), 'evens out the day'), 'the page says Platoon evens out the day');
    await coach.tap('Plan, fixed fives');
    assert.equal(await coach.isDisabled('Even out earlier games'), true);
    assert.match(await coach.text('#planDay'), /Not used with fixed units\. The fives you set decide who plays\./);
  });

  test('2. switched to Even it evens out the day again, with the switch enabled and still on', async () => {
    await gameTwoOnPlatoon();
    await coach.tap('Plan, fixed fives');
    await coach.tap('Even');
    assert.equal(await coach.isDisabled('Even out earlier games'), false);
    assert.equal(await coach.isOn('Even out earlier games'), true);
    await coach.tap('Close');
    assert.match(await coach.text('body'), /Evens out the 9:00 AM game./);
  });

  /* #553: game 1 sat Reid out, so game 2 has a real deficit to carry. Game 2
     is the same game with Reid back, switched to Platoon with the switch on. */
  async function gameTwoAfterAbsence() {
    await coach.onGameDayWith(g => ({
      periods: 2, periodMinutes: 16, granMode: 'everyN', granValue: 4, out: ['p9'],
      strategy: 'balanced', useCarryover: true, constraints: { ...g.constraints, units: UNITS },
    }), undefined, { names: ROSTER, settings: { maxSubs: 5 }, alone: true });
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    await coach.tap("Who's here, 9 players");
    await coach.tap('Reid');
    await coach.tap('Close');
    await coach.tap('Plan, even minutes');
    await coach.tap('Platoon');
    await coach.tap('Close');
  }

  test('3. its notes do not say minutes are uneven to even out the day', async () => {
    await gameTwoAfterAbsence();
    assert.ok(lacks(await coach.text('#issues'), 'even out the day'), await coach.text('#issues'));
    assert.ok(lacks(await coach.text('body'), 'uneven on purpose'), 'the spread line says it is uneven on purpose');
  });

  test('4. switched to Even, the notes about catching Reid up come back', async () => {
    await gameTwoAfterAbsence();
    await coach.tap('Plan, fixed fives');
    await coach.tap('Even');
    await coach.tap('Close');
    assert.match(await coach.text('#issues'), /even out the day/);
  });
});
