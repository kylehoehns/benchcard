# #109 — The spelling guard misses British -ise verbs

## Issue

#109. `scripts/spelling.mjs` catches only a short word list, so British `-ise`
verbs (normal·ise, optim·ise, serial·ise, ...) are all over the tree. The issue
asks whether the guard should cover `-ise` verbs in general or a list, to fix
the existing hits, and to see the test fail before the fixes.

## Goal

The tree is spelled the American way, as #61 decided ("American spelling
everywhere"), including the `-ize` verbs, and the guard keeps it that way for
every word the tree has used so far.

## Decisions

The issue is unlabelled. Each question is answered by the repo's own design
and the survey, so none is the owner's to decide:

- **A list, not a general `-ise` pattern.** A scan of every tracked file
  outside `app/vendor/` for words ending `-ise/-ised/-ises/-ising/-isation/
  -iser` found more correct American words than British ones: promise (170
  times), otherwise (94), raise, rise, noise, exercise, advertise, precise,
  premise, compromise, enterprise, concise, improvise, praise, surprise, wise.
  A general pattern would need an open-ended exclusion list, and every new
  correct word would fail `npm test`. `scripts/spelling.mjs` is already a list
  of fragments, and the hook is advisory. So the list grows by the British
  stems the tree actually uses. A British verb not on the list can still slip
  in; that is the accepted cost.
- **The stems to add**, from the survey (each is British in the tree today):
  author·is-, capital·is-, crystall·is-, formal·is-, general·is-, mechan·is(e/ed)-,
  monet·is-, neutral·is-, normal·is-, optim·is-, priorit·is-, quant·is-, sanit·is-,
  serial·is-, standard·is-, summar·is-. The American replacement is the same
  stem with `z`.
- **No fragment may match a correct word.** Several stems are prefixes of
  correct words: `optim·is` → optimism, optimist; `general·is` → generalist;
  `formal·is` → formalism; `capital·is` → capitalism, capitalist; `mechan·is` →
  mechanism; `normal·is` → normalism. A fragment for these must only match
  when the next letter is `e`, `a` or `i` (as in -ise, -isation, -ising), or
  be spelled out longer so it cannot match `-ism`/`-ist`.
- **The two copied upstream skills get fixed too.** `.claude/skills/
  domain-modeling/SKILL.md` ("crystall·ise") and `.claude/skills/
  setup-matt-pocock-skills/SKILL.md` ("Summar·ise") are copies of upstream
  skills. #61 says American spelling everywhere, the scan already covers them,
  and the setup skill is already locally changed (`AGENTS.md` says so). If a
  refresh from upstream brings a British word back, the spelling test says so,
  which is the right signal. No exclusion list is added, because a second list
  of "which skills are upstream" would be a second answer to a question
  `AGENTS.md` answers in prose.
- **Nothing a coach sees changes.** The `app/` hits are comments, except
  `saveState`'s failure reason `'could not serial·ise'` in `app/storage.js`. No
  test or caller compares that string, and it is not saved data, so it
  becomes `'could not serialize'`. Precached files change, so `app/sw.js` is
  bumped.
- **Saved data keeps its keys.** If any renamed identifier or string is read
  from or written to storage, it must keep working for data saved before this
  change (the `LEGACY_MARK` route #61 used). The survey found none, but the
  build must check before renaming.

## What would settle it

1. `WORDS` in `scripts/spelling.mjs` holds a fragment for each of the 16 stems
   above, built from pieces like the existing entries, so the module does not
   contain what it scans for.
2. A unit test in `test/spelling.test.js` shows that `scan` finds each new
   British form (e.g. normal·ise, normal·ised, optim·isation, serial·iser,
   priorit·ised, capital·isation) with the right American fragment, and finds
   **nothing** in a line holding these correct words: promise, otherwise,
   raise, rise, noise, exercise, advertise, precise, premise, compromise,
   enterprise, concise, improvise, praise, surprise, wise, optimism, optimist,
   generalist, formalism, capitalism, capitalist, mechanism.
3. The existing whole-tree test in `test/spelling.test.js` goes red with the
   new list before the fixes (report the count it printed), and green after.
4. Every hit in the tree is rewritten to American spelling, including
   identifiers and the `'could not serial·ise'` reason. No `LEGACY_MARK` line
   and no `ALLOWED` count is added unless a hit is saved data (report it if so).
5. `app/sw.js` `VERSION` is bumped and `SHELL` set to the digest `npm test`
   names.
6. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `scripts/spelling.mjs` (`WORDS`), `test/spelling.test.js`, and every
tracked file with a hit (about 42, across `app/`, `scripts/`, `test/`,
`docs/`, `notes/`, `.claude/`, `AGENTS.md`), `app/sw.js`.

Must not change: `app/vendor/`, what any function does, any storage key or
saved field, `ALLOWED` counts (unless item 4's exception applies).

## Constraints

- **One answer lives in one place:** the list is `WORDS`. The hook
  (`after-edit.sh`) and the test both read it. Do not add a copy.
- **Reuse, do not re-derive:** the whole-tree test and `trackedFiles()` already
  exist; the new cases go through the same `scan`.
- **`wrap-blind.test.js`:** a negative check in a test uses `lacks` from
  `test/prose.js`, or a positive assertion on `scan`'s result.
- **Renaming an identifier renames every use.** `npm test` and a `git grep`
  for the old name must both come back clean.
- **Precache bump** for any precached file changed.
- **Every tracked file is scanned, including this spec and the tests.** This
  spec splits each British word with a `·` so the scan cannot match it. The
  new test cases build their British words from pieces, like `WORDS` does,
  or the whole-tree test will flag the test file itself.
- **Markdown wrap:** keep each file's existing line wrapping when replacing a
  word; a `z` for an `s` does not change the length.

## Design

- `WORDS`: 16 new `[british, american]` pairs. For the stems that prefix an
  `-ism`/`-ist` word, use a fragment that cannot match those words (for
  example the stem plus `(?=[aei])` if `scan` treats fragments as regex
  source, which it does today via `new RegExp(british, 'gi')`, with the
  American entry naming the `z` stem).
- Rewrite the hits with a script that uses the same `WORDS` table, then read
  the diff: each change is one `s` → `z`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `scan` over literal British and American lines | `node --test test/spelling.test.js` | 1, 2 |
| the whole-tree scan, red before the rewrite and green after | `node --test test/spelling.test.js` | 3, 4 |
| `test/sw.test.js`'s digest | `npm test` | 5 |
| the full suite and smoke | `npm test`, `npm run smoke` | 6 |

## Out of scope

- A general `-ise` pattern.
- `-yse` verbs (analyse, paralyse): the survey found none in the tree.
- Other British spellings not in the survey (for example `-our` words
  already covered, `-ogue`, `-ence/-ense`).
