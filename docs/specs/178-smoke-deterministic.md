# #178 — Smoke gives the same answer at any hour and stops if it hangs

## Issue

#178. The smoke suite should give the same answer at any hour of the day,
and should end on its own, with a failure, if it hangs.

## Goal

A red smoke run means the app or a check is wrong, never that CI happened
to run across midnight. A run that hangs ends by itself, says which check
it was on, and leaves no Chrome behind.

## What the survey found

Checked against the tree at `4ed4d19`.

- **The midnight failure is real, and the mechanism is confirmed.** On #139,
  commit `0910715` fixed a check that went red "on CI, run just past midnight
  UTC". The cause: `RICH`'s day (`scripts/smoke/fixtures.mjs`) has no `date`,
  so `sanitizeTeam` (`app/storage.js:528`, `:540`) stamps it with the page's
  today when the fixture loads. If midnight passes before the check finishes,
  closing bench mode calls `fileOverdueDay()` (`app/app.js:403`, `:420`), the
  day is now in the past, and it files itself. The day the check was measuring
  is replaced. Reproduced with a scratch script (not committed): page clock
  started at 23:59:50 local, `goRich`, wait 15s, open and close bench mode.
  Storage went from `["2026-09-12:2"]` (two games) to `["2026-09-13:1"]` (a
  fresh day, one game). The same script started at 12:00:00 left the day
  alone.
- **The host clock is read on the Node side too, not only in the page.**
  `scripts/smoke/three-days.mjs:23-36` (`addDays`, `weekday`) and
  `scripts/smoke/card-at-32.mjs:108-112, 177` (`nextWednesday`, `MULTI_WD`)
  compute dates from `new Date()` in Node at import time. The page computes
  its own today later. If midnight falls between the two, they disagree. These
  must use the same pinned day as the page.
- **#193 does not cover this.** It fixed three `moveGame` unit tests in
  `test/day-list.test.js` (`node --test`). It touched nothing under
  `scripts/smoke/`.
- **The hang guard today is only in prose.** No CI step or script wraps smoke
  in a time limit. `.github/workflows/test.yml`'s smoke job runs
  `node scripts/smoke.mjs --no-tests` with no `timeout-minutes`, so GitHub's
  default of 360 minutes applies. The `perl -e 'alarm …'` wrapper appears only
  in old specs (`docs/specs/136-*`, `141-*`, `142-*`, `145-*`, `148-*`), and
  with 900 seconds, not the 1800 the issue says.
- **The perl wrapper leaves Chrome behind.** It kills `node`, and nothing
  kills the Chrome that `node` spawned. This machine had two headless smoke
  Chromes running with parent PID 1 at survey time, 25 and 42 hours old
  (`--remote-debugging-port=9333` and `9542`, both `benchcard-smoke-*`
  profiles). They were not started by this survey and were left alone.
- **The smoke run is getting long fast.** CI smoke job wall time: about 2 min
  on 2026-09-15, 4.5 min on 09-17, 8 min on 09-19, 9 min on 09-23, 12 min on
  09-26, 18 min on 09-28. A 30-minute limit is under 2× today's run. See
  Decisions.

## Decisions

These were open after the survey. Settled as follows; the spec below is
written with these decisions in place.

1. **The clock ticks from a pinned start. It is not stopped.** The issue says
   "freeze". A clock that never moves breaks things: `SETTLE`
   (`scripts/smoke/dom.mjs:71`) and `first-run-flow.mjs:453` stop polling on a
   `Date.now()` deadline that would never arrive, and `app/trap.js:458-467`
   compares `lastPointerAt > lastKeyAt`, which is always false once both are
   the same frozen number. So the page's clock starts at the pinned moment on
   every page load and moves forward at real speed from there.
2. **What "a check runs with the clock set to 23:59:30 UTC and passes" means.**
   With a ticking clock, a check that *starts the page* at 23:59:30 would cross
   midnight 30 seconds later, which is the bug itself. So the 23:59:30 is the
   **host's** real clock, the way CI's was on #139. The proof: the page and the
   Node-side fixtures read the pinned day no matter what the host clock says,
   including when the host clock crosses midnight mid-run. See Proof.
