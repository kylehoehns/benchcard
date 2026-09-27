import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setConstants } from '../scripts/sw-shell.mjs';

const SW_BUMP = new URL('../scripts/sw-bump.mjs', import.meta.url).pathname;
const SW_MERGE = new URL('../scripts/sw-merge.mjs', import.meta.url).pathname;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

const readSw = (dir) => readFileSync(join(dir, 'app', 'sw.js'), 'utf8');
const rmRepo = (dir) => rmSync(dir, { recursive: true, force: true });
const runBump = (dir, ref) => execFileSync('node', ref ? [SW_BUMP, ref] : [SW_BUMP], { cwd: dir, encoding: 'utf8' });

/* A fresh git repo under os.tmpdir(), with its own local identity -- never
   this clone's -- and an empty app/ directory. Both makeRepo and
   makeMergeRepo start from this. */
function initRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  mkdirSync(join(dir, 'app'), { recursive: true });
  return dir;
}

/* A throwaway repo with app/index.html and app/app.js on disk and an
   app/sw.js precaching both, committed on `main`. Every sw-bump test builds
   one of these fresh. */
function makeRepo(version) {
  const dir = initRepo('sw-bump-');
  writeFileSync(join(dir, 'app', 'index.html'), '<!doctype html>\n');
  writeFileSync(join(dir, 'app', 'app.js'), 'console.log(1);\n');
  writeFileSync(join(dir, 'app', 'sw.js'), swFixture(version, 'placeholder'));
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'base'], dir);
  return dir;
}

function swFixture(version, shell, { extra = [], appEntry = './app.js' } = {}) {
  return [
    `const VERSION = '${version}';`,
    `const SHELL = '${shell}';`,
    '',
    'const CACHE = `benchcard-v${VERSION}-${SHELL}`;',
    '',
    'const PRECACHE = [',
    "  './',",
    "  './index.html',",
    `  '${appEntry}',`,
    ...extra.map((e) => `  '${e}',`),
    '];',
    '',
  ].join('\n');
}

// Independently worked out: sha256 of './app.js' + '\0' + its bytes + '\0' +
// './index.html' + '\0' + its bytes + '\0', sliced to 12 hex chars -- the
// exact fixture bytes above, computed once with `node -e` outside this test.
const FIXTURE_DIGEST = '6c012de70fa3';

/* setConstants is the one place VERSION and SHELL are ever rewritten by
   machine -- scripts/sw-bump.mjs and scripts/sw-merge.mjs (#176) both call
   it instead of hand-rolling their own replace. These tests pin its
   contract: it touches only the two literals, and it refuses to guess when
   either constant is missing. */

const FIXTURE = [
  "const VERSION = '388';",
  "const SHELL = '237adcb475bd';",
  '',
  "const CACHE = `benchcard-v${VERSION}-${SHELL}`;",
  '',
  "const PRECACHE = [",
  "  './',",
  "  './index.html',",
  '];',
  '',
].join('\n');

test('setConstants rewrites only VERSION and SHELL', () => {
  const out = setConstants(FIXTURE, { version: '389', shell: 'abc123def456' });
  assert.match(out, /const VERSION = '389';/);
  assert.match(out, /const SHELL = 'abc123def456';/);
  // everything else in the fixture is byte-identical
  const untouched = out
    .replace("const VERSION = '389';", "const VERSION = '388';")
    .replace("const SHELL = 'abc123def456';", "const SHELL = '237adcb475bd';");
  assert.equal(untouched, FIXTURE);
});

test('setConstants throws when VERSION is missing', () => {
  const noVersion = FIXTURE.replace("const VERSION = '388';", '');
  assert.throws(() => setConstants(noVersion, { version: '389', shell: 'x' }));
});

test('setConstants throws when SHELL is missing', () => {
  const noShell = FIXTURE.replace("const SHELL = '237adcb475bd';", '');
  assert.throws(() => setConstants(noShell, { version: '389', shell: 'x' }));
});

test('sw-bump sets VERSION to the base ref plus one and SHELL to the digest of the files on disk', () => {
  const dir = makeRepo('388');
  try {
    runBump(dir, 'main');
    const sw = readSw(dir);
    assert.match(sw, /const VERSION = '389';/);
    assert.match(sw, new RegExp(`const SHELL = '${FIXTURE_DIGEST}';`));
  } finally {
    rmRepo(dir);
  }
});

test('running sw-bump twice is idempotent', () => {
  const dir = makeRepo('388');
  try {
    runBump(dir, 'main');
    const first = readSw(dir);
    runBump(dir, 'main');
    const second = readSw(dir);
    assert.equal(second, first);
  } finally {
    rmRepo(dir);
  }
});

test('sw-bump changes only the VERSION and SHELL lines', () => {
  const dir = makeRepo('388');
  try {
    const before = readSw(dir);
    runBump(dir, 'main');
    const after = readSw(dir);
    const restored = after
      .replace("const VERSION = '389';", "const VERSION = '388';")
      .replace(`const SHELL = '${FIXTURE_DIGEST}';`, "const SHELL = 'placeholder';");
    assert.equal(restored, before);
  } finally {
    rmRepo(dir);
  }
});

