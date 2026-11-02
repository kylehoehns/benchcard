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
    test('Plays at most reaches 7 of 8 stints; Sits at most stops at 4', async () => {
      const { coach } = own;
      await coach.onGameDay();
      await coach.tap('Hawks, 9:00 AM, planned');
      await openPlan(coach);
      await coach.tap('Add a rule');
      await coach.tap('Plays at most N in a row');
      assert.equal(await coach.text('#planKindBody .pgrp-f'), '2 stints in a row is 8 min.');
      await coach.stepTo('stints', 7);
      await coach.stepTo('stints', 6);
      assert.equal(await coach.text('#planKindBody .pgrp-f'), '6 stints in a row is 24 min.');
      await coach.tap('Sits at most N in a row');
      await coach.stepTo('stints', 4);
      await assert.rejects(coach.stepTo('stints', 5), /ended at 4|disabled|wanted 5/);
    });
  });

  describe('breaks only', { concurrency: 1 }, () => {
    const own = chrome();
    test('the row, the hint and the saved sentence say quarters', async () => {
      const { coach } = own;
      await coach.onGameDayWith({ granMode: 'breaksOnly', granValue: 1 });
      await coach.tap('Hawks, 9:00 AM, planned');
      await openPlan(coach);
      await coach.tap('Add a rule');
      await coach.tap('Plays at most N in a row');
      assert.equal(await coach.text('#planKindBody .prow-t'), 'Quarters in a row');
      assert.equal(await coach.text('#planKindBody .pgrp-f'), '2 quarters in a row is 16 min.');
      await coach.stepTo('quarters', 3);
      await coach.stepTo('quarters', 2);
      await coach.tap('Add rule');
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
      await coach.onGameDayWith(HALVES);
      await coach.tap('Hawks, 9:00 AM, planned');
      await openPlan(coach);
      await coach.tap('Add a rule');
      await coach.tap('Plays at most N in a row');
      assert.equal(await coach.text('#planKindBody .prow-t'), 'Halves in a row');
      assert.equal(await coach.text('#planKindBody .pstep-val'), '1', 'the stepper starts at its top');
      assert.equal(await coach.text('#planKindBody .pgrp-f'), '1 half in a row is 16 min.');
      assert.ok(await coach.isDisabled('More halves'), 'nothing above 1');
      await coach.tap('Add rule');
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
