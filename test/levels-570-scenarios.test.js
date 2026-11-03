/* #570: one note on what levels do, Best players hidden in Settings until the
 * players' levels differ, and a pointer under Order's two options. Display
 * only; test/levels-570-fingerprint.test.js holds the plans still. Driven
 * through test/coach.js. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const NAMES = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
const LEVELS_NOTE = 'Levels mix strong and newer kids on the floor, decide who gets the few extra minutes if you choose that in Settings, help Order build its list, and pick the strongest five in overtime. They never give a kid a lot more minutes. They are never printed and never shown in bench mode.';
const SAME_LEVEL_NOTE = "When minutes can't split evenly, the spare sub goes to the kids behind on minutes. Set levels on the Team page to choose your best players instead.";
const TODAYS_NOTE = "When minutes can't split evenly, who gets the spare sub. Everyone still plays about the same.";
const POINTER = 'Set in Settings > Fine-tuning > Extra minutes go to.';

describe('levels, one note and no choice that does nothing', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function settingsOpen(opts) {
    await coach.onGameDayWithRoster(NAMES, opts);
    await coach.tap('Settings');
    await coach.tap('Fine-tuning');
  }

  test('the Level note on the player sheet says everything levels do, whatever the stance', async () => {
    for (const tieBreak of ['behind', 'levels']) {
      await coach.onGameDayWithRoster(NAMES, { tieBreak });
      await coach.tap('Team Smoke Test · 9 players ›');
      await coach.openPlayer('Avery');
      assert.ok((await coach.footnotes()).includes(LEVELS_NOTE), `${tieBreak}: ${JSON.stringify(await coach.footnotes())}`);
    }
  });

  test('Settings with every level equal and Kids behind on minutes: no Extra minutes choice, a line to the Team page', async () => {
    await settingsOpen({ tieBreak: 'behind' });
    assert.equal(await coach.sees('Best players'), false, JSON.stringify(await coach.controls()));
    assert.equal(await coach.sees('Kids behind on minutes'), false);
    assert.ok((await coach.footnotes()).includes(SAME_LEVEL_NOTE), JSON.stringify(await coach.footnotes()));
  });

  test('Settings with two levels apart: both buttons and the usual line', async () => {
    await settingsOpen({ tieBreak: 'behind', tiers: { p0: 5 } });
    assert.ok(await coach.sees('Best players'), JSON.stringify(await coach.controls()));
    assert.ok(await coach.sees('Kids behind on minutes'));
    assert.ok((await coach.footnotes()).includes(TODAYS_NOTE), JSON.stringify(await coach.footnotes()));
  });

  test('Settings with every level equal but Best players saved keeps both buttons, Best players pressed', async () => {
    await settingsOpen({ tieBreak: 'levels' });
    assert.ok(await coach.sees('Kids behind on minutes'), JSON.stringify(await coach.controls()));
    assert.equal(await coach.isPressed('Best players'), true);
    assert.ok((await coach.footnotes()).includes(TODAYS_NOTE), JSON.stringify(await coach.footnotes()));
  });

  test('Order says where its first choice is set, until the coach moves someone', async () => {
    await coach.onGameDayWithRoster(NAMES);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    assert.ok((await coach.footnotes()).includes(POINTER), JSON.stringify(await coach.footnotes()));

    await coach.tap('Move Avery down');
    assert.equal((await coach.footnotes()).includes(POINTER), false);
  });
});
