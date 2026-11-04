/* The date the page-date checks (`check-sitemap-lastmod.mjs`,
   `check-about-date.mjs`) compare against: the day of the PR's own last
   commit, not of the commit HEAD happens to be.

   WHY. On a push to main HEAD is GitHub's squash commit, dated at merge time,
   so an evening PR that merges after midnight went red on main (#591 -> #592).
   A pull_request run has the same drift: HEAD is GitHub's test merge. The
   squash keeps no trace of the PR's commits in main's history, but GitHub
   keeps them at `refs/pull/<N>/head`.

   THE RULE, in order, each step falling to the next on any git failure:
     1. HEAD has two parents and its committer is GitHub (a PR test merge):
        `HEAD^2`. A local `git merge origin/main` tip also has two parents,
        but its `HEAD^2` is main's tip, so it falls through.
     2. HEAD's subject ends in `(#N)` and `git fetch origin refs/pull/N/head`
        works: the fetched commit.
     3. HEAD itself (a local run, or a direct push).
   Rebase-merge is not handled (it falls to HEAD); the repo squash-merges.
   The date is `%cs`, the commit's own offset. Returns YYYY-MM-DD, or null if
   even HEAD's date cannot be read. It never throws. */

import { execFileSync } from 'node:child_process';

const TIMEOUT = 30000;

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: TIMEOUT, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

const dateOf = (rev, cwd) => {
  const d = git(['log', '-1', '--format=%cs', rev], cwd);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

export function prCommitDate(cwd = process.cwd()) {
  try {
    if (git(['log', '-1', '--format=%cn', 'HEAD'], cwd) === 'GitHub') {
      const d = dateOf('HEAD^2', cwd);
      if (d) return d;
    }
  } catch {}
  try {
    const n = git(['log', '-1', '--format=%s', 'HEAD'], cwd).match(/\(#(\d+)\)\s*$/);
    if (n) {
      git(['fetch', '-q', 'origin', `refs/pull/${n[1]}/head`], cwd);
      const d = dateOf('FETCH_HEAD', cwd);
      if (d) return d;
    }
  } catch {}
  try { return dateOf('HEAD', cwd); } catch { return null; }
}
