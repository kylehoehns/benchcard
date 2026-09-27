# #176 — Rebasing after a merge no longer needs a full local run

## Issue

#176. Every PR that changes a precached file edits `VERSION` and `SHELL` in
`app/sw.js`, so any two open PRs conflict there; make that conflict resolve
itself and make the bump one command.

## Goal

After one PR merges, the next one rebases with no hand-edited conflict, fixes
`SHELL` with one command, and proves it with `npm test` alone, not the
13-minute full run.

## Decisions

The maintainer chose **driver + one command**:

- **A merge driver can't compute `SHELL`.** Git runs it file by file, so the
  other precached files are not final yet when it runs. So the driver only
  clears the conflict: `VERSION` becomes the higher of the two sides plus one,
  and `SHELL` keeps either side's value (it will be fixed next).
- **Then `npm run sw:bump`** sets `VERSION` to `main`'s plus one and `SHELL` to
  the real digest. Then `npm test`.
- **The ticket's "no hand edits" means "no hand-edited conflict".** Running
  `npm run sw:bump` after the rebase is expected, not a hand edit.
- **`sw:bump` does not run `npm test` to learn the digest** (the ticket's
  wording). It computes the digest directly, from one shared module that
  `test/sw.test.js` also imports. One answer in one place, and seconds instead
  of the whole suite.
- **The driver needs one-time setup per clone.** `.gitattributes` names the
  driver, but git only runs it once `git config merge.<name>.driver` is set.
  The package has no dependencies, so an npm `prepare` hook would not run
  reliably. `npm run setup` registers it; `AGENTS.md` says to run it once.
  Without it, git falls back to its normal text merge — today's behavior, so
  nothing breaks.

## What would settle it

1. **Two bumps rebase cleanly.** In a throwaway git repo: base `sw.js` at
   `VERSION '388'`; branch A and branch B each change only `VERSION` to `'389'`
   and `SHELL` to different values. With the driver registered, `git rebase A`
   on B finishes with exit 0 and no conflict markers; the result has
   `VERSION '390'`.
2. **Non-overlapping edits still merge.** Same setup, but B also adds a line to
   `PRECACHE` that A did not touch: the rebase is clean and the result has
   B's `PRECACHE` line and `VERSION '390'`.
3. **A real conflict is still reported.** Same setup, but A and B change the
   same other line of `sw.js` differently (for example the same `PRECACHE`
   entry): the rebase stops, `git status` shows `app/sw.js` unmerged, and the
   file has conflict markers around that line.
4. **`sw:bump` sets both constants.** In a throwaway repo with an `app/` whose
   `sw.js` precaches a few files and `main` at `VERSION '388'`: after changing
   a precached file and running the bump, `VERSION` is `'389'` and `SHELL`
   equals the shared digest of the files on disk. Running it twice gives the
   same file (idempotent). Other bytes of `sw.js` are unchanged.
5. **One digest.** `test/sw.test.js`'s SHELL test and `sw:bump` both import
   the digest from the same module; on this repo's current tree they agree
   with the pinned `SHELL`.
6. `npm test` passes; the smoke suite passes (nothing a coach sees changes).

## Surfaces

Change:

- `scripts/sw-shell.mjs` (new) — the shared digest, and the parse/rewrite of
  the two constants.
- `scripts/sw-bump.mjs` (new) — `npm run sw:bump`.
- `scripts/sw-merge.mjs` (new) — the merge driver.
- `scripts/setup.mjs` (new) or an inline `npm run setup` — registers the driver.
- `.gitattributes` (new) — `app/sw.js merge=sw-version`.
- `package.json` — `sw:bump` and `setup` scripts.
- `test/sw.test.js` — imports the digest instead of defining it.
- `test/sw-bump.test.js` (new) — the bump and the driver.
- `AGENTS.md` § Traps; `.claude/skills/ship-feature/SKILL.md` § A batch of
  tickets; `.claude/hooks/after-edit.sh`'s reminder text — name the command.
  (The orchestrator edits these, not the developer.)

Must not change: anything under `app/` (so no `VERSION`/`SHELL` bump in this
PR), `scripts/check-sw-version.mjs`'s behavior.

## Constraints

- **Reuse, do not re-derive.** `parseVersion` already exists in
  `scripts/check-sw-version.mjs`; import it. The digest moves out of
  `test/sw.test.js` into `scripts/sw-shell.mjs` byte-for-byte in what it
  hashes (paths keep their `./` prefix, `./` itself and `./sw.js` are skipped,
  sorted, `path \0 bytes \0`), so the pinned `SHELL` `'237adcb475bd'` still
  matches with no bump.
- **Nothing outside `app/` is deployed** (`wrangler.jsonc`), so the new files
  never ship.
- **No dependencies.** Node built-ins and `git` only.
- The driver never runs `npm test` or reads other files in the tree; it works
  on the three files git hands it (`%O %A %B`).
- `sw:bump` reads `main`'s `VERSION` from `origin/main` by default (a ref can
  be passed as an argument). If it can't read the ref, it exits non-zero with a
  message naming the ref; it never guesses.
- Tests that build throwaway repos do it under `os.tmpdir()`, set
  `user.name`/`user.email` locally in that repo, and clean up.

## Design

**`scripts/sw-shell.mjs`** exports:

- `shellDigest(appDirUrl, swSource)` → `{ digest, count }`, the exact
  algorithm now in `test/sw.test.js`.
- `setConstants(swSource, { version, shell })` → the source with only those
  two string literals replaced. Throws if either constant is missing.

**`scripts/sw-bump.mjs [base-ref]`**: reads `app/sw.js`, reads `VERSION` at
`<base-ref>:app/sw.js` (default `origin/main`), writes `VERSION` = that plus
one and `SHELL` = the digest. Prints the old and new values of both.

**`scripts/sw-merge.mjs %O %A %B`**: replaces the value of each side's
`VERSION` and `SHELL` with a fixed placeholder, runs `git merge-file` on the
three placeholder copies, then puts back `VERSION` = max(A, B) + 1 and
`SHELL` = A's. Writes the result to `%A`. Exit 0 if `git merge-file` was
clean, non-zero (leaving its conflict markers) if not. During a rebase `%A`
is the upstream side and `%B` is the commit being replayed; the result does
not depend on which is which.

**`npm run setup`**: `git config merge.sw-version.name` and
`git config merge.sw-version.driver "node scripts/sw-merge.mjs %O %A %B"`.
Worktrees share the clone's config, so once per clone is enough.

**`AGENTS.md` § Traps**, beside the precache bump: run `npm run setup` once
per clone; after a rebase, run `npm run sw:bump`; if the rebase changed
nothing in the tree except `app/sw.js`'s two constants, `npm test` is the
whole proof — its `SHELL` guard proves the digest — and the smoke suite need
not run again.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| driver in a throwaway repo with `git rebase` | `test/sw-bump.test.js` under `node --test` | 1, 2, 3 |
| `sw-bump.mjs` run as a child process in a throwaway repo | `test/sw-bump.test.js` | 4 |
| `setConstants` on strings | `test/sw-bump.test.js` | 4 (only two literals change) |
| `test/sw.test.js` SHELL test using the import | `npm test` | 5 |
| the proof pair | orchestrator | 6 |

## Out of scope

- Auto-running `sw:bump` from the driver or a git hook.
- Changing how `VERSION` is checked in CI.
- Removing the conflict on other files two PRs both touch.
