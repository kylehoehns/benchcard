import { evalIn, step } from './dom.mjs';
import { nameOf } from './registry.mjs';

/* #20: hold a screen wake lock while bench mode is on screen, release it the
   moment it is not. `navigator.wakeLock` is replaced in-page with a fake that
   counts `request('screen')` calls and hands back sentinels whose `release()`
   flips `released` -- real `WakeLockSentinel`s do the same. Seven scenarios,
   each its own assertion so a failure names the numbers instead of "it broke
   somewhere". Runs on the RICH fixture, after `fixturePass`, and reloads it
   (`goRich`) on the way out so nothing downstream inherits the stub. */
export async function wakeLockPass(c, origin, consoleErrors) {
  const problems = [];
  const nums = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  /* `mode`: 'immediate' resolves the request on the spot, 'deferred' parks it
     in `window.__wl.pending` until `resolveOne()` is called, 'reject' turns
     every request into a rejected NotAllowedError -- the one real rejection
     reason a coach's browser gives for this API.

     Headless Chrome ships its own `navigator.wakeLock` (a [SameObject]
     readonly accessor on `Navigator.prototype`), so a plain
     `navigator.wakeLock = {...}` is a silent no-op in sloppy-mode script --
     the assignment has no setter to run and CDP's top-level eval is not
     strict. `Object.defineProperty` on the `navigator` instance shadows it
     with an own property instead, which works regardless. */
  const install = mode => evalIn(c, `(() => {
    window.__wlAllTypes = window.__wlAllTypes || [];
    window.__wl = { requests: 0, granted: [], pending: [], mode: ${JSON.stringify(mode)} };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
      request(type) {
        window.__wl.requests++;
        window.__wlAllTypes.push(type);
        if (window.__wl.mode === 'reject') {
          return Promise.reject(new DOMException('denied by the test stub', 'NotAllowedError'));
        }
        const s = { released: false, release() {
          if (window.__wl.mode === 'reject-release') {
            return Promise.reject(new DOMException('release failed by the test stub', 'AbortError'));
          }
          this.released = true;
          return Promise.resolve();
        } };
        window.__wl.granted.push(s);
        if (window.__wl.mode === 'deferred') {
          return new Promise(resolve => window.__wl.pending.push({ resolve: () => resolve(s) }));
        }
        return Promise.resolve(s);
      },
    } });
    return 1;
  })()`);

  // Resolves the oldest still-pending request, then yields a turn so the
  // page's own `.then` runs before we read state back out.
  const resolveOne = () => evalIn(c, `(async () => {
    const p = window.__wl.pending.shift();
    if (!p) return false;
    p.resolve();
    await new Promise(r => setTimeout(r, 0));
    return true;
  })()`);

  const wl = () => evalIn(c, `JSON.stringify({
    requests: window.__wl.requests,
    granted: window.__wl.granted.length,
    unreleased: window.__wl.granted.filter(x => !x.released).length,
  })`).then(JSON.parse);

  // The browser drops the lock silently on hide; there is no event for it
  // beyond `visibilitychange` itself, so the fake mimics the drop by hand and
  // this shadows `document.visibilityState` to drive the listener both ways.
  const setVisibility = v => evalIn(c, `(() => {
    Object.defineProperty(document, 'visibilityState',
      { configurable: true, get: () => ${JSON.stringify(v)} });
    document.dispatchEvent(new Event('visibilitychange'));
    return 1;
  })()`);

  // The three controls every scenario below drives, plus the one bit of DOM
  // state ("is bench mode still open") more than one of them reads back.
  const click = sel => evalIn(c, step(`$('${sel}').click()`));
  const openGM = () => click('#gmOpen');
  const closeGM = () => click('#gmClose');
  const nextGM = () => click('#gmNext2');
  const gmHidden = () => evalIn(c, `document.querySelector('#gamemode').hidden`);

  // 1. open -> one request, sentinel held; close -> that sentinel released.
  await install('immediate');
  await openGM();
  let s = await wl();
  need(s.requests === 1, `open: expected 1 request, got ${s.requests}`);
  need(s.unreleased === 1, `open: expected the sentinel held, ${s.unreleased} unreleased of ${s.granted}`);
  const openLine = `open → ${s.requests} request, ${s.unreleased} unreleased`;
  await closeGM();
  s = await wl();
  need(s.unreleased === 0, `close: expected the sentinel released, ${s.unreleased} unreleased of ${s.granted}`);
  nums.push(`${openLine}; close → ${s.unreleased} unreleased of ${s.granted}`);

  // 2. Escape closes too, and also releases.
  await openGM();
  await evalIn(c, step(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`));
  const gmHiddenAfterEsc = await gmHidden();
  s = await wl();
  need(gmHiddenAfterEsc === true, `Escape: expected #gamemode hidden, hidden=${gmHiddenAfterEsc}`);
  need(s.unreleased === 0, `Escape: expected released, ${s.unreleased} unreleased of ${s.granted}`);
  nums.push(`Escape → hidden=${gmHiddenAfterEsc}, ${s.unreleased} unreleased of ${s.granted}`);

  // 3. background then foreground: the browser drops the lock on hide (marked
  // by hand here, as it would be), 'hidden' asks for nothing, 'visible' asks
  // once more -> 2 requests total; after close, 'visible' asks for nothing.
  await install('immediate');
  await openGM();
  const dropped = await evalIn(c, `(() => {
    const s = window.__wl.granted.at(-1);
    if (!s) return false;
    s.released = true;
    return true;
  })()`);
  need(dropped, 'hide→visible: no sentinel granted to drop');
  await setVisibility('hidden');
  s = await wl();
  need(s.requests === 1, `visibilitychange hidden: expected still 1 request, got ${s.requests}`);
  await setVisibility('visible');
  s = await wl();
  need(s.requests === 2, `visibilitychange visible: expected 2 requests total, got ${s.requests}`);
  need(s.unreleased === 1, `visibilitychange visible: expected a held sentinel, ${s.unreleased} unreleased of ${s.granted}`);
  await closeGM();
  await setVisibility('visible');
  s = await wl();
  need(s.requests === 2, `visible after close: expected still 2 requests, got ${s.requests}`);
  nums.push(`hide→visible → ${s.requests} requests total, still ${s.requests} after a post-close visible`);

  // 4. a late grant is not kept: request resolves after close -> released.
  await install('deferred');
  await openGM();
  await closeGM();
  await resolveOne();
  s = await wl();
  need(s.granted === 1 && s.unreleased === 0,
    `late grant: expected the late sentinel released, ${s.unreleased} unreleased of ${s.granted}`);
  nums.push(`late grant → ${s.unreleased} unreleased of ${s.granted} after resolving post-close`);

  // 5. close-then-reopen race: two deferred requests in flight at once, both
  // resolved while reopened. Not written explicitly in the spec's "What would
  // settle it" -- included because `keepAwake` decides whether to keep a
  // grant from the DOM's current hidden state, not from which open asked for
  // it, so a grant from the first open can overwrite the reference to a grant
  // from the first open that a second open already replaced.
  await install('deferred');
  await openGM();
  await closeGM();
  await openGM();
  await resolveOne();
  await resolveOne();
  s = await wl();
  const whileOpenUnreleased = s.unreleased;
  need(s.unreleased <= 1, `reopen race, while open: ${s.unreleased} unreleased of ${s.granted}, want ≤ 1`);
  await closeGM();
  s = await wl();
  need(s.unreleased === 0, `reopen race, after final close: ${s.unreleased} unreleased of ${s.granted}, want 0`);
  nums.push(`reopen race → ${s.granted} granted, ${whileOpenUnreleased} unreleased while open, `
    + `${s.unreleased} unreleased after final close`);

  // 6. silent where unsupported: no wake lock, and separately a rejecting
  // request. Open, Next, close all still work; #gamemode ends hidden; no
  // console error or exception either way.
  const errBefore6a = consoleErrors.length;
  // Shadow with an explicit `undefined` rather than `delete`: deleting our
  // own shadow property would just uncover the real accessor underneath
  // (headless Chrome ships a real navigator.wakeLock), not remove the API.
  await evalIn(c, `(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    return 1;
  })()`);
  await openGM();
  await nextGM();
  await closeGM();
  const hidden6a = await gmHidden();
  need(hidden6a === true, `undefined wakeLock: expected #gamemode hidden after close, hidden=${hidden6a}`);
  need(consoleErrors.length === errBefore6a,
    `undefined wakeLock: ${consoleErrors.length - errBefore6a} console error(s)/exception(s)`);

  await install('reject');
  const errBefore6b = consoleErrors.length;
  await openGM();
  await nextGM();
  await closeGM();
  const hidden6b = await gmHidden();
  s = await wl();
  need(hidden6b === true, `rejecting stub: expected #gamemode hidden after close, hidden=${hidden6b}`);
  need(consoleErrors.length === errBefore6b,
    `rejecting stub: ${consoleErrors.length - errBefore6b} console error(s)/exception(s)`);
  nums.push(`unsupported (deleted) then rejecting (${s.requests} request attempted) → `
    + `open/Next/close fine, 0 new console errors either way`);

  // 7. release() rejecting: releaseQuietly's own catch must swallow it, the
  // same way the rejecting-request stub above exercises the request catch. A
  // missing catch here would surface as an unhandled rejection.
  await install('reject-release');
  const errBefore7 = consoleErrors.length;
  await openGM();
  await closeGM();
  const hidden7 = await gmHidden();
  need(hidden7 === true, `rejecting release: expected #gamemode hidden after close, hidden=${hidden7}`);
  need(consoleErrors.length === errBefore7,
    `rejecting release: ${consoleErrors.length - errBefore7} console error(s)/exception(s)`);
  nums.push(`rejecting release → open/close fine, 0 new console errors`);

  // Every request across every scenario above asked for the 'screen' lock,
  // never anything else -- request(type) is recorded, not ignored.
  const types = await evalIn(c, `JSON.stringify(window.__wlAllTypes || [])`).then(JSON.parse);
  need(types.length > 0 && types.every(t => t === 'screen'),
    `request type: expected every request to ask for 'screen', got ${JSON.stringify(types)}`);
  nums.push(`${types.length} request(s) across all scenarios, all type 'screen'`);

  return {
    name: nameOf('wakelock'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.join(' | ')}`
      : nums.join(' | '),
  };
}
