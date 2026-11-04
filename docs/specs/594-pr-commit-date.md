# 594 — Page date checks use the PR's own last commit date

Small-lane brief (tooling only; no coach sees it).

**Issue** — #594: `scripts/check-sitemap-lastmod.mjs` and
`scripts/check-about-date.mjs` compare page dates against HEAD's commit date.
On a push to main HEAD is GitHub's squash commit, dated at merge time, so an
evening PR that merges after midnight goes red on main (#591 -> #592).

## What the survey found

- **Squash commits do not keep the PR's date.** `0030226` (#591's squash) has
  author date == committer date == `2026-11-04T00:08:04-06:00`, the merge
  time. So "use the author date" is falsified; it does not help.
- **The PR's commits are not in main's history** after a squash, but GitHub
  keeps them at `refs/pull/<N>/head`. `git fetch origin refs/pull/591/head`
  gives `a24d77a`, committed `2026-11-03T23:43:50-06:00` -> `2026-11-03`,
  the day #591's sitemap dates named.
- **The squash subject ends in `(#<N>)`** — GitHub's default and the batch
  merge command in `ship-feature` both put it there.
- **On a pull_request run HEAD is GitHub's test merge** (two parents; second
  parent is the PR head; committer `GitHub`, dated when the test merge was
  built, e.g. #603's). Its date has the same drift, so the PR side gets the
  same rule.
- The issue says the merge commit is dated "in UTC". It is dated in the
  committer's offset (-06:00); the #591 merge happened at 00:08 local. The
  fix does not depend on which.

## The rule (one place, used by both checks)

The check date is the date (`%cs`, the commit's own offset) of **the PR's last
commit**, found like this:

1. HEAD has two parents (a PR test merge): use `HEAD^2`.
2. Else HEAD's subject ends in `(#N)` and `git fetch origin refs/pull/N/head`
   succeeds: use that fetched commit.
3. Else: HEAD itself (a local branch run, or a direct push).

Any git failure in steps 1-2 falls through to the next step, never throws.
It lives in one new module, `scripts/pr-commit-date.mjs`, and both checks
import it; neither keeps its own `git log -1 --format=%cs HEAD`.

Trade-off the issue accepted: a page may name a date one day before it went
live.

## Acceptance values and the seam that tests each

| Value | Seam |
| --- | --- |
| #591 replay: base sitemap already says `2026-11-03` for a page; a PR head commit dated `2026-11-03T23:43:50-06:00` changes that page and leaves the date; squash commit `... (#591)` dated `2026-11-04T00:08:04-06:00` on main. `check-sitemap-lastmod.mjs <base>` exits **0** (it exits 1 before the fix). | `node --test`: a temp git repo with a bare "origin" holding `refs/pull/591/head`, the script copied in, run as a child process, judged by exit code |
| Same replay for About's dateline: `check-about-date.mjs <base>` exits **0** (1 before). | same harness |
| Guard still bites: same replay but the PR head is dated `2026-11-04` -> both exit **1**. | same harness |
| PR test merge (two parents, merge dated next day): date comes from `HEAD^2`. | same harness or unit test of the module |
| No `(#N)` / unfetchable ref: falls back to HEAD's date. | unit/harness test of the module |
| Both checks use the one module. | the harness runs both scripts against the same repos |

## Out of scope

Workflow changes (none needed: checkout keeps credentials and the repo is
public, so the fetch works), the What's new guard, any app file.

No coach note: a date that search engines read; nothing a coach sees.
