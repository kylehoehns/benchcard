/* #572: the app's own statements match what it does. A coach reads the minute
 * range under the game sentence and on Today's pass, and is told when a card
 * they printed no longer matches the plan. RICH on game day: Hawks at 9:00 AM
 * and Ravens at 11:30 AM, 11 players, 4 x 8 quarters subbed every 4 minutes,
 * so a game gives seven players 16 minutes and four 12.
 *
 * Skipped where there is no Chrome, as print-card-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';
const SQUAD = ['Marcus Williams', 'Devon Ellis', 'Hana Kim', 'Eli Tran', 'Ana Reyes', 'Jordan Bell', 'Sam Okafor', 'Riley Novak', 'Casey Lindqvist', 'Theo Alvarez', 'Nia Brooks'];
const CUE = 'Changed since printed';

describe('a coach checks the app against the game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('the game screen shows the minute range under the sentence, and Today shows it on the pass', async () => {
    await coach.onGameDay();
    assert.match(await coach.text('#todayGames'), /11 players · even minutes · 12–16 min each/);
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.equal(await coach.text('#sentenceRange'), '12–16 min each');
    assert.equal(await coach.controls().then(c => c.some(n => n.includes('min each'))), false, 'the range is not a button');
  });

  /* Ravens evens out the day, is printed, then Hawks is played and a swap is made in it. */
  const evenOutRavens = async () => {
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Even out earlier games');
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
  };
  const swapInHawks = async ({ played = true } = {}) => {
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    if (played) await coach.tap('Next');
    const floor = await coach.onFloor();
    await coach.tapPlayer(floor[0]);
    await coach.tapPlayer(SQUAD.find(name => !floor.includes(name)));
    assert.notDeepEqual(await coach.onFloor(), floor, 'the swap happened');
    await coach.tap('Leave bench mode');
    await coach.tap('Back to Smoke Test');
  };

  test('a card printed, then an earlier game\'s swap that moves its plan: Today and the game screen say it changed, and printing again clears it', async () => {
    await coach.onGameDay();
    await evenOutRavens();
    await coach.tap('Print card for Ravens');
    assert.equal((await coach.printed()).length, 1);
    await coach.tap('Back to Smoke Test');
    assert.ok(!(await coach.text('#todayGames')).includes(CUE), 'no cue straight after printing');

    await swapInHawks();
    assert.ok((await coach.text('#todayGames')).includes(CUE), 'Today says the Ravens card changed');
    await coach.tap('Ravens, 11:30 AM, planned, changed since printed');
    assert.ok((await coach.text('#gameSub')).includes(CUE), 'the game screen says so');

    await coach.tap('Back to Smoke Test');
    await coach.tap('Print card for Ravens');
    await coach.tap('Back to Smoke Test');
    assert.ok(!(await coach.text('#todayGames')).includes(CUE), 'printing again clears it');
    await coach.tap('Ravens, 11:30 AM, planned');
    assert.ok(!(await coach.text('#gameSub')).includes(CUE));
  });

  test('a card printed, then a swap in game 1 before a stint is played: that game still hands on its plan, so no cue', async () => {
    await coach.onGameDay();
    await evenOutRavens();
    await coach.tap('Print card for Ravens');
    await coach.tap('Back to Smoke Test');
    await swapInHawks({ played: false });
    assert.ok(!(await coach.text('#todayGames')).includes(CUE), 'the swap was made before tip-off');
    await coach.tap('Ravens, 11:30 AM, planned');
    assert.ok(!(await coach.text('#gameSub')).includes(CUE));
  });

  test('a game never printed has no cue, even after an earlier game\'s swap moves its plan', async () => {
    await coach.onGameDay();
    await evenOutRavens();
    await swapInHawks();
    assert.ok(!(await coach.text('#todayGames')).includes(CUE));
  });

  test('the cue is still there after reopening', async () => {
    await coach.onGameDay();
    await evenOutRavens();
    await coach.tap('Print card for Ravens');
    await coach.tap('Back to Smoke Test');
    await swapInHawks();
    await coach.comeBackDaysLater(0, `document.querySelector('.today-game, #view-games:not([hidden])')`);
    assert.ok((await coach.text('#todayGames')).includes(CUE));
  });
});

describe('a coach shares the card image to print it', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); await coach.asHomeScreenApp(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const evenOutRavens = async () => {
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Even out earlier games');
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
  };
  const swapInHawks = async () => {
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next');
    const floor = await coach.onFloor();
    await coach.tapPlayer(floor[0]);
    await coach.tapPlayer(SQUAD.find(name => !floor.includes(name)));
    await coach.tap('Leave bench mode');
    await coach.tap('Back to Smoke Test');
  };

  test('a share that goes through counts as printed, so a later change shows the cue', async () => {
    await coach.onGameDay();
    await evenOutRavens();
    await coach.tap('Share to print card for Ravens');
    assert.equal((await coach.imageShares()).length, 1);
    await coach.tap('Back to Smoke Test');
    await swapInHawks();
    assert.ok((await coach.text('#todayGames')).includes(CUE));
  });

  test('a share the coach backs out of does not count as printed', async () => {
    await coach.onGameDay();
    await coach.shareCancelled();
    await evenOutRavens();
    await coach.tap('Share to print card for Ravens');
    await coach.tap('Back to Smoke Test');
    await swapInHawks();
    assert.ok(!(await coach.text('#todayGames')).includes(CUE), 'nothing was printed, so nothing changed since');
  });
});
