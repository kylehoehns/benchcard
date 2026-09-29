# #181 — An index for smoke checks and a split architecture doc

## Issue

#181. Make the smoke checks and the architecture doc quick to find your way
around: an index of smoke checks, `docs/architecture.md` split into one file
per area, and reviewers handed one diff per changed file.

## Goal

An agent (or a person) who needs "which smoke check covers X" or "how does
bench mode work" reads one short file and then the one file it points at,
instead of grepping names, then files, then fixtures, or paging through an
88 KB doc in 28 reads. Nothing a coach sees changes: no file under `app/` is
touched.

## Survey (what the issue claims, checked against the tree at 4ed4d19)

- **"60+ files in `scripts/smoke/`, no index."** True. 75 files; 75 rows in
  `ROWS` in `scripts/smoke/registry.mjs` (70 `selectable`, 5 not: `console`,
  the three budgets, `nodetest`). No README. But the registry is already the
  one list of every row, with its printed name, its `setup` and (through its
  `run`) its module. So the index is a **view of the registry**, and the test
  holds it to the registry, not to a hand copy.
- **"`docs/architecture.md` is 87 KB."** True: 88,322 bytes. It is the only
  file in `docs/` (or any `.md` in the repo) over the limit. The next largest
  in `docs/` is `docs/specs/36-first-run.md`, 46,566 bytes.
- **"60 KB is the size at which `guard-read.sh` makes you read in parts."**
  True: `MAX_BYTES=60000` in `.claude/hooks/guard-read.sh`.
- **"Step 7 of `/ship-feature` gives each reviewer one big diff."** True:
  step 7 captures `git diff main...HEAD` and passes that one diff to all four
  agents.
- **"Like `test/sdlc.test.js` does for agents."** True: that file holds the
  `/ship-feature` team table and `.claude/agents/` to each other in both
  directions. The new test follows the same shape.

Found along the way (not this issue, file separately if wanted):

- `docs/architecture.md:1296` says "see Analytics above", but there is no
  Analytics section in that file. It lives in `docs/operations.md`
  (`## Analytics`). The split fixes this one line because it has to touch
  every cross-reference anyway (see Design, part 2).
- `AGENTS.md` § Layout says no file in `scripts/smoke/` may pass 40,000 bytes,
  and `test/smoke-size.test.js`'s test name says 40,000, but its `LIMIT` is
  `55_000`. Two answers to one question. Out of scope here.

## What would settle it

1. `scripts/smoke/README.md` exists and holds one table with exactly one row
   per entry in `ROWS` — 75 rows today — in `ROWS` order.
2. Each row's **Check** cell is the row's `name` exactly as it prints (for
   example `no overflow, 300–420px plus 600/840/1280px`, and
   `game screen: Timeline \| Card and the card sheet` with the pipe escaped).
3. Each row's **File** cell names the module that runs the check. For a row
   with a `run`, that is exactly the `scripts/smoke/<name>.mjs` that exports
   the function its `run` calls (`cardfont` → `scripts/smoke/card-font.mjs`).
   For the five rows with no `run` and the eight `cold` rows, it names files
   that exist (`scripts/smoke-checks.js`, `scripts/smoke.mjs`,
   `scripts/budgets.mjs`, plus `scripts/smoke/card-at-32.mjs` for `cardsize`).
4. Each row's **Fixture** cell is derived from `setup`: `cold` → `SEED`,
   `rich` → `RICH`, `null` → `whole run`.
5. `test/smoke-index.test.js` fails, with a message that names the row, in
   each of these states: a `ROWS` entry with no README row; a README row with
   no `ROWS` entry; a renamed check; a wrong File; a wrong Fixture; rows out of
   order; the table deleted outright. It passes on the finished tree.
6. `docs/architecture.md` is a short index (under 8,000 bytes). It keeps the
   `# Architecture` title, its opening paragraph, and every one of its twelve
   current `##` headings, word for word, so an old link to
   `docs/architecture.md#bench-mode` still lands on the right heading. Under
   each heading: one line saying what the area covers, and a link to its file.
7. `docs/architecture/` holds twelve files, one per old `##` section, and the
   text of each is the old section moved without rewording, except the
   cross-references listed in Design part 2.
8. No `.md` file under `docs/` (at any depth) is over 60,000 bytes. The
   largest after the split is `docs/architecture/interface.md`, about 34 KB.
9. `.claude/skills/ship-feature/SKILL.md` step 7 hands each reviewer and
   `doc-writer` the output of `git diff --stat main...HEAD` plus a directory
   with one diff file per changed file, not one combined diff.
10. `npm test` and `npm run smoke -- --no-tests` pass.

## Surfaces

Change:

- `scripts/smoke/README.md` (new) — the index.
- `test/smoke-index.test.js` (new) — holds the index to `ROWS`.
- `docs/architecture.md` — becomes the index.
- `docs/architecture/*.md` (new, twelve files) — the moved sections.
- `test/one-answer.test.js` — its `DOCS` list gains `docs/architecture/*.md`
  and `scripts/smoke/README.md`; one new assertion (Design part 2).
