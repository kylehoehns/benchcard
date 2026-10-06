/* First-run scenarios (the BDD pilot): a coach opens Benchcard on a device
 * with nothing saved, tries the sample team, walks the Tour, and opens "How it
 * works" from Settings -- driven in real Chrome through `test/coach.js`.
 * Each test asserts only what a coach sees.
 *
 * Skipped where there is no Chrome, as season-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach opens Benchcard for the first time', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function tryTheSample() {
    await coach.onFreshDevice();
    await coach.tap('Try a sample team');
    await coach.tap('Next');
    await coach.tap('Next');
    await coach.tap('Go to the game');
  }

  test('a device with nothing saved opens on the welcome screen', async () => {
    await coach.onFreshDevice();

    const controls = await coach.controls();
    assert.ok(controls.includes('Set up my team'), JSON.stringify(controls));
    assert.ok(controls.includes('Try a sample team'), JSON.stringify(controls));
  });

  test('the welcome headline is followed by the demo, with no line between', async () => {
    await coach.onFreshDevice();

    const hero = await coach.text('.wel-hero');
    assert.ok(hero.includes('The whole game, worked out before you leave the house.'), hero);
    assert.ok(lacks(hero, 'however else you want them split'), hero);
  });

  test('trying the sample team lands on its plan with the tour on top', async () => {
    await tryTheSample();
    assert.ok(await coach.tourShows(), 'the tour opens');

    assert.deepEqual((await coach.controls()).filter(n => n === 'Skip' || n === 'Next'), ['Skip', 'Next']);
    await coach.tap('Skip');

    const controls = await coach.controls();
    for (const name of ['Back to Sample team', 'Who\'s here, 9 players', 'Format, 4 × 8', 'Plan, even minutes']) {
      assert.ok(controls.includes(name), `${name} is on screen: ${JSON.stringify(controls)}`);
    }
    /* 160 player-minutes over 9 players: four play 20 and five play 16, and
       which four changes from one opening to the next. */
    const minutes = await coach.planMinutes();
    assert.deepEqual(Object.keys(minutes).sort(), ['Caleb Ruiz', 'Devon Ellis', 'Eli Tran', 'Harper Pratt', 'Jonah Reed',
      'Maya Webb', 'Nia Bell', 'Ruby Marsh', 'Silas Hart']);
    assert.deepEqual(Object.values(minutes).sort(), [16, 16, 16, 16, 16, 20, 20, 20, 20]);

    await coach.tap('Back to Sample team');
    const today = await coach.controls();
    assert.ok(today.includes('Game 1, planned'), JSON.stringify(today));
    assert.ok(today.includes('Team Sample team · 9 players ›'), JSON.stringify(today));
  });

  test('the tour walks seven steps, ends on Got it and does not come back', async () => {
    await tryTheSample();
    assert.ok(await coach.tourShows(), 'the tour opens');

    for (let n = 1; n <= 6; n++) {
      assert.equal(await coach.text('#tourStep'), `STEP ${n} OF 7`);
      assert.ok(await coach.sees('Next'), `step ${n} has Next`);
      await coach.tap('Next');
    }
    assert.equal(await coach.text('#tourStep'), 'STEP 7 OF 7');
    assert.deepEqual((await coach.controls()).filter(n => ['Skip', 'Next', 'Got it'].includes(n)), ['Got it']);
    await coach.tap('Got it');

    const after = await coach.controls();
    assert.deepEqual(after.filter(n => ['Skip', 'Next', 'Got it'].includes(n)), [], 'the tour is gone');
    assert.ok(after.includes('Back to Sample team'), JSON.stringify(after));

    await coach.comeBackLaterOn('games');
    assert.equal(await coach.tourShows(1000), false, 'the tour stays away');
  });

  test('"How it works" opens from Settings and gives focus back when closed', async () => {
    await coach.onGameDay();
    await coach.tap('Settings');
    await coach.tap('How it works');

    assert.deepEqual(await coach.controls(), ['Close', 'Show me around again']);
    await coach.tap('Close');

    assert.ok(!(await coach.sees('Close')), 'the sheet is gone');
    assert.equal(await coach.focused(), 'How it works');
  });
});
