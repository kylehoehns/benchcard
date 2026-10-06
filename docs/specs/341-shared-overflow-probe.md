# #341 — One shared container-overflow walker and element-name helper

## Issue

#341. Three smoke probes walk a container for children that stick out of it,
each with its own copy of the loop and of the code that names an element in a
failure message. The copies have drifted. Move the shared parts into
`scripts/smoke/dom.mjs` as page-side function strings and point the probes at
them.

## Goal

One copy of each of three page-side helpers, so the next probe that needs one
reuses it instead of copying it and drifting. Nothing a coach sees changes:
this is a test-harness refactor with no `app/` change.

## Decisions

The ticket is `ready-for-agent` and has no comments. The survey held up every
claim in it:

- `PLATE_PROBE` (`static.mjs`) checks only the right edge; `DIALOG_OVERFLOW_PROBE`
  and `GM_BODY_OVERFLOW_PROBE` (`dom.mjs`) check both.
- `PLATE_PROBE` leaves `#id` out of the element name.
- `OVERFLOW_PROBE` (`dom.mjs:389`) and `sweep.mjs:90` write `split(/\s+/)` in
  a template literal, so the browser receives `/s+/`.
- The cut test (`scrollWidth > clientWidth + tol`) is written page-side with
  tolerances 0 (`static.mjs`), 0.5 (`season-look.mjs`) and 1 (`hand-off.mjs`,
  `card-at-32.mjs`, `clip-sweep.mjs`).

Settled from the ticket and the survey, without a question to the human:

- **Edge rule: both edges, for all three walkers.** Measured on this tree
  before the change, with a temporary probe through
  `--only "static pages: 2 guides + 6 charts"`: the furthest-left visible
  descendant of any `.plate` sits 13px inside its plate at 16px text and 25px
  inside at 32px text, on both guides at 320 and 390. So adding the left edge
  to `PLATE_PROBE` makes no passing cell fail.
- **Tolerance: unchanged at every call site.** The three walkers already all
  use 1px of slack, so the walker carries 1px. `IS_CUT` takes the tolerance as
  an argument and every caller passes the number it uses today (0, 0.5 or 1).
  Nothing is loosened or tightened.
- **`opacityProperty` is a flag.** `PLATE_PROBE` leaves it off on purpose (a
  `.reveal` block is opacity 0 until scrolled to); the other two set it.
- **Which naming copies move to `DESCRIBE_EL`:** only those that build the
  name exactly as `DESCRIBE_EL` does (tag, `#id`, first two classes), plus
  `PLATE_PROBE`, whose missing `#id` the ticket names as drift to fix. Those
  are the three walkers, `OVERFLOW_PROBE`, `sweep.mjs`, `clip-sweep.mjs`'s
  `path`, `type-scale.mjs`, `focus-clear.mjs` and `app-large-text.mjs`'s
  `STRANDED_ABOVE`. The copies in `flow-inset.mjs`, `pinned-focus.mjs`,
  `team-screen.mjs` and `season-look.mjs` build a different name (first class
  only, all classes, or no `#id`), so moving them would change their failure
  text, which the ticket's completion rule forbids. They stay.
- **Which cut tests move to `IS_CUT`:** the five page-side ones listed above.
  The checks in `pass-large-text.mjs` compare numbers already sent back to
  Node, not elements in the page, so they stay.

## What would settle it

1. `scripts/smoke/dom.mjs` exports three page-side function strings, the same
   shape as `IS_SR_ONLY_RECT`:
   - `DESCRIBE_EL` — `el => tag + #id + first two classes`, with the class
     split reaching the browser as `/\s+/`.
   - `IS_CUT` — `(el, tol) => el.scrollWidth > el.clientWidth + tol`.
   - a container-overflow walker that, given a container element and an
     `opacity` flag, returns the visible, non-zero-size descendant that sticks
     out furthest past either edge of the container by more than 1px (or
     `null`), with its name from `DESCRIBE_EL`, how far out it is, which edge,
     and the two edge coordinates.
2. `DIALOG_OVERFLOW_PROBE`, `GM_BODY_OVERFLOW_PROBE` and `PLATE_PROBE` use the
   walker; none of them keeps its own loop. Their JSON output keeps the fields
   and rounding their callers read today.
3. Every site listed under Decisions uses `DESCRIBE_EL` or `IS_CUT`, and no
   other copy of the naming expression or the cut expression remains in those
   files. `grep -rn 'split(/\\s+/)' scripts/smoke` finds no single-backslash
   `/\s+/` inside a page-side template literal.
