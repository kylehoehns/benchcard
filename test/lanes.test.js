/* #593: the batch-run scripts live in `scripts/lanes/`, and `lane.sh` starts
 * one lane (a worktree on a new branch at origin/main, a node_modules link,
 * and a filled-in prompt).
 *
 * Seam: run `lane.sh` with bash against a fixture -- a temp bare repo as
 * `origin`, a clone of it as the main checkout holding a copy of
 * `scripts/lanes/` and a `node_modules` dir. Nothing touches the real repo.
 *
 * Also one guard (reads files, not behavior): no file under `scripts/lanes/`
 * may name a session's temp folder (`/private/tmp`) or a typed home path
 * (`/Users/`). Rule 2a: a scan that
 * found fewer than six files fails rather than passing vacuously.
 *
 * STATES THE GUARD WAS RUN AGAINST: the finished tree (green); a lanes file
 * temporarily holding `/private/tmp` (red, names the file); a lanes file
 * temporarily holding `/Users/` (red, names the file).
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, cpSync, rmSync, existsSync, writeFileSync,
  readFileSync, readdirSync, lstatSync, realpathSync, appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LANES_SRC = join(ROOT, 'scripts', 'lanes');
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', env: GIT_ENV, timeout: 60000, ...opts });
}
function git(cwd, ...args) {
  const r = run('git', ['-c', 'init.defaultBranch=main', ...args], { cwd });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

/** A bare origin plus a main checkout that has pushed a copy of scripts/lanes/. */
function fixture(editLanes) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lanes-test-')));
  roots.push(root);
  const origin = join(root, 'origin.git');
  const main = join(root, 'repo');
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-q');
  git(root, 'clone', '-q', origin, main);
  git(main, 'checkout', '-q', '-b', 'main');
  if (existsSync(LANES_SRC)) {
    cpSync(LANES_SRC, join(main, 'scripts', 'lanes'), { recursive: true });
  }
  if (editLanes) editLanes(join(main, 'scripts', 'lanes'));
  mkdirSync(join(main, 'node_modules'));
  writeFileSync(join(main, '.gitignore'), 'node_modules\n');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'fixture');
  git(main, 'push', '-q', 'origin', 'main');
  return { root, origin, main, wtDir: join(root, 'repo-wt') };
}

const laneSh = (f) => join(f.main, 'scripts', 'lanes', 'lane.sh');
const start = (f, ...args) => run('bash', [laneSh(f), ...args], { cwd: f.root });

