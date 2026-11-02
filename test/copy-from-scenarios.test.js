/* #548: a coach copies the rules, the way it plans, the format and who is
 * here from another game into the one that is open, before it starts. Driven
 * in real Chrome through test/coach.js. The day is RICH's: Hawks at 9:00 and
 * Ravens at 11:30, both 4 × 8 with 11 players. Ravens is set up first (a
 * rotation order, a minimum, a 2 × 16 format, Ana out) so there is something
 * to copy. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach copies a setup from another game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const ravensRow = async () => (await coach.controls()).find(n => n.startsWith('Ravens, '));

  /* Set Ravens up, then open the Hawks game's Plan sheet. */
  async function ravensSetUpThenHawks() {
    await coach.onGameDay();
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Order');
    await coach.tap('Add a rule');
    await coach.tap('Plays at least');
    await coach.tap('Marcus Williams');
    await coach.stepTo('minutes', 20);
    await coach.tap('Add rule');
    await coach.tap('Close');
    await coach.tap('Format, 4 × 8');
    for (let i = 0; i < 2; i++) await coach.tap('Fewer periods');
    for (let i = 0; i < 8; i++) await coach.tap('More minutes');
    await coach.tap('Close');
    await coach.tap("Who's here, 11 players");
    await coach.tap('Ana Reyes');
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
  }

  test('the page offers the other game, with the four switches at their defaults', async () => {
    await ravensSetUpThenHawks();
    await coach.tap('Copy from another game');

    const row = await ravensRow();
    assert.equal(row, 'Ravens, Today · Saturday · 11:30 AM · 10 players, 2 × 16, rotation order');
    assert.ok(await coach.isPressed(row), 'the first game is chosen');
    assert.equal(await coach.isOn('Rules'), true);
    assert.equal(await coach.isOn('How it plans'), true);
    assert.equal(await coach.isOn('Format and subs'), true);
    assert.equal(await coach.isOn("Who's here"), false);
    assert.equal(await coach.isDisabled('Copy'), false);
  });

  test('Copy takes the rules, the plan and the format, leaves who is here, and survives a reopen', async () => {
    await ravensSetUpThenHawks();
    await coach.tap('Copy from another game');
    await coach.tap('Copy');

    assert.equal(await coach.toast(), 'Copied from Ravens.');
    await coach.tap('Close');
    assert.ok(await coach.sees('Plan, rotation order'));
    assert.ok(await coach.sees('Format, 2 × 16'));
    assert.ok(await coach.sees("Who's here, 11 players"), 'Ana is still here in the Hawks game');
    assert.ok(await coach.sees('Rules, 1 rule'));
    await coach.comeBackDaysLater(0);
    assert.ok(await coach.sees('Plan, rotation order'));
  });

  test('Undo gives the Hawks game back exactly as it was', async () => {
    await ravensSetUpThenHawks();
    const before = await coach.savedDays();
    await coach.tap('Copy from another game');
    await coach.tap('Copy');
    await coach.tap('Undo');

    assert.deepEqual(await coach.savedDays(), before);
    await coach.tap('Close');
    assert.ok(await coach.sees('Plan, even minutes'));
    assert.ok(await coach.sees('Format, 4 × 8'));
  });

  test('with every switch off, Copy is disabled', async () => {
    await ravensSetUpThenHawks();
    await coach.tap('Copy from another game');
    for (const name of ['Rules', 'How it plans', 'Format and subs']) await coach.tap(name);
    assert.equal(await coach.isDisabled('Copy'), true);
    await coach.tap("Who's here");
    assert.equal(await coach.isDisabled('Copy'), false);
  });

  test('a game in progress does not offer the action', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next stint');
    await coach.tap('Leave');
    await coach.tap('Plan, even minutes');
    assert.equal(await coach.sees('Copy from another game'), false);
  });
});
