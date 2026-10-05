/* Day scenarios (the BDD pilot, third journey): a coach shapes the day on
 * Today -- adds a game, changes one, removes one, evens out minutes across
 * two -- driven in real Chrome through `test/coach.js`. The day is RICH's:
 * Hawks at 9:00 AM and Ravens at 11:30 AM, 11 players, 4 x 8 quarters subbed
 * every 4 minutes. Each test asserts only what a coach sees or what is
 * still there after reopening the app.
 *
 * Skipped where there is no Chrome, as game-day-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach shapes the day', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('a game added with an opponent and tip-off lands in tip-off order, and stays after reopening', async () => {
    await coach.onGameDay();
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.setTime('Tip-off', '10:15 AM');
    await coach.tap('Next');
    await coach.tap('Next');
    await coach.tap('Add game');
    assert.equal(await coach.text('#gameTitle'), 'Owls');
    await coach.tap('Back to Smoke Test');

    const day = ['Hawks, 9:00 AM, planned', 'Owls, 10:15 AM, planned', 'Ravens, 11:30 AM, planned'];
    assert.deepEqual(await coach.todayGames(), day);
    await coach.comeBackDaysLater(0);
    assert.deepEqual(await coach.todayGames(), day);
  });

  test('changing a game\'s opponent and tip-off reorders Today, and stays after reopening', async () => {
    await coach.onGameDay();
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.setTime('Tip-off', '8:00 AM');
    await coach.fill('Opponent', 'Crows');
    await coach.tap('Back to Smoke Test');

    const day = ['Crows, 8:00 AM, planned', 'Hawks, 9:00 AM, planned'];
    assert.deepEqual(await coach.todayGames(), day);
    await coach.comeBackDaysLater(0);
    assert.deepEqual(await coach.todayGames(), day);
  });

  test('removing a game takes it off Today, and Undo brings it back', async () => {
    await coach.onGameDay();
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Remove this game');

    assert.equal(await coach.toast(), 'Removed Ravens. The day evened out.');
    assert.deepEqual(await coach.todayGames(), ['Hawks, 9:00 AM, planned']);

    await coach.tap('Undo');
    assert.equal(await coach.text('#gameTitle'), 'Ravens');
    await coach.tap('Back to Smoke Test');
    assert.deepEqual(await coach.todayGames(), ['Hawks, 9:00 AM, planned', 'Ravens, 11:30 AM, planned']);
  });

  test('a removed game stays gone after reopening', async () => {
    await coach.onGameDay();
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Remove this game');
    await coach.comeBackDaysLater(0);

    assert.deepEqual(await coach.todayGames(), ['Hawks, 9:00 AM, planned']);
  });

  test('evening out the day gives the players who sat more in the first game the most in the second', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    const hawks = await coach.gameMinutes();
    const fewest = Math.min(...Object.values(hawks)), most = Math.max(...Object.values(hawks));
    const owed = Object.keys(hawks).filter(n => hawks[n] === fewest);
    const full = Object.keys(hawks).filter(n => hawks[n] === most);
    assert.ok(owed.length > 0 && fewest < most, 'the Hawks game is uneven, so there is something to even out');
    await coach.tap('Back to Smoke Test');

    await coach.tap('Ravens, 11:30 AM, planned');
    assert.equal(await coach.sees('Evening out the day, Evens out the 9:00 AM game.'), false, 'off before the coach turns it on');
    await coach.tap('Plan, even minutes');
    await coach.tap('Even out earlier games');
    await coach.tap('Close');

    assert.ok(await coach.sees('Evening out the day, Evens out the 9:00 AM game.'));
    const ravens = await coach.gameMinutes();
    const least = Math.min(...owed.map(n => ravens[n]));
    const topFull = Math.max(...full.map(n => ravens[n]));
    assert.ok(least > topFull, `everyone who had ${fewest} in the Hawks game now has more than anyone who had ${most}: ${JSON.stringify(ravens)}`);
  });
});
