# #616 — The settle test's first page load stalls on a busy Mac

Small-lane brief (test work, light review). The issue and the PR body are the
record; this lists what was found, the acceptance values and the seam that
tests each.

## Issue

#616. `test/smoke-settle.test.js` failed all six tests in three lanes on
2026-11-04 with `loadPage: Page.loadEventFired did not arrive within 45000ms
for http://127.0.0.1:<port>/warm`, and passed alone and on a rerun.

## What the survey found

- All six failures are one failure: the warm-up load in `before()` (the
  45 s throwaway page #516 added). When a `before` hook throws, `node --test`
  marks every test in the file failed. The local CI log of the #601 lane
  (`smoke-suite.log`) shows the same `/warm` URL on all six.
- The file does not start a Chrome per test (one per file, like every other
  Chrome test file) and the CI slot pool is not the issue: the slot pool
  limits whole runs, and every `node --test` file runs inside one.
- **CPU throttling does not reproduce it.** `Emulation.setCPUThrottlingRate`
  at x20 / x60 / x120 slowed the warm load to 116 / 640 / 1618 ms. The
  renderer is not the slow part.
- **Many fresh Chromes at once does.** A scratch probe (the `before()`
  sequence, timed) looped 106 times beside ci-local's first wave (the suite
  shard and smoke shard 1/3): 2 hit the exact 45 s failure, and others took
  37, 42 and 44.8 s. The rest took under 0.6 s.
- **Where the time goes.** The probe's timeline: `Page.frameStartedLoading`
  at once, then nothing until the test server sees `GET /warm` 44.7 s later;
  the page then loads in 70 ms. Chrome's net log of a 23 s case shows the URL
  request waiting on `COOKIE_PERSISTENT_STORE_LOAD`, which began 230 ms after
  launch and ended at 24.2 s. On macOS Chrome reads its cookie-encryption key
  from the login Keychain the first time it loads the cookie store, and that
  read is shared by every Chrome on the machine. Under lane load (load average
  50–95) it queues for tens of seconds.
- **The fix, A/B, same load, 12 runs each, side by side:** launch()'s flags
  as they are: 85–527 ms for 8 runs, then 28.0, 39.8, 43.1 and 50.0 s.
  The same flags plus `--use-mock-keychain`: all 12 between 127 and 570 ms.

## Decision

Pass `--use-mock-keychain` in `launch()` (`scripts/smoke/chrome.mjs`). It is
the flag Chrome provides for automation on macOS: the throwaway profile gets a
stand-in key instead of the real Keychain. Nothing the harness does reads the
saved cookies' encryption, so callers see no other change. It is ignored on
Linux (GitHub CI).

The 45 s warm-up limit and the 10 s per-page limit stay as they are. The fix
removes the wait instead of making room for it.

This is in `launch()`, not in the settle test, because the stall is in every
fresh Chrome's first load: the settle test is just the only file with a hard
limit on it. Coach scenario files pay it inside their first test's timeout
(a 46 s and a 49.7 s first test in a scratch run of two `npm test`s side by
side).

## What would settle it

1. **Red first.** `test/chrome-launch.test.js`: a Chrome started by
   `launch()` carries `--use-mock-keychain` on its command line (read with
   `ps` from the running process). Fails before the flag is added, by its
   assertion. Seam: `launch()` under `node --test`, in real Chrome
   (NEEDS_CHROME); a guard, under `/new-guard`.
2. **The file passes under the slow-down that made it fail.** The scratch
   A/B above, rerun with the change: no first load over 10 s with the flag
   among runs where the unflagged arm stalls. Seam: the scratch probe (not
   committed), numbers in the PR.
3. `npm test` and `npm run smoke` pass; local CI GREEN with no rerun for this
   file. `scripts/coverage.json` is not lowered.

## Out of scope

- Raising the 45 s or 10 s limits.
- `test/chrome-orphans.test.js` "no watcher ... within 5s" failed once in the
  same scratch run under load; a separate issue if it recurs.

No coach note: test harness only.