- `test/docs-size.test.js` (new) (Decisions, Q2).
- `.claude/skills/ship-feature/SKILL.md` — step 7, and one clause in step 8.
- `.gitignore` — one line for the review directory (Design part 3).
- `.claude/agents/doc-writer.md` line 10 — names `docs/architecture/` where
  it names `docs/architecture.md` today.
- `AGENTS.md` § Layout — one clause pointing at `scripts/smoke/README.md` as
  the index of checks (a pointer, not a restatement).

Must not change:

- **Anything under `app/`.** `app/app.js:8`, `app/index.html:221` and
  `app/state.js:87` mention `docs/architecture.md` in comments. They stay
  true because the index keeps every heading (the one `index.html` cites,
  "A boot that fails says so, and hands the season back", included). Editing
  them would change precached files and force an `app/sw.js` bump for no
  coach-visible reason.
- `scripts/smoke/registry.mjs` and every check module. The index reads them;
  it does not change them.
- `docs/specs/*`. They are records of their commit; their mentions of
  `architecture.md` stay as written.

## Constraints

- **One answer in one place.** The registry owns every row's name, order,
  setup and module. The README is a view of it, and `test/smoke-index.test.js`
  is what keeps the view honest: every column is compared against `ROWS`
  (imported, not re-parsed) and the registry's own import lines. The test
  holds no list of checks of its own, and the README holds no hand-written
  column (see Decisions, Q1).
- **Reuse, do not re-derive.** Import `ROWS` from
  `scripts/smoke/registry.mjs` (it imports cleanly under `node --test`, in
  about 70 ms, with no side effects). Derive each row's module the way
  `test/smoke-registry.test.js` item 3 already pairs `...Pass` exports with
  rows: the registry's `import { xPass } from './x.mjs'` lines plus the name
  inside each row's `run`. Read the 60,000 limit from
  `.claude/hooks/guard-read.sh`'s `MAX_BYTES=` line; do not write 60000 in
  the test. Use `flat` from `test/prose.js` for any prose match.
- **`/new-guard` applies** to `test/smoke-index.test.js`, `test/docs-size.test.js`
  and the `one-answer.test.js` addition: each is a test that reads the tree
  rather than running app code. Count what was found before judging it (a
  table that parses to zero rows fails, it does not pass). Run each falsifying
  state in What would settle it item 5 once and record it in the test's header
  comment, the way `test/sdlc.test.js` does.
- **`test/smoke-size.test.js` walks every file under `scripts/smoke/`**, not
  only `.mjs`, so the README must stay under its limit. At about 150 bytes a
  row it will be near 12 KB.
- **The skill-reference check in `test/one-answer.test.js`** treats
  `` `/word` `` or ` /word ` in any `DOCS` file as a skill name that must
  exist. Paths written in the new step 7 text and the README must not look
  like that (write `.review/`, not `/review`).
