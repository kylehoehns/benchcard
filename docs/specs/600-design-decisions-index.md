# #600 — An index of the design-decisions side files, with a check

Small-lane brief (docs and one guard). The issue is `ready-for-agent`.

## Issue

#600. `docs/design-decisions.md` is at its size limit, so new decisions go in
side files (`docs/design-decisions-*.md`). Nothing lists them all, so a
decision is easy to miss. Add an index, a check that every side file is in
it, and one line saying where new decisions go.

## What the survey found

- **The 60 KB limit is checked by `test/docs-size.test.js`.** It reads
  `MAX_BYTES=60000` from `.claude/hooks/guard-read.sh` and fails any `.md`
  under `docs/` over it. The new check goes in that same file, as a second
  test. No new script.
- **`docs/design-decisions.md` is 59,959 bytes: 41 bytes of room.** The index
  cannot fit. So the five season-record entries ("A day that ends is kept,
  not thrown away" through "A coach can take their record with them", about
  9.2 KB) move to a new side file, `docs/design-decisions-season.md`. They
  are one topic and nothing links to them by anchor. The one table row that
  names "And it can plan the next game" now points at the new file.
- **Eight side files exist, not five.** The issue lists filled-in, levels,
  make-up, rotation-order and together. Also on main: league-rules, plays-in
  and sits-at-most. With season, the index has nine lines.
- **The 60 KB limit is described only in AGENTS.md's hooks table** (the
  `guard-read.sh` row). The one new line goes in AGENTS.md § Layout, under
  the directory tree.

## What would settle it

1. `docs/design-decisions.md` has a `## Side files` section near the top, one
   short line per side file: a link and what decisions it holds.
2. In `test/docs-size.test.js`, a new test fails when:
   - a `docs/design-decisions-*.md` file is not linked in that section (it
     names the file and says to add a line to the index);
   - the section links a side file that does not exist;
   - the `## Side files` heading is missing (the check measured nothing).
3. All nine side files are listed and the suite is green.
4. `docs/design-decisions.md` stays under 60,000 bytes with the index in it.
5. AGENTS.md gains exactly one line: a new decision goes in the matching side
   file, or a new side file added to the index.

## Proof

The seam is `test/docs-size.test.js` under `node --test`, a guard built under
`/new-guard`. To show red without editing the real docs, the parsing lives in
a small function the test calls on both the real file and on in-memory
strings: an index missing one name, an index naming a file that does not
exist, no heading, and a new side file added. Then once by hand on the real
tree: delete one index line, see red, restore.

## Out of scope

- Rewording or regrouping the decisions themselves.
- Any change under `app/`. No coach note: docs and a test only.
