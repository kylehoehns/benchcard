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
import { readdirSync, readFileSync } from 'node:fs';

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

/* The rule is not "no path filters". It is "no path filter on a REQUIRED
 * check", and the two workflows below are the reason to say it that way: both
 * carry a filter, both are correct to, and neither is required. A blanket ban
 * would have deleted two correct filters; a blanket permission would have
 * re-armed the trap on test.yml. */
test('the advisory workflows keep their path filters, because neither is required', () => {
  assert.match(read('.github/workflows/vendor-drift.yml'), /paths:/,
    'vendor-drift is scheduled and label-conditional; its filter is correct');
  assert.match(read('.github/workflows/claude-code-review.yml'), /paths-ignore:/,
    'the reviewer is advisory, so skipping it on notes-only and docs-only changes costs nothing but the run');
});

test('the reviewer still runs on the files that carry the rules', () => {
  const review = read('.github/workflows/claude-code-review.yml');
  const ignored = review.slice(review.indexOf('paths-ignore:'), review.indexOf('concurrency:'));
  for (const rules of ['AGENTS.md', 'REVIEW.md', 'CLAUDE.md', '*.md']) {
    assert.ok(!ignored.includes(`'${rules}'`),
      `${rules} is excluded from review. A contradiction introduced into the rules costs more than one in code, because everything downstream inherits it — PR #4's second finding was exactly that.`);
  }
});

/* #40: `--only` runs one smoke check and proves nothing about the other 20 --
 * AGENTS.md § Layout says so in as many words. CI running the suite with
 * `--only` would make a required check named "smoke (390×844)" report green
 * having audited a single row, which is exactly the "required check that does
 * not test what its name claims" shape `check-sw-version.test.js`'s job-rename
 * trap already guards from the other side.
 *
 * Scoped to an invocation of the smoke suite itself (`smoke.mjs`, `npm run
 * smoke` or `npm run-script smoke`) followed by `--only` in the SAME `run:`
 * step, not to `--only` anywhere in the file -- `npm ci --only=production` is
 * a real, unrelated flag on a different command and must not trip this.
 *
 * A line-by-line grep (the first version of this guard) misses two real
 * shapes and invents a third failure that isn't one:
 *
 *   1. A `run: |` or `run: >-` BLOCK SCALAR spreads one command over several
 *      lines, so `smoke.mjs` and `--only` can land on different lines of the
 *      same step. `extractRunCommands` below reassembles each `run:` value --
 *      the inline text after the colon, plus every following line indented
 *      deeper than the `run:` key -- into one string before matching, the way
 *      YAML itself reassembles it before handing the shell a command.
 *   2. `npm run-script smoke` is the same invocation as `npm run smoke` under
 *      a different spelling and must be caught too.
 *   3. A comment ABOUT `smoke.mjs --only` (prose warning against it, or code
 *      quoted in a commit-message example) is not an invocation. Whole comment
 *      lines are dropped before matching, and a bare comment line never starts
 *      a `run:` step in the first place, so it cannot be mistaken for one. A
 *      TRAILING comment on a smoke `run:` line is not stripped, so
 *      `smoke.mjs --no-tests  # never --only` still fails the ban: put that
 *      warning on its own line.
 */

/* Turns one `run:` step's raw YAML into the single shell command it actually
 * runs: the inline text on the `run:` line itself, plus every following line
 * indented strictly deeper than the `run:` key (a block scalar's continuation
 * -- see 1 above), stopping at the first line that is blank* or indented at
 * or shallower than the key (the next sibling key, or the next list item).
 * (*blank lines inside a real block scalar are legal and would need to stay
 * part of it for a faithful reassembly; none of this file's steps use one
 * mid-command, so treating blank as "step ended" costs nothing here and keeps
 * the scan simple.) Comment-only continuation lines are dropped, not treated
 * as ending the step, since YAML would still read them as part of the block. */
function extractRunCommands(yamlText) {
  const lines = yamlText.split('\n');
  const commands = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(-\s+)?run:[ \t]?(.*)$/);
    if (!m) continue;
    const [, leading, dash, inline] = m;
    const keyIndent = leading.length + (dash ? dash.length : 0);
    const trimmedInline = inline.trim();
    // A bare block-scalar indicator (`|`, `|-`, `>-`, ...) carries no command
    // text of its own -- the command is entirely in the continuation lines.
    const isBlockIndicator = /^[|>][-+0-9]*$/.test(trimmedInline);
    const parts = (trimmedInline === '' || trimmedInline.startsWith('#') || isBlockIndicator) ? [] : [inline];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') break;
      const indent = line.length - line.trimStart().length;
      if (indent <= keyIndent) break;
      if (line.trim().startsWith('#')) continue; // comment: part of the step, not the command
      parts.push(line);
    }
    commands.push(parts.join(' ').replace(/\\/g, ' ').replace(/\s+/g, ' ').trim());
    i = j - 1;
  }
  return commands;
}

const SMOKE_INVOCATION = /(?:\bsmoke\.mjs\b|npm run(?:-script)? smoke\b)/;

test('extractRunCommands reassembles a block-scalar run step into one command', () => {
  // Guards the guard: fixtures for exactly the three shapes item 1 named,
  // plus the two things that must NOT be flagged (a bare comment, and an
  // unrelated --only on a different command).
  const literalBlock = [
    '  steps:',
    '    - run: |',
    '        node scripts/smoke.mjs \\',
    '        --no-tests --only "bench mode wake lock"',
  ].join('\n');
  assert.deepEqual(extractRunCommands(literalBlock),
    ['node scripts/smoke.mjs --no-tests --only "bench mode wake lock"']);

  const foldedBlock = [
    '  steps:',
    '    - run: >-',
    '        node scripts/smoke.mjs',
    '        --only "bench mode wake lock"',
  ].join('\n');
  assert.deepEqual(extractRunCommands(foldedBlock),
    ['node scripts/smoke.mjs --only "bench mode wake lock"']);

  const runScript = '    - run: npm run-script smoke -- --only "bench mode wake lock"';
  assert.deepEqual(extractRunCommands(runScript),
    ['npm run-script smoke -- --only "bench mode wake lock"']);

  const commentOnly = '  # never `node scripts/smoke.mjs --only`: it proves one row, not the suite';
  assert.deepEqual(extractRunCommands(commentOnly), [], 'a bare comment line is not a run step');

  const unrelated = '    - run: npm ci --only=production';
  assert.deepEqual(extractRunCommands(unrelated), ['npm ci --only=production']);
  assert.doesNotMatch(extractRunCommands(unrelated)[0], SMOKE_INVOCATION);
});

test('no workflow runs the smoke suite with --only', () => {
  const dir = new URL('.github/workflows/', ROOT);
  const files = readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, 'no workflow files found -- this test would pass vacuously');
  for (const f of files) {
    const content = read(`.github/workflows/${f}`);
    for (const cmd of extractRunCommands(content)) {
      if (!SMOKE_INVOCATION.test(cmd)) continue;
      assert.doesNotMatch(cmd, /--only\b/,
        `${f} invokes the smoke suite with --only, which proves one check, not the suite -- `
        + `AGENTS.md § Layout. CI must run the full suite: "${cmd}"`);
    }
  }
});
