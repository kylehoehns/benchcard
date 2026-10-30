/* Overtime from bench mode (#368, #369): overtime minutes count as played,
 * are filed into the season, even out a later game, and survive a reopen.
 * Driven through test/coach.js; RICH's game day (Hawks, 9:00 AM) as
 * bench-mode-scenarios.test.js has it. Split from overtime-scenarios.test.js
 * (#384) so no one file sets the floor for npm test. Skipped where there is
 * no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('overtime minutes after the game', { skip }, () => {
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

  /* Bench mode walked from the last stint back to the first: who is on the
     floor in each, first stint first. */
  async function floorsBackwards() {
    const floors = [];
    for (;;) {
      floors.unshift(await coach.onFloor());
      if (await coach.isDisabled('Previous stint')) return floors;
      await coach.tap('Previous stint');
    }
  }

  /* Bench mode's floor as it reads: `{ name: minutes played }` from rows such
     as "3, Ana Reyes, 12 of 16 minutes". */
  async function playedOnFloor() {
    const rows = (await coach.controls()).map(n => /^\d+, (.+?), ([\d.]+) of [\d.]+ minutes/.exec(n)).filter(Boolean);
    return Object.fromEntries(rows.map(m => [m[1], Number(m[2])]));
  }

  test('overtime minutes count as played, and reopening lands on the same overtime stint with the same five', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    const first = await playedOnFloor();
    const fiveFirst = await coach.onFloor();
    await coach.tap('Next stint');
    const second = await playedOnFloor();
    for (const name of fiveFirst.filter(n => n in second)) {
      assert.equal(second[name], first[name] + 4, `${name} played the first four overtime minutes`);
    }
    assert.ok(fiveFirst.some(n => n in second), 'someone stays on for both overtime stints');

    const five = await coach.onFloor();
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(0);
    await coach.tap('Hawks · OT 4:00 · Resume');

    assert.equal(await coach.stint(), '10 of 10');
    assert.equal(await coach.text('#gmGame'), 'OT · 4:00 to 0:00');
    assert.deepEqual(await coach.onFloor(), five);
  });

  test('the filed game carries the overtime minutes into the season', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(1);
    await coach.tap('Season 1 game filed ›');

    const minutes = await coach.seasonMinutes();
    assert.equal(Object.values(minutes).reduce((a, b) => a + b, 0), 200,
      'four quarters of 8 minutes and 8 of overtime, five on the floor');
    const mean = 200 / 11;
    const standing = await coach.seasonStanding();
    for (const [name, m] of Object.entries(minutes)) {
      assert.match(standing[name], m < mean ? /behind$/ : /ahead$/, `${name} played ${m} against a share of ${mean.toFixed(1)}`);
    }
  });

  test('a later game the same day is evened out against the overtime minutes', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');
    const hawks = await coach.planMinutes();
    const fewest = Math.min(...Object.values(hawks)), most = Math.max(...Object.values(hawks));
    const owed = Object.keys(hawks).filter(n => hawks[n] === fewest);
    const full = Object.keys(hawks).filter(n => hawks[n] === most);
    assert.ok(fewest < most, 'the Hawks game is uneven, so there is something to even out');
    assert.equal(Object.values(hawks).reduce((a, b) => a + b, 0), 200, 'the Plan counts the overtime');
    await coach.tap('Back to Smoke Test');

    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Even out earlier games');
    await coach.tap('Close');

    const ravens = await coach.planMinutes();
    const least = Math.min(...owed.map(n => ravens[n]));
    const topFull = Math.max(...full.map(n => ravens[n]));
    assert.ok(least > topFull, `everyone who had ${fewest} now has more than anyone who had ${most}: ${JSON.stringify(ravens)}`);
  });

  test('the length a team added last is offered next time, after a reopen, and 2 before any', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(3);
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(0);
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Start game');
    await toLastStint();
    await coach.tap('Tied? Add overtime');

    assert.equal(await coach.valueOf('Minutes'), '3');
  });

  test('By hand: overtime goes to those who played least, regulation and the saved targets stay as they were', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('By hand');
    const names = (await coach.controls()).filter(n => n.startsWith('Target minutes for ')).map(n => n.slice('Target minutes for '.length));
    const targets = async () => Object.fromEntries(await Promise.all(names.map(async n => [n, await coach.valueOf(`Target minutes for ${n}`)])));
    const saved = await targets();
    await coach.tap('Close');
    await coach.tap('Start game');

    const regulation = await coach.floorEachStint();
    const played = Object.fromEntries(names.map(n => [n, 4 * regulation.filter(f => f.includes(n)).length]));
    await coach.addOvertime(8);

    assert.equal(await coach.toast(), 'Overtime added, 8 min.', 'no rotation-moved notice');
    const fewest = Math.min(...Object.values(played));
    const lightest = names.filter(n => played[n] === fewest);
    const floor = await coach.onFloor();
    assert.ok(lightest.every(n => floor.includes(n)), `${lightest} played ${fewest} and should open overtime: ${floor}`);
    assert.deepEqual((await floorsBackwards()).slice(0, regulation.length), regulation);

    await coach.tap('Leave');
    await coach.tap('Plan, minutes set by hand');
    assert.deepEqual(await targets(), saved);
  });

  test('By hand: after overtime no row claims it plays something other than its target', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('By hand');
    await coach.tap('Close');
    await coach.tap('Start game');
    await coach.floorEachStint();
    await coach.addOvertime(8);
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(0);
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap('Plan, minutes set by hand');
    assert.equal(await coach.text('.srow .act:not([hidden])'), '', 'a row says it plays other than it was set to');
  });
});
