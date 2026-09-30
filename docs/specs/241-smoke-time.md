# #241 — smoke check: cut the wait, keep every check

## Issue

#241: the smoke check takes ~18 minutes in CI and on a laptop; find where the
time goes and cut it, with every current row still running and still able to
fail.

## Goal

A PR's `smoke (390×844)` job finishes in **under 8 minutes**, so a merge queue
and local proof runs stop waiting on it. No row is dropped, merged away or
weakened.

## What the survey found (and what it falsified)

A profiled full run (`--no-tests`, this Mac, every row PASS) spent 1088s in the
70 rich rows:

| Where the time goes | Calls | Time |
| --- | --- | --- |
| `SETTLE` inside `step()`/evals — waiting out the app's own animations | 1671 | 611s (56%) |
| Node-side fixed sleeps (`wait(ms)`, `setTimeout(r, ms)`) | 1196 | 258s (24%) |
| `land()` reloads, including their own boot wait and `SETTLE` | 202 | 109s (10%) |
| Everything else — the actual checks | ~4100 | 61s (6%) |

- The issue says fixed sleeps are "well under a minute". **False**: it counted
  sleep *sites* (~68). Many run inside loops; executed, they total 258s. Worst
  rows by sleep time: `add a game: three steps` 39s, `focus lands on the pushed
  heading…` 27s, `edit a rule in place` 27s, `plan sheet` 23s.
- Most `SETTLE` waits are 400–1000ms: `riseIn`/`swapIn` in `app/fx.js`
  stagger 260ms fades across many rows. They are real animations running at
  real speed, not a stuck wait (only 1 of 102 in the slowest row hit the 3s cap).
- `Animation.setPlaybackRate` (CDP) at 100, set once at session start, holds
  across reloads and cut the rich rows to **535s**. Two rows failed:
  - `sentence and sheets` asserts `#sheetWho` is *still sliding shut* 120ms
    after a drag release. It tests the animation itself, so it must run at
    real speed. This is the expected casualty.
  - `mid-game rotation change offers Undo` reported a second Undo toast after
    the Sub interval edit's Undo: 3 consecutive failures at 100×, then 6
    passes (including with the unchanged 450ms wait). Never failed at 1×, even
    with 4s waits. **Cause unknown**: an app race that fast animations expose,
    or a harness read racing the Undo toast's exit. It must be understood, not
    retried away.

## What would settle it

1. **Fast animations are the default.** Every page the smoke session opens
   plays WAAPI/CSS animations at a named playback rate (one constant, ≥ 20),
   set once at session start, in both the full run and `--only`.
2. **A row can opt out.** A registry field (e.g. `motion: 'real'`) makes the
   runner put the rate back to 1 for that row and restore the fast rate after
   it. `sentence and sheets` carries it. **Falsified:** with the field removed,
   `node scripts/smoke.mjs --only "sentence and sheets"` FAILs with the
   "already closed 120ms after a drag release" problem; with it, PASS.
3. **The rotation-undo race has a named cause and a fix at that cause.** If the
   app raises or keeps a stale Undo toast, fix the app test-first. If the check
   reads mid-transition, fix the read to wait on the condition it means. Either
   way: `--only "mid-game rotation change offers Undo"` PASSes **10 of 10** runs
   at the fast rate, and the check still FAILs if a second Undo toast really
   appears (show it: e.g. temporarily raise one from the restore path, see FAIL).
