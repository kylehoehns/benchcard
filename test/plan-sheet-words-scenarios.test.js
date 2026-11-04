/* #574: plain words on the Plan sheet. The choices say minutes where they said
 * stints, the game screen's section says "Sub by sub", the strategy is called
 * Order everywhere, "Pick a player" carries no "0 of 1", and Rule detail
 * mentions a locked By hand number only under By hand. Driven through
 * test/coach.js on RICH's game day (Hawks, 9:00 AM, 4 x 8 subbed every 4
 * minutes). Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const BY_HAND_LINE = 'If a locked By hand number is lower, the minimum wins and the plan notes say so.';

describe('plain words on the Plan sheet', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function openRules() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Rules, no rules');
  }

  test('the game screen calls its table Sub by sub', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.equal(await coach.text('#tabledetails summary'), 'Sub by sub');
  });

  test('a single-player picker says Pick a player with no count; a pair picker keeps its count', async () => {
    await openRules();
    await coach.tap('Add a rule');
    await coach.tap('Plays at least');
    assert.equal(await coach.text('#planKindBody .pickhd'), 'Pick a player');
    await coach.tap('Together');
    assert.equal(await coach.text('#planKindBody .pickhd'), 'Pick two players 0 of 2');
  });

  test('the Together strength says what it does without the word stint', async () => {
    await openRules();
    await coach.tap('Add a rule');
    await coach.tap('Together');
    const group = await coach.strengthRows();
    assert.ok(group, 'the strength group shows under the two-player picker');
    assert.equal(/stint/i.test(JSON.stringify(group)), false, JSON.stringify(group));
    await coach.tap('Marcus Williams');
    await coach.tap('Devon Ellis');
    await coach.tap('Always');
    await coach.tap('Add rule');
    const names = await coach.controls();
    assert.ok(names.includes('Marcus and Devon always together'), JSON.stringify(names));
    assert.equal(names.some(n => /stint|Force Together/.test(n)), false);
  });

  test('a minimum rule mentions a locked By hand number only when the plan is By hand', async () => {
    await openRules();
    await coach.tap('Add a rule');
    await coach.tap('Plays at least');
    await coach.tap('Marcus Williams');
    await coach.tap('Add rule');
    const rule = async () => (await coach.controls()).find(n => /^Marcus\b.*\bat least\b/i.test(n) || /Marcus.*at least/i.test(n));

    await coach.tap(await rule());
    assert.equal((await coach.footnotes()).includes(BY_HAND_LINE), false, 'Even: no By hand line');
    await coach.tap('Back to Plan');
    await coach.tap('By hand');
    await coach.tap(await rule());
    assert.ok((await coach.footnotes()).includes(BY_HAND_LINE), 'By hand: the line shows');
  });

  test('How it works names the strategy Order, as its button does', async () => {
    await coach.onGameDay();
    await coach.tap('Settings');
    await coach.tap('How it works');
    const terms = await coach.helpTerms();
    assert.ok(terms.includes('Order'), JSON.stringify(terms));
    assert.equal(terms.includes('Rotation order'), false);
  });
});
