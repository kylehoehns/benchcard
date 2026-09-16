# #61 — Use American spelling everywhere (color, gray)

## Issue

#61. Change every British spelling in the repo to American (`colo(u)r` →
`color`, `gr(e)y` → `gray`, and the rest of the list below), keep a coach's
saved team color across the rename, and add a check so the British spellings
cannot come back.

This spec writes each British word with its differing letters in brackets
(`colo(u)r`), so the spec itself passes the check it asks for.

## Goal

A coach reads "Team color" in Settings and in the picker. A coach who chose a
team color before this change opens the app and still sees that color, from
the very first frame. Nobody working on the repo can add a British spelling
back without `npm test` saying where and what to write instead.

## The word list

The British fragments and their American replacements. Matching is a
case-insensitive substring match, the same as the issue's `git grep -i -E`.

| British fragment | American |
| --- | --- |
| `colo(u)r` | `color` |
| `gr(e)y` | `gray` |
| `cent(re)` | `center` |
| `favo(u)r` | `favor` |
| `behavio(u)r` | `behavior` |
| `organi(s)` | `organiz` |
| `recogni(s)` | `recogniz` |
| `licen(c)e` | `license` |

So `cent(r)ed` becomes `centered`, `unrecogni(s)ed` becomes `unrecognized`,
`organi(s)ations` becomes `organizations`, and so on.

## What would settle it

1. **The tree is clean.** On the branch,
   `git grep -i -E "colo(u)r|gr(e)y|cent(re)|favo(u)r|behavio(u)r|organi(s)|recogni(s)|licen(c)e" -- . ':!app/vendor'`
   (with the brackets removed from each word) prints only lines that carry the
   legacy marker described in Design, and those lines are all in
   `app/storage.js`, `app/index.html`, `test/storage.test.js` and
   `test/first-paint.test.js`. No tracked file name outside `app/vendor/`
   contains a fragment either: `scripts/smoke/team-colo(u)r.mjs` becomes
   `scripts/smoke/team-color.mjs`, and `docs/specs/25-team-colo(u)r.md`
   becomes `docs/specs/25-team-color.md`, with every reference updated.
2. **A saved choice survives.** `sanitizeSettings({ colo(u)r: 'navy' })`
   returns `color: 'navy'` and has no `colo(u)r` key. `loadState` over a
   stored v6 record whose active team's settings hold only the old key
   `colo(u)r: 'navy'` yields `settings.color === 'navy'`. The saved record
   written after that holds `color` and not the old key.
3. **Precedence.** `{ color: 'royal', colo(u)r: 'navy' }` → `royal`.
   `{ color: 'bogus', colo(u)r: 'navy' }` → `navy`. `{ colo(u)r: 'bogus' }` →
   `graphite`. `{}` → `graphite`. The rule is: a valid `color` wins, else a
   valid old value, else `graphite`.
4. **The first frame agrees.** The first-paint inline script in
   `app/index.html` stamps `data-tint="navy"` for a stored record holding only
   the old key `colo(u)r: 'navy'`, and follows the same precedence as item 3.
   `test/first-paint.test.js` runs the real script bytes against the real
   `loadState` for these rows, as it already does for the existing rows.
5. **The check goes red.** Adding the word `colo(u)r` (unbracketed) to any
   file under `app/` — for example a comment line in `app/render.js` — makes
   `npm test` fail with a message naming `app/render.js`, the line number, and
   `color` as the word to use. Removing it makes `npm test` pass again. Also
   red: a new tracked file (for example `docs/x.md`) containing `gr(e)y`; a
   legacy marker added to a line in a file that is not one of the four
   allowed; one extra legacy-marked line in an allowed file.
6. **Only the allowed lines pass.** The check allows a British fragment on a
   line only when that line carries the legacy marker and is in one of the
   four allowed files, and the count of marked lines per file equals the count
   pinned in the check. A missing marked line (count too low) also fails, so a
   stale allowance cannot linger.
7. **`AGENTS.md` says it.** One bullet under § Rules says the repo uses
   American spelling and names the check's file. The word list is not copied
   into `AGENTS.md`.
8. **The edit hook warns.** `.claude/hooks/after-edit.sh` runs the same check
   on the one edited file and, if it finds a British spelling, adds an
   advisory note naming the line and the American word. It never blocks.
   `test/hooks.test.js` covers both directions: an edited file with a British
   spelling gets the note, a clean file gets none. The hook uses the check's
   module; it holds no second word list. The § "What is enforced" table in
   `AGENTS.md` gains a row for it and its count sentence is updated.
9. **Green.** `npm test` and `npm run smoke -- --no-tests` pass locally; all
   five CI jobs pass; the Cloudflare branch build (which runs `npm test`)
   succeeds.
10. **Cache.** `app/sw.js` `VERSION` is bumped by one from `272` and `SHELL`
    is set to the digest `npm test` names, because precached files change.

## Surfaces

Changes: every tracked file outside `app/vendor/` that holds a fragment
(about 90 files: `app/*.{js,css,html}`, `scripts/**`, `test/**`, `docs/**`,
`notes/**`, `README.md`, `AGENTS.md`, `REVIEW.md`, `CONTEXT.md`, `LICENSE`,
`src/index.js`, `.github/workflows/test.yml`, `.claude/agents/*.md`,
`.claude/skills/**/SKILL.md`). New: `scripts/spelling.mjs`,
`test/spelling.test.js`, this spec.

Must not change: `app/vendor/**` (hook-guarded anyway),
`scripts/budgets.json`, git history, closed issues, old PRs.

