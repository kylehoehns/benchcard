# #259 — Count what the smoke run covers in app/

## Issue

#259: `node --test` alone reports 61% of `app/` lines covered, but most of the
app only runs in a browser, and the smoke run already drives it there. Count
both halves together, show the number, and stop it from quietly falling.

## Goal

Every full smoke run, and every CI run, prints one line-coverage figure for
`app/` that counts both the unit suite and the browser checks. A change that
drops that figure by more than half a point fails the run. Raising the
recorded figure is a one-flag re-record that shows up in review as a diff.

## What the survey found

On `main` (2045f78):

- **Unit suite only:** `node --test --experimental-test-coverage
  --test-coverage-include='app/**' --test-coverage-exclude='app/vendor/**'`
  prints 61.19% lines, 92.92% branches, 58.23% functions. `app.js`,
  `shortcuts.js` and `handoff-view.js` are missing from that report entirely,
  because no test imports them.
- **The smoke run** (`scripts/smoke.mjs`) drives one Chrome tab over CDP
  (`scripts/smoke/chrome.mjs` `cdp`). Session setup is
  `scripts/smoke.mjs:186-214`, ending in `Page.navigate` to `/index.html`.
- **Rows reload the same tab.** 18 `Page.navigate`/`Page.reload` calls across
  `scripts/smoke.mjs` and `scripts/smoke/*.mjs`, plus in-page
  `location.reload`/`location.href =` in `today-and-back.mjs` and
  `timeline-card-sheet.mjs`. V8 drops a page's coverage when the page goes
  away, so coverage taken only at the end would count just the last page.
- **The suite inside smoke.** `runTests` (`scripts/smoke.mjs:319`) runs
  `node --test` as a row unless `--no-tests`. `--only` implies `--no-tests`
  and skips budgets.
- **CI** (`.github/workflows/test.yml:74,82`): the job is named
  `smoke (390×844)` and runs `node scripts/smoke.mjs --no-tests`.
- **The job name is required by name** in the GitHub ruleset "main", and
  `test/ci-config.test.js` `REQUIRED` holds the same list. The name also
  appears in `.claude/skills/ship-feature/SKILL.md:257`.
- **The budgets precedent.** `scripts/budgets.mjs` judges recorded baselines
  plus slack. A blanket `--update-budgets` is denied by
  `.claude/hooks/guard-bash.sh:42` because `budgets.json` mixes hand pins with
  recorded numbers. Coverage has no hand pins, so its re-record is safe to
  allow.

## Decisions (made with the human)

