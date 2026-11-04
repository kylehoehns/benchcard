# #558 — smoke-timeout's hung-check test fails when the machine is busy

Light review, with a brief instead of a full spec. The first fix fit the
small lane. The cleanup fix (finding 3) took the change to about 40 lines
outside `test/` and `docs/`, past the small lane's 20. This batch's lane runs
light review anyway (quality-reviewer and doc-writer only), and nothing here
touches the four pure modules, `state.js` or `live.js`.

## Issue

#558. `test/smoke-timeout.test.js` "a hung check ends the run" fails now and
then when other smoke runs share the machine. Find the slow step, fix the
cause, keep what the test proves.

## What the survey found

Measured with a traced copy of `scripts/smoke.mjs` (timestamps at Chrome
spawn, `launch()` resolving, the cold load, the hung row, the watchdog and
the cleanup), the hung-check run repeated beside two full `scripts/smoke.mjs`
loops, 12 runs, load average 70 to 148 on a 10-core Mac:

| Step | Idle | Under load (worst seen) |
| --- | --- | --- |
| Chrome boot (spawn to DevTools page) | 1.2s | 8.6s |
| cold load + the row's `reset` | 0.6s | 21.3s |
| everything before the hang starts | 1.9s | over 30s (2 of 12 runs) |
| cleanup (watchdog fires to Chrome closed) | 0.1s | 2.5s |

Two facts settle the cause:

1. **The watchdog counts from the start of the process, not from the hang.**
   The 30-second `--timeout 0.5` has to cover Chrome's boot, the cold load and
   the `reset` *before* the hang even starts. Under load those took more than
   30s (runs 6 and 11 of the survey, and the #559 failure in the issue's comment): the
   watchdog fired during "cold load" and the test's regex, which expects
   "rich fixture is live", failed. Cleanup never ran long (2.5s worst).
2. **The test's own 45-second limit does nothing.** The test is synchronous
   (`execFileSync`), and `node:test` cannot time out a synchronous test: a
   probe with `{ timeout: 200 }` around a 1-second `execFileSync` passed. So
   the comment's math (which also did not add up: 45 + 30 > 45) described a
   limit that was never enforced.
3. **Cleanup has its own race, which the first fix uncovered.** With only the
   watchdog fix, the 20-run proof passed 14 of 20. All six failures were
   "Chrome's --user-data-dir was left behind". `closeChrome` waited only for
   Chrome's main process, then removed the profile once and ignored any
   error. Chrome's helper processes can still be writing into the profile for
   a moment after the main exits, so the remove failed. The old 30-second
   wait hid this, because by then Chrome was idle. A 0.6-second hang shuts
   Chrome down while it is still busy after the page load. `reapOrphans`
   (#514) had already learned the same lesson for the next run's sweep.

## Decisions (the issue left these open)

- **Fix the cause, not the number.** Raising `--timeout` would only move the
  race, and every run of the test waits the whole timeout. Instead, when
  `BENCHCARD_SMOKE_HANG` is set, smoke arms its watchdog when the hang starts,
  not at process start. The variable exists only for these tests, so a normal
  run is unchanged: its watchdog still starts before `serve()`.
- **The hang test now waits 0.01 min (0.6s), not 0.5.** With the watchdog
  armed at the hang, the length of the wait proves nothing more at 30s than at
  0.6s, and the short value is what makes the red deterministic on the old
  code (its watchdog fires while Chrome is still booting). The test drops
  from about 32s to about 3s idle.
- **The test's limit becomes real.** `run()` in `test/helpers/smoke-cli.mjs`
  takes an optional limit, passed to `execFileSync`'s `timeout`, which sends
  SIGTERM; smoke's SIGTERM handler closes Chrome. Sized from the steps:
  Chrome boot cap 45s (`chrome.mjs`) + cold load and `reset` 60s (about 3x
  the 21s worst seen) + the 0.6s watchdog + 11s cleanup (`closeChrome`'s 5s
  SIGTERM grace, up to 5s for the helpers, about 1s of remove retries) =
  about 117s, so 120s.
- **Cleanup waits for the whole Chrome, then retries the remove.**
  `closeChrome` waits (up to 5s) until every process in Chrome's group is
  gone, SIGKILLs any left, then removes the profile with retries, the way
  `reapOrphans` does. This is the issue's "if smoke's cleanup itself can
  hang, fix that instead" case, and it helps every smoke run, not just the
  test.
- **What still proves the watchdog starts before `serve()`:** the second test
  in the file (`--timeout 0.001`, no hang variable) fires while Chrome is
  still booting. It is unchanged.

## What would settle it (the issue's Done-when)

- The hung-check test passes 20 runs in a row while two `scripts/smoke.mjs`
  runs go at the same time on the same machine; command and output in the PR.
- The comment's numbers add up.
- Still asserted: exit 1, `timed out after 0.01 min while running "rich
  fixture is live"`, and no `benchcard-smoke-*` profile left.

## Seams

- `test/smoke-timeout.test.js` under `node --test`, spawning the real
  `scripts/smoke.mjs`. Red first: with the old watchdog, `--timeout 0.01`
  fires during "launching Chrome", so the regex naming the hung row fails.
- `closeChrome` under `node --test`, against a stand-in Chrome whose helper
  ignores SIGTERM and keeps writing into the profile. Red first: the old
  single remove leaves the directory.
- The 20-runs-under-load proof, beside two `scripts/smoke.mjs` loops.

## Out of scope

- Other `execFileSync` tests with an inert `node:test` timeout
  (`smoke-timing.test.js`, the boot-window test here). They have not flaked.

No coach note: test and harness only.
