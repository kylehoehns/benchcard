# #357 — one shared overflow walker, element namer and viewport read

## Issue

#357: finish #347. `narrow.mjs` and `sweep.mjs` call the shared overflow
walker in `scripts/smoke/dom.mjs` instead of keeping their own, the inline
element namers become `DESCRIBE_EL`, and "read the viewport, resize, put it
back" is one helper. First, find out whether `narrow.mjs`'s ancestor test
reads green on real overflow.

## Goal

A smoke row about sideways overflow fails when a coach could be stranded
past the edge of the screen. One walker decides that, so a fix to it reaches
every row.

## What would settle it

1. **The false green, measured first.** Before `narrow.mjs` changes, a
   Chrome-backed test runs today's `narrowPass` against fixture B below at
   320px wide and records whether it passed. The PR states the result:
   "the false green was real" or "ruled out", with the detail string
   `narrowPass` printed.
2. A Chrome-backed test (shaped like `test/smoke-settle.test.js`: `launch`,
   `cdp`, `NEEDS_CHROME`, `data:` pages) runs the shared walker at 320px wide
   (`Emulation.setDeviceMetricsOverride`, `mobile: true`) against three
   fixture pages:
   - **A**: a 600px-wide child inside a parent with `overflow-x: auto` and
     `width: 100%`. The walker reports no `worst`.
   - **B**: a 600px-wide child inside a parent that is also too wide
     (`width: 700px`, no `overflow-x` set). The walker reports a `worst`,
     and its `out` is ≥ 280.
   - **C**: an element positioned at `left: -50px`. The walker reports a
     `worst` with `right` < 0 (the signed left edge).
   With `narrow.mjs` switched over, `narrowPass` also fails B and passes A.
3. `narrow.mjs` and `sweep.mjs` contain no loop over
   `document.body.querySelectorAll('*')` and no ancestor `overflowX` walk of
   their own. They call the shared walker.
4. No file under `scripts/smoke/`, nor `scripts/smoke-checks.js`, builds an
   element name from `tagName.toLowerCase()` except `DESCRIBE_EL` in
   `dom.mjs`. The 7 sites the issue names (`flow-inset.mjs`, `narrow.mjs`,
   `resume-bar.mjs`, `season-look.mjs` ×2, `team-screen.mjs`,
   `pinned-focus.mjs`, `smoke-checks.js`) use `DESCRIBE_EL`.
5. `narrow.mjs`, `sweep.mjs` and `width-sweep.mjs` read the starting viewport
   through one helper in `page-state.mjs`. None of them evaluates
   `window.__SMOKE_VIEWPORT` itself.
6. If step 1 shows the false green was real, and the corrected check then
   finds real overflow in the app, that overflow is filed as its own issue
   and not fixed here. `npm run smoke` passes.

## Surfaces

Change: `scripts/smoke/dom.mjs`, `narrow.mjs`, `sweep.mjs`,
`width-sweep.mjs`, `page-state.mjs`, `flow-inset.mjs`, `resume-bar.mjs`,
`season-look.mjs`, `team-screen.mjs`, `pinned-focus.mjs`,
`scripts/smoke-checks.js`, `scripts/smoke.mjs` (one injected global), new
`test/smoke-overflow.test.js`, a guard test for item 4.

Must not change: anything under `app/` (so no `sw.js` bump), the other
callers of `OVERFLOW_PROBE` (`bench-details.mjs`, `roster-in.mjs`,
`three-days.mjs`, `appLargeTextPass`) apart from what the walker change gives
them, and `smoke-checks.js`'s own "no horizontal overflow" check (not named
by the issue).

## Constraints

- **Reuse, do not re-derive.** The walker is `OVERFLOW_PROBE`'s loop. Turn
  it into one page-side function that takes options and returns
  `{ vw, pans, worst, seen }`. `OVERFLOW_PROBE` stays as that function called
  with today's options, so its current callers see the same result.
  `sweep.mjs` asks for the `checkVisibility()` skip and the `seen` count it
  has now. Do not add `checkVisibility()` to `OVERFLOW_PROBE`'s default:
  that would change four other rows.
- The excuse rule is `OVERFLOW_PROBE`'s: an ancestor excuses overflow only
  when its computed `overflow-x` is `auto` or `scroll` and it is itself cut
  (`IS_CUT(n, 1)`). `vw` is `documentElement.clientWidth`. Both edges count.
- `sweep.mjs` keeps measuring inside two `requestAnimationFrame`s, and keeps
  rule 2a's `SEEN_FLOOR` check. `narrow.mjs` keeps its `pans` and top-bar
  (`barFits`) results. Its failure detail may name only the worst element
  instead of up to four. Say so in the PR.
- `smoke-checks.js` is not a module. `smoke.mjs` reads it as text. It gets
  `DESCRIBE_EL` the way it already gets the viewport: `smoke.mjs` adds
  `window.__SMOKE_DESCRIBE = ${DESCRIBE_EL};` in the
  `Page.addScriptToEvaluateOnNewDocument` call that sets
  `window.__SMOKE_VIEWPORT`. `label` becomes that global, with no fallback
  namer. The file's header comment says a hand paste needs it defined first.
- Changing a namer changes some failure strings, such as a class list
  instead of the first class. Nothing should assert on those strings. If a
  test does, point it at the new string.
- `/new-guard` for item 4's test: it reads source, so falsify it by
  planting a namer in a probe file.
- `/tdd` for items 1 and 2: each test's red is the behavior's assertion.

## Design

- `dom.mjs`: `OVERFLOW_WALK`, a page-side function string
  `(({ visible = false } = {}) => { … return { vw, pans, worst, seen }; })`.
  `OVERFLOW_PROBE` is `JSON.stringify((${OVERFLOW_WALK})())` in an IIFE,
  with the same output fields as today plus `seen`.
- `sweep.mjs` evaluates `(${OVERFLOW_WALK})({ visible: true })` inside its
  two frames. `narrow.mjs` evaluates the walker and keeps its own `barFits`
  read.
- `page-state.mjs`: `smokeViewport(c)` returns `[w, h]` from
  `window.__SMOKE_VIEWPORT || [390, 844]`. The name is the developer's
  choice.

## Proof

- **`test/smoke-overflow.test.js`** (Chrome, `NEEDS_CHROME`): fixtures A, B
  and C against the walker, plus `narrowPass` on A and B. Covers items 1
  and 2.
- **Guard** (source-reading, `/new-guard`): no namer outside `DESCRIBE_EL`,
  and no `__SMOKE_VIEWPORT` read in the three sweep files. Covers items 3,
  4 and 5.
- **`npm run smoke`**: the `narrow`, `sweep` and touch-width rows stay
  green. Covers item 6.

## Out of scope

- `smoke-checks.js`'s own overflow check and its `visible` helper.
- Any app fix for overflow the corrected check finds. That goes in a new
  issue.
