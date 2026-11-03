/* #547: Rotation order builds the list for the coach, driven through
 * test/coach.js. The nine are #545's: 2 periods of 16 minutes, a sub every 4
 * minutes (8 stints), four changing at once, so list spots 2 to 5 play 20
 * minutes and the other five play 16. Expected lists are worked out by hand
 * from the issue's rules: the kids the odd minutes setting favors take the 20
 * spots, a tie keeps the roster order. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const ROSTER = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
/* Casey, Drew, Gray and Harper are a level above the rest: not the first four. */
const TIERS = { p2: 4, p3: 4, p6: 4, p7: 4 };
const BEST = ['Avery', 'Casey', 'Drew', 'Gray', 'Harper', 'Blake', 'Emery', 'Finley', 'Indy'];
const BEST_MINUTES = { Avery: '16 min', Casey: '20 min', Drew: '20 min', Gray: '20 min', Harper: '20 min',
  Blake: '16 min', Emery: '16 min', Finley: '16 min', Indy: '16 min' };
const ONLY_BUILT = 'Built for you: your best players get the spots that play the most. Move anyone and the list is yours. The first five start. Players who are out are skipped.';
const ONLY_MINE = 'You set this list. The first five start. Players who are out are skipped.';

describe('Rotation order builds the list', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function pickOrder(edits = {}) {
    await coach.onGameDayWithRoster(ROSTER, { tiers: TIERS, tieBreak: 'levels', ...edits });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
  }
  const addRule = async (kind, players) => {
    await coach.tap('Add a rule');
    await coach.tap(kind);
    for (const p of players) await coach.tap(p);
    await coach.tap('Add rule');
  };

  test('1. best players: the four higher-level kids take list spots 2 to 5, and each row shows its minutes', async () => {
    await pickOrder();

    assert.deepEqual(await coach.orderList(), BEST);
    assert.deepEqual(await coach.orderMinutes(), BEST_MINUTES);
    assert.equal(await coach.orderFooter(), ONLY_BUILT);
    await coach.tap('Close');
    const minutes = await coach.planMinutes();
    for (const [name, text] of Object.entries(BEST_MINUTES)) assert.equal(`${minutes[name]} min`, text, `${name} in the plan`);
  });

  test('2. an Out kid shows the mark and no minutes, and goes to the end of the list', async () => {
    await pickOrder({ out: ['p6'] });

    const list = await coach.orderList();
    assert.equal(list.at(-1), 'Gray');
    assert.deepEqual(await coach.orderMarks(), { Gray: 'Out' });
    assert.equal((await coach.orderMinutes()).Gray, undefined);
  });

  test('3. an Apart pair is never on together, because the list follows the rule when it is added', async () => {
    await pickOrder();
    await addRule('Apart', ['Casey', 'Avery']);

    assert.notDeepEqual(await coach.orderList(), BEST, 'the app\'s list followed the new rule');
    await coach.tap('Close');
    assert.equal(await coach.sees('Plan, rotation order'), true);
    assert.ok(lacks(await coach.text('#issues'), 'are set Apart but are on the floor together'), 'the note about the pair on together is gone');
    for (const five of await coach.planFives()) assert.ok(!(five.includes('BROO') && five.includes('WEBB')), `${five}`);
  });

  test('4. a minimum no list can meet says so on the plan', async () => {
    await pickOrder({ tiers: {}, tieBreak: 'behind', rules: {
      minMinutes: { p0: 20, p1: 20, p2: 20 }, avoids: [['p0', 'p1'], ['p0', 'p2'], ['p1', 'p2']] } });
    await coach.tap('Close');

    assert.match(await coach.text('#issues'), /No order meets every rule, so this list comes closest\. It can't (keep|give) /);
  });
});

