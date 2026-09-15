# #46 — The edit hook blocks fetch.sh, the file it tells you to edit

## Issue

#46. `.claude/hooks/guard-edit.sh` denies every Edit or Write under
`app/vendor/`, including `fetch.sh`, the one file its own deny message says to
change.

## Goal

The hook blocks hand edits to what `fetch.sh` produces, and nothing else under
`app/vendor/`. An agent following the deny message's instruction is let
through instead of learning to route around the hook through the shell.

## What would settle it

- `guard-edit.sh` allows an Edit or Write to `/repo/app/vendor/fetch.sh` and
  to `/repo/app/vendor/README.md` (no decision printed).
- It still denies `/repo/app/vendor/motion.mjs`,
  `/repo/app/vendor/motion.umd.js`, `/repo/app/vendor/icons/x.svg` and
  `/repo/app/vendor/fonts/inter-latin-wght-normal.woff2`.
- Paths that only look like the two open files stay denied:
  `/repo/app/vendor/icons/fetch.sh`, `/repo/app/vendor/fetch.sh.bak`,
  `/repo/app/vendor/fonts/README.md`.
- `test/hooks.test.js` has ALLOW cases for both files and keeps its DENY
  cases for vendored output. Reverting the hook to the plain `*/app/vendor/*`
  deny turns the ALLOW test red, and was seen to.
- `evals/generated-files-have-one-editor.json` gains an `allow` check for
  `/repo/app/vendor/fetch.sh`, and `npm run evals` passes it.
- `app/vendor/icons/sun.svg`, `moon.svg` and `contrast.svg` are deleted.
  Nothing in the tree references them, and `fetch.sh` no longer fetches them.
- The `AGENTS.md` enforcement table row names the exception, so it no longer
  claims every file under `app/vendor/` is denied.
- `npm test` and `npm run smoke` pass.

Human decisions, 2026-09-15: `README.md` is opened as well as `fetch.sh`,
because it is hand-written (the licence table) and `fetch.sh` never writes
it. The drift-job gap found in the survey is #52, not this diff.

## Surfaces

Change:
- `.claude/hooks/guard-edit.sh`
- `test/hooks.test.js`
- `evals/generated-files-have-one-editor.json`
- `AGENTS.md`, the one row in "What is enforced" (and only that row)
- delete `app/vendor/icons/{sun,moon,contrast}.svg` (with `git rm`; the hook
  guards file tools, and deleting is a shell action)

Must not change:
- `app/vendor/fetch.sh`, anything else under `app/vendor/`, `app/sw.js`.
  None of the three icons is precached (`app/sw.js` precaches only
  `vendor/motion*` and the Inter fonts), so no `VERSION` bump.
- The budgets and chart-page arms of the hook.

## Constraints

- The hook fails closed without jq today. Keep that: the allow is a narrower
  deny, not an early `exit 0` placed before the jq check.
- Match the full basename under `app/vendor/` directly, not a substring or a
  `*fetch.sh*` glob — the lookalike paths above are the test of that.
- Keep the deny message pointing at `fetch.sh`; it is now true.
- A guard edit is `/new-guard` territory: the new ALLOW case must be seen
  red against the old pattern before the hook changes.
- The ALLOW list in `test/hooks.test.js` is load bearing (AGENTS.md, "What is
  enforced"). Add to it; do not reshape the existing cases.

## Design

Inside the existing `*/app/vendor/*` arm in `guard-edit.sh`, a nested `case`
on `"${path#*/app/vendor/}"` — the path with everything up to and including
the first `/app/vendor/` stripped. If that remainder is exactly `fetch.sh`
or `README.md`, the arm falls through without denying; anything else still
hits the original deny. Stripping to the first occurrence, rather than
matching a `*/app/vendor/fetch.sh` glob (where `*` matches `/`), is what
keeps nested lookalikes like `app/vendor/x/app/vendor/fetch.sh` denied.
The rest of the file is unchanged.

## Proof

- **`test/hooks.test.js`** (runs the real hook with JSON on stdin, under
  `node --test`): a new test that the two hand-written files are editable, and
  lookalike paths plus fonts/motion.umd.js added to the existing DENY loop.
  This covers the first four settle items. Red first against the current hook.
- **`npm run evals`**: the new allow check in
  `generated-files-have-one-editor.json`.
- **`git grep`** for `sun.svg`, `moon.svg`, `contrast.svg` (and the bare
  names as icon keys in `app/icons.js` and `fetch.sh`) returns nothing after
  the deletion.
- `npm test` then `npm run smoke -- --no-tests`, once, at commit.

## Out of scope

- The vendor-drift job missing a committed file that `fetch.sh` no longer
  produces (a stale file). That is #52.
- Shell writes bypassing the edit guards — that is #13.