test('sw-bump defaults to origin/main when no ref is given', () => {
  const dir = makeRepo('388');
  try {
    // Fake an "origin/main" remote-tracking ref without a network round trip:
    // point it at the base commit directly.
    const sha = git(['rev-parse', 'HEAD'], dir).trim();
    git(['update-ref', 'refs/remotes/origin/main', sha], dir);
    runBump(dir);
    const sw = readSw(dir);
    assert.match(sw, /const VERSION = '389';/);
  } finally {
    rmRepo(dir);
  }
});

test('sw-bump exits non-zero naming the ref when it cannot be read', () => {
  const dir = makeRepo('388');
  try {
    assert.throws(
      () => execFileSync('node', [SW_BUMP, 'no-such-ref'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }),
      (err) => {
        assert.notEqual(err.status, 0);
        assert.match(err.stderr.toString(), /no-such-ref/);
        return true;
      },
    );
  } finally {
    rmRepo(dir);
  }
});

/* ------------------------------------------------------------------ *
 * The merge driver: two open PRs bumping VERSION/SHELL no longer
 * conflict with each other on rebase.
 * ------------------------------------------------------------------ */

/* A throwaway repo with app/sw.js and a .gitattributes naming the driver,
   committed on `main`, with the driver registered via LOCAL git config in
   that repo only -- this clone's config is never touched. */
function makeMergeRepo() {
  const dir = initRepo('sw-merge-');
  writeFileSync(join(dir, 'app', 'sw.js'), swFixture('388', 'base'));
  writeFileSync(join(dir, '.gitattributes'), 'app/sw.js merge=sw-version\n');
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'base'], dir);
  git(['config', 'merge.sw-version.name', 'sw version bump merge driver'], dir);
  git(['config', 'merge.sw-version.driver', `node ${SW_MERGE} %O %A %B`], dir);
  return dir;
}

test('two branches that each bump VERSION rebase cleanly, ending one past both', () => {
  const dir = makeMergeRepo();
  try {
    git(['checkout', '-q', '-b', 'branch-a'], dir);
    writeFileSync(join(dir, 'app', 'sw.js'), swFixture('389', 'shell-a'));
    git(['commit', '-q', '-am', 'bump on a'], dir);

    git(['checkout', '-q', 'main'], dir);
    git(['checkout', '-q', '-b', 'branch-b'], dir);
    writeFileSync(join(dir, 'app', 'sw.js'), swFixture('389', 'shell-b'));
    git(['commit', '-q', '-am', 'bump on b'], dir);

    const result = spawnSync('git', ['rebase', 'branch-a'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, `git rebase exit: ${result.status}\n${result.stdout}\n${result.stderr}`);
    const sw = readSw(dir);
    assert.doesNotMatch(sw, /<{7}/, 'no conflict markers after a clean rebase');
    assert.match(sw, /const VERSION = '390';/);
  } finally {
    rmRepo(dir);
  }
});

test('a PRECACHE line B adds and A never touched still rebases cleanly, keeping B\'s line', () => {
  const dir = makeMergeRepo();
  try {
    git(['checkout', '-q', '-b', 'branch-a'], dir);
    writeFileSync(join(dir, 'app', 'sw.js'), swFixture('389', 'shell-a'));
    git(['commit', '-q', '-am', 'bump on a'], dir);

    git(['checkout', '-q', 'main'], dir);
    git(['checkout', '-q', '-b', 'branch-b'], dir);
    writeFileSync(join(dir, 'app', 'sw.js'), swFixture('389', 'shell-b', { extra: ['./extra.js'] }));
    git(['commit', '-q', '-am', 'bump and precache a new file on b'], dir);

    const result = spawnSync('git', ['rebase', 'branch-a'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, `git rebase exit: ${result.status}\n${result.stdout}\n${result.stderr}`);
    const sw = readSw(dir);
    assert.doesNotMatch(sw, /<{7}/, 'no conflict markers after a clean rebase');
    assert.match(sw, /'\.\/extra\.js',/, "B's PRECACHE addition survives");
    assert.match(sw, /const VERSION = '390';/);
  } finally {
    rmRepo(dir);
  }
});

test('the same PRECACHE entry changed differently on both sides is still a real conflict', () => {
  const dir = makeMergeRepo();
  try {
    git(['checkout', '-q', '-b', 'branch-a'], dir);
    writeFileSync(join(dir, 'app', 'sw.js'), swFixture('389', 'shell-a', { appEntry: './widget.js' }));
    git(['commit', '-q', '-am', 'rename the entry on a'], dir);

    git(['checkout', '-q', 'main'], dir);
    git(['checkout', '-q', '-b', 'branch-b'], dir);
    writeFileSync(join(dir, 'app', 'sw.js'), swFixture('389', 'shell-b', { appEntry: './gadget.js' }));
    git(['commit', '-q', '-am', 'rename the entry differently on b'], dir);

    const result = spawnSync('git', ['rebase', 'branch-a'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'a real conflict must stop the rebase');

    const status = git(['status', '--porcelain'], dir);
    assert.match(status, /^UU app\/sw\.js/m, 'git status must show app/sw.js unmerged');

    const sw = readSw(dir);
    assert.match(sw, /<{7}/, 'the conflicting line must carry conflict markers');
    assert.match(sw, /widget\.js/);
    assert.match(sw, /gadget\.js/);
  } finally {
    spawnSync('git', ['rebase', '--abort'], { cwd: dir });
    rmRepo(dir);
  }
});
