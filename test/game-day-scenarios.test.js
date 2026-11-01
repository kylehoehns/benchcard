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

    assert.equal(await coach.toast(), 'Devon on for Ana this stint. The rest of the game was re-planned to keep minutes even.');
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

  test('sitting one player for the rest changes one seat on the floor, not five', async () => {
    // nine players: RICH's eleven with the last two out
    await coach.onGameDayWith({ out: ['p9', 'p10'] });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next stint');
    await coach.tap('Next stint');
    assert.equal(await coach.stint(), '3 of 8');
    const before = await coach.onFloor();
    const sat = before[1];

    await coach.tapPlayer(sat);
    await coach.tap('Sit for the rest');

    assert.equal(await coach.stint(), '3 of 8');
    const after = await coach.onFloor();
    assert.ok(!after.includes(sat), `${sat} is off the floor`);
    assert.equal(after.filter(n => before.includes(n)).length, 4, `stint 3 keeps four of ${before}, got ${after}`);
  });

  /* #383: ten players, Theo (p9) marked out, Hawks, bench mode at stint 3. */
  async function startHawksOfTenAtStint3(edits = {}) {
    await coach.onGameDayWith({ out: ['p9'], late: ['p9'], ...edits }, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next stint');
    await coach.tap('Next stint');
    assert.equal(await coach.stint(), '3 of 8');
  }

  async function floorsFromHere() {
    const floors = await coach.floorEachStint();
    while ((await coach.stint()) !== '3 of 8') await coach.tap('Previous stint');
    return floors;
  }

  test('a late arrival is marked Here now from bench mode and plays from the next stint', async () => {
    await startHawksOfTenAtStint3();
    assert.deepEqual(await coach.runningLate(), ['Theo Alvarez']);
    const size = await coach.sizeOf('Here now, Theo Alvarez');
    assert.ok(size.height >= 48 && size.width >= 48, `Here now is ${size.width} x ${size.height}`);
    const stint3 = await coach.onFloor();

    await coach.tap('Here now, Theo Alvarez');

    assert.equal(await coach.toast(), 'Theo is here.');
    assert.equal(await coach.stint(), '3 of 8');
    assert.deepEqual(await coach.onFloor(), stint3, "stint 3's floor did not change");
    assert.deepEqual(await coach.runningLate(), []);
    const later = (await floorsFromHere()).slice(1);
    assert.ok(later.some(f => f.includes('Theo Alvarez')), `Theo plays from stint 4 on: ${JSON.stringify(later)}`);
  });

  test('Undo on the Here now toast puts the player back under Running late and the rotation as it was', async () => {
    await startHawksOfTenAtStint3();
    const before = await floorsFromHere();

    await coach.tap('Here now, Theo Alvarez');
    await coach.tap('Undo');

    assert.deepEqual(await coach.runningLate(), ['Theo Alvarez']);
    assert.equal(await coach.stint(), '3 of 8');
    assert.deepEqual(await floorsFromHere(), before);
  });

  test('Here now in bench mode plans the same rotation as marking the player here on Who\'s here', async () => {
    await startHawksOfTenAtStint3();
    await coach.tap('Here now, Theo Alvarez');
    const viaBench = await floorsFromHere();

    await startHawksOfTenAtStint3();
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap("Who's here, 9 players");
    await coach.tap('Theo Alvarez');
    await coach.tap('Close');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Resume')));
    assert.equal(await coach.stint(), '3 of 8');

    assert.deepEqual(await floorsFromHere(), viaBench);
  });

  test('Here now says the rotation changed when the freeze could not hold the stints already played', async () => {
    await startHawksOfTenAtStint3({ strategy: 'minutes' });
    const before = await floorsFromHere();

    await coach.tap('Here now, Theo Alvarez');

    const after = await floorsFromHere();
    const moved = before.slice(0, 3).some((f, k) => f.join() !== after[k].join());
    assert.ok(moved, `a By hand game re-solves stints already played: ${JSON.stringify(before.slice(0, 3))}`);
    assert.equal(await coach.toast(), 'Theo is here. Rotation changed.');
  });

  test('Here now leaves focus on the first floor row after the last one, and Undo on that player\'s button', async () => {
    await startHawksOfTenAtStint3();
    const first = (await coach.onFloor())[0];

    await coach.tap('Here now, Theo Alvarez');
    const focused = await coach.focused();
    assert.ok(focused.includes(first), `focus is on ${first}, got ${focused}`);

    await coach.tap('Undo');
    assert.equal(await coach.focused(), 'Here now, Theo Alvarez');
  });

  test('with nobody out, bench mode has no Running late group', async () => {
    await coach.onGameDayWith({ out: [] }, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');

    assert.deepEqual(await coach.runningLate(), []);
    assert.ok(!(await coach.controls()).some(n => n.startsWith('Here now')), 'no Here now button is reachable');
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

  test('a finished game cannot be shuffled, an underway one can', async () => {
    await startHawks();
    await coach.tap('Next stint');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap('Card');
    assert.equal(await coach.isDisabled('Shuffle'), false, 'Shuffle works while the game is underway');
    await coach.tap('Resume · Q1 4:00');
    for (let i = 0; i < 6; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');
    await coach.tap('Card');

    assert.equal(await coach.isDisabled('Shuffle'), true, 'the minutes are played, so there is nothing to shuffle');
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
