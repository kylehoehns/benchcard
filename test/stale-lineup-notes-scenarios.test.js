/* #456: the notes under the timeline that talk about the lineup itself (a pair
 * kept together, a keep-on rule, changes at once, the half, stints in a row)
 * stop describing a lineup the coach has since changed. A swap or a finished
 * game makes the pair, keep-on, changes and half notes untrue, so they go; the
 * stints-in-a-row note is rebuilt from the lineups on screen. A plan nobody
 * touched keeps the engine's notes word for word. RICH's Hawks (11 players,
 * 4 x 8, subs every 4) with one rule each, driven through test/coach.js.
 * Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const rules = c => ({ keepOnFloor: [], avoids: [], pairs: [], closing: { players: [] }, minMinutes: {}, maxMinutes: {}, ...c });
const PAIR = rules({ pairs: [['p0', 'p1']], openingFive: ['p0', 'p2', 'p3', 'p4', 'p5'], lastPeriodFive: ['p1', 'p2', 'p3', 'p4', 'p5'] });
const KEEPON = rules({ keepOnFloor: [['p0', 'p1']], avoids: [['p0', 'p2'], ['p0', 'p3'], ['p0', 'p4']], maxMinutes: { p1: 16 } });
const REST_2 = rules({ minMinutes: { p0: 24 }, maxConsecutive: 2 });
const REST_1 = rules({ maxConsecutive: 1 });

/* The longest run of stints in a row `name` is on the floor, read off the
   floors bench mode shows -- counted here, not taken from the app. */
const longestRun = (floors, name) => {
  let run = 0, best = 0;
  for (const f of floors) { run = f.includes(name) ? run + 1 : 0; best = Math.max(best, run); }
  return best;
};

const RUN_NOTE = /(\S+ \S+) plays (\d+) stints in a row against a limit of (\d+) — no legal lineup kept them under it\./g;

describe('lineup notes after the lineup moved', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks(edits) {
    await coach.onGameDayWith(edits);
    await coach.tap('Hawks, 9:00 AM, planned');
    const before = await coach.text('#issues');
    await coach.tap('Start game');
    return before;
  }

  /* the first player on the floor swaps with the first on the bench */
  /* bench rows reach the accessibility tree once a player is picked up, so
     this is read after the first tap of a swap, with the floor read before it */
  async function benchPlayers(floor) {
    return (await coach.controls()).map(n => /^\d+, (.+), [\d.]+ of [\d.]+ minutes$/.exec(n)?.[1])
      .filter(n => n && !floor.includes(n));
  }

  async function swapFirstPair() {
    const floor = await coach.onFloor();
    await coach.tapPlayer(floor[0]);
    await coach.tapPlayer((await benchPlayers(floor))[0]);
  }

  async function toLastStint() {
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 40, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
  }

  test('an untouched plan keeps the engine\'s stints-in-a-row note word for word', async () => {
    const before = await startHawks({ constraints: REST_2 });
    assert.ok(before.includes('Marcus Williams plays 3 stints in a row against a limit of 2 — no legal lineup kept them under it.'), before);
    await coach.tap('Leave');
    const after = await coach.text('#issues');
    assert.ok(after.includes('Marcus Williams plays 3 stints in a row against a limit of 2 — no legal lineup kept them under it.'), after);
  });

  test('a swap that moves the lineup takes the pair note away', async () => {
    const before = await startHawks({ constraints: PAIR });
    assert.match(before, /Marcus Williams \+ Devon Ellis are on the floor together for \d+ of a possible \d+ minutes\./);
    await swapFirstPair();
    await coach.tap('Leave');
    assert.ok(lacks(await coach.text('#issues'), /are on the floor together/));
  });

  test('a swap takes the keep-on note away', async () => {
    const before = await startHawks({ constraints: KEEPON });
    assert.match(before, /Marcus Williams and Devon Ellis are both off the floor for \d+ stints?/);
    await swapFirstPair();
    await coach.tap('Leave');
    assert.ok(lacks(await coach.text('#issues'), /are both off the floor/));
  });

  test('a swap takes the changes-at-once note away', async () => {
    const before = await startHawks({ constraints: REST_1 });
    assert.match(before, /put 5 players on at once, more than the 3 you asked for/);
    await swapFirstPair();
    await coach.tap('Leave');
    assert.ok(lacks(await coach.text('#issues'), /more than the 3 you asked for/));
  });

  test('a swap takes the second-half note away', async () => {
    const before = await startHawks({ granValue: 8 });
    assert.match(before, /do not get on until the second half/);
    await swapFirstPair();
    await coach.tap('Leave');
    assert.ok(lacks(await coach.text('#issues'), /until the second half/));
  });

  test('a finished game no longer says who waited for the second half', async () => {
    await startHawks({ granValue: 8 });
    await toLastStint();
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');
    assert.ok(lacks(await coach.text('#issues'), /until the second half/));
  });

  /* The stints-in-a-row notes on screen, as [name, run, limit]; and the same read
     off the floors, counted here: who is over `limit`, and by how much. */
  const saidIn = notes => [...notes.matchAll(RUN_NOTE)].map(m => [m[1], Number(m[2]), Number(m[3])]).sort();
  const overIn = (floors, limit) => [...new Set(floors.flat())]
    .filter(n => longestRun(floors, n) > limit).map(n => [n, longestRun(floors, n), limit]).sort();

  test('swapping out the start of a run of three for the rest of the game, the note follows the lineups shown', async () => {
    await startHawks({ constraints: REST_2 });
    const floors = await coach.floorEveryStint();
    assert.equal(longestRun(floors, 'Marcus Williams'), 3, 'the plan\'s note is about a run of three');
    const start = floors.findIndex((f, k) => f.includes('Marcus Williams') && !floors[k - 1]?.includes('Marcus Williams')
      && floors[k + 1]?.includes('Marcus Williams') && floors[k + 2]?.includes('Marcus Williams'));
    assert.ok(start >= 0, `Marcus Williams has no run of three in ${JSON.stringify(floors)}`);
    await coach.goToStint(start + 1);
    const floor = await coach.onFloor();
    await coach.tapPlayer('Marcus Williams');
    await coach.tap('Rest of game');
    await coach.tapPlayer((await benchPlayers(floor))[0]);
    const after = await coach.floorEveryStint();
    assert.ok(longestRun(after, 'Marcus Williams') <= 2, 'the swap did not break the run');
    await coach.tap('Leave');
    const notes = await coach.text('#issues');
    assert.ok(lacks(notes, /Marcus Williams plays \d+ stints in a row/));
    assert.deepEqual(saidIn(notes), overIn(after, 2), `the notes say: ${notes}`);
  });

  test('a re-plan that has to run a player past the limit says so', async () => {
    await startHawks({ constraints: rules({ maxConsecutive: 2 }) });
    await toLastStint();
    await coach.addOvertime(8, 'Keep this five');
    const floors = await coach.floorEveryStint();
    await coach.tap('Leave');
    const notes = await coach.text('#issues');

    const over = overIn(floors, 2);
    assert.ok(over.length > 0, 'nobody runs past the limit, so this proves nothing');
    assert.deepEqual(saidIn(notes), over, `the notes say: ${notes}`);
  });
});
