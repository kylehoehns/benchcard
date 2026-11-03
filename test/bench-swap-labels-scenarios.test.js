/* #573: the bench's swap choices read For now, Takes their minutes and Sits
 * the rest of the game; the next button says Next; the first floor row's
 * minutes say min; and a picked floor kid leaves room for the bench. Driven
 * through test/coach.js on RICH's game day (Hawks, 9:00 AM) at 390 x 844,
 * the driver's phone. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('the bench swap choices', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }

  test('picking a floor kid offers For now, Takes their minutes and Sits the rest of the game, and none of the old names', async () => {
    await startHawks();
    await coach.tapPlayer('Ana Reyes');

    const names = await coach.controls();
    for (const name of ['For now', 'Takes their minutes', 'Sits the rest of the game']) {
      assert.ok(names.includes(name), `${name} is not on screen: ${JSON.stringify(names)}`);
    }
    for (const old of ['This stint', 'Rest of game', 'Sit for the rest']) {
      assert.equal(names.includes(old), false, `${old} is still on screen`);
    }
    assert.equal(await coach.isPressed('For now'), true, 'For now is the default');
    assert.equal(await coach.isPressed('Takes their minutes'), false);
  });

  test('a swap for now says "for now" in its toast', async () => {
    await startHawks();
    await coach.tapPlayer('Ana Reyes');
    await coach.tapPlayer('Devon Ellis');

    assert.match(await coach.toast(), /^Devon on for Ana for now\./);
  });

  test('the orange button says Next beside its arrow, and is still 48px', async () => {
    await startHawks();

    assert.ok((await coach.controls()).includes('Next'), 'no control named Next');
    assert.equal((await coach.controls()).includes('Next stint'), false);
    assert.equal(await coach.text('#gmNext2'), 'Next');
    const { width, height } = await coach.sizeOf('Next');
    assert.ok(width >= 48 && height >= 48, `Next is ${width} x ${height}`);
  });

  test('the first floor row reads "0 / 16 min" and the others stay "0 / 16"', async () => {
    await startHawks();
    const [first, second] = await coach.floorMinutes();

    assert.match(first, /^0 \/ \d+ min$/);
    assert.match(second, /^0 \/ \d+$/);
  });

  test('with a floor kid picked and five on the bench, four bench rows are whole on screen at 390 x 844', async () => {
    const roster = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Jules'];
    await coach.onGameDayWithRoster(roster);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    const [first] = await coach.onFloor();
    await coach.tapPlayer(first);

    assert.equal((await coach.onBench()).length, 5);
    const whole = await coach.benchRowsInView();
    assert.ok(whole >= 4, `${whole} bench rows are whole on screen`);
  });
});
