# #203 — One number for the smoke file size limit

## Issue

#203. `AGENTS.md` and the test name in `test/smoke-size.test.js` say smoke
files stay under 40,000 bytes, but the test's `LIMIT` is 55,000.

## Goal

An agent or reviewer reading the rule gets the same number the test enforces,
and the number lives in one place.

## Survey

- `test/smoke-size.test.js:25` — `const LIMIT = 55_000;`, raised for #139's
  `focus-announce.mjs` (the comment above it says why).
- `test/smoke-size.test.js:6` (header comment) and `:43` (test name) say
  40,000.
- `AGENTS.md:162` — "No file there may pass 40,000 bytes
  (`test/smoke-size.test.js`)."
- Two files are already over 40,000: `scripts/smoke/focus-announce.mjs`
  (50,154) and `scripts/smoke/app-large-text.mjs` (47,050). So 40,000 is not
  the rule in force; 55,000 is.
- Older specs in `docs/specs/` quote 40,000. They are the record of what was
  decided then, and are not changed.

## What would settle it

1. `LIMIT` stays `55_000` and is the only place the figure is written in
   `test/smoke-size.test.js`: the test name is built from `LIMIT` (it reads
   "every file that makes up the smoke harness is under 55,000 bytes") and the
   header comment refers to `LIMIT` rather than a number.
2. `AGENTS.md` no longer states a figure. It says a file there may not pass
   the limit in `test/smoke-size.test.js`.
3. `grep -rn "40,000\|40000\|40_000" AGENTS.md test/smoke-size.test.js`
   prints nothing.
4. `npm test` passes.

## Surfaces

Change: `test/smoke-size.test.js` (name and header comment only),
`AGENTS.md` (the one sentence), this spec.

Must not change: `LIMIT`'s value, any file under `scripts/`, any file under
`app/`, older `docs/specs/*`.

## Constraints

- One answer in one place (`CLAUDE.md`): the number lives in `LIMIT` only.
- No precache bump; nothing under `app/` changes.

## Design

Build the test name with a template string from `LIMIT`, formatted with
`toLocaleString('en-US')` so it reads "55,000". Reword the header comment to
say "under `LIMIT` bytes". Replace the figure in `AGENTS.md` with a pointer to
`LIMIT` in the test.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| the size test | `node --test test/smoke-size.test.js` — its printed name shows 55,000 | 1 |
| grep | the command in item 3 | 2, 3 |
| the proof pair | `npm test`, `npm run smoke -- --no-tests` | 4 |

## Out of scope

- Changing the limit's value or splitting any smoke file.
- Rewriting older specs.
