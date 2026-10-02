# #125 — Smoke checks ask for a page state and get it restored afterwards

## Issue

#125. A smoke check should get the page state it needs (saved record, width,
text size, boot wait) from one call, and the harness should guarantee the page
is put back afterwards.

## Goal

Someone writing or reading a smoke check sees one line that says what page it
starts from, and no setup or restore code around it. Every check starts from
the same baseline whether it runs in the full suite or alone under `--only`,
so a row can never pass or fail because of the row before it. Nobody coaches
through this: it is harness plumbing, and nothing under `app/` changes.

## What the survey found

Checked against the tree at `4ed4d19` (main). The issue's direction holds.
Its numbers are stale, because the harness has grown since the review on
2026-09-23.

| Issue says | Tree says |
| --- | --- |
| five overlapping helpers: `seeded`, `goRich`, `goSeed`, `reloadWithRecord` (`fixtures.mjs`), `landWiped`, `toGameOne` (`dom.mjs`) | true. Add `navigateAndWaitForCard` and `setWidth` (`dom.mjs`), which do the same jobs. `toGameOne` is a click path, not setup; it stays. |
| local copies such as `reloadIndex`/`waitForCard` (`card-at-32.mjs`) and `setRoot` (`pass-large-text.mjs`) | true. Also `atWidth` in `wide-layout.mjs` and `team-screen.mjs`, `measureAt` in `season.mjs`, `goRichWithLongName` in `bench-look.mjs`, `seed` in `sheet-spacing.mjs`. |
| boot wait copied 14 times in 10 files | true: 14 lines holding `document.fonts.ready` in 10 files under `scripts/smoke/`, plus one in `smoke.mjs`. |
| `setDeviceMetricsOverride` by hand 47 times in 20 files | now 59 `c.send(...)` calls in 26 files under `scripts/smoke/`, plus 1 in `smoke.mjs`. |
| `Page.setFontSizes` by hand 38 times in 14 files | now 54 calls in 21 files. |
| `Page.navigate` (not counted in the issue) | 10 calls in 5 check files, 4 in `fixtures.mjs`/`dom.mjs`, 1 in `smoke.mjs`. |
| the #35 race fixed in three helpers, `landWiped` repeating it | true. `seeded` serves `goRich`, `goSeed`, `reloadWithRecord` (and `card-at-32.mjs`); `landWiped` has its own copy of the on-new-document idiom. |
| "text size only takes effect after a reload" explained in four checks | now explained in 8 files. **The claim itself does not hold for CSS** on Chrome 153: after `Page.setFontSizes` with no reload, the root computes to 32px and `matchMedia('(max-width: 19em)')` flips at 320px straight away (probe below). The design still reloads after setting text size, because the checks mean "a coach who opened the app at 200% text", and boot-time JS (card fitting, first render) ran at the old size. The comments that say "only takes effect after a reload" are wrong and get deleted with the code they sit in. |
| RICH put back by five checks and by `smoke.mjs` twice | now 18 check files restore RICH themselves (`grep -l "goRich(c, origin).catch\|reloadWithRecord(c, origin, RICH)"`), plus `resetAfter` on `teamcolor` and `wakelock`, plus the fixture split in `smoke.mjs`. |
| `--only` can see a different page from the full run | true. Example: `narrow` does not load a page. In the full run it starts where `widelayout`'s `finally` left it: Today, on a page that has been through two widths and a `landWiped`. Under `--only` it starts on a fresh `goRich`, which boots onto the game screen (`RICH.view` is `'games'`). Same row, different screen. |
| "`npm run smoke` still passes all 50 checks" | the registry now has 75 rows (74 under `--no-tests`): 8 cold, 62 rich, 5 whole-run. |

Three more things the survey found that the issue does not name:

- **Emulated media leaks the same way.** `Emulation.setEmulatedMedia`
  (dark, forced colors, reduced motion, reduced transparency) is set by hand
  15 times in 6 files and reset in each check's own `finally`, some with
  `.catch` and some without. See decision D2.
- **The boot wait never fails.** It polls 60 × 50ms for its selector and then
  carries on as if it had appeared. A page that never booted is measured
  anyway. See decision D3.
- `cdp().on` (`chrome.mjs`) has no way to remove a handler, so every
  navigation adds one more permanent `Page.loadEventFired` listener. Harmless
  today; the new module uses a one-shot wait instead.

