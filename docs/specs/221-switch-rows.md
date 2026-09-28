# #221 — Switch-row labels wrap instead of painting under the switch

## Issue

#221: at 320px wide and 32px text, an "Even out" switch row's label runs
under the switch, in the Plan sheet and in Add a game step 3.

## Goal

A coach with the largest text size reads every switch label whole, and the
switch never sits on top of a word.

## What would settle it

At 320×(any)px with a 32px root, for every row `switchRow` builds that a
smoke state puts on screen (Plan sheet: "Even out earlier games", "Even out
the season so far", "Force Together pairs every stint" if a state shows it;
Add a game step 3: "Even out earlier games"):

1. The label's text (`.prow-t`, measured by its text's own client rects)
   paints no more than 1px past the right edge of its own box.
2. The label's text rects and the switch `<input>`'s rect do not intersect.
3. The switch stays right-aligned in its row (its right edge is within 1px
   of the row's content-box right edge).

At 390×844 with a 16px root the rows are unchanged: label and switch on one
line, same heights as today (±1px).

The new smoke assertion must fail on today's tree (record the failing line)
and pass after the fix.

## Surfaces

- `app/rules.js` — `switchRow` adds one class to the row it builds.
- `app/app.css` — the wrap rules for that class.
- `app/sw.js` — precache bump.
- `scripts/smoke/` — the new check, in whichever existing pass already
  drives the Plan sheet and Add a game at 320px/32px (e.g. the app-large-text
  pass), or a small new pass registered the normal way.
- Must not change: `teams-view.js` callers' behavior, `placeTour`, the
  `#sheetCard .pgrp .prow` rules (other than moving the switch-specific line
  onto the shared class, if that is the reuse).

## Constraints

- Reuse the fix `#sheetCard .pgrp .prow` already has (`app/app.css` around
  lines 3011–3015): `flex-wrap: wrap; row-gap: 1rem`, `.prow-t { flex-basis:
  auto }`, `input[switch] { margin-left: auto }`. Its comment explains why
  `row-gap` is 1rem (the switch's negative block margin). Do not re-derive
  these values; one rule serves every switch row, and `#sheetCard`'s switch
  line should use the shared class rather than keep a second copy.
- Mobile first; 390×844 look must not change.
- Precache bump: `app/` files change, so bump `VERSION` and set `SHELL` to
  the digest `npm test` names (`npm run sw:bump`).
- Smoke file size guard (`test/smoke-size.test.js`) applies to any smoke
  file touched.

## Design

`switchRow` gives its `label.prow` a class (e.g. `prow-switch`). CSS:

```css
.prow-switch { flex-wrap: wrap; row-gap: 1rem; }
.prow-switch > .prow-t { flex-basis: auto; }
.prow-switch > input[switch] { margin-left: auto; }
```

with the existing comment moved or pointed to. At 16px nothing wraps.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| switch-row check at 320px/32px (text past own box; text vs switch rect; switch right edge) | a named smoke check, `node scripts/smoke.mjs --only "<name>"` | 1, 2, 3 |
| 390×844 row unchanged | same check's 390px/16px leg, or the existing layout smoke | the 390 line |
| precache | `npm test` (sw-version) | bump |

## Out of scope

- The general floor-check rework (#204), which will later catch this class
  of bug everywhere.
- Other `.prow` rows that are not switch rows.
