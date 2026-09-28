# #195 — Game screen's Timeline label runs onto Card at 320px and 32px text

## Issue

#195. On the game screen, the Timeline | Card switch (`#viewSeg`) draws
"Timeline" past its own half and onto "Card" at 320px wide with 32px text,
in DejaVu Sans. Keep each label inside its own half.

## Goal

A coach with their phone's text size turned all the way up can still read
both choices on the game screen's switch, and tap either one, without one
word printed over the other.

## Survey

The issue's claims hold.

- **Markup:** `app/index.html:655`, `div.seg.noprint#viewSeg` with two
  `button.press` (`data-view="timeline"` / `"card"`). `applyGameView`
  (`app/timeline.js:50`) toggles `.on` and `aria-pressed`; the click handler
  is `app/app.js:69`. No JS sets any size, so this is CSS only.
- **CSS that applies at 320px/32px:**
  - `app/app.css:121` `.seg` (inline-flex, 2px track padding, 2px gap).
  - `app/app.css:126` `.seg button` (`min-height: 2rem`, padding
    `.36rem 1rem`, `--fs-secondary`, `::after` 48px tap area at `:128`).
  - `app/app.css:139` `.seg button.on` (weight 600).
  - `app/app.css:156-158` `#viewSeg`: `display: inline-grid;
    grid-auto-flow: column; grid-auto-columns: 1fr; max-width: 100%`, and
    `#viewSeg button { min-width: 0 }`. This is what makes the two halves
    equal and lets a label spill out of its half.
  - `app/app.css:3343` (`max-width: 620px`): `.seg button` padding
    `.36rem .72rem` and `--fs-footnote` (0.8125rem, 26px at a 32px root).
  - `app/app.css:3400` (`max-width: 19em`): `.seg { flex-wrap: wrap; }`.
    That is how every other bare `.seg` gets out of this exact problem, but
    `#viewSeg` is a grid, so `flex-wrap` does nothing to it.
- **Measured** (scratch CDP probe, smoke's DejaVu Sans injected, rich
  fixture, game screen):

  | Cell | Switch | Each half | Padding each side | "Timeline" text | "Card" text |
  | --- | --- | --- | --- | --- | --- |
  | 390px / 16px | 177.4 × 36 | 85.7 × 32 | 11.52px | 62.7px (fits) | 30.4px |
  | 320px / 32px | 256 × 68 (full column) | 125 × 64 | 23.04px | **125.3px** at 26px/600 | 60.8px |

  At 320/32, "Timeline" is 125.3px wide with only 78.9px of room inside its
  half. It runs from x=57 to x=182.4, while its own half ends at x=159 and
  "Card"'s half starts at x=161. The switch is already the full width of
  the column (256px of 256px), so there is no more width to take.
- **Reproduced:** with #195's known-issues entry disabled,
  `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
  failed with 38 problems, all of them this bug, in 19 states × top/bottom:
  `games`, `tour, first step`, `who's here sheet`, `format sheet`,
  `sub interval sheet`, `plan sheet`, `plan sheet, add a rule`,
  `plan sheet, a cap rule`, `plan sheet, a pair rule`, `card sheet open`,
  `who's here sheet, long name`, `game screen on Card`,
  `stint by stint, open`, `mid-game rotation toast in the Format sheet`,
  `3-player blocked panel`, `first run, step 1 with the sample`,
  `first run, step 2`, `first run, step 3`, `sample flash, ?try= landing`.
  Each reads `"Timeline" (button.press.on) spills past its own box onto
  button.press's text`. On `game screen on Card` it is the other way round
  (`button.press` onto `button.press.on`): the unselected, weight-500
  "Timeline" does not fit either. Run time 43.9 s.

## Decisions

- **Side by side cannot work at 320/32 with the current text size.** Even
  with zero padding, "Timeline" (125.3px) is wider than its half (125px).
  So tighter padding alone is not a fix.
- **Stack the two halves at the big-text size.** Inside the existing
  `@media (max-width: 19em)` block, `#viewSeg` becomes a block-level grid
  with one column: "Timeline" on top, "Card" under it, each the full width
  of the column. This is the grid version of what `.seg { flex-wrap: wrap }`
  (`app/app.css:3400`) already does for every other bare `.seg` at this
  size. It keeps C7's equal widths and T4's full-size labels.
- **Rejected: a smaller label at this size** (for example
  `min(var(--fs-footnote), 6vw)`, 19.2px at 320px). It fits (92.6px text in
  a 108.6px half), but it puts text below the footnote step (T3), and
  `test/type-scale.test.js` allows a capped size only for a large title in
  this block. Changing that test to allow it is a bigger change than this
  bug.
- **Rejected: content-width halves, not equal.** Needs padding cut to
  about .3rem to fit (230px of 256px, about 10% spare, under AGENTS.md's
  15%), and breaks C7's equal widths.
- **Rejected: stacked but shrink-wrapped** (`inline-grid` with
  `grid-auto-flow: row`). It fits (171.4px halves), but the switch's width
  then follows the bold label, so it would change width when the coach
  switches between Timeline and Card. Full width does not move.
- **Rejected: changing shared `.seg` rules.** The `max-width: 620px` and
  `19em` `.seg` rules drive the lineup balance picker, the settings rows,
  the welcome tabs and the strategy picker. None of those is in this bug.
  The fix is one `#viewSeg` rule.

## What would settle it

