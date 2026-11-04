# #601 — A toast read after a page load is gone on a busy machine

Small-lane brief (test work, light review). The issue and the PR body are the
record; this lists the acceptance values and the seam that tests each.

## Issue

#601. `test/try-link-scenarios.test.js` ("a coach with a team is told the
sample was not loaded, and keeps the roster") read `coach.toast()` as `''`
once in local CI on a machine with load average about 100.

## Cause, proved

A toast with no button stays up `UNDO_MS / 2` = 4.5 s (`app/toast.js`); one
with a button, 9 s. The app raises the try-link toast during boot. `openAt`
(through `land`) then waits for the load event, `document.fonts.ready`, the
ready poll and `SETTLE` (capped at 3 s) before the scenario reads the toast.
On a starved renderer that wait outlasts the toast.

Probe (scratch script, not committed): `Coach.open()`, `onTeamScreen`, then
CDP `Emulation.setCPUThrottlingRate` before `openAt('/?try=7')`, and a
MutationObserver that stamps the toast's arrival:

| CPU slowdown | `openAt` took | toast seen to read | `toast()` |
| --- | --- | --- | --- |
| x1 | 470 ms | 94 ms | the message |
| x20 | 2136 ms | 455 ms | the message |
| x60 | 13078 ms | 2999 ms (gone at 1429) | `''` |
| x120 | 28111 ms | 8291 ms (gone at 3266) | `''` |

The observer runs at the end of the boot task, so its stamp is late by the
rest of boot; the toast's own 4.5 s timer started earlier. The toast was on
screen and timed out before `land` returned. That is the reported failure.

## Decision (the issue left it open)

Fix it in the harness, not in `app/toast.js`: what a coach sees does not
change. The issue offered two ways: read the toast as soon as it appears, or
hold the toast timer. Holding the timer would mean the harness knowing the
app's 4.5 s and 9 s numbers. So `test/coach.js` keeps a log instead: an
init script (`Page.addScriptToEvaluateOnNewDocument`, like `PRINT_SPY`)
records the message of every toast as it is added to the page. A new verb,
`coach.lastToast()`, returns the newest one this page has shown, still up or
already timed out. `coach.toast()` is unchanged: it still reads only what is
on screen now, and the `toast() === ''` checks keep meaning "nothing is up".

The message is read the same way `toast()` reads it (buttons and links
removed, whitespace collapsed), from one shared expression, not two copies.
The log is per document: a new page load starts it empty.

## What would settle it

1. **Red first.** With the try-link scenario run under a CPU slowdown that
   outlasts the toast (x60 did), the scenario fails on its toast line with
   `''`. Seam: the scenario, with a temporary throttle line, not committed.
2. **Green under the same slowdown** once the scenario reads
   `coach.lastToast()`. Same seam, same temporary line; then the line comes
   out.
3. `test/coach-last-toast.test.js` (beside `coach-download.test.js`): after
   the try-link toast is dismissed (tap `Dismiss`), `toast()` is `''` and
   `lastToast()` is "You already have a team, so the sample team wasn't
   loaded."; and after the next page load that shows no toast,
   `lastToast()` is `''`. Seam: the Coach harness in real Chrome. Red before
   `lastToast` exists by its assertion, not by a missing function: write the
   test against a stub that returns `''` first.
4. Every scenario that reads a toast's message right after a page load uses
   `lastToast()`:
   - `try-link-scenarios.test.js` (both toast reads)
   - `card-scenarios.test.js` (after `openLink`)
   - `game-day-scenarios.test.js` (after `comeBackDaysLater`)
   - `handoff-scenarios.test.js` (after `openLink` / `openLinkAgain`, all five)
   - `night-before-scenarios.test.js` (both, after `comeBackAt`)
   - `reopen-scenarios.test.js` (the Filing toast after `comeBackDaysLater`)
   Reads after a tap, not a load, stay on `toast()`.
5. `npm test` and `npm run smoke` pass; `scripts/coverage.json` is not
   lowered.

## Out of scope

- `app/toast.js` timing.
- Checks that the toast's Undo button is still on screen after a load
  (`handoff-scenarios.test.js`, "Smoke Test game updated." with Undo, 9 s).
  An Undo that has timed out cannot be tapped, so reading it from a log
  would test nothing a coach could do. Listed in the PR as a known, longer
  window.
- Negative checks `toast() === ''` after a load (`reopen-scenarios.test.js`
  "no Filing toast"): left on `toast()`, since switching them could catch an
  unrelated toast; noted in the PR.

No coach note: test harness only.
