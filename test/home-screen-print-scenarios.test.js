/* Print in the iOS Home Screen app (#500, #630): `window.print()` does nothing
 * there, so every Print button shares a US Letter PDF of the printed page
 * instead (the card at its real size, laid out as `window.print()` lays it
 * out) and says so. The scenarios read the shared file's own bytes.
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

/* What the shared PDF says: how many pages, and where each card sits (the `cm`
 * matrix's size and translation, PDF y measured from the page bottom). */
const pdfPages = bytes => (bytes.match(/\/MediaBox \[0 0 612 792\]/g) ?? []).length;
const placements = bytes => [...bytes.matchAll(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im\d+ Do Q/g)]
  .map(m => m.slice(1).join(' '));
const POCKET = '248.4 360', HALF = '576 367.2';

describe('a coach prints from the iOS Home Screen app', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); await coach.asHomeScreenApp(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('Share to print card for Ravens on Today shares one PDF, prints nothing and leaves the game showing', async () => {
    await coach.onGameDay();
    const names = await coach.controls();
    assert.ok(names.includes('Share to print card for Ravens'), JSON.stringify(names));
    assert.ok(!shows(names, 'Print card for Ravens'), JSON.stringify(names));
    assert.equal(await coach.text('[aria-label="Share to print card for Ravens"]'), 'Share to print');

    await coach.tap('Share to print card for Ravens');

    const shares = await coach.imageShares();
    assert.equal(shares.length, 1, JSON.stringify(shares));
    assert.deepEqual(shares[0].files, ['benchcard-ravens.pdf']);
    assert.deepEqual(shares[0].types, ['application/pdf']);
    assert.equal(shares[0].active, true, 'the share was made outside the tap');
    assert.equal(shares[0].inTap, true, 'the share was deferred out of the click handler');
    const pdf = await coach.sharedFileBytes();
    assert.equal(pdfPages(pdf), 1);
    assert.deepEqual(placements(pdf), [`${POCKET} 18 414`, `${POCKET} 277.2 414`]);
    assert.deepEqual(await coach.printed(), []);
    assert.equal(await coach.showing('game'), true);
  });

  test('the share sheet has one Share to print button, no Share image and no Copies, and it shares one PDF', async () => {
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
    assert.deepEqual(shares[0].files, ['benchcard-hawks.pdf']);
    assert.deepEqual(shares[0].types, ['application/pdf']);
    assert.deepEqual(await coach.printed(), []);
  });

  test('the half sheet is shared at 8 x 5.1 in, two stacked on one page', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Share or hand off');
    await coach.choose('Size', 'Half sheet · 8 × 5.1 in');
    await coach.tap('Share to print the card');

    const pdf = await coach.sharedFileBytes();
    assert.equal(pdfPages(pdf), 1);
    assert.deepEqual(placements(pdf), [`${HALF} 18 406.8`, `${HALF} 18 28.8`]);
  });

  test('every game today is one card each, two copies, four to a page at pocket size and two pages at half', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Share or hand off');
    await coach.choose('Games to print', 'Every game today');
    await coach.tap('Share to print the card');
    let pdf = await coach.sharedFileBytes();
    assert.equal(pdfPages(pdf), 1);
    assert.deepEqual(placements(pdf), [`${POCKET} 18 414`, `${POCKET} 277.2 414`, `${POCKET} 18 43.2`, `${POCKET} 277.2 43.2`]);

    await coach.choose('Size', 'Half sheet · 8 × 5.1 in');
    await coach.tap('Share to print the card');
    pdf = await coach.sharedFileBytes();
    assert.equal(pdfPages(pdf), 2);
    assert.deepEqual(placements(pdf), [`${HALF} 18 406.8`, `${HALF} 18 28.8`, `${HALF} 18 406.8`, `${HALF} 18 28.8`]);
  });

  test('the Card view button under the card reads Share to print and shares one PDF', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Card');
    assert.equal(await coach.sees('Print card'), false, 'Print card shows in the Home Screen app');

    await coach.tap('Share to print');

    const shares = await coach.imageShares();
    assert.equal(shares.length, 1, JSON.stringify(shares));
    assert.deepEqual(shares[0].files, ['benchcard-hawks.pdf']);
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

  test('a share that breaks says so and does not promise Print still works', async () => {
    await coach.onGameDay();
    await coach.shareFails();
    await coach.tap('Share to print card for Ravens');
    assert.equal(await coach.toast(), 'Could not share the card.');
  });

  test('a share the coach backs out of says nothing', async () => {
    await coach.onGameDay();
    await coach.shareCancelled();
    await coach.tap('Share to print card for Ravens');
    assert.equal(await coach.toast(), '');
  });

  test('a phone that cannot share a PDF shares the card as a PNG instead', async () => {
    await coach.onGameDay();
    await coach.shareTakesOnlyImages();
    await coach.tap('Share to print card for Ravens');

    const shares = await coach.imageShares();
    assert.equal(shares.length, 1, JSON.stringify(shares));
    assert.deepEqual(shares[0].files, ['benchcard-ravens.png']);
    assert.deepEqual(shares[0].types, ['image/png']);
    assert.deepEqual(await coach.printed(), []);
  });
});

describe('a coach in a browser tab whose share breaks', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });

  test('is told Print still works', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Share or hand off');
    await coach.shareFails();
    await coach.tap('Share image');
    assert.equal(await coach.toast(), 'Could not share the image. Print still works.');
  });
});
