/* #563: the Plan sheet's one "Make up minutes from" row replaces the two
 * even-out switches. Driven through test/coach.js on a day with long names,
 * with and without a season filed. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome, midSeason } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const ROSTER = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Alexandria Montgomery-Okafor'];
const GAME = 'This game only', DAY = 'Earlier today', SEASON = 'The season so far';
const FOOTNOTE = 'Kids who played less get a little more here, and kids who played more get a little less. Never more than a sub or two either way.';

describe('Make up minutes from', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* The day is the Hawks (game 1) and Ravens (game 2). Game 2 is on `strategy`
     with the flags a saved game carries; `filed` leaves RICH's three filed games
     in the season. */
  async function planOf(game, { strategy = 'balanced', flags = [true, true], filed = true } = {}) {
    await coach.onGameDayShaped(team => {
      if (filed) team.season = structuredClone(midSeason().teams[0].season);
      team.players = ROSTER.map((name, i) => ({ id: `p${i}`, name, number: '', tier: 1 + (i % 5) }));
      const [day] = team.days;
      day.games = day.games.map((g, i) => ({
        ...g, out: [], periods: 2, periodMinutes: 16, granMode: 'everyN', granValue: 4,
        constraints: { ...g.constraints, units: [ROSTER.slice(0, 5).map((_, k) => `p${k}`), ROSTER.slice(5).map((_, k) => `p${k + 5}`)] },
        ...(i === game ? { strategy, useCarryover: flags[0], useSeasonTargets: flags[1] } : {}),
      }));
    });
    await coach.tap(game === 0 ? 'Hawks, 9:00 AM, planned' : 'Ravens, 11:30 AM, planned');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
  }
  const labels = async () => (await coach.makeUpRow())?.rows.map(r => r.label) ?? null;
  const checked = async () => (await coach.makeUpRow())?.rows.filter(r => r.on).map(r => r.label);

  test('1. Even, game 2 of a day, a filed season: three rows, one checked, and the footnote', async () => {
    await planOf(1);
    const row = await coach.makeUpRow();
    assert.equal(row.heading, 'Make up minutes from');
    assert.deepEqual(row.rows.map(r => r.label), [GAME, DAY, SEASON]);
    assert.deepEqual(await checked(), [SEASON]);
    assert.equal(row.footnote, FOOTNOTE);
    assert.equal(await coach.sees('Even out earlier games'), false);
    assert.equal(await coach.sees('Even out the season so far'), false);
  });

  test('2. Closers offers the same three', async () => {
    await planOf(1, { strategy: 'closers', flags: [true, false] });
    assert.deepEqual(await labels(), [GAME, DAY, SEASON]);
    assert.deepEqual(await checked(), [DAY]);
  });

  test('3. game 1 with a filed season offers this game only and the season so far; a saved Earlier today shows This game only', async () => {
    await planOf(0, { flags: [true, true] });
    assert.deepEqual(await labels(), [GAME, SEASON]);
    assert.deepEqual(await checked(), [SEASON]);
    await planOf(0, { flags: [true, false] });
    assert.deepEqual(await checked(), [GAME]);
  });

  test('4. game 2 with nothing filed offers this game only and Earlier today; a saved season shows Earlier today', async () => {
    await planOf(1, { filed: false, flags: [true, true] });
    assert.deepEqual(await labels(), [GAME, DAY]);
    assert.deepEqual(await checked(), [DAY]);
    const [saved] = [(await coach.savedDays())[0].games[1]];
    assert.deepEqual([saved.useCarryover, saved.useSeasonTargets], [true, true], 'showing wrote nothing');
  });

  test('5. game 1 with nothing filed has no row', async () => {
    await planOf(0, { filed: false });
    assert.equal(await coach.makeUpRow(), null);
  });

  for (const strategy of ['minutes', 'platoon', 'order']) {
    test(`6. on ${strategy}, game 2 with a filed season has no row`, async () => {
      await planOf(1, { strategy });
      assert.equal(await coach.makeUpRow(), null);
    });
  }

  test('7. a day that is not today says Earlier that day', async () => {
    await planOf(1);
    assert.deepEqual(await labels(), [GAME, DAY, SEASON]);
    await coach.tap('Close');
    await coach.comeBackAt({ y: 2026, m: 9, d: 5, h: 12 });
    await coach.tap('Back to Smoke Test');
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
    assert.deepEqual(await labels(), [GAME, 'Earlier that day', SEASON]);
  });

  test('8. tapping a row checks it, saves it, survives a reopen, and the plan follows', async () => {
    await planOf(1, { flags: [true, false] });
    assert.equal(await coach.text('#seasonadj'), '', 'no season panel on Earlier today');
    await coach.tap(SEASON);
    assert.deepEqual(await checked(), [SEASON]);
    assert.notEqual(await coach.text('#seasonadj'), '', 'the season panel shows for the season so far');
    let g = (await coach.savedDays())[0].games[1];
    assert.deepEqual([g.useCarryover, g.useSeasonTargets], [true, true]);

    await coach.tap(GAME);
    assert.equal(await coach.text('#seasonadj'), '');
    g = (await coach.savedDays())[0].games[1];
    assert.deepEqual([g.useCarryover, g.useSeasonTargets], [false, false]);
    await coach.tap(DAY);
    g = (await coach.savedDays())[0].games[1];
    assert.deepEqual([g.useCarryover, g.useSeasonTargets], [true, false]);

    await coach.tap('Close');
    await coach.comeBackLaterOn('games');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
    assert.deepEqual(await checked(), [DAY]);
  });

  test('9. Even to By hand and back keeps the choice', async () => {
    await planOf(1, { flags: [true, false] });
    await coach.tap('By hand');
    assert.equal(await coach.makeUpRow(), null);
    await coach.tap('Even');
    assert.deepEqual(await checked(), [DAY]);
  });
  /* A game added to the day (Add a game, then the Same as card), open on its Plan. */
  async function addSameAs({ date } = {}) {
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    if (date) await coach.setDate('Date', date);
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
  }

  test('10. after picking the season so far, a new game opens on it', async () => {
    await planOf(1, { flags: [true, false] });
    await coach.tap(SEASON);
    await addSameAs();
    assert.deepEqual(await checked(), [SEASON]);
    await coach.tap('Close');
    await coach.comeBackLaterOn('games');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.setDate('Date', '2026-09-19');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
    assert.deepEqual(await checked(), [SEASON], 'a new day too, and the choice was kept after a reopen');
  });

  for (const pick of [GAME, DAY]) {
    test(`11. after picking ${pick}, a day's second game opens on Earlier today and a new day's first on This game only`, async () => {
      await planOf(1, { flags: [true, true] });
      await coach.tap(pick);
      await addSameAs();
      assert.deepEqual(await checked(), [DAY]);
      await coach.tap('Close');
      await coach.tap('Back to Smoke Test');
      await coach.tap('Add a game');
      await coach.setDate('Date', '2026-09-19');
      await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
      await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
      assert.deepEqual(await checked(), [GAME]);
    });
  }

  test('11b. tapping the row that is already checked changes nothing, not even what a new game starts on', async () => {
    await planOf(1, { flags: [true, true] });
    assert.deepEqual(await checked(), [SEASON]);
    await coach.tap(SEASON);
    assert.deepEqual(await checked(), [SEASON]);
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.setDate('Date', '2026-09-19');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
    assert.deepEqual(await checked(), [GAME], 'the team never picked the season, so a new day still starts on This game only');
  });

  test('12. a new day with nothing filed has no row on its first game', async () => {
    await planOf(1, { filed: false, flags: [true, false] });
    await coach.tap(DAY);
    await addSameAs({ date: '2026-09-19' });
    assert.equal(await coach.makeUpRow(), null);
  });

  test('13. Settings no longer asks how a new game starts, and still explains A game is', async () => {
    await planOf(1);
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Settings');
    assert.equal(/A new game starts/.test(await coach.text('#view-settings')), false);
    assert.equal(await coach.sees('Evening out the season'), false);
    assert.ok((await coach.footnotes()).includes("What a new game starts as. Changing A game is also changes this day's games that haven't started."));
  });

  test('14. Add a game has no strategy cards and no switch on its last step', async () => {
    await planOf(1);
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.tap('Next');
    assert.equal((await coach.addGameStep()).step, '2 of 2');
    const cards = (await coach.controls()).filter(n => /^(Even|By hand|Closers|Platoon|Order) /.test(n));
    assert.equal(cards.length, 0, JSON.stringify(await coach.controls()));
    assert.equal(await coach.sees('Even out earlier games'), false);
    assert.equal(await coach.count('#agBody input[switch]'), 0);
  });
});
