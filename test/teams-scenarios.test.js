/* Multiple Teams scenarios (the BDD pilot): a coach adds a second Team,
 * switches between them, files a Game on one, and comes back to the one they
 * left -- driven in real Chrome through `test/coach.js`. Smoke Test is
 * RICH's team: 11 players, Hawks at 9:00 AM and Ravens at 11:30 AM on Sat,
 * Sep 12, the clock pinned to that day. JV Ravens is the second Team. Each
 * test asserts only what a coach sees, or what is kept across a reload.
 *
 * Skipped where there is no Chrome, as settings-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach with more than one Team', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('adding a second Team with 5 pasted Players switches to it, showing only those 5', async () => {
    await coach.onGameDay();
    await coach.tap('Smoke Test');
    assert.ok(await coach.sees('Smoke Test, 11 players'));
    await coach.tap('Add a team');
    await coach.fill('Team name', 'JV Ravens');

    await coach.fill('Your players, one per line', 'Ann\nBo\nCy\nDee');
    assert.equal(await coach.isDisabled('Next'), true);
    await coach.fill('Your players, one per line', 'Ann\nBo\nCy\nDee\nEd');
    assert.equal(await coach.isDisabled('Next'), false);
    await coach.tap('Next');
    await coach.tap('Go to the game');
    await coach.tap('Back to JV Ravens');

    assert.ok(await coach.sees('Team JV Ravens · 5 players ›'));
    await coach.tap('Team JV Ravens · 5 players ›');
    assert.deepEqual(await coach.rosterNames(), ['Ann', 'Bo', 'Cy', 'Dee', 'Ed']);
    await coach.tap('Back to JV Ravens');
    await coach.tap('JV Ravens');
    assert.ok(await coach.sees('Smoke Test, 11 players'));
    assert.ok(await coach.sees('JV Ravens, 5 players'));
  });

  test('switching back to the first Team shows its 11 Players and its own Day', async () => {
    await coach.onGameDayWithTwoTeams();
    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Remove this game');
    assert.deepEqual(await coach.todayGames(), ['Hawks, 9:00 AM, planned']);

    await coach.tap('JV Ravens');
    await coach.tap('Smoke Test, 11 players');
    assert.deepEqual(await coach.todayGames(), ['Hawks, 9:00 AM, planned', 'Ravens, 11:30 AM, planned']);
    await coach.tap('Team Smoke Test · 11 players ›');
    assert.equal((await coach.rosterNames()).length, 11);
    assert.ok((await coach.rosterNames()).includes('Ana Reyes'));
    await coach.tap('Back to Smoke Test');

    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    assert.deepEqual(await coach.todayGames(), ['Hawks, 9:00 AM, planned']);
    assert.ok(await coach.sees('Team JV Ravens · 10 players ›'));
  });

  test('a Game filed on one Team does not show in the other Team\'s Season', async () => {
    await coach.onGameDayWithTwoTeams();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(1);
    await coach.tap('Season 1 game filed ›');
    assert.equal(Object.keys(await coach.seasonMinutes()).length, 11);
    await coach.tap('Back to Smoke Test');

    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    assert.ok(await coach.sees('Season No games filed yet ›'));
    await coach.tap('Dismiss');
    await coach.tap('Season No games filed yet ›');
    assert.deepEqual(await coach.seasonMinutes(), {});
  });

  test('the Team a coach was on is the Team they come back to', async () => {
    await coach.onGameDayWithTwoTeams();
    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    assert.ok(await coach.sees('Team JV Ravens · 10 players ›'));

    await coach.comeBackLaterOn('today');
    assert.ok(await coach.sees('JV Ravens'));
    assert.ok(await coach.sees('Team JV Ravens · 10 players ›'));
    assert.equal(await coach.sees('Team Smoke Test · 11 players ›'), false);
  });
});