1. **Every run.** Coverage is collected on every full smoke run, locally and
   in CI. It is not an opt-in flag. (Supersedes the issue's "no threshold
   yet".)
2. **One job runs both halves.** The CI smoke job drops `--no-tests`, so the
   suite runs inside smoke and both halves merge line by line.
3. **The job is renamed `smoke`.** `(390×844)` comes off the title.
4. **The floor is the total, with small slack.** One recorded line % for all
   of `app/` (vendor excluded). The run fails if the measured figure is more
   than 0.5 points below the record. `--update-coverage` re-records it. The
   per-file table is informational and never fails anything.

## What would settle it

- **A. Merged report.** A full `node scripts/smoke.mjs` prints, after the
  table:
  - one total line % for `app/**/*.js` minus `app/vendor/**`;
  - a per-file table (path, lines covered / total, %), sorted lowest first.
  - `app.js`, `shortcuts.js` and `handoff-view.js` appear with a non-zero
    figure.
  - The total is higher than 61.19%.
- **B. Every file counts.** A file under `app/` (not vendor) that nothing ran
  appears at 0%, not absent. `sw.js` runs in the worker, which is not
  captured, and the tests that check it read it as text rather than import
  it, so it appears at 0%. (Amended in build: the first draft expected a
  node-only figure, which no test produces.)
- **C. Reloads keep coverage.** A `node --test` test drives real Chrome
  through a fixture: `a.html` loads `a.js` and calls one of its two functions,
  then the tab navigates to `b.html` (once by `Page.navigate`, once by an
  in-page `location.href =`). The merged result still counts `a.js`'s called
  function as covered and the uncalled one as not. Skips where `hasChrome()`
  is false, as the other Chrome tests do.
- **D. The converter is pure and tested.** Under `node --test`, from
  hand-built V8 coverage objects:
  - nested ranges resolve innermost-wins (a count-0 block inside a called
    function marks those lines uncovered);
  - two reports for the same URL merge (a line covered in either is covered);
  - a query string (`?retry=2`) is stripped before merging;
  - blank and comment-only lines are not counted.
- **E. The floor.** A coverage row in the smoke table:
  - passes with the measured %, the recorded %, and the slack in its detail;
  - fails when measured < recorded − 0.5, and its detail names
    `--update-coverage`;
  - with no record file, fails and says how to record one.
- **F. Re-record.** `node scripts/smoke.mjs --update-coverage` writes the
  measured total to `scripts/coverage.json` and the row reads `coverage
  re-recorded`. `--update-coverage` with `--only` or `--no-tests` is refused,
  since neither run has both halves.
- **G. Partial runs.** `--only` and `--no-tests` print no coverage row and say
  so in the skipped line, like the budgets.
- **H. CI.** The smoke job is named `smoke` and runs
  `node scripts/smoke.mjs` (no `--no-tests`). All five jobs plus Workers
  Builds go green on the PR. The PR reports the smoke job's runtime before and
  after.
- **I. Ignored output.** Raw coverage goes to a temp directory and is removed
  after; nothing new appears in `git status` after a run.

## Surfaces

- **Changes:**
  - `scripts/smoke.mjs`: start coverage at session setup, run the suite with
    `NODE_V8_COVERAGE`, merge, the coverage row, `--update-coverage`;
  - `scripts/smoke/chrome.mjs` (or a new `scripts/smoke/coverage.mjs`): the
    take-before-navigate hook;
  - a new pure module, `scripts/coverage.mjs`: V8 ranges to lines, merge,
    totals, and the floor judgment;
  - `scripts/coverage.json`: the recorded figure, from `--update-coverage`;
  - the two smoke rows with in-page navigations, if they need routing through
    the hook;
  - `.github/workflows/test.yml`: rename, drop `--no-tests`, update the job's
    comment;
  - `test/ci-config.test.js` `REQUIRED`;
  - `.claude/skills/ship-feature/SKILL.md:257`;
  - `AGENTS.md` and `docs/operations.md` where they describe the smoke job,
    `--no-tests`, or the proof pair;
  - `test/`: the converter tests and the Chrome fixture test;
  - `scripts/smoke/README.md`.
- **Must not change:**
  - anything under `app/`. Coverage is measured, never instrumented into the
    app, so `sw.js` VERSION does not move;
  - `npm test` (it is Cloudflare's build command, and stays fast);
  - `scripts/budgets.mjs`, `scripts/budgets.json` and the guard on
    `--update-budgets`;
  - every existing smoke row's pass/fail behavior;
  - `docs/specs/241-smoke-time.md` (a historical record of the old name).

## Constraints

- **No dependencies.** No c8, no istanbul. V8's own coverage from both sides:
  `NODE_V8_COVERAGE` for node, `Profiler.startPreciseCoverage({callCount:
  true, detailed: true})` for Chrome. Both produce the same shape, so one
  converter serves both.
- **Reuse, do not re-derive:**
  - the recorded-baseline-plus-slack pattern from `scripts/budgets.mjs`;
  - `hasChrome()` and `launch`/`cdp` from `scripts/smoke/chrome.mjs` for the
    fixture test;
  - the flag reader (`readFlag`/`has`) and the `--only` refusal style in
    `smoke.mjs`;
  - URL to file: strip the origin and query, resolve against `app/`. One
    function, used for both halves.
- **One hook for navigation.** Take coverage before every navigation in one
  place (the `cdp` client's `send`, for `Page.navigate` and `Page.reload`).
  Do not sprinkle `takePreciseCoverage` through 18 call sites. In-page
  navigations either go through the same hook or are caught some other
  central way; the fixture test (C) proves whichever is built.
- **Timing.** Smoke is timing-sensitive and runs under a fake clock.
  Coverage must not turn any row red. If a row flakes only with coverage on,
  that is a stop-and-report, not a retry loop.
- **The ruleset is a GitHub setting.** Renaming the job means the required
  check in ruleset "main" must change from `smoke (390×844)` to `smoke`. That
  is done by the orchestrator, with the human's explicit go-ahead, after the
  PR's `smoke` check is green and right before merge. No agent touches it.
- **The proof pair.** With coverage, a run without the suite cannot judge the
  floor. The proof pair becomes one full `npm run smoke` (the suite runs
  inside it, once). `AGENTS.md`'s proof-pair paragraph and SKILL.md's step 6
  change to say so.

## Design

1. **`scripts/coverage.mjs` (pure).** `toLines(source, functions)` turns one
   script's V8 ranges into a set of covered and uncovered line numbers,
   innermost range winning, skipping blank and comment-only lines.
   `merge(reports)` combines by file. `summarize(merged, files)` gives the
   per-file table and the total, with any `files` entry missing from
   `merged` counted at 0%. `judge(total, recorded, slack = 0.5)` returns a
   row like the budget rows.
2. **Chrome side.** At session setup, `Profiler.enable` and
   `startPreciseCoverage`. Every `Page.navigate`/`Page.reload` first awaits
   `takePreciseCoverage` and keeps the result. Once more at the end.
3. **Node side.** `runTests` sets `NODE_V8_COVERAGE` to a temp dir and
   reads the JSON files after; only `file://…/app/` URLs count.
4. **Row and record.** After the suite row, the coverage row; then the
   per-file table. `--update-coverage` writes `{ "lines": <total> }` to
   `scripts/coverage.json`.
5. **CI and names.** Rename the job, drop `--no-tests`, update `REQUIRED`,
   SKILL.md, AGENTS.md and `docs/operations.md`.
6. **First record.** The build records the first `scripts/coverage.json`
   from a full run, and the PR states the number.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `toLines`, `merge`, `summarize`, `judge` on hand-built V8 objects | `node --test`, a new `test/coverage.test.js` | B, D, E |
| Real Chrome, fixture pages, both kinds of navigation | `node --test`, a Chrome-gated test reusing `launch`/`cdp` | C |
| Flag handling (`--update-coverage` with `--only`/`--no-tests` refused) | `node --test`, spawning `smoke.mjs` the way `test/smoke-timeout.test.js` does | F, G |
| Merged report, row, per-file table, first record | one full `npm run smoke`, output read | A, E, F, I |
| Required names and the workflow | `test/ci-config.test.js` | H |
| CI green and runtime | the PR's checks | H |

## Out of scope

- Branch and function coverage floors (the per-file table may show them;
  only total lines is judged).
- Per-file floors.
- Capturing the service worker's own coverage.
- A coverage badge or page.
- Raising coverage. This change measures it; writing tests for uncovered
  files is later work.
