# #199 — Welcome screen's demo plan loses its stint bars at 320px and 32px text

## Issue

#199. On the first-run welcome screen, at 320px wide with 32px text, the demo
plan's colored stint bars are under a pixel wide, so the demo shows names and
minutes but no plan. Stack each demo row at big text so the bars come back.

## Goal

A coach with large text on a small phone opens Benchcard for the first time
and sees the demo plan as a plan: every player's name and minutes, and under
them a row of eight colored stint cells they can actually see.

## Survey

The issue's claims hold. Measured in a real browser (headless Chrome, DejaVu
Sans forced the way smoke forces it, `Page.setFontSizes` for the root size),
on `main` at `4ed4d19`.

- **The elements.** `renderDemo()` (`app/onboarding.js:155`) builds one
  `.wel-row` per demo player (9, `DEMO_N`): `span.wel-dot`, `span.wel-nm`,
  `div.wel-track` holding eight `i.wel-c` cells, and `span.wel-min`. Cells 1,
  3 and 5 carry `.qgap` (3px right margin, the quarter breaks). The rows live
  in `#welRows` inside `#welPanePlan`, an absolutely positioned pane inside
  `.wel-show`, which is `overflow: hidden`.
- **The rules.** `.wel-row` (`app/app.css:2148`) is one grid line:
  `8px var(--nmw) minmax(0, 1fr) min(1.6rem, 13vw)`, `gap: .35rem`. The track
  (`app/app.css:2154`) is `repeat(8, 1fr)` with `gap: 2px`, 11px tall. So the
  track has 7 x 2px + 3 x 3px = **23px of fixed gaps** before any cell gets
  width. `.wel-rows` is `repeat(10, minmax(0, 1fr))` and shares the height of
  `.wel-show` (`min-height: 12rem`, or `10rem` under `max-height: 700px`).
- **Confirmed: the bars are gone at 320/32.** Row columns
  `8px 96px 26.8438px 41.5938px`, track 26.8px, cells 0 to 0.78px wide.
- **With #198 applied it is worse.** #198 (in flight, branch
  `issue-198-welcome-names`) adds, inside the
  `@media (max-width: 19em)` block, `#welPanePlan { --nmw: min(4.2rem, 37vw); }`
  and `.wel-row { column-gap: .15rem; }`. Measured with those two lines:
  columns `8px 118.391px 23.625px 41.5938px`, track 23.6px, cells 0 to 0.13px.
- **It is not only 320px.** Every big-text cell loses its bars, not only the
  one the issue names (`main`, then with #198):

  | Cell | Track | Cell width |
  | --- | --- | --- |
  | 320px / 32px | 26.8px (23.6px) | 0 - 0.78px (0 - 0.13px) |
  | 360px / 32px | 49.6px (43.6px) | 1.45 - 4.47px (0.70 - 3.70px) |
  | 390px / 32px | 66.8px (68.5px) | 3.59 - 6.59px (3.81 - 6.83px) |
  | 390px / 24px | 131.6px (146.0px) | 11.70 - 14.72px (13.50 - 16.52px) |
  | 390px / 16px | 214.4px | 22.06 - 25.06px (media query off) |

- **Confirmed: the #179 check cannot see it.** `node scripts/smoke.mjs
  --no-tests --only "no cut-off text at 320px/32px text"` passes on `main`
  ("42 states, 4668 elements scanned ... nothing clipped"). The cells hold no
  text, so there is nothing for it to cut off.
- **Confirmed: the same rows sit behind first-run step 1.** "first-run step
  1, 12 names + a repeat" opens `#firstRunFlow` over the welcome screen; the
  rows under it are the same elements. One fix covers both.
- **The name line is taller than today's row already.** At 32px text the
  name's line box is 39px (26px footnote x 1.5) inside a 28.4px (568px tall
  screen) or 34.8px (844px) grid row. It does not show today because nothing
  sits below it in the row. A stacked row puts the track there, so the row
  height has to be set on purpose (see Design).
- **The issue's "likely fix" works.** Stacking at the 19em block gives
  cells of 21 - 24px at 320/32, and nothing else broke in the probe (no name
  cut off, no sideways pan). Screenshots of the "On paper" and "On screen"
  tabs in the taller box looked right: both fill it and pan as before.
