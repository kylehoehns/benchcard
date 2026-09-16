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
/* Shared by extractRunCommands and extractStepEnv below: both need a key's
 * BODY -- every line after it that is indented strictly deeper than the key
 * itself, blank lines skipped without ending the body (a block scalar or an
 * `env:` map can have blank lines inside it), comment lines dropped, ending
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

/* #42: see the comment on claude.yml's `env:` for why a subagent left running in
 * the background makes a review job pass without reviewing, and what
 * `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` does about it -- the mechanism is
 * explained there once; this guard is the other half of the fix.
 *
 * Ways to look set without being set, and every one of them must fail this
 * guard: the name in a COMMENT; the entry on a DIFFERENT step, a SECOND
 * `anthropics/claude-code-action` step with no `env:` of its own (same job or
 * a second job), or a job- or workflow-level `env:`; the right name with the
 * WRONG value; and the name appearing as TEXT under a different key's block
 * scalar (`NOTE: |` or `NOTE: >-` followed by an indented line) -- only a
 * DIRECT child of `env:` is a key. None of these may fail it, because they
 * are the same config spelled differently: a trailing comment on the `env:`
 * line or on a value, a quoted `uses: 'anthropics/claude-code-action@v1'`,
 * and a flow-style `env: { KEY: 'v' }`.
 */

/* `extractStepEnv` reads every step in the file whose `uses:` matches
 * usesRegex, not only the first -- a second matching step that lacks the
 * entry, in the same job or a new one, must be caught too -- and returns one
 * result per match, in file order: the step's own `env:` map, `{}` if `env:`
 * is present but empty or comment-only, or `null` if the step has no `env:`
 * of its own. An empty array means no matching step was found at all, and a
 * caller must treat that as a failure, not a vacuous pass.
 *
 * A STEP needs its own start and end, since a sibling step's `env:` (or a
 * job-level one) sits at an indent that rule alone would not exclude. A
 * step's first key carries the list dash (`- name: ...`); every other key in
 * the same step shares that key's CONTENT indent (where the text starts,
 * dash or not) without the dash. So the scan finds the nearest dash-key at
 * that content indent at or before the `uses:` line (this step's start), the
 * next dash-key at that same content indent after it (the next step -- this
 * step's end), and only then looks for `env:` inside that span, in either
 * block form (`env:`, a trailing comment allowed, map on the following lines,
 * read with `collectBlockBody`) or flow form (`env: { KEY: 'v' }` on one
 * line).
 *
 * Only DIRECT children of `env:` are keys: the body's first line fixes the
 * child indent, and any deeper line -- the continuation of a block scalar
 * like `NOTE: |` -- is skipped rather than read as a sibling key. A value is
 * read up to its closing quote if it has one, or up to a trailing comment if
 * it does not; the caller, not this helper, decides whether the quoting or
 * the value itself is acceptable.
 *
 * Accepted residual, not chased here: a `uses: anthropics/claude-code-action`
 * line typed as plain text inside another step's `run: |` block fools the
 * step finder into treating it as a step boundary. That needs a real YAML
 * parser to rule out. The two per-workflow tests below still fail correctly
 * through it, because the real step is found and checked independently of
 * whatever the decoy happens to parse to. */
