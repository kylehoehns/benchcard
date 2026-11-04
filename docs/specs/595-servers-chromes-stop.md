# #595 — local servers and test Chromes stop on their own

Light review, with a brief instead of a full spec: tooling only, nothing a
coach sees, and nothing in the four pure modules, `state.js` or `live.js`.
The batch runs light review (quality-reviewer and doc-writer only).

## Issue

#595. Build lanes leave Chrome windows and `node scripts/serve.mjs` servers
running after they finish, and lanes may not kill what they did not start. So
make both stop by themselves, and stop asking lanes to look for orphans.

## What the survey found

- **The issue's `scripts/chrome.mjs` is `scripts/smoke/chrome.mjs`.** Its
  `launch()` starts Chrome for smoke, `look.mjs`, `compare-shots.mjs`,
  `test/coach.js` and four `node --test` files. It spawns Chrome `detached`
  (its own process group, so `closeChrome` can kill every helper), which is
  also why Chrome outlives a SIGKILLed owner: nothing ties the two together.
  #510's `reapOrphans` only cleans up at the *next* `launch()`, and only in
  the same TMPDIR.
- `scripts/og.mjs` and `scripts/redirect-check.mjs` each carry their own
  `launch()`. The issue names only `chrome.mjs`, so they are out of scope.
- `serve.mjs` run directly reads one positional port (`node scripts/serve.mjs
  8313`); imported, `serve()` runs inside the caller and dies with it.
- `process.ppid` in Node is live: after the parent dies it reads the new
  parent (1 on macOS). Checked: a child read `2601` at start, `1` after its
  parent shell exited.
- `AGENTS.md` does not say "look for orphans", but it says "A run killed with
  SIGKILL leaves its Chrome until the next `launch()` reaps it (#510)", which
  this change makes false. `scripts/lanes/lane-template.txt` says "Report
  suspected orphan Chromes instead."

## Decisions (the issue left these open)

- **"The process that started it" is the parent at start-up** (`process.ppid`
  read once). The server polls it about every 500ms and exits when it
  changes. Under `npm run serve` that is npm. A server started with `&` from a
  shell that then exits stops at once; run it in the foreground or as a
  background job instead. That is what the issue asks for.
- **`--ttl` takes minutes, fractions allowed** (`--ttl 0.02` is 1.2s), so a
  test does not wait a minute. Default 60. A missing, zero, negative or
  non-number value is refused with a message and exit 2, before listening. The
  port stays the one positional argument, in either order with `--ttl`. The
  limits apply only when run directly; `serve()` imported is unchanged.
- **Chrome is tied to its owner by a small watcher process**, because Node has
  no way to ask the OS to kill a child when the parent dies (Linux's
  `PR_SET_PDEATHSIG` is not reachable from Node; macOS has none). `launch()`
  spawns it right after Chrome, with a pipe on its stdin. The owner never
  writes to it; when the owner exits for any reason (normal exit, crash,
  SIGKILL) the OS closes the pipe and the watcher reads end-of-file. It then
  kills Chrome's process group if it is still alive (SIGTERM, then SIGKILL),
  waits for it to be gone, and removes the profile folder with retries, the
  way `closeChrome` does. It runs in its own process group, so Ctrl-C on the
  owner's terminal does not kill it before it can clean up. `closeChrome`
  ends the watcher's stdin after its own cleanup, so a long run does not pile
  up watchers. The owner `unref`s it, so it never keeps a test process alive.
- **`reapOrphans` stays** as the backstop for a watcher that was itself
  killed (say by `killall node`). Its real-Chrome tests now kill the watcher
  too, to get the orphan they start from.

## What would settle it

1. A test starts `node scripts/serve.mjs <port>` under an intermediate parent
   process, SIGKILLs the parent, and finds the port refusing connections
   within 5 seconds.
2. A test starts `node scripts/serve.mjs <port> --ttl 0.02` and finds the
   process exited (and the port refusing) within 5 seconds; a server whose
   parent is alive and TTL not reached is still answering after 2 seconds.
3. A bad `--ttl` (`abc`, `0`, `-1`, missing value) exits 2 with a message
   naming `--ttl`, and never listens.
4. A test kills a real `scripts/smoke.mjs` run partway through (SIGKILL,
   mid-boot and mid-page) and, with no further `launch()`, finds no process
   carrying `--user-data-dir=<its profile folder>` and no profile folder left
   within 20 seconds.
5. With the watcher also SIGKILLed, Chrome survives the owner (the
   precondition), and the next `launch()` still reaps it (#510 kept).
6. A smoke run still going is not disturbed by another `launch()` (kept).
7. After a normal `launch()` + `closeChrome()`, no watcher process for that
   folder is left within 5 seconds.
8. `lane-template.txt` no longer asks lanes to report orphan Chromes; the
   "never kill a process you did not start" rule stays. `AGENTS.md`'s
   sentence about SIGKILL says the watcher closes Chrome.

## Proof (seams)

| Seam | Where | Items |
| --- | --- | --- |
| `serve.mjs` run as a real child process, judged by connecting to its port | new `test/serve-lifetime.test.js`, `node --test`, no Chrome | 1, 2, 3 |
| real `scripts/smoke.mjs` runs SIGKILLed; real `launch()`/`closeChrome()` | `test/chrome-orphans.test.js`, `NEEDS_CHROME` | 4, 5, 6, 7 |
| prose | read by the reviewer; no test reads the template | 8 |

Every probe and test has its own timeout, and every process a test spawns is
killed in `after`, by pid or by its own sandbox path only.

## Surfaces

Change: `scripts/serve.mjs`, `scripts/smoke/chrome.mjs`, a new watcher module
beside it, `test/chrome-orphans.test.js`, a new `test/serve-lifetime.test.js`,
`scripts/lanes/lane-template.txt`, `AGENTS.md`, and the docs that describe
`serve.mjs` or the smoke cleanup.

Must not change: `app/`, `scripts/coverage.json` (never lowered), the smoke
registry, `og.mjs`, `redirect-check.mjs`.

## Out of scope

- `og.mjs` and `redirect-check.mjs`'s own Chrome launchers.
- Killing anything that is already running from before this change.

No coach note: tooling only.
