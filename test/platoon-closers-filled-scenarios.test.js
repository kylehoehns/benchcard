/* #569: picking Platoon or Closers fills the groups in for the coach, says so,
   and says "Group" where it used to say "Unit". Driven through test/coach.js.
   Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const NAMES = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Reid'];
const FIRST = NAMES.slice(0, 5), NEXT = NAMES.slice(5);

describe('Platoon and Closers start filled in', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* A game on Even, 4 periods of 8 subbing every 4, with `edits` laid over it. */
  async function onEven({ tiers, ...edits } = {}) {
    await coach.onGameDayWithRoster(NAMES, { tiers, periods: 4, periodMinutes: 8, granValue: 4, out: [], strategy: 'balanced', ...edits });
    return openPlan();
  }
  /* Opens the game and its Plan sheet; answers with the fives the game had on the way in. */
  async function openPlan() {
    await coach.tap('Hawks, 9:00 AM, planned');
    const fives = await coach.planFives();
    await coach.tap('Plan, even minutes');
    return fives;
  }
  const sorted = a => [...a].sort();

  test('1. Platoon with 10 here at one level: two groups in roster order, a plan, and a line saying so', async () => {
    await onEven();
    await coach.tap('Platoon');
    assert.deepEqual(await coach.picked(), [FIRST, NEXT]);
    assert.equal(await coach.blockedPlan(), '');
    assert.match(await coach.text('#stratbody'), /Built for you in roster order\. Change anyone and the groups are yours\./);
    assert.match(await coach.text('#stratbody'), /Group 1/);
    assert.match(await coach.text('#stratbody'), /Group 2/);
  });

  test('2. Platoon with 8 here: one group of the first five, the other three named as left out, and a plan', async () => {
    await onEven({ out: ['p8', 'p9'] });
    await coach.tap('Platoon');
    assert.deepEqual(await coach.picked(), [FIRST]);
    assert.equal(await coach.blockedPlan(), '');
    assert.ok(lacks(await coach.text('#stratbody'), /Group 2/));
    assert.match(await coach.text('#issues'), /Finley, Gray, Harper are not in any group and will not play\./);
  });

  test('3. Platoon with 10 here at different levels: the stronger players split between the groups', async () => {
    // levels strongest first are Avery..Indy and Reid, so the snake deals 1-2-2-1-1-2-2-1-1-2
    await onEven({ tiers: { p0: 5, p1: 5, p2: 4, p3: 4, p4: 3, p5: 3, p6: 2, p7: 2, p8: 1, p9: 1 } });
    await coach.tap('Platoon');
    const [one, two] = await coach.picked();
    assert.deepEqual(sorted(one), sorted(['Avery', 'Drew', 'Emery', 'Harper', 'Indy']));
    assert.deepEqual(sorted(two), sorted(['Blake', 'Casey', 'Finley', 'Gray', 'Reid']));
    assert.match(await coach.text('#stratbody'), /Built for you: your stronger players are split so each group has some\. Change anyone and the groups are yours\./);
  });

  test('4. Platoon on a game that already has groups leaves them, with no Built for you line', async () => {
    const mine = [['p9', 'p8', 'p7', 'p6', 'p5'], ['p4', 'p3', 'p2', 'p1', 'p0']];
    await coach.onGameDayWithRoster(NAMES, { out: [], strategy: 'balanced', rules: { units: mine } });
    await openPlan();
    await coach.tap('Platoon');
    assert.deepEqual((await coach.picked()).map(sorted), [sorted(NEXT), sorted(FIRST)]);
    assert.ok(lacks(await coach.text('#stratbody'), /Built for you/));
  });

  test('5. Closers at one level: the five on the floor last stint of the plan before, and the last period as the window', async () => {
    const before = await onEven();
    await coach.tap('Closers');
    const shown = (await coach.picked())[0].map(n => n.slice(0, 4).toUpperCase());
    assert.deepEqual(sorted(shown), sorted(before[before.length - 1]));
    assert.match(await coach.text('#stratbody'), /The closing group plays the last 8 min\./);
    assert.match(await coach.text('#stratbody'), /Built for you\. Change anyone and the group is yours\./);
    assert.equal(await coach.count('#stratbody .chips .chip'), 0, 'the window chips stay behind Change when');
    await coach.tap('Change when');
    assert.ok(await coach.count('#stratbody .chips .chip') > 0);
  });

  test('5b. Closers at different levels: the five highest levels', async () => {
    await onEven({ tiers: { p9: 5, p8: 5, p7: 4, p6: 4, p5: 4 } });
    await coach.tap('Closers');
    assert.deepEqual(sorted((await coach.picked())[0]), sorted(NEXT));
    assert.match(await coach.text('#stratbody'), /Built for you: your best players close\. Change anyone and the group is yours\./);
  });

  test('6. Closers with closers already picked leaves them and the window', async () => {
    await onEven({ rules: { closing: { stints: 1, players: ['p0', 'p1', 'p2', 'p3', 'p4'] } } });
    await coach.tap('Closers');
    assert.deepEqual((await coach.picked())[0], FIRST);
    assert.match(await coach.text('#stratbody'), /The closing group plays the last 4 min\./);
    assert.ok(lacks(await coach.text('#stratbody'), /Built for you/));
  });

  test('7. taking a kid out of a pre-filled group blocks the plan, with Fill a group, and the line goes', async () => {
    await onEven();
    await coach.tap('Platoon');
    await coach.tapPicked(0, 'Avery');
    assert.match(await coach.blockedPlan(), /Group 1 has 4 players; a group needs exactly 5\./);
    assert.ok(lacks(await coach.text('#stratbody'), /Built for you/));
    await coach.tap('Close');
    assert.ok((await coach.controls()).includes('Fill a group'));
    assert.ok(lacks(await coach.text('body'), /\bunits?\b/i));
  });
});
