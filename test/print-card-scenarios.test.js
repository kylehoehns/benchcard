/* Print card and the labels around it (#432): a coach who wants to print
 * sees a button that says so, on the Card view and on Today, and the other
 * labels name what they do now. RICH on game day: Hawks at 9:00 AM and
 * Ravens at 11:30 AM, both planned. `coach.printed()` is the app asking the
 * browser to print, with the card titles on the page at that moment.
 *
 * Skipped where there is no Chrome, as card-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach prints a card straight from the screen', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('the Card view has a Print card button that prints the Hawks card once', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    assert.equal(await coach.sees('Print card'), false, 'Print card shows on the Timeline');

    await coach.tap('Card');
    await coach.tap('Print card');

    const prints = await coach.printed();
    assert.equal(prints.length, 1);
    assert.ok(prints[0].every(t => t.includes('HAWKS')) && prints[0].length > 0, JSON.stringify(prints));
  });

  test('Today puts a Print card button beside each planned game and prints that game', async () => {
    await coach.onGameDay();
    const names = await coach.controls();
    assert.ok(names.includes('Print card for Hawks'), JSON.stringify(names));
    assert.ok(names.includes('Print card for Ravens'), JSON.stringify(names));
    assert.equal(await coach.text('[aria-label="Print card for Ravens"]'), 'Print card');

    await coach.tap('Print card for Ravens');

    const prints = await coach.printed();
    assert.equal(prints.length, 1);
    assert.ok(prints[0].length > 0 && prints[0].every(t => t.includes('RAVENS')), JSON.stringify(prints));
    assert.deepEqual(await coach.printedOn(), ['view-games'], 'the game screen is showing when print is called');
  });

  async function blockHawks() {
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
    for (const kind of ['Together', 'Apart']) {
      await coach.tap('Add a rule');
      await coach.tap(kind);
      await coach.tap('Marcus Williams');
      await coach.tap('Devon Ellis');
      await coach.tap('Add rule');
    }
    await coach.tap('Close');
    assert.notEqual(await coach.blockedPlan(), '', 'Hawks should need a fix');
    await coach.tap('Back to Smoke Test');
  }

  test('Today prints the Ravens card even while the open game needs a fix', async () => {
    await coach.onGameDay();
    await blockHawks();
    assert.equal(await coach.isDisabled('Print card for Ravens'), false, 'Ravens Print card is disabled');

    await coach.tap('Print card for Ravens');

    const prints = await coach.printed();
    assert.equal(prints.length, 1);
    assert.ok(prints[0].length > 0 && prints[0].every(t => t.includes('RAVENS')), JSON.stringify(prints));
  });

  test('an underway game has no Print card on Today and its main button says Resume', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next stint');
    await coach.press('Escape');
    await coach.tap('Back to Smoke Test');

    const rows = await coach.controls();
    assert.ok(rows.includes('Print card for Ravens'), JSON.stringify(rows));
    assert.ok(!rows.some(n => n.startsWith('Print card for Hawks')), JSON.stringify(rows));
    await coach.tap(rows.find(n => /^Hawks, 9:00 AM/.test(n)));
    const controls = await coach.controls();
    assert.ok(controls.some(n => n.startsWith('Resume')), JSON.stringify(controls));
  });

  test('the Card view Print card button is at least 48px tall', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Card');
    const { height } = await coach.sizeOf('Print card');
    assert.ok(height >= 48, `Print card is ${height}px tall`);
  });

  test('the share sheet names its tab Card, its button Print and its first row Games to print', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Share or hand off');

    const names = await coach.controls();
    assert.ok(names.includes('Card'), JSON.stringify(names));
    assert.ok(names.includes('Hand off'), JSON.stringify(names));
    assert.equal(await coach.text('#print'), 'Print');
    const rows = ['Games to print', 'Copies', 'Size', 'Names', 'Minutes strip'];
    for (const row of rows) {
      assert.ok(names.some(n => n === row || n.startsWith(`${row},`)), `no row "${row}" in ${JSON.stringify(names)}`);
    }
  });

  test('the welcome screen links About Benchcard, and Settings still says How it works', async () => {
    await coach.onFreshDevice();
    const welcome = await coach.controls();
    assert.ok(welcome.includes('About Benchcard'), JSON.stringify(welcome));
    assert.ok(!welcome.some(n => n === 'How it works'), JSON.stringify(welcome));

    await coach.onGameDay();
    await coach.tap('Settings');
    const settings = await coach.controls();
    assert.ok(settings.includes('How it works'), JSON.stringify(settings));
  });

  async function finishHawks() {
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 7; i++) await coach.tap('Next stint');
    await coach.tap('Finish game');
  }

  test('a finished game says View game, and only planned games on Today offer Print card', async () => {
    await coach.onGameDay();
    await finishHawks();
    await coach.tap('Back to Smoke Test');

    const rows = await coach.controls();
    assert.ok(rows.includes('Hawks, 9:00 AM, finished'), JSON.stringify(rows));
    assert.ok(!rows.some(n => n === 'Print card for Hawks'), JSON.stringify(rows));
    assert.ok(rows.includes('Print card for Ravens'), JSON.stringify(rows));

    await coach.tap('Hawks, 9:00 AM, finished');
    const controls = await coach.controls();
    assert.ok(controls.includes('View game'), JSON.stringify(controls));
    assert.ok(!controls.some(n => n === 'Start game'), JSON.stringify(controls));
  });

  test('a finished game whose plan later needs a fix still says View game', async () => {
    await coach.onGameDay();
    await finishHawks();
    await coach.tap('Rules, no rules');
    for (const kind of ['Together', 'Apart']) {
      await coach.tap('Add a rule');
      await coach.tap(kind);
      await coach.tap('Marcus Williams');
      await coach.tap('Devon Ellis');
      await coach.tap('Add rule');
    }
    await coach.tap('Close');
    assert.notEqual(await coach.blockedPlan(), '', 'Hawks should need a fix');
    const controls = await coach.controls();
    assert.ok(controls.includes('View game'), JSON.stringify(controls));
  });

  test('on a wide screen a finished game says View game too', async () => {
    await coach.onGameDayWide();
    await finishHawks();

    assert.equal(await coach.text('#gmOpen'), 'View game');
  });

  test('the Team screen is titled Roster, with the team name and the count under it', async () => {
    await coach.onTeamScreen(['Maya Webb', 'Eli Tran', 'Devon Ellis']);
    assert.equal(await coach.text('#teamTitle'), 'Roster');
    assert.equal(await coach.rosterCount(), 'Smoke Test · 3 players');
    assert.ok(await coach.sees('Back to Smoke Test'));

    await coach.onTeamScreen([]);
    assert.equal(await coach.text('#teamTitle'), 'Roster');
    assert.equal(await coach.rosterCount(), 'Smoke Test');
  });

  test('a team with no name shows just the count under Roster', async () => {
    await coach.onTeamScreen(['Maya Webb', 'Eli Tran', 'Devon Ellis']);
    await coach.tap('Back to Smoke Test');
    await coach.tap('Settings');
    await coach.fill('Team name', '');
    await coach.tap('Back to Team 1');
    await coach.tap('Team Team 1 · 3 players ›');

    assert.equal(await coach.text('#teamTitle'), 'Roster');
    assert.equal(await coach.rosterCount(), '3 players');
  });
});
