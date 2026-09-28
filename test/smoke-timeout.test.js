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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const SMOKE = new URL('scripts/smoke.mjs', ROOT).pathname;
const CWD = new URL('.', ROOT).pathname;

// Mirrors smoke-only.test.js's FAST_MS/run/assertNeverLaunchedChrome exactly:
// the bad-value cases must be refused before serve()/Chrome, so a few
// seconds of slack still catches a regression that falls through to a real
// run without waiting out a 45s Chrome-launch timeout to see it.
const FAST_MS = 5000;

function run(args, env = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), 'ci-guard-'));
  const start = Date.now();
  let status = 0, stdout = '', stderr = '';
  try {
    stdout = execFileSync(process.execPath, [SMOKE, ...args], {
      cwd: CWD,
      encoding: 'utf8',
      env: { ...process.env, ...env, TMPDIR: sandbox, TMP: sandbox, TEMP: sandbox },
    });
  } catch (e) {
    status = e.status;
    stdout = e.stdout ?? '';
    stderr = e.stderr ?? '';
  }
  const ms = Date.now() - start;
  const chromeProfileDirs = readdirSync(sandbox);
  rmSync(sandbox, { recursive: true, force: true });
  return { status, stdout, stderr, ms, chromeProfileDirs };
}

function assertNeverLaunchedChrome(r, label) {
  assert.deepEqual(r.chromeProfileDirs, [],
    `${label}: TMPDIR sandbox is not empty (${JSON.stringify(r.chromeProfileDirs)}) — ` +
    `Chrome's --user-data-dir was created here, so validation ran after launch(), not before it`);
}

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