4. **Fixed sleeps shrink to what they actually wait for.** A sleep that follows
   a `step()` only to let an animation or transition finish is removed or
   replaced by a wait on the observable condition (dialog closed, toast
   present, element's animations finished). A sleep kept for an app timer
   (e.g. `render.js`'s 400ms resize debounce, the 140ms `edit()` debounce)
   stays, sized from that timer. Target: **≤ 60s of executed sleep in a full
   run**, as reported by item 5.
5. **`--timing`.** `node scripts/smoke.mjs --timing` prints, after the table,
   each rich row's wall-clock seconds, slowest first, plus the run's total
   and total executed node-side sleep. Without the flag the output is unchanged
   (so `--json` and the CI log are unaffected).
6. **Speed.** A full local `npm run smoke -- --no-tests` on this Mac: rich rows
   ≤ 360s total by `--timing`. On the PR, the `smoke (390×844)` CI job finishes
   in under 8 minutes.
7. **Nothing lost.** Every row that printed before prints after, with the same
   name, and the full run is all PASS. `node --test` green.

## Surfaces

- Change: `scripts/smoke.mjs` (rate at session start, per-row opt-out,
  `--timing`), `scripts/smoke/registry.mjs` (the opt-out field and its doc
  comment), `scripts/smoke/rotation-undo.mjs` and/or the app file the race
  lives in, the row modules whose sleeps shrink (start with `add-game*`,
  `focus-announce.mjs`, the rule-edit and plan-sheet rows), `test/` for the
  `--timing` and opt-out seams, `scripts/smoke/README.md` and `AGENTS.md`
  § Layout where they describe how smoke runs.
- Must not change: `scripts/budgets.json`/`budgets.mjs` (the cold load is
  measured before any of this matters; a budget move here is a bug), any row's
  name, any row's assertions except where item 3's fix is the assertion's own
  read, `.github/workflows/test.yml` (no sharding in this change).

## Constraints

- **Dev behaves like prod.** Speeding up animations changes *when* the page
  gets to its end state, not *what* the app does. Do not use
  `prefers-reduced-motion` for this: `fx.js` turns animation off entirely under
  it, which is a different code path from the one coaches run.
- **One answer in one place.** The playback rate is one exported constant; the
  opt-out is one registry field read in one place in the runner. `--only` and
  the full run go through the same `runCheck`, so they get the same rate.
- **Reuse, do not re-derive:** `SETTLE`, `step()`, `land()` (`page-state.mjs`),
  `readToastExpr` (`sheet-drive.mjs`), `waitClosed` and the existing wait
  helpers in `dom.mjs`/`sheet-drive.mjs` before writing a new poll. Where
  several row files define their own `const wait = ms => …`, a replacement
  condition-wait goes in `dom.mjs` once.
- A sleep sized from an app timer names that timer, imported from `app/` where
  it is exported (no second copy of the number).
- `/new-guard` applies to anything that judges the tree (the registry test,
  the `--timing` test): falsify it once and say how.
- Chrome-only tests skip where there is no Chrome, as #236 does.

## Design

1. In `browserChecks`, after `Page.enable`/before the cold load:
   `Animation.enable` then `Animation.setPlaybackRate({ playbackRate: FAST })`.
   Verified during survey that it persists across navigations in the one tab.
2. `runCheck`: if `row.motion === 'real'`, set rate 1 before `row.run`, and
   put `FAST` back in a `finally`.
3. `--timing`: `runCheck` records each row's wall-clock; sleeps are counted by
   routing the rows' sleeps through one shared `wait` in `dom.mjs` that tallies
   what it waited. Printed after the table when the flag is present.
4. The rotation-undo race: reproduce at the fast rate (loop `--only` until it
   fails; it failed 3/3 at first, then passed, so be patient), capture the
   toast host's children and `#toasts`/`.bsheet-toasts` over time around the
   Sub interval Undo, then fix at the cause.
5. Sleeps: work down the `--timing` list, worst rows first, until item 4's
   target holds.

## Proof

- **The opt-out** — the `sentence and sheets` smoke row itself (item 2), plus a
  `test/smoke-registry.test.js` case that the field is only ever `'real'` or
  absent. The mutation proof (remove the field → FAIL) is reported, not kept.
- **The rate** — the full smoke run's `--timing` total (item 6); the slowest
  row, run alone, drops from ~77s.
- **Rotation-undo** — 10 consecutive `--only` PASSes at the fast rate, plus the
  reported mutation FAIL (item 3). If the fix is in `app/`, a `node --test`
  seam at that module's exports covers it test-first.
- **`--timing`** — `test/smoke-timing.test.js`, modeled on
  `test/smoke-timeout.test.js`: runs `--only <a quick rich row> --timing` and
  asserts the timing block names that row with a seconds value; runs without
  `--timing` and asserts no timing block. Skips without Chrome.
- **Nothing lost** — the full run's row list equals `main`'s (item 7): the
  runner's existing expected-rows check, plus a diff of the printed names.
- **CI** — the PR's `smoke (390×844)` job duration (item 6).

## Out of scope

- Sharding the CI job or running rows in parallel tabs. Held in reserve if item
  6 misses; the survey says it should not be needed.
- Reworking `SETTLE` itself, `land()`, or the fixtures.
- The `c.on('Page.loadEventFired', …)` listeners in `land()` that are never
  removed (a small leak noticed during the survey, not a time cost).

Decisions above were made by the agent under the human's instruction to do
whatever is best for speed; there was no grilling session.