describe('Rotation order: the coach\'s hand wins', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function pickOrder() {
    await coach.onGameDayWithRoster(ROSTER, { tiers: TIERS, tieBreak: 'levels' });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
  }

  test('5. after a move the list is theirs: a new rule leaves it, and Build it for me again builds it, Undo gives it back', async () => {
    await pickOrder();
    assert.equal(await coach.sees('Build it for me again'), false, 'the app\'s own list needs no button');
    await coach.tap('Move Avery down');
    const mine = ['Casey', 'Avery', 'Drew', 'Gray', 'Harper', 'Blake', 'Emery', 'Finley', 'Indy'];
    assert.deepEqual(await coach.orderList(), mine);
    assert.equal(await coach.orderFooter(), ONLY_MINE);
    assert.ok(await coach.sees('Build it for me again'));

    await coach.tap('Add a rule');
    await coach.tap('Apart');
    await coach.tap('Casey');
    await coach.tap('Avery');
    await coach.tap('Add rule');
    assert.deepEqual(await coach.orderList(), mine, 'a rule does not move the coach\'s list');

    await coach.tap('Build it for me again');
    assert.notDeepEqual(await coach.orderList(), mine);
    assert.equal((await coach.orderFooter()).startsWith('Built for you'), true);
    assert.equal(await coach.sees('Build it for me again'), false);
    assert.equal(await coach.focused(), `Move ${(await coach.orderList())[0]} down`);

    await coach.tap('Undo');
    assert.deepEqual(await coach.orderList(), mine);
    assert.equal(await coach.orderFooter(), ONLY_MINE);
    assert.ok(await coach.sees('Build it for me again'));
  });

  test('5b. a move and its move back leave the same list, and Build it for me again still makes it the app\'s', async () => {
    await pickOrder();
    await coach.tap('Move Avery down');
    await coach.tap('Move Avery up');
    assert.deepEqual(await coach.orderList(), BEST);
    assert.equal(await coach.orderFooter(), ONLY_MINE);
    assert.ok(await coach.sees('Build it for me again'));

    await coach.tap('Build it for me again');
    assert.deepEqual(await coach.orderList(), BEST);
    assert.equal(await coach.orderFooter(), ONLY_BUILT);
    assert.equal(await coach.sees('Build it for me again'), false);
  });

  test('6. a list seeded as the coach\'s is kept, and a game underway cannot be built again', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order', order: ROSTER.map((_, i) => `p${i}`), tiers: TIERS, tieBreak: 'levels' });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, rotation order');
    assert.deepEqual(await coach.orderList(), ROSTER);
    assert.ok(await coach.sees('Build it for me again'));
    await coach.tap('Close');
    await coach.tap('Start game');
    await coach.tap('Next');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap('Plan, rotation order');

    assert.deepEqual(await coach.orderList(), ROSTER);
    assert.equal(await coach.sees('Build it for me again'), false);
  });
});

describe('Rotation order: a game underway keeps the list the app built', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('6b. the app\'s own list stays put once a stint is played, and a new Apart rule does not build it again', async () => {
    await coach.onGameDayWithRoster(ROSTER, { tiers: TIERS, tieBreak: 'levels' });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    assert.deepEqual(await coach.orderList(), BEST);
    assert.equal(await coach.orderFooter(), ONLY_BUILT);
    await coach.tap('Close');
    await coach.tap('Start game');
    await coach.tap('Next');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap('Plan, rotation order');
    await coach.tap('Add a rule');
    await coach.tap('Apart');
    await coach.tap('Casey');
    await coach.tap('Avery');
    await coach.tap('Add rule');

    assert.deepEqual(await coach.orderList(), BEST, 'the list did not move');
    assert.equal(await coach.sees('Build it for me again'), false);
  });
});

describe('Rotation order builds the list: the second game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const sameAsCard = async () => (await coach.controls()).find(n => n.startsWith('Same as'));
  async function addGameTwo() {
    if (await coach.sees('Close')) await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap(await sameAsCard());
  }

  test('7. game 1 built: game 2 is built again, and the kids game 1 left short get the 20-minute spots', async () => {
    await coach.onGameDayWithRoster(ROSTER, {});
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    assert.deepEqual(await coach.orderList(), ROSTER);
    await addGameTwo();
    await coach.tap('Plan, rotation order');

    /* Game 1 gave Blake, Casey, Drew and Emery 20 and the other five 16, so
       those five are furthest behind. They take the next five spots in the
       roster order, and the 20-minute spots 2 to 5 go to Finley, Gray, Harper
       and Indy. */
    assert.deepEqual(await coach.orderList(), ['Avery', 'Finley', 'Gray', 'Harper', 'Indy', 'Blake', 'Casey', 'Drew', 'Emery']);
    assert.deepEqual(await coach.orderMinutes(), {
      Avery: '16 min', Finley: '20 min', Gray: '20 min', Harper: '20 min', Indy: '20 min',
      Blake: '16 min', Casey: '16 min', Drew: '16 min', Emery: '16 min' });
    assert.match(await coach.orderFooter(), /^Built for you: the kids behind on minutes get the spots that play the most\./);
  });

  test('8. game 1 set by hand: game 2 continues its cycle and the list is the coach\'s too', async () => {
    await coach.onGameDayWithRoster(ROSTER, {});
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    await coach.tap('Move Avery down');
    await coach.tap('Move Avery up');
    await addGameTwo();
    await coach.tap('Plan, rotation order');

    assert.deepEqual(await coach.orderList(), ['Finley', 'Gray', 'Harper', 'Indy', 'Avery', 'Blake', 'Casey', 'Drew', 'Emery']);
    assert.equal((await coach.orderFooter()).startsWith('You set this list.'), true);
  });
});
