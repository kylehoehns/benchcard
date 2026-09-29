# #204 — The clip sweep's floor check measures something real

## Issue

#204: the clip sweep's floor check (#179) has never reported anything,
because it skips every element whose computed `font` shorthand is empty, and
in this app that is every element.

## Goal

The 320px/32px text sweep catches text that paints past its own box (the way
a label ran under a switch in #221), without flagging names that wrap on
purpose.

## Survey (on 22e2cdb)

Turning the floor on (dropping `cs.font !== ''` at `clip-sweep.mjs:257`)
gives 84 raw findings, 11 distinct, and nothing else:

- 9 are false alarms: `wordFloorRows(mark, 'body')` sets the row width to
  body's 320px, ignoring the view's padding, row padding and the avatars,
  icons, chevrons and switches beside the text. Each passes when measured
  against its real row. The word widths themselves are right (they match the
  summed on-screen fragment widths).
- 2 are a real bug, now #221: "Even out earlier games" / "Even out the season
  so far" label text paints 41–47px past its own 66px box, under the switch.
  Measuring against the real row would hide these too (floor 66 vs width 66).
- 2 are `h2.flow-q` headings in Add a game ("Who are you playing?", "How
  should minutes split?") running 7–14px into the 32px side margin, whole and
  uncut.

What separates the real bug from the false alarms: the real one's text
paints past its own box; a wrapped name's text never does. A sweep for "text
past own box" across every state found exactly the #221 rows and the two
headings, nothing else. The existing overlap check missed #221 only because
it requires the element hit to have its own text (`hasOwnText(hit)`), and a
switch `<input>` has none.

## Decisions (locked with the human)

- Replace the page-width floor with a **"text paints past its own box"**
  check, and let the overlap check count a spill onto a sibling **form
  control** (input, select, button) that has no text of its own.
- The two `h2.flow-q` headings are **accepted**: readable and uncut. They get
  an allow entry with a reason, scoped to the new check only.

## What would settle it

1. The `cs.font !== ''` filter is gone and nothing skips an element for an
   empty `font` shorthand.
2. A new finding kind, reported for any scanned element whose own text nodes'
   client rects extend more than 1px past the element's own border box
   (left or right edge), at both scroll ends, in every state the sweep walks.
3. The overlap check also reports a spill onto a sibling that is an `input`,
   `select`, `button` or `textarea`, even though it has no own text.
4. On the current tree without #221's fix, the sweep reports the #221 rows
   (Plan sheet and Add a game step 3), and the run passes only through a
   `CLIP_SWEEP_KNOWN_ISSUES` entry for #221. If #221 has merged by the time
   this lands, there is no entry and the sweep passes clean. Record the
   failing line from a run without the entry either way (red evidence).
5. The 9 false-alarm cases (`.alert.info > span`, `.rrow .prow-t` ×2 words,
   `.gm-b .nm`, `p.plan-rule-sentence`, `.sn-nm` ×2 words, i.e. the long
   "Featherstonehaugh" fixture names) are not reported.
6. `h2.flow-q` passes through one allow entry scoped to the new kind, with a
   reason; a stale entry fails the run like the other lists.
7. The comments at `clip-sweep.mjs` ~119–123 (header: `rowSel: 'body'`) and
   ~240–245 (the empty-font reason) say what the code now does.
8. Full smoke passes; `npm test` passes.

## Surfaces

- `scripts/smoke/clip-sweep.mjs` — the probe, lists, reporting.
- `test/clip-sweep-known-issues.test.js` and any test covering the allow
  lists' shape.
- `scripts/smoke/dom.mjs` only if `wordFloorRows` loses its last caller here
  and a dead-export guard demands it (check `test/dead-export.test.js`); do
  not change its behavior for other callers.
- Must not change: anything under `app/`.

## Constraints

- This is a guard change: follow `/new-guard` (red on a known-bad tree, green
  on the fixed one).
- Reuse the probe's own `hasOwnText`, `isSrOnly`, `checkVisibility`, and the
  existing text-rect measurement (`wordRects` / own-text-node client rects)
  rather than a new measurement.
- Reuse the stale-entry mechanism (`reportStale`) for the new allow entry.
- Smoke file size guard (`test/smoke-size.test.js`).
- Never quote the user in the repo.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| clip sweep | `node scripts/smoke.mjs --only "no cut-off text at 320px/32px text"` | 2, 3, 4, 5, 6 |
| red evidence | same run with the #221 entry removed (or on a tree without #221's CSS) | 4 |
| list shapes | `node --test test/clip-sweep-known-issues.test.js` (and siblings) | 6 |
| full | `npm test`, full smoke | 1, 7, 8 |

## Out of scope

- Fixing #221 itself (its own PR).
- Changing the `h2.flow-q` size.
- Re-tuning `wordFloorRows` for its other callers.
