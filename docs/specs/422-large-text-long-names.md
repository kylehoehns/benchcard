# 422 — Large text and long names: timeline, sheet header, Today rows, Season bars

## Issue

#422: six layout problems with long names, decimal minutes or large text, each
a CSS fix — the timeline's names and totals, the player sheet's close button,
Today's Team/Season subtitles, the team switcher, and Season's minute bars.

## Goal

A coach with long names on the roster, or with the largest text setting, can
read every name the timeline has room for, sees totals that line up, can
always close the player sheet, can read Today's Team and Season lines and the
team's own name, and can compare two players' season minutes by bar length.

## Survey (measured on 469fd14, smoke font, local server)

Measured with the harness's own `land` (DejaVu Sans forced, reduced motion),
RICH with the players renamed to real-length names ("Alexandria
Montgomery-Okafor", "Bartholomew Christopherson", "Maximiliano Fitzgerald",
...) and the team named "Northside Thunder Gold"; a second record keeps nine of
those players at "3× a period" (`granMode: 'perPeriod', granValue: 3`), which
gives decimal totals (18.7) and an uneven plan (three FEWEST rows). Script:
`survey422.mjs` in the lane's scratchpad (not committed).

The timeline is the **stacked** layout (`.tl-row` `1fr auto`, name above
track) at 320/16, 320/32 and 390/32, and the **one-row** layout
(`@container (min-width: 20em)`) at 390/16.

1. **Timeline names.** The issue's cause (`--tot: 5.2rem` reserved on every
   stacked row) does not hold: the stacked grid is `1fr auto` per row and
   never reads `--tot`. The reserve is real, by two other routes:
   - 320/16, uneven: the empty `.ex` is an `inline-block` 3.2rem wide on
     *every* row, so "Alexandria Montgomery-Okafor" gets 156px (214px in an
     even plan) and is cut.
   - 320/32, uneven: the 19em block moves the word under the number
     (`display: block; width: auto`), so on a FEWEST row the auto column is
     the width of "FEWEST" and the name gets **43px** ("B…", "D…"); other rows
     get 109px.
   - 320/32, even (no word at all): every name gets 136px and every one is cut,
     "Devon Ellis" included, because the name is `nowrap` + ellipsis. So moving
     the word alone cannot make short names whole at this cell; the name has
     to wrap.
2. **Totals ragged.** 390/16, uneven: the "18.7" rows' number ends at x 367
   and sits 2px from the row top; the "16 FEWEST" rows' number ends at 311,
   10px from the top. Number (≈29px) + `.ex` margin and width (3.5rem, 56px)
   is wider than `--tot` (5.2rem, 83px), so the empty `.ex` wraps to a second
   line and the number slides right. Holds.
3. **Player sheet ✕.** "Bartholomew Christopherson": at 320/32 the ✕ is at
   x 377–425 (viewport 320), at 390/32 also 377–425 (viewport 390). The title's
   auto column takes the title's own width (284px) in a 262px row. At 16px it
   fits (✕ 258–306 and 328–376). Holds. The longest word alone,
   "Christopherson", is wider than a third of the row at 32px, so a title
   squeezed into the middle column would break into four pieces.
4. **Today subtitles.** 320/32: Team's "Northside Thunder Gold · 11 players"
   is 28px wide, Season's "3 games filed" 38px; 390/32: 98px and 63px. At
   16px the Team line is cut too (174px at 320, 244px at 390) with this team
   name. Holds. Add a game has **no** `.today-entry-sub` (falsified): the
   clip-sweep allow entry's reason names a subtitle that does not exist, and
   the rule it excuses is Team's and Season's.
5. **Team switcher.** 320/32: `#teamBtnLabel` is 158px wide for a 918px name
   and shows "N…". The heading is `--fs-large` (68px at a 32px root). Holds.
6. **Season bars.** 320/32: whole-number rows get a 140px track, decimal rows
   115px; 390/32: 210px and 185px. 16px is even (45px and 115px). Holds.

## Decisions the issue left open (closest to its intent)

