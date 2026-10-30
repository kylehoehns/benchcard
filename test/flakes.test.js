import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseFailures, tally, formatRows } from '../scripts/flakes.mjs';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parseFailures: node --test run 40803458453 gives the four smoke-settle names once each', () => {
  assert.deepEqual(parseFailures(fixture('run-40803458453-node24.txt')), [
    'TIMERS_QUIET outlasts a 140ms timer',
    'TIMERS_QUIET does not wait for a timer that was cleared',
    'TIMERS_QUIET ignores a timer longer than TRACKED_TIMER_MS',
    'TIMERS_QUIET and SETTLE return within their cap when requestAnimationFrame never fires',
  ]);
});

test('parseFailures: smoke run 40878611532 gives the one FAIL row, colors and detail dropped', () => {
  assert.deepEqual(parseFailures(fixture('run-40878611532-smoke.txt')), [
    'new teams start in Hardwood, a saved Graphite stays',
  ]);
});

test('parseFailures: real ESC color bytes are dropped too', () => {
  const log = 'smoke\tUNKNOWN STEP\t2026-10-29T13:15:42.0Z   \x1b[31mFAIL\x1b[0m  some check   threw: boom\n';
  assert.deepEqual(parseFailures(log), ['some check']);
});

test('parseFailures: only check marks and PASS rows give nothing', () => {
  assert.deepEqual(parseFailures(fixture('passing.txt')), []);
});

test('tally: counts main and other-branch failures per name, sorted by total, newest run id', () => {
  const runs = [
    { id: 5, branch: 'main', names: ['A', 'B'] },
    { id: 9, branch: 'feat/x', names: ['A'] },
    { id: 7, branch: 'main', names: ['B', 'B', 'C'] },
    { id: 3, branch: 'fix/y', names: ['C'] },
    { id: 2, branch: 'main', names: ['A'] },
  ];
  assert.deepEqual(tally(runs), [
    { name: 'A', main: 2, other: 1, newest: 9 },
    { name: 'B', main: 2, other: 0, newest: 7 },
    { name: 'C', main: 1, other: 1, newest: 7 },
  ]);
});

test('tally: no runs, no rows', () => {
  assert.deepEqual(tally([]), []);
});

test('formatRows: header, aligned counts, name last', () => {
  const rows = [
    { name: 'A long test name', main: 12, other: 1, newest: 40803458453 },
    { name: 'B', main: 0, other: 2, newest: 7 },
  ];
  assert.deepEqual(formatRows(rows, { read: 10, failed: 3 }), [
    'Read 10 runs, 3 failed.',
    'main  PR   newest run  name',
    '  12   1  40803458453  A long test name',
    '   0   2            7  B',
  ].join('\n'));
});

test('formatRows: nothing failed says so', () => {
  assert.equal(formatRows([], { read: 10, failed: 0 }), 'Read 10 runs, 0 failed.\nNo failing tests in these runs.');
});

const SCRIPT = new URL('../scripts/flakes.mjs', import.meta.url).pathname;

function runCli(pathDir) {
  return spawnSync(process.execPath, [SCRIPT, '--limit', '1'], {
    env: { PATH: pathDir },
    encoding: 'utf8',
  });
}

function assertCleanFailure(res) {
  assert.equal(res.status, 1);
  const lines = res.stderr.trim().split('\n');
  assert.equal(lines.length, 1, res.stderr);
  assert.match(lines[0], /^flakes: /);
  assert.doesNotMatch(res.stderr, /\n?\s+at /);
}

test('CLI: gh not logged in prints one flakes: line and exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flakes-gh-'));
  const gh = join(dir, 'gh');
  writeFileSync(
    gh,
    '#!/bin/sh\necho "To get started with GitHub CLI, please run:  gh auth login" >&2\nexit 4\n',
  );
  chmodSync(gh, 0o755);
  const res = runCli(dir);
  assertCleanFailure(res);
  assert.match(res.stderr, /gh auth login/);
});

test('CLI: no gh on PATH prints one flakes: line and exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flakes-nogh-'));
  assertCleanFailure(runCli(dir));
});
