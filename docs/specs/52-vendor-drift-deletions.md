# #52 — The vendor-drift job misses a file fetch.sh no longer produces

## Issue

#52. The drift job re-runs `app/vendor/fetch.sh` and reads `git status
--porcelain -- app/vendor`. That reports files that changed and files that
appeared, but never a committed file the script stopped writing: nothing
touches it, so git has nothing to report.

## Goal

`app/vendor/` is what `fetch.sh` produces and nothing else. Dropping a name
from the script makes the leftover file fail the drift job by name, in the same
run, instead of sitting in the repo until a human happens to notice.

## What would settle it

- Removing `coffee` from the icon list in `fetch.sh`, without deleting
  `app/vendor/icons/coffee.svg`, makes the drift job's steps exit non-zero and
  print ` D app/vendor/icons/coffee.svg`.
- The same holds for a leftover font (`fonts/inter-latin-ext-wght-normal.woff2`)
  and a leftover motion file (`motion.mjs`) — the hole is not icon-specific.
- On an unmodified tree, `sh app/vendor/fetch.sh` followed by `git status
  --porcelain -- app/vendor` prints nothing and exits 0. (Confirmed on
  `225d9e2`, 2026-09-15: the script ran clean and the tree did not move.)
- `app/vendor/README.md` and `app/vendor/fetch.sh` survive a run untouched.
  They are hand-written, the script never writes them, and a fix that deleted
  either would fail the job against a healthy tree.
- The two directions that already worked still work: a hand-edited vendored
  file reads ` M`, and an icon the script fetches but nobody committed reads
  `??`.
- Deleting the new line from `fetch.sh` turns a test in
  `test/ci-config.test.js` red.
- `npm test` and `npm run smoke` pass.

Human decisions, 2026-09-15: the fix clears **everything `fetch.sh` generates**
— `icons/`, `fonts/`, `motion.umd.js`, `motion.mjs` — not just `icons/` as the
issue proposed, because a name dropped from the font loop would linger
identically. An interrupted run leaving `app/vendor/` half-empty is **accepted**
rather than staged through a temp directory: the output is committed, so `git
restore app/vendor` is the whole recovery, and the staging dance is code with no
defect behind it.

## Surfaces

Change:
- `app/vendor/fetch.sh` — one `rm -rf` and its comment, at the top
- `test/ci-config.test.js` — one assertion pinning that line

Must not change:
- `.github/workflows/vendor-drift.yml`. The job is already correct: it exits 1
  on any non-empty `git status` and prints it. It reported nothing because
  there was nothing to report, which is a fetch.sh problem, not a job problem.
- `app/vendor/README.md`, and every vendored byte — a clean run must leave the
  tree identical.
- `app/sw.js`. No precached file changes: `fetch.sh` is not served, and the
  files it produces keep the same bytes. No `VERSION` bump.
- `test/dead-icon.test.js`. Its four directions stay as they are; see Out of
  scope.

## Constraints

- **`README.md` and `fetch.sh` are the only things under `app/vendor/` that are
  not output** (`/repo/app/vendor/` holds exactly these two plus `icons/`,
  `fonts/`, `motion.umd.js`, `motion.mjs`). The clear names its targets
  explicitly. It must never be `rm -rf *` or `rm -rf .`, which would eat both
  hand-written files — that is the load-bearing ALLOW case, in the sense
  `AGENTS.md` § "What is enforced" uses for `test/hooks.test.js`.
- `fetch.sh` runs under `set -e` after `cd "$(dirname "$0")"`, so the clear is
  relative to `app/vendor/` and a failure stops the script.
- `mkdir -p fonts` and `mkdir -p icons` already exist further down and recreate
  what the clear removes. `motion.umd.js` and `motion.mjs` are written by `-o`
  and a heredoc, so they need no directory.
- This is a guard, so `/new-guard` applies: run it green first, then make it go
  red deliberately, judge by **exit code**, and run it against every state the
  thing can be in — no leftover, a leftover icon, a leftover font, a leftover
  motion file, plus the ` M` and `??` directions that already worked.
- Reuse the drift job's own two steps as the harness. Do not re-derive its
  logic in a test; run `sh app/vendor/fetch.sh` and `git status --porcelain --
  app/vendor` exactly as the YAML does.

## Design

At the top of `app/vendor/fetch.sh`, immediately after `cd "$(dirname "$0")"`:

```sh
# Everything below is generated. Clear it first, so a file this script no
# longer produces shows up as a deletion rather than sitting here forever:
# `git status` cannot see a leftover any other way, and the drift job is only
# as good as what git reports. README.md and this script are the only things
# in app/vendor/ that are not output. An interrupted run leaves this directory
# half-empty; `git restore app/vendor` puts it back.
rm -rf icons fonts motion.umd.js motion.mjs
```

Nothing else in the script moves. The drift job is untouched: with the clear in
place, a leftover is a deletion, and the job already fails on any non-empty
`git status`.

The `test/ci-config.test.js` assertion pins the line so the hole cannot reopen
silently, which is the issue's "nothing stops the next one". That file already
guards CI configuration that can drift without anything noticing, and already
reads `vendor-drift.yml`, so the pin has one home rather than a new one.

## Proof

- **The drift job's own steps, run locally** — `sh app/vendor/fetch.sh` then the
  job's `git status --porcelain -- app/vendor` conditional, judged by `$?`.
  This is the seam for every settle item about the job going red or green. Six
  arms: clean (green, exit 0), leftover icon, leftover font, leftover motion
  file, hand-edited file (` M`), uncommitted fetched file (`??`) — the last five
  red, each naming the file. Each arm restores with `git restore app/vendor` and
  reads the tree back to clean before the next.
- **`README.md` and `fetch.sh` still present and byte-identical** after a full
  run — checked in the clean arm, by `git status` being empty and both files
  existing.
- **`test/ci-config.test.js`** under `node --test`: a source-reading assertion,
  named here as a seam per `/new-guard`. Red first — seen to fail against
  `fetch.sh` without the `rm -rf` line, before the line is added.
- `npm test` then `npm run smoke -- --no-tests`, once, at commit.

## Out of scope

- **A fifth direction in `test/dead-icon.test.js`** ("every vendored `.svg` is
  named in `fetch.sh`'s list"). It would catch the icon case a second time, and
  one answer lives in one place. `fetch.sh` clearing its own output is the
  answer, and it covers fonts and motion too.
- **Rewriting the drift job.** It was right; its input was wrong.
- **Shell writes bypassing the edit guards** — that is #13.
- **A new mark for the app icons** — that is #44.