4. **Failure text is unchanged, both ways.** For each rewired probe, a
   temporary mutation that breaks the layout it guards (CSS on `app/`, or a
   fixture tweak where CSS cannot reach), run through `--only` on the old code
   and on the new code, prints the same failure message, except that:
   - `OVERFLOW_PROBE` and `sweep.mjs` now split class names correctly (a class
     containing the letter `s` is no longer cut at it), and
   - `PLATE_PROBE` now names an element's `#id` when it has one.
   Each before/after pair is recorded in the PR. Mutations are reverted before
   commit and the tree is shown clean.
5. A left-edge mutation on a `.plate` (a descendant pushed past the plate's
   left edge) fails `static pages: 2 guides + 6 charts` on the new code. On
   the old code it passed.
6. `npm test` and a full `npm run smoke` pass.

## Surfaces

Changes: `scripts/smoke/dom.mjs`, `scripts/smoke/static.mjs` (only
`PLATE_PROBE` and the cut test it carries; **not `cellChecks`**, which #340
is changing in parallel), `scripts/smoke/sweep.mjs`,
`scripts/smoke/clip-sweep.mjs`, `scripts/smoke/type-scale.mjs`,
`scripts/smoke/focus-clear.mjs`, `scripts/smoke/app-large-text.mjs`,
`scripts/smoke/season-look.mjs`, `scripts/smoke/hand-off.mjs`,
`scripts/smoke/card-at-32.mjs`. Comments in those files that describe a probe's
own loop are updated to point at the shared helper.

Must not change: anything under `app/` (so no `sw:bump`), `cellChecks` in
`static.mjs`, `test/coach.js`, the smoke registry's row names, any tolerance,
`LARGE_TEXT_ALLOW` or `APP_LARGE_TEXT_ALLOW`.

## Constraints

- Page-side helpers are strings interpolated into a caller's own injected
  code with `${...}`, like `IS_SR_ONLY_RECT`. A regex inside them is written
  so the browser receives `\s`: inside a JS template literal that means `\\s`.
- No file under `scripts/smoke/` may pass `LIMIT` in `test/smoke-size.test.js`
  (55,000 bytes); `app-large-text.mjs` is at 47,280 today.
- `/new-guard` applies: every rewired probe is shown green on the healthy tree,
  then red against a mutation, with the mutation proved to have landed, and
  restored with a read-back.
- `/browser-verify`'s measurement traps apply to any new probe code.

## Design

`dom.mjs`, next to `IS_SR_ONLY_RECT`:

- `DESCRIBE_EL` as above.
- `IS_CUT` as above.
- `WORST_OUTSIDE` (name is the developer's call) — a page-side function
  `(box, opacity) => worst | null` that walks `box.querySelectorAll('*')`,
  skips zero-size and invisible elements (`checkVisibility` with
  `contentVisibilityAuto` and `visibilityProperty`, plus `opacityProperty`
  when the flag is set), and measures both edges against
  `box.getBoundingClientRect()` with 1px slack. It returns raw numbers;
  callers round them as they do today.

`PLATE_PROBE` calls the walker per plate and keeps the worst. Its message in
`cellChecks` already prints `w.right` and `w.plate`; the probe fills those
with the overhanging edge's coordinate and the plate's matching edge, so a
right-edge failure reads exactly as today and a left-edge one reads the same
way with left-edge numbers. `cellChecks` itself is not edited.

## Proof

- **Seam: the smoke rows that run each probe**, through
  `node scripts/smoke.mjs --only "<row>"`, run via the shared smoke lock:
  `static pages: 2 guides + 6 charts` (`PLATE_PROBE`, `IS_CUT`),
  `app shell at 320px/32px text` (`DIALOG_OVERFLOW_PROBE`,
  `GM_BODY_OVERFLOW_PROBE`, `OVERFLOW_PROBE`, `STRANDED_ABOVE`),
  `bench mode: next change, scope control, no spill, reachable rows, Leave`
  (`GM_BODY_OVERFLOW_PROBE`), `no overflow, 300–420px plus 600/840/1280px`
  (`sweep.mjs`), `no cut-off text at 320px/32px text` (`clip-sweep.mjs`),
  `type scale: 8 sizes, 4 weights`, `tab order stays clear of the floating
  bar and action bar`, `season: one list style, prototype row sizes`, the
  `hand off` row that reads the label, and `card is 3.45 × 5in`. Covers items
  2–5.
- **`node --test test/smoke-size.test.js`** and `npm test`. Covers item 6's
  first half and the size limit.
- The full `npm run smoke`, once per commit. Covers item 6.

No new unit test: this changes no pure app function and no coach journey.

## Out of scope

- Naming copies that build a different name (`flow-inset.mjs`,
  `pinned-focus.mjs`, `team-screen.mjs`, `season-look.mjs`).
- `OVERFLOW_PROBE`'s and `sweep.mjs`'s viewport loops: they measure against
  the viewport with an ancestor-scroll skip, a different shape from the
  container walker. Only their naming moves.
- Unifying tolerances.
- The chart-page `scrollCheck` skip in `cellChecks` (#340).
