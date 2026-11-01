/* Print in the iOS Home Screen app (#500): `window.print()` does nothing
 * there, so every Print button shares the card image instead and says so.
 * RICH on game day: Hawks at 9:00 AM and Ravens at 11:30 AM, both planned.
 * `asHomeScreenApp()` opens the app the way the Home Screen app is: its
 * `navigator.standalone` is true and its share sheet takes images.
 *
 * Skipped where there is no Chrome, as print-card-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const shows = (names, name) => names.some(n => n === name);

describe('a coach prints from the iOS Home Screen app', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); await coach.asHomeScreenApp(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('Share to print card for Ravens on Today shares one image, prints nothing and leaves the game showing', async () => {
    await coach.onGameDay();
    const names = await coach.controls();
    assert.ok(names.includes('Share to print card for Ravens'), JSON.stringify(names));
    assert.ok(!shows(names, 'Print card for Ravens'), JSON.stringify(names));
    assert.equal(await coach.text('[aria-label="Share to print card for Ravens"]'), 'Share to print');

    await coach.tap('Share to print card for Ravens');

    const shares = await coach.imageShares();
    assert.equal(shares.length, 1, JSON.stringify(shares));
    assert.deepEqual(shares[0].files, ['benchcard-ravens.png']);
    assert.deepEqual(shares[0].types, ['image/png']);
    assert.deepEqual(await coach.printed(), []);
    assert.equal(await coach.showing('game'), true);
  });

  test('the share sheet has one Share to print button, no Share image and no Copies, and it shares one image', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Share or hand off');

    const names = await coach.controls();
    assert.equal(await coach.text('#print'), 'Share to print');
    assert.ok(!shows(names, 'Share image'), JSON.stringify(names));
    assert.ok(!names.some(n => n === 'Print' || n === 'Print the card'), JSON.stringify(names));
    assert.ok(!names.some(n => n === 'Copies' || n.startsWith('Copies,')), JSON.stringify(names));
    for (const row of ['Games to print', 'Size', 'Names', 'Minutes strip']) {
      assert.ok(names.some(n => n === row || n.startsWith(`${row},`)), `no row "${row}" in ${JSON.stringify(names)}`);
    }

    await coach.tap('Share to print the card');

    const shares = await coach.imageShares();
    assert.equal(shares.length, 1, JSON.stringify(shares));
    assert.deepEqual(shares[0].files, ['benchcard-hawks.png']);
    assert.deepEqual(await coach.printed(), []);
  });

  test('the Card view button under the card reads Share to print and shares one image', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Card');
    assert.equal(await coach.sees('Print card'), false, 'Print card shows in the Home Screen app');

    await coach.tap('Share to print');

    const shares = await coach.imageShares();
    assert.equal(shares.length, 1, JSON.stringify(shares));
    assert.deepEqual(shares[0].files, ['benchcard-hawks.png']);
    assert.deepEqual(await coach.printed(), []);
  });

  test('first-run step 3 shows one button, Share to print, and no Share image', async () => {
    await coach.onFreshDevice();
    await coach.tap('Try a sample team');
    await coach.tap('Next');
    await coach.tap('Next');

    const names = await coach.controls();
    assert.ok(names.includes('Share to print the card'), JSON.stringify(names));
    assert.ok(!shows(names, 'Share image'), JSON.stringify(names));
    assert.ok(!shows(names, 'Print the card'), JSON.stringify(names));
  });
});
