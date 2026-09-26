# #147 Bench mode details: next change, swap toast, scope control, bottom exit

## Issue

#147 (a sub-issue of #153). This change also absorbs #167: the scope control
spills past the right edge at 320px with a 32px root. The fix for #167 is the
same markup change as #147's item 3b, so one change closes both.

## Goal

When a coach is in bench mode on a phone, four things work:

- The "Next change" box is never hidden under the floating controls.
- A swap toast says what happened to each player's minutes.
- Picking between "This stint" and "Rest of game" looks like a choice. It is
  not mixed up with the one-shot "Sit for the rest" action.
- The bottom exit button is named so it does not look like "finish the game".

Nothing a bench button *does* changes. That covers swaps, sit, stepping,
Finish game, ✕ and the bottom exit. Only layout, wording and the toast text
change.

## Survey (before building)

Measured on `main` at 280dad6, rich fixture (`goRich`, game 0 Hawks, 4×8,
8 stints), 16px root unless noted.

| # | Claim in #147 | Verdict | Measured |
|---|---|---|---|
| 1a | Next-change names run together with spaces | **Falsified**, fixed by #138 | The Off/On columns put one name per line (`.nm`). At 390, Off is Hana/Nia/Riley at y 490/515/541. |
| 1b | Next-change box sits under the controls on short phones | **Holds** (changed since #138) | At 320×640 the foot top is 560 and the controls top is 573. The box bottom per stint is 578, 619, 605, 591, 605, 605, 578, 528, so it runs up to 46px under the controls. At 375×667 the worst is 591 against controls at 600, which is clear but tight. It is fine at 390×844. The cause is the "just on" tag wrapping a floor row from 59px to 72px. |
| 2 | Done and ✕ do the same thing | **Holds** | Both call `closeGameMode(false)`. The game stays Underway and reopens on the same stint. #135 added Finish game but left Done alone. |
| 3a | Swap toast doesn't mention minutes | **Holds** | "Casey on for Ana this stint." Projected minutes went Casey 16→20 and Ana 16→12. For Rest of game, Casey went to 32 and Ana to 0. |
| 3b | "Sit, rebalance" sits inside the toggle group | **Holds**, renamed | #136 renamed it "Sit for the rest". It is a `button.act` inside `.gm-scope`, filled with `--accent`. That makes it look more "selected" than the button that actually is selected. |
| 4 | Bench rows hidden under the bottom bar at 390×844 | **Changed since**. The done-when already holds | At scrollTop 0, rows 4 to 6 are under the foot, which is expected with floating controls. At max scroll the last row ends at 674 against a foot at 764. At 320×640 it ends at 470 against 560, and at 320/32 it ends at 299 against 352. #138's 9.5rem padding did this. Nothing guards it. |
| #167 | Scope control overflows at 320/32 | **Holds** | With a player picked, the group spans x 29 to 340 and "Sit for the rest" spans 245 to 336. `.gm-body` scrollWidth is 340 against 320. The large-text probe misses it because `OVERFLOW_PROBE` forgives anything inside a scroll container. `.gm-body` is `overflow-y: auto`, which makes x scroll too, and its `touch-action: pan-y` means a coach cannot pan over to the clipped part. |

Items 1a and 4 are dropped as work. Item 4 keeps a guard (settle 5), because
this change touches bench spacing.

## What would settle it

Rich fixture, bench mode open on Hawks. Light and dark. Measured at a 16px
root unless a line says 32px.

1. **Next change clears the controls.** At every stint 1 to 8, with
   `.gm-body` scrollTop 0 and no player picked, `#gmNext`'s bottom is at or
   above `.gm-foot`'s top. Check this at 320×640, 375×667 and 390×844. Floor
   rows (`.gm-p`) keep a hit height of at least 48px (I1). A floor row
   showing the "just on" tag is the same height as one without it at 320
   wide. At 320/32 the box must be reachable by scrolling: at max scroll its
   bottom is at or above the foot's top. It does not have to fit without
   scrolling.
2. **Swap toast names the minutes.** After a swap, the toast reads exactly:
   - This stint: `Casey on for Ana this stint. Casey now ends at 20 min, Ana at 12.`
   - Rest of game: `Casey on for Ana for the rest of the game. Casey now ends at 32 min, Ana at 0.`

   The numbers are each player's projected minutes *after* the swap. They
   come from `liveMinutes(p, g)` and are formatted with `fmtMinutes`, the
   same values the rows show. If neither player's projected minutes change,
   the toast is the old sentence with no minutes clause. Undo still restores
   the old plan, and the rows show 16 and 16 again. The "Sit for the rest"
   toast does not change.
3. **Scope is a choice, and sit is an action.**
   - "This stint" and "Rest of game" use the shared segmented control
     (`.seg`, with `.on` on the selected one). There is no separate
     `.gm-scope` look. The selected segment's text is the team tint, the same
     way #141's `.seg` works (K1).
   - "Sit for the rest" is a sibling *after* the segmented control, not
     inside it. It is a plain `.btn`, meaning a surface fill with a border.
     It is not `.primary`, not filled with the tint and not filled with
     `--accent` (C2: the one filled button on this screen is ›/Finish game).
   - Its hit area is at least 48px tall. Its text is exactly
     `Sit for the rest`.
   - What each of the three buttons does is unchanged.
4. **No sideways spill (closes #167).** At 320/32 with a player picked,
   `.gm-body`'s scrollWidth is at most its clientWidth. The segmented
   control and "Sit for the rest" are fully inside the viewport, and the
   button wraps onto its own line if needed. It already fits on one line at
   390/16: the probe put the seg at 14 to 207 and Sit at 216 to 341.
5. **Bench rows reachable (item 4 guard).** At max `.gm-body` scroll, the
   last bench row's bottom is at or above `.gm-foot`'s top. Check this at
   390×844 and 320×640, with and without a player picked. `.gm-body`'s
   bottom padding is not reduced below today's 9.5rem.
6. **Bottom exit label.** Decided with the maintainer: `#gmDone` reads
   `Leave`. Guideline C10's wording and `docs/architecture.md` follow. The ✕ and this button
   still do exactly the same thing, `closeGameMode(false)`, and the game
   stays Underway. The ✕'s accessible name stays "Leave bench mode".
7. **Large text.** A new `APP_LARGE_TEXT_STATES` row, "bench mode, swap
   toast", shows the item 2 toast at 320/32. It passes the existing overflow
   and toast-fit probes: no clipped text, and Undo reachable. The count goes
   from 29 to 30. The existing "bench mode, swap picker" row gains a
   `.gm-body`-relative sideways check (settle 4). As proof, this check fails
   on today's code.
8. **Dark mode and team color.** Only existing tokens are used. The
   segmented control and "Sit for the rest" read correctly in light, dark
   and with a team color set. `team-color.mjs` pins the new selected-segment
   text to the tint and pins the sit button as not tint-filled.

## Surfaces

- `app/gamemode.js`:
  - scope group markup (around lines 503 to 521)
  - `applySwap` toast (around line 717)
  - a pure exported helper that builds the swap sentence
- `app/index.html`: the `#gmDone` label.
- `app/app.css`:
  - drop or trim the `.gm-scope` rules
  - floor-row "just on" tag layout
  - a portrait short-viewport block if needed, like the landscape
    `max-height: 560px` block near line 1726
- `app/sw.js`: VERSION bump, plus SHELL if a file changes.
- `test/gamemode-bench-text.test.js`: `node --test` cases for the swap
  sentence helper. Cover This stint, Rest of game, no change in minutes, and
  fractional minutes through `fmtMinutes`.
- `scripts/smoke/`:
  - a new bench-details check module and its registry entry (settles 1, 3,
    4 and 5)
  - `app-large-text.mjs`: the new state and the body-relative sideways check
  - `team-color.mjs` and `rotation-undo.mjs`: selectors move off
    `.gm-scope button`
- Docs, for the doc-writer:
  - interface guidelines C10 wording if the bottom exit is relabeled
  - `docs/architecture.md` around line 928 (the Done button)
  - the AGENTS.md large-text state count
  - the `CONTEXT.md` Swap entry if the toast wording is quoted there

## Constraints

- Reuse, do not re-derive:
  - `.seg` (#141 / PR #162) for the scope control
  - `.btn` for Sit for the rest
  - `undoable(message, mutate, refresh)` with a **function** `message`.
    It runs after `mutate`, which is how the post-swap minutes get into the
    toast.
  - `liveMinutes(p, g)` for projected minutes, and `fmtMinutes` for
    formatting
- Do not touch `engine.js`, `live.js` or `storage.js`. Do not change what
  any bench button does, or the Finish game flow from #135.
- Build every guard with `/new-guard` and watch it fail against today's
  code first.
- No new boot module: `REQUESTS_BASELINE` is at 42 of 43. Bump the precache.
- American spelling. Never add a tab bar, even though the prototype has one.
- Only #138's chosen look changes where this spec says so. The Off/On
  columns, the round ‹ and ›, the fade and the 9.5rem padding stay.

## Design

- **Item 1b.** The overlap comes from the "just on" tag wrapping a floor row
  onto a second line at 320 wide (59px becomes 72px). Keep that row on one
  line. Options: let the name ellipsize before the tag wraps, or place the
  tag inline with the minutes. If that alone does not clear 320×640 at every
  stint, add a portrait `@media (max-height: 700px)` block, like the
  landscape one. It trims `.gm-body`'s top padding and `.gm-p` vertical
  padding, and never takes a row below 48px.
- **Item 2.** Add `swapToastText(inName, outName, scope, inMin, outMin,
  inBefore, outBefore)`, or a similar pure function, next to
  `benchHeaderText`. `applySwap` passes a closure to `undoable` that reads
  `liveMinutes` for both players after the override.
- **Item 3b.** Change `el('div','gm-scope')` to a `.seg`. Append "Sit for the
  rest" as a `.btn` to `.gm-lab.rowed` after the seg. The row already wraps,
  so at narrow widths the button drops to its own line. The feasibility
  probe on 280dad6 confirmed there is no overflow at 320/32, 320/16 or
  390/16.
- **Item 2 (exit).** A one-word text change in `index.html`. No behavior
  change.

## Proof seams

- `npm test`: the swap-sentence helper cases.
- `npm run smoke -- --no-tests`:
  - the new bench-details check (settles 1, 3, 4, 5, 6)
  - large text (settles 4 and 7)
  - team color (settle 8)
  - rotation undo, which still finds and uses Sit for the rest
- Look check at 390×844 and 320×640, light and dark, stints 1, 2 and 8,
  with and without a player picked, plus the toast visible. Compare against
  `light-bench.png` and `light-bench-selected.png`. The scope control has no
  prototype counterpart, which S1 allows.

## Out of scope

- Item 1a (names run together) and item 4 (rows hidden under the bar) are
  already fixed on `main` by #138. Item 4 only gets a guard.
- ARIA or roving focus for the scope control. That belongs to #139.
- The prototype's tab bar, never.
- Making the bottom exit do anything other than leave, such as finishing
  the game. #135 decided that finishing is only via Finish game.
- Changing the "Sit for the rest" toast or rules (#136).
