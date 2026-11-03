/* #567: changing "A game is" in Settings also changes the open day's games
 * that have not started. A started game and a game on another day keep what
 * they had. (A new day copying the last game's format is add-game.test.js.)
 * Driven through test/coach.js on RICH's game day (Hawks 9:00 AM and Ravens
 * 11:30 AM, both 4 x 8). Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';
const format = g => `${g.periods} x ${g.periodMinutes}`;

describe('a coach changes A game is', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function setFormat(periods, minutes) {
    await coach.tap('Settings');
    await coach.fill('Periods in a game', String(periods));
    await coach.fill('Minutes in a period', String(minutes));
    await coach.tap('Back to Smoke Test');
  }

  test("the day's games that have not started change; a started game and another day keep theirs", async () => {
    await coach.onGameDayShaped(team => {
      team.days[0].games[0].live = { at: 2, overrides: {} };
      team.days.push({
        name: 'Next Saturday', date: '2099-01-03',
        games: [{ id: 'gx', label: 'Comets', tipoff: '10:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 99 }],
      });
    });
    await setFormat(2, 16);

    const days = await coach.savedDays();
    const open = days.find(d => d.name === 'Saturday');
    assert.equal(format(open.games[0]), '4 x 8', 'the started Hawks game keeps its format');
    assert.equal(format(open.games[1]), '2 x 16', 'the Ravens game has not started, so it changes');
    const other = days.find(d => d.name === 'Next Saturday');
    assert.equal(format(other.games[0]), '4 x 8', "another day's game keeps its format");
  });

  test('the games that have not started change together, and the footnote says so', async () => {
    await coach.onGameDay();
    await coach.tap('Settings');
    assert.ok((await coach.footnotes()).includes("What a new game starts as. Changing A game is also changes this day's games that haven't started."),
      JSON.stringify(await coach.footnotes()));
    await coach.fill('Periods in a game', '2');
    await coach.fill('Minutes in a period', '16');
    await coach.tap('Back to Smoke Test');
    const [day] = await coach.savedDays();
    assert.deepEqual(day.games.map(format), ['2 x 16', '2 x 16']);
  });

  test('the changing-at-once footnote sits right under that row, in plain words, and nowhere else', async () => {
    await coach.onGameDay();
    await coach.tap('Settings');
    const notes = await coach.footnotes();
    const aims = notes.filter(n => n.startsWith('Aims for'));
    assert.deepEqual(aims, ['Aims for one to three kids changing at each break. Goes higher only when it would cost a kid minutes, and the plan says so.']);
    assert.equal(await coach.settingsRowBefore('#maxSubsRead'), 'Players changing at once');
  });

  test('Extra minutes go to is inside a closed Fine-tuning row until it is opened', async () => {
    await coach.onGameDay();
    await coach.tap('Settings');
    assert.equal(await coach.isExpanded('Fine-tuning'), false);
    assert.equal(await coach.sees('Kids behind on minutes'), false);
    assert.equal((await coach.footnotes()).some(n => n.startsWith("When minutes can't split evenly")), false);

    await coach.tap('Fine-tuning');
    assert.equal(await coach.isExpanded('Fine-tuning'), true);
    assert.ok(await coach.sees('Kids behind on minutes'), JSON.stringify(await coach.controls()));
    assert.ok(await coach.sees('Best players'));
    assert.equal(await coach.isPressed('Kids behind on minutes'), true);
    assert.ok((await coach.footnotes()).includes("When minutes can't split evenly, who gets the spare sub. Everyone still plays about the same."));

    await coach.tap('Best players');
    assert.equal(await coach.isPressed('Best players'), true);
    await coach.comeBackLaterOn('settings');
    await coach.tap('Fine-tuning');
    assert.equal(await coach.isPressed('Best players'), true);
  });
});
