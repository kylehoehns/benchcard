# #510 — A Chrome whose owner was SIGKILLed is reaped by the next launch

## Issue

#510. Smoke runs leave headless Chromes running when the node process that
launched them is SIGKILLed; the next `launch()` should clean those up, and
never touch a Chrome whose owner is still alive.

## Goal

No coach is in this one. A developer (or agent lane) whose smoke run, look
check or Chrome-launching test was SIGKILLed finds no Chrome left from it after
the next `launch()` anywhere on the machine, and a run that is still going is
never disturbed by someone else's launch.

## What the survey found

Checked against the tree at `0989dc9`.

- **The gap is as the issue says.** `scripts/smoke/chrome.mjs` `launch()` makes
  the profile dir with `mkdtemp(join(tmpdir(), 'benchcard-smoke-'))` and spawns
  Chrome `detached: true`, so Chrome leads its own process group. Cleanup
  (`closeChrome`) runs only from code paths in the owner's process: the timeout
  watchdog and the SIGINT/SIGTERM handlers in `scripts/smoke.mjs`, and each
  caller's `finally`/`after`. A SIGKILL of the owner runs none of them.
- **Callers of `launch()`:** `scripts/smoke.mjs`, `scripts/look.mjs`,
  `scripts/compare-shots.mjs`, `test/coach.js`, `test/coverage-chrome.test.js`,
  `test/smoke-overflow.test.js`, `test/smoke-settle.test.js`. All get the fix
  for free by it living in `launch()`.
- **Not callers:** `scripts/og.mjs` and `scripts/redirect-check.mjs` spawn their
  own Chrome with their own profile dir. Out of scope (see below).
- **Live machine, macOS:** every Chrome process of a smoke run (main and all
  helpers) carries `--user-data-dir=<dir>` on its command line, and all of them
  share the main process's group (pgid == main pid). The main's parent is the
  owner node process.
- **The issue's step 1 has a gap.** Writing the PIDs into the profile dir
  "right after spawn" leaves a window: an owner SIGKILLed between `spawn` and
  the write leaves a Chrome no file names. So this spec does not store the
  Chrome PID at all (decision 1).

## Decisions

Made by this lane (the ticket is `ready-for-agent`; the issue invites a better
method if the lane says why):

1. **The owner PID goes in the dir name, not in a file:**
   `benchcard-smoke-<ownerPid>-XXXXXX`. `mkdtemp` makes it atomically, so there
   is no moment where a dir exists without its owner.
2. **Chromes are found by command line, not by a stored PID.** One
   `ps -A -ww -o pid=,ppid=,pgid=,command=` lists processes; a process belongs
   to a dir only if its command line carries the token `--user-data-dir=<dir>`
   followed by whitespace or end of line, so `...-abc123` never matches
   `...-abc1234`, and a shell that merely mentions the path (`ls <dir>`) is
   never taken for Chrome (review finding). A PID reused by an unrelated process cannot be killed: its
   command line does not name the dir.
3. **"Owner alive" is judged by parentage, not just `kill(pid, 0)`.** While
   the owner lives, the Chrome main process's parent PID **is** the owner
   (node spawned it directly), or an ancestor when a launcher forks instead of
   exec'ing. The moment the owner dies, Chrome is reparented (to 1, or a
   subreaper on Linux) and the chain breaks. So a dir is **live** if walking
   the ppid chain from any of its processes reaches `ownerPid`, and is left
   entirely alone. This also handles an owner PID that has since been reused by
   an unrelated live process: the Chrome's parent is no longer that PID, so it
   is reaped. A dir with no processes at all is removed only when
   `kill(ownerPid, 0)` says the owner is gone (ESRCH; EPERM counts as alive).
4. **Reaping is SIGKILL to the process group,** for each distinct pgid among
   the dir's processes (never pgid ≤ 1 and never this process's own group).
   No per-PID kill: a PID from the snapshot can be reused before the kill; a
   pgid cannot while a member lives. Nobody is left to shut down gracefully. Then
   wait (bounded, about 2s) for those processes to go, and `rm -rf` the dir.
5. **The sweep never fails a launch.** Any error (no `ps`, unparsable output,
   EPERM) is swallowed; `launch()` goes on exactly as before.
6. **Scope of the scan:** only dirs under the same `tmpdir()` that `launch()`
   uses. Old-format dirs (`benchcard-smoke-XXXXXX`, no owner PID) are not
   touched: nothing says whose they are.