Probe used for the text-size finding (scratch script, not committed): boot
RICH at 320×844, read the root font size and `matchMedia('(max-width:
19em)')`; call `Page.setFontSizes` 32 with no navigation, wait 600ms, read
again. Printed `16px false`, then `32px true`, then `32px true` after a
reload.

Reload cost, measured the same way: 12 back-to-back `goRich` calls took
700–740ms each, median 702ms (MacBook, local).

CI's smoke step (`node scripts/smoke.mjs --no-tests`) took 16m30s–18m04s on
the last ten `tests` runs on main.

## Decisions

The issue left the interface to the spec. These are the choices the survey
could not settle from code. They are settled, as follows, and this spec is
written against them.

- **D1. The harness resets to the baseline before every rich row.** Not
  after, and not only for rows that ask. Resetting *before* is what makes
  `--only` and the full run identical by construction, and it means a row that
  throws halfway cannot hand a broken page to the next one. Cost: one reload
  per rich row, about 0.7s locally, 62 rows ≈ 45s. The 20 resets checks and
  `resetAfter` already do get deleted, so the net is about +30s locally on a
  run CI takes ~17 minutes over. Measured, not estimated, in the PR. (Slice 2,
  not slice 1.)
- **D2. Emulated media is part of the page state.** The state names its media
  features, and the reset clears them. Same leak, same fix, one more CDP call.
- **D3. A boot wait that times out throws.** `runCheck` turns the throw into
  a FAIL row that names the state it was waiting for. Any row that has been
  silently measuring an unbooted page will go red; that is the point, and it
  is fixed in the slice that finds it.
- **D4. Ship as a parent issue plus tickets** (`/to-spec`, `/to-tickets`), cut
  as in **Slices** below. One PR would touch ~45 check files at once and
  could not be reviewed against one spec. Five PRs, one per slice, each
  referencing #125; only the last closes it.

## What would settle it

All of these, on the last slice's commit:

1. No file under `scripts/smoke/` other than `page-state.mjs`, and not
   `scripts/smoke.mjs`, contains `send('Page.navigate'`,
   `send('Emulation.setDeviceMetricsOverride'`, `send('Page.setFontSizes'`
   or `send('Emulation.setEmulatedMedia'`. Counts today: 15, 60, 54, 15.
   Target: 0 outside `page-state.mjs`, and at least 1 of each inside it.
2. `document.fonts.ready` appears in exactly one file under `scripts/`
   the smoke harness owns: `scripts/smoke/page-state.mjs`. Today: 11 files.
3. `goRich`, `goSeed`, `reloadWithRecord`, `landWiped`, `seeded`,
   `navigateAndWaitForCard`, `setWidth`, and the local copies named in the
   survey table are gone. `grep -rn "goRich\|landWiped\|reloadWithRecord" scripts/`
   prints nothing.
4. No row in `registry.mjs` has `resetAfter`. No check module ends with a
   RICH restore: `grep -l "goRich(c, origin).catch\|reloadWithRecord(c, origin, RICH)"
   scripts/smoke/*.mjs` prints nothing (18 files today).
5. Every rich row starts from the same page. The harness takes a start
   fingerprint after each reset (see Design) and it equals the baseline's on
   all 62 rich rows. With the reset call removed from the loop by hand, the
   full run goes red on the first row that inherits a changed page.
6. `npm run smoke` prints 75 rows, all PASS, with no registry drift. Under
   `--no-tests`, 74.
7. Run time is reported in the final PR: wall time of `node scripts/smoke.mjs
   --no-tests` on `main` and on the branch, same machine, same session, plus
   the CI smoke step's duration before (16m30s–18m04s) and after.
