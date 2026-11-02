/* #537 #541: one count of sitting, as a coach sees it. A kid who walks in late
 * is not shown sitting before they got there, and overtime is not counted
 * toward Sits at most. RICH's Hawks (4 x 8, a change every 4: eight stints),
 * driven through test/coach.js. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';
const LONGEST = /Longest sit\s*([\d.]+) min/i;

describe('a late arrival is not sitting before they got there', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* Ten on the roster, Theo (p9) out and running late; bench mode at stint 5, Theo marked here,
     then the plan with its Stint by stint list open. */
  async function theoArrivesAtStint5() {
    await coach.onGameDayWith({ out: ['p9'], late: ['p9'] }, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.goToStint(5);
    await coach.tap('Here now, Theo Alvarez');
    await coach.tap('Leave');
  }

  test('the On the bench column has Theo in none of the stints up to the one he walked in during', async () => {
    await theoArrivesAtStint5();
    const bench = await coach.benchEachStint();
    assert.equal(bench.length, 8);
    for (let n = 1; n <= 5; n++) assert.ok(!bench[n - 1].includes('Theo'), `stint ${n} lists Theo on the bench: ${bench[n - 1]}`);
  });

  test('Theo\'s detail counts his Longest sit from the stint after he arrived', async () => {
    await theoArrivesAtStint5();
    // three stints (12 minutes) are left after stint 5
    await coach.benchEachStint();
    const row = (await coach.controls()).find(n => n.startsWith('Theo Alvarez, '));
    await coach.tap(row);
    const facts = await coach.text('.tld-facts');
    const m = LONGEST.exec(facts);
    assert.ok(m, `the premise: Theo sits at least once after he arrived, so his detail shows a Longest sit in minutes: ${facts}`);
    assert.ok(Number(m[1]) <= 12, `Theo's detail says he sits ${m[1]} minutes in a row`);
  });
});

describe('overtime does not count toward Sits at most', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const LIMIT = 1;
  const rules = { keepOnFloor: [], avoids: [], pairs: [], closing: { players: [] }, minMinutes: {}, maxMinutes: {}, maxBench: LIMIT };
  /* Counted here, off the floors the coach saw: each name's longest run of stints off the floor. */
  const sitRun = (floors, name) => {
    let run = 0, best = 0;
    for (const f of floors) { run = f.includes(name) ? 0 : run + 1; best = Math.max(best, run); }
    return best;
  };

  for (const who of ['Keep this five', 'Strongest five', 'Next rotation']) {
    test(`${who}: the notes name a kid for a long sit only if regulation made it`, async () => {
      await coach.onGameDayWith({ constraints: rules }, 9);
      await coach.tap('Hawks, 9:00 AM, planned');
      await coach.tap('Start game');
      for (let i = 0; !(await coach.sees('Finish game')); i++) { assert.ok(i < 40); await coach.tap('Next stint'); }
      await coach.addOvertime(4, who);
      const floors = await coach.floorEveryStint();
      assert.equal(floors.length, 9, 'eight stints and one of overtime');
      await coach.tap('Leave');
      const notes = await coach.text('#issues');
      const said = [...notes.matchAll(/(\S+ \S+) sits (\d+) stints in a row/g)].map(m => [m[1], Number(m[2])]).sort();
      const names = [...new Set(floors.flat())];
      const over = names.filter(n => sitRun(floors.slice(0, 8), n) > LIMIT).map(n => [n, sitRun(floors.slice(0, 8), n)]).sort();
      assert.deepEqual(said, over, `the notes say: ${notes}`);
    });
  }
});
