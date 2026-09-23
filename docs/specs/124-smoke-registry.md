# #124 — Adding a smoke check means one module and one registry entry

## Issue

#124. Adding a browser check to `npm run smoke` means editing five places
that must agree. It should take the check's own module and one registry
entry.

## Goal

Someone adding a smoke check writes its module and one entry in
`scripts/smoke/registry.mjs`, and touches nothing else. The full run and
`--only` both walk that one list, so the run order is written once. No test
or doc pins the number of checks by hand.

## Decisions

The issue left the interface to the spec. Nothing here is the owner's to
decide: it is harness plumbing no coach sees. Each decision follows the rule
`CLAUDE.md` and `AGENTS.md` put first: one answer lives in one place.

- **The registry imports the checks.** Each entry in `registry.mjs` carries
  its `run`. This retires the `RUN` map in `smoke.mjs` and the pass imports
  there.
- **The loop breaks by moving the constants, not by loading lazily.** Today
  37+ checks import from `registry.mjs`. They need two things from it:
  - the shared sizes (`NARROW`, `SWEEP_*`, `SHEET_MIN`, `WIDE_MIN`, `RAIL`,
    `LAPTOP`, `SWEEP_EXTRA`, `TOUCH_*`, `LARGE_TEXT_*`), and
  - `nameOf(<own id>)`.

  The sizes move to a new `scripts/smoke/sizes.mjs`, which imports nothing.
  Every importer switches to it, with no re-export from `registry.mjs`: that
  would be a second path to one fact. The importers are the checks,
  `scripts/compare-shots.mjs`, `test/wide-layout.test.js` and
  `test/touch-floor.test.js`.
- **The harness names each row. A check returns `{ pass, detail }`.** The
  runner adds `name` from the entry. Every check drops its
  `import { nameOf }` and its `name:` line.
  - `card-at-32.mjs` is not a registry row. It edits the cold `cardsize`
    row in place, so the harness passes it that row's name, or it keeps
    `nameOf('cardsize')` if that adds no loop. The developer picks
    whichever leaves no loop, and says which.
- **One runner, for the full run and for `--only`.**
  `runCheck(entry, ctx)` calls `entry.run(ctx)`, adds the name, and turns a
  throw into a FAIL row, `threw before finishing: <first line>`. That is
  today's `safeCheck` wording.
  - `--only` now uses the same runner. A check that throws under `--only`
    prints a FAIL row and exits 1, where today it crashes with a stack. Both
    are non-zero; the row is the clearer of the two.
- **Resets and reshuffles move into the entry.**
  - `resetAfter: true` on `teamcolor` and `wakelock` replaces the two
    hand-placed `goRich` calls in `smoke.mjs`.
  - `replaces: <name>` holds the cold row that a swept check takes the place
    of. It covers six entries: `touch`, `settingsrows`, `whorows`,
    `planrows`, `planctrls` and `todaygamerows`. `planrows` filters by prefix
    today (`startsWith('plan rows')`). The developer checks which cold names
    that matches, and makes `replaces` exact if exactly one matches. If more
    match, `replaces` takes a list. Behavior is unchanged either way.
  - Checks that restore RICH themselves keep doing so. Making the harness
    own restoring is #125.
- **The drift check stays.** Rich rows can no longer drift, because the run
  walks the list. But the eight cold names are still hand-typed copies of
  `smoke-checks.js`'s `add(...)` calls, and the three budget names of
  `budgets.mjs`'s. The drift check is what catches a rename there.
- **Counts come from the list.**
  - `test/smoke-only.test.js` compares the refusal's name list to the
    registry's selectable names, imported. It pins no number.
  - `AGENTS.md` stops stating a count at lines 149 and 198.
  - The `registry.mjs` header and the test comments drop their stale 21, 20
    and 16.
- **The output stays exactly the same.** Each check's `detail` text,
  including its problem cap of 4, 5 or 6, is untouched. Unifying those is
  the issue's "could also tidy", and it would change what 40 rows print in
  the same diff. Out of scope.

## What would settle it

1. `scripts/smoke.mjs` imports no check module. Its only imports from
   `./smoke/` are `chrome.mjs`, `dom.mjs`, `fixtures.mjs`, `registry.mjs`
   and `card-at-32.mjs`. It has no `RUN` map, no per-check `safeCheck(...)`
   line, no `goRich` between checks, and no reshuffle filter naming a row.
