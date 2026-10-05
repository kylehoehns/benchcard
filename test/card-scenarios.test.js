/* Card scenarios (the BDD pilot, Plan journey's print side): a coach looks at
 * the Card, switches it to the Half sheet, and hands the Game to another
 * phone, driven in real Chrome through `test/coach.js`. The day is RICH's:
 * 11 players, 4 x 8 quarters subbed every 4 minutes (8 stints), Hawks at
 * 9:00. Each test asserts only what a coach sees.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const CHANGE_LINES = [
  'Q1 8:00 START',
  '4:00 ▼CASE HANA NIA',
  'Q2 8:00 ▼ANA SAM THEO',
  '4:00 ▼CASE DEVO JORD',
  'Q3 8:00 ▼HANA MARC RILE',
  '4:00 ▼ANA CASE NIA',
  'Q4 8:00 ▼ELI SAM THEO',
  '4:00 ▼CASE DEVO JORD',
];

describe('a coach prints or hands off a game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function openHawksCard() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Card');
  }

  test('the card shows a change line for every stint, on a pocket-size card', async () => {
    await openHawksCard();

    assert.deepEqual(await coach.changeLines(), CHANGE_LINES);
    assert.equal(await coach.cardSize(), '3.45 × 5');
  });

  test('the half sheet is the same plan at a bigger size, and stays after reopening the app', async () => {
    await openHawksCard();
    const fives = await coach.cardFives();
    assert.equal(fives.length, 8);

    await coach.tap('Share or hand off');
    await coach.choose('Size', 'Half sheet · 8 × 5.1 in');
    await coach.tap('Close');

    assert.equal(await coach.cardSize(), '8 × 5.1');
    assert.deepEqual(await coach.changeLines(), CHANGE_LINES);
    assert.deepEqual(await coach.cardFives(), fives);

    await coach.comeBackDaysLater(0);
    await coach.tap('Card');
    assert.equal(await coach.cardSize(), '8 × 5.1');
    assert.deepEqual(await coach.changeLines(), CHANGE_LINES);
    assert.deepEqual(await coach.cardFives(), fives);
  });

  test('a game handed off opens on another phone with the same plan', async () => {
    await openHawksCard();
    const fives = await coach.cardFives();

    await coach.tap('Share or hand off');
    await coach.tap('Hand off');
    await coach.tap('Share link');
    await coach.openLink(await coach.sharedLink());

    assert.equal(await coach.toast(), 'Smoke Test game added. Open bench mode to run subs.');
    await coach.tap('Card');
    assert.deepEqual(await coach.changeLines(), CHANGE_LINES);
    assert.deepEqual(await coach.cardFives(), fives);
  });
});