- **American spelling** (`test/spelling.test.js` scans every tracked file).
- **Sibling work in flight** (#187–#191, #195–#198, PR #202): CSS in
  `app/app.css` and entries in `CLIP_SWEEP_KNOWN_ISSUES` in
  `scripts/smoke/clip-sweep.mjs`. None adds a `ROWS` entry today, so no overlap.
  If one later does and merges first, this branch's index test fails on
  rebase until the README gains its row — which is the test working.

## Decisions

Settled from the code:

- **One file per old `##` section**, twelve files, even the small ones
  (830 bytes for "Blocked states say why"). One heading, one file keeps the
  index a one-to-one map and the move mechanical. File names, in order:
  `layout.md`, `planning-strategies.md`, `lineup-balance.md`, `first-run.md`,
  `interface.md`, `bench-mode.md`, `plan-changes.md`, `card.md`, `rules.md`,
  `blocked-states.md`, `boot-failure.md`, `photo-scanning.md`.
- **Each moved file starts with its old heading promoted to `#`**, then the
  body unchanged.
- **Per-file diffs go in `.review/` at the worktree root, gitignored.** A
  temp dir outside the repo would ask the read-only reviewers for permission
  to read it mid-run. Ignored files never show in `git status --porcelain`, so
  step 8's "tree is still clean" check is not disturbed.

Settled while writing this spec (the owner can still override):

- **Q1: no States column.** The README index has Check, File and Fixture
  only — the columns the test can hold to the registry. A hand-written States
  summary would be a second copy of what each module measures, which is the
  drift "one answer lives in one place" exists to prevent. Someone who needs
  widths/sizes opens the module the File column links.
- **Q2: yes, `test/docs-size.test.js`.** No file under `docs/` (recursively)
  over the limit, reading the limit from `.claude/hooks/guard-read.sh`'s
  `MAX_BYTES` rather than restating 60000.

## Design

### 1. The smoke index

`scripts/smoke/README.md`: two or three sentences of intro, then one table.

```
| Check | File | Fixture |
| --- | --- | --- |
| `no console errors` | `scripts/smoke.mjs` | whole run |
| `card font loads before the card is fitted` | `scripts/smoke/card-font.mjs` | RICH |
```

- Check: the printed name in backticks, `|` escaped as `\|`.
- File: repo-root paths in backticks; more than one allowed, comma separated.
- Fixture: `SEED`, `RICH` or `whole run`, from `setup`. A row whose module
  lands its own fixture (`gamerowsfit` on `?try=9`, `firstrun` on a wiped
  store, `threedays`) is not called out here — Fixture is only what the
  registry's `setup` says; the states a row actually measures are read from
  the module the File column names.
- The intro says the rows are in print order, that the test holds Check, File
  and Fixture to `registry.mjs`, and points at `node scripts/smoke.mjs --only
  "<Check>"` for running one.

`test/smoke-index.test.js`:

- Parse the table: the rows between the header separator and the first
  non-table line. Unescape `\|`. Fail if zero rows parsed.
- Compare the Check column to `ROWS.map(r => r.name)` in order, and report
  the first missing, extra or misplaced name by name.
- For rows with a `run`: build `function name → file` from the registry
  source's import lines, pull the function name out of `String(row.run)`, and
  compare to the File cell.
- For rows without a `run`: every path in the File cell must exist.
- Fixture must equal the value mapped from `setup`.

### 2. The architecture split

- Move each `##` section of `docs/architecture.md` (lines 10–1310 today) into
  its file under `docs/architecture/`. Do it with a script or by cutting
  whole sections, not by retyping.
- Rewrite only cross-references that now point into another file, so they
  name the file. Known ones (grep `above\|below\|this file` for the rest):
  - `:1280` ("The first frame" below) → it is in `interface.md`.
  - `:1296` ("see Analytics above") → `../operations.md`, Analytics.
  - `:7` and `:1304` ("this file") → read as-is, or "these files".
- Rewrite `docs/architecture.md` as the index: the title, the opening two
  paragraphs, then the twelve headings, each with one summary line and a link
  (`[bench-mode.md](architecture/bench-mode.md)`).
- `test/one-answer.test.js`: add `docs/architecture/*.md` to `DOCS`, so the
  moved text stays under the owned-marker and link checks it is under today.
  Add `scripts/smoke/README.md` to `DOCS` too. Add one assertion: every file
  in `docs/architecture/` is linked from `docs/architecture.md`, and every
  link there resolves (the second half is the existing link test).
- If Q2 is yes, `test/docs-size.test.js`: walk `docs/` recursively, every
  `.md` at most `MAX_BYTES` as read from `guard-read.sh`. Count files found
  (fail at zero).

### 3. Per-file diffs for reviewers

Replace step 7's "Capture `git diff main...HEAD`" with:

```bash
rm -rf .review && mkdir .review
git diff --stat main...HEAD > .review/stat.txt
git diff --name-only main...HEAD | while read -r f; do
  git diff main...HEAD -- "$f" > ".review/$(printf %s "$f" | tr / _).diff"
done
```

Each of the four agents gets the absolute path of `.review/`, told to read
`stat.txt` first and then only the diffs it needs. Add `.review/` to
`.gitignore`. Step 8's fix pass hands the new `developer` the same directory.
A single file's diff can still pass 60 KB (this PR's own
`docs/architecture.md` diff will); the reviewer reads that one in parts, as
`guard-read.sh` already says.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `test/smoke-index.test.js` | `node --test test/smoke-index.test.js` | 1–5 |
| `test/one-answer.test.js` (extended) | `node --test test/one-answer.test.js` | 7, 8 (links, index covers every file, moved text still scanned) |
| `test/docs-size.test.js` (if Q2 yes) | `node --test test/docs-size.test.js` | 9 |
| Move check, one-off | a shell check in the PR: the twelve files with their `#` line restored to `##`, concatenated, diffed against `git show main:docs/architecture.md` lines 10–1310 | 8 — the diff shows only the listed cross-reference edits |
| `wc -c docs/architecture.md docs/architecture/*.md` | shell, in the PR | 7, 9 |
| Reading step 7 | review | 10 |
| Proof pair | `npm test`, `npm run smoke -- --no-tests` | 11 |

The three test files are guards (they read the tree), named here as seams,
and built under `/new-guard`: each falsifying state in item 5 is run once and
recorded. No `/browser-verify` step: nothing a reader of the app sees changes.

## Out of scope

- Changing any smoke check, `registry.mjs`, or the 40,000/55,000 disagreement
  between `AGENTS.md` and `test/smoke-size.test.js`.
- Rewording or reorganizing the architecture text beyond moving it.
- Splitting `docs/architecture/interface.md` further (34 KB, under the limit).
- Links into `docs/architecture.md` from outside this repo that use an anchor
  for something other than a `##` heading. There are none inside the repo.
- Steps other than 7 and 8 of `/ship-feature`.