3. **Default limit: 60 minutes, not 30.** Today's CI smoke run is 18 minutes
   and has grown 9× in two weeks. At 30 the limit would start failing healthy
   runs soon. 60 is still far below GitHub's 360 and still catches a hang.
   (If the human prefers the issue's 30, change the one constant.)
4. **Ctrl-C and `kill` also close Chrome.** On `SIGINT` and `SIGTERM` the
   harness closes Chrome the same way the time limit does, then exits. This is
   what left the two orphaned Chromes above. It is a few lines in the same
   place as the time limit.

## What would settle it

1. **The page reads the pinned day.** The pinned moment is
   **2026-09-12 12:00:00 local time** (a Saturday, after `RICH`'s last season
   game on 2026-08-01, and a date in the past, so a missing clock script can
   never pass by luck). In a full smoke run and under
   `--only "rich fixture is live"`, the `rich fixture is live` row checks, in
   the real browser, that `new Date()` in the page falls on `2026-09-12` and
   that the saved `benchcard.v7` record's day `date` is `"2026-09-12"`. With
   the clock script not registered, the row fails and names the date it saw.
2. **The host clock does not matter.** A `node --test` test runs the clock
   script in a `vm` sandbox whose real `Date` reads `2026-09-27T23:59:30Z` and
   then advances 60 seconds (past midnight UTC). Inside the sandbox:
   `new Date()` and `Date.now()` read 2026-09-12 12:00:00 local plus the
   elapsed time, the date stays 2026-09-12 across the host's midnight, and
   `new Date(2024, 0, 6)`, `new Date('2026-07-11')`, `Date.UTC(...)` and
   `Date.parse(...)` behave exactly as the real `Date` does.
3. **Node-side dates use the same pin.** `three-days.mjs` and `card-at-32.mjs`
   take today from the shared pinned value, not `new Date()`. Under the pin,
   `card-at-32.mjs`'s `FIT_DATE` is `2026-09-16` (the next Wednesday), and
   `three-days.mjs`'s three days are `2026-09-14`, `2026-09-16` and
   `2026-09-19`. `--only "card is 3.45 × 5in"` and `--only "three days: …"`
   (the full name from the registry) both pass.
4. **A hang ends the run.** With `BENCHCARD_SMOKE_HANG="rich fixture is live"`
   set in the environment, `node scripts/smoke.mjs --only "rich fixture is
   live" --timeout 0.5` exits with code 1 within 45 seconds, and its stderr
   includes the line
   `smoke: timed out after 0.5 min while running "rich fixture is live"`.
   After it exits, no process whose command line contains its Chrome profile
   directory is still running (`pgrep -f <profile dir>` finds nothing).
5. **The flag is checked before anything starts.** `--timeout` with a missing,
   zero, negative or non-numeric value exits 1 with a message, before `serve()`
   and before Chrome launches (the same tripwire `test/smoke-only.test.js`
   uses: a sandboxed `TMPDIR` that stays empty).
6. **Nothing else moves.** A full `npm run smoke -- --no-tests` prints the same
   rows, in the same order, as `main`, all green, with the same budget numbers.

## Surfaces

Changes:

- `scripts/smoke/clock.mjs` (new): the pinned moment, the page script that
  installs the clock, and the pinned "today" for Node-side code.
- `scripts/smoke/registry.mjs`: re-exports the clock script, the way it
  already re-exports `FONT_INJECTION_SCRIPT`.
- `scripts/smoke.mjs`: registers the clock script before the first
  navigation; `--timeout`; the watchdog; the signal handlers; tracking which
  check is running; the `BENCHCARD_SMOKE_HANG` hook.
- `scripts/smoke/chrome.mjs`: only if closing Chrome reliably needs it (for
  example, killing the whole process group).
- `scripts/smoke/three-days.mjs`, `scripts/smoke/card-at-32.mjs`: take today
  from `clock.mjs`.
- `scripts/smoke/rich-fixture.mjs`: the pinned-day assertion (item 1).
- `test/smoke-clock.test.js` (new), `test/smoke-timeout.test.js` (new), or
  cases added to `test/smoke-only.test.js` for item 5.
- `AGENTS.md` § Layout: one or two sentences. The page clock is pinned (to
  what, and why), and `--timeout` exists with its default. Replaces the need
  for any `perl -e 'alarm …'` wrapper.

Must not change: anything under `app/`. No precache bump is needed. The old
specs that mention the perl wrapper stay as they are (specs are a record of
their time).

**Overlap with in-flight work.** The eight sibling fixes (#187–#191,
#195–#198) edit `app/app.css` and `CLIP_SWEEP_KNOWN_ISSUES` in
`scripts/smoke/clip-sweep.mjs`. This change touches neither. The one shared
file risk is `AGENTS.md` if a sibling edits § Layout too; rebase normally.

## Constraints

- **`smoke.mjs` imports only five `./smoke/` modules**
  (`test/smoke-registry.test.js`). The clock script reaches `smoke.mjs`
  through `registry.mjs`'s re-export, exactly as `FONT_INJECTION_SCRIPT` does
  (`registry.mjs:131`). Do not add a sixth import.
- **No file under `scripts/smoke*` may pass the size limit**
  (`test/smoke-size.test.js`). `smoke.mjs` is 21.8 KB and `registry.mjs` is
  33.4 KB today; keep the new code in `clock.mjs` and small.
- **Reuse, do not re-derive:** `seasonDate` from `app/storage.js` for turning
  the pinned `Date` into `YYYY-MM-DD` (both Node files already import it);
  `smoke-font.mjs`'s shape for a pure script builder plus a `vm` test
  (`test/smoke-font.test.js`); `smoke-only.test.js`'s sandboxed-`TMPDIR`
  tripwire for "never launched Chrome".
- **Dated checks keep their own dates.** `dated-day.mjs` uses fixed dates
  (2024-01-06 in the past, 2099-12-31 in the future) on purpose; leave them.
- **The payload budget must not move.** The clock script adds no request and
  no DOM node (it replaces `globalThis.Date`, nothing else).
- **`--only` keeps its contract.** Validate `--timeout` before `serve()`, as
  `--only` is. `--only` still implies `--no-tests`.
- `/new-guard` applies to the new smoke assertion and to both new tests: each
  must be seen failing against a broken tree (script not registered; watchdog
  removed) before it counts.
- American spelling; no trailers on commits.

## Design

**The clock.** `clock.mjs` exports:

- `SMOKE_CLOCK = { y: 2026, m: 9, d: 12, h: 12 }` (one place for the pin).
- `smokeToday()`: a Node `Date` for that moment in local time. Node-side
  fixtures call this instead of `new Date()`.
- `buildClockScript(pin)`: a pure function that returns the page script. The
  script, run first on every new document, saves the real `Date`, records the
  real `Date.now()` at that instant as the anchor, and replaces
  `globalThis.Date` with a subclass where `new Date()` with no arguments and
  `Date.now()` return `pinStart + (realNow - anchor)`. `pinStart` is built
  from local parts in the page (`new RealDate(y, m - 1, d, h)`), so it is
  noon in whatever time zone Chrome runs in, and Chrome and Node share the
  machine's zone. Every other constructor form, `Date.UTC`, `Date.parse` and
  the prototype pass through untouched. `Date.name` and `instanceof` still
  work, since it is a subclass.
- `CLOCK_SCRIPT = buildClockScript(SMOKE_CLOCK)`.

`smoke.mjs` registers `CLOCK_SCRIPT` with
`Page.addScriptToEvaluateOnNewDocument` next to the font script, before the
first `Page.navigate`. It stays registered for the whole session, so every
reload, `goRich`, `reloadWithRecord` and the static pages all get it.

Why per page load and not one run-wide offset: a run-wide offset computed in
Node would mix Node's clock with Chrome's. Per page load, the page only ever
compares its own clock to itself. Nothing in `app/` stores a timestamp that
outlives a page load (the only `Date.now()` uses are `app/trap.js:458-459`),
so restarting at noon on each load is safe.

**The time limit.** `--timeout <minutes>` (decimals allowed, default 60).
`smoke.mjs` keeps a `current` label: `"launching Chrome"`, `"cold load"`,
`"cold checks"`, `"card at 32px"`, `"rich fixture"`, then each row's name as
`runCheck` starts it. A `setTimeout` for the limit, started before `serve()`,
on firing:

1. prints `smoke: timed out after <N> min while running "<current>"` to
   stderr,
2. closes the CDP socket, kills Chrome (SIGTERM, then SIGKILL if it has not
   exited within 5 seconds) and removes its profile directory,
3. closes the server and exits with code 1.

`SIGINT` and `SIGTERM` run the same cleanup (steps 2 and 3) and exit with
code 130 and 143. The normal path clears the timer.

To close Chrome and all its helper processes, the developer confirms by test
(item 4) whether killing the browser process is enough on macOS and Linux. If
not, spawn Chrome `detached` and kill its process group.

**The hang hook.** If `BENCHCARD_SMOKE_HANG` equals a row's name, `runCheck`
runs that row as a CDP `Runtime.evaluate` of `new Promise(() => {})` with
`awaitPromise: true` instead of its own `run`. That is a real hang: Chrome is
alive, and the call never returns. It is for the test only and is documented
in the `smoke.mjs` header next to the flags.

**Node-side dates.** `three-days.mjs`'s `addDays` and `weekday`, and
`card-at-32.mjs`'s `nextWednesday`, start from `smokeToday()`. Their comments
change from "the day this actually runs on" to "the pinned smoke day".

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `buildClockScript` in a `vm` sandbox with a fake real `Date` (starts `2026-09-27T23:59:30Z`, advanced 60s) | `node --test test/smoke-clock.test.js` | 2 |
| `smokeToday()` plus the two Node-side date helpers give the dates in item 3 | same test file (export the helpers or their inputs as needed) | 3 |
| `rich fixture is live` asserts the page's pinned day and the saved day `date` | smoke row, `--only "rich fixture is live"` | 1 |
| `--only "card is 3.45 × 5in"` and `--only` the three-days row pass | smoke `--only` | 3 |
| Spawn `smoke.mjs --only "rich fixture is live" --timeout 0.5` with `BENCHCARD_SMOKE_HANG` and a sandboxed `TMPDIR`; assert exit 1, the stderr line, and `pgrep -f <sandbox>` empty after exit | `node --test test/smoke-timeout.test.js` (launches Chrome; about 35s) | 4 |
| `--timeout` bad values exit 1 before Chrome | `node --test` (in `test/smoke-only.test.js` or the timeout test) | 5 |
| The full proof pair | `npm test`, `npm run smoke -- --no-tests` | 6 |

The timeout test is the first `node --test` file that launches Chrome.
`test/smoke-only.test.js` says tests needing a browser are out of scope for
`node --test`. The CI `test` job runs on `ubuntu-latest`, which has Chrome,
so it works there. If the human would rather keep Chrome out of `node --test`,
the fallback is to prove item 4 by hand once and paste the output in the PR's
Evidence. Recommended: keep it as a test, since a watchdog that nobody tests
is the kind of guard `AGENTS.md` § Guards warns about.

## Out of scope

- Making the smoke run shorter. It is 18 minutes in CI and growing fast; that
  deserves its own issue.
- A time limit per check (rather than per run).
- Pinning Chrome's time zone. The page and Node already share the machine's
  zone, and pinning noon keeps every zone far from midnight.
- `scripts/compare-shots.mjs`, which opens pages too but is not smoke.
- Adding `timeout-minutes` to the CI workflow. The harness's own limit covers
  it.
- A side finding for a new issue: `AGENTS.md` § Layout says no smoke file may
  pass 40,000 bytes, and `test/smoke-size.test.js`'s test name says 40,000,
  but its `LIMIT` is 55,000. That is two answers to one question.
