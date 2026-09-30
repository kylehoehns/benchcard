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
import { hasChrome } from '../../scripts/smoke/chrome.mjs';

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

/* For the cases that DO launch Chrome and must clean up after it. The strict
 * check above cannot be used here: on Linux, Chrome itself makes a
 * `com.google.Chrome.<random>` directory directly in TMPDIR (CI run
 * 36453636698 left exactly one, with no `benchcard-smoke-*` beside it). That
 * directory is Chrome's, not `--user-data-dir`, and Chrome does not remove it
 * on SIGTERM, so it is not ours to clean up. What is ours is the
 * `benchcard-smoke-*` profile dir `launch()` makes, and that must be gone. */
export function assertNoSmokeProfileLeft(r, label) {
  const ours = r.chromeProfileDirs.filter(n => n.startsWith('benchcard-smoke-'));
  assert.deepEqual(ours, [],
    `${label}: Chrome's --user-data-dir was left behind in TMPDIR (${JSON.stringify(ours)}) — ` +
    `closeChrome did not remove it`);
}

/* #235. `npm test` is also Cloudflare's build command (AGENTS.md § Deploy), and
 * its build machine has no Chrome: a `node --test` case that launches one
 * skips there, except on GitHub Actions, where a missing Chrome is a broken
 * runner and must fail rather than quietly drop the coverage. Spread it into a
 * test's options. One copy (#241 review: two files each carried their own). */
export const NEEDS_CHROME = (await hasChrome()) || process.env.GITHUB_ACTIONS
  ? {}
  : { skip: 'no Chrome on this machine (Cloudflare\'s build) — smoke CI runs these' };
