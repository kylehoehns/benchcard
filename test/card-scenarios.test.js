/* Card scenarios (the BDD pilot, Plan journey's print side): a coach looks at
 * the Card, switches it to the Half sheet, and hands the Game to another
 * phone, driven in real Chrome through `test/coach.js`. The day is RICH's:
 * 11 players, 4 x 8 quarters subbed every 4 minutes (8 stints), Hawks at
 * 9:00. Each test asserts only what a coach sees.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

/* Item 1-3 of spec 622: one row per sub, the kids going in first, then who
   comes off and who stays. The first row is the starting five and the bench. */
const ROWS = [
  'Q1 8:00 | STARTING FIVE ANA CASE HANA NIA THEO | BENCH MARC DEVO ELI JORD SAM RILE',
  'Q1 4:00 | DEVO JORD SAM | OUT CASE HANA NIA | STAY ANA THEO',
  'Q2 8:00 | CASE MARC RILE | OUT ANA SAM THEO | STAY DEVO JORD',
  'Q2 4:00 | ELI HANA NIA | OUT DEVO JORD RILE | STAY CASE MARC',
  'Q3 8:00 | ANA SAM THEO | OUT HANA MARC NIA | STAY CASE ELI',
  'Q3 4:00 | DEVO JORD NIA | OUT ANA CASE ELI | STAY SAM THEO',
  'Q4 8:00 | ELI MARC RILE | OUT NIA SAM THEO | STAY DEVO JORD',
  'Q4 4:00 | ANA HANA NIA | OUT DEVO JORD MARC | STAY ELI RILE',
];

describe('a coach prints or hands off a game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function openHawksCard() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Card');
  }

  test('the card shows a row for every sub, on a pocket-size card', async () => {
    await openHawksCard();

    assert.deepEqual(await coach.cardRows(), ROWS);
    assert.equal(await coach.cardSize(), '3.45 × 5');
  });

  test('the half sheet is the same plan at a bigger size, and stays after reopening the app', async () => {
    await openHawksCard();
    const fives = await coach.cardFives();
    assert.equal(fives.length, 8);

    await coach.tap('Share or hand off');
    await coach.choose('Size', 'Half sheet · 8 × 5.1 in');
    await coach.tap('Close');

    assert.equal(await coach.cardSize(), '8 × 5.1');
    assert.deepEqual(await coach.cardRows(), ROWS);
    assert.deepEqual(await coach.cardFives(), fives);

    await coach.comeBackDaysLater(0);
    await coach.tap('Card');
    assert.equal(await coach.cardSize(), '8 × 5.1');
    assert.deepEqual(await coach.cardRows(), ROWS);
    assert.deepEqual(await coach.cardFives(), fives);
  });

  test('a game handed off opens on another phone with the same plan', async () => {
    await openHawksCard();
    const fives = await coach.cardFives();

    await coach.tap('Share or hand off');
    await coach.tap('Hand off');
    await coach.openLink(await coach.shareLink());

    assert.equal(await coach.lastToast(), 'Smoke Test game added. Open bench mode to run subs.');
    await coach.tap('Card');
    assert.deepEqual(await coach.cardRows(), ROWS);
    assert.deepEqual(await coach.cardFives(), fives);
  });

  /* Items 9, 10 and 12 of spec 622. */
  const KEY = 'BLACK BOX = send in · tick the box as you sub';

  test('every card prints the key line, and the minutes strip sits below it only while Settings shows minutes', async () => {
    await openHawksCard();
    const [[key, strip]] = await coach.cardFooters();
    assert.equal(key, KEY);
    assert.equal(strip, 'DEVO 16 ELI 16 ANA 16 JORD 16 CASE 16 THEO 16 NIA 16 MARC 12 HANA 12 SAM 12 RILE 12');

    await coach.tap('Share or hand off');
    await coach.tap('Minutes strip');
    await coach.tap('Close');
    assert.deepEqual(await coach.cardFooters(), [[KEY]]);
  });

  test('RICH prints on one card at both sizes, minutes on', async () => {
    await openHawksCard();
    assert.deepEqual(await coach.cardTitles(), ['VS HAWKS']);
    await coach.tap('Share or hand off');
    await coach.choose('Size', 'Half sheet · 8 × 5.1 in');
    await coach.tap('Close');
    assert.deepEqual(await coach.cardTitles(), ['VS HAWKS']);
    assert.equal((await coach.cardRows()).length, 8);
  });

  test('with jersey numbers chosen, the boxes, OUT, STAY, the starters and the bench all print numbers', async () => {
    await openHawksCard();
    await coach.tap('Share or hand off');
    await coach.choose('Names', 'Jersey numbers');
    await coach.tap('Close');
    const rows = await coach.cardRows();
    assert.equal(rows.length, 8);
    for (const line of rows) assert.ok(!/[A-Z]{3}/.test(line.replace(/STARTING FIVE|BENCH|OUT|STAY|ALL/g, '')), `a name printed: ${line}`);
    assert.match(rows[0], /^Q1 8:00 \| STARTING FIVE (\d+ ){4}\d+ \| BENCH (\d+ ){5}\d+$/);
    assert.match(rows[1], /^Q1 4:00 \| (\d+ ){2}\d+ \| OUT (\d+ ){2}\d+ \| STAY \d+ \d+$/);
  });

  /* #370: overtime on a reprinted card. */
  async function cardOf(edits) {
    await coach.onGameDayWith(edits);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Card');
  }

  test('an overtime stint prints as OT, and a second one as OT2, never Q5', async () => {
    await cardOf({ overtime: [2, 2] });

    const rows = await coach.cardRows();
    assert.equal(rows.length, 10);
    assert.match(rows[8], /^OT 2:00 \| /);
    assert.match(rows[9], /^OT2 2:00 \| /);
    assert.ok(!rows.some(l => /^Q5/.test(l)), 'a regulation name leaked onto an overtime row');
  });

  test('a card split into pages names overtime in its title: Q4-OT, and a page of only OT reads OT', async () => {
    await cardOf({ granValue: 3, overtime: [2] });
    assert.deepEqual(await coach.cardTitles(), ['HAWKS Q1-Q3', 'HAWKS Q4-OT']);

    await cardOf({ granValue: 2, overtime: [6] });
    const titles = await coach.cardTitles();
    assert.deepEqual(titles, ['HAWKS Q1-Q2', 'HAWKS Q3-Q4', 'HAWKS OT']);
    assert.ok(titles.every(t => !/Q5/.test(t)), `a title says Q5: ${titles}`);
  });

  test('a regulation game split into two pages still reads Q1-Q2 and Q3-Q4', async () => {
    await cardOf({ granValue: 2 });
    assert.deepEqual(await coach.cardTitles(), ['HAWKS Q1-Q2', 'HAWKS Q3-Q4']);
  });
});
