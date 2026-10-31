/* Overtime from bench mode (#368, #369): a tied game on its last stint, the
 * coach taps "Tied? Add overtime", picks a length and bench mode moves on;
 * Undo takes it back. Driven through test/coach.js; RICH's game day (Hawks,
 * 9:00 AM) as bench-mode-scenarios.test.js has it. Split from
 * overtime-scenarios.test.js (#384) so no one file sets the floor for npm
 * test. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('adding overtime from bench mode', { skip }, () => {
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

  test('only the last stint offers the button, in the Next box and not the footer', async () => {
    await startHawks();
    assert.equal(await coach.sees('Tied? Add overtime'), false, 'offered on the first stint');
    await coach.tap('Next stint');
    assert.equal(await coach.sees('Tied? Add overtime'), false, 'offered on the second stint');
    await toLastStint();
    assert.equal(await coach.sees('Tied? Add overtime'), true);
    assert.match(await coach.text('#gmNext'), /Tied\? Add overtime/);
  });

  test('the sheet is titled Overtime and offers 2 minutes to a team that never had any', async () => {
    await startHawks();
    await toLastStint();
    await coach.tap('Tied? Add overtime');

    assert.equal(await coach.text('#sheetOvertimeTitle'), 'Overtime');
    assert.equal(await coach.valueOf('Minutes'), '2');
    assert.equal(await coach.isDisabled('Add overtime'), false);
  });

  test('a length of 0, 11, blank or 2.5 cannot be added; 1 and 10 can', async () => {
    await startHawks();
    await toLastStint();
    await coach.tap('Tied? Add overtime');

    const disabled = {};
    for (const text of ['0', '11', '2.5', '1', '10']) {
      await coach.fill('Minutes', text);
      disabled[text] = await coach.isDisabled('Add overtime');
    }
    await coach.fill('Minutes', '');
    disabled.blank = await coach.isDisabled('Add overtime');
    assert.deepEqual(disabled, { 0: true, 11: true, 2.5: true, 1: false, 10: false, blank: true });
  });

  /* Bench mode walked from the last stint back to the first: who is on the
     floor in each, first stint first. */
  async function floorsBackwards() {
    const floors = [];
    for (;;) {
      floors.unshift(await coach.onFloor());
      if (await coach.isDisabled('Previous stint')) return floors;
      await coach.tap('Previous stint');
    }
  }

  test('adding 8 minutes lands on the first overtime stint and leaves regulation as it was', async () => {
    await startHawks();
    const regulation = await coach.floorEachStint();
    await coach.addOvertime(8);

    assert.equal(await coach.text('#gmGame'), 'OT · 8:00 to 4:00');
    assert.equal(await coach.toast(), 'Overtime added, 8 min.');
    assert.ok(await coach.sees('Undo'));
    assert.equal(await coach.onFloor().then(f => f.length), 5);
    assert.equal(await coach.stint(), '9 of 10', 'eight minutes at every 4 is two stints');
    const walked = await floorsBackwards();
    assert.deepEqual(walked.slice(0, regulation.length), regulation);
  });

  test('2 minutes of overtime at 4× a period is one overtime stint, not four (#404)', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Sub interval, every 4 min');
    await coach.tap('4× a period');
    await coach.tap('Close');
    await coach.tap('Start game');
    await toLastStint();
    assert.equal(await coach.stint(), '16 of 16');

    await coach.addOvertime(2);

    assert.equal(await coach.text('#gmGame'), 'OT · 2:00 to 0:00');
    assert.equal(await coach.stint(), '17 of 17', 'one overtime stint, not four');
    assert.equal(await coach.sees('Next stint'), false, 'no further stint after it');
    assert.ok(await coach.sees('Finish game'));
  });

  test('Undo takes the overtime back: last regulation stint, same minutes, button back', async () => {
    await startHawks();
    await coach.tapPlayer('Ana Reyes');
    await coach.tapPlayer('Devon Ellis');
    await toLastStint();
    const rows = async () => (await coach.controls()).filter(n => n !== 'Undo' && n !== 'Dismiss');
    const before = await rows();
    const floors = await coach.floorEachStint();
    await coach.addOvertime(8);
    assert.equal(await coach.stint(), '9 of 10');

    await coach.tap('Undo');

    assert.equal(await coach.stint(), '8 of 8');
    assert.equal(await coach.text('#gmGame'), 'Q4 · 4:00 to 0:00');
    assert.deepEqual(await rows(), before);
    assert.deepEqual(await coach.floorEachStint(), floors);
    assert.ok(await coach.sees('Tied? Add overtime'));
  });

  test('a swap made in overtime works as in any stint', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    const [out] = await coach.onFloor();
    await coach.tapPlayer(out);          // bench rows are buttons only once someone is picked
    const [bench] = await coach.onBench();
    await coach.tapPlayer(bench);

    const floor = await coach.onFloor();
    assert.ok(floor.includes(bench) && !floor.includes(out), `${bench} should replace ${out}: ${floor}`);
    assert.equal(await coach.text('#gmGame'), 'OT · 8:00 to 4:00');
  });

  test('on the last overtime stint the button is back, and a second overtime is OT2', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    assert.equal(await coach.sees('Tied? Add overtime'), false, 'offered on the first overtime stint of two');
    await coach.tap('Next stint');
    assert.equal(await coach.sees('Tied? Add overtime'), true);

    await coach.addOvertime(4);

    assert.equal(await coach.text('#gmGame'), 'OT2 · 4:00 to 0:00');
    assert.equal(await coach.stint(), '11 of 11');
  });

  test('after four overtimes the last stint no longer offers another', async () => {
    await startHawks();
    await toLastStint();
    for (let n = 1; n <= 3; n++) {
      await coach.addOvertime(4);
      assert.ok(await coach.sees('Tied? Add overtime'), `missing after overtime ${n}`);
    }
    await coach.addOvertime(4);

    assert.equal(await coach.text('#gmGame'), 'OT4 · 4:00 to 0:00');
    assert.equal(await coach.sees('Tied? Add overtime'), false, 'a fifth overtime would be lost on reload');
  });

  test('Escape closes the overtime sheet and leaves bench mode open', async () => {
    await startHawks();
    await toLastStint();
    await coach.tap('Tied? Add overtime');
    assert.ok(await coach.sees('Add overtime'), 'the sheet should be open');

    await coach.press('Escape');

    assert.equal(await coach.sees('Add overtime'), false, 'the sheet should have closed');
    assert.equal(await coach.stint(), '8 of 8', 'bench mode should still be open');
    assert.ok(await coach.sees('Tied? Add overtime'));
  });

  test('after adding overtime, focus lands on a player on the new stint, not on the page behind', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);

    const focused = await coach.focused();
    const floor = await coach.onFloor();
    assert.ok(floor.some(name => focused.includes(name)), `focus is on "${focused}", not a player on the floor`);
  });

  test('Undo after adding overtime also puts the remembered length back', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(7);
    await coach.tap('Undo');
    await coach.tap('Tied? Add overtime');

    assert.equal(await coach.valueOf('Minutes'), '2');
  });

  test('Undo after Finish game brings the overtime button back', async () => {
    await startHawks();
    await toLastStint();
    await coach.tap('Finish game');
    await coach.tap('Undo');
    await coach.tap('Resume · Q4 4:00');

    assert.equal(await coach.stint(), '8 of 8');
    assert.ok(await coach.sees('Tied? Add overtime'));
  });
});
