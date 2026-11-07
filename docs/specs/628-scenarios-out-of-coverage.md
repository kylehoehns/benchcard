# #628 — CI waits 10 minutes on Chrome scenarios that run inside the coverage job

## Issue

#628. Take the 55 Coach scenario files out of the smoke suite part, which
runs with coverage, and run them in their own split CI jobs, so CI finishes in
under 6 minutes instead of about 11.

## Goal

A pull request gets its required checks back in about half the time, and
every test still runs once in CI, still blocks a merge, and the coverage floor
measures exactly what it measures today.

## Decisions

The ticket is `ready-for-agent` and the survey upheld its claims:

- `runTests()` in `scripts/smoke.mjs` spawns `node --test` with
  `NODE_V8_COVERAGE` and keeps only entries whose URL is under `app/`. The
  scenarios load `app/` in Chrome through `test/coach.js`, which never calls
  `startCoverage` (only smoke's own browser session does, `scripts/smoke.mjs`
  ~L225). So no scenario contributes a counted line. Moving them out cannot
  move `scripts/coverage.json`.
- On run 42293572896 (80736dc): `smoke part suite` 10m38s, `node 24` 7m47s
  (the same 3,132 tests, no coverage), browser parts ~4m30s, wall 10m54s.
  The `node 24` log's top-level durations sum to ~1,320s; the scenario files
  are ~930s of it.
- Locally, `test/*.test.js` without `*-scenarios.test.js`: 241 files, 2,701
  tests, 138s, 0 failures.
- Which file is a scenario: its name ends `-scenarios.test.js`. All 55 Coach
  scenario files match. Three other files import `./coach.js`
  (`coach-download`, `coach-last-toast`, `fade-watch`); they test the driver
  itself, are fast, and stay with the unit files.
- The only test files `node --test`'s default globs pick up are
  `test/*.test.js` (the other `.js` files under `test/` hold no tests), so an
  explicit list of `test/*.test.js` minus the scenarios is the same set the
  default run uses minus the scenarios.
- The required check names stay (ruleset 21664025 requires `node 24`, `smoke`,
  `evals`, `service worker behind redirects`, `checks that need history`).
  Changing the ruleset is out of scope, so `node 24` keeps its name and
  becomes the job that judges the scenario parts.

## What would settle it

1. On the PR's own CI run, the time from the first job starting to the last
   job ending is under 6 minutes (10m54s on 80736dc).
2. `scripts/coverage.json` is unchanged and the coverage row passes.
3. A deliberately failing scenario turns `node 24` red; a deliberately failing
   unit test turns `smoke` red. Each is shown once (locally through the same
   commands CI runs) and then reverted.
4. `node 24` is red when any scenario part fails or never reports (the
   `if: always()` gate shape `smoke` uses), and green only when all succeed.
5. `scripts/lanes/ci-local.sh` runs the scenarios and prints a row for them;
   a failing scenario makes it RED.
6. A full local `npm run smoke` (no `--shard`) still runs every test file:
   unit files with coverage, scenario files without, and its `node --test`
   row fails if either half fails. So the proof pair stays one command.
7. `npm test` still runs every test file.
8. `npm test` and a full `npm run smoke` pass.

## Surfaces

Change:

- a new module that owns the split, for example `scripts/suite-files.mjs`:
  `unitFiles()` and `scenarioFiles()` (repo-relative, sorted). The one place
  that says what a scenario is.
- a new CLI, for example `scripts/scenarios.mjs [--shard k/n]`, that runs
  `node --test` (with `--test-shard=k/n` when given) over `scenarioFiles()`
  and exits with its code. CI and `ci-local.sh` both call it.
- `scripts/smoke.mjs`: `runTests()` runs `unitFiles()` under coverage. A full
  run (no `--shard`) also runs the scenarios beside it, without coverage, and
  folds both into the one `node --test` row (the detail names both counts).
  `--shard suite` runs units only. Header comment and `--shard` help text.
- `.github/workflows/test.yml`: a `scenario-parts` matrix (`1/3, 2/3, 3/3`,
  `fail-fast: false`, display name `scenario part ${{ matrix.part }}`) running
  the CLI; `node 24` becomes `needs: scenario-parts`, `if: always()`, and
  fails unless `needs.scenario-parts.result == 'success'`. Rewrite the job
  comments to say what each job now runs.
- `test/ci-config.test.js`: pin the new shape the way it pins `smoke`
  (advisory job listed with its judge; `node 24` has `needs` and
  `if: always()`; every k/n once; no `continue-on-error`).
- `scripts/lanes/ci-local.sh`: a `scenarios` run (unsharded is fine locally)
  in the first wave, and in the summary loop. Its header comment about the
  suite standing in for `node 24`.
- `scripts/lanes/merge-one.sh`: only if its comments describe what `node 24`
  runs. The required-name regex does not change.
- `AGENTS.md`: § Layout's text on the proof pair, the suite and the CI
  parts; and the merge step list in `.claude/skills/ship-feature/SKILL.md`
  only if it describes what `node 24` runs.

Must not change: `app/`, any test's assertions, `scripts/coverage.json`,
`scripts/budgets.json`, the required check names.

## Constraints

- One answer in one place: the scenario rule is written once, in the new
  module. No glob of `*-scenarios` in YAML or shell.
- No dependencies (`test/no-dependencies.test.js`).
- A required job that `needs` another must use `if: always()`, or a failed
  part skips it into a pass (`test.yml` § smoke says why).
- No path filter on a required workflow.
- A guard edit goes through `/new-guard`: show the new `ci-config` assertions
  red against a broken `test.yml` before trusting them.

## Design

Above, under Surfaces. Shard by `node --test --test-shard`, which deals files
by index; uneven files are acceptable.

## Proof

- `node --test` on the new module's exports: `scenarioFiles()` returns the 55
  `-scenarios` files; `unitFiles()` the rest of `test/*.test.js`; the two are
  disjoint and their union is every `test/*.test.js` (items 6, 7).
- `test/ci-config.test.js`, a guard, built with `/new-guard` (item 4).
- The commands CI runs, run locally with one test broken on purpose (item 3),
  `ci-local.sh` (item 5), and a full `npm run smoke` (items 2, 6, 8).
- The PR's own CI run times (item 1).

## Out of scope

- Renaming `node 24` in the ruleset.
- Making individual scenarios faster.
- Fewer fuzz iterations on PRs; #629's fingerprint tests.
