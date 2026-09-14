# 40 — Smoke `--only`, and don't re-run proof that already exists

## Issue

#40: let the smoke suite run a single check while iterating, and stop agents
re-running full suites against a tree that has already been proven green.

## Goal

No coach sees any of this. The goal is a shorter ship loop: an agent iterating
on one smoke check runs that check, not all 21; the full suite runs at the
points that prove something; and an agent handed a proven tree does not prove it
again. The full suite still stands between every change and its PR, and CI
still runs all of it.

## What would settle it

### 1. `--only`

1. `node scripts/smoke.mjs --only "bench mode wake lock"` runs the setup that
   check needs (the cold `SEED` load, then `goRich`) and that check, and no
   other pass. The printed table has exactly one row, `bench mode wake lock`.
2. The header of a partial run reads exactly
   `benchcard smoke — 390×844, 1 of 21 checks (--only)`. `21` is the number of
   rows a full `npm run smoke` prints, taken from the check registry (Design),
   not typed as a literal. A full run's header is unchanged:
   `benchcard smoke — 390×844, 21 checks`.
3. Matching is exact, on the full row name. `--only "nope"` exits non-zero,
   prints every valid `--only` name one per line, and launches neither the
   server nor Chrome. It never prints a table.
4. The valid `--only` names are the 16 browser-check rows. `no console errors`,
   the three budget rows and `node --test` are not valid: each is refused as in
   3, with the list.
5. `--only` implies `--no-tests` and skips the three budget checks. Below the
   table, the output says both: `skipped: node --test (--only implies
   --no-tests), 3 budget checks (--only)`.
6. Console errors recorded during a partial run (our origin only; third-party
   stays ignored as today) are **not** a row and do not change the row's
   verdict. They print below the table as
   `console errors during this run: N — <first 4, joined with " | ">` and the
   process exits 1. With `--json`, they are a `consoleErrors` array on the
   report, not an entry in `checks`.
7. `--only` with `--update-budgets` exits non-zero with a message saying the two
   cannot be combined, before launching the server or Chrome.
8. A test in `test/ci-config.test.js` fails if any file under
   `.github/workflows/` invokes the smoke suite (`smoke.mjs` or `npm run smoke`)
   with `--only`.
9. A full run without `--only` prints the same 21 rows, in the same order, as
   `main` at 727dedb (20 with `--no-tests`).
10. A full run checks the names it printed against the registry. If a row
    exists that the registry does not name, or the registry names a row the
    run did not print, the run prints which and exits non-zero. Skipped under
    `--update-budgets`, whose budget rows differ by design; `node --test` is
    excluded from the comparison under `--no-tests`.
11. `guard-falsifier` shows these going red: the unknown-name exit (3), the CI
    ban (8), and the registry drift check (10).
12. `AGENTS.md` § Layout, where it describes `npm run smoke`, says what `--only`
    is for, that a partial run proves nothing about the suite, and that the full
    run is still required before a PR.

### 2. Don't re-run proof you already have

13. **The proof pair.** Wherever `/ship-feature` or an agent file asks for proof
    that the tree is green, it is `npm test` followed by
    `npm run smoke -- --no-tests`. The suite runs once, not twice. `AGENTS.md`
    says this once, next to the `--only` text in 12.
14. **Proof points commit.** `/ship-feature` proves the tree green (the proof
    pair) and then commits the change on the issue branch — explicit paths, no
    trailers — at two points: after the refactorer hands back (before step 7),
    and after the fix pass (step 8). Step 10 pushes the commits already made
    rather than making one. At each proof point it records the handoff:
    - `HEAD` (`git rev-parse HEAD`), and that `git status --porcelain` printed
      nothing;
    - the `ℹ tests`, `ℹ pass` and `ℹ fail` lines `npm test` printed;
    - the smoke table as printed.
    Every agent launched after a proof point gets that handoff verbatim.
15. **Agents that change code** (`developer`, `tester`, `refactorer`) iterate
    with `node --test <file>` and `node scripts/smoke.mjs --only "<check>"`,
    and run the proof pair once before handing back — the smoke half only if
    they touched `app/` or `scripts/smoke*`. The iterate-then-prove rule lives
    in `AGENTS.md` (13); the three agent files point at it.
16. **The refactorer** runs the proof pair once at the end of Phase 1 and once
    at the end of Phase 2, not per step. While iterating it runs the test files
    that import or read what it touched (a grep over `test/` for each touched
    path) and `--only` for the smoke checks covering touched `app/` or
    `scripts/smoke*` code. A red proof pair is bisected with targeted runs, and
    the offending step reverted, as today.
17. **The claim-checker**, given a handoff: for a claim about a whole suite
    ("`npm test` passes", "smoke is green") it runs `git rev-parse HEAD` and
    `git status --porcelain` itself. On a matching sha and empty status it
    returns **SUPPORTED**, citing the recorded output and its own two commands.
    On a mismatch the recorded output is **NOT EVIDENCE** and it re-runs. A
    claim about what a specific check or test covers is still checked with
    `--only` or `node --test <file>`: the table says a row passed, not what the
    row tests. `claim-checker.md` states this as the one exception, beside its
    **NOT EVIDENCE** bullet.
18. **`guard-falsifier`** runs a smoke guard's mutations with
    `--only "<the guard's check>"`, and the full suite only on the healthy tree
    at the start and the restored tree at the end.
