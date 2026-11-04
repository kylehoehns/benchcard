/* #452: the run stepper counts what the game actually has. Plays-at-most goes
 * up to one less than the game's stints (it stopped at 4); under Breaks only a
 * stint is a whole period, so the row and the sentences say quarters, halves
 * or periods. Driven in real Chrome through `test/coach.js`, like
 * rules-scenarios.test.js. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

function chrome() {
  const own = {};
  before(async () => { own.coach = await Coach.open(); });
  after(async () => { await own.coach?.close(); });
  afterEach(() => { assert.deepEqual(own.coach.errors, [], 'the page logged an error'); });
  return own;
}

async function openPlan(coach) {
  await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
}

describe('the run stepper (#452)', { skip, concurrency: true }, () => {
  describe('every 4 minutes', { concurrency: 1 }, () => {
    const own = chrome();
    test('the stepper shows minutes, not stints, reaches 7 of 8 subs for Plays at most and stops at 4 for Sits at most', async () => {
      const { coach } = own;
      await coach.onGameDayWith(g => ({ constraints: { ...g.constraints, maxConsecutive: 2, maxBench: 2 } }));
      await coach.tap('Hawks, 9:00 AM, planned');
      await openPlan(coach);
      await coach.tap('Each player plays at most 2 stints in a row (8 min)');
      assert.equal(await coach.text('#planSub .prow-t'), 'In a row');
      assert.equal(await coach.text('#planSub .pstep-val'), '8 min');
      assert.equal(await coach.count('#planSub .pgrp-f:not([hidden])'), 1, 'only the game-only line, no N stints is X min hint');
      for (let i = 0; i < 5; i++) await coach.tap('Longer');
      assert.equal(await coach.text('#planSub .pstep-val'), '28 min', '7 of the 8 subs');
      assert.ok(await coach.isDisabled('Longer'), 'all 8 would be no limit');
      await coach.tap('Shorter');
      assert.equal(await coach.text('#planSub .pstep-val'), '24 min');
      await coach.tap('Back to Plan');
      await coach.tap('Each player sits at most 2 stints in a row (8 min)');
      await coach.tap('Longer');
      await coach.tap('Longer');
      assert.equal(await coach.text('#planSub .pstep-val'), '16 min');
      assert.ok(await coach.isDisabled('Longer'), 'Sits at most stops at 4 subs');
    });
  });

  describe('breaks only', { concurrency: 1 }, () => {
    const own = chrome();
    test('the row, the hint and the saved sentence say quarters', async () => {
      const { coach } = own;
      await coach.onGameDayWith(g => ({ granMode: 'breaksOnly', granValue: 1, constraints: { ...g.constraints, maxConsecutive: 2 } }));
      await coach.tap('Hawks, 9:00 AM, planned');
      await openPlan(coach);
      await coach.tap('Each player plays at most 2 quarters in a row (16 min)');
      assert.equal(await coach.text('#planSub .prow-t'), 'Quarters in a row');
      assert.equal(await coach.text('#planSub .pgrp-f'), '2 quarters in a row is 16 min.');
      await coach.stepTo('quarters', 3);
      await coach.stepTo('quarters', 2);
      await coach.tap('Back to Plan');
      assert.ok(await coach.sees('Each player plays at most 2 quarters in a row (16 min)'), 'the rule row says quarters');
      // the saved number is a count of stints (a quarter each here), not minutes: opening the rule shows it as stored
      await coach.tap('Each player plays at most 2 quarters in a row (16 min)');
      assert.equal(await coach.text('.pstep-val'), '2');
    });
  });

  describe('breaks only, two halves', { concurrency: 1 }, () => {
    const own = chrome();
    const HALVES = { granMode: 'breaksOnly', granValue: 1, periods: 2, periodMinutes: 16 };
    test('the stepper tops out at 1 half, says halves, and saves what it shows', async () => {
      const { coach } = own;
      await coach.onGameDayWith(g => ({ ...HALVES, constraints: { ...g.constraints, maxConsecutive: 1 } }));
      await coach.tap('Hawks, 9:00 AM, planned');
      await openPlan(coach);
      await coach.tap('Each player plays at most 1 half in a row (16 min)');
      assert.equal(await coach.text('#planSub .prow-t'), 'Halves in a row');
      assert.equal(await coach.text('#planSub .pstep-val'), '1', 'the stepper starts at its top');
      assert.equal(await coach.text('#planSub .pgrp-f'), '1 half in a row is 16 min.');
      assert.ok(await coach.isDisabled('More halves'), 'nothing above 1');
      await coach.tap('Back to Plan');
      assert.ok(await coach.sees('Each player plays at most 1 half in a row (16 min)'), 'the rule row says halves, and 1');
    });

    test('a saved limit above the top reads as the top when the rule is opened', async () => {
      const { coach } = own;
      await coach.onGameDayWith({ ...HALVES, constraints: {
        keepOnFloor: [], avoids: [], pairs: [], closing: { players: [] }, minMinutes: {}, maxMinutes: {}, maxConsecutive: 2 } });
      await coach.tap('Hawks, 9:00 AM, planned');
      await openPlan(coach);
      await coach.tap('Each player plays at most 2 halves in a row (32 min)');
      assert.equal(await coach.text('.pstep-val'), '1');
    });
  });
});
