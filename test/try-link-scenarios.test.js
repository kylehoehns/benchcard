/* #424: a roster-size page links in with `?try=N`. A coach who already has a
 * team is told why nothing changed, and the address bar is left clean; a coach
 * with nothing saved still gets the sample team. Driven in real Chrome through
 * `test/coach.js`, asserting only what is on screen.
 *
 * Skipped where there is no Chrome, as first-run-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach follows a ?try= link from a chart page', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('a coach with a team is told the sample was not loaded, and keeps the roster', async () => {
    await coach.onTeamScreen(['Maya Webb', 'Jo Park']);
    await coach.openAt('/?try=7');

    assert.equal(await coach.toast(), "You already have a team, so the sample team wasn't loaded.");
    assert.equal(await coach.address(), '/');
    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Jo Park']);
  });

  test('a coach with nothing saved still gets the sample team', async () => {
    await coach.openFreshAt('/?try=7');

    assert.ok((await coach.toast()).startsWith('Sample team loaded.'), await coach.toast());
    assert.equal(await coach.address(), '/');
  });
});