8. `node scripts/smoke.mjs --no-tests --only "<row>"` passes for each of the
   rows that load no page of their own today: `rich fixture is live`,
   `a11y in overlays and dialogs`, `settings rows ≥ 48px, 320–390px`,
   `who's here rows ≥ 48px, 320–390px`, `plan rows ≥ 48px, 320–390px`,
   `plan sheet controls ≥ 48px`, `today and game controls ≥ 48px, 320–390px`,
   `tab order stays clear of the floating bar and action bar`,
   `no sideways pan at 320px`, and the sweep row (names as `registry.mjs`
   builds them; copy them from `--only nope`'s list).

## Surfaces

Change:

- `scripts/smoke/page-state.mjs` — new. The only module that navigates,
  resizes, sets text size, sets emulated media or waits for boot.
- `scripts/smoke.mjs` — the cold load goes through `page-state.mjs`; the rich
  loop calls the reset before each row; `resetAfter` handling and the second
  `goRich` go.
- `scripts/smoke/registry.mjs` — drop `resetAfter`; update the header comment
  that says the reset is "#125, out of scope here".
- `scripts/smoke/fixtures.mjs` — keeps the records (`SEED`, `RICH`, `FOUR`,
  `SAMPLE_TEAM`, `ONE_GAME`, `partPlayed`, `withSecondTeam`, ...). Loses the
  navigation helpers.
- `scripts/smoke/dom.mjs` — loses `setWidth`, `landWiped`,
  `LOCALSTORAGE_WIPE`, `navigateAndWaitForCard`. Keeps `SETTLE`, `step`,
  `evalIn`, probes, `toGameOne`.
- every check module that calls one of the four CDP methods or the helpers
  above (about 45 files; `grep` in item 1 and 3 lists them).
- `test/smoke-registry.test.js` — its allow-list of `./smoke/` imports in
  `smoke.mjs` gains `./smoke/page-state.mjs`.
- `test/smoke-page-state.test.js` — new (Proof).
- `AGENTS.md` § Layout — one sentence: a check asks `page-state.mjs` for its
  page and the harness resets before each row. Say it once, there.

Must not change:

- anything under `app/`. No precache bump.
- the cold load and the payload snapshot. The budget is one navigation of
  `SEED`; nothing may add a navigation before `report.payload` is taken.
- what each check asserts. This moves setup and restore, not verdicts.
- `scripts/compare-shots.mjs` (its own `goFirstRun`) — not part of smoke.

## Constraints

- **Two fixtures, on purpose (A26).** `SEED` for the cold load, `RICH` for
  everything after. The baseline is `RICH`; `SEED` is only ever asked for
  explicitly (`game passes` does, today via `goSeed`). Do not merge them.
- **Reuse the #35 fix, do not re-derive it.** Records are written by a script
  added with `Page.addScriptToEvaluateOnNewDocument` and removed in a
  `finally` — `seeded`'s idiom, moved into `page-state.mjs` as the one seeding
  path. Wiping is the same path with a different script.
- **Reuse `SETTLE`** (`dom.mjs`) as the last step of the boot wait. Do not
  write a second animation wait.
- **Reuse `WIDTH`/`HEIGHT` (`dom.mjs`) and `LARGE_TEXT_*` (`sizes.mjs`).**
  The baseline reads them; it does not restate 390, 844 or 16.
- **The on-new-document scripts `smoke.mjs` registers stay registered:**
  `__SMOKE_VIEWPORT` and the forced DejaVu Sans font (#177). The SEED re-seed
  in that same script is what forces `landWiped` to exist; see Design for
  what happens to it.
- **`/new-guard` owns the guard test.** It counts before it judges (rule 2a)
  and is falsified by planting a call.
- **File size.** Every file under `scripts/smoke/` stays under
  `test/smoke-size.test.js`'s limit.
- **Sibling work.** #187–#191 and #195–#198 edit `CLIP_SWEEP_KNOWN_ISSUES` in
  `scripts/smoke/clip-sweep.mjs` and CSS in `app/app.css`. This spec touches
  `clip-sweep.mjs`'s setup and `finally` (lines ~440–533), not its known-issue
  list. Migrate `clip-sweep.mjs` in the last slice, after those merge.
- **Iterate, then prove** (`AGENTS.md` § Layout): `--only` per row while
  migrating; the proof pair once per commit.

## Design

### The state

A page state is a plain object. Every field is optional; what is left out
comes from the baseline.

```js
// scripts/smoke/page-state.mjs
export const BASELINE = Object.freeze({
  page: '/index.html',   // path under origin; '/about.html' etc. for static pages
  query: '',             // e.g. '?try=9'
  record: RICH,          // a record object, 'wiped', or 'kept'
  width: WIDTH, height: HEIGHT,
  textPx: 16,            // root text size, via Page.setFontSizes (standard and fixed)
  media: [],             // Emulation.setEmulatedMedia features
  ready: `document.querySelector('.card')`, // JS expression, polled until truthy
  freshHistory: false,   // navigate to a cache-busted URL first (reloadWithRecord's trick)
  scripts: [],           // extra on-new-document sources, removed after the boot
});
```

- `record` as an object: its `version` picks the key. `version: 7` writes
  `benchcard.v7` and removes `benchcard.v3` and `benchcard.v7.bak`
  (`goRich`/`reloadWithRecord` today). `version: 3` writes `benchcard.v3` and
  removes the v7 keys (`goSeed` today). Anything else throws.
- `'wiped'` clears storage (`landWiped` today).
- `'kept'` writes nothing: reload whatever the app saved. Several checks do
  this today to prove persistence (`three-days`, `game-title`, `no-games`,
  `timeline-card-sheet`).
- A RICH with a different `ui` is a record like any other:
  `fixtures.mjs` exports `richWith(ui, base = RICH)` so `goRich(c, o, ui,
  base)`'s two extra arguments have one home.
- Unknown fields throw. A typo must not silently mean "baseline".

### The calls

```js
export async function land(c, origin, want = {})   // get the page into this state
export async function resize(c, width, height = HEIGHT, { debounce = false } = {})
export async function setMedia(c, features = [])    // flip emulated media in place
export async function reset(c, origin)              // land(c, origin, {}) plus the fingerprint
```

`land` does, in order: set device metrics, set font sizes, set emulated
media, add the seeding script and any `scripts`, navigate (twice if
`freshHistory`), wait for the load event once, then the one boot wait:
`document.fonts.ready`, poll `ready` every 50ms up to 3s, `SETTLE`. If `ready`
is still false it throws `boot wait timed out: <ready> on <page><query>`
(D3). The added scripts are removed in a `finally`.

`resize` is for a check that sweeps widths inside one page load (`sweep`,
`narrow`, `width-sweep`, the touch sweeps, `wide-layout`). It sets the
metrics and waits two frames; `debounce: true` adds the 400ms wait
`wide-layout`'s `atWidth` needs for `render.js`'s debounced repaint. It does
not reload and does not change the text size. It is not a restore: the next
row's `reset` is.

`setMedia` flips emulated media inside one page load, with no reload (the
dark-mode and reduced-motion sweeps, `SOLID_FALLBACK_MEDIA`). It is not a
restore: the next row's `reset` clears it.

Static pages (`static.mjs`) use `land` with `page` set; their `ready` is
`true`, so the boot wait is fonts plus `SETTLE`.

### The harness

- **Cold path:** `smoke.mjs`'s first navigation becomes
  `land(c, origin, { record: SEED })` — a SEED record written the same way,
  still exactly one navigation before the payload snapshot. `cardAt32Pass`
  uses `land` for its 32px load and its way back.
- **The global SEED re-seed.** `smoke.mjs`'s on-new-document script writes
  `benchcard.v3` on *every* navigation. After the cold load it only ever
  matters to a `'wiped'` or `'kept'` landing, where it quietly brings SEED
  back. Split the script: `__SMOKE_VIEWPORT` stays registered for the
  session; the SEED write becomes the cold load's own `record`. Then
  `'wiped'` needs no special handling and `'kept'` means kept.
- **Rich loop:** before each rich row, `await reset(c, origin)`. This
  replaces the fixture-split `goRich` and `resetAfter`. The `--only` rich
  branch calls the same `reset`, so both paths share one line.
- **Start fingerprint.** `reset` ends by reading a fingerprint from the page:
  `location.pathname + location.search`, which top-level screen is visible,
  `documentElement.clientWidth`/`clientHeight`, the root's computed font
  size, `matchMedia('(prefers-color-scheme: dark)').matches`,
  `matchMedia('(forced-colors: active)').matches`, and the `benchcard.v7`
  string's length and a cheap hash. The first `reset` records it as the
  baseline. Every later `reset` compares; a mismatch fails that row with
  `start state differs from baseline: <field> was <a>, want <b>`. This is the
  guard for **What would settle it** item 5.

### What a check looks like after

```js
// before (three-days.mjs)
await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
await c.send('Emulation.setDeviceMetricsOverride', { width: LARGE_TEXT_WIDTH, ... });
await c.send('Page.navigate', { url: origin + '/index.html' });
... boot wait ...
} finally {
  await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } }).catch(() => {});
  await c.send('Emulation.setDeviceMetricsOverride', ...);
  await goRich(c, origin).catch(() => {});
}

// after
await land(c, origin, { record: 'kept', width: LARGE_TEXT_WIDTH, textPx: LARGE_TEXT_PX,
  ready: `document.querySelector('.today-game')` });
```

No `finally`. The next row's `reset` restores everything.

A check that lands several states in a row still calls `land` once per
state; it never restores between them either, because each `land` sets every
field.

## Proof

Seams, agreed here so the build can run unattended:

1. **`test/smoke-page-state.test.js`, the pure half** (`node --test`, built
   with `/tdd`). `page-state.mjs` exports `planLanding(want)`, a pure function
   returning the resolved state and the seeding script source; `land` only
   executes that plan. Tests: an empty `want` resolves to `BASELINE`; a v7
   record writes v7 and removes v3 and `.bak`; a v3 record writes v3 and
   removes both v7 keys; `'wiped'` clears; `'kept'` has no seeding script; an
   unknown field throws; a record with another version throws. Covers the
   Design's state rules.
2. **`test/smoke-page-state.test.js`, the guard half** (source-reading, so
   built under `/new-guard`). Walks `scripts/smoke.mjs` and every file under
   `scripts/smoke/`, counts the four CDP sends and `document.fonts.ready` per
   file, asserts the total found inside `page-state.mjs` is ≥ 1 for each
   (rule 2a), and asserts no other file has any. Falsify it by planting one
   `c.send('Page.setFontSizes', ...)` in a check module and watching it fail.
   Covers items 1 and 2. During migration it carries a per-file allow-list
   pinned to today's counts; each slice shrinks it and none may raise it
   (`AGENTS.md`'s rule for allow maps). The last slice deletes the list.
3. **The start fingerprint, in the full run** (`npm run smoke`). Covers item
   5. Falsify it once by hand: comment out the `reset` before rich rows,
   run, see it go red on a row that inherits a changed page (`narrow` is
   the known one), restore.
4. **`--only` on each row in item 8.** Covers item 8.
5. **The proof pair on each slice's commit** — `npm test`, then
   `npm run smoke -- --no-tests`, timed with `time`. Covers items 6 and 7.
   The first slice also times `main` in the same session, as the "before".

Items 3 and 4 of **What would settle it** are `grep`s, run and pasted into
the last PR.

## Slices

This is a large change. Cut it into PRs that each leave the tree green:

1. **The module, behind the old names** (M). Add `page-state.mjs` with
   `planLanding`, `land`, `resize`, `reset`, and seam 1's tests. Re-point
   `goRich`, `goSeed`, `reloadWithRecord`, `landWiped`,
   `navigateAndWaitForCard` and `setWidth` at it as one-line wrappers, so
   every check still works untouched. Add seam 2's guard with today's counts
   as the allow-list, so no new direct call can land while the rest is in
   flight. Boot-wait timeout throws (D3); fix any row it turns red here.
   Satisfies item 2 except for the local copies.
2. **The harness owns the reset** (M). Reset before every rich row, the
   start fingerprint, drop `resetAfter`, split the global SEED script, delete
   the trailing RICH restores in the 18 check files. Times the full run
   before and after. Satisfies items 4, 5 and 8.
3. **Large-text checks move onto `land`** (M). Every file that calls
   `Page.setFontSizes`: `card-at-32`, `pass-large-text`, `game-title`,
   `three-days`, `today-and-back`, `timeline-card-sheet`, `phone-gutter`,
   `font-draws`, `app-large-text`, `add-game-fit`, `bench-details`,
   `bench-look`, `flow-inset`, `resume-bar`, `sheet-spacing`, `team-screen`,
   `roster-in`, `season-look`, `type-scale`, `static`. Shrinks the allow-list.
4. **Width sweeps and emulated media move onto `resize`/`land`** (M). The
   remaining `setDeviceMetricsOverride` and `setEmulatedMedia` callers
   (`narrow`, `sweep`, `width-sweep`, `wide-layout`, `season`, `touch`,
   `floating-controls`, `forced-colors`, `game-rows-fit`, `first-run-flow`,
   `no-games`, ...).
5. **`clip-sweep.mjs`, delete the wrappers, empty the allow-list** (S).
   After #187–#191 and #195–#198 merge. Removes the old helper names
   (item 3), updates `AGENTS.md` § Layout, and reports the final run time
   (item 7).

Slices 3 and 4 can run in either order; both come after 1 and 2.

## Out of scope

- Splitting `FR_SNAPSHOT`/`FR_RESTORE` (in-page state restores *inside*
  `overlay` and `touch`). They undo a first-run commit between states within
  one row, not between rows.
- `toGameOne` and other click paths. They drive the app; they are not setup.
- The cold rows and `smoke-checks.js`.
- `scripts/compare-shots.mjs`.
- Making the run faster. It will be slightly slower (D1); that is the
  trade.
- `AGENTS.md` saying files under `scripts/smoke/` may not pass 40,000 bytes
  while `test/smoke-size.test.js` allows 55,000. A real mismatch, but a
  separate issue.
