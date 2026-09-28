/* #178: the pure half of `scripts/smoke/clock.mjs` -- `buildClockScript`,
 * proved the same way `smoke-font.mjs`'s `buildFontInjectionScript` is
 * (`test/smoke-font.test.js`'s own shape): run the returned script through
 * Node's `vm` module against a controllable, real `Date`-shaped sandbox, and
 * read behavior back, never the source text.
 *
 * Proof row 1 (`docs/specs/178-smoke-deterministic.md`): a `vm` sandbox whose
 * real `Date` starts at `2026-09-27T23:59:30Z` and is then advanced 60
 * seconds (crossing midnight UTC) must still read the pinned day,
 * 2026-09-12, throughout -- the host's clock crossing midnight must never
 * move it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildClockScript, SMOKE_CLOCK, smokeToday } from '../scripts/smoke/clock.mjs';
import { addDays } from '../scripts/smoke/three-days.mjs';
import { FIT_DATE } from '../scripts/smoke/card-at-32.mjs';

const SCRIPT = buildClockScript(SMOKE_CLOCK);

// A real, subclassable `Date` whose `now()` is a controllable fake clock --
// not a hand-rolled stand-in, so every real-`Date` behavior the script's own
// pass-through relies on (`Date.UTC`, `Date.parse`, `new RealDate(y, m, d, h)`
// local-time construction, `toISOString`, ...) still works exactly as it does
// outside the sandbox.
function makeFakeRealDate(startEpochMs) {
  let clockNow = startEpochMs;
  class FakeRealDate extends global.Date {
    static now() { return clockNow; }
    static advance(ms) { clockNow += ms; }
  }
  return FakeRealDate;
}

function run(script, fakeRealDate) {
  const sandbox = { Date: fakeRealDate, globalThis: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox;
}

test('the pinned page clock reads 2026-09-12, and stays there across the host clock\'s own midnight', () => {
  const fakeRealDate = makeFakeRealDate(Date.parse('2026-09-27T23:59:30Z'));
  const sandbox = run(SCRIPT, fakeRealDate);

  const before = new sandbox.Date();
  assert.equal(before.getFullYear(), 2026, 'pinned year, before the host crosses midnight');
  assert.equal(before.getMonth(), 8, 'pinned month (0-based, September), before the host crosses midnight');
  assert.equal(before.getDate(), 12, 'pinned day, before the host crosses midnight');
  assert.equal(sandbox.Date.now(), before.getTime(), 'Date.now() must agree with new Date()');

  fakeRealDate.advance(60_000); // 60s later: the host's real clock is now past midnight UTC

  const after = new sandbox.Date();
  assert.equal(after.getFullYear(), 2026, 'pinned year, after the host crosses midnight');
  assert.equal(after.getMonth(), 8, 'pinned month, after the host crosses midnight');
  assert.equal(after.getDate(), 12, 'pinned day must not have moved to 2026-09-13');
  assert.equal(after.getTime() - before.getTime(), 60_000,
    'the pinned clock still ticks forward by the same 60s the host clock advanced');
});

test('Date.UTC, Date.parse, and a local-parts constructor still behave exactly like the real Date', () => {
  const fakeRealDate = makeFakeRealDate(Date.parse('2026-09-27T23:59:30Z'));
  const sandbox = run(SCRIPT, fakeRealDate);

  assert.equal(sandbox.Date.UTC(2026, 6, 11), Date.UTC(2026, 6, 11), 'Date.UTC must pass through untouched');
  assert.equal(sandbox.Date.parse('2026-07-11'), Date.parse('2026-07-11'), 'Date.parse must pass through untouched');

  const real = new Date(2024, 0, 6);
  const sandboxed = new sandbox.Date(2024, 0, 6);
  assert.equal(sandboxed.getTime(), real.getTime(),
    'new Date(y, m, d) with explicit arguments must construct exactly like the real Date');
});

test('smokeToday() reads the pinned moment: 2026-09-12, 12:00 local', () => {
  const t = smokeToday();
  assert.equal(t.getFullYear(), 2026);
  assert.equal(t.getMonth(), 8);
  assert.equal(t.getDate(), 12);
  assert.equal(t.getHours(), 12);
});

test('three-days.mjs\'s addDays is pinned to 2026-09-12, not the host\'s real today', () => {
  assert.equal(addDays(2), '2026-09-14');
  assert.equal(addDays(4), '2026-09-16');
  assert.equal(addDays(7), '2026-09-19');
});

test('card-at-32.mjs\'s FIT_DATE is the next Wednesday on or after the pinned day: 2026-09-16', () => {
  assert.equal(FIT_DATE, '2026-09-16');
});
