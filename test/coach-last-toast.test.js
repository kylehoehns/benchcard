/* Coach.lastToast(): the newest toast this page has shown, still up or timed
 * out (#601). A toast raised during boot can time out before a page load
 * returns on a busy machine; `toast()` reads only what is on screen now.
 * Driven in real Chrome through `test/coach.js`. Skipped where there is no
 * Chrome. */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('Coach.lastToast', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });

  test('a dismissed toast is gone from toast() but still the last toast; a page with none resets it', async () => {
    await coach.onTeamScreen(['Avery Lane', 'Blake Cruz']);
    await coach.openAt('/?try=7');
    await coach.tap('Dismiss');

    assert.equal(await coach.toast(), '');
    assert.equal(await coach.lastToast(), "You already have a team, so the sample team wasn't loaded.");

    await coach.openAt('/');
    assert.equal(await coach.lastToast(), '');
  });
});
