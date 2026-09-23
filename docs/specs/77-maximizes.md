# #77 — Plan sheet: British spelling in the Force together help line

## Issue

#77. The help line under "Force together pairs every stint" (`app/rules.js`,
`renderConstraints`) uses the British spelling of "maximizes", and the spelling
guard did not catch it.

## Goal

A coach reading the Plan sheet sees American spelling, like everywhere else in
the app. The spelling guard catches this word from now on.

## Decisions

The issue is unlabelled. The survey held up both claims, and the issue's own
"What to do" answers the design, so there is nothing for the maintainer to
decide:

- **The fragment is `maxim` + `is`, fixed to `maximiz`.** It follows the
  existing `organi` + `s` and `recogni` + `s` entries. It matches every form
  of the British verb (-e, -es, -ed, -ing) and none of the American ones.
  On today's tree it matches only `app/rules.js:108`.
- **Only this word.** The survey found other British `-ise` verbs (normalise,
  sanitise, serialise, optimise and more) in about 55 tracked files, mostly in
  comments. Adding them is a sweep of its own and goes to a follow-up issue,
  not this change.

## What would settle it

1. The help line reads exactly: `Left off, the plan maximizes their shared
   floor time and reports it.`
2. `WORDS` in `scripts/spelling.mjs` has the new entry, so `scan` flags the
   British form case-insensitively and suggests `maximiz`.
3. With the entry added but the copy not yet fixed, `test/spelling.test.js`'s
   tree scan fails and names `app/rules.js:108`. It passes once the copy is
   fixed.
4. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `scripts/spelling.mjs` (one `WORDS` entry), `app/rules.js` (one
word), `app/sw.js` (`VERSION`, `SHELL`), `test/spelling.test.js` only if a test
title counts the words (it says "eight").

Must not change: anything else in `app/rules.js`, the scan's rules, `ALLOWED`.

## Constraints

- **Precache bump:** `app/rules.js` is precached. Bump `VERSION` in
  `app/sw.js` and set `SHELL` to the digest `npm test` names.
- **Reuse:** the one word list in `scripts/spelling.mjs`. Build the fragment
  from pieces, like the others, so the module never contains it.

## Design

- Add `['maxim' + 'is', 'maximiz']` to `WORDS`.
- Change the word in the help line.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `scan` over every `WORDS` entry (existing loop) | `node --test`, `test/spelling.test.js` | 2 |
| tree scan, red before the copy fix and green after | `node --test`, `test/spelling.test.js` | 1, 3 |
| help line text on the preview's Plan sheet | `/browser-verify` | 1 |

## Out of scope

- Other British `-ise` verbs in the tree (follow-up issue).
