/* #545: Rotation order, driven through test/coach.js the way a coach uses it.
 * The nine-player example is the issue's own: 2 periods of 16 minutes, a sub
 * every 4 minutes (8 stints), four players changing at once. The fives below
 * are written out by hand from the issue, not computed. Skipped where there
 * is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

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
const A = ['Webb', 'Kade', 'Brooks', 'Brody', 'Jack'];
const B = ['Jack', 'Sheeks', 'Cooper', 'Tate', 'Damari'];
const C = ['Damari', 'Webb', 'Kade', 'Brooks', 'Brody'];
const GAME_TWO_ORDER = ['Sheeks', 'Cooper', 'Tate', 'Damari', 'Webb', 'Kade', 'Brooks', 'Brody', 'Jack'];

describe('Rotation order: two games the same day', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const sameAsCard = async () => (await coach.controls()).find(n => n.startsWith('Same as'));

  /* #547: a list picked on Order is built by the app, and a later game builds
     its own. `byHand` moves Webb down and back up first, which makes the list
     the coach's: the roster order, and the one a later game carries on from. */
  async function gameOneOnOrder(names = ROSTER, edits = {}, byHand = false) {
    await coach.onGameDayWithRoster(names, edits);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    if (byHand) {
      await coach.tap('Move Webb down');
      await coach.tap('Move Webb up');
    }
  }

  async function addGameTwo() {
    if (await coach.sees('Close')) await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap(await sameAsCard());
  }

  test('1. the issue\'s example: game 1 follows the roster, game 2 picks up where it stopped', async () => {
    await gameOneOnOrder(ROSTER, {}, true);

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
    await gameOneOnOrder(ROSTER, {}, true);
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
    // #547: the built list puts the Out kid last (it was the seventh in #545's roster-order copy)
    assert.equal(await coach.isDisabled('Move Cooper down'), true);
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

describe('Rotation order: where the cycle stopped, after a kid sat for the rest', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('10. a kid sat for the rest is not counted when the next game starts where this one stopped', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order' });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.goToStint(2);
    await coach.tapPlayer('Cooper');
    await coach.tap('Sit for the rest');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    await coach.tap('Plan, rotation order');

    /* Cooper sits from stint 2, so the cycle is the other eight: Webb, Kade,
       Brooks, Brody, Jack, Sheeks, Tate, Damari, four places on each stint.
       Stint 1 led from Webb, so stints 2 to 8 lead from Jack, Webb, Jack,
       Webb, Jack, Webb, Jack, and the next game's stint 1 leads from Webb:
       the nine start again from the top. Counting Cooper in the circle ends
       the cycle on Kade. */
    assert.deepEqual(await coach.orderList(), ROSTER);
  });

  test('11. a late kid arriving after the sit joins a cycle that has no Brody in it', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order', out: ['p6'], late: ['p6'] });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.goToStint(3);
    await coach.tapPlayer('Brody');
    await coach.tap('Sit for the rest');
    await coach.goToStint(5);
    await coach.tap('Here now, Cooper');

    /* Eight were in the circle (Cooper late), so stint 2 was Jack, Sheeks,
       Tate, Damari, Webb and Webb came next. Seven without Brody: stints 3 to
       5 are Webb, Kade, Brooks, Jack, Sheeks, then Sheeks, Tate, Damari, Webb,
       Kade, then Kade, Brooks, Jack, Sheeks, Tate, and Tate is next. Cooper
       joins at his place: stints 6 to 8 start from Tate over Tate, Damari,
       Webb, Kade, Brooks, Jack, Sheeks, Cooper. */
    assert.deepEqual(sorted(await coach.floorEveryStint()).slice(2), sorted([
      ['Webb', 'Kade', 'Brooks', 'Jack', 'Sheeks'],
      ['Sheeks', 'Tate', 'Damari', 'Webb', 'Kade'],
      ['Kade', 'Brooks', 'Jack', 'Sheeks', 'Tate'],
      ['Tate', 'Damari', 'Webb', 'Kade', 'Brooks'],
      ['Brooks', 'Jack', 'Sheeks', 'Cooper', 'Tate'],
      ['Tate', 'Damari', 'Webb', 'Kade', 'Brooks'],
    ]));
  });
});