describe('lane.sh', () => {
  test('makes a worktree on the new branch at origin/main, links node_modules, fills the prompt', () => {
    const f = fixture();
    const r = start(f, '999', 'test-999', '8399');
    assert.equal(r.status, 0, `lane.sh failed: ${r.stderr}`);
    const wt = join(f.wtDir, '999');
    assert.ok(existsSync(wt), 'worktree directory exists');
    assert.equal(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'test-999');
    assert.equal(git(wt, 'rev-parse', 'HEAD'), git(f.main, 'rev-parse', 'origin/main'));
    const nm = join(wt, 'node_modules');
    assert.ok(lstatSync(nm).isSymbolicLink(), 'node_modules is a symlink');
    assert.equal(realpathSync(nm), realpathSync(join(f.main, 'node_modules')));
    const prompt = join(f.wtDir, 'lane-999.txt');
    assert.ok(existsSync(prompt), 'prompt file exists');
    const text = readFileSync(prompt, 'utf8');
    for (const want of ['#999', 'test-999', '8399', wt]) {
      assert.ok(text.includes(want), `prompt names ${want}`);
    }
    assert.doesNotMatch(text, /__[A-Z]+__/);
    assert.ok(r.stdout.includes(prompt), 'prints the prompt path');
    assert.ok(r.stdout.includes(wt), 'prints the worktree path');
  });

  test('a placeholder it does not know: exits non-zero, names it, leaves nothing behind', () => {
    const f = fixture((lanes) => appendFileSync(join(lanes, 'lane-template.txt'), '\n__BOGUS__\n'));
    const r = start(f, '999', 'test-999', '8399');
    assert.notEqual(r.status, 0, 'refuses');
    assert.match(r.stderr, /__BOGUS__/);
    assert.ok(!existsSync(join(f.wtDir, 'lane-999.txt')), 'no prompt');
    assert.ok(!existsSync(join(f.wtDir, '999')), 'no worktree');
    const branches = git(f.main, 'branch', '--list', 'test-999');
    assert.equal(branches, '', 'branch not created');
  });

  test('the optional extra file lands in the prompt', () => {
    const f = fixture();
    const extra = join(f.root, 'extra.txt');
    writeFileSync(extra, 'LANE-SPECIFIC & odd/path text\n');
    const r = start(f, '999', 'test-999', '8399', extra);
    assert.equal(r.status, 0, `lane.sh failed: ${r.stderr}`);
    const text = readFileSync(join(f.wtDir, 'lane-999.txt'), 'utf8');
    assert.ok(text.includes('LANE-SPECIFIC & odd/path text'));
  });

  test('refuses on a wrong argument count, a non-number, or an existing branch, each with its own message', () => {
    const f = fixture();
    const cases = [
      [['999', 'test-999'], /usage/, 'too few args'],
      [['x9', 'test-999', '8399'], /issue must be a number/, 'issue not a number'],
      [['999', 'test-999', 'p'], /port must be a number/, 'port not a number'],
      [['999', 'main', '8399'], /branch already exists/, 'branch exists'],
    ];
    for (const [args, message, label] of cases) {
      const r = start(f, ...args);
      assert.notEqual(r.status, 0, `${label}: refuses`);
      assert.match(r.stderr, message, `${label}: says why`);
    }
    assert.ok(!existsSync(join(f.wtDir, '999')), 'no worktree after refusals');
  });

  test('an invalid branch name is refused with a message and leaves nothing behind', () => {
    const f = fixture();
    const r = start(f, '999', 'bad..name', '8399');
    assert.notEqual(r.status, 0, 'refuses');
    assert.match(r.stderr, /not a valid branch name/);
    assert.ok(!existsSync(join(f.wtDir, '999')), 'no worktree');
    assert.ok(!existsSync(join(f.wtDir, 'lane-999.txt')), 'no prompt');
    assert.ok(!existsSync(f.wtDir), 'no worktree folder');
  });

  test('an extra file holding a literal __EXTRA__ line is text, not a template fault', () => {
    const f = fixture();
    const extra = join(f.root, 'extra.txt');
    writeFileSync(extra, 'before\n__EXTRA__\nafter\n');
    const r = start(f, '999', 'test-999', '8399', extra);
    assert.equal(r.status, 0, `lane.sh failed: ${r.stderr}`);
    assert.ok(readFileSync(join(f.wtDir, 'lane-999.txt'), 'utf8').includes('before\n__EXTRA__\nafter'));
  });
});

/* ---------- merge-one.sh (#596): the preview check before `gh pr merge` ---------- */

/** A fake `gh` first on PATH. It logs every argv (one line per call) and answers
 *  the calls merge-one makes: the head sha, five SUCCESS checks, a title, and six
 *  `=success` check runs for the merge commit, all at once so no sleep runs. */
function fakeGh(f, headSha, overrides = {}) {
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  const log = join(f.root, 'gh.log');
  writeFileSync(log, '');
  // overrides: { head|rollup|title|api: { fail: 'stderr line', times?: n } | { empty: true } }
  // `fail` exits 1 with that stderr line (the first `times` calls only, when given);
  // `empty` answers nothing. A counter file per call kind lives in f.root.
  const answers = {
    head: headSha, rollup: 'SUCCESS,SUCCESS,SUCCESS,SUCCESS,SUCCESS', title: "Make Avery's card wider",
    api: 'node 24=success,smoke=success,evals=success,service worker behind redirects=success,checks that need history=success,Workers Builds: benchcard=success',
  };
  const arm = (kind) => {
    const o = overrides[kind];
    const count = join(f.root, `count-${kind}`);
    const say = `echo "${answers[kind].replace(/(["$`\\])/g, '\\$1')}"`;
    if (!o) return say;
    if (o.empty) return 'true';
    const fail = `echo '${o.fail}' >&2; exit 1`;
    if (!o.times) return fail;
    return `n=$(cat '${count}' 2>/dev/null || echo 0); echo $((n+1)) > '${count}'; if [ $n -lt ${o.times} ]; then ${fail}; fi; ${say}`;
  };
  const script = `#!/bin/bash
echo "$*" >> '${log}'
case "$*" in
  *headRefOid*) ${arm('head')} ;;
  *statusCheckRollup*) ${arm('rollup')} ;;
  *"--json title"*) ${arm('title')} ;;
  "pr merge"*) exit 0 ;;
  "api "*) ${arm('api')} ;;
  *) echo "fake gh: unexpected call: $*" >&2; exit 9 ;;
esac
`;
  writeFileSync(join(bin, 'gh'), script, { mode: 0o755 });
  return { bin, log };
}

