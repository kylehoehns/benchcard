/* #241 item 5. `--timing` prints, after the table, each rich row's wall-clock
 * seconds (slowest first) plus the run's totals; without the flag the output
 * carries no timing block at all, so `--json` and the CI log are unchanged.
 * Runs the real harness against a quick rich row, like test/smoke-timeout.test.js
 * does, and skips where there is no Chrome (#235). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './helpers/smoke-cli.mjs';
import { hasChrome } from '../scripts/smoke/chrome.mjs';

const NEEDS_CHROME = (await hasChrome()) || process.env.GITHUB_ACTIONS
  ? {}
  : { skip: 'no Chrome on this machine (Cloudflare\'s build) — smoke CI runs these' };

const ROW = 'rich fixture is live';

test('--timing prints a block that names the row with a seconds value and the run totals', { timeout: 90_000, ...NEEDS_CHROME }, () => {
  const r = run(['--only', ROW, '--timing']);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status} — stdout: ${r.stdout} stderr: ${r.stderr}`);
  const block = r.stdout.split(/^timing/m)[1];
  assert.ok(block, `no timing block in stdout: ${r.stdout}`);
  assert.match(block, /rich rows\s+\d+\.\d+s/, 'the block should carry the rich rows\' total seconds');
  assert.match(block, /executed sleep\s+\d+\.\d+s/, 'the block should carry the executed sleep total');
  assert.ok(block.split('\n').some(l => /^\s*\d+\.\d+s\s+rich fixture is live\s*$/.test(l)),
    `no line "<seconds>s  ${ROW}" in the timing block: ${block}`);
});

test('without --timing there is no timing block', { timeout: 90_000, ...NEEDS_CHROME }, () => {
  const r = run(['--only', ROW]);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status} — stdout: ${r.stdout} stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(ROW), 'the row itself should still print (else this proved nothing)');
  assert.doesNotMatch(r.stdout, /^timing/m);
  assert.doesNotMatch(r.stdout, /executed\s+sleep/);
});
