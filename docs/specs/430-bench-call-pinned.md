# 430 — Bench mode: pin the Off/On call, move Not here up, keep the toast clear

## Issue

#430: bench mode is one tall scrolling column under a floating footer, so on a
small phone or at large text the Off/On call (the thing a coach reads at the
horn) and the Not here row's "Here now" end up below the fold or under the
footer and the undo toast. Pin the call, move Not here up, keep the toast off
both. Layout only: the swap itself (tap off, tap on) does not change.

## Goal

At the horn, a coach glances down and the call (who comes off, who goes on, and
when) is already on screen at every stint, on any phone and at any text size.
A late arrival's "Here now" is on screen when bench mode opens. A toast never
sits on top of either.

## Survey (measured on 469fd14, smoke font, `LONG_AND_SQUEEZE`, reduced motion)

`.gm-bar`, `#gmNext` (the call), `.gm-foot` and the first "Here now", top–bottom
in px, at the state's opening scroll:

| Cell | Bar | Call | Foot | Here now | Undo toast |
| --- | --- | --- | --- | --- | --- |
| 320×568 / 16 | 0–70 | 379–517 | 488–568 (covers the 3rd pair) | 957–1005 | 363–478 |
| 320×568 / 32 | 0–118 | 1336–1867 | 487–568 | 3469–… | 201–468 |
| 390×844 / 16 | 0–70 | 427–578 | 764–844 | 939–987 | 690–754 |
| 390×844 / 32 | 0–84 | 1202–1693 | 763–844 | 3244–… | 477–744 |

On the last stint at 320×568/16 the call is 418–532 and the foot 424–568.

A prototype that only moved `#gmNext` out of the scroller (no other change)
made the call 340px tall at 32px: the large-text block (`@media (max-width:
19em)`, app.css ~3862) stacks Off above On because the columns were 91px wide,
too narrow for the short names (92–98px in DejaVu Sans).

What the survey changed in the issue's claims, and the choice made for each
(closest to the issue's intent):

1. **Item 4 already holds.** #421 opens the overtime sheet full on a short
   screen: at 320×568/16 its "Add overtime" button measures 354–402, on screen
   without scrolling. Nothing to build; the new check pins it.
2. **"One or two lines at large text" cannot hold with three long-name pairs.**
   At 32px a line is about 35–42px. The target instead: the call shows the
   card's short names (the existing `fitCallRows` fallback) in two columns at
   a smaller type step, and the strip's height is measured, not counted in
   lines (see item 3 below).
3. **At 320×568/32 the screen cannot hold everything at once.** Bar (118) +
   call (≥ ~180) + foot (81) leaves ~190px, and a floor card is ~207px tall at
   that size, so #421's "one whole floor card" cannot hold beside a pinned
   call. Adding a Not here row and a 170–267px toast overruns 568px outright.
   The call wins (it is what this issue is about, and what the coach acts on);
   the floor scrolls. At that one cell the whole-card check becomes "the floor
   window shows at least 96px" (two touch-target heights: the coach can see
   and scroll it). Every other cell keeps the whole-card rule.
   With a Not here row **and** a toast at that one cell, the toast may run up
   over the Not here row for its few seconds; it still never covers the call
   or the foot, and its own x dismisses it. Every other cell keeps the toast
   off "Here now".

## What would settle it

Cells: **320×568 and 390×844, each at 16px and 32px text**, record
`LONG_AND_SQUEEZE` (long names), reduced motion, states opened the way
`CLIP_STATES` opens them. "Visible" means the element's whole box is inside the
viewport and not under another painted element (`elementFromPoint` at its
corners and center lands inside it, or inside the toast only where item 4
allows).

1. **The call is pinned.** In `bench mode`, at **every stint 1–8** (stepping
   with `#gmNext2`), and in `bench mode, last stint`: `#gmNext` is visible
   with `.gm-body` at its opening scroll **and** with `.gm-body` scrolled to
   the bottom (it does not scroll with the floor). Its bottom is at or above
   `.gm-foot`'s top. Every name in it shows on one line (no name box taller
   than one line of its own `line-height`), and no word splits.
   On the last stint, "Tied? Add overtime" is visible and ≥ 48 × 48.
