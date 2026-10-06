/* Rules scenarios (the BDD pilot, fourth journey): a coach adds Rules to a
 * game and the plan follows them; a Rule that cannot be met shows a Blocked
 * plan that says why. Driven in real Chrome through `test/coach.js`. The day
 * is RICH's: 11 players, 4 × 8 quarters subbed every 4 minutes (8 stints,
 * 160 player-minutes), Hawks at 9:00 and Ravens at 11:30. Each test asserts
 * only what a coach sees, or what is kept across a reload.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. Two
 * Chromes run side by side, each with its own Coach: a rule journey is a
 * few dozen taps and every tap waits for the screen to settle, so one
 * Chrome tapping through all of them would pass the ten seconds a scenario
 * file is allowed. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

/* One Chrome and one Coach for the describe this is called in. */
function chrome() {
  const own = {};
  before(async () => { own.coach = await Coach.open(); });
  after(async () => { await own.coach?.close(); });
  afterEach(() => { assert.deepEqual(own.coach.errors, [], 'the page logged an error'); });
  return own;
}

async function openHawks(coach) {
  await coach.onGameDay();
  await coach.tap('Hawks, 9:00 AM, planned');
}

/* The game screen's Rules button reads "Rules, no rules", "Rules, 1 rule"
   and so on; a coach taps it whichever it says. */
async function openPlan(coach) {
  await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
}

/* In the Plan sheet: add a rule of this kind for these players. `minutes` is
   the stepper's value. 'Add rule' brings the sheet back, so rules chain. */
async function addRule(coach, kind, players, minutes) {
  await coach.tap('Add a rule');
  await coach.tap(kind);
  for (const p of players) await coach.tap(p);
  if (minutes !== undefined) await coach.stepTo('minutes', minutes);
  await coach.tap('Add rule');
}

describe('a coach sets rules for a game', { skip, concurrency: true }, () => {
  describe('on the plan', { concurrency: 1 }, () => {
    const own = chrome();

    test('a minimum of 20 and a cap of 8 hold, and the rules are kept', async () => {
      const { coach } = own;
      await openHawks(coach);
      const before = await coach.planMinutes();
      assert.equal(before['Marcus Williams'], 12);
      assert.equal(before['Devon Ellis'], 16);

      await openPlan(coach);
      await addRule(coach, 'Plays at least', ['Marcus Williams'], 20);
      await addRule(coach, 'Plays at most', ['Devon Ellis'], 8);
      await coach.tap('Close');

      const planned = await coach.planMinutes();
      assert.ok(planned['Marcus Williams'] >= 20, `Marcus plays ${planned['Marcus Williams']}`);
      assert.ok(planned['Devon Ellis'] <= 8, `Devon plays ${planned['Devon Ellis']}`);

      await coach.comeBackDaysLater(0);
      assert.ok(await coach.sees('Rules, 2 rules'), 'the rules were kept');
      const kept = await coach.planMinutes();
      assert.ok(kept['Marcus Williams'] >= 20 && kept['Devon Ellis'] <= 8);
    });

    test('rules that cannot all be met show why, and removing one clears it', async () => {
      const { coach } = own;
      await openHawks(coach);
      await openPlan(coach);
      await addRule(coach, 'Together', ['Marcus Williams', 'Devon Ellis']);
      await addRule(coach, 'Apart', ['Marcus Williams', 'Devon Ellis']);
      await coach.tap('Close');

      assert.equal(await coach.blockedPlan(),
        "This plan can't be built Marcus Williams and Devon Ellis are set both Together and Apart.");

      await openPlan(coach);
      await coach.tap('Marcus and Devon apart');
      await coach.tap('Remove rule');
      await coach.tap('Close');

      assert.equal(await coach.blockedPlan(), '');
      assert.ok((await coach.planMinutes())['Marcus Williams'] > 0);
    });
  });

  describe('in the game', { concurrency: 1 }, () => {
    const own = chrome();

    test('together, apart, a starting five and closers all hold through the game', async () => {
      const { coach } = own;
      const opening = ['Devon Ellis', 'Marcus Williams', 'Jordan Bell', 'Theo Alvarez', 'Nia Brooks'];
      const closers = ['Hana Kim', 'Eli Tran', 'Ana Reyes', 'Sam Okafor', 'Riley Novak'];
      await openHawks(coach);
      await openPlan(coach);
      await addRule(coach, 'Together', ['Marcus Williams', 'Devon Ellis']);
      /* Marcus's minimum pulls him a stint past Devon's even share, so
         only the forced Together keeps them paired in every stint: left
         to share as much as it can, the plan splits them once. */
      await addRule(coach, 'Plays at least', ['Marcus Williams'], 20);
      await addRule(coach, 'Apart', ['Hana Kim', 'Nia Brooks']);
      await coach.tap('Force Together pairs every stint');
      await addRule(coach, 'Starting five', opening);
      await coach.tap('Closers');
      for (const p of closers) await coach.tap(p);
      await coach.tap('Close');
      await coach.tap('Start game');

      const floors = await coach.floorEachStint();
      assert.equal(floors.length, 8);
      floors.forEach((floor, i) => {
        const on = n => floor.includes(n);
        assert.equal(on('Marcus Williams'), on('Devon Ellis'), `Marcus and Devon together in stint ${i + 1}`);
        assert.ok(!(on('Hana Kim') && on('Nia Brooks')), `Hana and Nia apart in stint ${i + 1}`);
      });
      assert.deepEqual([...floors[0]].sort(), [...opening].sort());
      assert.deepEqual([...floors.at(-1)].sort(), [...closers].sort());
    });
  });
});
