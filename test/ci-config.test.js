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
 *
 * One test here is not about branch protection at all. #52 pins that
 * `app/vendor/fetch.sh` clears what it generates -- the drift job's
 * precondition rather than a property of a required check. It lives in this
 * file because this file already reads `vendor-drift.yml` and already exists
 * to catch configuration that drifts with nothing noticing, which is the same
 * failure shape. Read the header as: what this file guards is CI
 * configuration, plus the one precondition that job depends on.
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
 * check", and vendor-drift.yml is the reason to say it that way: it carries a
 * filter, is correct to, and is not required. */
test('the advisory workflow keeps its path filter, because it is not required', () => {
  assert.match(read('.github/workflows/vendor-drift.yml'), /paths:/,
    'vendor-drift is scheduled and label-conditional; its filter is correct');
});

/* #40: `--only` runs one smoke check and proves nothing about the other 21 --
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
 * -- see 1 above), stopping at the first line that is NON-blank and indented
 * at or shallower than the key (the next sibling key, or the next list item),
 * or at EOF. A blank line is legal inside a real block scalar and is part of
 * it -- it never ends the step on its own; the scan skips over it and keeps
 * looking for the line that actually ends the block. Treating a blank line as
 * the end was the gap: it let `smoke.mjs --only` hide on the far side of one
 * inside a `run: |` block, invisible to a scan that stopped short. Comment-only
 * continuation lines are dropped, not treated as ending the step either, since
 * YAML would still read them as part of the block. */
/* Used by extractRunCommands below: it needs a key's
 * BODY -- every line after it that is indented strictly deeper than the key
 * itself, blank lines skipped without ending the body (a block scalar can have
 * blank lines inside it), comment lines dropped, ending
 * at the first non-blank line that dedents to the key's own indent or
 * shallower, or at EOF. Returns the collected body lines alongside the index
 * just past them, so a caller can resume scanning `lines` from there. */
function collectBlockBody(lines, start, keyIndent) {
  const body = [];
  let end = start;
  for (; end < lines.length; end++) {
    const line = lines[end];
    if (line.trim() === '') continue; // blank inside the block: never ends it
    const indent = line.length - line.trimStart().length;
    if (indent <= keyIndent) break;
    if (line.trim().startsWith('#')) continue; // comment: part of the step, not its content
    body.push(line);
  }
  return { body, end };
}

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
    const { body, end } = collectBlockBody(lines, i + 1, keyIndent);
    commands.push(parts.concat(body).join(' ').replace(/\\/g, ' ').replace(/\s+/g, ' ').trim());
    i = end - 1;
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

  // A blank line INSIDE a block scalar is part of it, not the end of the
  // step -- this is the shape that hid `--only` from the scan before the fix.
  const blockWithBlankLine = [
    '  steps:',
    '    - run: |',
    '        npm ci',
    '',
    '        node scripts/smoke.mjs --only "bench mode wake lock"',
  ].join('\n');
  assert.deepEqual(extractRunCommands(blockWithBlankLine),
    ['npm ci node scripts/smoke.mjs --only "bench mode wake lock"'],
    'a blank line mid-block must not truncate the reassembled command');

  // A blank line right before the NEXT step must still end the first step at
  // that next step's key, not swallow it into the same command.
  const blankThenNextStep = [
    '  steps:',
    '    - run: |',
    '        npm ci',
    '',
    '    - name: next step',
    '      run: echo done',
  ].join('\n');
  assert.deepEqual(extractRunCommands(blankThenNextStep), ['npm ci', 'echo done'],
    'a trailing blank line must not merge the next sibling step into this one');
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

/* #52: the drift job cannot see a file `fetch.sh` stopped writing. Nothing
 * touches it, so `git status` has nothing to report and the job passes --
 * `sun`, `moon` and `contrast` sat in app/vendor/icons/ that way through
 * three green drift runs -- #48's two pull-request runs and its merge to
 * main -- until #53 deleted them by hand. Clearing what it generates first
 * turns that case into a deletion, and this pins the line so the hole cannot
 * reopen silently. What the job itself does is documented once, in
 * `vendor-drift.yml`'s own header. */
test('fetch.sh clears everything it generates, before it generates it', () => {
  const lines = read('app/vendor/fetch.sh').split('\n');
  const code = lines.map(l => (l.trim().startsWith('#') ? '' : l));

  const clearAt = code.findIndex(l => /^rm -rf /.test(l));
  assert.notEqual(clearAt, -1,
    'app/vendor/fetch.sh no longer clears anything before it re-vendors, so a name '
    + 'dropped from its lists leaves a file the vendor-drift job cannot see (#52)');
  const cleared = code[clearAt].replace(/^rm -rf /, '').trim().split(/\s+/);

  /* Every path the script writes: `-o target`, a `>` redirect, `mkdir -p`.
     Derived rather than listed, so a fifth output added to the script has to
     be cleared too -- the mutation /new-guard asks for is ADDING a member,
     and a hand-written list only ever catches a removed one. */
  const writes = [];
  code.forEach((line, n) => {
    for (const re of [/-o\s+"?([^"\s]+)/g, /(?:^|\s)>\s*"?([^"\s]+)/g, /mkdir -p\s+"?([^"\s]+)/g]) {
      for (const m of line.matchAll(re)) writes.push({ path: m[1], n });
    }
  });
  /* Scratch files the script removes itself are not output. */
  const temp = new Set([...code.join('\n').matchAll(/^rm -f\s+(\S+)/gm)].map(m => m[1]));
  const output = writes.filter(w => !temp.has(w.path));

  assert.ok(output.length > 0,
    'found no write targets in fetch.sh -- this guard has stopped measuring anything, '
    + 'which is a broken guard and not a clean result');

  for (const { path } of output) {
    assert.ok(cleared.includes(path.split('/')[0]),
      `fetch.sh writes ${path} but does not clear ${path.split('/')[0]} first, so a `
      + `change that stops producing it leaves the old file behind and the drift job `
      + `stays green. Add it to the \`rm -rf\` at the top of app/vendor/fetch.sh.`);
  }

  assert.ok(clearAt < Math.min(...output.map(w => w.n)),
    'the `rm -rf` in app/vendor/fetch.sh runs after the script has already written '
    + 'something, so it deletes what it just fetched. It belongs at the top, before '
    + 'the first download.');
});
