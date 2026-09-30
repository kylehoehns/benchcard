/* #241 review. `TIMER_TRACKER` and `TIMERS_QUIET` (scripts/smoke/dom.mjs) are
 * page-side scripts that decide when a smoke row may read the page; a fault in
 * either makes rows pass or fail on timing alone. They are exercised here in a
 * real Chrome, on a bare page with the tracker registered the way smoke.mjs
 * registers it, so each behavior is judged on its own rather than through
 * whichever row happens to lean on it. Skips where there is no Chrome (#235). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, cdp, closeChrome } from '../scripts/smoke/chrome.mjs';
import { evalIn, SETTLE, TIMER_TRACKER, TIMERS_QUIET, TRACKED_TIMER_MS, SETTLE_CAP_MS } from '../scripts/smoke/dom.mjs';
import { NEEDS_CHROME } from './helpers/smoke-cli.mjs';

let chrome, c, pageNo = 0;

before(async () => {
  if (NEEDS_CHROME.skip) return;
  chrome = await launch(9800 + Math.floor(Math.random() * 150), false);
  c = cdp(chrome.ws);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: TIMER_TRACKER });
});
after(async () => {
  c?.close();
  if (chrome) await closeChrome(chrome.proc, chrome.dir);
});

// A fresh window each time, so an override in one test cannot leak into the next.
async function freshPage() {
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Page.navigate', { url: `data:text/html,<p>settle test ${++pageNo}</p>` });
  await loaded;
}

// Node-side elapsed time and result of one page-side wait. Rejects rather than
// hanging if the wait outlives `limit`, so a stalled wait fails the test.
async function timed(script, limit) {
  const t0 = Date.now();
  const hung = new Promise((_, no) => setTimeout(() => no(new Error(`the wait had not returned after ${limit}ms`)), limit).unref());
  const result = await Promise.race([evalIn(c, script), hung]);
  return { result, ms: Date.now() - t0 };
}

test('TIMERS_QUIET outlasts a 140ms timer', { timeout: 30_000, ...NEEDS_CHROME }, async () => {
  await freshPage();
  await evalIn(c, `window.fired = false; setTimeout(() => { window.fired = true; }, 140); 0`);
  const { result } = await timed(TIMERS_QUIET, 10_000);
  assert.equal(result, 'quiet');
  assert.equal(await evalIn(c, 'window.fired'), true, 'the wait returned before the 140ms timer fired');
});

test('TIMERS_QUIET does not wait for a timer that was cleared', { timeout: 30_000, ...NEEDS_CHROME }, async () => {
  await freshPage();
  const armed = TRACKED_TIMER_MS - 20; // tracked, and long enough that waiting for it shows
  await evalIn(c, `clearTimeout(setTimeout(() => {}, ${armed})); 0`);
  const { result, ms } = await timed(TIMERS_QUIET, 10_000);
  assert.equal(result, 'quiet');
  assert.ok(ms < armed - 100, `took ${ms}ms: it waited on a ${armed}ms timer that was already cleared`);
});

test('TIMERS_QUIET ignores a timer longer than TRACKED_TIMER_MS', { timeout: 30_000, ...NEEDS_CHROME }, async () => {
  await freshPage();
  const long = TRACKED_TIMER_MS + 1500; // a toast's lifetime, say
  await evalIn(c, `setTimeout(() => {}, ${long}); 0`);
  const { result, ms } = await timed(TIMERS_QUIET, 10_000);
  assert.equal(result, 'quiet');
  assert.ok(ms < long - 500, `took ${ms}ms: it waited on a ${long}ms timer, which is over the ${TRACKED_TIMER_MS}ms it tracks`);
});

test('TIMERS_QUIET and SETTLE return within their cap when requestAnimationFrame never fires', { timeout: 30_000, ...NEEDS_CHROME }, async () => {
  await freshPage();
  await evalIn(c, `window.requestAnimationFrame = () => 0; 0`);
  const slack = 1500;
  const q = await timed(TIMERS_QUIET, SETTLE_CAP_MS + slack);
  assert.equal(q.result, 'capped');
  await timed(SETTLE, SETTLE_CAP_MS + slack);
});
