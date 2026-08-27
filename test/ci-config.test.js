/* Branch protection is configured in GitHub's UI, not in this repo, which
 * means the two can drift and nothing in the tree would notice. These are the
 * assertions that catch the drift from this side.
 *
 * Two failure modes, and both are silent, which is why they are pinned rather
 * than trusted:
 *
 *   1. A PATH FILTER ON A REQUIRED CHECK. A required check that does not run
 *      does not fail the pull request -- it leaves it pending, forever, with
 *      no error to read. `test.yml` carried `paths-ignore: notes/**` for its
 *      whole life and it was correct while nothing was required; the day the
 *      checks became required it turned into a trap where a notes-only PR
 *      hangs on a job that was never going to report. Re-adding one would not
 *      break any test that existed before this file.
 *
 *   2. A RENAMED JOB. GitHub requires checks BY NAME. Rename `smoke (390×844)`
 *      and branch protection keeps waiting for a check nothing will ever
 *      produce, while the renamed job runs and goes green beside it. The
 *      branch is then unprotected and every signal says it is fine.
 *
 * `vendor-drift.yml` is deliberately exempt: it is scheduled, conditional on a
 * PR label, and is NOT a required check. Its path filter is correct and must
 * stay.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

const tests = read('.github/workflows/test.yml');

/* The `on:` block only -- a path filter further down would be inside a job's
   `if:`, which is a different thing and not what this guards. */
const triggerBlock = tests.slice(tests.indexOf('\non:'), tests.indexOf('\npermissions:'));

test('the required workflow has no path filter', () => {
  assert.doesNotMatch(triggerBlock, /paths-ignore:/,
    'a required check with paths-ignore leaves a PR pending forever instead of failing it');
  assert.doesNotMatch(triggerBlock, /^\s+paths:/m,
    'same trap in the other direction: a `paths:` allowlist skips the check on everything it does not name');
});

test('the required workflow runs on pull requests into main', () => {
  assert.match(triggerBlock, /pull_request:/, 'nothing gates a PR if the workflow does not run on one');
  assert.match(triggerBlock, /branches: \[main\]/);
});

/* Change a name here only together with the branch protection rule in GitHub,
   and expect this test to fail first. That is the point of it: the failure is
   the reminder that the two are a pair. */
const REQUIRED = [
  'node 24',
  'smoke (390×844)',
  'evals',
  'service worker behind redirects',
  'checks that need history',
];

test('every job branch protection requires still exists under that exact name', () => {
  for (const name of REQUIRED) {
    assert.ok(tests.includes(`name: ${name}`),
      `no job named "${name}". GitHub requires checks by name, so renaming one leaves branch protection waiting on a check that will never report — and the branch is unprotected while everything looks green.`);
  }
});

test('the workflow declares no more required-looking jobs than are pinned here', () => {
  /* A new job is not a problem; a new job nobody added to branch protection,
     and nobody noticed was unprotected, is. This fails on the addition so the
     decision gets made deliberately. */
  const names = [...tests.matchAll(/^    name: (.+)$/gm)].map(m => m[1].trim());
  assert.deepEqual(names.sort(), [...REQUIRED].sort(),
    'a job was added to or removed from test.yml. Update branch protection and this list together, or say why the job is not required.');
});

test('vendor-drift keeps its path filter, because it is not a required check', () => {
  const drift = read('.github/workflows/vendor-drift.yml');
  assert.match(drift, /paths:/,
    'vendor-drift is scheduled and label-conditional; its filter is correct and the rule above does not apply to it');
});