2. No module under `scripts/smoke/` except `registry.mjs` and `card-at-32.mjs`
   imports `registry.mjs`. No check module calls `nameOf`.
3. Every module under `scripts/smoke/` that exports a function named
   `…Pass` is the `run` of exactly one registry entry. `card-at-32.mjs`'s
   `cardAt32Pass` is the one named exception. A new check left out of the
   registry fails `npm test`.
4. `test/smoke-only.test.js` has no hand-pinned count. It still refuses
   `nope` and the six non-selectable names before Chrome starts.
5. `AGENTS.md`, `registry.mjs` and `test/smoke-only.test.js` state no check
   count as a number.
6. `npm run smoke` prints the same 51 row names in the same order as `main`
   at `47fdd43`. That is 50 with `--no-tests`, and 46 names that `--only`
   lists. Compare the `--json` name lists.
7. `node scripts/smoke.mjs --only "bench mode wake lock"` and
   `--only "card is 3.45 × 5in"` each print their one row and pass.
8. `npm test` and `npm run smoke` pass.

## Surfaces

Changes:

- `scripts/smoke.mjs`;
- `scripts/smoke/registry.mjs`;
- the new `scripts/smoke/sizes.mjs`;
- every check module under `scripts/smoke/`: the import line and the `name:`
  line only;
- `scripts/smoke/card-at-32.mjs`;
- `scripts/compare-shots.mjs`: the import path only;
- `test/smoke-only.test.js`, `test/wide-layout.test.js`,
  `test/touch-floor.test.js`: import paths, the count;
- a new guard test for items 1–3;
- `AGENTS.md`: the two count sentences.

Must not change:

- `app/`, so there is no precache bump;
- `scripts/smoke-checks.js`;
- `scripts/budgets.mjs` and `budgets.json`;
- any check's measurements or `detail` text;
- the run order;
- which checks restore RICH themselves.

## Constraints

- **One answer lives in one place.** The run order and the list of checks
  are the registry. The sizes are `sizes.mjs`, with no re-export.
- **Guards follow `/new-guard`.** The new source-reading test (items 1–3) is
  a named seam here. It must be seen to fail: add a stray check import to
  `smoke.mjs`, or a `…Pass` module missing from the registry, watch it go
  red, then revert.
- **No file under `scripts/smoke/` may pass 40,000 bytes**
  (`test/smoke-size.test.js`). The registry grows by one `run` line per
  entry.
- **The iterate-then-prove rule** (`AGENTS.md` § Layout). Use `--only`
  while iterating. The full proof pair runs once, at commit.

## Design

```js
// registry.mjs
import { cardFontPass } from './card-font.mjs';
// ...
export const ROWS = Object.freeze([
  { id: 'console', name: 'no console errors', selectable: false, setup: null },
  { id: 'overflow', name: 'no horizontal overflow', selectable: true, setup: 'cold' },
  // ...
  { id: 'teamcolor', name: '...', selectable: true, setup: 'rich',
    run: ctx => teamColorPass(ctx.c, ctx.origin), resetAfter: true },
  { id: 'touch', name: `${TOUCH_CHECK}, ...`, selectable: true, setup: 'rich',
    run: ctx => touchPass(ctx.c, ctx.origin, ctx.source), replaces: TOUCH_CHECK },
  // ...
]);
export const nameOf = id => ROWS.find(r => r.id === id).name;
```

`smoke.mjs`'s full run, after `goRich`, becomes one loop over the rows with
`setup === 'rich'`. For each row it:

1. drops the `replaces` row(s);
2. pushes `await runCheck(row, ctx)`;
3. calls `goRich` if `resetAfter` is set.

The `--only` rich branch calls `runCheck(ONLY, ctx)`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| no check import in `smoke.mjs`, no `nameOf` in checks, every `…Pass` in the registry | a new `node --test` guard (source-reading, named here) | 1, 2, 3 |
| refusal list equals the registry's selectable names | `test/smoke-only.test.js` | 4 |
| no hand count in docs | a grep at review, and the guard if cheap | 5 |
| same names, same order | `--json` from `main` and the branch, compared | 6 |
| `--only` still runs one row | `--only` twice | 7 |
| the whole suite | `npm test`, `npm run smoke` | 8 |

## Out of scope

- Unifying each check's problem cap and wording.
- The harness restoring the page between checks (#125).
- Making the eight cold names or the three budget names imported instead of
  hand-typed.