- **No prototype mockup.** `notes/mockups/prototype/README.md` leaves first
  run out on purpose (same finding as #198's spec), so there is no PNG to
  match. The 390px/16px demo is the look to keep.
- **The design rule agrees.** `docs/interface-guidelines.md` T2: "Lay out for
  200%: rows grow and side-by-side pieces stack."

## What would settle it

All measured at 320px wide, 32px root text, DejaVu Sans (smoke's font),
on the welcome screen of a first run (the "welcome screen, first run" state):

1. **Every stint cell is at least 12px wide and visible.** Each of the 72
   `#welRows .wel-c` (9 rows x 8) has a width of 12px or more and a height
   over 0. With the design below they measure 21 - 24px.
2. **Each row is stacked and fits its own space.** In every `.wel-row`, the
   track's top is at or below the name's bottom (they do not overlap), and
   the track's bottom is at or above the row's own bottom (the bar does not
   run into the next row). The last row's track ends inside `.wel-show`,
   which clips.
3. **Names and minutes stay whole.** Every `.wel-nm` shows its whole name
   (the clip check stays green with no new entry). "Harper" (101px) sits in a
   name column of at least 116px (101px + 15%); the design gives 139px. Each
   `.wel-min` ("16", "20") is on the name's line.
4. **The demo box fits a short screen.** At 320 x 568 the `.wel-show` box is
   no taller than the viewport (the design gives 545px), so a coach can
   scroll it fully into view.
5. **Nothing changes at 390px and 16px text.** `.wel-row`'s computed columns
   stay `8px 67.1875px 214.438px 25.5938px`, cells stay 22.06 - 25.06px, and
   `.wel-show` stays 221px tall at 390 x 844.
6. **No new sideways pan or stranded element.** "app shell at 320px/32px
   text" and "no cut-off text at 320px/32px text" stay green.
7. **A guard fails without the fix.** The new check below fails on `main`
   (and on #198's tree) naming a cell under 12px, and passes with the fix.
8. Full `npm test` and `npm run smoke -- --no-tests` pass.

## Surfaces

Change:

- `app/app.css`: the existing `@media (max-width: 19em)` block
  (`app/app.css:3376`), next to `.wel-qs { display: none; }`. If #198 has
  merged, its two lines there (`#welPanePlan { --nmw: ... }` and
  `.wel-row { column-gap: .15rem; }`) are **replaced** by this change (see
  Design). If #198 has not merged, rebase onto it first; do not build on a
  tree without it.
- `app/sw.js`: `VERSION` and `SHELL`, by `npm run sw:bump` (`app.css` is
  precached).
- `scripts/smoke/welcome-bars.mjs` (new): the guard's probe and its
  `welcomeBarsProblem(c)` helper.
- `scripts/smoke/app-large-text.mjs`: one import and one line in
  `appLargeTextPass`'s loop that calls the helper for the "welcome screen,
  first run" state, the same shape as the `ROW_STACK_STATES` /
  `rowStackProblem` line already there (`app-large-text.mjs:733`).
- `docs/specs/199-welcome-stint-bars.md`: this spec.

Must not change: `app/onboarding.js` (markup and classes stay as they are),
the base `.wel-row`, `.wel-track`, `.wel-rows`, `.wel-show` and
`#welPanePlan` rules outside the 19em block, `.wel-nm`'s font size,
`CLIP_SWEEP_KNOWN_ISSUES` and `APP_LARGE_TEXT_ALLOW`, and the smoke registry
(no new row: the guard rides an existing one).

## Constraints

- **Mobile first.** 390px/16px is unchanged (item 5). All new CSS lives in
  the 19em block, which cannot match at a 16px root on any phone (19em =
  304px there).
- **Big text is fixed in the 19em block**, where this screen's other big-text
  fixes already live (`.wel-go`, `.wel-cap`, `.wel-qs`, `.wel-in`, `.wel-h`).
  Note: the block matches at any root of about 20.6px or more on a 390px
  phone, so 390/24 and 390/32 stack too. That is wanted: the bars are too
  thin there as well (table above).
- **T2** (lay out for 200%: side-by-side pieces stack) is the rule this
  applies. **T3/T4**: the name and minutes stay footnote size. They get more
  room, not smaller text.
- **Do not excuse it instead.** No allow-list or known-issues entry; the
  bars have to be visible.
- **Measured in CI's font.** Smoke draws in DejaVu Sans on a Mac too (#177).
  The 15% name margin in item 3 is AGENTS.md's.
- **Reuse, do not re-derive.** The `.wel-show` height is derived from the
  row's own parts in one `calc()` with a comment naming each term (the way
  `.wel-qs`'s margin is "derived from the row, never guessed"). The guard
  reads cell and row boxes from the page; it does not hard-code the row
  count (it asserts it found at least one row and eight cells per row, so a
  selector that stops matching fails rather than passing on nothing, per
  `/new-guard` rule 2a).
- **`/new-guard`** owns the new check: write it, watch it fail on the
  unfixed tree for the right reason (a cell under 12px), then pass.
- **Precache bump:** `npm run sw:bump` in the same commit as the CSS.
- **`.wel-show` is `overflow: hidden`.** Anything that does not fit is cut
  off silently, which is why item 2 checks the last track against it.
- **Overlap with siblings.** #198 edits these exact rows (handled above).
  #187 - #191 and #195 - #197 also add to the 19em block, so expect a textual
  merge conflict there, not a behavioral one: none of them touches `.wel-*`.

## Design

Inside `@media (max-width: 19em)`, replacing #198's two lines:

```css
/* #199: side by side, the stint track got what was left after the name and
   the minutes -- 23.6px at 320px/32px text, holding 23px of fixed gaps, so
   each cell was under a pixel. Stacked, the track runs the full row width
   (cells 21-24px at 320px) and the name gets the whole top line (#198's
   wider --nmw is no longer needed: the name is 1fr now). */
.wel-row { grid-template-columns: 8px minmax(0, 1fr) auto;
  grid-template-areas: "dot nm min" "track track track";
  column-gap: .35rem; row-gap: 3px; line-height: 1.2; }
.wel-dot { grid-area: dot; }
.wel-nm { grid-area: nm; }
.wel-min { grid-area: min; }
.wel-track { grid-area: track; }
/* A little space between players, so each bar reads with the name above it
   and not the one below. */
.wel-rows { row-gap: .2rem; }
/* The box has to hold ten stacked rows (the grid is repeat(10), one spare),
   because .wel-show clips. Derived from the row, never guessed: each row is
   a 1.2 line of footnote text + the 3px row gap + the 11px track; then nine
   .2rem gaps between rows, the pane's .55rem + .5rem padding, and the 1px
   border top and bottom. */
.wel-show { min-height: calc(10 * (var(--fs-footnote) * 1.2 + 3px + 11px)
  + 9 * .2rem + 1.05rem + 2px); }
```

Why each piece:

- **`line-height: 1.2`.** At 1.5 the name line is 39px and ten rows would
  need a 600px+ box. 1.2 is 31.2px, still taller than DejaVu Sans's own
  glyph height at 26px, and "Maya", "Jonah" and "Ruby" showed their
  descenders whole in the screenshot.
- **`.wel-show` height.** It sits after the `max-height: 700px` block in
  the file, so it wins over that block's `10rem`. `.wel-qs` stays hidden, so
  it adds nothing.
- **Drop #198's `--nmw`.** With the name in a `1fr` column, `--nmw` is used
  only by `.wel-qs`'s margin, and `.wel-qs` is `display: none` here. A rule
  nothing reads is deleted, not left behind. `column-gap` goes back to the
  base `.35rem` (set explicitly above so #198's `.15rem` is gone).

Measured with this CSS injected (DejaVu Sans):

| Cell | Columns | Cells | Row | `.wel-show` | Page height |
| --- | --- | --- | --- | --- | --- |
| 320 x 568 / 32px | `8px 139.438px 36.1875px` | 21 - 24px | 45.2px | 545px | 2458px (was 2233) |
| 360 x 780 / 32px | `8px 179.438px 36.1875px` | 26 - 29px | 45.2px | 545px | 2460px |
| 390 x 844 / 24px | `8px 252.078px 27.1406px` | 33.25 - 36.25px | 37.4px | 444px | 1658px (was 1502) |
| 390 x 844 / 16px | unchanged | 22.06 - 25.06px | 17.9px | 221px | 844px |

In every big-text cell the track ended exactly at its row's bottom (0px
spare), the name and track did not overlap, the last track ended 55 - 69px
above `.wel-show`'s bottom (the spare tenth row), and no name was cut off.
The page is about 225px taller at 320/32. It already scrolled (2233px on a
568px screen), so this adds scrolling, not a new problem.

**Rejected: raising `.wel-show` to a round number (15rem, 17rem).** Tried.
At 15rem each row was 44.4px against the 52px a 1.5-line name plus track
needs, so the track ran 7.6px into the next row. A round number also breaks
at 24px text, where rem and px scale differently. Deriving it from the row is
what keeps both sizes right.

**Rejected: no space between players.** Tried (`row-gap` 0 on `.wel-rows`).
Each bar sat as close to the next name as to its own, so the pairs were hard
to read. `.35rem` read best but made the box 588px, taller than a 568px
screen. `.2rem` fits (545px) and still reads as pairs.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| New guard `welcomeBarsProblem` on "welcome screen, first run": at least one `.wel-row`; 8 `.wel-c` per row; every cell width >= 12px and height > 0; per row, track top >= name bottom - 0.5px and track bottom <= row bottom + 0.5px; last track bottom <= `.wel-show` bottom | `node scripts/smoke.mjs --no-tests --only "app shell at 320px/32px text"` | 1, 2, 6 |
| The guard bites | the same row on the tree before the CSS change: must fail naming a cell under 12px (expect about 0.13px with #198, 0.78px without) | 7 |
| Clip check still green, no new entry | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"` | 3, 6 |
| Look and the unchanged 390/16 | `/browser-verify`: computed `.wel-row` columns, cell widths and `.wel-show` height at 390 x 844 / 16px and 320 x 568 / 32px, and a screenshot of the plan demo at both, plus 390 x 844 / 24px (DejaVu Sans forced, as smoke does) | 3, 4, 5 |
| The proof pair | `npm test` then `npm run smoke -- --no-tests` | 8 |

The guard is a check that judges the tree, so it is built under
`/new-guard`, not `/tdd`. It lives in its own module because
`app-large-text.mjs` is already 47 KB.

## Out of scope

- The spare tenth grid row (`repeat(10)` for 9 demo players). It is there at
  every size today.
- Bringing the Q1 - Q4 labels (`.wel-qs`) back at big text. The track is wide
  enough now, but their margin assumes the side-by-side row. A separate
  issue if wanted.
- Any change at 16px text, the "On paper" and "On screen" tabs, and the
  bench-mode names (#191, #197).
