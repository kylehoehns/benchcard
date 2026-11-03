/* #534: after a swap the plan's "sits N stints in a row" note describes the
 * lineups on screen, and the Longest sit note still matches the longest sit
 * shown. RICH's Hawks cut to eight players (4 x 8, subs every 4) with Sits at
 * most 1, driven through test/coach.js. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const LIMIT = 1;
const rules = { keepOnFloor: [], avoids: [], pairs: [], closing: { players: [] }, minMinutes: {}, maxMinutes: {}, maxBench: LIMIT };
const SIT_NOTE = /(\S+ \S+) sits (\d+) stints in a row against a limit of (\d+) — no legal lineup kept them under it\./g;
const LONGEST = /Longest sit\s*([\d.]+) min/i;

/* Counted here, off the floors the coach saw: each name's longest run of
   stints off the floor, for every name on any floor. */
const sitRun = (floors, name) => {
  let run = 0, best = 0;
  for (const f of floors) { run = f.includes(name) ? 0 : run + 1; best = Math.max(best, run); }
  return best;
};
const overIn = floors => [...new Set(floors.flat())]
  .filter(n => sitRun(floors, n) > LIMIT).map(n => [n, sitRun(floors, n), LIMIT]).sort();
const saidIn = notes => [...notes.matchAll(SIT_NOTE)].map(m => [m[1], Number(m[2]), Number(m[3])]).sort();

describe('the sits-in-a-row note after a swap', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function start() {
    await coach.onGameDayWith({ constraints: rules }, 8);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }
  async function benchPlayers(floor) {
    return (await coach.controls()).map(n => /^\d+, (.+), [\d.]+ of [\d.]+ minutes$/.exec(n)?.[1])
      .filter(n => n && !floor.includes(n));
  }

  for (const scope of ['For now', 'Takes their minutes']) {
    test(`${scope} swap: the notes list every kid shown sitting past the limit, with the run on screen`, async () => {
      await start();
      await coach.goToStint(3);
      const floor = await coach.onFloor();
      await coach.tapPlayer(floor[0]);
      await coach.tap(scope);
      await coach.tapPlayer((await benchPlayers(floor))[0]);
      const floors = await coach.floorEveryStint();
      assert.ok(overIn(floors).length > 0, `the premise: someone sits past ${LIMIT} on screen: ${JSON.stringify(floors)}`);
      await coach.tap('Leave');
      const notes = await coach.text('#issues');
      assert.deepEqual(saidIn(notes), overIn(floors), `the notes say: ${notes}`);
    });
  }

  test('the Longest sit a player\'s detail gives matches the longest sit on screen after a Rest of game swap', async () => {
    await start();
    await coach.goToStint(3);
    const floor = await coach.onFloor();
    await coach.tapPlayer(floor[0]);
    await coach.tap('Takes their minutes');
    await coach.tapPlayer((await benchPlayers(floor))[0]);
    const floors = await coach.floorEveryStint();
    const names = [...new Set(floors.flat())];
    const longest = Math.max(...names.map(n => sitRun(floors, n)));
    await coach.tap('Leave');
    const kid = names.find(n => sitRun(floors, n) === longest);
    const row = (await coach.controls()).find(n => n.startsWith(`${kid}, `));
    await coach.tap(row);
    const m = LONGEST.exec(await coach.text('.tld-facts'));
    assert.ok(m, `${kid}'s detail says how long they sit at most`);
    assert.equal(Number(m[1]), longest * 4, `${longest} stints of 4 minutes`);
  });
});
