/* Season scenarios (the BDD pilot, fourth journey): a coach reads the season
 * after games are filed, sees who is behind or ahead, evens out the next
 * plan against it, and exports it -- driven in real Chrome through
 * `test/coach.js`. The team is RICH's: 11 players, 4 x 8 quarters subbed
 * every 4 minutes (160 player-minutes), Hawks at 9:00 AM and Ravens at 11:30
 * AM on Sat, Sep 12. Each test asserts only what a coach sees or what is in
 * the file the export saved.
 *
 * Skipped where there is no Chrome, as game-day-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach reads the season', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* Play the Hawks to the end, then open the app the next day on the Season. */
  async function fileHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(1);
    await coach.tap('Season 1 game filed ›');
  }

  test('after one filed game, those who played 12 are 3 behind and those who played 16 are 1 ahead', async () => {
    await fileHawks();

    const behind = '1 game · 3 behind', ahead = '1 game · 1 ahead';
    assert.deepEqual(await coach.seasonStanding(), {
      Hana: behind, Marcus: behind, Riley: behind, Sam: behind,
      Ana: ahead, Casey: ahead, Devon: ahead, Eli: ahead, Jordan: ahead, Nia: ahead, Theo: ahead,
    });
  });

  test('evening out the season gives the players who are behind more minutes than those ahead', async () => {
    await coach.onGameDayMidSeason();
    await coach.tap('Season 3 games filed ›');
    const standing = await coach.seasonStanding();
    const callNames = Object.keys(standing);
    const behind = callNames.filter(n => /behind$/.test(standing[n]));
    const ahead = callNames.filter(n => /ahead$/.test(standing[n]));
    assert.ok(behind.length > 0 && ahead.length > 0, `the season has players behind and ahead: ${JSON.stringify(standing)}`);
    const furthest = callNames[0];
    assert.match(standing[furthest], /behind$/, 'the Season lists the furthest behind first');
    await coach.tap('Back to Smoke Test');

    await coach.tap('Hawks, 9:00 AM, planned');
    const minutes = async () => {
      const full = await coach.planMinutes();
      return Object.fromEntries(Object.entries(full).map(([name, m]) => [name.split(' ')[0], m]));
    };
    const least = (m, names) => Math.min(...names.map(n => m[n]));
    const most = (m, names) => Math.max(...names.map(n => m[n]));

    const before = await minutes();
    assert.ok(least(before, behind) <= most(before, ahead), `before the switch the players behind do not all play more: ${JSON.stringify(before)}`);

    await coach.tap('Plan, even minutes');
    await coach.tap('Even out the season so far');
    await coach.tap('Close');

    const after = await minutes();
    assert.ok(least(after, behind) > most(after, ahead), `every player behind now plays more than every player ahead: ${JSON.stringify(after)}`);
    assert.ok(after[furthest] > before[furthest], `${furthest}, furthest behind, plays more: ${before[furthest]} before, ${after[furthest]} after`);
  });

  test('exporting the season saves a spreadsheet with every player\'s minutes', async () => {
    await fileHawks();

    const file = await coach.download('Export');

    assert.equal(file.filename, 'benchcard-smoke-test-2026-09-13-season.csv');
    assert.equal(await coach.toast(), 'Spreadsheet saved.');
    const lines = file.text.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0], 'Player,Sep 12 vs Hawks,Total');
    const rows = Object.fromEntries(lines.slice(1).map(l => l.split(',')).map(([name, game, total]) => [name, { game, total }]));
    assert.equal(Object.keys(rows).length, 11, 'one row per player');
    for (const name of ['Hana Kim', 'Marcus Williams', 'Riley Novak', 'Sam Okafor']) {
      assert.deepEqual(rows[name], { game: '12', total: '12' }, name);
    }
    for (const name of ['Ana Reyes', 'Casey Lindqvist', 'Devon Ellis', 'Eli Tran', 'Jordan Bell', 'Nia Brooks', 'Theo Alvarez']) {
      assert.deepEqual(rows[name], { game: '16', total: '16' }, name);
    }
  });

  test('exporting a season of three games adds each player\'s games up, and shows who was not there', async () => {
    await coach.onGameDayMidSeason();
    await coach.tap('Season 3 games filed ›');

    const file = await coach.download('Export');

    const lines = file.text.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0], 'Player,Jul 11 vs Comets,Jul 18 vs Falcons,Aug 1 vs Wolves,Total');
    const row = name => lines.find(l => l.startsWith(`${name},`));
    assert.equal(row('Marcus Williams'), 'Marcus Williams,16,15,14,45');
    assert.equal(row('Hana Kim'), 'Hana Kim,18,19.5,20,57.5');
    assert.equal(row('Nia Brooks'), 'Nia Brooks,12.5,—,0,12.5', 'absent from the second game, there for the third on zero');
  });
});
