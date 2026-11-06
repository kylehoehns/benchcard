/* #628: scripts/scenarios.mjs refuses an argument it does not understand
   before it starts any test, rather than quietly running everything. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('../scripts/scenarios.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 5000 });

for (const args of [
  ['--shard'], ['--shard', 'suite'], ['--shard', '5/3'], ['--shard', '0/3'], ['--shard', '1/1'], ['--shard', 'x'],
  ['--shard=1/3'], ['--shard', '1/3', '--shard', '2/3'], ['--shard', '1/3', 'extra'], ['--bogus'], ['1/3'],
]) {
  test(`scenarios.mjs ${args.join(' ')} exits 2 with a message and runs nothing`, () => {
    const r = run(...args);
    assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^scenarios: /);
    assert.doesNotMatch(r.stdout, /tests \d+|# tests/, 'no test run should have started');
  });
}
