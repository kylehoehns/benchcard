/* `--only` has to refuse an unknown or non-selectable name, and the
 * `--update-budgets` combination, BEFORE `serve()` or Chrome ever start — see
 * `scripts/smoke.mjs`'s own comment on `ONLY_NAME`. That is what makes these
 * three cases (spec #40, "What would settle it" 3, 4, 7) testable from here at
 * all: every other row in the registry needs a served `app/` and a real
 * browser, which is out of scope for `node --test`.
 *
 * The valid-name list is read back from the harness's own refusal message
 * rather than typed out again here — REGISTRY lives in `smoke.mjs` and is not
 * exported, and a second, hand-typed copy of the 20 names would drift from it
 * exactly the way `test/hooks.test.js`'s comment warns a guard can. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const SMOKE = new URL('scripts/smoke.mjs', ROOT).pathname;
const CWD = new URL('.', ROOT).pathname;

/* All three cases below exit before `serve()` runs, so none of this should
 * ever approach a Chrome launch (45s timeout) or even a static server. A few
 * seconds of slack covers a slow CI runner without hiding a regression that
 * makes `--only` fall through to the real run. */
const FAST_MS = 5000;

/* The 5s timer above only catches a launch slow enough to blow the deadline —
 * a launch-then-kill, or a launch that happens to come up fast on this
 * machine, still finishes inside 5s and would pass it. `launch()` in
 * `scripts/smoke/chrome.mjs` calls `mkdtemp(join(tmpdir(), 'benchcard-smoke-'))`
 * to make Chrome's `--user-data-dir` before it ever spawns the binary, so a
 * fresh, otherwise-empty directory pointed to by TMPDIR/TMP/TEMP is a tripwire
 * no timer can be fooled by: if Chrome launches at all, this directory stops
 * being empty, no matter how fast. */
