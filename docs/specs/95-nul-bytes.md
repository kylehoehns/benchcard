# #95 — Two NUL bytes in app/render.js make grep skip the file

## Issue

#95. `app/render.js` holds two raw NUL bytes, so `grep` treats it as binary and
silently finds nothing in it.

## Goal

Anyone searching the code, person or agent, gets a true answer from
`grep` about `app/render.js`, and no file under `app/` can quietly pick up a NUL
byte again.

## Decisions

The issue is unlabelled. The survey answered both of its questions from the
tree, so there is nothing for the maintainer to decide:

- **What wrote them:** they are deliberate separators in a cache key.
  `measureBarSideIfHeaderChanged` (`app/render.js`) builds
  `` `${v}<NUL>${barTitle text}<NUL>${teamBtn text}` `` so that no view name or
  title text can run into the next part and fake a match. NUL is a good
  separator because it never appears in that text. The bytes were typed raw,
  not as an escape.
- **Fix:** keep the separator and write it as the escape `\0` in the template
  literal. At runtime the string is exactly the same, so nothing that depends
  on the key changes, and the file has no raw NUL. (`\0` followed by `$` is a
  legal escape in a template literal; `\0` followed by a digit would not be.)

## What would settle it

1. `app/render.js` contains no byte `0x00`, and `grep -n measureBarSideIfHeaderChanged app/render.js`
   prints its matching lines (today it prints nothing).
2. The key `measureBarSideIfHeaderChanged` builds is the same string as before:
   the three parts joined by U+0000.
3. A test fails if any text file under `app/` (every tracked file except
   images, icons and fonts) contains a `0x00` byte, and names the file and the
   offset. It is shown red against the current `render.js` before the fix.
4. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `app/render.js` (the one line), `app/sw.js` (`VERSION`, `SHELL`), one
new test under `test/`.

Must not change: the key's value, anything else in `render.js`.

## Constraints

- **Precache bump:** `render.js` is precached. Bump `VERSION` in `app/sw.js`
  and set `SHELL` to the digest `npm test` names.
- **Reuse:** list `app/` the way the existing whole-tree tests do (for example
  `test/dead-import.test.js` or `test/sw.test.js`), not a second file walker
  with different rules about what counts. Binary assets are skipped by
  extension.
- This test reads files as bytes on purpose. That is its whole job, so it is a
  named seam here, not a source-reading stand-in for behavior.

## Design

- `render.js`: replace each raw NUL in the key with `\0`.
- `test/no-nul-bytes.test.js`: for every text file under `app/`, read the
  bytes, and assert `indexOf(0) === -1`, with a message naming the file and
  offset.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| byte scan of every text file under `app/` | `node --test`, `test/no-nul-bytes.test.js` | 1, 3 |
| `grep -n measureBarSideIfHeaderChanged app/render.js` prints lines | shell, reported in the PR | 1 |
| the key is unchanged: the escape evaluates to U+0000 | `node -e` check reported in the PR, plus `npm run smoke` (the bar-side measurement's checks) | 2, 4 |

## Out of scope

- NUL bytes outside `app/`.
- Changing how the bar side is measured or cached.
