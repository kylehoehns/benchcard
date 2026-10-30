/* A game set up the night before is kept the next morning (#379): a first run
 * or a hand-off link on the 30th, a boot on the 31st with the clock pinned.
 * The sample team stands in for the issue's 9 players. Skipped where there is
 * no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const NIGHT = { y: 2026, m: 10, d: 30, h: 21 };
const MORNING = { y: 2026, m: 10, d: 31, h: 9 };

describe('a game set up the night before', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function sampleOn(pin) {
    await coach.onFreshDeviceAt(pin);
    await coach.tap('Try a sample team');
    await coach.tap('Next');
    await coach.tap('Next');
    await coach.tap('Go to the game');
    if (await coach.tourShows()) await coach.tap('Skip');
  }

  const sampleOnTheNight = () => sampleOn(NIGHT);

  async function printedFives() {
    await coach.tap('Card');
    return coach.cardFives();
  }

  test('a sample team set up at 9 PM has the same card the next morning, with nothing left out', async () => {
    await sampleOnTheNight();
    const fives = await printedFives();
    assert.ok(fives.length > 0, 'the card has stints');

    await coach.comeBackAt(MORNING);

    assert.ok(!/left out/.test(await coach.toast()), `toast: ${await coach.toast()}`);
    assert.deepEqual(await printedFives(), fives);
  });

  test('a game with its first stint played is filed as before, and today gets a new game', async () => {
    await sampleOnTheNight();
    await coach.tap('Start game');
    await coach.tap('Next stint');
    await coach.tap('Leave');

    await coach.comeBackAt(MORNING);

    assert.match(await coach.toast(), /Fri, Oct 30: 1 game filed/);
    assert.ok((await coach.controls()).includes('Game 1, planned'), 'today has a new game');
  });

  /* A sender's phone on `pin`: the sample game labelled vs Hawks, tipoff 9:30 AM, handed off. */
  async function hawksLink(pin) {
    await sampleOn(pin);
    await coach.fill('Opponent', 'vs Hawks');
    await coach.setTime('Tip-off', '9:30 AM');
    await coach.tap('Card');
    const fives = await coach.cardFives();
    await coach.tap('Share or hand off');
    await coach.tap('Hand off');
    await coach.tap('Share link');
    return { link: await coach.sharedLink(), fives };
  }

  test('a link made and opened on the 30th keeps its label, tipoff and stints on the 31st', async () => {
    const { link, fives } = await hawksLink(NIGHT);
    await coach.pinClock(NIGHT);
    await coach.openLink(link);

    await coach.comeBackAt(MORNING);
    await coach.tap('Back to Sample team');

    const games = await coach.todayGames();
    assert.ok(games.some(n => /^vs Hawks, 9:30 AM/.test(n)), JSON.stringify(games));
    assert.ok(!/left out/.test(await coach.toast()), await coach.toast());
    await coach.tap(games.find(n => /^vs Hawks/.test(n)));
    await coach.tap('Card');
    assert.deepEqual(await coach.cardFives(), fives);
  });

  test('a link for 2026-11-01 opened on the 30th is filed under Sun, Nov 1', async () => {
    const { link } = await hawksLink({ y: 2026, m: 11, d: 1, h: 8 });
    await coach.pinClock(NIGHT);
    await coach.openLink(link);
    await coach.tap('Back to Sample team');

    const today = await coach.text('#view-today');
    assert.ok(today.includes('Sun, Nov 1'), today);
  });
});
