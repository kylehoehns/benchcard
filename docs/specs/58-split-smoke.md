# #58 — Split scripts/smoke.mjs into one module per check

## Issue

#58. `scripts/smoke.mjs` is 3,062 lines and 167,309 bytes; split it so each
check lives in its own small file under `scripts/smoke/`, with no change in
behaviour.

## Goal

No coach sees this. An agent changing one smoke check can read that whole
check, and only that check, without paging through a 40k-token file.

## What would settle it

1. **Same checks, same names, same order.** `npm run smoke -- --no-tests` on
   `main` (recorded before the branch was cut) and on the branch print the
   same first column, row for row: 25 rows, `no console errors` first,
   `DOM nodes ≤ budget` last. Measured numbers may differ. The full run's own
   drift check (the ordered comparison against `REGISTRY` at the end of
   `smoke.mjs`) still runs and still passes.
2. **Same flags.** `--only "<name>"` / `--only=<name>`, `--no-tests`,
   `--json`, `--headful` and `--update-budgets` behave as before.
   `node scripts/smoke.mjs --only "today and back"` prints exactly one row.
   `test/smoke-only.test.js` stays green unchanged in what it asserts (21
   selectable names, the six refusals, the `--update-budgets` refusal, no
   Chrome launch before validation).
3. **No file over 40,000 bytes** among `scripts/smoke.mjs` and every file
   under `scripts/smoke/` (recursively). A test in `npm test` enforces it and
   its failure message names the offending file and its size. It is built
   with `/new-guard` and shown to fail on an over-limit file.
4. **Nothing else changes.** `git diff main -- app/ scripts/budgets.json
   scripts/smoke-checks.js scripts/budgets.mjs scripts/serve.mjs` is empty.
   `npm test` and `npm run smoke` are green.
5. **Docs follow.** `AGENTS.md` § Layout and
   `.claude/skills/browser-verify/SKILL.md` still name `smoke.mjs` as the
   command, and where they say where the checks live they point at
   `scripts/smoke/`.

## Surfaces

Change:

- `scripts/smoke.mjs` — stays the entry point: arg parsing, `--only`
  validation, `browserChecks` orchestration, budgets, `runTests`, table,
  drift check.
- `scripts/smoke/` — new. One module per `…Pass` (kebab-case of the pass
  name, e.g. `todayAndBackPass` → `today-and-back.mjs`), plus shared modules
  for what several passes use.
- `test/smoke-size.test.js` — new, the 40,000-byte guard.
- `test/smoke-only.test.js` — only its comments, where they say `REGISTRY` or
  `launch()` live in `smoke.mjs`, if that stops being true.
- `AGENTS.md`, `.claude/skills/browser-verify/SKILL.md` — item 5.

Must not change: everything under `app/`, `scripts/smoke-checks.js`,
`scripts/budgets.json`, `scripts/budgets.mjs`, `scripts/serve.mjs`,
`.github/workflows/test.yml`, `package.json`, the hooks.

## Constraints

- **Move, do not rewrite.** Every pass body, probe string, allow map
  (`LARGE_TEXT_ALLOW`, `APP_LARGE_TEXT_ALLOW`), threshold and comment moves
  verbatim. The only edits inside moved code are `import`/`export` lines and
  path fixes. No allow-map number changes, ever (`AGENTS.md` § Layout).
- **One copy of each helper.** `launch`, `findChrome`, `cdp`, `evalIn`,
  `goRich`, `reloadWithRecord`, `withSecondTeam`, `onScreen`, `SETTLE`,
  `step`, `SEED`, `RICH`, `PLAYERS`, `UI`, `WIDTH`/`HEIGHT`, `ROOT`/`APP` and
  the like are defined once and imported. Do not copy a helper into two pass
  files.
- **The names live once.** Row names are built in `REGISTRY` from constants
  (`NARROW`, `SWEEP_FLOOR`, `SWEEP_HI`, `TOUCH_WIDTHS`, `LARGE_TEXT_WIDTH`,
  `LARGE_TEXT_PX`), and passes read their name back with `nameOf(id)`. Keep
  that: no pass types its own name.
- **No import cycle that is evaluated at load time.** `REGISTRY` needs those
  constants when it is built, and passes need `nameOf`; the `run` entries need
  the passes. A cycle here is a `ReferenceError` (TDZ) that depends on import
  order. Put the name-bearing constants and `REGISTRY`'s id/name/selectable/
  setup data in a module the passes can import without importing any pass,
  and attach the `run` functions where the passes are imported (e.g. in
  `smoke.mjs`).
- **`--only` still refuses before `serve()` or Chrome.** Whatever the entry
  imports at load time must not start a server, launch Chrome or make a temp
  dir (`test/smoke-only.test.js` sandboxes `TMPDIR` to catch exactly that).
- **`smoke-checks.js` stays text.** `smoke.mjs` reads it with `readFile`; it is
  not imported. Its comment naming `smoke.mjs`'s `settingsRowPass` is left
  alone (the file is out of bounds).
- **`ROOT` must still resolve to the repo root** from whichever file defines
  it — a module one directory deeper needs `'..', '..'`.
- `--update-budgets` cannot be run here: `guard-bash.sh` blocks it and it
  would rewrite `budgets.json`. Its block moves unchanged, and review checks
  that with `git diff main...HEAD --color-moved`.
- No precached file changes (`app/` is untouched), so no `VERSION`/`SHELL`
  bump.
- Plain `node:` built-ins only; no dependencies.

## Design

`scripts/smoke.mjs` keeps its header comment (updated to say where the checks
live), the flag parsing, `--only` validation, `browserChecks`, `safeCheck`,
`runTests`, budgets, output and the drift check. Pass modules go under
`scripts/smoke/`, one per pass, each exporting its pass function and any
constants other files need. Helpers shared by two or more files go in shared
module(s) under `scripts/smoke/` (the developer picks the split, e.g.
`browser.mjs` for Chrome/CDP, `fixtures.mjs` for `SEED`/`RICH`/`goRich`,
`registry.mjs` for names). A helper used by exactly one pass lives in that
pass's file. Every resulting file is under 40,000 bytes.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `test/smoke-size.test.js` | `node --test`; a guard under `/new-guard`, falsified by an over-limit file | 3 |
| `test/smoke-only.test.js` | `node --test` (spawns `smoke.mjs`) | 2 (`--only` refusals, no early launch) |
| full smoke run | `npm run smoke -- --no-tests` (the proof pair) — its drift check compares printed names to `REGISTRY` in order | 1, 4 |
| name column vs `main` | the committer diffs the first column against the run recorded on `main` | 1 |
| `--only "today and back"` and `--json` | `node scripts/smoke.mjs --only "today and back"`; `node scripts/smoke.mjs --no-tests --json` parses as JSON | 2 |
| `--update-budgets` | review of `git diff main...HEAD --color-moved`: the block is moved unchanged | 2 |
| untouched files | `git diff main --stat -- app/ scripts/budgets.json scripts/smoke-checks.js` is empty | 4 |

No `/browser-verify` step: nothing a reader sees changes.

## Out of scope

- Changing any check, threshold, allow map or row name.
- Comments in `app/` and `scripts/smoke-checks.js` that say
  `scripts/smoke.mjs`: the entry point still has that name, and those files
  are out of bounds.
- The "21 checks" / "26 of them" counts in the browser-verify skill and
  `AGENTS.md` — they predate this change.
- Splitting `scripts/smoke-checks.js`.
