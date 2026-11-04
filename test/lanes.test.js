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
