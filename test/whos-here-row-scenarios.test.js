/* #576: under the game's sentence, an always-visible Who's here row shows how
 * many came and opens the same Who's here sheet the "11 players" phrase does.
 * Driven in real Chrome through test/coach.js; the day is RICH's, with 11
 * players on the Hawks game. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe("a coach uses the Who's here row", { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test("the row shows the count and opens the Who's here sheet", async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.ok(await coach.sees("Who's here (11)"));
    await coach.tap("Who's here (11)");
    assert.ok(await coach.sees('Ana Reyes'), 'the sheet lists the players');
    await coach.tap('Ana Reyes');
    await coach.tap('Close');
    assert.ok(await coach.sees("Who's here (10)"), 'the count follows who came');
    assert.ok(await coach.sees("Who's here, 10 players"), 'the same number the sentence says');
  });

  test('the row is at least 48px tall', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.ok((await coach.sizeOf("Who's here (11)")).height >= 48);
  });
});
