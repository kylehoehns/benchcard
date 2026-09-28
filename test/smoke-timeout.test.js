/* #178. Two seams live here:
 *
 * - `--timeout` with a missing, zero, negative or non-numeric value must be
 *   refused BEFORE `serve()`/Chrome ever start (spec item 5) — same tripwire
 *   `test/smoke-only.test.js` uses for `--only`: a sandboxed TMPDIR that
 *   stays empty proves Chrome's `--user-data-dir` was never created.
 * - A real hang (`BENCHCARD_SMOKE_HANG` set to a running row's name) must
 *   still end the run, print which check it was on, and leave no Chrome
 *   behind (spec item 4). This is the first `node --test` file that launches
 *   Chrome — see the spec's Proof table footnote.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAST_MS, run, assertNeverLaunchedChrome } from './helpers/smoke-cli.mjs';

// FAST_MS/run/assertNeverLaunchedChrome come from the same shared module
// smoke-only.test.js imports (#178 review: they used to be two copies).

const BAD_TIMEOUTS = ['0', '-1', 'abc', ''];

for (const value of BAD_TIMEOUTS) {
  const args = value === '' ? ['--timeout'] : ['--timeout', value];
  test(`--timeout ${JSON.stringify(value)} is refused before serve()/Chrome`, () => {
    const r = run(args);
    assert.notEqual(r.status, 0, `--timeout ${JSON.stringify(value)} should exit non-zero`);
    assert.ok(r.ms < FAST_MS,
      `took ${r.ms}ms — a bad --timeout value must be refused before serve()/Chrome, not after`);
    assertNeverLaunchedChrome(r, `--timeout ${JSON.stringify(value)}`);
  });
}

/* Spec item 4. A real hang: BENCHCARD_SMOKE_HANG names a running row, and
 * runCheck (per the Design section) runs that row as a CDP
 * `Runtime.evaluate` of `new Promise(() => {})` with `awaitPromise: true`
 * instead of calling its own `run` — Chrome stays alive, the call never
 * returns, and only the watchdog ends it. 45s covers Chrome's own boot (up to
 * 45s, chrome.mjs) plus the 0.5-minute (30s) timeout and its cleanup. */
test('a hung check ends the run: exit 1, names the check, and leaves no Chrome behind', { timeout: 45_000 }, () => {
  const r = run(
    ['--only', 'rich fixture is live', '--timeout', '0.5'],
    { BENCHCARD_SMOKE_HANG: 'rich fixture is live' },
  );
  assert.equal(r.status, 1, `expected exit 1, got ${r.status} — stdout: ${r.stdout} stderr: ${r.stderr}`);
  assert.match(r.stderr, /smoke: timed out after 0\.5 min while running "rich fixture is live"/);
  assertNeverLaunchedChrome(r, 'hung check (post-cleanup)');
});

/* Review finding (quality-reviewer): `liveChrome` in smoke.mjs used to be set
 * only after `launch()` resolved — but `launch()` spawns Chrome immediately
 * and then polls its DevTools port for up to 45s before resolving. A timeout
 * that fires inside that boot window found `liveChrome` still null, skipped
 * `closeChrome`, and left the just-spawned Chrome (and its profile dir)
 * running — the exact orphan the survey found from the old perl wrapper. An
 * absurdly small `--timeout` (0.06s) reliably lands inside that window: real
 * Chrome never exposes a DevTools page that fast. `assertNeverLaunchedChrome`
 * is reused here for what it actually checks post-run — the sandboxed
 * profile dir is empty — which after a real launch only holds if cleanup
 * removed it. */
test('a timeout that fires while Chrome is still booting still closes it — no Chrome left behind', { timeout: 15_000 }, () => {
  const r = run(['--only', 'rich fixture is live', '--timeout', '0.001']);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status} — stdout: ${r.stdout} stderr: ${r.stderr}`);
  assert.match(r.stderr, /smoke: timed out after 0\.001 min while running/);
  assertNeverLaunchedChrome(r, 'timeout during Chrome boot (post-cleanup)');
});
