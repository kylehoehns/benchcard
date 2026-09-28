# #189 — Plan sheet's Lineup balance value covers its label at 320px and 32px text

## Issue

#189. On the Plan sheet, the "Lineup balance" row draws its value
("Steady") on top of its own label at 320px wide with 32px text; the label
and the value must stop overlapping, and #179's known issues entry for it
must go.

## Goal

A coach with the phone's text size turned up opens the Plan sheet and can
read both "Lineup balance" and the shape it is set to. Neither is drawn on top
of the other, whichever of the four shapes is chosen.

## Survey

The issue's claims hold, with two corrections from measuring in DejaVu Sans
(CI's font, which smoke now forces on a Mac too, #177):

- **The label box is narrower than the issue says.** The issue measured about
  45px; in DejaVu Sans `span.prow-t` is **7px** wide with "Steady" and **0px**
  with "Start strong" or "Finish strong". Its two lines need 107px ("Lineup")
  and 126px ("balance"). The row's content box is 192px (256px row minus
  2 × 32px padding).
- **It is worse than the check sees.** The smoke fixture's game is set to
  "Steady", so that is the only value #179's row ever measures. With "Start
  strong" or "Finish strong" the label box is 0px and the value takes the
  whole row. It also happens at 390px/32px (label 0px with "Start strong"),
  a width the sweep does not visit.

What produces it:

- `app/balance.js:124-129` (`renderBalance`) builds the row:
  `button.prow > span.prow-t("Lineup balance") + span.prow-v(<shape label>) +
  .prow-chev`. The four shape labels are `SHAPES` at `app/balance.js:43-48`
  (Steady, Start strong, Finish strong, Both ends).
- `app/app.css:2942` `.prow-t { flex: 1; min-width: 0; }` — a 0% flex basis,
  so the label gets only what is left over.
- `app/app.css:2949` `.prow-v { flex: 0 1 auto; min-width: 0; ... }` — the
  value's basis is its full one-line width. At 32px text that is 111px
  ("Steady") to about 190px ("Finish strong"), which, with the 26px chevron
  and two 24px gaps, leaves the label 7px or nothing.
- The row never wraps (`.prow` at `app/app.css:2935` has no `flex-wrap`), so
  the label's words paint past its own box and onto the value.

Raw finding, reproduced by removing the #189 entry from
`CLIP_SWEEP_KNOWN_ISSUES` and running
`node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
(the full list, with the 4-problem cap lifted — these are the only two):

```
plan sheet@top: "Lineup balance" (span.prow-t) spills past its own box onto span.prow-v's text
plan sheet@bottom: "Lineup balance" (span.prow-t) spills past its own box onto span.prow-v's text
```

The survey left no open question: the issue names the fix direction (the
value moves under the label, the way other rows stack at this size), and the
repo has a precedent for exactly that. Nothing goes to the human.

## What would settle it

All measured in DejaVu Sans (the smoke harness's forced font), on the rich
fixture, Plan sheet open.

1. **320px wide, 32px text, each of the four values** (Steady, Start strong,
   Finish strong, Both ends): the label's box is at least as wide as its
   longest word ("balance", about 126px) — expected 192px, the full row — and
   no text line of the label and no text line of the value share any
   vertical span on overlapping horizontal ranges. No word of either breaks
   mid-word. The value sits on its own line below the label, right-aligned,
   with the chevron still beside it on that line.
2. **#179's check is green without the entry.** The `issue: 189` entry is
   deleted from `CLIP_SWEEP_KNOWN_ISSUES` in `scripts/smoke/clip-sweep.mjs`,
   and `node scripts/smoke.mjs --no-tests --only "no cut-off text at
   320px/32px text"` passes. (With the fix in and the entry left, the row
   fails with `1 stale known-issue entry (never matched this run): #189` —
   measured during the survey by injecting the Design's CSS.)
3. **No change at 390px/16px.** For each of the four values the row is one
   line, 50px tall, and the label, value and chevron boxes match today's
   measurements to the pixel. Today's, in DejaVu Sans: row 358 × 50; label
   234px wide with "Steady" and 188px with "Finish strong"; value right
   edge at 334px; chevron at x = 345.
4. **No band between the stacked and one-line layouts.** Just outside where
   the stacked layout turns on — 390px wide at 20px text (19em = 380px) —
   the row keeps today's one-line layout and the label box is still wider
   than "balance" with every value (today: 137px against 79px with "Finish
   strong").
5. **Still looks like the prototype.** A 390px/16px screenshot of the Plan
   sheet's Lineups group next to `notes/mockups/prototype/light-sheet-plan.png`
   shows the same row: label left, muted value right, chevron — and no tab
   bar. A 320px/32px screenshot of the same group shows the stacked row with
   the label and value both whole.
6. `VERSION` bumped and `SHELL` updated in `app/sw.js` (`npm run sw:bump`).
7. The proof pair passes: `npm test`, then `npm run smoke -- --no-tests`.

## Surfaces

Change:

- `app/app.css` — one rule group inside the `@media (max-width: 19em)` block
  (starts at `app/app.css:3376`).
- `app/sw.js` — `VERSION` and `SHELL`, via `npm run sw:bump`.
- `scripts/smoke/clip-sweep.mjs` — delete the `issue: 189` entry from
  `CLIP_SWEEP_KNOWN_ISSUES`, and nothing else.

Must not change:

- `app/balance.js` — no markup change; the fix is CSS only.
- The shared `.prow`, `.prow-t`, `.prow-v` rules — every sheet and Settings
  uses them.
- The Lineup balance detail page (the `.prow-shape` rows) and any other row.
- Any other entry in `CLIP_SWEEP_KNOWN_ISSUES`, `CLIP_SWEEP_ALLOW` or
  `CLIP_SWEEP_SIDEWAYS`.

## Constraints

- **Mobile first.** The 390px/16px row is the prototype's row and must not
  move (item 3). The fix only turns on under the big-text media query, which
  never matches at 16px text on any phone.
- **Interface guidelines T2:** "Lay out for 200%: rows grow and side-by-side
  pieces stack." That is this fix: the row grows taller, and the value stacks
  under the label.
- **Redesign screens match the prototype, no tab bar.** The Plan sheet is a
  redesigned screen; item 5 is the side-by-side.
- **Reuse, do not re-derive.**
  - The `@media (max-width: 19em)` block is this repo's home for "the reader
    has asked for large text" (see its header comment at
    `app/app.css:3358-3375`). Put the rule there; do not add a new breakpoint.
  - The wrap-and-stack answer is the one `#sheetCard .pgrp .prow`,
    `#sheetPlayer`/`#sheetAddPlayer .pgrp .prow` and `#view-settings .pgrp
    .prow` already use (`app/app.css:2964-3040`): let the row wrap and give
    the label its real width. Scope it to this row's own container,
    `#planLineups`, the way those are scoped to theirs — "other sheets' rows
    were not checked against this fix".
  - Do not wrap the value and chevron in a new `.prow-ctl` element (the
    `#sheetCard` shape): that is a `balance.js` markup change, and the CSS
    below gets the same layout without one.
