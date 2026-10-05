/* Game-day scenarios (the BDD pilot, second journey): a coach runs a game
 * from Today through bench mode to the season, driven in real Chrome
 * through `test/coach.js`. The day is RICH's: 11 players, 4 × 8 quarters
 * subbed every 4 minutes (8 stints, 160 player-minutes), Hawks at 9:00 and
 * Ravens at 11:30. Each test asserts only what a coach sees.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach runs a game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }

  test('starting a game puts five on the floor for the first of eight stints', async () => {
    await startHawks();

    assert.equal(await coach.stint(), '1 of 8');
    assert.equal(await coach.text('#gmGame'), 'Q1 · 8:00 to 4:00');
    assert.deepEqual(await coach.onFloor(), ['Ana Reyes', 'Casey Lindqvist', 'Hana Kim', 'Nia Brooks', 'Sam Okafor']);
  });

  test('a swap for this stint says what it did, and can be undone', async () => {
    await startHawks();
    await coach.tapPlayer('Ana Reyes');
    await coach.tapPlayer('Devon Ellis');

    assert.equal(await coach.toast(), 'Devon on for Ana this stint. Devon now ends at 16 min, Ana at 12.');
    assert.deepEqual(await coach.onFloor(), ['Devon Ellis', 'Casey Lindqvist', 'Hana Kim', 'Nia Brooks', 'Sam Okafor']);

    await coach.tap('Undo');
    assert.deepEqual(await coach.onFloor(), ['Ana Reyes', 'Casey Lindqvist', 'Hana Kim', 'Nia Brooks', 'Sam Okafor']);
  });

  test('a player sat for the rest stays off for every stint after', async () => {
    await startHawks();
    await coach.tapPlayer('Ana Reyes');
    await coach.tap('Sit for the rest');

    assert.equal(await coach.toast(), 'Ana sits for the rest. The others share those minutes.');
    for (let stint = 1; stint <= 8; stint++) {
      assert.equal(await coach.stint(), `${stint} of 8`);
      const floor = await coach.onFloor();
      assert.equal(floor.length, 5, `five on the floor in stint ${stint}`);
      assert.ok(floor.every(name => name !== 'Ana Reyes'), `Ana is off in stint ${stint}`);
      if (stint < 8) await coach.tap('Next stint');
    }
  });

  test('leaving bench mode mid-game keeps the game, even after closing the app', async () => {
    await startHawks();
    await coach.tap('Next stint');
    await coach.tap('Next stint');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');

    assert.ok(await coach.sees('Hawks, 9:00 AM, underway'));
    await coach.comeBackDaysLater(0);
    await coach.tap('Hawks · Q2 8:00 · Resume');
    assert.equal(await coach.stint(), '3 of 8');
  });

  test('finishing the game marks it finished on Today', async () => {
    await startHawks();
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    assert.equal(await coach.sees('Next stint'), false, 'the last stint offers Finish instead');
    await coach.tap('Finish game');

    assert.equal(await coach.toast(), 'Marked Hawks finished.');
    await coach.tap('Back to Smoke Test');
    assert.ok(await coach.sees('Hawks, 9:00 AM, finished'));
    assert.ok(await coach.sees('Ravens, 11:30 AM, planned'));
  });

  test('the next day, the finished game is filed to the season and the unstarted one left out', async () => {
    await startHawks();
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(1);

    assert.equal(await coach.toast(), 'Sat, Sep 12: 1 game filed to the season. Ravens was never started, so it was left out.');
    await coach.tap('Season 1 game filed ›');

    const minutes = await coach.seasonMinutes();
    assert.equal(Object.keys(minutes).length, 11, 'everyone who played is on the season');
    assert.equal(Object.values(minutes).reduce((a, b) => a + b, 0), 160, 'four quarters of 8 minutes, five on the floor');
    assert.deepEqual(minutes, {
      Hana: 12, Marcus: 12, Riley: 12, Sam: 12,
      Ana: 16, Casey: 16, Devon: 16, Eli: 16, Jordan: 16, Nia: 16, Theo: 16,
    });
  });
});