19. The three reviewers and `doc-writer` are unchanged (they have no Bash).
20. `npm test` is green, including `test/sdlc.test.js`, `test/hooks.test.js`
    and `test/one-answer.test.js`.

## Surfaces

Change:

- `scripts/smoke.mjs` — the registry, `--only` parsing and validation ahead of
  `serve()`, the partial-run path through `browserChecks`, the header, the
  below-table notes, the drift check.
- `test/` — a new test for the flag handling (spawns `smoke.mjs` for 3, 4 and
  7, which never reach Chrome), and the CI ban in `test/ci-config.test.js`.
- `AGENTS.md` — § Layout: `--only`, the proof pair, the iterate-then-prove rule.
- `.claude/skills/ship-feature/SKILL.md` — steps 6–10: proof points, commits,
  the handoff and who receives it.
- `.claude/agents/developer.md`, `tester.md`, `refactorer.md`,
  `claim-checker.md`, `guard-falsifier.md`.

`AGENTS.md`, `.claude/skills/` and `.claude/agents/` are not in any agent's
**Writes** column. For this change the `developer` writes them.

Must not change:

- `.github/workflows/*.yml` — CI keeps running the full suite.
- `scripts/smoke-checks.js`, `scripts/budgets.mjs`, `scripts/budgets.json`, and
  every allow map, threshold and pass body in `smoke.mjs`. `--only` changes
  which passes run, never what a pass checks.
- The reviewer and `doc-writer` agent files.
- `app/` — nothing is precached, so no `VERSION`/`SHELL` bump.
- `AGENTS.md` § Judgement ("another agent's report is not proof") stays as is.

## Constraints

- **One answer in one place.** The row names are defined once. The registry
  must be derived from the same constants the passes use (`NARROW`,
  `SWEEP_FLOOR`, `SWEEP_HI`, `TOUCH_WIDTHS`, `LARGE_TEXT_WIDTH`,
  `LARGE_TEXT_PX`), and each pass's returned `name` should come from the
  registry rather than a second template string. The `21` in the header is
  computed. The proof pair and the iterate-then-prove rule live in `AGENTS.md`;
  the handoff format lives in `/ship-feature`; agent files point at both rather
  than restating them.
- **Do not reorder the full run.** The fixture split (budget snapshot → `goRich`
  → rich passes), the reload after `wakeLockPass`, `appLargeTextPass` before
  `staticPass`, and `no console errors` unshifted last are all load-bearing and
  commented in `browserChecks`. The partial path reuses the same setup calls; it
  does not reimplement them.
- **The in-page checks run as one evaluate.** An `--only` for one of the seven
  `smoke-checks.js` rows (or the informational first-contentful-paint row) runs
  that evaluate and keeps one row. Do not split `smoke-checks.js`.
- **`touch targets ≥ 44px`** (the single-viewport in-page row) is filtered out of
  every full run, so it is not a valid `--only` name. The swept
  `touch targets ≥ 44px, 320–390px` is.
- **`/new-guard`** for every new guard: the flag test, the CI ban, and the
  drift check are each run green, then broken, then restored.
- **Hooks.** Commits at proof points use explicit paths and no trailers —
  `guard-bash.sh` denies the rest. `--only` with `--update-budgets` must not
  weaken the blanket-`--update-budgets` deny.

## Design

**Registry.** A frozen, ordered list in `smoke.mjs` of the 21 rows a full run
prints, each with whether `--only` may name it and which setup it needs
(`cold`: the `SEED` load and `smoke-checks.js`; `rich`: the `SEED` load, then
`goRich` — every pass that runs after the fixture split in a full run, so a
partial run sees the state the full run gives that pass on arrival, as far as a
fresh `goRich` reproduces it). Row names come from here.

**Arguments.** Parse `--only <name>` before `serve()`. Refuse (exit 1, before
any server or Chrome) an unknown or non-selectable name, printing the valid
names, and `--only` combined with `--update-budgets`.

**Partial path.** `browserChecks` takes the selected entry. It always does the
cold load (the page must boot); it runs the in-page evaluate and keeps only the
selected row if the entry is `cold`; it calls `goRich` if the entry needs it;
it runs the selected pass only. Console errors are gathered as today and
returned beside the checks. After it: no budgets, no `node --test`, the partial
header, the skip note, the console-error note, exit 1 if the row failed or any
console error was recorded.

**Full path.** Unchanged, plus the drift check after the table.

**Process.** The text changes in AGENTS.md, `/ship-feature` and the five agent
files as specified in 13–18.

## Proof

- `npm test`, green — including the new flag test and CI ban.
- `npm run smoke`, full, green, printing the same 21 rows as on `main`
  (compare against a run on `main`).
- `node scripts/smoke.mjs --only "bench mode wake lock"` — one row, the partial
  header, the skip note, exit 0.
- `node scripts/smoke.mjs --only "nope"` — exit 1, the list, no table.
- `node scripts/smoke.mjs --only "bench mode wake lock" --update-budgets` —
  exit 1.
- `guard-falsifier` on the unknown-name exit, the CI ban and the drift check,
  each shown red.
- No `/browser-verify`: nothing a coach sees changes, and there is no preview to
  measure.

## Out of scope

- A small-change lane in `/ship-feature` (skipping the refactorer, merging
  reviewers). Discussed separately, not decided.
- Giving the reviewers or `doc-writer` Bash.
- Multiple `--only` names, or substring matching.
- Changing any check, fixture, allow map or budget.
