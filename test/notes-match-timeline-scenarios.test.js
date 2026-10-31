/* #414: the notes under the timeline (`#issues`) agree with the minutes the
 * timeline shows after a swap, Finish game, a player leaving or overtime.
 * RICH's game day (Hawks, 9:00 AM; 11 players, 4 x 8, 8 stints, 160
 * player-minutes), driven through test/coach.js and read on the Game screen.
 * Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('the notes under the timeline', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }

  async function swapAnaForDevon() {
    await coach.tapPlayer('Ana Reyes');
    await coach.tapPlayer('Devon Ellis');
  }

  async function toLastStint() {
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 40, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
  }

  const namesAt = (mins, v) => Object.keys(mins).filter(n => mins[n] === v);

  test('after a swap, the spread note names the four the timeline shows at 12', async () => {
    await startHawks();
    await swapAnaForDevon();
    await coach.tap('Leave');

    const mins = await coach.planMinutes();
    const low = namesAt(mins, 12);
    assert.equal(low.length, 4, `the timeline shows ${JSON.stringify(mins)}`);
    assert.equal(namesAt(mins, 16).length, 7);
    const notes = await coach.text('#issues');
    const named = Object.keys(mins).filter(n => notes.includes(n));
    assert.deepEqual(named.sort(), [...low].sort(), `the notes say: ${notes}`);
    assert.match(notes, /Eli Tran, Ana Reyes, Theo Alvarez and Nia Brooks play 12, everyone else 16\./);
  });

  test('finishing the game keeps the note on the timeline\'s four and offers nothing to do', async () => {
    await startHawks();
    await swapAnaForDevon();
    await toLastStint();
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');

    const mins = await coach.planMinutes();
    const low = namesAt(mins, 12);
    assert.equal(low.length, 4, `the timeline shows ${JSON.stringify(mins)}`);
    const notes = await coach.text('#issues');
    assert.deepEqual(Object.keys(mins).filter(n => notes.includes(n)).sort(), [...low].sort(), `the notes say: ${notes}`);
    assert.match(notes, /Eli Tran, Ana Reyes, Theo Alvarez and Nia Brooks play 12, everyone else 16\./);
    assert.doesNotMatch(notes, /Shuffle|by\s+hand/);
  });

  test('a player who leaves mid-game is named with the minutes the timeline shows, not an even split', async () => {
    await startHawks();
    await coach.tap('Next stint');
    await coach.tap('Next stint');
    await coach.tap('Leave');
    await coach.tap("Who's here, 11 players");
    await coach.tap('Ana Reyes');
    await coach.tap('Close');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Resume')));
    await toLastStint();
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');

    const mins = await coach.planMinutes();
    const others = Object.entries(mins).filter(([n]) => n !== 'Ana Reyes').map(([, m]) => m);
    assert.ok(mins['Ana Reyes'] < Math.min(...others), `the timeline shows ${JSON.stringify(mins)}`);
    const notes = await coach.text('#issues');
    assert.doesNotMatch(notes, /every\s+player\s+gets/);
    assert.match(notes, new RegExp(`Ana Reyes plays ${mins['Ana Reyes']}[,.]`), `the notes say: ${notes}`);
  });

  test('after overtime, the note names the players and minutes the timeline shows', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    await coach.tap('Leave');

    const mins = await coach.planMinutes();
    const values = [...new Set(Object.values(mins))].sort((a, b) => a - b);
    const lo = values[0], hi = values[values.length - 1];
    const low = Object.keys(mins).filter(n => mins[n] === lo);
    const notes = await coach.text('#issues');
    if (values.length === 1) {
      assert.match(notes, new RegExp(`every player gets ${hi}\\.`), `the notes say: ${notes}`);
    } else {
      assert.deepEqual(Object.keys(mins).filter(n => notes.includes(n)).sort(), low.length <= 6 ? [...low].sort() : [],
        `the timeline shows ${JSON.stringify(mins)}; the notes say: ${notes}`);
      assert.match(notes, new RegExp(`${lo}[,.]`), `the notes say: ${notes}`);
      assert.match(notes, new RegExp(values.length === 2 ? `everyone else ${hi}\\.|the other \\d+ play ${hi}\\.` : `The most is ${hi}\\.`));
    }
    assert.doesNotMatch(notes, /Shuffle|by\s+hand/);
  });

  test('before the game starts, with nothing moved, the engine\'s own note is shown as it is', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');

    assert.equal(await coach.text('#issues'),
      'Best possible spread with 11 players and 4-minute stints is 4 minutes. Marcus Williams, Hana Kim, Sam Okafor and Riley Novak play 12: nobody is ahead or behind yet, so it rotates. Shuffle, or set their minutes by hand.');
  });
});
