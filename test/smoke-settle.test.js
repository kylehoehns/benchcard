/* #241 review. `TIMER_TRACKER` and `TIMERS_QUIET` (scripts/smoke/dom.mjs) are
 * page-side scripts that decide when a smoke row may read the page; a fault in
 * either makes rows pass or fail on timing alone. They are exercised here in a
 * real Chrome, on a bare page with the tracker registered the way smoke.mjs
 * registers it, so each behavior is judged on its own rather than through
 * whichever row happens to lean on it. Skips where there is no Chrome (#235). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { launch, cdp, closeChrome } from '../scripts/smoke/chrome.mjs';
import { evalIn, SETTLE, TIMER_TRACKER, TIMERS_QUIET, TRACKED_TIMER_MS, SETTLE_CAP_MS } from '../scripts/smoke/dom.mjs';
import { NEEDS_CHROME } from './helpers/smoke-cli.mjs';

let chrome, c, server, origin, pageNo = 0;

/* #481: a history.back() whose traversal the browser runs late, as it does
   under load. When a page sets `window.__lateBackMs`, the real back runs that
   many ms after the call, on the untracked timer; `__lateBacks` counts the
   delayed calls, so a test can see the delay really happened. */
const LATE_BACK = `{
  const back = History.prototype.back;
  window.__lateBacks = 0;
  History.prototype.back = function () {
    const ms = window.__lateBackMs;
    if (!ms) return back.call(this);
    window.__lateBacks++;
    (window.__untrackedTimeout || setTimeout)(() => back.call(this), ms);
  };
}`;

before(async () => {
  if (NEEDS_CHROME.skip) return;
  // A real http origin: Chrome's Navigation API (canGoBack) reports nothing on a data: page.
  server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(`<p>settle test ${req.url}</p>`); });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  origin = `http://127.0.0.1:${server.address().port}`;
  chrome = await launch(0, false);
  c = cdp(chrome.ws);
  await c.ready;
  await c.send('Page.enable');
  // Registered BEFORE the tracker, so the tracker wraps it the way it wraps the
  // browser's own back (see LATE_BACK).
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: LATE_BACK });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: TIMER_TRACKER });
});
after(async () => {
  c?.close();
  server?.close();
  if (chrome) await closeChrome(chrome.proc, chrome.dir);
});

// A fresh window each time, so an override in one test cannot leak into the next.
async function freshPage() {
  const url = `${origin}/${++pageNo}`;
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  // #375: a page that never fires load fails here, by name, not at the test timeout.
  const LOAD_LIMIT = 10_000;
  const never = new Promise((_, no) => setTimeout(() => no(new Error(
    `freshPage: Page.loadEventFired did not arrive within ${LOAD_LIMIT}ms for ${url}`)), LOAD_LIMIT).unref());
  await c.send('Page.navigate', { url });
  await Promise.race([loaded, never]);
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

test('SETTLE and TIMERS_QUIET wait for a late history.back() to land (#481)', { timeout: 30_000, ...NEEDS_CHROME }, async () => {
  await freshPage();
  // Longer than a tracked timer, so only the back itself can hold the wait.
  const late = TRACKED_TIMER_MS + 300;
  await evalIn(c, `window.popped = 0; addEventListener('popstate', () => { window.popped++; }); window.__lateBackMs = ${late}; 0`);
  for (const [name, wait] of [['SETTLE', SETTLE], ['TIMERS_QUIET', TIMERS_QUIET]]) {
    const poppedBefore = await evalIn(c, `history.pushState({ at: Date.now() }, ''); history.back(); window.popped`);
    const { result, ms } = await timed(wait, SETTLE_CAP_MS + 5000);
    if (name === 'TIMERS_QUIET') assert.equal(result, 'quiet');
    assert.equal(await evalIn(c, 'window.popped'), poppedBefore + 1,
      `${name} returned after ${ms}ms, before the popstate of a history.back() delayed ${late}ms`);
  }
  // The arm landed: both backs really were delayed.
  assert.equal(await evalIn(c, 'window.__lateBacks'), 2);
});

test('a history.back() with no entry behind it does not hold the wait (#481)', { timeout: 30_000, ...NEEDS_CHROME }, async () => {
  await freshPage();
  // Drop the earlier tests' entries, so this document is the only one: nothing to go back to.
  await c.send('Page.resetNavigationHistory');
  assert.equal(await evalIn(c, 'navigation.canGoBack'), false, 'the arm failed: there is still an entry behind');
  await evalIn(c, 'history.back(); 0');
  const { result, ms } = await timed(TIMERS_QUIET, SETTLE_CAP_MS + 5000);
  assert.equal(result, 'quiet');
  assert.ok(ms < SETTLE_CAP_MS - 1000, `took ${ms}ms: it waited on a back that had nowhere to go`);
  assert.equal(await evalIn(c, 'window.__pendingBack'), 0);
});
