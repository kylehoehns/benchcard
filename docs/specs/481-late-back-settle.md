# 481 — Smoke settles wait for a late history.back()

## Issue

#481: under machine load a smoke row (seen four times, always `rich fixture
is live`) throws `Inspected target navigated or closed` instead of passing or
failing on what it checks. Find the command that runs during a navigation and
make it wait; do not retry.

## Goal

A smoke row never acts on the next screen while a `history.back()` the app
started is still in flight, however slow the machine is.

## Cause (found in the survey)

The app's Back button goes home with a real `history.back()`
(`app/render.js` `setView`). The browser runs that traversal later, on its own
schedule. `fixturePass` clicks Back, waits one `SETTLE`, then clicks Season.
`SETTLE` only waits for animations and a few frames. If the traversal has not
landed by then, Season pushes an entry, the late back lands under it, the
app's echo handler relabels the Today entry as Season, and the next Back walks
off this document into the previous one. That cross-document navigation kills
the evaluate: "Inspected target navigated or closed".

The same "a settle gives the popstate its turn" assumption is written in
`rich-fixture.mjs` and `phone-gutter.mjs`, and every `TODAY_HOME` click
relies on it.

## What would settle it

1. The throw is reproduced on purpose before the fix, with the exact
   message, in `node scripts/smoke.mjs --only 'rich fixture is live'`.
   CPU throttling (rates 6 and 20) and three concurrent smoke shards did not
   reproduce it (19 of 19 passed): throttling slows the renderer, not the
   browser process that runs the traversal. A temporary, uncommitted probe
   that makes the first `history.back()` of the page resolve 200ms late, at
   the offset it had when called (what the browser does when it is behind),
   reproduces it 3 of 3.
2. The same probe passes 3 of 3 after the fix.
3. A unit seam goes red without the fix: `SETTLE` and `TIMERS_QUIET` return
   before the popstate of a `history.back()` delayed 800ms.

## Surfaces

- `scripts/smoke/dom.mjs`: `TIMER_TRACKER` counts `history.back()` calls
  until their `popstate`; `SETTLE` and `TIMERS_QUIET` treat a pending back as
  not quiet.
- `test/smoke-settle.test.js`: the seam test.
- Comments in `scripts/smoke/rich-fixture.mjs` and `scripts/smoke/phone-gutter.mjs`.
- Not touched: `app/`, `.claude/hooks/` (another lane), the 115 `#backBtn`
  call sites.

## Constraints

- No retry on the error, no raised timeout (the issue).
- Reuse the tracker smoke.mjs and look.mjs already register (`TIMER_TRACKER`)
  rather than a second on-new-document script registered in two places.
- Pages without the tracker (`compare-shots.mjs`) behave as before.

## Design

`TIMER_TRACKER` wraps `History.prototype.back` to count calls and decrements on
`popstate` (clamped at 0; reset on a back/forward-cache restore). A shared
`BACK_PENDING` helper is read by `SETTLE` and `TIMERS_QUIET`, so both keep
waiting, within their existing 3s cap, until the back lands.

## Proof

- `test/smoke-settle.test.js` (real Chrome, bare page, tracker registered as
  smoke registers it, plus a test-only late-back script registered under it):
  item 3, and it checks the delay really ran.
- The probe runs for items 1 and 2, recorded in the PR.
- The full `npm run smoke`.

## Out of scope

- Making the late-back probe a permanent smoke flag.
- `compare-shots.mjs`, which registers no tracker.
