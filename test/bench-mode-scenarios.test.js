/* Bench mode scenarios (#305): while bench mode is open, the page behind it
 * is out of reach for everyone, not only for a screen reader that honors
 * aria-modal, and closing it gives the page back. Read through Chrome's full
 * accessibility tree (`everyControl`), which ignores aria-modal, rather than
 * the driver's usual search, which looks only inside the open overlay. RICH's
 * game day, as game-day-scenarios.test.js has it.
 *
 * Skipped where there is no Chrome, as roster-scenarios.test.js is. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('bench mode keeps the page behind it out of reach', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function startHawks() {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
  }

  test('with bench mode open, the page behind it is out of the full accessibility tree', async () => {
    await startHawks();
    const reach = await coach.everyControl();

    assert.deepEqual(reach.filter(n => n === 'Remove this game'), [], 'a control behind bench mode is reachable');
    assert.deepEqual([...reach].sort(), [...await coach.controls()].sort());
    assert.ok(reach.includes('Leave'));
  });

  test('the undo toast over bench mode stays reachable and works', async () => {
    await startHawks();
    await coach.tapPlayer('Ana Reyes');
    await coach.tapPlayer('Devon Ellis');

    assert.ok((await coach.everyControl()).includes('Undo'));
    await coach.tap('Undo');
    assert.deepEqual(await coach.onFloor(), ['Ana Reyes', 'Casey Lindqvist', 'Hana Kim', 'Nia Brooks', 'Theo Alvarez']);
  });

  test('the shortcuts sheet over bench mode stays reachable and closes back to bench mode', async () => {
    await startHawks();
    await coach.press('?');

    assert.ok((await coach.everyControl()).includes('Close shortcuts'), 'the shortcuts sheet is out of reach');
    await coach.tap('Close shortcuts');
    assert.ok((await coach.everyControl()).includes('Leave'), 'bench mode lost its controls');
  });

  test('leaving bench mode gives the Game screen back', async () => {
    await startHawks();
    await coach.tap('Leave');

    assert.ok((await coach.everyControl()).includes('Remove this game'), 'the Game screen is still out of reach');
    await coach.tap('Remove this game');
    assert.match(await coach.toast(), /^Removed Hawks/);
  });

  test('finishing the game gives the page back, with its Undo toast reachable', async () => {
    await startHawks();
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 20, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
    await coach.tap('Finish game');
    const reach = await coach.everyControl();

    assert.ok(reach.includes('Undo'), 'the Undo toast is out of reach');
    assert.ok(reach.includes('Back to Smoke Test'), 'the page stays out of reach');
  });

  test('a This stint swap says the rest was re-planned, and the moved line counts what moved (#415)', async () => {
    await startHawks();
    await coach.tapPlayer('Ana Reyes');
    await coach.tapPlayer('Devon Ellis');

    assert.equal(await coach.toast(),
      'Devon on for Ana this stint. The rest of the game was re-planned to keep minutes even.');
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 20, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
    const moved = await coach.text('#gmMoved');
    assert.notEqual(moved, '1 stint no longer matches your printed card.');
    assert.match(moved, /^([2-9]|\d\d) stints no longer match your printed card\.$/);
  });

  test('a This stint swap the re-plan leaves alone keeps the plain toast (#415)', async () => {
    await startHawks();
    for (let i = 0; !(await coach.sees('Finish game')); i++) {
      assert.ok(i < 20, 'Finish game never appeared');
      await coach.tap('Next stint');
    }
    await coach.tap('Previous stint');
    // Second-to-last stint: Eli is on at 16 of 16 minutes, Hana is on the bench at 12 of 12.
    // Four minutes move between them and no later stint changes, so the toast is the plain
    // one and names both new totals.
    await coach.tapPlayer('Eli Tran');
    await coach.tapPlayer('Hana Kim');

    assert.equal(await coach.toast(), 'Hana on for Eli this stint. Hana now ends at 16 min, Eli at 12.');
  });

  test('a reload mid-game leaves nothing inert', async () => {
    await startHawks();
    await coach.comeBackDaysLater(0);

    assert.ok((await coach.everyControl()).includes('Remove this game'), 'the page booted inert');
  });
});
