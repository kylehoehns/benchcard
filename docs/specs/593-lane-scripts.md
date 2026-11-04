# #593 — Batch-run scripts live in the repo, with one command to start a lane

Light-review brief (tooling only; nothing a coach sees).

## Issue

#593. The scripts that run a batch of tickets live in one session's temp
folder. Move them into `scripts/lanes/`, add `lane.sh` to start a lane, fix the
template's timing line, and point to them from `AGENTS.md`.

## What would settle it

1. `scripts/lanes/` holds `ci-local.sh`, `ci-slot.sh`, `merge-one.sh`,
   `rebase-skip-ok.sh`, `lane-template.txt` and `lane.sh`, and no file there
   contains the text `/private/tmp`. A test fails if one does.
2. `lane.sh 999 test-999 8399` (run in a throwaway clone with its own local
   `origin`) makes a worktree on branch `test-999` at `origin/main`'s commit,
   with `node_modules` linked to the main checkout's, and writes a prompt that
   names `999`, `test-999` and `8399` and has no `__NAME__` placeholder left.
   A test covers that.
3. A template with a placeholder `lane.sh` does not know makes it exit
   non-zero, name the placeholder, and leave no prompt and no worktree. A
   test covers that.
4. The template says local CI takes about 10 minutes (median 561 s across 74
   green runs, Nov 1-4), not about 3.
5. `AGENTS.md` has one line pointing to `scripts/lanes/` for batch runs.

## Seams

`test/lanes.test.js` under `node --test`: runs `scripts/lanes/lane.sh` with
bash against a fixture (a temp bare repo as `origin`, a clone of it as the
main checkout holding a copy of `scripts/lanes/` and a `node_modules` dir).
Item 1's scan is a guard (reads files, not behavior): `/new-guard` applies.

## Design and choices the issue left open

- **No session paths.** The slot pool moves from
  `/private/tmp/claude-501/...` to `${CI_SLOT_POOL:-/tmp/benchcard-ci-slots}`,
  shared by `ci-local.sh` and `ci-slot.sh`. It stays one fixed path, not under
  TMPDIR, because two lanes with different TMPDIRs would otherwise get two
  pools and the CPU limit would stop holding (review finding). Run logs go
  under TMPDIR. The main checkout is found with `git worktree list` (its first
  entry) instead of a typed home path; the guard also refuses `/Users/`.
- **Where a lane goes.** Worktree: `<main>-wt/<issue>` beside the main checkout
  (today's `benchcard-wt/<N>`). Prompt: `<main>-wt/lane-<issue>.txt`; the path
  is printed.
- **Placeholders.** `__N__`, `__WT__`, `__BRANCH__`, `__PORT__`, `__MAIN__`
  (main checkout, replacing the typed home path), `__LANES__` (the main
  checkout's `scripts/lanes`, so every lane calls one copy), `__EXTRA__`
  (contents of an optional 4th argument, a file of lane-specific text; empty
  without it). Anything still matching `__[A-Z]+__` after filling is a refusal.
- **Order.** Arguments are checked (issue and port are numbers; the branch and
  worktree do not exist yet) and the prompt is filled before the worktree is
  made, so a refusal leaves nothing behind.
- `lane.sh` is bash, so the test runs on CI's Ubuntu without zsh. The other
  four keep their zsh shebangs and are not run by the suite.

## Out of scope

Changing what the four scripts do. Running a lane end to end.