## Constraints

- **Mechanical rename, no behavior change** beyond the saved-key migration.
  Identifiers (`COLO(U)RS` → `COLORS`, `colo(u)rName` → `colorName`,
  `activeColo(u)r` → `activeColor`, `teamColo(u)red` → `teamColored`, …), CSS
  classes (`.colo(u)r-opt` → `.color-opt`, …), `data-colo(u)r` →
  `data-color`, element ids (`#colo(u)rPicker` → `#colorPicker`, …),
  visible copy ("Team colo(u)r" → "Team color"), and the smoke check's name
  in `scripts/smoke/registry.mjs` and wherever else that name is written.
  Rename every occurrence of a name together, across files. The `dead-*`
  tests catch a half-renamed id or class.
- **`engine.js` is a pure, heavily tested module**: its hits are comments
  only. Change the spelling, nothing else.
- **`storage.js` is pure and heavily tested**: the only behavior change is the
  `color` / old-key read in `sanitizeSettings`. The output key is `color`
  only. Check the rest of `storage.js` for any other saved key with a British
  spelling (the survey found none besides the settings key) and treat any
  found the same way.
- **Two readers of the saved key, one answer.** `sanitizeSettings` and the
  first-paint script in `app/index.html` both read it. Both get the same
  fallback. `test/first-paint.test.js` already runs the real script against
  `loadState`; extend its table rather than writing a second parity test.
- **The precache bump**: precached files change, so bump `VERSION` in
  `app/sw.js` and set `SHELL` to the digest `npm test` names, in the same
  edit.
- **Budgets**: bytes will move slightly. If a byte ceiling trips, widen it in
  `scripts/budgets.mjs` and say so in the report. Never run a blanket
  `--update-budgets`. `requests` must not change.
- **The privacy guard** (`test/analytics.test.js`) is untouched in intent;
  only spelling in its comments may change.
- **The test fixture event `card_favo(u)rited`** in `test/events.test.js` is
  just an example of an unknown event name. Rename it to `card_favorited`.
- **Reuse, do not re-derive**: the hook calls `scripts/spelling.mjs`; the
  test imports it. There is exactly one word list, in that module.
- `/new-guard` governs the check: run it green first, then red by each arm in
  item 5, prove each mutation landed, judge by exit code, restore by reading
  back.

## Design

**`scripts/spelling.mjs`** exports:

- `WORDS` — the table above, as British → American pairs. Each British
  fragment is built from pieces (for example `'colo' + 'ur'`), so the module's
  own source does not contain the fragments and the module is scanned like
  every other file, with no exclusion.
- `LEGACY_MARK` — the marker string, `legacy-spelling` (it contains no
  fragment). A line that carries it is a line that must keep a British word,
  because it reads data saved before #61.
- `ALLOWED` — `{ 'app/storage.js': n, 'app/index.html': n,
  'test/storage.test.js': n, 'test/first-paint.test.js': n }`, the exact
  number of marked lines each file must have. The developer pins the counts.
- `scan(text)` — returns `[{ line, fragment, american, marked }]` for every
  fragment on every line (1-based line numbers).
- `trackedFiles()` — `git ls-files`, minus `app/vendor/`, minus binary files
  (a NUL byte in the content). It throws if git fails; it does not return an
  empty list.
- A CLI: `node scripts/spelling.mjs <file>…` prints one line per unmarked hit,
  `<file>:<line>: "<fragment>" → use "<american>"`, and exits 0 either way
  (the hook is advisory).

**`test/spelling.test.js`**:

- Unit cases for `scan`, built by concatenation: each of the eight fragments
  is found in upper, lower and mixed case, with the right American word; a
  clean line gives nothing; a marked line comes back `marked: true`.
- The tree scan: the file list is not empty and includes `AGENTS.md`,
  `app/storage.js` and `scripts/spelling.mjs` (a scan that read nothing
  fails). No file name contains a fragment. Every unmarked hit fails, and the
  message lists each as `<file>:<line>: "<fragment>" → use "<american>"`.
  Marked lines outside `ALLOWED` fail. Each `ALLOWED` file's marked-line count
  equals its pin.

**`app/storage.js`**: `sanitizeSettings` returns `color`, chosen by the rule
in item 3. The one line that reads the old key carries the marker in a
comment.

**`app/index.html`**: the first-paint script reads `settings.color`, falls
back to the old key by the same rule, on one marked line.

**`.claude/hooks/after-edit.sh`**: for an edited path that is not under
`app/vendor/`, run `node "$root/scripts/spelling.mjs" "$path"`; if it prints
anything, append that output to the advisory note.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `sanitizeSettings` / `loadState` exports | `node --test test/storage.test.js` | 2, 3 |
| first-paint script vs `loadState` table | `node --test test/first-paint.test.js` | 4 |
| `scan` exports and the tree scan (a guard, under `/new-guard`) | `node --test test/spelling.test.js` | 1, 5, 6 |
| hook in both directions | `node --test test/hooks.test.js` | 8 |
| red arms from item 5, by exit code | a scratch mutation run, reported | 5 |
| full suite and smoke | `npm test`, `npm run smoke -- --no-tests` | 9, 10 |
| Settings reads "Team color", picker opens and applies, a stored old-key record shows its tint on first load | `/browser-verify` on the preview at 390×844 | 2, 4 |

## Out of scope

- Rewriting git history, closed issues or old PRs.
- `app/vendor/**`.
- Any change to what the team colors look like or which colors exist.
- Removing the old-key fallback. It stays until a later decision says every
  saved record has been rewritten.