function extractStepEnv(yamlText, usesRegex) {
  const lines = yamlText.split('\n');
  const contentIndent = line => {
    const m = line.match(/^(\s*)(-\s+)?/);
    return m[1].length + (m[2] ? m[2].length : 0);
  };
  const isDashKey = line => /^\s*-\s+\S/.test(line);

  // A value ends at its closing quote if it has one, or at a trailing
  // comment if it does not -- the same "a trailing comment is not content"
  // rule `extractRunCommands` above needs for a `run:` line.
  const stripValue = raw => {
    const s = raw.trim();
    if (s[0] === "'" || s[0] === '"') {
      const q = s[0];
      let end = 1;
      while (end < s.length && s[end] !== q) end++;
      return s.slice(0, end + 1);
    }
    return s.replace(/\s+#.*$/, '').trim();
  };

  const parseFlowEnv = body => {
    const env = {};
    for (const pair of body.split(/,(?=(?:[^']*'[^']*')*[^']*$)/)) {
      const m = pair.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (m) env[m[1]] = stripValue(m[2]);
    }
    return env;
  };

  const usesIndices = [];
  lines.forEach((line, i) => { if (usesRegex.test(line)) usesIndices.push(i); });

  return usesIndices.map(usesIdx => {
    const keyIndent = contentIndent(lines[usesIdx]);
    const listIndent = keyIndent - 2; // the `- ` itself, one indent shallower

    // Step start: the nearest line at or before `uses:` that is THIS step's
    // own first key -- a list item at this same content indent.
    let start = usesIdx;
    while (start > 0 && !(isDashKey(lines[start]) && contentIndent(lines[start]) === keyIndent)) start--;

    // Step end: the next sibling step (a list item at that same content
    // indent), or the first line that dedents at or past the steps list
    // itself, or EOF.
    let end = usesIdx + 1;
    for (; end < lines.length; end++) {
      const line = lines[end];
      if (line.trim() === '') continue;
      const raw = line.length - line.trimStart().length;
      if (isDashKey(line) && contentIndent(line) === keyIndent) break; // next step
      if (raw <= listIndent) break; // dedented past the steps list entirely
    }

    const step = lines.slice(start, end);

    // Flow-style env: `env: { KEY: 'v' }`, trailing comment allowed.
    const flowLine = step.find(l => contentIndent(l) === keyIndent
      && /^\s*(-\s+)?env:\s*\{(.*)\}\s*(#.*)?$/.test(l));
    if (flowLine !== undefined) {
      return parseFlowEnv(flowLine.match(/^\s*(-\s+)?env:\s*\{(.*)\}\s*(#.*)?$/)[2]);
    }

    // Block-style env: `env:` (a trailing comment allowed), map on the
    // following lines.
    const envIdx = step.findIndex(l => contentIndent(l) === keyIndent
      && /^\s*(-\s+)?env:\s*(#.*)?$/.test(l));
    if (envIdx === -1) return null;

    const { body } = collectBlockBody(step, envIdx + 1, keyIndent);
    if (body.length === 0) return {};
    // Only DIRECT children of env: are keys (item 2): the first body line
    // fixes the child indent, and anything deeper -- the continuation of a
    // block scalar like `NOTE: |` -- is skipped rather than read as a key.
    const childIndent = body[0].length - body[0].trimStart().length;
    const env = {};
    for (const line of body) {
      if (line.length - line.trimStart().length !== childIndent) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
      if (m) env[m[1]] = stripValue(m[2]);
    }
    return env;
  });
}

const CLAUDE_ACTION_USES = /^\s*(-\s+)?uses:\s*['"]?anthropics\/claude-code-action@/;

test("extractStepEnv reads every matching step's own env:, not a decoy", () => {
  // Guards the guard: the plain case, the pre-existing decoys, and a fixture
  // for each of the six shapes a falsifier run found -- misses 1-2, false
  // reds 3-6.
  const plain = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        id: claude-review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
    '        with:',
    '          foo: bar',
  ].join('\n');
  assert.deepEqual(extractStepEnv(plain, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }]);

  const commentOnly = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    "          # CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
    '        with:',
    '          foo: bar',
  ].join('\n');
  assert.deepEqual(extractStepEnv(commentOnly, CLAUDE_ACTION_USES), [{}],
    'a comment naming the variable must not be read as setting it');

  const onAnotherStep = [
    '    steps:',
    '      - name: Checkout repository',
    '        uses: actions/checkout@v4',
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        with:',
    '          foo: bar',
  ].join('\n');
  assert.deepEqual(extractStepEnv(onAnotherStep, CLAUDE_ACTION_USES), [null],
    "a sibling step's env: must not be read as this step's own");

  const jobLevel = [
    '  claude-review:',
    '    env:',
    "      CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        with:',
    '          foo: bar',
  ].join('\n');
  assert.deepEqual(extractStepEnv(jobLevel, CLAUDE_ACTION_USES), [null],
    "a job-level env: must not be read as the step's own");

  const wrongValue = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0'",
  ].join('\n');
  assert.deepEqual(extractStepEnv(wrongValue, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'0'" }],
    'the extractor reports the real value -- rejecting a wrong one is the assertion below, not this helper');

  // Miss 1a: a second matching step in the SAME job, with no env: of its own.
  const secondStepSameJob = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
    '      - name: Second Claude pass',
    '        uses: anthropics/claude-code-action@v1',
    '        with:',
    "          prompt: 'again'",
  ].join('\n');
  assert.deepEqual(extractStepEnv(secondStepSameJob, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }, null],
    'a second matching step with no env: of its own must be reported, not hidden behind the first match');

  // Miss 1b: a second matching step in a SECOND job, with no env: of its own.
  const secondStepSecondJob = [
    '  claude-review:',
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
    '  claude-review-2:',
    '    steps:',
    '      - name: Again',
    '        uses: anthropics/claude-code-action@v1',
    '        with:',
    "          prompt: 'again'",
  ].join('\n');
  assert.deepEqual(extractStepEnv(secondStepSecondJob, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }, null],
    'a second job with an unguarded step must be caught too, not just the first job');

  // Miss 2: the variable name as TEXT under a different key's block scalar --
  // both `|` and `>-` -- is nested deeper than env:'s direct children and
  // must not be read as a sibling key.
  const nestedLiteral = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    '          NOTE: |',
    "            CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
  ].join('\n');
  const [nestedLiteralEnv] = extractStepEnv(nestedLiteral, CLAUDE_ACTION_USES);
  assert.equal(nestedLiteralEnv.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, undefined,
    'text inside a NOTE: | block is not a sibling key of env:, however it reads');

  const nestedFolded = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    '          NOTE: >-',
    "            CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
  ].join('\n');
  const [nestedFoldedEnv] = extractStepEnv(nestedFolded, CLAUDE_ACTION_USES);
  assert.equal(nestedFoldedEnv.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, undefined,
    'same for the folded (>-) form');

  // False red 3: a trailing comment on the VALUE.
  const trailingCommentOnValue = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'  # see header",
  ].join('\n');
  assert.deepEqual(extractStepEnv(trailingCommentOnValue, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }],
    'a trailing comment on the value is not part of it');

  // False red 4: a trailing comment on the env: KEY line.
  const trailingCommentOnEnvKey = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    '        env:  # see header',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
  ].join('\n');
  assert.deepEqual(extractStepEnv(trailingCommentOnEnvKey, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }],
    'a trailing comment on env: itself must not hide the map that follows it');

  // False red 5: a quoted uses:, single- and double-quoted.
  const quotedUsesSingle = [
    '    steps:',
    '      - name: Run Claude Code Review',
    "        uses: 'anthropics/claude-code-action@v1'",
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
  ].join('\n');
  assert.deepEqual(extractStepEnv(quotedUsesSingle, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }],
    'a single-quoted uses: value must still be found');

  const quotedUsesDouble = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: "anthropics/claude-code-action@v1"',
    '        env:',
    "          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'",
  ].join('\n');
  assert.deepEqual(extractStepEnv(quotedUsesDouble, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }],
    'and a double-quoted one');

  // False red 6: flow-style env:, and its wrong-value counterpart must still
  // report the real (rejectable) value rather than disappearing.
  const flowEnv = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    "        env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' }",
  ].join('\n');
  assert.deepEqual(extractStepEnv(flowEnv, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'1'" }],
    'flow-style env: must be read the same as block-style');

  const flowEnvWrongValue = [
    '    steps:',
    '      - name: Run Claude Code Review',
    '        uses: anthropics/claude-code-action@v1',
    "        env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' }",
  ].join('\n');
  assert.deepEqual(extractStepEnv(flowEnvWrongValue, CLAUDE_ACTION_USES),
    [{ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "'0'" }],
    "flow-style '0' must still be reported so the assertion below rejects it");
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

for (const file of ['claude.yml']) {
  test(`${file}'s anthropics/claude-code-action step(s) disable background subagents`, () => {
    const envs = extractStepEnv(read(`.github/workflows/${file}`), CLAUDE_ACTION_USES);
    assert.ok(envs.length > 0,
      `${file}: no anthropics/claude-code-action step was found -- this test would pass vacuously`);
    envs.forEach((env, i) => {
      assert.ok(env, `${file}: anthropics/claude-code-action step #${i + 1} has no env: of its own`);
      const raw = env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;
      assert.ok(raw !== undefined,
        `${file}: anthropics/claude-code-action step #${i + 1}'s own env: does not set `
        + "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS -- see the comment on its `env:` "
        + 'for why a subagent left to run in the background makes this job pass without reviewing.');
      assert.equal(raw.replace(/^['"]|['"]$/g, ''), '1',
        `${file}: anthropics/claude-code-action step #${i + 1}'s CLAUDE_CODE_DISABLE_BACKGROUND_TASKS `
        + `must be '1' -- see the comment on its env: block for why (got ${raw}).`);
    });
  });
}
