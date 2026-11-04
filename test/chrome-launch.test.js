/* #616: on macOS a fresh Chrome's first cookie-store load reads the login
 * Keychain, which every Chrome on the machine shares. Under lane load that read
 * queued for 28-50 s and the settle test's 45 s warm-up failed. `launch()` must
 * pass `--use-mock-keychain`; this reads the running Chrome's own command line.
 * Skips where there is no Chrome (#235). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { launch, closeChrome } from '../scripts/smoke/chrome.mjs';
import { NEEDS_CHROME } from './helpers/smoke-cli.mjs';

test('launch() starts Chrome with --use-mock-keychain', { ...NEEDS_CHROME, timeout: 60_000 }, async () => {
  const { proc, dir } = await launch(0, false);
  try {
    const command = execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(proc.pid)], { encoding: 'utf8' }).trim();
    assert.notEqual(command, '', 'ps printed no command line for Chrome, so nothing was checked');
    assert.ok(command.split(/\s+/).includes('--use-mock-keychain'),
      `Chrome's command line lacks --use-mock-keychain (#616): ${command}`);
  } finally {
    await closeChrome(proc, dir);
  }
});
