/* #557: Order's "Mix the fives", driven through test/coach.js. The nine are
 * #545's: 2 periods of 16 minutes, a sub every 4 minutes (8 stints), four
 * changing at once. Casey, Drew, Gray and Harper are a level above the rest,
 * and are not the first four on the roster. The fives are worked out on paper
 * from the list on screen: stint j puts on the five places from 4j, counted
 * round the list. Made-up names only. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const ROSTER = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
const TOP = ['Casey', 'Drew', 'Gray', 'Harper'];
const TIERS = { p2: 4, p3: 4, p6: 4, p7: 4 };
const BEST = ['Avery', 'Casey', 'Drew', 'Gray', 'Harper', 'Blake', 'Emery', 'Finley', 'Indy'];
const MIX_BUILT = 'Built for you: your stronger players are spread out so every five has some. Move anyone and the list is yours. The first five start. Players who are out are skipped.';
const ONLY_BUILT = 'Built for you: your best players get the spots that play the most. Move anyone and the list is yours. The first five start. Players who are out are skipped.';
const ONLY_MINE = 'You set this list. The first five start. Players who are out are skipped.';
const BEHIND = 'Built for you: the kids behind on minutes get the spots that play the most. Move anyone and the list is yours. The first five start. Players who are out are skipped.';

const fiveAt = (list, j) => Array.from({ length: 5 }, (_, t) => list[(j * 4 + t) % list.length]);
const fivesOf = list => Array.from({ length: 8 }, (_, j) => fiveAt(list, j));
const assertSpread = list => fivesOf(list).forEach((five, j) => {
  const n = five.filter(id => TOP.includes(id)).length;
  assert.ok(n >= 2, `five ${j + 1} (${five.join(', ')}) holds ${n} of the four`);
});
const minutesOnPaper = list => Object.fromEntries(list.map(id => [id, `${fivesOf(list).filter(f => f.includes(id)).length * 4} min`]));

describe('Rotation order: mix the fives', { skip }, () => {
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

  test('1. the choice shows with Best players chosen; Mix the fives spreads the four, the minutes agree with the plan, and the footer says so', async () => {
    await pickOrder();
    assert.ok(await coach.sees('Best players get the extra sub'));
    assert.equal(await coach.isPressed('Best players get the extra sub'), true);
    assert.equal(await coach.isPressed('Mix the fives'), false);
    assert.deepEqual(await coach.orderList(), BEST);

    await coach.tap('Mix the fives');

    const list = await coach.orderList();
    assert.notDeepEqual(list, BEST, 'the list changed');
    assert.deepEqual([...list].sort(), [...ROSTER].sort());
    assertSpread(list);
    assert.equal(await coach.isPressed('Mix the fives'), true);
    assert.equal(await coach.isPressed('Best players get the extra sub'), false);
    assert.equal(await coach.focused(), 'Mix the fives');
    assert.deepEqual(await coach.orderMinutes(), minutesOnPaper(list));
    assert.equal(await coach.orderFooter(), MIX_BUILT);
    await coach.tap('Close');
    const minutes = await coach.planMinutes();
    for (const [name, text] of Object.entries(minutesOnPaper(list))) assert.equal(`${minutes[name]} min`, text.replace(' min', '') + ' min', `${name} in the plan`);

    await coach.tap('Plan, rotation order');
    await coach.tap('Best players get the extra sub');
    assert.deepEqual(await coach.orderList(), BEST, 'tapping the other row is the way back');
    assert.equal(await coach.orderFooter(), ONLY_BUILT);
  });

  test('2. Mix is kept after a reopen', async () => {
    await pickOrder();
    await coach.tap('Mix the fives');
    const list = await coach.orderList();
    await coach.tap('Close');
    await coach.comeBackDaysLater(0);
    await coach.tap('Plan, rotation order');

    assert.equal(await coach.isPressed('Mix the fives'), true);
    assert.deepEqual(await coach.orderList(), list);
  });

  test('3. moving a row hides the choice, and the list stays the coach\'s', async () => {
    await pickOrder();
    await coach.tap('Mix the fives');
    await coach.tap('Move Avery down');

    assert.equal(await coach.sees('Mix the fives'), false);
    assert.equal(await coach.orderFooter(), ONLY_MINE);
    const mine = await coach.orderList();
    await coach.tap('Add a rule');
    await coach.tap('Apart');
    await coach.tap('Casey');
    await coach.tap('Drew');
    await coach.tap('Add rule');
    assert.deepEqual(await coach.orderList(), mine, 'a rule does not move the coach\'s list');

    // a level changes: Avery becomes the highest level, and the list is still the coach's
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Team Smoke Test · 9 players ›');
    await coach.tap('AV Avery Regular');
    await coach.tap('Go-to, the five you would pick if you had to win one possession');
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, rotation order');
    assert.deepEqual(await coach.orderList(), mine, 'a new level does not move the coach\'s list');
    assert.equal(await coach.sees('Mix the fives'), false);
  });

  test('4. every kid at one level: Mix says there is nothing to mix, and the list is the default', async () => {
    await pickOrder({ tiers: {} });
    const first = await coach.orderList();
    await coach.tap('Mix the fives');

    assert.deepEqual(await coach.orderList(), first);
    assert.equal(await coach.orderFooter(), 'Built for you: everyone is at the same level, so there is nothing to mix. Move anyone and the list is yours. The first five start. Players who are out are skipped.');
  });

  test('5. under Furthest behind the first row reads Kids behind on minutes get the extra sub, and Mix still reads the levels', async () => {
    await pickOrder({ tieBreak: 'behind' });
    assert.ok(await coach.sees('Kids behind on minutes get the extra sub'));
    assert.equal(await coach.sees('Best players get the extra sub'), false);
    assert.equal(await coach.orderFooter(), BEHIND);

    await coach.tap('Mix the fives');
    assertSpread(await coach.orderList());
  });

  test('6. a list the coach set shows no choice; Build it for me again brings it back', async () => {
    await pickOrder();
    await coach.tap('Move Avery down');
    assert.equal(await coach.sees('Mix the fives'), false);
    await coach.tap('Build it for me again');
    assert.ok(await coach.sees('Mix the fives'));
  });

  test('8. after moving a row, Build it for me again builds the default list, not the mixed one', async () => {
    await pickOrder();
    await coach.tap('Mix the fives');
    await coach.tap('Move Avery down');
    await coach.tap('Build it for me again');

    assert.deepEqual(await coach.orderList(), BEST);
    assert.equal(await coach.isPressed('Best players get the extra sub'), true);
    assert.equal(await coach.isPressed('Mix the fives'), false);
    assert.equal(await coach.orderFooter(), ONLY_BUILT);
  });

  test('7. Copy from another game, with How it plans, carries Mix to the other game', async () => {
    await pickOrder();
    await coach.tap('Mix the fives');
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap('Next');
    await coach.tap('Add game');
    await coach.tap('Plan, rotation order');
    // the new game starts like Hawks; put it back on Best players, so the copy has something to change
    await coach.tap('Best players get the extra sub');
    assert.equal(await coach.isPressed('Mix the fives'), false);
    await coach.tap('Copy from another game');
    await coach.tap('Copy');
    await coach.tap('Close');
    await coach.tap('Plan, rotation order');

    assert.equal(await coach.isPressed('Mix the fives'), true);
    assertSpread(await coach.orderList());
    assert.equal(await coach.orderFooter(), MIX_BUILT);
  });
});