function run(args) {
  const sandbox = mkdtempSync(join(tmpdir(), 'ci-guard-'));
  const start = Date.now();
  let status = 0, stdout = '', stderr = '';
  try {
    stdout = execFileSync(process.execPath, [SMOKE, ...args], {
      cwd: CWD,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: sandbox, TMP: sandbox, TEMP: sandbox },
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

const TABLE_HEADER = /benchcard smoke —/;

const invalid = run(['--only', 'nope']);
const validNames = invalid.status
  ? invalid.stderr.trim().split('\n').slice(1).map(l => l.trim()).filter(Boolean)
  : [];

test('--only "nope" exits non-zero, fast, with no table', () => {
  assert.notEqual(invalid.status, 0);
  assert.ok(invalid.ms < FAST_MS,
    `took ${invalid.ms}ms — an unknown --only name must be refused before serve()/Chrome, not after`);
  assert.doesNotMatch(invalid.stdout + invalid.stderr, TABLE_HEADER);
  assertNeverLaunchedChrome(invalid, '--only "nope"');
});

test('the refusal lists the 40 selectable rows, one per line', () => {
  // 40 since #35, which added `widelayout` (scripts/smoke/wide-layout.mjs) to
  // REGISTRY — was 39 after #34's `resumebar`, 38 after #33's `focusclear`
  // and `floatingcontrols`, 36 after #32's `addgameflow`, and 35 after #31's
  // `teamscreen`.
  assert.equal(validNames.length, 40,
    `expected the 40 --only-able rows, got ${validNames.length}: ${JSON.stringify(validNames)}`);
  // one per line, not comma-joined or wrapped
  assert.equal(new Set(validNames).size, validNames.length, 'a duplicated row name in the list');
});

test('the swept touch check is in the list; the single-viewport one is not', () => {
  // Constraint: `touch targets ≥ 44px` (no width range) is filtered out of
  // every full run and is therefore not a name `--only` can ever match, while
  // the swept `touch targets ≥ 44px, 320–390px` is one of the 16.
  assert.ok(validNames.some(n => n.startsWith('touch targets ≥ 44px,')),
    'the swept touch row should be selectable');
  assert.ok(!validNames.includes('touch targets ≥ 44px'),
    'the single-viewport touch row is filtered from every full run and must not be a valid --only name');
});

/* Spec #40, item 4: `no console errors`, the three budget rows and
 * `node --test` are refused the same way as an unknown name. These six are
 * fixed literals in the registry (none of them come from a computed
 * constant), so pinning them here is the same kind of pin `budgets.mjs`'s
 * three names already get in `scripts/smoke.mjs`'s own comment. */
const NON_SELECTABLE = [
  'no console errors',
  'initial payload ≤ budget',
  'request count ≤ budget',
  'DOM nodes ≤ budget',
  'node --test',
  'touch targets ≥ 44px',
];

for (const name of NON_SELECTABLE) {
  test(`--only "${name}" is refused: not a selectable row`, () => {
    const r = run(['--only', name]);
    assert.notEqual(r.status, 0, `--only "${name}" should exit non-zero`);
    assert.ok(r.ms < FAST_MS, `took ${r.ms}ms — refusing "${name}" must not reach serve()/Chrome`);
    assert.doesNotMatch(r.stdout + r.stderr, TABLE_HEADER, `--only "${name}" must never print a table`);
    const names = r.stderr.trim().split('\n').slice(1).map(l => l.trim()).filter(Boolean);
    assert.deepEqual(names, validNames,
      `--only "${name}" printed a different valid-name list than the "nope" case`);
    assert.ok(!names.includes(name), `"${name}" must not appear in its own valid-names list`);
    assertNeverLaunchedChrome(r, `--only "${name}"`);
  });
}

test('--only combined with --update-budgets is refused, fast, with no table', () => {
  const r = run(['--only', 'bench mode wake lock', '--update-budgets']);
  assert.notEqual(r.status, 0);
  assert.ok(r.ms < FAST_MS,
    `took ${r.ms}ms — the combination must be refused before serve()/Chrome`);
  assert.match(r.stdout + r.stderr, /cannot be combined/i);
  assert.doesNotMatch(r.stdout + r.stderr, TABLE_HEADER);
  assertNeverLaunchedChrome(r, '--only + --update-budgets');
});

/* #40, item 3 (tightened in review): `--only=<name>` is the same flag as
 * `--only <name>` -- it used to be silently ignored, which fell through to a
 * full run instead of being refused. And a bare `--only` with no name after
 * it -- as the last argument, or immediately followed by another `--flag` --
 * is refused the same way an unknown name is, rather than reading the next
 * flag as if it were the check name. */
test('--only=nope (the = form) is refused the same way as --only nope', () => {
  const r = run(['--only=nope']);
  assert.notEqual(r.status, 0, '--only=nope must not be silently ignored into a full run');
  assert.ok(r.ms < FAST_MS,
    `took ${r.ms}ms — --only=<unknown> must be refused before serve()/Chrome`);
  assert.doesNotMatch(r.stdout + r.stderr, TABLE_HEADER, '--only=nope must never print a table');
  const names = r.stderr.trim().split('\n').slice(1).map(l => l.trim()).filter(Boolean);
  assert.deepEqual(names, validNames, '--only=nope printed a different valid-name list than --only nope');
  assertNeverLaunchedChrome(r, '--only=nope');
});

test('a bare --only as the last argument is refused with the list', () => {
  const r = run(['--only']);
  assert.notEqual(r.status, 0, 'a bare --only with nothing after it must not fall through to a full run');
  assert.ok(r.ms < FAST_MS, `took ${r.ms}ms — a bare --only must be refused before serve()/Chrome`);
  assert.doesNotMatch(r.stdout + r.stderr, TABLE_HEADER, 'a bare --only must never print a table');
  const names = r.stderr.trim().split('\n').slice(1).map(l => l.trim()).filter(Boolean);
  assert.deepEqual(names, validNames, 'a bare --only printed a different valid-name list than --only nope');
  assertNeverLaunchedChrome(r, 'bare --only (last arg)');
});

test('--only immediately followed by another flag is refused with the list', () => {
  const r = run(['--only', '--json']);
  assert.notEqual(r.status, 0, '--only --json must not read --json as the check name');
  assert.ok(r.ms < FAST_MS, `took ${r.ms}ms — --only --json must be refused before serve()/Chrome`);
  assert.doesNotMatch(r.stdout + r.stderr, TABLE_HEADER, '--only --json must never print a table');
  const names = r.stderr.trim().split('\n').slice(1).map(l => l.trim()).filter(Boolean);
  assert.deepEqual(names, validNames, '--only --json printed a different valid-name list than --only nope');
  assertNeverLaunchedChrome(r, '--only --json');
});
