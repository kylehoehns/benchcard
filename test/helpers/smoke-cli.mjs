/* #178 review: `test/smoke-only.test.js` and `test/smoke-timeout.test.js` each
 * carried their own copy of this file (`smoke-timeout.test.js`'s own comment
 * said it "mirrors exactly") — one place for how a `node --test` file spawns
 * `scripts/smoke.mjs` and proves it never launched Chrome, so a change to the
 * shape (a new env var a case needs, a slower CI runner's slack) is made once.
 *
 * The tripwire: `launch()` in `scripts/smoke/chrome.mjs` calls
 * `mkdtemp(join(tmpdir(), 'benchcard-smoke-'))` to make Chrome's
 * `--user-data-dir` before it ever spawns the binary, so a fresh, otherwise-
 * empty directory pointed to by TMPDIR/TMP/TEMP is a tripwire no timer can be
 * fooled by: if Chrome launches at all, this directory stops being empty, no
 * matter how fast. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url);
export const SMOKE = new URL('scripts/smoke.mjs', ROOT).pathname;
export const CWD = new URL('.', ROOT).pathname;

/* Cases that must be refused before `serve()`/Chrome ever start need only a
 * few seconds of slack — enough to cover a slow CI runner without hiding a
 * regression that falls through to a real run. */
export const FAST_MS = 5000;

export function run(args, env = {}) {
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

export function assertNeverLaunchedChrome(r, label) {
  assert.deepEqual(r.chromeProfileDirs, [],
    `${label}: TMPDIR sandbox is not empty (${JSON.stringify(r.chromeProfileDirs)}) — ` +
    `Chrome's --user-data-dir was created here, so validation ran after launch(), not before it`);
}
