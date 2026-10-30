# #385 — `npm run flakes`, and watching `main` after a merge

## Issue

#385. Nothing reads CI history: add `npm run flakes`, which counts recent CI
failures by test name, and add a step to `/ship-feature` that watches the
`main` run after each merge.

## Goal

An agent that merges a PR can tell, in one command, whether a red run failed on
a test that has failed before (a known flake) or on something new (a real
break), instead of reading logs by hand with `gh run view --log-failed | grep`.

## What would settle it

1. **Parser, run 40803458453.** Given a captured excerpt of that run's
   `--log-failed` output (the `node 24` job), the parser returns exactly the
   four `test/smoke-settle.test.js` names, once each, without the duration
   suffix:
   - `TIMERS_QUIET outlasts a 140ms timer`
   - `TIMERS_QUIET does not wait for a timer that was cleared`
   - `TIMERS_QUIET ignores a timer longer than TRACKED_TIMER_MS`
   - `TIMERS_QUIET and SETTLE return within their cap when requestAnimationFrame never fires`

   The log prints each name twice (once inline, once under `✖ failing
   tests:`); the parser returns each once, and never returns `failing tests:`.
2. **Parser, run 40878611532.** Given a captured excerpt of that run's smoke
   job, the parser returns exactly `['new teams start in Hardwood, a saved
   Graphite stays']` — the one `FAIL` row, ANSI color codes stripped, padding
   and detail column dropped. `PASS` rows are not returned.
3. **Parser, no failures.** Given a log excerpt with only `✔` lines and `PASS`
   rows, the parser returns `[]`.
4. **Tally.** A pure function takes a list of runs (`{ id, branch, names }`)
   and returns one row per name: failures on `main`, failures on other
   branches, newest run id, sorted by total (main + other), highest first. A
   name counts at most once per run.
5. **Real run.** `npm run flakes -- --limit 10` runs against the real repo and
   exits 0; its output is pasted in the PR.
6. **Not logged in.** When `gh` fails (not logged in, or not installed), the
   script prints a single line to stderr starting `flakes:` and exits 1 — no
   stack trace.
7. **Skill.** `.claude/skills/ship-feature/SKILL.md` § A batch of tickets says,
   once: after each merge, watch the `main` run for the merge commit; if it
   fails, run `npm run flakes`; rerun the failed jobs once if the failing name
   is already listed there, otherwise treat it as a real break and file an
   issue. Step 13 points at that paragraph for a single PR where a merge is
   allowed, rather than restating it. `test/sdlc.test.js` stays green.
8. `npm test` and `npm run smoke` pass (nothing a coach sees changes).

## Surfaces

Changes:

- `scripts/flakes.mjs` — new. Pure exports (`parseFailures(log)`,
  `tally(runs)`, `formatRows(rows)` or similar) plus a CLI `main` that shells
  out to `gh`.
- `package.json` — `"flakes": "node scripts/flakes.mjs"`.
- `test/flakes.test.js` — new.
- `test/fixtures/` — new directory, log excerpts as `.txt` files.
- `.claude/skills/ship-feature/SKILL.md` — the watch-`main` paragraph.
- Docs that list the npm scripts, if any (`doc-writer`).

Must not change: anything under `app/` (so no `sw:bump`), the CI workflows.

## Constraints

- **No dependencies.** `test/no-dependencies.test.js` holds `package.json` to
  none. Use `node:child_process` (`execFile`/`execFileSync`) to call `gh`.
- **Read-only against GitHub.** The script only runs `gh run list` and `gh run
  view --log-failed`. Never `rerun`, never a write.
- **Fixtures are `.txt`, not `.js`.** `node --test` with no arguments runs
  every `.js`/`.mjs` file under any `test/` directory, so a fixture with a
  script extension would be run as a test.
- **Fixture excerpts, not whole logs.** The raw logs contain runner noise and
  credential-config paths. Keep only the lines around the failures (a few `✔`
  and `PASS` lines for context, the `✖`/`FAIL` lines, the summary block),
  verbatim, including the `job\tstep\ttimestamp ` prefix each line carries.
  Raw logs for reference:
  `/private/tmp/claude-501/-Users-khoehns-dev-benchcard/3e9a07e2-fb30-480d-9305-2cf7d86871cd/scratchpad/385/40803458453.log`
  and `.../385/40878611532.log` in the same directory.
- **American spelling** (`test/spelling.test.js` scans every tracked file).
- **One answer in one place.** The watch-`main` procedure is written once, in
  the batch section of the skill; step 13 links to it.
- `test/sdlc.test.js` holds the team table in `SKILL.md`; do not touch it.

## Design

**Log lines.** `gh run view --log-failed` prints `<job>\t<step>\t<ISO
timestamp> <text>`. Strip everything up to and including the timestamp's `Z `,
then strip ANSI escapes (`\x1b[...m`).

**node --test names.** A line whose text, trimmed, starts with `✖ `. Drop the
trailing ` (<number>ms)`. Skip `✖ failing tests:`. Nested subtests are indented
and still count.

**Smoke names.** A line whose text matches `^\s*FAIL\s{2}(.+?)(\s{2,}|$)` —
`scripts/smoke.mjs` prints `  FAIL  <name padded>  <detail>`.

**Per run:** the set of names, in first-seen order, deduplicated.

**CLI.** `--limit N` (default 30). `gh run list --workflow tests --limit N
--json databaseId,conclusion,headBranch` (the repo is whatever `gh` resolves
from the working directory). For each run with `conclusion === 'failure'`,
`gh run view <id> --log-failed`. If one log fetch fails (GitHub returns 502s
now and then), try once more, then print one `flakes: skipped run <id>: ...`
line to stderr and go on. If `gh run list` itself fails, or `gh` is missing,
print one line `flakes: <reason>` (for "not logged in", say to run `gh auth
login`) and exit 1.

**Output.** A header line saying how many runs were read and how many failed,
then one line per name. Columns: `main`, `PR` (other branches), `newest run`,
then the name last, so long names do not break the alignment. Nothing failed:
print a line saying so.

## Proof

- **`node --test test/flakes.test.js`**, on the pure exports: items 1–4 from
  the fixtures and small inline inputs.
- **The CLI's error path** (item 6): the test spawns `node scripts/flakes.mjs`
  with `PATH` pointing at a temp dir holding a stub `gh` that prints GitHub
  CLI's real not-logged-in message to stderr and exits 4; assert exit code 1,
  stderr is one line starting `flakes:`, and no `at ` stack frame. A second
  case with no `gh` on `PATH` at all asserts the same. (`node` is spawned by
  `process.execPath`, so `PATH` does not need it.)
- **Item 5** is run by hand by the committer and pasted in the PR.
- **Item 7** is read in review; `test/sdlc.test.js` must stay green.

## Out of scope

- Fixing the flakes themselves (the CI-flakes ticket, #375).
- Automatic reruns; the script only reports.
- Workflows other than `tests`.

## Choices the issue left open

- Column order: the issue lists name, main, PR, newest run id. The name is
  printed last so the counts line up whatever the name's length.
- A log fetch that fails is retried once and then skipped with a warning,
  rather than failing the whole report.
- "Failures on main" means runs whose head branch is `main`; every other branch
  counts as a PR branch.
