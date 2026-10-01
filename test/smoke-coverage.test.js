/* #259 items F and G, at the command line: `--update-coverage` is refused where
   the run lacks one of the two halves (the browser rows with the suite), before
   `serve()`/Chrome start; and a partial run says it printed no coverage row. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAST_MS, NEEDS_CHROME, run, assertNeverLaunchedChrome } from './helpers/smoke-cli.mjs';

for (const [partial, args] of [
  ['--only', ['--update-coverage', '--only', 'rich fixture is live']],
  ['--no-tests', ['--update-coverage', '--no-tests']],
]) {
  test(`--update-coverage with ${partial} is refused before serve()/Chrome`, () => {
    const r = run(args);
    assert.notEqual(r.status, 0, 'should exit non-zero');
    assert.ok(r.ms < FAST_MS, `took ${r.ms}ms: refused after launch()?`);
    assert.match(r.stderr, /--update-coverage/);
    assert.match(r.stderr, new RegExp(partial));
    assertNeverLaunchedChrome(r, `--update-coverage ${partial}`);
  });
}

test('--only prints no coverage row and says coverage was skipped', { timeout: 60_000, ...NEEDS_CHROME }, () => {
  const r = run(['--only', 'rich fixture is live']);
  assert.equal(r.status, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
  assert.match(r.stdout, /^skipped: .*coverage/m);
  assert.doesNotMatch(r.stdout, /app\/\s+line\s+coverage/);
});
