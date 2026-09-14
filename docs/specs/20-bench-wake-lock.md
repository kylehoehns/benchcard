# 20 — Keep the screen on in bench mode

## Issue

#20 (parent #18): while bench mode is open, hold a screen wake lock so the
phone does not lock during a timeout; where the browser cannot, change nothing.

## Goal

A coach opens bench mode, sets the phone on the bench, and it is still awake at
the next horn. They close bench mode and the phone goes back to locking on its
own schedule. On a phone or browser without wake lock, bench mode is exactly
what it is today, with nothing on screen to say so.

## What would settle it

The ticket's acceptance criteria, with the values the survey pinned.

1. **Request on open.** `openGameMode` (`app/gamemode.js`) calls
   `navigator.wakeLock.request('screen')` exactly once per open, when
   `navigator.wakeLock` exists and the open actually shows bench mode (not on
   the early `return` when there is no ok plan).
2. **Release on close.** `closeGameMode` releases the sentinel the request
   returned. Every way out goes through `closeGameMode` today — the X
   (`#gmClose`), Done (`#gmDone`), Escape through `trap.js`, and the
   `renderGameMode` bail-out when the plan stops being ok — so all of them
   release. After close, no sentinel is held (`released === true` on the one
   that was granted).
3. **A late grant is not kept.** If the request resolves after bench mode has
   already closed, the sentinel is released at once rather than held.
4. **Back from the background.** The browser drops the lock when the page is
   hidden. On `visibilitychange` to `visible` while `#gamemode` is not
   hidden, the lock is requested again — once, not once per open ever made.
   When bench mode is closed, a `visibilitychange` requests nothing.
5. **Silent where unsupported.** With `navigator.wakeLock` undefined, or with
   `request` rejecting (`NotAllowedError`), bench mode opens, steps and closes
   as before, nothing is shown to the coach, and nothing reaches the console
   (no `console.error`, no unhandled rejection).
6. **Still measures nothing.** `test/gamemode-open.test.js` stays green
   unchanged: no `getBoundingClientRect` in `openGameMode` or
   `enterGameMode`, and the sheet is still the entry transition.
7. `npm test` and `npm run smoke` pass. No existing test is written against
   markup this ticket replaces, so none is retired.

## Surfaces

Change:

- `app/gamemode.js` — the wake lock: request in `openGameMode`, release in
  `closeGameMode`, one `visibilitychange` listener.
- `app/sw.js` — `VERSION` bump and `SHELL` digest (`gamemode.js` is precached).
- `scripts/smoke.mjs` — one browser check that proves 1–5 against a stubbed
  `navigator.wakeLock` (see Proof).
- `test/` — a source-level test if the tester finds one worth its keep
  (gamemode.js touches the DOM at import, so node tests read the source, as
  `test/gamemode-open.test.js` does).
- `AGENTS.md` — the smoke check count ("20 of them") if a check is added.

Must not change:

- `app/index.html` markup, every stored key, `engine.js` / `budget.js` /
  `storage.js` / `roster.js`, the printed card.
- `scripts/budgets.json`.

## Constraints

- **No new module.** `requests` in `scripts/budgets.json` is the one hard pin
  (39 against the app's 40). A new `app/wakelock.js` would add a request to the
  boot graph. The code lives in `gamemode.js`, which owns bench mode.
- **Feature detection only** (interface guideline D5): test for
  `navigator.wakeLock`, never sniff the platform.
- **D2** (`docs/interface-guidelines.md`): request on open, release on close,
  request again on return to the foreground.
- **Reuse "is bench mode on screen?" as the tree already asks it:**
  `$('#gamemode').hidden === false`, as `toast.js` does. Do not add a second
  flag that can disagree with the DOM.
- **Nothing measures on the way in** — the `gamemode-open` test pins it; the
  wake lock request is not a measurement, but keep it out of `enterGameMode`.
- **Precache bump:** `gamemode.js` changes, so bump `VERSION` in `app/sw.js`
  and set `SHELL` to the digest `npm test` names.
- **No console noise:** every `request()` promise gets a `catch`; the
  `release()` promise too.
- Mobile first, the card, the privacy claim: untouched by this change.

## Design

In `gamemode.js`, module-level `let wakeLock = null`.

- `keepAwake()`: if `!navigator.wakeLock` or a lock is already held and not
  released, return. Otherwise `navigator.wakeLock.request('screen')` then: if
  bench mode is no longer on screen, `release()` it; else store it. `catch` does
  nothing.
- `letSleep()`: release the held sentinel (catching), set `wakeLock = null`.
- `openGameMode` calls `keepAwake()` after `gm.hidden = false`.
- `closeGameMode` calls `letSleep()` after `gmEl.hidden = true`.
- `initGameMode` adds one `visibilitychange` listener: when visible and bench
  mode is on screen, `keepAwake()`. A sentinel the browser released on hide has
  `released === true`, so `keepAwake` treats it as not held.

## Proof

- **`npm run smoke`** — a new check, e.g. `bench mode wake lock`, on the RICH
  fixture, with `navigator.wakeLock` replaced by a stub (via
  `Page.addScriptToEvaluateOnNewDocument` or an in-page override before
  opening) that counts `request` calls and hands back sentinels whose
  `release()` flips `released`:
  - open → 1 request, sentinel held; close → released;
  - open, fire `visibilitychange` with `visibilityState` `hidden` then
    `visible` (sentinel released in between, as a browser does) → 2 requests;
    close, fire `visible` again → still 2;
  - a stub whose `request` never resolves until after close → the late
    sentinel ends released;
  - `navigator.wakeLock` deleted, and a stub that rejects → open, Next, close
    work; `#gamemode` hidden after close; zero console errors and exceptions
    recorded for that page.
- **`guard-falsifier`** on that check: it must go red when the `keepAwake()`
  call is removed from `openGameMode`, when `letSleep()` is removed from
  `closeGameMode`, when the visibility listener is removed, and when the
  `catch` is removed (rejecting stub).
- **`npm test`** — the `gamemode-open` test unchanged and green; the `SHELL`
  guard green after the bump.
- **`/browser-verify`** — on the preview at 390×844 in Chrome: open bench
  mode, `navigator.wakeLock` present, read the held sentinel's `released`
  (false) and after close (true).

## Out of scope

- Any indicator that the screen is being kept on, or a setting to turn it off.
- Keeping the screen on anywhere but bench mode.
- The Resume bar (#34) and floating controls (#33).
- A fallback for browsers without wake lock (a silent video loop or similar).
