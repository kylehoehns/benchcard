# #480 — Smoke hides which node tests failed

## Issue

#480. When `node --test` fails inside `scripts/smoke.mjs`, the log says only
`FAIL  node --test  2271/2285 passing`; it should name each failing test, its
file and the first lines of its error, in the log and in `--merge` output.

## Goal

When the suite goes red in local CI or in GitHub's `smoke` job, whoever reads
the log can see which tests failed and why, without rerunning anything. That
turns "probably machine load" into a name someone can check.

## Decisions

The ticket is `ready-for-agent` and the survey held up its claims: `runTests()`
(`scripts/smoke.mjs`) reads the child's stdout only for the `pass` and `tests`
counts, and `mergePartials` (`scripts/smoke/shard.mjs`) copies `nodeRow` from
the suite partial unchanged. Choices the ticket left open, made here:

- **Where the names come from.** Node 24's default reporter, spec, already
  ends a failing run with a `✖ failing tests:` block: one entry per failing
  leaf test, each `test at <file>:<line>:<col>`, then `✖ <name> (<duration>)`,
  then the error indented two spaces, then its stack. The parser reads that
  block. No second reporter, no flag change to the child.
- **What "first lines of the error" means.** Up to 3 non-blank lines of the
  error, stopping at the first stack line (a line starting `at `). Trimmed.
- **Shape.** Each failure is `{ name, file, error }`, where `file` is the
  `<file>:<line>:<col>` text after `test at`, and `error` is an array of
  strings. `nodeRow.failures` is that array, present only when the suite
  failed with at least one entry.
- **Print cap.** The log prints the first 20 failures and then
  `… and N more`. The JSON keeps all of them.
- **Where it prints.** Directly under the `node --test` row, wherever that row
  prints: a full run, `--shard suite`, and `--merge`. Passing output is
  unchanged.

- **The import allow-list.** `test/smoke-registry.test.js` pins which
  `./smoke/` modules `smoke.mjs` may import. `suite-failures.mjs` is shared
  plumbing, not a check, so it joins the list (seven becomes eight) rather
  than being reached through a re-export.

## What the loaded runs found

Three loaded runs (two `node --test` plus `--shard 1/3` and `--shard 2/3`, all
in one slot), read by name:

- **Fixed: Share link tapped before it came on.** `sit-survives-scenarios`
  test 5 failed with `sharedLink: nothing was shared`. The Hand off pane
  builds its link async and Share link starts disabled; a tap on it then does
  nothing. `coach.shareLink()` already waits for the button, but three tests
  tapped it directly (`card-scenarios`, `night-before-scenarios`,
  `sit-survives-scenarios`). They now call `coach.shareLink()`. A 1500 ms
  delay added to the link build by hand failed 4 of their 21 tests before the
  change and none after.
- **Ticketed (#481): `Inspected target navigated or closed`.** Both tests in
  `smoke-timing.test.js` threw this from the `rich fixture is live` row. A
  navigation race in the harness, not #400.
- **Ticketed (#482): the footer guard allowed once.** In the by-hand proof of
  item 2 (a `--shard suite` beside three shards), `hooks.test.js:96` failed
  with `null !== 'deny'`. Not reproduced in 3400 tries; cause unknown.
- **Not a timing bug: `build.test.js` and `dist/`.** Its last test deletes and
  rebuilds the repo-root `dist/`, so two suites in one checkout race on it.
  CI and local CI each run one suite per checkout, so this only bites when
  two suites share a tree on purpose. Noted, not changed.

## What would settle it

1. A pure `failuresOf(stdout)` returns `[]` for passing spec output, and for
   the failing output in the Design's example returns the two entries with
   name, file and error lines exactly as written there.
2. A test broken on purpose (one `assert.equal(1 + 1, 3)` added to a real test
   file) shows its name, file and error under the `node --test` row in
   `node scripts/smoke.mjs --shard suite --out <f>` output, and the same lines
   in `--merge <dir>` output. Pasted in the PR.
3. The `--shard suite` partial's `nodeRow.failures` holds that entry.
4. A passing run prints exactly what it printed before (no extra lines).
5. Under load (two suites plus smoke shards in one slot), at least one failure
   is reproduced and named, or the PR says how many loaded runs were tried and
   that none failed. Any test found to depend on timing is fixed or gets its
   own ticket.
6. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `scripts/smoke.mjs` (`runTests`, printing the failures under the
row), `test/smoke-registry.test.js` (the allow-list), the three scenario
files above, a new pure module `scripts/smoke/suite-failures.mjs` (the parser and the
printed lines), a new test `test/suite-failures.test.js`.

Must not change: the row's `name`, `pass` or `detail`; the partial's other
fields; `mergePartials` (it already carries `nodeRow` whole, so `failures`
rides along).

## Constraints

- Harness only. Nothing under `app/` changes, so no precache bump and no look
  check.
- **Reuse:** the count regex stays as it is; the failures are one more read of
  the same `stdout`. Printing goes through one helper used by all three print
  sites, not three copies.
- The parser is pure and has many input cases, so its seam is `node --test`
  on its exports (`AGENTS.md` § Test seams).
- Output that is not spec output (no `✖ failing tests:` block, e.g. a TAP run
  or a crash) yields `[]`, never a throw.

## Design

Example failing spec output (trimmed):

```
ℹ fail 2

✖ failing tests:

test at test/a.test.js:3:1
✖ breaks on purpose (0.497791ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  2 !== 3
  
      at TestContext.<anonymous> (file:///…/test/a.test.js:3:42)
      at Test.runInAsyncScope (node:async_hooks:227:14)

test at test/a.test.js:4:36
✖ inner fails (0.070042ms)
  Error: boom
  second line
      at TestContext.<anonymous> (file:///…/test/a.test.js:4:70)
```

gives

```js
[
  { name: 'breaks on purpose', file: 'test/a.test.js:3:1',
    error: ['AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', '2 !== 3'] },
  { name: 'inner fails', file: 'test/a.test.js:4:36', error: ['Error: boom', 'second line'] },
]
```

Printed under the row, indented to line up with the row's name column:

```
  FAIL  node --test  2284/2285 passing
        ✖ breaks on purpose  test/a.test.js:3:1
            AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
            2 !== 3
```

## Proof

- `test/suite-failures.test.js` under `node --test`, on the module's exports:
  items 1 and 4's line logic (empty for passing output, the example above, the
  20-entry cap, non-spec output gives `[]`).
- Items 2 and 3: run by hand with a deliberately broken test, output pasted in
  the PR, then the break reverted.
- Item 5: loaded runs inside one slot, results above and in the PR; the
  Share link fix proved red then green with a hand-added delay.

## Out of scope

- #400's boot-wait timeouts (a different failure).
- Showing the child's stderr when the suite fails to run at all.
