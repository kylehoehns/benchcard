# #13 — The edit guards only guard the file tools

## Issue

#13. `guard-edit.sh` and `after-edit.sh` run only on the file tools, so a shell
write (`sed -i`, `>`, `tee`, `cp`, a Python one-liner) reaches the protected
files with neither hook firing. `AGENTS.md`'s "What is enforced" table reads as
if the rules hold for every write. The issue asks that the table be made true,
either by covering the shell path or by saying plainly which half is covered.

## Goal

A session reading `AGENTS.md` knows exactly what stops a bad edit and what
does not. For each protected file, the table says which tool surface the hook
covers and what catches a shell write instead, or that nothing does.

## Decisions

The issue is unlabelled. Its open questions are answered by the issue's own
constraints and the repo's docs, so none is the owner's to decide:

- **Narrow the claim; do not add a shell matcher.** The issue's constraints
  say the ALLOW cases are as load-bearing as the DENY cases, that a detector
  must fail closed, and that shell is not parseable in general. A matcher for
  "writes to a protected path" has to tell `sed -i x app/vendor/a.js` from
  `sed -n 1p app/vendor/a.js`, `cp app/vendor/a.js /tmp` from
  `cp /tmp/a.js app/vendor/`, and a heredoc that writes a path from one that
  only mentions it. The last one has already caused a false denial here.
  `python3 -c` and `node -e` can write any file with no shell syntax at all.
  Failing closed on everything it cannot parse would block ordinary reads, and
  `AGENTS.md` says a guard that eats ordinary work gets switched off. The issue
  itself expects this answer ("it may well answer 'narrow the claim'").
- **Most of the gap already has a second line of defense, and the table names
  it.** The survey found:
  - `app/vendor/**`: the `vendor drift` workflow re-runs `fetch.sh` on any push
    or PR that touches `app/vendor/` and fails on a byte of difference.
  - The six chart pages: `test/charts.test.js` ("every roster-size page on disk
    matches what scripts/charts.mjs renders") fails in `npm test`.
  - A precached file changed without a bump: `test/sw.test.js` names the
    digest in `npm test`, and `scripts/check-sw-version.mjs` fails CI's
    `checks that need history` job.
  - A British spelling: `test/spelling.test.js` scans the tracked tree.
  - `scripts/budgets.json`: **nothing.** No test reads `requests` as a pin, so
    a shell edit that raises it passes everything. This is the first miss the
    issue names. The table says so plainly, and review is the only check.
    Adding a content check for `requests` would change how the pin is
    re-pinned, which is out of scope here.
- **Open question 2 (a compound command) goes away**, since no Bash rule is
  added.
- **The claim is tied to the config, so it cannot drift back.** A test reads
  the matcher each hook is registered on in `.claude/settings.json`. While a
  hook's matcher does not include `Bash`, its rows in the table must say that
  a shell write is not covered. If someone later registers it on `Bash`, the
  test stops requiring that sentence.

## What would settle it

1. `AGENTS.md` § "What is enforced": the `guard-edit.sh` row and the two
   `after-edit.sh` rows say they fire on the file tools only (the tools named
   in their `settings.json` matcher), not on a shell write.
2. Next to the table, one short list names what catches a shell write to each
   protected thing: `vendor drift` for `app/vendor/`, `test/charts.test.js`
   for the chart pages, `test/sw.test.js` and `check-sw-version.mjs` for the
   precache bump, `test/spelling.test.js` for spelling, and nothing for
   `scripts/budgets.json`, which says review is the only check.
3. The sentence under the table that says `test/hooks.test.js` "asserts all
   of it" stays true: it asserts the hooks, not that the hooks see every write.
4. A new test in `test/hooks.test.js` reads each hook's matcher from
   `.claude/settings.json`. For `guard-edit.sh` and `after-edit.sh`, while
   the matcher has no `Bash`, the `AGENTS.md` table rows naming that hook
   (flattened with `test/prose.js`'s `flat`, so a wrap cannot hide the words)
   must say a shell write is not covered. Proven the `/new-guard` way:
   - red when that wording is removed from the `guard-edit.sh` row;
   - red when it is removed from an `after-edit.sh` row;
   - it asserts it found at least one row per hook, so it cannot pass by
     matching no rows.
5. No hook script changes. The existing ALLOW and DENY cases in
   `test/hooks.test.js` and `evals/*.json` still pass.
6. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `AGENTS.md` (the table and a short list beside it),
`test/hooks.test.js` (one new test).

Must not change: any file in `.claude/hooks/`, `.claude/settings.json`,
`evals/*.json`, anything in `app/`, so there is no precache bump.

## Constraints

- **One answer lives in one place.** The table lists; the reasons stay in the
  sections and files they belong to. Name a backstop by its file or job, do
  not restate what it checks at length.
- **Reuse, do not re-derive:** the tool list comes from `.claude/settings.json`
  in the test, never a copied string. Flatten with `test/prose.js`'s `flat`.
  The `wrap-blind.test.js` guard applies: no negated multi-word `.includes()`;
  use `lacks` or a positive check.
- **`/new-guard`** owns how the new test is written and proven.

## Design

- `AGENTS.md`: change the three rows' "How" cell so each says it fires on the
  file tools only, e.g. "denied, `guard-edit.sh` — file tools only, not a
  shell write". Then add a short "A shell write skips those two hooks. What
  catches it instead:" list with the five entries from item 2.
- `test/hooks.test.js`: parse `.claude/settings.json`, map each hook script to
  its matcher, pull the table rows out of `AGENTS.md` that name the script,
  and assert the wording from item 1 while the matcher lacks `Bash`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| the new settings-to-table test, with its red arms reported by hand | `node --test test/hooks.test.js` | 1, 4 |
| existing hook ALLOW/DENY cases and evals | `npm test` | 5 |
| the doc guards (`one-answer`, `sdlc`) over the edited `AGENTS.md` | `npm test` | 2, 3 |

## Out of scope

- A Bash matcher for writes to protected paths.
- A content check on `budgets.json`'s `requests` pin.
- Changing any hook script or its registration.
