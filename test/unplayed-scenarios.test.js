/* A game the coach planned and never started in the app is asked about, not
 * filed and not dropped (#632): "Did you play these?" at the top of Today,
 * three answers per game. The sample team, a pinned clock, and only what is on
 * screen. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const SEP_28 = { y: 2026, m: 9, d: 28, h: 9 };
const KINGSWAY = 'Sat, Sep 26 · Kingsway';
const BUTTONS = ['Played', 'Move to today', "Didn't play"];
const NORTHGATE_AND_KINGSWAY = [{ date: '2026-09-26', games: [{ label: 'Northgate', started: true }, { label: 'Kingsway' }] }];

describe('a game that was planned and never started', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('is asked about on Today, not filed, when its day is over', async () => {
    await coach.onPastDays(SEP_28, NORTHGATE_AND_KINGSWAY);

    assert.equal(await coach.lastToast(), 'Sat, Sep 26: 1 game filed to the season.');
    assert.ok(await coach.sees('Season 1 game filed ›'), 'only Northgate is in the season');
    const card = await coach.unplayedCard();
    assert.deepEqual(card.rows, [KINGSWAY]);
    assert.equal(card.title, 'Did you play this game?');
    assert.equal(card.note, 'It was planned but never started in the app. Played games count toward minutes.');
    assert.deepEqual(await coach.unplayedButtons(KINGSWAY), BUTTONS.map(b => `${b}, ${KINGSWAY}`), 'each name starts with the words on the button');
  });

  /* every kid's season minutes, added up: 5 on the floor for 4 x 8 minutes is 160 */
  async function seasonTotal() {
    await coach.tap('Season 1 game filed ›');
    const total = Object.values(await coach.seasonMinutes()).reduce((a, b) => a + b, 0);
    await coach.tap('Back to Sample team');
    return total;
  }

  test('Played files it under its own day with its planned minutes, and it stays after a reopen', async () => {
    await coach.onPastDays(SEP_28, NORTHGATE_AND_KINGSWAY);
    await coach.comeBackAt(SEP_28); // the filing toast is gone, and nothing more files
    const before = await seasonTotal();

    await coach.answer(KINGSWAY, 'Played');

    assert.equal(await coach.toast(), 'Kingsway is in the season.');
    assert.equal(await coach.unplayedCard(), null);
    await coach.comeBackAt(SEP_28);
    assert.equal(await coach.unplayedCard(), null);
    assert.ok(await coach.sees('Season 2 games filed ›'));
    await coach.tap('Season 2 games filed ›');
    assert.ok((await coach.seasonFiled()).includes('Sep 26 · 2 games'), 'Kingsway is filed under its own day, with Northgate');
    const total = Object.values(await coach.seasonMinutes()).reduce((a, b) => a + b, 0);
    assert.equal(total - before, 160);
  });

  test('Undo on Played brings the question back and leaves the season as it was', async () => {
    await coach.onPastDays(SEP_28, NORTHGATE_AND_KINGSWAY);
    await coach.comeBackAt(SEP_28);

    await coach.answer(KINGSWAY, 'Played');
    await coach.tap('Undo');

    assert.deepEqual((await coach.unplayedCard()).rows, [KINGSWAY]);
    assert.ok(await coach.sees('Season 1 game filed ›'));
  });

  test("Didn't play removes the question and files nothing, and Undo brings it back", async () => {
    await coach.onPastDays(SEP_28, NORTHGATE_AND_KINGSWAY);
    await coach.comeBackAt(SEP_28);

    await coach.answer(KINGSWAY, "Didn't play");

    assert.equal(await coach.toast(), 'Kingsway removed.');
    assert.equal(await coach.unplayedCard(), null);
    assert.ok(await coach.sees('Season 1 game filed ›'), 'nothing was filed');

    await coach.tap('Undo');
    assert.deepEqual((await coach.unplayedCard()).rows, [KINGSWAY]);
  });

  test('Move to today puts the game in today with the games already there', async () => {
    await coach.onPastDays(SEP_28, [...NORTHGATE_AND_KINGSWAY, { date: '2026-09-28', games: [{ label: 'Ravens' }] }]);
    await coach.comeBackAt(SEP_28);

    await coach.answer(KINGSWAY, 'Move to today');

    assert.equal(await coach.toast(), 'Kingsway moved to today.');
    assert.equal(await coach.unplayedCard(), null);
    assert.deepEqual(await coach.todayGames(), ['Ravens, planned', 'Kingsway, planned']);
    await coach.comeBackAt(SEP_28);
    assert.deepEqual(await coach.todayGames(), ['Ravens, planned', 'Kingsway, planned']);
  });

  test('Undo on Move to today puts the game back in the question', async () => {
    await coach.onPastDays(SEP_28, [...NORTHGATE_AND_KINGSWAY, { date: '2026-09-28', games: [{ label: 'Ravens' }] }]);
    await coach.comeBackAt(SEP_28);

    await coach.answer(KINGSWAY, 'Move to today');
    await coach.tap('Undo');

    assert.deepEqual((await coach.unplayedCard()).rows, [KINGSWAY]);
    assert.deepEqual(await coach.todayGames(), ['Ravens, planned']);
  });

  const SEP_29 = { y: 2026, m: 9, d: 29, h: 9 };
  const THREE_UNSTARTED = [
    { date: '2026-09-26', games: [{ label: 'Kingsway' }] },
    { date: '2026-09-27', games: [{ label: 'Ravens' }, { label: '' }] },
  ];

  test('several past games are asked about oldest first, and answering one leaves the rest', async () => {
    await coach.onPastDays(SEP_29, THREE_UNSTARTED);
    const rows = ['Sat, Sep 26 · Kingsway', 'Sun, Sep 27 · Ravens', 'Sun, Sep 27 · Game 2'];
    const card = await coach.unplayedCard();
    assert.deepEqual(card.rows, rows);
    assert.equal(card.title, 'Did you play these?');
    assert.equal(card.note, 'They were planned but never started in the app. Played games count toward minutes.');

    await coach.answer(rows[1], "Didn't play");

    assert.deepEqual((await coach.unplayedCard()).rows, [rows[0], rows[2]]);
  });

  test('a second team has its own questions, and switching back shows the first one\'s', async () => {
    await coach.onPastDays(SEP_29, THREE_UNSTARTED, { otherTeamDays: [{ date: '2026-09-26', games: [{ label: 'Wolves' }] }] });

    await coach.tap('Sample team');
    await coach.tap('JV Ravens, 10 players');
    assert.deepEqual((await coach.unplayedCard()).rows, ['Sat, Sep 26 · Wolves']);
    await coach.tap('JV Ravens');
    await coach.tap('Sample team, 10 players');
    assert.deepEqual((await coach.unplayedCard()).rows,
      ['Sat, Sep 26 · Kingsway', 'Sun, Sep 27 · Ravens', 'Sun, Sep 27 · Game 2']);
  });

  test('a waiting question is still there after a reopen and after a backup is restored', async () => {
    await coach.onPastDays(SEP_28, NORTHGATE_AND_KINGSWAY);

    await coach.comeBackAt(SEP_28);
    assert.deepEqual((await coach.unplayedCard()).rows, [KINGSWAY]);

    await coach.tap('Settings');
    const backup = await coach.download('Save a backup file');
    await coach.tap('Back to Sample team');
    await coach.answer(KINGSWAY, "Didn't play");
    assert.equal(await coach.unplayedCard(), null);
    await coach.tap('Settings');
    await coach.pickFile('Restore from a file', backup);
    await coach.tap('Back to Sample team');

    assert.deepEqual((await coach.unplayedCard()).rows, [KINGSWAY]);
  });
});
