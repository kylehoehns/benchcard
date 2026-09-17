# 73 — Bottom sheets: polish spacing, focus ring and motion

## Issue

#73 (child of #18): opening a sheet by tap draws a focus ring on the grab
handle, stepper rows do not line up, wrapped rows look cramped, the last row
sits against the status line, and opening, dragging and closing a sheet
should feel like a native iOS sheet.

## Goal

A coach opens Format, Plan or Add a rule with a thumb and sees a clean sheet:
no stray box, steppers in one column, long rules and long player names
readable with room around them, and the last row clear of the status line.
The sheet moves like a phone sheet: it slides away when closed, grows and
shrinks smoothly, closes on a quick flick, and can be pulled from anywhere
in its header.

## Survey (2026-09-17, on `d0028ac`, Chrome at 390 × 844, dark)

- **First focus.** `openSheet` (`app/trap.js`) focuses `trapNodes(dialog)[0]`,
  which is `.bsheet-handle` in all four sheets (measured:
  `document.activeElement.className === 'bsheet-handle'` after tapping
  `#phraseFormat`). `pushPane` does the same inside `#planSub` (the first
  kind chip). Desktop Chrome does not match `:focus-visible` there after a
  mouse click; iOS Safari does, which is the reported ring. Holds.
- **Handle ring over the title.** `.bsheet-handle` is `position: absolute`,
  48px tall, and `.bsheet-hd-row` starts 1rem down, so a ring on the handle's
  box covers the title. Holds.
- **Steppers.** Format's `.sheetstep` rows are `label, −, value, +` spread
  with `justify-content: space-between`, so each row's columns depend on its
  label. Measured: Periods − at x 136–180, value 243–264; Minutes each − at
  164–208, value 257–279. The + buttons line up (327–371); nothing else
  does. Holds. Add a rule's Minutes row (`pstepRow`, `app/rules.js`) is
  `label … value [−|+]` — a different builder and a different look.
