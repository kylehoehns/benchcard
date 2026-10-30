/* Overtime from bench mode (#368, #369): each of the four who-plays choices
 * survives a reopen and is taken back exactly by Undo. Driven through
 * test/coach.js; RICH's game day (Hawks, 9:00 AM) as
 * bench-mode-scenarios.test.js has it. Split from overtime-scenarios.test.js
 * (#384) so no one file sets the floor for npm test. Skipped where there is
 * no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('each who-plays choice after a reopen and an Undo', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }

  async function toLastStint() {
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 40, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
  }

  /* #369: who plays an overtime. RICH's Hana Kim is Level 5 and Nia Brooks
     Level 1; the rest are 3. Nothing on screen says so. */
  const WHO = ['Next rotation', 'Even out', 'Keep this five', 'Strongest five'];

  for (const who of WHO) {
    test(`${who}: reopening the app lands on the same overtime five`, async () => {
      await startHawks();
      await toLastStint();
      await coach.addOvertime(8, who);
      await coach.tap('Next stint');
      const five = await coach.onFloor();
      await coach.tap('Leave');
      await coach.tap('Back to Smoke Test');
      await coach.comeBackDaysLater(0);
      await coach.tap('Hawks · OT 4:00 · Resume');

      assert.equal(await coach.stint(), '10 of 10');
      assert.deepEqual(await coach.onFloor(), five);
    });

    test(`${who}: Undo takes the overtime back exactly`, async () => {
      await startHawks();
      await coach.tapPlayer('Ana Reyes');
      await coach.tapPlayer('Devon Ellis');
      await toLastStint();
      const floors = await coach.floorEachStint();
      await coach.addOvertime(8, who);
      await coach.tap('Undo');

      assert.equal(await coach.stint(), '8 of 8');
      assert.deepEqual(await coach.floorEachStint(), floors);
      assert.ok(await coach.sees('Tied? Add overtime'));
    });
  }
});