## What would settle it

1. A test spawns a real `scripts/smoke.mjs` run in a sandbox TMPDIR and
   SIGKILLs it **mid-boot** (the moment a process naming its profile dir
   appears). Before the next launch, that Chrome is shown still running (the
   bug reproduced, so the test is not vacuous). After the next `launch()` in
   the same TMPDIR: no process names that dir, and the dir is gone.
2. The same, SIGKILLed **mid-page** (the run's DevTools `/json/list` shows a
   page on the app's `http://127.0.0.1:` origin; `BENCHCARD_SMOKE_HANG` can hold
   it there).
3. A Chrome whose owner is alive (a smoke run still going) is left alone by a
   `launch()` in the same TMPDIR: its processes still run and its dir still
   exists afterwards. The test then ends that run itself.
4. A process whose command line does **not** name a dead-owner dir exactly
   (e.g. names the dir path plus one extra character), and a process whose PID
   is whatever but names nothing, survive the sweep. A stand-in process
   (`node -e` with an argv naming the dir) is enough here; no Chrome needed.
5. Owner PID reused: a dir named for a PID that is alive but is **not** the
   parent of the dir's process is reaped (stand-in processes are enough).
6. `/new-guard`: break the sweep on purpose (e.g. make it skip every dir, or
   make the live-owner check always say "dead") and show the matching test go
   red; restore; green.
7. Works on macOS (dev) and Linux (CI `ubuntu-24.04`): the tests run in the
   `node 24` and `smoke` jobs there. Real-Chrome cases use `NEEDS_CHROME`.

## Surfaces

- Changes: `scripts/smoke/chrome.mjs` (dir name, the sweep, called at the start
  of `launch()`), a new `test/chrome-orphans.test.js`, possibly
  `test/helpers/smoke-cli.mjs` (only if a helper is genuinely shared).
- Must not change: `app/**` (no coach-facing change), `app/engine.js`
  (another lane), `closeChrome`'s behavior, the `detached: true` spawn,
  `scripts/og.mjs`, `scripts/redirect-check.mjs`.

## Constraints

- Keep `detached: true`; `closeChrome` relies on the group.
- Existing tests that look for `benchcard-smoke-*` by prefix
  (`assertNoSmokeProfileLeft`, `assertNeverLaunchedChrome`) must keep working
  with the new dir name.
- No dependencies (`test/no-dependencies.test.js`); `node:` built-ins and `ps`.
- Tests that launch Chrome must use a sandbox TMPDIR, so the sweep under test
  never sees another lane's Chromes, and must only ever kill processes the test
  itself spawned. Every spawned process gets cleaned up in `after`/`finally`.
  Every wait has its own timeout.
- A test's failure message names what broke (`/new-guard`, two smells).

## Design

In `scripts/smoke/chrome.mjs`:

- `launch()`: `await reapOrphans(tmpdir())` (swallowing errors), then
  `mkdtemp(join(tmpdir(), \`benchcard-smoke-${process.pid}-\`))`, then spawn as
  today.
- `reapOrphans(root)` (exported for the tests): list `root` for names matching
  `^benchcard-smoke-(\d+)-[A-Za-z0-9]+$`; one `ps` call; for each dir, collect
  processes naming it exactly; apply decisions 3 and 4; return what it reaped
  (for tests and debugging), e.g. `{ reaped: [dir...], kept: [dir...] }`.
- Short comment citing #510 and why parentage (decision 3) rather than a PID
  file.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Real smoke run SIGKILLed, then `launch()` in-process with `process.env.TMPDIR` = sandbox | `test/chrome-orphans.test.js`, `node --test`, `NEEDS_CHROME` | 1, 2, 3, 7 |
| `reapOrphans(sandbox)` against stand-in `node -e` processes (one orphaned via an intermediate owner that is SIGKILLed) | same file, no Chrome | 4, 5, 7 |
| Mutation arms run by hand, recorded in the PR | `/new-guard` | 6 |

This test file judges harness code by running it, under `/new-guard`.

## Out of scope

- `scripts/og.mjs` and `scripts/redirect-check.mjs` Chromes (own spawn, own
  dirs). A follow-up can route them through `launch()`.
- Old-format `benchcard-smoke-XXXXXX` leftovers.
- The `test/smoke-settle.test.js` TIMERS_QUIET load-time flake.