- **Wrapped rows.** `.prow` has `min-height: 48px; padding: 0 1rem`, so a
  rule that wraps to two lines has no vertical padding (screenshot: "Brody,
  Hayden S., Hayden W., Kade and Tate start the game" touches its divider).
  Holds. Who's here rows (`.sheetrow-t`) ellipsize long names instead of
  wrapping.
- **Last row and the status line.** Since #74 the body scrolls, and
  `.bsheet-status` is a flex sibling *below* `.bsheet-body`, not laid over
  it. So nothing is hidden behind it any more, but the last row sits flush
  against it: Add a rule's Minutes row bottom 805.8, status top 805.3; the
  Plan sheet's last help text bottom 805.7, status top 805.3. The grouped
  sheet's status line has `border-top: 0`, so nothing marks the edge. The
  ticket's "bottom padding equal to the status line's height" assumes an
  overlay that no longer exists; the real need is breathing room plus a
  divider. Partly falsified; the acceptance test still stands as written.
- **Strategy picker.** Fixed by #74 (`fc3546d`) — the owner's comment on
  the issue says so. Only re-checked here, not rebuilt.
- **Motion.** `closeSheet` calls `dialog.close()` at once; `setSheetHeight`
  swaps a `height` class with no animation; release reads distance only
  (`DRAG_CLOSE_FRAC` 0.25, `DRAG_FULL_FRAC` 0.15); an upward drag follows
  the finger with no limit; only `.bsheet-handle` starts a drag;
  `::backdrop` never changes. All hold.
- **Guards that read this markup.** `scripts/smoke/sentence-sheets.mjs`
  reads `.sheetstep*` and checks close by drag and focus return;
  `scripts/smoke/plan-sheet.mjs` checks close and focus return for the Plan
  sheet. Both assume `dialog.open` is false immediately after a close.

## What would settle it

Fixture for the look checks: `RICH` with real-length names (for example
"Maximilian Featherstone", "Alexandria Vasquez-Delacroix", "Christopher
Abernathy") and five rules on the first game, including a starting five of
five players, so rule rows wrap.

**Focus**

1. Opening Who's here, Format, Sub interval and Plan puts focus on the
   sheet's own title (`h2`, `tabindex="-1"`), not on the handle. The title
   shows no ring when focused this way, in any engine (it is not a control
   and cannot be tabbed to). A push inside the Plan sheet (a rule, Add a
   rule, Lineup balance) moves focus to the same title, which now reads the
   pushed page's name.
2. The global `:focus-visible` rule in `app/app.css` is unchanged. Tab from
   the title reaches the handle and every control in order, each with a
   visible ring. The handle's ring is drawn around the visible pill (its
   `::before`), not the 48px hit box, so it never covers the title.
3. Escape, ✕, backdrop tap and drag close the sheet and return focus to the
   phrase that opened it, as today; Escape at level 2 still goes back one
   level first.
4. A smoke check asserts, for each of the four sheets, that
   `document.activeElement` is that sheet's title right after opening, and
   fails if it is the handle.

**Steppers**

5. Format and Add a rule use one stepper row, built by one function: label
   on the left, then the value, then a joined `− | +` pair (the prototype's
   look). In every row of a sheet, the − left edges are equal, the + left
   edges are equal, and the value boxes have equal left and right edges
   (within 0.5px), at 390 px and at 320 px with a 32px root. The value sits
   right next to its buttons, and the pair stays inside the row's padding.
   Buttons stay 48 × 48 or larger. Each button's `aria-label` is unchanged
   ("Fewer periods", "More minutes", …).
6. The Format sheet uses the grouped look (a `--surface` group on the
   `--sheet` background), like the prototype's `sheet-format`.

**Spacing**

7. Every grouped row (`.prow`) and every Who's here row has the same top and
   bottom padding whether its text is one line or several: a one-line row is
   48px tall at a 16px root, and a wrapped row's first-line top and
   last-line bottom sit the same distance from the row's edges as a one-line
   row's text does (within 1px). Line height is at least 1.3. The chevron
   and any value are centered on the whole row. Long player names in Who's
   here wrap instead of being cut off with an ellipsis.
8. The Lineup balance value ("Steady", "Start strong") never touches its
   label: at 320 px with a 32px root there is at least 8px between them,
   and either may wrap.
9. In every sheet, scrolled to the bottom, the last row's bottom edge is at
   least 12px above the status line's top edge. The status line has a 1px
   `--line` divider on its top edge in every sheet, grouped or not, and its
   own background, so content reads as scrolling under it.

**Motion** (transform and opacity only; M1 easing `--ease`, `--t`)

10. Closing by ✕, Escape, backdrop tap and drag slides the sheet down and
    fades the backdrop, then closes the dialog. The dialog is closed within
    `--t` + 100ms, and focus returns as in item 3. A screen change
    (`closeSheets`, `popstate`) and opening another sheet still close at
    once, with no slide.
11. Half ↔ full animates, by handle tap and by drag. The height class still
    changes once per switch (never animated); the visible motion is a
    `transform` from the old top edge to the new one.
12. Release uses speed as well as distance. A downward release faster than
    0.5 px/ms (over the last 100ms of movement) closes the sheet, from half
    or full; an upward release faster than 0.5 px/ms from half makes it
    full. Distance thresholds stay (25% down closes, 15% up from half goes
    full). A slow release between thresholds settles back at its height.
13. Dragging up past the top edge of the current height is rubber-banded:
    the sheet moves less than the finger (at most 60px however far the
    finger goes) and springs back on release. No gap shows under the
    sheet while it is pulled up.
14. A drag starts from anywhere in `.bsheet-hd` except its buttons (✕, back,
    Add rule), and from `.bsheet-body` when the body is scrolled to the top
    and the finger moves down. Otherwise the body scrolls as normal.
15. While dragging down, the backdrop fades in step with the drag
    (fully clear at the sheet's full height of travel).
16. After a release that does not close, the sheet settles from where the
    finger left it with `--ease` over `--t`, with no jump.
17. The handle is still a real button: a tap toggles half and full (I3) and
    its `aria-label` still names what the next tap does.
18. Under `prefers-reduced-motion: reduce`, nothing slides: open, close,
    resize and settle happen at once. Dragging still works.
19. During a drag, no layout work runs per frame (no reads of layout inside
    `pointermove`/`touchmove`; writes batched to one per frame). A 4× CPU
    throttle in Chrome keeps the drag free of Layout events between the
    first and last move, measured with a DevTools trace.
20. A smoke check closes a sheet by each path — ✕, Escape, backdrop, drag,
    and a fast flick — and asserts the dialog ends up closed and focus is
    back on the phrase.

**Look and proof**

21. Side-by-side images next to the matching prototype PNG, committed under
    `notes/mockups/prototype/compare/73/`: Format, Plan and Add a rule
    sheets, light and dark, at 390 × 844; each sheet scrolled to the bottom;
    at full height; and the three sheets at 320 px with a 32px root.
22. `npm test` and `npm run smoke` pass.

## Surfaces

Change: `app/trap.js`, `app/app.css`, `app/index.html` (title `tabindex`,
Format sheet `grouped`), `app/game-setup.js` (Format body), `app/rules.js`
(Minutes/Stints rows use the shared stepper), `app/sw.js` (VERSION, SHELL),
`scripts/smoke/sentence-sheets.mjs`, `scripts/smoke/plan-sheet.mjs`,
`scripts/smoke/sheet-drive.mjs`, `scripts/smoke/registry.mjs` if a row is
added, `test/` (new and updated cases), `scripts/budgets.mjs` only if a
ceiling is crossed, `docs/` via doc-writer.

Must not change: the printed card (`app/card.css`, `app/card.js`), the four
pure modules, the global `:focus-visible` rule, `openTrap`/`closeTrap` (the
other overlays), any element id, `scripts/budgets.json` `requests`.

## Constraints

- **No new module in the boot graph.** `requests` is the one real budget
  pin. The shared stepper goes in a module both `game-setup.js` and
  `rules.js` already import (`game-setup.js` itself — `rules.js` imports it
  already — or `dom.js`). Do not re-derive a second stepper.
- **Reuse** `reducedMotion()` and `PANE_MS` in `trap.js`, `--ease` and `--t`
  from `app/tokens.css`, and `trapNodes` for focus order. No new easing
  curve and no bounce (M1); the springback is `--ease`, not `--spring`.
- **M2**: transform only for the sheet; opacity only for the backdrop. No
  `top`/`height` animation. **M3**: every animation can be interrupted — a
  new pointerdown during a settle or close picks up from where the sheet is.
- **I1**: every control stays 48px. **I3**: the handle stays a button.
  **A1**: focus is always visible on controls; the title is a focus target,
  not a control. **A3**: the status line stays inside the sheet.
- **L6** 28px top corners, 8px grid. **T2/T3** rem sizes from the scale.
- The prototype wins on look, `docs/interface-guidelines.md` wins over the
  prototype (no tab bar, 48px targets, ✕ not Done).
- `closeSheet` stays the one close path; smoke checks that read
  `dialog.open` right after a close must wait for the slide.
- A text file over 60 KB (`app/app.css`) is read in parts.
- Precache: bump `VERSION` past main's and set `SHELL` to the digest
  `npm test` names.
- American spelling. No trailers in commits.

## Design

- **Focus.** `openSheet` and `pushPane` focus the dialog's `h2` (given
  `tabindex="-1"` in the markup) and fall back to the old first-node rule
  only when there is no title. `.bsheet-hd-row h2:focus { outline: none }`
  (a non-control focus target). `.bsheet-handle:focus-visible` moves its
  ring onto `::before`.
- **Stepper.** One builder producing
  `.prow.pstep-row > .prow-t(label) + .pstep-val + .pstep(− +)`, laid out as
  a grid with a fixed-width value column (enough for "40") so every row's
  columns match. Format's body becomes a `.pgrp` of two such rows in a
  `grouped` sheet.
- **Rows.** `.prow` gets vertical padding so a one-line row is exactly 48px
  (e.g. line-height 1.375 and 13px padding at a 16px root), and
  `align-items: center`. `.sheetrow-t` wraps.
- **Bottom.** `.bsheet-body` (and `#sheetPlanBody`'s panes) end with ≥ 1rem
  of padding; `.bsheet-status` always has a `--line` top border and its
  sheet's background.
- **Motion.** A small drag controller in `trap.js`: pointer events on
  `.bsheet-hd` (with `touch-action: none` on the header, buttons excluded
  by target), and touch events on `.bsheet-body` that start a drag only
  when `scrollTop <= 0` and the finger moves down (calling
  `preventDefault` only then). Moves are coalesced into one rAF write of
  `transform` and of a `--scrim` custom property that `::backdrop`'s
  opacity reads. Release math — the speed over the last 100ms, the
  close/full/settle decision, and the rubber-band curve — lives in pure
  exported functions. Close adds a class that transitions `transform` to
  `translateY(100%)` and the backdrop to clear, then calls `close()` on
  `transitionend` (with a timeout fallback). Half ↔ full is a FLIP: switch
  the class, apply the old-minus-new top offset as a transform with no
  transition, then transition it to zero. The pull-up gap is hidden by a
  sheet-colored extension below the sheet (a spread `box-shadow` or
  equivalent that paints outside the clipped box).

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Pure release/rubber-band/speed functions exported from `app/trap.js` | `node --test` (with `test/state-fixture.js`'s document stub if needed) | 12, 13 |
| `sentence and sheets` smoke check (extended) | `node scripts/smoke.mjs --only "sentence and sheets"` | 1, 3, 4, 5, 10, 11, 12, 14, 17, 20 for Who's here, Format, Sub interval |
| `plan sheet` smoke check (extended) | `--only "plan sheet"` | 1, 3, 4, 5, 9, 10, 20 for Plan and Add a rule |
| A new smoke check, `sheet spacing` (a guard, built with `/new-guard`) | `--only "sheet spacing"` | 5 (column equality at 390 and 320/32px), 7, 8, 9 |
| The existing touch, large-text and plan-controls sweeps | full `npm run smoke` | I1, no overflow |
| `/browser-verify`, by hand | Playwright, Chrome and WebKit | 2, 13, 15, 16, 18, 19, 21 |

## Out of scope

- The Format sheet's footer copy ("32 minutes in all…") and header wording.
- The other overlays (`openTrap`): game mode, the tour, help.
- A British spelling found in the Plan sheet's pairs footnote
  (`app/rules.js`, the "Force together" help line), which
  `scripts/spelling.mjs`'s list misses — reported as a separate issue, not
  fixed here.
- The strategy picker (fixed by #74).
