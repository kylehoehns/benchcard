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

const ROSTER = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
/* The plan table prints four capital letters for a name: BROD for Drew. */
const short = f => f.map(n => n.slice(0, 4).toUpperCase()).sort();
const sorted = fives => fives.map(short);

/* Game 1 of the issue: each five, in stint order. */
const GAME_ONE = sorted([
  ['Avery', 'Blake', 'Casey', 'Drew', 'Emery'],
  ['Emery', 'Finley', 'Gray', 'Harper', 'Indy'],
  ['Indy', 'Avery', 'Blake', 'Casey', 'Drew'],
  ['Drew', 'Emery', 'Finley', 'Gray', 'Harper'],
  ['Harper', 'Indy', 'Avery', 'Blake', 'Casey'],
  ['Casey', 'Drew', 'Emery', 'Finley', 'Gray'],
  ['Gray', 'Harper', 'Indy', 'Avery', 'Blake'],
  ['Blake', 'Casey', 'Drew', 'Emery', 'Finley'],
]);
const A = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery'];
const B = ['Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
const C = ['Indy', 'Avery', 'Blake', 'Casey', 'Drew'];
const GAME_TWO_ORDER = ['Finley', 'Gray', 'Harper', 'Indy', 'Avery', 'Blake', 'Casey', 'Drew', 'Emery'];

describe('Rotation order: two games the same day', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const sameAsCard = async () => (await coach.controls()).find(n => n.startsWith('Same as'));

  /* #547: a list picked on Order is built by the app, and a later game builds
     its own. `byHand` moves Avery down and back up first, which makes the list
     the coach's: the roster order, and the one a later game carries on from. */
  async function gameOneOnOrder(names = ROSTER, edits = {}, byHand = false) {
    await coach.onGameDayWithRoster(names, edits);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    if (byHand) {
      await coach.tap('Move Avery down');
      await coach.tap('Move Avery up');
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
    assert.deepEqual(fives[0], short(['Finley', 'Gray', 'Harper', 'Indy', 'Avery']));
    assert.deepEqual(fives[1], short(['Avery', 'Blake', 'Casey', 'Drew', 'Emery']));
  });

  test('2. moving a kid in game 1 afterwards leaves game 2 as it was', async () => {
    await gameOneOnOrder(ROSTER, {}, true);
    await addGameTwo();
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, rotation order');

    await coach.tap('Move Emery down');

    assert.deepEqual(await coach.orderList(), ['Avery', 'Blake', 'Casey', 'Drew', 'Finley', 'Emery', 'Gray', 'Harper', 'Indy']);
    await coach.tap('Close');
    const first = (await coach.planFives())[0];
    assert.deepEqual(first, short(['Avery', 'Blake', 'Casey', 'Drew', 'Finley']), 'game 1 moved');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Owls, planned');
    await coach.tap('Plan, rotation order');
    assert.deepEqual(await coach.orderList(), GAME_TWO_ORDER, 'game 2 did not move');
  });

  test('3. the list marks Out kids, skips them, and the first and last arrows are off', async () => {
    await gameOneOnOrder(ROSTER, { out: ['p6'] });

    assert.deepEqual(await coach.orderMarks(), { Gray: 'Out' });
    assert.equal(await coach.isDisabled('Move Avery up'), true);
    // #547: the built list puts the Out kid last (it was the seventh in #545's roster-order copy)
    assert.equal(await coach.isDisabled('Move Gray down'), true);
    assert.equal(await coach.isDisabled('Move Avery down'), false);
    assert.ok((await coach.sizeOf('Move Blake up')).height >= 48);
    const A = short(['Avery', 'Blake', 'Casey', 'Drew', 'Emery']);
    const B = short(['Emery', 'Finley', 'Harper', 'Indy', 'Avery']);
    await coach.tap('Close');
    assert.deepEqual(await coach.planFives(), [A, B, A, B, A, B, A, B]);
    assert.match(await coach.text('#issues'), /With 8 players, only 3 sit each stint, so fewer than 4 change at a break\./);
  });

  test('4. a moved button keeps the focus', async () => {
    await gameOneOnOrder();
    await coach.tap('Move Blake down');
    assert.equal(await coach.focused(), 'Move Blake down');
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
    assert.match(await coach.text('#constraints'), /Avery, Blake, Casey, Drew and Emery start the game\. Not used: the order picks who starts\./);
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
    const A8 = A, B8 = ['Emery', 'Finley', 'Harper', 'Indy', 'Avery'];

    await coach.tap('Here now, Gray');

    assert.deepEqual(sorted(await coach.floorEveryStint()), sorted([
      A8, B8, A8,
      // nine in the circle from Emery, who the eight-player cycle had next after stint 3
      ['Emery', 'Finley', 'Gray', 'Harper', 'Indy'],
      ['Indy', 'Avery', 'Blake', 'Casey', 'Drew'],
      ['Drew', 'Emery', 'Finley', 'Gray', 'Harper'],
      ['Harper', 'Indy', 'Avery', 'Blake', 'Casey'],
      ['Casey', 'Drew', 'Emery', 'Finley', 'Gray'],
    ]));
  });

  test('8. Sit for the rest is allowed, and the rest of the game cycles without that kid', async () => {
    await underwayAt(3);
    await coach.tapPlayer('Drew');

    await coach.tap('Sits the rest of the game');

    const C8 = ['Indy', 'Avery', 'Blake', 'Casey', 'Emery'];
    const D8 = ['Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
    assert.deepEqual(sorted(await coach.floorEveryStint()), sorted([A, B, C8, D8, C8, D8, C8, D8]));
  });

  test('9. a kid marked Out mid-game leaves the cycle and the stints played stay', async () => {
    await underwayAt(3);
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap("Who's here, 9 players");
    await coach.tap('Harper');
    await coach.tap('Close');
    await resume();

    const E = ['Drew', 'Emery', 'Finley', 'Gray', 'Indy'];
    const F = ['Indy', 'Avery', 'Blake', 'Casey', 'Drew'];
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
    await coach.tapPlayer('Gray');
    await coach.tap('Sits the rest of the game');
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    await coach.tap('Plan, rotation order');

    /* Gray sits from stint 2, so the cycle is the other eight: Avery, Blake,
       Casey, Drew, Emery, Finley, Harper, Indy, four places on each stint.
       Stint 1 led from Avery, so stints 2 to 8 lead from Emery, Avery, Emery,
       Avery, Emery, Avery, Emery, and the next game's stint 1 leads from Avery:
       the nine start again from the top. Counting Gray in the circle ends
       the cycle on Blake. */
    assert.deepEqual(await coach.orderList(), ROSTER);
  });

  test('11. a late kid arriving after the sit joins a cycle that has no Drew in it', async () => {
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order', out: ['p6'], late: ['p6'] });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.goToStint(3);
    await coach.tapPlayer('Drew');
    await coach.tap('Sits the rest of the game');
    await coach.goToStint(5);
    await coach.tap('Here now, Gray');

    /* Eight were in the circle (Gray late), so stint 2 was Emery, Finley,
       Harper, Indy, Avery and Avery came next. Seven without Drew: stints 3 to
       5 are Avery, Blake, Casey, Emery, Finley, then Finley, Harper, Indy, Avery,
       Blake, then Blake, Casey, Emery, Finley, Harper, and Harper is next. Gray
       joins at his place: stints 6 to 8 start from Harper over Harper, Indy,
       Avery, Blake, Casey, Emery, Finley, Gray. */
    assert.deepEqual(sorted(await coach.floorEveryStint()).slice(2), sorted([
      ['Avery', 'Blake', 'Casey', 'Emery', 'Finley'],
      ['Finley', 'Harper', 'Indy', 'Avery', 'Blake'],
      ['Blake', 'Casey', 'Emery', 'Finley', 'Harper'],
      ['Harper', 'Indy', 'Avery', 'Blake', 'Casey'],
      ['Casey', 'Emery', 'Finley', 'Gray', 'Harper'],
      ['Harper', 'Indy', 'Avery', 'Blake', 'Casey'],
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
    assert.deepEqual(await coach.orderList(), ['Casey', 'Drew', 'Emery', 'Avery', 'Blake']);
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

  test('14. the day after, the game that replaces a filed one is built again, the kids the old list left short first', async () => {
    const backwards = [...ROSTER].map((_, i) => `p${8 - i}`);
    await coach.onGameDayWithRoster(ROSTER, { strategy: 'order', order: backwards });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(1, `document.querySelector('.today-game')`);
    await coach.tap((await coach.todayGames())[0]);
    await coach.tap('Plan, rotation order');

    /* The filed game's backwards list gave Emery, Finley, Gray and Harper 20 minutes
       and the other five 16. Those five are furthest behind: they take the first
       five spots in the roster order (#547: the game that replaces a filed day is built). */
    assert.deepEqual(await coach.orderList(), ['Avery', 'Blake', 'Casey', 'Drew', 'Indy', 'Emery', 'Finley', 'Gray', 'Harper']);
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
    await coach.tap('Move Drew up');
    await coach.tap('Close');
    await coach.tap((await coach.controls()).find(n => /^Resume/.test(n)));

    /* Stints 1 to 3 are as played. The old order had Drew next, so the new
       order (Avery, Blake, Drew, Casey, Emery, Finley, Gray, Harper, Indy)
       is read from Drew: four change each stint from there. */
    assert.deepEqual(sorted(await coach.floorEveryStint()), sorted([
      A, B, C,
      ['Drew', 'Casey', 'Emery', 'Finley', 'Gray'],
      ['Gray', 'Harper', 'Indy', 'Avery', 'Blake'],
      ['Blake', 'Drew', 'Casey', 'Emery', 'Finley'],
      ['Finley', 'Gray', 'Harper', 'Indy', 'Avery'],
      ['Avery', 'Blake', 'Drew', 'Casey', 'Emery'],
    ]));
  });
});
