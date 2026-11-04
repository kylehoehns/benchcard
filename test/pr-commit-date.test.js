/* #594: the page-date checks use the PR's own last commit date, not the date
   of the squash/test-merge commit HEAD happens to be. Each test builds a
   throwaway git repo (with a bare "origin") and runs the two real scripts as
   child processes, judged by exit code. Made-up content only. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCRIPTS = ['check-sitemap-lastmod.mjs', 'check-about-date.mjs', 'pr-commit-date.mjs'];
const temps = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const sh = (cwd, args, date, committer = 't') => execFileSync('git', args, {
  cwd, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: committer,
    GIT_COMMITTER_EMAIL: 't@x', ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
}).trim();

const sitemap = (d) => `<urlset><url><loc>https://benchcard.app/about</loc><lastmod>${d}</lastmod></url></urlset>\n`;
const about = (d, body) => `<p>${body}</p><time datetime="${d}">${Number(d.slice(8))} November 2026</time>\n`;

function write(dir, body) {
  mkdirSync(join(dir, 'app'), { recursive: true });
  writeFileSync(join(dir, 'app/sitemap.xml'), sitemap('2026-11-03'));
  writeFileSync(join(dir, 'app/about.html'), about('2026-11-03', body));
}

/* kind 'squash': PR head pushed to origin refs/pull/591/head, main gets one
   squash commit "(#591)" dated after midnight. kind 'merge': HEAD is a merge
   of the PR head into base, dated the next day, committed by `committer`
   ('GitHub' = a PR test merge; a normal name = a local merge). With
   `decoy`, refs/pull/591/head holds a commit dated 2026-11-01 instead. kind 'plain': a commit
   on base with `subject`, no PR ref. Returns { work, base }. */
function replay({ kind, prDate = '2026-11-03T23:43:50-06:00', subject = 'Edit the page (#591)', committer = 'GitHub', decoy = false }) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'bc594-'));
  temps.push(root);
  const origin = join(root, 'origin.git'), build = join(root, 'build'), work = join(root, 'work');
  mkdirSync(build);
  sh(root, ['init', '--bare', '-q', '-b', 'main', origin]);
  sh(build, ['init', '-q', '-b', 'main']);
  write(build, 'one');
  sh(build, ['add', '-A']);
  sh(build, ['commit', '-qm', 'base'], '2026-11-02T10:00:00-06:00');
  const base = sh(build, ['rev-parse', 'HEAD']);
  const next = '2026-11-04T00:08:04-06:00';
  sh(build, ['checkout', '-q', '-b', 'pr']);
  write(build, 'two');
  sh(build, ['commit', '-qam', 'PR work'], prDate);
  if (kind === 'squash') {
    sh(build, ['push', '-q', origin, 'pr:refs/pull/591/head']);
    sh(build, ['checkout', '-q', 'main']);
    sh(build, ['checkout', 'pr', '--', '.']);
    sh(build, ['commit', '-qam', subject], next);
  } else if (kind === 'merge') {
    sh(build, ['checkout', '-q', 'main']);
    if (decoy) {
      sh(build, ['checkout', '-q', '-b', 'decoy', 'main']);
      sh(build, ['commit', '-q', '--allow-empty', '-m', 'decoy'], '2026-11-01T10:00:00-06:00');
      sh(build, ['push', '-q', origin, 'decoy:refs/pull/591/head']);
      sh(build, ['checkout', '-q', 'main']);
    }
    sh(build, ['merge', '--no-ff', '-q', 'pr', '-m', decoy ? 'Merge pull request (#591)' : 'Merge test'], next, committer);
  } else {
    sh(build, ['checkout', '-q', 'main']);
    sh(build, ['checkout', 'pr', '--', '.']);
    sh(build, ['commit', '-qam', subject], next);
  }
  sh(build, ['push', '-q', origin, 'main']);
  sh(root, ['clone', '-q', origin, work]);
  mkdirSync(join(work, 'scripts'));
  for (const f of SCRIPTS) if (existsSync(join(ROOT, 'scripts', f))) copyFileSync(join(ROOT, 'scripts', f), join(work, 'scripts', f));
  return { work, base };
}

const run = (script, { work, base }) => {
  const r = spawnSync('node', [join(work, 'scripts', script), base], { cwd: work, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.error, undefined, 'child process failed to run');
  return r;
};
const exitOf = (script, rep) => run(script, rep).status;
const both = ['check-sitemap-lastmod.mjs', 'check-about-date.mjs'];

for (const s of both) {
  test(`#591 replay: ${s} passes when the squash lands after midnight`, () => {
    const r = run(s, replay({ kind: 'squash' }));
    assert.equal(r.status, 0, r.stderr);
  });
  test(`${s} still fails when the PR's own last commit is on a later day`, () => {
    const r = run(s, replay({ kind: 'squash', prDate: '2026-11-04T09:00:00-06:00' }));
    assert.equal(r.status, 1, r.stdout);
  });
  test(`${s} on a PR test merge uses the second parent's date`, () => {
    assert.equal(exitOf(s, replay({ kind: 'merge' })), 0);
  });
  test(`${s} without (#N) falls back to HEAD's date`, () => {
    assert.equal(exitOf(s, replay({ kind: 'plain', subject: 'Edit the page' })), 1);
  });
  test(`${s} with (#N) but no such PR ref falls back to HEAD's date`, () => {
    assert.equal(exitOf(s, replay({ kind: 'plain', subject: 'Edit the page (#777)' })), 1);
  });
}

test('prCommitDate returns null, not a throw, outside a git repo', async () => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'bc594-nogit-'));
  temps.push(dir);
  const { prCommitDate } = await import('../scripts/pr-commit-date.mjs');
  assert.equal(prCommitDate(dir), null);
});

test('a local merge-from-main tip (normal committer) takes its date from HEAD, not HEAD^2', async () => {
  const { work } = replay({ kind: 'merge', committer: 'Someone' });
  const { prCommitDate } = await import('../scripts/pr-commit-date.mjs');
  assert.equal(prCommitDate(work), '2026-11-04');
});

test('HEAD^2 wins over a (#N) subject on a GitHub merge', async () => {
  const { work } = replay({ kind: 'merge', decoy: true });
  const { prCommitDate } = await import('../scripts/pr-commit-date.mjs');
  assert.equal(prCommitDate(work), '2026-11-03');
});
