/* Overtime from bench mode (#368): a tied game on its last stint, the coach
 * taps "Tied? Add overtime", picks a length and bench mode moves on. Driven
 * through test/coach.js; RICH's game day (Hawks, 9:00 AM) as
 * bench-mode-scenarios.test.js has it. Skipped where there is no Chrome. */

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

  /* Bench mode's floor as it reads: `{ name: minutes played }` from rows such
     as "3, Ana Reyes, 12 of 16 minutes". */
  async function playedOnFloor() {
    const rows = (await coach.controls()).map(n => /^\d+, (.+?), ([\d.]+) of [\d.]+ minutes/.exec(n)).filter(Boolean);
    return Object.fromEntries(rows.map(m => [m[1], Number(m[2])]));
  }

  test('overtime minutes count as played, and reopening lands on the same overtime stint with the same five', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    const first = await playedOnFloor();
    const fiveFirst = await coach.onFloor();
    await coach.tap('Next stint');
    const second = await playedOnFloor();
    for (const name of fiveFirst.filter(n => n in second)) {
      assert.equal(second[name], first[name] + 4, `${name} played the first four overtime minutes`);
    }
    assert.ok(fiveFirst.some(n => n in second), 'someone stays on for both overtime stints');

    const five = await coach.onFloor();
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(0);
    await coach.tap('Hawks · OT 4:00 · Resume');

    assert.equal(await coach.stint(), '10 of 10');
    assert.equal(await coach.text('#gmGame'), 'OT · 4:00 to 0:00');
    assert.deepEqual(await coach.onFloor(), five);
  });

  test('the filed game carries the overtime minutes into the season', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(1);
    await coach.tap('Season 1 game filed ›');

    const minutes = await coach.seasonMinutes();
    assert.equal(Object.values(minutes).reduce((a, b) => a + b, 0), 200,
      'four quarters of 8 minutes and 8 of overtime, five on the floor');
    const mean = 200 / 11;
    const standing = await coach.seasonStanding();
    for (const [name, m] of Object.entries(minutes)) {
      assert.match(standing[name], m < mean ? /behind$/ : /ahead$/, `${name} played ${m} against a share of ${mean.toFixed(1)}`);
    }
  });

  test('a later game the same day is evened out against the overtime minutes', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(8);
    await coach.tap('Next stint');
    await coach.tap('Finish game');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, finished');
    const hawks = await coach.planMinutes();
    const fewest = Math.min(...Object.values(hawks)), most = Math.max(...Object.values(hawks));
    const owed = Object.keys(hawks).filter(n => hawks[n] === fewest);
    const full = Object.keys(hawks).filter(n => hawks[n] === most);
    assert.ok(fewest < most, 'the Hawks game is uneven, so there is something to even out');
    assert.equal(Object.values(hawks).reduce((a, b) => a + b, 0), 200, 'the Plan counts the overtime');
    await coach.tap('Back to Smoke Test');

    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('Even out earlier games');
    await coach.tap('Close');

    const ravens = await coach.planMinutes();
    const least = Math.min(...owed.map(n => ravens[n]));
    const topFull = Math.max(...full.map(n => ravens[n]));
    assert.ok(least > topFull, `everyone who had ${fewest} now has more than anyone who had ${most}: ${JSON.stringify(ravens)}`);
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

  test('the length a team added last is offered next time, after a reopen, and 2 before any', async () => {
    await startHawks();
    await toLastStint();
    await coach.addOvertime(3);
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(0);
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap('Start game');
    await toLastStint();
    await coach.tap('Tied? Add overtime');

    assert.equal(await coach.valueOf('Minutes'), '3');
  });

  test('By hand: overtime goes to those who played least, regulation and the saved targets stay as they were', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('By hand');
    const names = (await coach.controls()).filter(n => n.startsWith('Target minutes for ')).map(n => n.slice('Target minutes for '.length));
    const targets = async () => Object.fromEntries(await Promise.all(names.map(async n => [n, await coach.valueOf(`Target minutes for ${n}`)])));
    const saved = await targets();
    await coach.tap('Close');
    await coach.tap('Start game');

    const regulation = await coach.floorEachStint();
    const played = Object.fromEntries(names.map(n => [n, 4 * regulation.filter(f => f.includes(n)).length]));
    await coach.addOvertime(8);

    assert.equal(await coach.toast(), 'Overtime added, 8 min.', 'no rotation-moved notice');
    const fewest = Math.min(...Object.values(played));
    const lightest = names.filter(n => played[n] === fewest);
    const floor = await coach.onFloor();
    assert.ok(lightest.every(n => floor.includes(n)), `${lightest} played ${fewest} and should open overtime: ${floor}`);
    assert.deepEqual((await floorsBackwards()).slice(0, regulation.length), regulation);

    await coach.tap('Leave');
    await coach.tap('Plan, minutes set by hand');
    assert.deepEqual(await targets(), saved);
  });

  test('By hand: after overtime no row claims it plays something other than its target', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Plan, even minutes');
    await coach.tap('By hand');
    await coach.tap('Close');
    await coach.tap('Start game');
    await coach.floorEachStint();
    await coach.addOvertime(8);
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.comeBackDaysLater(0);
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap('Plan, minutes set by hand');
    assert.equal(await coach.text('.srow .act:not([hidden])'), '', 'a row says it plays other than it was set to');
  });

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

  for (const who of WHO) {
    test(`${who}: reopening the app lands on the same overtime five`, async () => {
      await startHawks();
      await toLastStint();
      await coach.addOvertime(8, who);
      await coach.tap('Next stint');
      const five = await coach.onFloor();
      await coach.tap('Leave');
      await coach.tap('Back to Smoke Test');
      await coach.comeBackDaysLater(0);
      await coach.tap('Hawks · OT 4:00 · Resume');

      assert.equal(await coach.stint(), '10 of 10');
      assert.deepEqual(await coach.onFloor(), five);
    });

    test(`${who}: Undo takes the overtime back exactly`, async () => {
      await startHawks();
      await coach.tapPlayer('Ana Reyes');
      await coach.tapPlayer('Devon Ellis');
      await toLastStint();
      const floors = await coach.floorEachStint();
      await coach.addOvertime(8, who);
      await coach.tap('Undo');

      assert.equal(await coach.stint(), '8 of 8');
      assert.deepEqual(await coach.floorEachStint(), floors);
      assert.ok(await coach.sees('Tied? Add overtime'));
    });
  }

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