/** A fixture whose preview-check.mjs is a stub that exits `code`, plus a PR 77
 *  head (one commit on top of main) pushed to origin as refs/pull/77/head. */
function mergeFixture(code, overrides = {}) {
  const f = fixture((lanes) => writeFileSync(join(lanes, 'preview-check.mjs'),
    `import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
appendFileSync(join(dirname(fileURLToPath(import.meta.url)), 'argv.log'), JSON.stringify(process.argv.slice(2)) + '\\n');
console.log('stub preview check for #' + process.argv[2]); process.exit(${code});\n`));
  git(f.main, 'checkout', '-q', '-b', 'pr-77');
  writeFileSync(join(f.main, 'change.txt'), 'x\n');
  git(f.main, 'add', 'change.txt');
  git(f.main, 'commit', '-q', '-m', 'the PR');
  const head = git(f.main, 'rev-parse', 'HEAD');
  git(f.main, 'push', '-q', 'origin', 'HEAD:refs/pull/77/head');
  git(f.main, 'checkout', '-q', 'main');
  return { ...f, ...fakeGh(f, head, overrides) };
}

const mergeOne = (f) => run('bash', [join(f.main, 'scripts', 'lanes', 'merge-one.sh'), '77'], {
  cwd: f.root, env: { ...GIT_ENV, PATH: `${f.bin}:${process.env.PATH}`, LANES_GH_RETRY_WAIT: '0' },
});

const stubArgv = (f) => readFileSync(join(f.main, 'scripts', 'lanes', 'argv.log'), 'utf8');