1. At 320px wide and 32px root text, in DejaVu Sans (smoke's forced font),
   on the game screen with the rich fixture, both with Timeline selected and
   with Card selected:
   - "Timeline" and "Card" each sit fully inside their own button: every
     text `Range` rect's left and right are inside that button's box.
   - Neither button's text box overlaps the other button's box.
   - Each label is one line (no word split).
   - The switch is no wider than its column (256px) and the page does not
     pan sideways.
   - Expected, from the scratch probe with the fix injected: switch
     256 × 134, each button 252 × 64, "Timeline" 125.3px (about 50% spare),
     "Card" 60.8px.
2. #195's entry is removed from `CLIP_SWEEP_KNOWN_ISSUES`
   (`scripts/smoke/clip-sweep.mjs`), and
   `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
   passes. It must report no `Timeline` problem in any state, and no stale
   entry. The other entries (#187, #188, #190, #191, #196, #197, #198) are
   untouched and still matched.
3. No change at 390px / 16px: the switch still measures 177.4 × 36 with two
   85.7 × 32 halves side by side, labels 13px, padding 11.52px. The same
   side-by-side shape holds at 320px / 16px and 375px / 16px. (The 19em
   query fires when the screen is at most 19 times the text size: from
   about 17px of text at 320px wide, and 20.5px at 390px. Below that
   nothing changes.)
4. Tap targets stay at least 48px: at 390/16 each button's `::after` hit
   area is still 48px tall; at 320/32 each stacked button is at least 48px
   tall (expected 64px) and full width, and its `::after` does not reach
   into the other button. The smoke touch check (every target ≥48px across
   320–390px) still passes.
5. Still matches the prototype at 390/16: the game screen's switch looks as
   it does in `notes/mockups/prototype/light-game-timeline.png` and
   `dark-game-timeline.png` (equal halves, inline pill, left aligned). No
   tab bar is added (N1).
6. `app/sw.js` `VERSION` and `SHELL` bumped with `npm run sw:bump`.
7. Full `npm test` and `npm run smoke -- --no-tests` pass.

## Surfaces

Change:

- `app/app.css`: one rule for `#viewSeg` inside the existing
  `@media (max-width: 19em)` block, next to the bare `.seg` wrap rule
  (`:3400`), with a short comment. Also update the comment above
  `#viewSeg` (`:144-155`) to say it stacks at big text, and drop its last
  sentence ("Side padding is px, not the shared rule's .9rem …"): no px
  side padding exists on `#viewSeg` today, so that sentence is already
  wrong.
- `scripts/smoke/clip-sweep.mjs`: remove the `issue: 195` entry, and
  #195 from any list of issue numbers the check or its test names.
- `app/sw.js`: `VERSION` and `SHELL`.

Must not change: `app/index.html`, any JS, the shared `.seg` rules
(`:121-143`, `:3343`, `:3392-3400`), any other seg's look, the
`max-width: 620px` and `385px` blocks, any allow list.

## Constraints

- **Mobile first:** 390×844 at 16px is unchanged (item 3). The change only
  applies where the 19em block already rearranges the bar, the pickers and
  the headings.
- **Reuse the existing big-text breakpoint.** `@media (max-width: 19em)`,
  not a new query. `test/big-text.test.js` pins the order of that block
  after the 620px and 385px ones; the new rule goes inside it, so the order
  does not move. It must come after `#viewSeg`'s base rule (`:156`); it
  does, and both are id selectors, so source order decides.
- **Type scale:** no new `font-size` (T3; `test/type-scale.test.js`).
- **C7:** equal widths kept, text only.
- **I1:** 48px tap targets (item 4).
- **Precache bump:** `app.css` is precached, so `npm run sw:bump` in the
  same change (REVIEW.md blocker otherwise).
- **Fonts:** AGENTS.md's 15% spare holds: 252px buttons with 46px padding
  leave 206px for a 125.3px label.
- **Known issues list:** remove only #195's entry. Do not add to or widen
  any other entry or the allow list.

## Design

In `app/app.css`, inside `@media (max-width: 19em)`, after
`.seg { flex-wrap: wrap; justify-content: center; }`:

```css
#viewSeg { display: grid; grid-auto-flow: row; }
```

`display: grid` makes the switch full width (block level), so both buttons
are 252px wide and stay that width whichever is selected. `grid-auto-flow:
row` puts "Card" under "Timeline". The track keeps its 2px padding and 2px
gap, and the selected pill keeps its look. Base `#viewSeg` (inline, two
equal columns) is untouched, so nothing changes below the big-text size.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| `no cut-off text at 320px/32px text` row, with #195's entry removed. It went red for this bug (38 problems, recorded above), and its stale-entry check fails if the entry stays once fixed | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"` | 1, 2 |
| geometry of `#viewSeg` at 390/16, 375/16, 320/16 and 320/32, with Timeline and with Card selected: switch and button boxes, text `Range` rects, `::after` height | a `/browser-verify` step (CDP, smoke's font injected, `goRich`), numbers reported in the PR | 1, 3, 4 |
| touch targets ≥48px across 320–390px, no sideways pan at 320/32 | smoke's touch row and `applargetext` row, in the full smoke run | 4 |
| look: game screen at 390/16 next to the prototype, plus the stacked switch at 320/32 | `node scripts/compare-shots.mjs --issue 195` with the games-view shots, side by side with `light-game-timeline.png` / `dark-game-timeline.png` | 5 |
| font-size and big-text block order unchanged | `test/type-scale.test.js`, `test/big-text.test.js` in `npm test` | Constraints |
| precache bump | `test/sw.test.js`; `npm run check:history` before push | 6 |
| the proof pair | orchestrator | 7 |

No new test that reads source: the clip-sweep row already runs the page
and has been shown red for this exact bug.

## Out of scope

- The other known issues (#187, #188, #189, #190, #191, #196, #197, #198),
  each in its own worktree.
- Any other `.seg` (strategy picker, lineup balance picker, settings rows,
  welcome tabs, theme switch).
- Shrinking the label below the footnote step, or changing the type-scale
  test to allow it.
- A new media query tuned to exactly where the halves stop fitting.