- **Timeline, stacked layout:** the word moves onto its own line under the
  name (not under the number), and an empty word takes no space; and the name
  **wraps** instead of ending in "…", since the timeline prefers the full
  name. A single word wider than the whole name column still breaks inside
  the word (`overflow-wrap`), the same thing the player sheet's identity block
  already does at this size. The one-row layout keeps its one-line ellipsis:
  its fixed row pitch is what fits nine rows at 390×844 (spec #72).
- **Player sheet:** the title takes its own full-width row under the ✕ when
  the header is narrow (the `@container (max-width: 16em)` rule Add a rule and
  Overtime already use), and can always shrink and break a long word, so the ✕
  stays on screen at any width or name.
- **Team switcher:** both of the issue's options. In the 19em block the
  heading steps down to `--fs-headline` and the label wraps to at most two
  lines, ending in "…" after the second. Built first at `--fs-sentence`, the
  look check showed "Nort…" / "Thu…": at 50px no word of "Northside Thunder
  Gold" fits the ~170px label, so the sentence step fixed nothing. The issue
  allows dropping the heading size; headline is a step on the scale (not a
  `vw` cap) and the one #187 chose for a card title for the same reason. At
  16px the one-line ellipsis stays: the issue calls it deliberate.
- **Timeline, 19em block (found in the look check):** with the number beside
  the name, the name column at 320/32 was ~120px and "Alexandria" broke as
  "Alexan" / "dria". In the 19em block the name takes the whole row and the
  number moves down to the word's line, at the right edge, just above its
  bar. Every total then sits at one offset above its own bar.
- **Today subtitles:** the subtitle moves to its own line under "Team" /
  "Season" when it does not fit beside it, and wraps there; the chevron stays
  at the right edge of the row.
- **Season bars:** one fixed minutes column (the base rule's own `3rem`) in
  the 19em block instead of `auto`.

## What would settle it

Cells: **320×568 and 390×844, each at 16px and 32px text**; reduced motion;
the survey's long-name record (team "Northside Thunder Gold") and its nine-
player "3× a period" record.

1. **Timeline names (stacked layout: 320/16, 320/32, 390/32).** In both
   records: no `.tl-lab .nm` ends in an ellipsis (`scrollWidth ≤ clientWidth
   + 1`), and every name's text is whole (its rendered text equals the
   player's name). A name's column width does not depend on whether its row
   carries MOST/FEWEST: in the uneven record, the `.nm` widths of a FEWEST row
   and a plain row with the same total digit count are equal within 1px. The
   word still shows on every extreme row (non-empty, visible, height > 0).
2. **Totals (one-row layout: 390/16; and every stacked cell).** In the uneven
   decimal record, every row's `.num` right edge is equal within 1px, and every
   row's `.num` top offset from its row is equal within 1px (in the 19em
   block's cells, its offset above its own bar). In the one-row layout each
   total is level with its name, and no MOST/FEWEST word overlaps a total or
   runs past its row.
3. **Player sheet.** Opened from Team on "Bartholomew Christopherson", in all
   four cells: `#sheetPlayerClose` lies wholly inside the viewport and is
   ≥ 48 × 48; the title does not overlap it; the title's right edge is
   inside the sheet.
4. **Today subtitles.** Both `.today-entry-sub` lines are whole
   (`scrollWidth ≤ clientWidth + 1`) in all four cells, and the row's chevron
   is inside the row.
5. **Team switcher.** In all four cells `#teamBtnLabel` has no horizontal
   overflow past the viewport. At 32px text the heading is `--fs-headline`,
   the label is at most two lines, and no word is wider than its line
   (`scrollWidth ≤ clientWidth + 1`). At 16px the label keeps its deliberate
   one-line ellipsis (amended: the whole name does not fit at `--fs-large`
   even at 390, and the issue only asks to fix the 2–3 letter case).
6. **Season bars.** On Season, every `.sn-list .sn-track` has the same width
   within 1px, in all four cells.
7. **Clip sweep.** `CLIP_SWEEP_ALLOW` keeps only entries still deliberate:
   `.today-entry-sub` and `#teamBtnLabel` go if nothing they cover is cut any
   more (the stale-entry rule decides; both went), and `.tl-lab .nm`'s reason
   says what is still excused (the one-row layout's ellipsis and a single
   over-long word: the sweep's "Featherstonehaugh", and at 320/32
   "Christopherson", which is ~15px wider than the whole name row).
8. **Nothing else regresses.** CI's full smoke stays green: `game rows fit`
   (nine rows at 390×844), the app-shell 320/32 pass, the clip sweep, touch
   targets, `bar rows`. `npm test` green.
9. **A smoke check pins 1–6** at the four cells, shown failing on 469fd14's
   `app/` (falsified per `/new-guard`).

## Surfaces

Change:
- `app/app.css` — the timeline (`.tl-row`, `.tl-tot`, `.ex`, `.nm` in the
  stacked layout), the sheet header row (`.bsheet-hd-row` and its 16em
  container rule), `.today-entry`/`.today-entry-sub`, `#teamBtnLabel` and
  `.today-h1` in the 19em block, `.sn-list .sn-row` in the 19em block.
- `scripts/smoke/` — one new check module, its registry entry and README
  index row; `clip-sweep.mjs`'s `CLIP_SWEEP_ALLOW`.
- `test/big-text.test.js` — the source-reading pins of the old timeline word
  rule and the exact `.sn-list .sn-row` rule text change with the rules they
  pin; keep the "the word is never hidden" assertion.

Must not change: `app/timeline.js`'s output (the full name, the `.num`/`.ex`
markup), the four pure modules, `state.js`, `live.js`, the card, `about.html`'s
own timeline CSS.

## Constraints

- Mobile first; touch targets stay ≥ 48px (`.tl-name` keeps its 48px in the
  stacked layout).
- The one-row timeline's pitch (`--row-pitch`, 2.25rem) and nine-rows-fit at
  390×844 are not touched.
- MOST/FEWEST is never hidden: it is what tells a coach who cannot use the
  color which end of the squad a row is at.
- `.tl-tot.hi`/`.lo` color must still reach the number and the word.
- Large-text rules use the existing em queries (`@media (max-width: 19em)`,
  `@container (max-width: 16em)`), never px.
- Reuse, do not re-derive: `land`, `openState`, `CLIP_STATES`,
  `REDUCED_MOTION`, `TOUCH_MIN`, `SETTLE`, `step`, `RICH`, `richWith`,
  `TODAY_LANDING`, `GAMES_VIEW_READY`, the `.barrow` grid and the base `.sn-row`
  `3rem` minutes column, `short-phone.mjs`'s cell/record shape.
- No allow-map number raised, no blanket tolerance, no new `CLIP_SWEEP_ALLOW`
  entry.
- Every file under `scripts/smoke/` stays under `test/smoke-size.test.js`'s
  LIMIT.

## Design

1. **Timeline, stacked layout** (base rules; the one-row `@container` block
   restores its own): `.tl-tot` becomes `display: contents` so `.num` and
   `.ex` are row grid items; the template becomes `"lab num" "ex ex" "trk
   trk"`, `.num` takes the right-hand cell, `.ex` its own line under the name
   (left-aligned), and an empty `.ex` is `display: none` so a plain row is two
   lines as today. `.nm` wraps (`white-space: normal; overflow-wrap:
   break-word`) instead of ellipsis. The 19em block's `.tl-tot .ex` rule goes;
   in its place the template becomes `"lab lab" "ex num" "trk trk"`. The
   one-row block's rules carry `.tl-row` in front, since the stacked rules sit
   later in the file at equal specificity.
2. **Totals, one-row layout:** `.tl-tot` stays one line (`white-space:
   nowrap`) and `--tot` for an uneven plan is wide enough for a four-character
   decimal plus the word gutter, so every number ends at the same x.
3. **Player sheet:** `#sheetPlayer .bsheet-hd-row` joins the 16em container
   rule (title on its own full-width row), and the title column can shrink
   (`minmax(0, …)`/`min-width: 0`) with `overflow-wrap: anywhere` on the
   player title only, so the ✕ column is never pushed out.
4. **Today subtitles:** `.today-entry-sub` wraps (`white-space: normal`, a
   content-sized flex basis) so it drops under the label when it cannot fit
   beside it; the chevron is taken out of the wrapping flow (positioned at the
   row's right edge, row padding reserving its room) so it does not land on a
   line of its own.
5. **Team switcher:** in the 19em block, `.today-h1` takes `--fs-headline`;
   `#teamBtnLabel` wraps, clamped to two lines with an ellipsis.
6. **Season bars:** in the 19em block `.sn-list .sn-row` uses `minmax(0, 1fr)
   3rem`.

## Proof

| Seam | Covers |
| --- | --- |
| New smoke row (`scripts/smoke/long-names.mjs`), four cells, both records | 1–6, 9 |
| `--only clipsweep` (and CI's full smoke) | 7, 8 |
| `npm test` (incl. `test/big-text.test.js` as updated) | 8 |
| `scripts/look.mjs` and `/browser-verify` at 320/390 × 16/32, scrolled to bottom | 1–6 by eye |

Layout and text size are smoke's (AGENTS.md § Test seams); nothing a coach can
do changes, so no Coach scenario is added.

## Out of scope

- The one-row timeline's name ellipsis at 390/16 (its pitch is fixed by #72).
- The identity block's own mid-word break in the player sheet.
- Any other large-text layout. Seen in the look check and left open: the
  Team screen's roster rows break long names mid-word at 320/32, and the plan
  note does too (#455).
