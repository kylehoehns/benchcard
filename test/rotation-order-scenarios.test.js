/* #545: Rotation order, driven through test/coach.js the way a coach uses it.
 * The nine-player example is the issue's own: 2 periods of 16 minutes, a sub
 * every 4 minutes (8 stints), four players changing at once. The fives below
 * are written out by hand from the issue, not computed. Skipped where there
 * is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const ROSTER = ['Webb', 'Kade', 'Brooks', 'Brody', 'Jack', 'Sheeks', 'Cooper', 'Tate', 'Damari'];
/* The plan table prints four capital letters for a name: BROD for Brody. */
const short = f => f.map(n => n.slice(0, 4).toUpperCase()).sort();
const sorted = fives => fives.map(short);

/* Game 1 of the issue: each five, in stint order. */
const GAME_ONE = sorted([
  ['Webb', 'Kade', 'Brooks', 'Brody', 'Jack'],
  ['Jack', 'Sheeks', 'Cooper', 'Tate', 'Damari'],
  ['Damari', 'Webb', 'Kade', 'Brooks', 'Brody'],
  ['Brody', 'Jack', 'Sheeks', 'Cooper', 'Tate'],
  ['Tate', 'Damari', 'Webb', 'Kade', 'Brooks'],
  ['Brooks', 'Brody', 'Jack', 'Sheeks', 'Cooper'],
  ['Cooper', 'Tate', 'Damari', 'Webb', 'Kade'],
  ['Kade', 'Brooks', 'Brody', 'Jack', 'Sheeks'],
]);
const GAME_TWO_ORDER = ['Sheeks', 'Cooper', 'Tate', 'Damari', 'Webb', 'Kade', 'Brooks', 'Brody', 'Jack'];

describe('Rotation order: two games the same day', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const sameAsCard = async () => (await coach.controls()).find(n => n.startsWith('Same as'));

  async function gameOneOnOrder(names = ROSTER, edits = {}) {
    await coach.onGameDayWithRoster(names, edits);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
  }

  async function addGameTwo() {
    if (await coach.sees('Close')) await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap(await sameAsCard());
  }

  test('1. the issue\'s example: game 1 follows the roster, game 2 picks up where it stopped', async () => {
    await gameOneOnOrder();

    assert.deepEqual(await coach.orderList(), ROSTER, 'the list starts as the roster order');
    await coach.tap('Close');
    assert.deepEqual(await coach.planFives(), GAME_ONE);

    await addGameTwo();
    assert.ok(await coach.sees('Plan, rotation order'), 'the added game keeps the strategy');
    await coach.tap('Plan, rotation order');
    assert.deepEqual(await coach.orderList(), GAME_TWO_ORDER);
    await coach.tap('Close');
    const fives = await coach.planFives();
    assert.deepEqual(fives[0], short(['Sheeks', 'Cooper', 'Tate', 'Damari', 'Webb']));
    assert.deepEqual(fives[1], short(['Webb', 'Kade', 'Brooks', 'Brody', 'Jack']));
  });

  test('2. moving a kid in game 1 afterwards leaves game 2 as it was', async () => {
    await gameOneOnOrder();
    await addGameTwo();
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, rotation order');

    await coach.tap('Move Jack down');

    assert.deepEqual(await coach.orderList(), ['Webb', 'Kade', 'Brooks', 'Brody', 'Sheeks', 'Jack', 'Cooper', 'Tate', 'Damari']);
    await coach.tap('Close');
    const first = (await coach.planFives())[0];
    assert.deepEqual(first, short(['Webb', 'Kade', 'Brooks', 'Brody', 'Sheeks']), 'game 1 moved');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Owls, planned');
    await coach.tap('Plan, rotation order');
    assert.deepEqual(await coach.orderList(), GAME_TWO_ORDER, 'game 2 did not move');
  });

  test('3. the list marks Out kids, skips them, and the first and last arrows are off', async () => {
    await gameOneOnOrder(ROSTER, { out: ['p6'] });

    assert.deepEqual(await coach.orderMarks(), { Cooper: 'Out' });
    assert.equal(await coach.isDisabled('Move Webb up'), true);
    assert.equal(await coach.isDisabled('Move Damari down'), true);
    assert.equal(await coach.isDisabled('Move Webb down'), false);
    assert.ok((await coach.sizeOf('Move Kade up')).height >= 48);
    const A = short(['Webb', 'Kade', 'Brooks', 'Brody', 'Jack']);
    const B = short(['Jack', 'Sheeks', 'Tate', 'Damari', 'Webb']);
    await coach.tap('Close');
    assert.deepEqual(await coach.planFives(), [A, B, A, B, A, B, A, B]);
    assert.match(await coach.text('#issues'), /With 8 players, only 3 sit each stint, so fewer than 4 change at a break\./);
  });

  test('4. a moved button keeps the focus', async () => {
    await gameOneOnOrder();
    await coach.tap('Move Kade down');
    assert.equal(await coach.focused(), 'Move Kade down');
  });

  test('5. Order has no Shuffle and no Lineups group, and Starting five says the order picks', async () => {
    await gameOneOnOrder();
    await coach.tap('Close');
    assert.equal(await coach.sees('Shuffle'), false);
    await coach.tap('Plan, rotation order');
    assert.equal(await coach.text('#planLineups'), '');
  });
});

