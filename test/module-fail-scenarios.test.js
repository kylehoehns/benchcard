/* #527: a module of the app that fails to load (a weak gym connection) used to
 * leave a coach on a live, empty shell. The page now reloads itself once; if
 * that fails too, the recovery panel shows. Driven in real Chrome through
 * `test/coach.js`: the module is blocked at the network, and the scenarios
 * count how many times the page navigated.
 *
 * Skipped where there is no Chrome, as first-run-scenarios.test.js is. */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';
const wait = ms => new Promise(ok => setTimeout(ok, ms));
const MODULE = 'trap.js';

describe('a module of the app fails to load', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });

  const flag = () => coach.c.send('Runtime.evaluate', { expression: `sessionStorage.getItem('benchcard.reloaded')`, returnByValue: true })
    .then(r => r.result.value);

  test('a module that fails once and then loads: the page reloads once and Today comes up', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE, { failures: 1 });
    await wait(1500);

    assert.equal(coach.navigationCount - before, 2, 'land, then exactly one reload by the app');
    assert.equal(await coach.count('#recover'), 0);
    assert.ok(await coach.count('.today-game') > 0, 'Today is not on screen');
    assert.equal(await flag(), null, 'the reload flag was left behind after a good boot');
  });

  test('a module that fails every time: one reload, then the recovery panel, and nothing more', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE);
    await wait(3000);

    assert.equal(coach.navigationCount - before, 2, 'land, then exactly one reload by the app');
    assert.equal(await coach.text('#recover .alert'), 'Benchcard could not start.');
    assert.ok(await coach.sees('Download my backup'));
    assert.ok(await coach.sees('Reload'));
  });

  test('a normal boot navigates once and leaves no flag', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE, { failures: 0 });
    await wait(1500);

    assert.equal(coach.navigationCount - before, 1, 'the page navigated more than land asked');
    assert.equal(await flag(), null);
  });

  test('a browser that denies session storage: the panel straight away, no reload', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE, { withoutSessionStorage: true });
    await wait(3000);

    assert.equal(coach.navigationCount - before, 1, 'the page reloaded with no way to stop a loop');
    assert.equal(await coach.text('#recover .alert'), 'Benchcard could not start.');
  });
});