2. **Here now is up top.** In `bench mode, not here`: `#gmOutSec` sits above
   `.gm-body` (its bottom ≤ `.gm-body`'s top), and the first "Here now"
   button is visible and ≥ 48 × 48 at the opening scroll, without scrolling
   anything. Its accessible name is still "Here now, <full name>".
3. **The floor still has room.** In `bench mode` and `bench mode, last
   stint`: at least one floor card (`#gmFloor > *`) is whole inside
   `.gm-body`'s visible box, in every cell except 320×568/32, where
   `.gm-body`'s visible height is ≥ 96px. Leave, Back and Next keep #421's
   one row at ≥ 48 × 48.
4. **The toast stays clear.** In `bench mode, undo toast` and `bench mode,
   swap toast`, the toast (`#toasts .toast`) does not overlap `#gmNext` or
   `.gm-foot` in any cell. In `bench mode, not here` with a toast showing
   (a swap made while someone is Not here), it does not overlap the first
   "Here now" in every cell except 320×568/32.
5. **Overtime sheet.** At 320×568/16 the overtime sheet's "Add overtime"
   (`#overtimeGo`) is visible without scrolling.
6. **Nothing else regresses.** The full smoke stays green in CI (landscape,
   clip sweep, touch targets, focus, the first-run demo that reuses
   `buildNextCols`), and `npm test`.
7. **A smoke check pins 1–5** at the four cells, falsified per `/new-guard`:
   shown red against 469fd14's `app/`.

## Surfaces

Change:
- `app/index.html` — bench mode markup order: `#gmOutSec` moves out of
  `.gm-body` to sit between `#gmMoved` and `.gm-body`; `#gmNext` moves out of
  `.gm-body` to sit between `.gm-body` and `.gm-foot`. Ids stay.
- `app/app.css` — bench mode section: `.gm-foot` stops floating (a flex
  sibling, not `position: absolute` over the scroller), `.gm-body` loses its
  9.5rem bottom reserve, `#gmNext` becomes a strip, `#gmOutSec` a compact
  row; the portrait short-screen block and the landscape block follow the new
  order; the large-text block's `.gm-next-cols { 1fr }` override is replaced
  by whatever keeps two columns.
- `app/toast.js` — `liftToasts`: in bench mode, lift above the call strip as
  well as the foot (portrait), not the foot alone.
- `app/gamemode.js` — only if needed (e.g. `fitCallRows`' measurement or
  `ENTRY_PARTS` for the moved nodes).
- `scripts/smoke/` — one new check module (or an addition to
  `short-phone.mjs`, if it stays under `smoke-size`'s LIMIT), its registry
  entry and README index row; `bench-details.mjs` item 1/5 and
  `short-phone.mjs`'s whole-card rule updated where they encode the old
  layout (each change named in the commit and PR).

Must not change: the swap interaction, any copy, floor rows' full names
(design-decisions ~292: the call may use short names, the floor may not), the
four pure modules, `state.js`, `live.js`, the card.

## Constraints

- Mobile first; every touch target ≥ 48px (I1); bench mode controls stay in
  the bottom half (I2). Guideline C9: the snackbar sits above the primary
  action, never on it — here "the primary action" now includes the call.
- K2/K3: the call stays ink/muted only, no icons, borderless `--sheet` fill
  (bench-look item 6 keeps checking that at 390×844/16; its header copy
  "Next change at 4:00" stays).
- Reuse, do not re-derive: `buildNextCols` and `fitCallRows` (the short-name
  fallback is the answer to long names, not a new truncation), `land`,
  `openState`, `CLIP_STATES`, `LONG_AND_SQUEEZE`, `REDUCED_MOTION`,
  `TOUCH_MIN`, `step`, `SETTLE`, the existing toast states in
  `app-large-text.mjs`. `buildNextCols` also draws the onboarding demo
  (`onboarding.js`, `first-run-flow.mjs`) — its classes and shape stay.
- Use #421's `em` media queries (`(max-width: 18em)` large text,
  `(max-height: 43.75em)` short portrait) rather than new px queries.
- Prefer transform/opacity; nothing new runs per scroll frame. The toast lift
  is measured when a toast shows, as now.
- The new check follows `/new-guard`: a state that never opened, an empty
  call, or a missing node fails (rule 2a); every exemption above is by cell
  name, not a blanket tolerance; no allow-map numbers raised.
- `smoke-size` LIMIT applies to every file under `scripts/smoke/`.

## Design

1. **Order.** Bench mode becomes, top to bottom: bar, `#gmMoved`, Not here
   row, `.gm-body` (floor, bench — the only scroller), call strip, foot. In
   portrait all are flex children of `.gm`; `.gm-body` is `flex: 1;
   min-height: 0`. The foot keeps its look (its `::before` fade can stay;
   bench-look item 3 keeps passing) but is a normal-flow sibling.
2. **Call strip.** `#gmNext` keeps its `--sheet` fill and content (header,
   Off/On columns, or the last-stint text and "Tied? Add overtime"), with
   tighter padding. At large text (`max-width: 18em`) the columns stay side
   by side with a smaller name size (e.g. `--fs-secondary` or
   `--fs-footnote`) and the strip's side padding trimmed, so `fitCallRows`
   gets a column wide enough for the short names; the last-stint copy and
   button compact the same way.
3. **Not here row.** `#gmOutSec` is a compact list under the bar: one line
   per player where it fits (name and "Here now"), the "Not here" heading
   kept for screen readers (visible as a small label is fine). It caps its
   own height (e.g. `max-height` in `vh`, scrolling itself) so a long out
   list never pushes the floor off screen; the first "Here now" is always
   inside the cap.
4. **Toast.** `liftToasts` in bench mode lifts by the height from the call
   strip's top to the viewport bottom (portrait), so the toast sits on the
   floor window, above the call. Where the strip is not at the bottom
   (landscape), it lifts by the foot alone, as now.
5. **Landscape** (`orientation: landscape and max-height: 35em`): the call
   and Not here move to the right-hand column beside the floor (as now),
   with `.gm` laid out as a grid instead of `.gm-body`. The existing
   landscape guards stay green.

## Proof

| Seam | Covers |
| --- | --- |
| New smoke check (four cells, long names, every stint) | 1, 2, 3, 4, 5, 7 |
| `bench-details.mjs`, `short-phone.mjs` updated to the new order | 1, 3 |
| Existing Coach scenarios (`test/game-day-scenarios.test.js`, `test/overtime-add-scenarios.test.js`: Here now, Undo, Add overtime still tappable and not covered) | 2, 6 |
| Full smoke in CI; `npm test` and targeted `--only` rows locally | 6 |
| `scripts/look.mjs` / browser-verify at 320/390 × 16/32, 568 and 844 tall, scrolled to bottom | 1–4 by eye |

Layout is smoke's (AGENTS.md § Test seams). No new Coach scenario: what a
coach can do does not change, only where it sits.

## Out of scope

- Switching floor rows to first names (design-decisions ~292).
- A swap picker (the owner turned it down).
- Floor card height at large text (the avatar stacking above the name) and
  the bar's two-line title at 320/32: both would buy room at 320×568/32, and
  both are other large-text work.
- `#gmMoved`'s own height.
