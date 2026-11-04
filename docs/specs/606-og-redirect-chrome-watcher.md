# #606 — share-image and redirect scripts get the Chrome watcher too

Light review, with a brief instead of a full spec: tooling only, nothing a
coach sees, nothing in the four pure modules, `state.js` or `live.js`. The
batch runs light review (quality-reviewer and doc-writer only).

## Issue

#606. `scripts/og.mjs` and `scripts/redirect-check.mjs` each start Chrome with
their own copy of `launch()`, so #595's watcher does not cover them: kill
either mid-run and its Chrome and profile folder stay behind. Make both start
and close Chrome through `scripts/smoke/chrome.mjs`.

## What the survey found

- Both scripts carry a near-identical private `launch(port)`: a fixed
  `CHROME` path list, `mkdtemp(tmpdir(), 'benchcard-og-' | 'benchcard-redir-')`,
  a non-detached `spawn`, no watcher. Their `finally` does `proc.kill()` and
  one `rm` of the folder. A SIGKILL skips the `finally`, so Chrome and the
  folder survive, and `reapOrphans` never sees them (it only matches
  `benchcard-smoke-<pid>-…`).
- The shared `launch(port, headful, onSpawn)` already does everything they
  need: finds Chrome (same paths, plus PATH), takes port 0 and reads the bound
  port from `DevToolsActivePort`, starts the watcher, and returns
  `{ proc, dir, ws }`. `closeChrome(proc, dir)` kills the group, waits, removes
  the folder with retries, and lets the watcher go.
- Its Chrome flags differ from the scripts' by one: `--mute-audio`. Nothing
  either script captures plays sound, so output cannot change from it.
- Each script keeps its own small `cdp()` client. The issue is about start-up
  and clean-up only, so those stay.

## Decisions (the issue left these open)

- **Use `launch()`, not the watcher on its own.** The issue offers both; using
  `launch()` deletes both private copies, so one place owns start-up and
  clean-up, and the profile folder gets the `benchcard-smoke-<pid>-` name that
  `reapOrphans` knows, so the #510 backstop covers these scripts too.
- **Port 0** (Chrome picks a free port), replacing each script's random port in
  a fixed range. `launch()` already supports it, and two lanes on one machine
  can no longer pick the same port.
- **`finally` calls `await closeChrome(proc, dir)`** in place of `proc.kill()`
  plus `rm`.
- **"Same output as before"** is judged byte for byte. og.mjs was run twice
  before the change with `--out --bench --card --welcard --icons`: og, bench,
  card, card@2x and the four icons came out identical both times (the icons
  identical to the committed files); `welcard` and `welcard@2x` differ between
  two runs of the unchanged script, so they are compared by size and
  dimensions only and the PR says so. redirect-check is compared by its
  `--json` output.

## What would settle it

1. A test starts `node scripts/og.mjs --out <sandbox>/og.png` with TMPDIR set
   to a sandbox, waits until its Chrome has a page open on the
   `http://127.0.0.1:` origin, SIGKILLs it, and within 20s finds no process
   carrying `--user-data-dir=<its folder>` and no folder.
2. The same for `node scripts/redirect-check.mjs`.
3. og.mjs's outputs after the change are byte-identical to before (except
   welcard, as above); redirect-check's `--json` output is identical.
4. No private `launch()` or Chrome path list is left in either script.

## Proof (seams)

| Seam | Where | Items |
| --- | --- | --- |
| the real script run as a child process, SIGKILLed, judged by `ps` and the folder | `test/chrome-orphans.test.js`, `NEEDS_CHROME`, reusing its sandbox, `ps`, `waitFor` and `after` cleanup | 1, 2 |
| before/after runs compared with `cmp` and `diff` | run by hand, results in the PR | 3 |
| reading the diff | the reviewer | 4 |

The test finds the profile folder by any `benchcard-` folder in the sandbox,
not only `benchcard-smoke-`, so that before the change it finds
`benchcard-og-…`/`benchcard-redir-…`, kills the script, and fails on the
behavior (Chrome or folder still there), not on a timeout looking for the
folder.

## Surfaces

Change: `scripts/og.mjs`, `scripts/redirect-check.mjs`,
`test/chrome-orphans.test.js`, and docs that say the watcher covers only smoke.

Must not change: `app/`, `scripts/coverage.json`, `scripts/smoke/chrome.mjs`
and `chrome-watcher.mjs` (reused as they are), `scripts/webkit/`,
`scripts/look.mjs`.

## Out of scope

- Replacing either script's `cdp()` client with the shared one.

No coach note: build tooling only.