- **No blanket tolerance, 15% spare.** At 320px/32px the value's line leaves
  it 142px; its longest word is "strong" (102px), "Steady" is 111px — both
  more than 15% under. The label's 192px line against "balance" at 126px is
  52% spare.
- **Precache bump.** `app/app.css` is precached, so `VERSION` and `SHELL`
  change in the same commit (`npm run sw:bump`; `test/sw.test.js` and
  `scripts/check-sw-version.mjs` catch a miss).
- **One issue at a time.** Only #189's row. The parallel branches for #190
  and #191 also touch the Plan sheet, and every one of #187–#198 deletes its
  own `CLIP_SWEEP_KNOWN_ISSUES` entry (#189's sits right after #198's), so a
  rebase may meet a plain text conflict there or in the 19em block. Resolve
  it by keeping both sides' deletions and rules; `sw.js` is handled by the
  merge driver from #186 plus `npm run sw:bump` after the rebase.

## Design

Add to the `@media (max-width: 19em)` block in `app/app.css`, with a short
comment giving the measured numbers:

```css
#planLineups .prow { flex-wrap: wrap; }
#planLineups .prow-t { flex-basis: 100%; }
#planLineups .prow-v { flex: 1 1 0; }
```

- `flex-wrap: wrap` plus a full-width label puts "Lineup balance" alone on
  line one, at the row's full 192px, so it wraps between its two words
  rather than painting past its box.
- The value and the chevron share line two. `flex: 1 1 0` lets the value take
  whatever the chevron leaves (142px at 320px/32px), and `.prow-v`'s existing
  `text-align: right` keeps it right-aligned, next to the chevron, as at
  16px. A two-word value ("Finish strong") wraps between its words on that
  line.
- The `#planLineups` id beats the shared class rules, so source order does
  not decide it. `#planLineups` holds only this one `.prow` (plus the
  no-levels line, which is a `<p>`).

Measured during the survey by injecting this CSS (DejaVu Sans):

| Size | Value | Row height | Label box | Value text lines |
| --- | --- | --- | --- | --- |
| 320 / 32 | Steady | 220 | 192 (2 lines) | 1 line, 111px, right-aligned |
| 320 / 32 | Finish strong | 268 | 192 (2 lines) | 2 lines, 91 + 102px |
| 360 / 24 | Finish strong | 129 | 264 (1 line) | 1 line, 152px |
| 390 / 16 | any | 50 | unchanged | unchanged |
| 390 / 20 | any | unchanged | unchanged (not matched) | unchanged |

**Alternative considered, not taken:** the unscoped precedent exactly as
`#sheetPlayer` has it (`flex-wrap: wrap` and `.prow-t { flex-basis: auto }`,
no media query). Measured: it stops the overlap too and leaves 390px/16px
alone, but at 320px/32px with "Finish strong" the chevron drops to a third
line on its own, at the left edge — the value's full one-line width (190px)
plus the chevron does not fit the 192px line. The media-scoped version keeps
the chevron beside its value.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| #179's clip sweep row, entry removed | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"` — green | 1 (for "Steady"), 2 |
| Row geometry for all four values at 320/32, 360/24, 390/20 and 390/16 | a `/browser-verify` step: the smoke harness's forced font, the rich fixture, Plan sheet open, the value swapped through the four `SHAPES` labels (by setting the game's `balance` or the span's text), and each box and text-line rect reported; not committed | 1, 3, 4 |
| Screenshots against the prototype | `/browser-verify`: 390/16 next to `light-sheet-plan.png`, plus 320/32 | 5 |
| Precache bump | `test/sw.test.js`, `scripts/check-sw-version.mjs` | 6 |
| The proof pair | whoever commits | 7 |

No new committed test. The clip sweep row is the regression guard for this
row ("Steady" at 320px/32px); the other three values are checked once, by
hand, above.

## Out of scope

- The Lineup balance detail page (`.prow-shape` rows) and every other
  `.prow` on the Plan sheet — the rule pickers are #191, the pair rule
  heading is #190.
- Making the clip sweep cycle through the four balance values, or visit
  390px/32px.
- Changing the shared `.prow` rules or `app/balance.js` markup.
- Dropping the chevron at large text (the `#sheetCard` 12em move) — not
  needed; the value fits beside it.