describe('Rotation order: the Rules list', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('6. Starting five is not offered, and one already set says it is not used', async () => {
    await coach.onGameDayWithRoster(ROSTER, { startingFive: ['p0', 'p1', 'p2', 'p3', 'p4'] });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    await coach.tap('Add a rule');

    assert.equal(await coach.sees('Starting five'), false, 'no Starting five chip under Order');
    await coach.tap('Back to Plan');
    assert.match(await coach.text('#constraints'), /Webb, Kade, Brooks, Brody and Jack start the game\. Not used: the order picks who starts\./);
  });
});

describe('Rotation order: a game underway', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* The issue's nine, order picked, game started, then stepped to stint `n`. */
  async function underwayAt(n, edits = {}) {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order', ...edits });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.goToStint(n);
  }
  const resume = async () => coach.tap((await coach.controls()).find(n => /^Resume/.test(n)));
  const A = ['Webb', 'Kade', 'Brooks', 'Brody', 'Jack'];
  const B = ['Jack', 'Sheeks', 'Cooper', 'Tate', 'Damari'];
  const C = ['Damari', 'Webb', 'Kade', 'Brooks', 'Brody'];

  test('7. a kid who was running late and is Here now joins at their place, from where the cycle stood', async () => {
    await underwayAt(3, { out: ['p6'], late: ['p6'] });
    const A8 = A, B8 = ['Jack', 'Sheeks', 'Tate', 'Damari', 'Webb'];

    await coach.tap('Here now, Cooper');

    assert.deepEqual(sorted(await coach.floorEveryStint()), sorted([
      A8, B8, A8,
      // nine in the circle from Jack, who the eight-player cycle had next after stint 3
      ['Jack', 'Sheeks', 'Cooper', 'Tate', 'Damari'],
      ['Damari', 'Webb', 'Kade', 'Brooks', 'Brody'],
      ['Brody', 'Jack', 'Sheeks', 'Cooper', 'Tate'],
      ['Tate', 'Damari', 'Webb', 'Kade', 'Brooks'],
      ['Brooks', 'Brody', 'Jack', 'Sheeks', 'Cooper'],
    ]));
  });

  test('8. Sit for the rest is allowed, and the rest of the game cycles without that kid', async () => {
    await underwayAt(3);
    await coach.tapPlayer('Brody');

    await coach.tap('Sit for the rest');

    const C8 = ['Damari', 'Webb', 'Kade', 'Brooks', 'Jack'];
    const D8 = ['Jack', 'Sheeks', 'Cooper', 'Tate', 'Damari'];
    assert.deepEqual(sorted(await coach.floorEveryStint()), sorted([A, B, C8, D8, C8, D8, C8, D8]));
  });

  test('9. a kid marked Out mid-game leaves the cycle and the stints played stay', async () => {
    await underwayAt(3);
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap("Who's here, 9 players");
    await coach.tap('Tate');
    await coach.tap('Close');
    await resume();

    const E = ['Brody', 'Jack', 'Sheeks', 'Cooper', 'Damari'];
    const F = ['Damari', 'Webb', 'Kade', 'Brooks', 'Brody'];
    assert.deepEqual(sorted(await coach.floorEveryStint()), sorted([A, B, C, E, F, E, F, E]));
  });
});