describe('merge-one.sh', () => {
  test('a failed preview check: exit 4, says so, and never calls gh pr merge', () => {
    const f = mergeFixture(1);
    const r = mergeOne(f);
    assert.equal(r.status, 4, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('#77 preview check failed; not merged'), r.stdout);
    assert.doesNotMatch(r.stdout, /merged\s+#77\s+as/, 'did not claim a merge');
    const calls = readFileSync(f.log, 'utf8');
    assert.ok(calls.includes('statusCheckRollup'), 'the checks were read first');
    assert.ok(!/^pr merge/m.test(calls), `gh pr merge was called:\n${calls}`);
    assert.equal(stubArgv(f), '["77"]\n', 'the preview check got the PR number');
  });

  test('a passing preview check: gh pr merge is called, merged #N as <sha7>, main green, exit 0', () => {
    const f = mergeFixture(0);
    const r = mergeOne(f);
    assert.equal(r.status, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /merged #77 as [0-9a-f]{7}/);
    assert.match(r.stdout, /main green \+ deployed at [0-9a-f]{7}/);
    const calls = readFileSync(f.log, 'utf8');
    assert.match(calls, /^pr merge 77 --squash/m);
    assert.equal(stubArgv(f), '["77"]\n', 'the preview check got the PR number');
  });

  test('the head-sha read fails every time: exit 5, names the error, 3 tries, 2 retry lines, not "behind", no merge', () => {
    const f = mergeFixture(0, { head: { fail: 'TLS handshake timeout' } });
    const r = mergeOne(f);
    assert.equal(r.status, 5, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /couldn't read #77 from GitHub: TLS handshake timeout/);
    assert.doesNotMatch(r.stdout, /behind\s+main/);
    const calls = readFileSync(f.log, 'utf8');
    assert.equal(calls.split('\n').filter(l => l.includes('headRefOid')).length, 3);
    assert.equal(r.stdout.split('\n').filter(l => /attempt/.test(l) && l.includes('TLS handshake timeout')).length, 2, r.stdout);
    assert.ok(!/^pr merge/m.test(calls), 'gh pr merge was not called');
  });

  test('the head-sha read answers empty: exit 5 with "gh returned nothing", not "behind main"', () => {
    const f = mergeFixture(0, { head: { empty: true } });
    const r = mergeOne(f);
    assert.equal(r.status, 5, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /couldn't read #77 from GitHub: gh returned nothing/);
    assert.doesNotMatch(r.stdout, /behind\s+main/);
  });

  test('the head-sha read fails once then answers: retried, merges, exit 0', () => {
    const f = mergeFixture(0, { head: { fail: 'TLS handshake timeout', times: 1 } });
    const r = mergeOne(f);
    assert.equal(r.status, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /merged #77 as [0-9a-f]{7}/);
    assert.match(r.stdout, /attempt 1.*TLS handshake timeout/, 'the retry line names the attempt and error');
  });

  test('the title read answers empty: exit 5, gh pr merge never called', () => {
    const f = mergeFixture(0, { title: { empty: true } });
    const r = mergeOne(f);
    assert.equal(r.status, 5, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /couldn't read #77 from GitHub: gh returned nothing/);
    assert.ok(!/^pr merge/m.test(readFileSync(f.log, 'utf8')));
  });

  test('a PR that really is behind main: still exit 3 with the behind line', () => {
    const f = mergeFixture(0);
    writeFileSync(join(f.main, 'later.txt'), 'y\n');
    git(f.main, 'add', 'later.txt');
    git(f.main, 'commit', '-q', '-m', 'main moves on');
    git(f.main, 'push', '-q', 'origin', 'main');
    const r = mergeOne(f);
    assert.equal(r.status, 3, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('#77 is behind main; the lane must rebase and rerun local CI'), r.stdout);
  });

  test('a head sha git cannot compare is exit 5, not "behind"', () => {
    const f = mergeFixture(0, {});
    const gh = join(f.root, 'bin', 'gh');
    writeFileSync(gh, readFileSync(gh, 'utf8').replace(/(\*headRefOid\*\) ).*? ;;/, '$1echo deadbeefdeadbeefdeadbeefdeadbeefdeadbeef ;;'), { mode: 0o755 });
    const r = mergeOne(f);
    assert.equal(r.status, 5, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /couldn't read #77 from GitHub/);
    assert.doesNotMatch(r.stdout, /behind\s+main/);
  });

  test('a preview check that exits 2 (could not read): merge-one exits 5, not 4, no merge', () => {
    const f = mergeFixture(2);
    const r = mergeOne(f);
    assert.equal(r.status, 5, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /couldn't read #77 from GitHub/);
    assert.doesNotMatch(r.stdout, /preview\s+check\s+failed/);
    assert.ok(!/^pr merge/m.test(readFileSync(f.log, 'utf8')));
  });

  test('the post-merge check-runs read fails: exit 5, says #77 is already merged', () => {
    const f = mergeFixture(0, { api: { fail: 'connection reset' } });
    const r = mergeOne(f);
    assert.equal(r.status, 5, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.match(r.stdout, /merged #77 as [0-9a-f]{7}/);
    assert.match(r.stdout, /couldn't read #77 from GitHub: connection reset/);
    assert.match(r.stdout, /#77 is already merged/);
  });
});

describe('scripts/lanes/ guard', () => {
  test('no file names a session temp folder', () => {
    const files = readdirSync(LANES_SRC);
    assert.ok(files.length >= 6, `expected at least 6 files under scripts/lanes/, found ${files.length}`);
    for (const name of files) {
      const text = readFileSync(join(LANES_SRC, name), 'utf8');
      assert.ok(
        !text.includes('/private/tmp'),
        `scripts/lanes/${name} contains /private/tmp: use \${TMPDIR:-/tmp} or CI_SLOT_POOL instead of a session path`,
      );
      assert.ok(
        !text.includes('/Users/'),
        `scripts/lanes/${name} contains /Users/: find the main checkout with \`git worktree list\`, don't type a home path`,
      );
    }
  });
});
