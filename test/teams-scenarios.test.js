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

  test('switching to a Team whose day has passed files that day once, with the Filing toast', async () => {
    await coach.onGameDayWithTwoTeams();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    await coach.comeBackDaysLater(2);
    await coach.tap('JV Ravens');
    await coach.tap('Smoke Test, 11 players');

    assert.match(await coach.toast(), /^Sat, Sep 12: 1 game filed/);
    assert.ok(await coach.sees('Season 1 game filed ›'));
    assert.equal((await coach.todayGames()).includes('Hawks, 9:00 AM, finished'), false, 'Saturday is no longer today');

    await coach.tap('Dismiss');
    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    await coach.tap('JV Ravens');
    await coach.tap('Smoke Test, 11 players');
    assert.equal(await coach.toast(), '', 'the second switch files nothing');
    assert.ok(await coach.sees('Season 1 game filed ›'));
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

  /* An Add a game draft the coach force-closed on Smoke Test (Escape, then
     Escape on the ask), with JV Ravens' last game set to 2 x 20. */
  async function draftLeftOnSmokeTest() {
    await coach.onGameDayWithTwoTeams();
    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Format, 4 × 8');
    await coach.stepTo('periods', 2);
    await coach.stepTo('minutes', 20);
    await coach.tap('Close');
    await coach.tap('Back to JV Ravens');
    await coach.tap('JV Ravens');
    await coach.tap('Smoke Test, 11 players');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Falcons');
    await coach.press('Escape');
    await coach.press('Escape');
  }

  test('an unfinished Add a game draft from one Team does not open in the other', async () => {
    await draftLeftOnSmokeTest();
    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    await coach.tap('Add a game');
    assert.equal(await coach.valueOf('Opponent'), '');
  });

  test('the Same as card on the other Team adds the format it shows', async () => {
    await draftLeftOnSmokeTest();
    await coach.tap('Smoke Test');
    await coach.tap('JV Ravens, 10 players');
    await coach.tap('Add a game');
    assert.ok((await coach.controls()).some(n => /^Same as 11:30 AM\?.*2 × 20/.test(n)), 'the card says 2 × 20');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    assert.ok(await coach.sees('Format, 2 × 20'));
  });

  test('a force-closed draft is still there when the same Team opens Add a game again', async () => {
    await draftLeftOnSmokeTest();
    await coach.tap('Add a game');
    assert.equal(await coach.valueOf('Opponent'), 'Falcons');
  });
});
