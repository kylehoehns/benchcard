/* Overtime from bench mode (#368, #369): the sheet asks who plays an
 * overtime, and each of the four choices puts its five on the floor. Driven
 * through test/coach.js; RICH's game day (Hawks, 9:00 AM) as
 * bench-mode-scenarios.test.js has it. Split from overtime-scenarios.test.js
 * (#384) so no one file sets the floor for npm test. Skipped where there is
 * no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('choosing who plays overtime', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }

  async function toLastStint() {
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 40, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
  }

  /* #369: who plays an overtime. RICH's Hana Kim is Level 5 and Nia Brooks
     Level 1; the rest are 3. Nothing on screen says so. */
  const WHO = ['Next rotation', 'Even out', 'Keep this five', 'Strongest five'];
  const sorted = names => [...names].sort();

  test('the sheet asks who plays, with four options, Next rotation chosen each time it opens', async () => {
    await startHawks();
    await toLastStint();
    await coach.tap('Tied? Add overtime');

    assert.equal(await coach.text('#overtimeWhoHd'), 'Who plays');
    const controls = await coach.controls();
    assert.deepEqual(controls.filter(n => WHO.includes(n)), WHO, 'the four options, in this order');
    assert.deepEqual(await Promise.all(WHO.map(n => coach.isPressed(n))), [true, false, false, false]);

    await coach.tap('Keep this five');
    assert.deepEqual(await Promise.all(WHO.map(n => coach.isPressed(n))), [false, false, true, false], 'one at a time');
    await coach.press('Escape');
    await coach.tap('Tied? Add overtime');
    assert.deepEqual(await Promise.all(WHO.map(n => coach.isPressed(n))), [true, false, false, false], 'reset on open');
  });

  test('Strongest five puts the Level 5 on the floor for every overtime stint, and nothing shows a Level', async () => {
    await startHawks();
    await toLastStint();
    await coach.tap('Tied? Add overtime');
    assert.doesNotMatch(await coach.text('#sheetOvertime'), /level|tier|go-to|developing/i);
    await coach.tap('Close');
    await coach.addOvertime(8, 'Strongest five');

    const first = await coach.onFloor();
    await coach.tap('Next stint');
    const second = await coach.onFloor();
    assert.deepEqual([first, second].map(f => f.filter(n => n === 'Hana Kim')), [['Hana Kim'], ['Hana Kim']], 'the Level 5 plays both stints');
    assert.deepEqual([...first, ...second].filter(n => n === 'Nia Brooks'), [], 'the Level 1 plays neither');
    assert.deepEqual(sorted(first), sorted(second), 'one five, both stints');
    assert.doesNotMatch(await coach.text('#gamemode'), /level|tier|go-to|developing/i);
  });

  test('Keep this five: both overtime stints have the five from the last stint, a swap there included', async () => {
    await startHawks();
    await toLastStint();
    const [out] = await coach.onFloor();
    await coach.tapPlayer(out);
    const [bench] = await coach.onBench();
    await coach.tapPlayer(bench);
    const kept = await coach.onFloor();
    assert.ok(kept.includes(bench) && !kept.includes(out), 'the premise: the swap is on the floor');

    await coach.addOvertime(8, 'Keep this five');

    assert.deepEqual(sorted(await coach.onFloor()), sorted(kept));
    await coach.tap('Next stint');
    assert.deepEqual(sorted(await coach.onFloor()), sorted(kept));
  });

  test('Even out: the player with the fewest minutes plays a 4-minute overtime, whatever the five just was', async () => {
    await startHawks();
    const regulation = await coach.floorEachStint();
    await coach.addOvertime(4, 'Even out');
    const five = await coach.onFloor();
    assert.equal(five.length, 5);
    const minutes = {};
    for (const floor of regulation) for (const n of floor) minutes[n] = (minutes[n] || 0) + 4;
    const fewest = Math.min(...Object.values(minutes));
    for (const [n, m] of Object.entries(minutes)) {
      if (m === fewest) assert.ok(five.includes(n), `${n} played ${m}, the fewest, and should be on`);
    }
  });

  test('a swap in a pinned stint does not move the next, and Back to the printed plan puts the stored five back', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8, 'Keep this five');
    const five = await coach.onFloor();
    const swapOne = async () => {
      const [on] = await coach.onFloor();
      await coach.tapPlayer(on);
      const [bench] = await coach.onBench();
      await coach.tapPlayer(bench);
      assert.ok((await coach.onFloor()).includes(bench), 'the coach can still swap by hand');
    };
    await swapOne();
    await coach.tap('Next stint');
    assert.deepEqual(sorted(await coach.onFloor()), sorted(five), 'the re-plan leaves the second stint on the five');

    await swapOne();
    await coach.tap('Previous stint');
    await coach.tap('Back to the printed plan');
    await coach.tap('Next stint');
    assert.deepEqual(sorted(await coach.onFloor()), sorted(five), 'Reset sends it back to the stored five');
  });

  test('each overtime keeps its own choice: OT Keep this five, OT2 Strongest five', async () => {
    await startHawks();
    await toLastStint();
    const last = await coach.onFloor();
    await coach.addOvertime(4, 'Keep this five');
    assert.deepEqual(sorted(await coach.onFloor()), sorted(last));

    await coach.addOvertime(4, 'Strongest five');

    assert.equal(await coach.text('#gmGame'), 'OT2 · 4:00 to 0:00');
    const second = await coach.onFloor();
    assert.deepEqual(second.filter(n => n === 'Hana Kim' || n === 'Nia Brooks'), ['Hana Kim']);
    await coach.tap('Previous stint');
    assert.deepEqual(sorted(await coach.onFloor()), sorted(last), 'the first overtime still has its own five');
  });
});