describe('Rotation order: where a later game starts', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const sameAsCard = async () => (await coach.controls()).find(n => n.startsWith('Same as'));
  const stepThree = async word => {
    await coach.tap('Next');
    await coach.tap('Next');
    await coach.tap((await coach.controls()).find(n => n.startsWith(`${word} `)));
    await coach.tap('Add game');
  };

  test('12. with exactly five players everybody plays every stint, and the next game starts where the count of changes lands', async () => {
    await coach.onGameDayWithRoster(ROSTER.slice(0, 5), { strategy: 'order' });
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap(await sameAsCard());
    await coach.tap('Plan, rotation order');

    /* Eight stints, four change each time: 8 x 4 = 32 places round a circle
       of five, which is two places on from the top, so game 2 starts with the
       third player. */
    assert.deepEqual(await coach.orderList(), ['Brooks', 'Brody', 'Jack', 'Webb', 'Kade']);
  });

  test('13. a new day starts from the roster order, not from where yesterday stopped', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order' });
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.setDate('Date', '2026-09-19');
    await coach.tap(await sameAsCard());
    await coach.tap('Plan, rotation order');

    assert.deepEqual(await coach.orderList(), ROSTER);
  });

  test('14. the day after, the game that replaces a filed one starts from the roster order', async () => {
    const backwards = [...ROSTER].map((_, i) => `p${8 - i}`);
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order', order: backwards });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(1, `document.querySelector('.today-game')`);
    await coach.tap((await coach.todayGames())[0]);
    await coach.tap('Plan, rotation order');

    assert.deepEqual(await coach.orderList(), ROSTER);
  });

  test('15. picking Order in the add-a-game steps starts it where the day\'s Order game stopped', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order' });
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap('Next');
    await coach.tap('Next');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Even ')));
    await coach.tap('Add game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Ravens');
    await stepThree('Order');
    await coach.tap('Plan, rotation order');

    assert.deepEqual(await coach.orderList(), GAME_TWO_ORDER);
  });

  test('16. a game on Order does not say it evens out the day, and its switch is off and unavailable', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order' });
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap(await sameAsCard());

    assert.equal(await coach.sees('Evening out the day, Evens out the 9:00 AM game.'), false, 'no Evens out line');
    assert.ok(lacks(await coach.text('body'), 'Evens out the'), 'the page says Order evens out the day');
    await coach.tap('Plan, rotation order');
    assert.equal(await coach.isDisabled('Even out earlier games'), true);
    assert.match(await coach.text('#planDay'), /Not used with a rotation order/);
  });
});

describe('Rotation order: moving a kid in a game underway', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('17. the played stints stay, and the rest follows the new order from the kid the old order had next', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order' });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.goToStint(3);
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap('Plan, rotation order');
    await coach.tap('Move Brody up');
    await coach.tap('Close');
    await coach.tap((await coach.controls()).find(n => /^Resume/.test(n)));

    /* Stints 1 to 3 are as played. The old order had Brody next, so the new
       order (Webb, Kade, Brody, Brooks, Jack, Sheeks, Cooper, Tate, Damari)
       is read from Brody: four change each stint from there. */
    assert.deepEqual(sorted(await coach.floorEveryStint()), sorted([
      A, B, C,
      ['Brody', 'Brooks', 'Jack', 'Sheeks', 'Cooper'],
      ['Cooper', 'Tate', 'Damari', 'Webb', 'Kade'],
      ['Kade', 'Brody', 'Brooks', 'Jack', 'Sheeks'],
      ['Sheeks', 'Cooper', 'Tate', 'Damari', 'Webb'],
      ['Webb', 'Kade', 'Brody', 'Brooks', 'Jack'],
    ]));
  });
});
