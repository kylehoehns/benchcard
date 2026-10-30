/* Opening a hand-off link on a phone that already has the game (#377): a link
 * that is behind the phone's own copy changes nothing; one that is ahead
 * imports, with Undo. RICH's Hawks game (11 players, 8 stints) stands in for
 * the 9-player game of the issue. One page plays both phones. Skipped where
 * there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a hand-off link opened on a phone that has the game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function shareFromCard() {
    await coach.tap('Card');
    await coach.tap('Share or hand off');
    await coach.tap('Hand off');
    await coach.tap('Share link');
    const link = await coach.sharedLink();
    await coach.tap('Close');
    return link;
  }

  async function resume() {
    await coach.tap((await coach.controls()).find(n => /Resume/.test(n)));
  }

  async function stepToStint(n) {
    for (let i = 0; !(await coach.stint()).startsWith(`${n} of`); i++) {
      assert.ok(i < 20, `never reached stint ${n}`);
      await coach.tap('Next stint');
    }
  }

  test('a link behind the phone changes nothing, and says so', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    const link = await shareFromCard();
    await coach.tap('Start game');
    await stepToStint(6);
    const [out] = await coach.onFloor();
    await coach.tapPlayer(out);
    const [bench] = await coach.onBench();
    await coach.tapPlayer(bench);
    const floor = await coach.onFloor();

    await coach.openLinkAgain(link);

    assert.equal(await coach.toast(), 'You already have this game, further along.');
    await resume();
    assert.equal(await coach.stint(), '6 of 8');
    assert.deepEqual(await coach.onFloor(), floor);
  });

  test('a link ahead of the phone imports, and Undo puts the phone back', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await stepToStint(2);
    await coach.tap('Leave');
    const early = await shareFromCard();
    await resume();
    await stepToStint(4);
    await coach.tap('Leave');
    const later = await shareFromCard();
    await coach.openLink(early);
    assert.equal(await coach.toast(), 'Smoke Test game added. Open bench mode to run subs.');

    await coach.openLinkAgain(later);

    assert.equal(await coach.toast(), 'Smoke Test game added. Open bench mode to run subs.');
    assert.ok(await coach.sees('Undo'), 'no Undo offered');
    await resume();
    assert.equal(await coach.stint(), '4 of 8');
    await coach.tap('Leave');
    await coach.tap('Undo');
    await resume();
    assert.equal(await coach.stint(), '2 of 8');
  });
});
