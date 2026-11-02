/* #414: the notes under the timeline (`#issues`) agree with the minutes the
 * timeline shows after a swap, Finish game, a player leaving or overtime.
 * RICH's game day (Hawks, 9:00 AM; 11 players, 4 x 8, 8 stints, 160
 * player-minutes), driven through test/coach.js and read on the Game screen.
 * Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

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
    assert.match(notes, /Eli Tran, Ana Reyes, Sam Okafor and Nia Brooks play 12, everyone else 16\./);
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
    assert.match(notes, /Eli Tran, Ana Reyes, Sam Okafor and Nia Brooks play 12, everyone else 16\./);
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

  test('a player who left and ties at the low end is named in roster order, not last', async () => {
    await startHawks();
    for (let i = 0; i < 4; i++) await coach.tap('Next stint');
    await coach.tap('Leave');
    await coach.tap("Who's here, 11 players");
    await coach.tap('Casey Lindqvist');
    await coach.tap('Close');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Resume')));
    await toLastStint();
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');

    const mins = await coach.planMinutes();
    assert.deepEqual(namesAt(mins, 12), ['Riley Novak', 'Casey Lindqvist', 'Theo Alvarez', 'Nia Brooks'], `the timeline shows ${JSON.stringify(mins)}`);
    const notes = await coach.text('#issues');
    assert.match(notes, /Riley Novak, Casey Lindqvist, Theo Alvarez and Nia Brooks play 12, everyone else 16\./, `the notes say: ${notes}`);
  });

  test('after overtime, the note names the players and minutes the timeline shows', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    await coach.tap('Leave');

    const mins = await coach.planMinutes();
    const at16 = Object.keys(mins).filter(n => mins[n] === 16);
    assert.equal(at16.length, 5, `the timeline shows ${JSON.stringify(mins)}`);
    assert.equal(Object.keys(mins).filter(n => mins[n] === 20).length, 6, `the timeline shows ${JSON.stringify(mins)}`);
    const notes = await coach.text('#issues');
    assert.match(notes, /Marcus Williams, Devon Ellis, Jordan Bell, Riley Novak and Nia Brooks play 16, everyone else 20\./, `the notes say: ${notes}`);
    assert.doesNotMatch(notes, /Shuffle|by\s+hand/);
  });

  /* The engine's other notes quote the solver's plan. Both fixtures are rules
     the solver cannot meet and says so, found by search on RICH's 11 players:
     CAP: Marcus (p0) is capped at 4 and gets 8; MIN: Marcus has a 28 minimum
     and gets 24. Each also carries "Spread is ... among the players without a
     minimum or cap". Which swaps move Marcus's minutes was found by trying each, so every test
     reads the timeline to say whether he moved. */
  const rules = c => ({ keepOnFloor: [], avoids: [], pairs: [], closing: { players: [] }, minMinutes: {}, maxMinutes: {}, ...c });
  const CAP = rules({ minMinutes: { p1: 28, p7: 24 }, maxMinutes: { p0: 4, p2: 4, p3: 12, p8: 8 }, keepOnFloor: [['p4', 'p0'], ['p0', 'p5']] });
  const MIN = rules({ minMinutes: { p0: 28, p1: 28, p2: 24, p6: 20, p7: 20, p8: 16, p10: 16 }, maxMinutes: { p9: 4 }, keepOnFloor: [['p7', 'p3'], ['p9', 'p7']] });
  const CAP_NOTE = /Marcus Williams is at 8 minutes against a 4-minute cap/;
  const MIN_NOTE = /Marcus Williams got 24 minutes against a 28-minute minimum/;

  async function swapThenRead(constraints, onFloor, onBench, strategy = 'balanced') {
    await coach.onGameDayWith({ constraints, strategy });
    await coach.tap('Hawks, 9:00 AM, planned');
    const before = await coach.text('#issues');
    const planned = await coach.planMinutes();
    await coach.tap('Start game');
    await coach.tapPlayer(onFloor);
    await coach.tapPlayer(onBench);
    await coach.tap('Leave');
    return { before, after: await coach.text('#issues'), planned, mins: await coach.planMinutes() };
  }

  test('a cap note stays for a player whose minutes did not move, and goes with the plan\'s "spread among the rest" line', async () => {
    const { before, after, planned, mins } = await swapThenRead(CAP, 'Ana Reyes', 'Casey Lindqvist');
    assert.match(before, CAP_NOTE);
    assert.equal(planned['Marcus Williams'], 8);
    assert.equal(mins['Marcus Williams'], 8, `the timeline shows ${JSON.stringify(mins)}`);
    assert.notDeepEqual(mins, planned, 'the swap moved nobody, so this proves nothing');
    assert.match(after, CAP_NOTE, `the notes say: ${after}`);
    assert.ok(lacks(after, /among the players without a minimum or cap/));
  });

  test('a cap note goes when the swap moves that player\'s minutes', async () => {
    const { before, after, planned, mins } = await swapThenRead(CAP, 'Devon Ellis', 'Marcus Williams');
    assert.match(before, CAP_NOTE);
    assert.equal(planned['Marcus Williams'], 8);
    assert.equal(mins['Marcus Williams'], 12, `the timeline shows ${JSON.stringify(mins)}`);
    assert.ok(lacks(after, /Marcus Williams is at 8 minutes/), `the notes say: ${after}`);
    assert.ok(lacks(after, /among the players without a minimum or cap/));
  });

  test('a minimum note stays for a player whose minutes did not move', async () => {
    const { before, after, planned, mins } = await swapThenRead(MIN, 'Hana Kim', 'Theo Alvarez');
    assert.match(before, MIN_NOTE);
    assert.equal(planned['Marcus Williams'], 24);
    assert.notDeepEqual(mins, planned, 'the swap moved nobody, so this proves nothing');
    assert.equal(mins['Marcus Williams'], 24, `the timeline shows ${JSON.stringify(mins)}`);
    assert.match(after, MIN_NOTE, `the notes say: ${after}`);
    assert.ok(lacks(after, /among the players without a minimum or cap/));
  });

  test('a minimum note goes when the swap moves that player\'s minutes', async () => {
    const { before, after, planned, mins } = await swapThenRead(MIN, 'Devon Ellis', 'Casey Lindqvist');
    assert.match(before, MIN_NOTE);
    assert.equal(planned['Marcus Williams'], 24);
    assert.equal(mins['Marcus Williams'], 28, `the timeline shows ${JSON.stringify(mins)}`);
    assert.ok(lacks(after, /Marcus Williams got 24 minutes/), `the notes say: ${after}`);
    assert.ok(lacks(after, /among the players without a minimum or cap/));
  });

  test('where the engine said nothing about the spread, a swap adds no spread note', async () => {
    const { before, after, planned, mins } = await swapThenRead(rules({ targetSlots: { p0: 6, p1: 2 } }), 'Ana Reyes', 'Hana Kim', 'minutes');
    assert.match(before, /Minutes are set by hand for/);
    // Since #489 a By hand re-plan holds the past and lands the rest on the hand-set
    // totals, so a swap no longer moves anyone's minutes. The point here is that no
    // spread note appears either way.
    assert.deepEqual(mins, planned, 'By hand lands on its hand-set minutes after the swap');
    assert.ok(lacks(before, /divide evenly|the fewest|everyone else|The most is/));
    assert.match(after, /Minutes are set by hand for/, `the notes say: ${after}`);
    assert.ok(lacks(after, /divide evenly|the fewest|everyone else|the other \d+ play|The most is| play(s)? \d/), `the notes say: ${after}`);
  });

  test('before the game starts, with nothing moved, the engine\'s own note is shown as it is', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');

    assert.equal(await coach.text('#issues'),
      'Best possible spread with 11 players and 4-minute stints is 4 minutes. Marcus Williams, Hana Kim, Sam Okafor and Riley Novak play 12: nobody is ahead or behind yet, so it rotates. Shuffle, or set their minutes by hand.');
  });
});
