/* Five labels that went stale (#420): the Plan sheet's status line, the team
 * name after a rename, the player count after Finish game, By hand's "as
 * they are" line, and "today" on a game that is not today. Driven through
 * test/coach.js on RICH's game day (Hawks 9:00 AM, 11 players, the clock
 * pinned to Sat, Sep 12, 2026). Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { evalIn } from '../scripts/smoke/dom.mjs';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('labels that were stale (#420)', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }

  test('the Plan sheet status reads the summary line after a change made in bench mode', async () => {
    await startHawks();
    const before = await coach.text('#summary');
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 40, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
    await coach.addOvertime(2, 'Keep this five');
    await coach.tap('Leave');
    const summary = await coach.text('#summary');
    assert.notEqual(summary, before, 'the change did not move the summary, so this proves nothing');

    for (const [phrase, status] of [
      ["Who's here", '#sheetWhoStatus'], ['Format', '#sheetFormatStatus'],
      ['Sub interval', '#sheetIntervalStatus'], ['Plan', '#sheetPlanStatus']]) {
      const name = (await coach.controls()).find(n => n.startsWith(`${phrase}, `));
      await coach.tap(name);
      assert.equal(await coach.text(status), summary, `${status} is stale`);
      await coach.press('Escape');
    }
  });

  test('a new team name reaches every screen that shows it, and the field keeps what is typed', async () => {
    const name = 'Alexandria Montgomery-Okafor Hawks';
    await coach.onGameDay();
    await coach.tap('Settings');
    await coach.fill('Team name', name.slice(0, 12));
    await new Promise(r => setTimeout(r, 300)); // past the 140ms repaint debounce
    await coach.type(name.slice(12));

    assert.equal(await coach.valueOf('Team name'), name);
    assert.equal(await coach.focused(), 'Team name');
    assert.ok(await coach.sees(`Back to ${name}`), 'the back button still names the old team');

    await coach.tap(`Back to ${name}`);
    assert.equal(await coach.text('#teamBtnLabel'), name);
    assert.match(await coach.text('#todayTeam'), new RegExp(`^Team ${name} · 11 players`));
    const pill = (await coach.controls()).find(n => n.includes(name) && !n.startsWith('Team ') && !n.startsWith('Back'));
    await coach.tap(pill);
    assert.ok((await coach.controls()).includes(`${name}, 11 players`), 'the team switcher still shows the old name');
    await coach.press('Escape');
    await coach.tap(`Team ${name} · 11 players ›`);
    assert.equal(await coach.text('#teamTitle'), name);
  });

  test('a player marked out after playing still counts: 9 players on the game, its timeline, Today and Season', async () => {
    await coach.onGameDayWith({}, 9);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next stint');
    await coach.tap('Next stint');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap("Who's here, 9 players");
    await coach.tap('Ana Reyes');
    await coach.tap('Close');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Resume')));
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 40, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
    await coach.tap('Finish game');

    assert.equal(await coach.text('#phrasePlayers'), '9 players');
    assert.equal(Object.keys(await coach.planMinutes()).length, 9);
    await coach.tap('Back to Smoke Test');
    assert.match(await coach.text('.today-game .pass-summary'), /^9 players · /);
    await coach.comeBackDaysLater(1);
    await coach.tap('Season 1 game filed ›');
    assert.match(await coach.text('.sn-game .sn-gm'), /^9 played/);
  });

  test('a player marked out before the game starts still drops the count', async () => {
    await coach.onGameDayWith({ out: ['p9'] }, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.equal(await coach.text('#phrasePlayers'), '9 players');
    await coach.tap('Back to Smoke Test');
    assert.match(await coach.text('.today-game .pass-summary'), /^9 players · /);
  });

  test('the Same as card counts who the game it adds will have, after a player left the last game mid-game', async () => {
    await coach.onGameDayWith({}, 9);
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next stint');
    await coach.tap('Next stint');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Ravens, 11:30 AM, underway');
    await coach.tap("Who's here, 9 players");
    await coach.tap('Ana Reyes');
    await coach.tap('Close');
    assert.equal(await coach.text('#phrasePlayers'), '9 players', 'the game still counts the player who played');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    const card = (await coach.controls()).find(n => n.startsWith('Same as'));
    assert.match(card, /8 players, /);
    await coach.tap(card);
    assert.ok(await coach.sees("Who's here, 8 players"), 'the added game has the 8 players the card named');
  });

  test('By hand says the rules changed some rows only when a row plays a different number', async () => {
    const EXACT = 'Adds up exactly, so the plan uses these numbers as they are.';
    const CHANGED = 'Adds up exactly, but the rules changed some rows. Each one says what it plays.';
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('By hand');
    assert.equal(await coach.text('#budgetMsg'), EXACT);

    await coach.tap('Add a rule');
    await coach.tap('Plays at most');
    await coach.tap('Devon Ellis');
    await coach.stepTo('minutes', 8);
    await coach.tap('Add rule');

    assert.match(await coach.text('.srow:nth-of-type(2) .act'), /^plays 8$/, 'no row says what it plays');
    assert.equal(await coach.text('#budgetMsg'), CHANGED);
  });

  test('Across the day says "today" on a day dated today and "that day" on a day a week ahead', async () => {
    const note = () => coach.text('#planDay .pgrp-f');
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Rules, no rules');
    assert.equal(await note(), "This is the first game today, so there's nothing to even out.");
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Rules, no rules');
    assert.equal(await note(), 'Players who got fewer minutes earlier today get more here.');

    await coach.comeBackAt({ y: 2026, m: 9, d: 5, h: 12 });
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Rules, no rules');
    assert.equal(await note(), "This is the first game that day, so there's nothing to even out.");
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Rules, no rules');
    assert.equal(await note(), 'Players who got fewer minutes earlier that day get more here.');
  });
});
