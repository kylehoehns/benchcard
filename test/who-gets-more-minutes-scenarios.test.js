/* #571: the words on the choices that sound like "my best kids finish" say
 * which of them really gives a kid more minutes (Closers) and which only
 * decide who is on the floor (Finish strong, Starts the last period, Order's
 * extra sub). Copy only; test/words-561-fingerprint.test.js holds the plans
 * still. Driven through test/coach.js on RICH's game day (Hawks, 9:00 AM).
 * Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const LAST_PERIOD = 'Only picks who starts it. To give kids more minutes at the end, use Closers.';

describe('the words on who gets more minutes', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function openPlan() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
  }

  test('Closers says the closers play more than everyone else', async () => {
    await openPlan();
    await coach.tap('Closers');
    assert.equal(await coach.text('#stratwhy'),
      'Even minutes early, then your closing group finishes the game and plays more than everyone else.');
  });

  test('Finish strong says minutes stay even and points to Closers, and no Lineup balance choice says stint', async () => {
    await openPlan();
    await coach.tap('Lineup balance Steady');
    const shapes = (await coach.controls()).filter(n => /^(Steady|Start strong|Finish strong|Both ends) /.test(n));
    assert.equal(shapes.length, 4);
    assert.ok(shapes.includes('Finish strong Saves your best five for the end. Minutes stay even, so use Closers to give your closers more time.'),
      JSON.stringify(shapes));
    for (const s of shapes) assert.doesNotMatch(s, /stint/i, s);
  });

  test('Starts the last period says it only picks who starts, in Add a rule and in the rule once it is added', async () => {
    await openPlan();
    await coach.tap('Add a rule');
    await coach.tap('Starts the last period');
    assert.ok((await coach.footnotes()).includes(LAST_PERIOD), JSON.stringify(await coach.footnotes()));

    await coach.tap('Marcus Williams');
    await coach.tap('Add rule');
    await coach.tap((await coach.controls()).find(n => n === 'Marcus starts the last period'));
    assert.ok((await coach.footnotes()).includes(LAST_PERIOD), JSON.stringify(await coach.footnotes()));
  });

  test("Order's first choice says get the extra sub, under either way of settling the extra minutes", async () => {
    await coach.onGameDayWithRoster(['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'], { tieBreak: 'levels' });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    assert.ok(await coach.sees('Best players get the extra sub'), JSON.stringify(await coach.controls()));
    assert.equal(await coach.sees('Best players play the most'), false);

    await coach.onGameDayWithRoster(['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'], { tieBreak: 'behind' });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    assert.ok(await coach.sees('Kids behind on minutes get the extra sub'), JSON.stringify(await coach.controls()));
    assert.equal(await coach.sees('Kids furthest behind play the most'), false);
  });
});
