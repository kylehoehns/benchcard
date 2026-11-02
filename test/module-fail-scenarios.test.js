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
import { RELOAD_FLAG } from '../scripts/smoke/page-state.mjs';

const skip = !(await hasChrome()) && 'no Chrome on this machine';
const wait = ms => new Promise(ok => setTimeout(ok, ms));
const MODULE = 'trap.js';
/* Poll for the end state, then watch a quiet window: "no further navigation". */
const until = async (what, fn) => {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await wait(50); }
  throw new Error(`${what}: nothing happened in 5 seconds`);
};
const QUIET = 800;

describe('a module of the app fails to load', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });

  const flag = () => coach.c.send('Runtime.evaluate', { expression: `sessionStorage.getItem(${JSON.stringify(RELOAD_FLAG)})`, returnByValue: true })
    .then(r => r.result.value);

  test('a module that fails once and then loads: the page reloads once and Today comes up', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE, { failures: 1 });
    await until('Today never came up with the flag cleared', async () => await coach.count('.today-game') > 0 && await flag() === null);
    await wait(QUIET);

    assert.equal(coach.navigationCount - before, 2, 'land, then exactly one reload by the app');
    assert.equal(await coach.count('#recover'), 0);
    assert.ok(await coach.count('.today-game') > 0, 'Today is not on screen');
    assert.equal(await flag(), null, 'the reload flag was left behind after a good boot');
  });

  test('a module that fails every time: one reload, then the recovery panel, and nothing more', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE);
    await until('the recovery panel never showed', async () => await coach.count('#recover') > 0);
    await wait(QUIET);

    assert.equal(coach.navigationCount - before, 2, 'land, then exactly one reload by the app');
    assert.equal(await coach.text('#recover .alert'), 'Benchcard could not start.');
    assert.ok(await coach.sees('Download my backup'));
    assert.ok(await coach.sees('Reload'));
  });

  test('a boot that waits on a shared link still clears the flag', async () => {
    await coach.onGameDayWithBrokenModule(MODULE, { failures: 0 });
    await coach.c.send('Runtime.evaluate', { expression: `sessionStorage.setItem(${JSON.stringify(RELOAD_FLAG)}, '1')` });
    /* app.js awaits handoff.js and the decode before it boots, so window load
       fires first: the flag has to go on the app.js script's own load. */
    const { c } = coach;
    const slow = p => setTimeout(() => c.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {}), 800);
    c.on('Fetch.requestPaused', slow);
    await c.send('Network.setBypassServiceWorker', { bypass: true });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*handoff.js', requestStage: 'Request' }] });
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: `${coach.origin}/?shared=1#p=damaged` });
    await loaded;
    for (let i = 0; i < 100; i++) {
      const r = await coach.c.send('Runtime.evaluate', { expression: 'window.benchcard && window.benchcard.booted', returnByValue: true });
      if (r.result.value) break;
      await wait(50);
    }
    await c.send('Fetch.disable');
    await c.send('Network.setBypassServiceWorker', { bypass: false });
    c.off('Fetch.requestPaused', slow);
    assert.equal(await flag(), null, 'the reload flag was left behind by a boot that awaited a shared link');
  });

  test('a normal boot navigates once and leaves no flag', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE, { failures: 0 });
    await until('Today never came up', async () => await coach.count('.today-game') > 0);
    await wait(QUIET);

    assert.equal(coach.navigationCount - before, 1, 'the page navigated more than land asked');
    assert.equal(await flag(), null);
  });

  test('a browser that denies session storage: the panel straight away, no reload', async () => {
    const before = coach.navigationCount;
    await coach.onGameDayWithBrokenModule(MODULE, { withoutSessionStorage: true });
    await until('the recovery panel never showed', async () => await coach.count('#recover') > 0);
    await wait(QUIET);

    const r = await coach.c.send('Runtime.evaluate', { returnByValue: true,
      expression: `(() => { try { sessionStorage.getItem('x'); return 'allowed'; } catch { return 'denied'; } })()` });
    assert.equal(r.result.value, 'denied', 'the scenario did not deny session storage');
    assert.equal(coach.navigationCount - before, 1, 'the page reloaded with no way to stop a loop');
    assert.equal(await coach.text('#recover .alert'), 'Benchcard could not start.');
  });
});
