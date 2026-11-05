# #613 — merge-one.sh says a PR is behind main when gh just failed to answer

Light-review brief (tooling only; nothing a coach sees). The batch runs light
review: quality-reviewer and doc-writer only.

## Issue

#613. On 2026-11-04 `merge-one.sh 610` printed `#610 is behind main` after
`gh pr view` timed out: the head sha came back empty, `git merge-base
--is-ancestor origin/main ""` failed, and the script read that failure as
"behind". A GitHub read that fails must stop with its own message and exit
code, never fall through to a check that misreports.

## What the survey found

- `merge-one.sh` runs with `set -u -o pipefail` but not `-e`, and never checks
  a `gh` exit status or an empty answer. Its `gh` reads: the head sha, the
  check rollup, the title (all before the merge) and the merge commit's check
  runs (after). `gh pr merge` is a write; its failure is exit 1 today.
- `git merge-base --is-ancestor` exits 1 for "not an ancestor" and 128 for an
  error (the issue's `fatal: Not a valid object name`). The script treats both
  as "behind".
- `git fetch -q origin "pull/$N/head"` reads from GitHub too; its failure is
  ignored today.
- An empty check rollup is a real answer (no checks have started yet); an
  empty head sha or title is not.
- `preview-check.mjs` reads `gh pr view` first with no catch, so a timeout
  rejects `main()`, the process exits 1, and merge-one reports `preview check
  failed` (exit 4) — the same kind of misreport. Its two `git fetch` calls
  sit inside the try, so their failure becomes a FAIL verdict. Its
  `waitForBuild` already retries a failed check-runs read for 20 minutes, but
  when every read failed it ends with "did not finish", which blames the build.
- Exit codes are documented in `merge-one.sh`'s header and in
  `.claude/skills/ship-feature/SKILL.md` § The merge step.

## What would settle it

1. **merge-one.sh, new exit 5: couldn't read from GitHub.** Every `gh` read
   (head sha, rollup, title, post-merge check runs) and the `git fetch` of
   `pull/N/head` goes through one helper. A failed call is retried: 3 tries,
   5 seconds apart, each retry printed as a line naming the attempt and the
   error. After the last try it prints `couldn't read #N from GitHub: <last
   error line>` and exits 5. An empty answer where one is required (head sha,
   title) counts as a failure (`gh returned nothing`); an empty rollup does
   not.
2. `git merge-base --is-ancestor` exiting 1 still prints `#N is behind main;
   the lane must rebase and rerun local CI` and exits 3. Any other non-zero
   exit is exit 5 with `couldn't read #N from GitHub: ...` naming the
   comparison, not "behind".
3. Exits 0-4 and their lines are unchanged: `#N red: ...` (1), `MAIN RED at
   ...` (2), behind (3), `#N preview check failed; not merged` (4), `merged #N
   as <sha7>` and `main green + deployed at <sha7>` (0). `gh pr merge` failing
   stays exit 1.
4. After the merge, a check-runs read that fails all 3 tries exits 5 with a
   message that says #N is already merged, so nobody re-runs the merge.
5. **preview-check.mjs, new exit 2: couldn't read from GitHub.** Its first
   `gh pr view` gets the same 3 tries / 5 seconds / printed retries, and an
   empty `headRefOid` or `headRefName` counts as a failure. After the last try
   it prints `couldn't read #N from GitHub: <error>`, posts no comment, and
   exits 2. A failed `git fetch` of `origin main` or `pull/N/head` is the same
   exit 2. `waitForBuild` reaching its cap with **every** read failed exits 2
   with that message instead of the "did not finish" FAIL. PASS stays 0,
   FAIL stays 1.
6. merge-one maps preview-check's exit 2 to its own exit 5 (`couldn't read #N
   from GitHub`), not exit 4. Any other non-zero stays exit 4.
7. The wait between retries reads `LANES_GH_RETRY_WAIT` (seconds, default 5)
   so the tests run with 0. Same variable in both scripts.

## Proof (seams)

- `test/lanes.test.js`, the existing fake-gh fixture (`mergeFixture`,
  `fakeGh`), extended so a test can make one call fail or answer empty:
  - head-sha read fails every time with `TLS handshake timeout` on stderr:
    exit 5, stdout has `couldn't read #77 from GitHub` and the error, does
    **not** say `behind main`, the gh log shows 3 head-sha calls and 2 retry
    lines are printed, `gh pr merge` never called. (Items 1, 2.)
  - head-sha read answers empty: exit 5, not "behind main". (Item 1.)
  - head-sha read fails once then answers: merges, exit 0. (Item 1.)
  - the title read answers empty: exit 5, no `gh pr merge`. (Item 1.)
  - a PR that really is behind main (a commit pushed to main after the PR
    ref): still exit 3 with the behind line. (Items 2, 3.)
  - preview stub exits 2: merge-one exit 5, not exit 4, no merge. (Item 6.)
  - the post-merge check-runs read fails: exit 5, stdout has `merged #77 as`
    and says it is merged. (Item 4.)
- preview-check.mjs run as a subprocess with a failing fake `gh` first on
  PATH (`LANES_GH_RETRY_WAIT=0`): exit 2, `couldn't read #77 from GitHub`,
  3 `pr view` calls, no `pr comment` call. Empty `headRefOid`: same.
  (Item 5.) The cap path of `waitForBuild` is a pure-ish decision: export a
  small helper that turns "reads tried / reads that failed" into the error to
  throw, and test it under `node --test` without waiting 20 minutes.

## Out of scope

- `gh pr merge` failure semantics (a write; stays exit 1).
- `ci-local.sh`, `lane.sh` and other scripts.
