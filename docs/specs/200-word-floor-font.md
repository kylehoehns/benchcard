# #200 — The word-width floor measures in the element's own font

## Issue

#200. Smoke's "narrowest a word can fit" measurement (`WORD_FLOOR_FN` in
`scripts/smoke/dom.mjs`) should measure each word in the font the element
actually draws in, not a fallback.

## Goal

When a smoke check says a name is squeezed narrower than its longest word, the
numbers in that message are the real ones, and a squeezed name cannot slip
through because its longest word was measured too small. No coach sees this
change; it makes three existing checks honest.

## What the survey found

Surveyed on `4ed4d19` (worktree `issue-200-word-floor-font`), smoke drawing
in DejaVu Sans as in CI. Probe scripts are in the orchestrator's scratchpad
(`repro200.mjs`, `mut.mjs`, `armB.mjs`).

- **Confirmed: the `font` shorthand comes back empty.** `WORD_FLOOR_FN` sets
  `span.style.font = getComputedStyle(nm).font` (`dom.mjs:333`). Chrome
  returns `""` for that shorthand when a longhand it cannot express is not at
  its initial value. `body` sets two such longhands (`app/app.css:34-36`):
  `font-feature-settings: 'cv11' 1, 'ss03' 1` and `font-variant-numeric:
  tabular-nums`. Each one alone empties the shorthand (checked on a scratch
  `div`). Both inherit, so **every element in the app** has `font === ""`,
  not only bench rows: 0 of 51 visible text elements on Today at 320px/32px.
- **Corrected: it is a hidden `<span>`, not a canvas.** The span is appended
  to `body`, so with no `font` set it inherits `body`'s font: the right family
  (DejaVu Sans) but `--fs-body` at weight 400. Letter spacing is copied
  separately and is right. So a weight-400 bench row is a little off and a
  22px/600 floor row is far off.
- **Measured, 320px wide, 32px root text, RICH, bench mode open:**

  | Word | Row | Drawn (Range) | Floor today | Longhands |
  | --- | --- | --- | --- | --- |
  | Lindqvist | `.gm-b .nm`, 34px/400 | 145.8px | 136.7px | 145.8px |
  | Brooks | `.gm-p .nm`, 44px/600 | 164.3px | 101.9px (as "longest") | 164.3px |
  | Reyes | `.gm-p .nm`, 44px/600 | 142.7px | 90.1px | 142.7px |

  The issue's 134px / 218px pair is the same defect in a state where Casey
  Lindqvist is on the floor (a 600-weight row): the clip sweep's "swap toast"
  state measures that word at 218.1px once fixed.
- **Falsified: "never toward a false pass".** That holds for the clip sweep's
  split allowance (`clip-sweep.mjs:389-391`): a word measured too small is
  never excused, so a split is over-reported. It does **not** hold for the
  floor assertions in `bench-look.mjs` (`runLargeText`) and `season-look.mjs`
  (`seasonFiledSqueezePass`), which fail when `width + 1 < floor`. A floor
  measured too small lets a squeezed name pass. Shown by mutation: with
  `.gm-p .nm { max-width: 130px !important; flex: 0 1 130px !important }`
  injected at 320px/32px, today's probe reports 0 of 11 rows failing; the
  longhand version reports 3 (Ana Reyes 130 < 142.7, Nia Brooks 130 < 164.3,
  Riley Novak 130 < 149).
- **The fix changes no verdict on today's tree.** With the longhand copy
  swapped in (scratch copy, not committed), all three callers pass:
  `bench mode matches the prototype`, `season: one list style, prototype row
  sizes`, and `no cut-off text at 320px/32px text` (42 states, 4668
  elements, every `CLIP_SWEEP_KNOWN_ISSUES` entry still matched, none stale).
- **Found along the way: the clip sweep's own floor check has never
  measured anything.** `clip-sweep.mjs:312` only feeds an element to its
  floor check when `cs.font !== ''`. Because every element's shorthand is
  empty, that list is always empty, so `floorFails` has been `[]` on every
  run since #192. Its comment (`clip-sweep.mjs:294-299`) blames "some
  `font-size: var(...)` declarations"; the real cause is `body`'s two
  properties above. Dropping that filter after the fix reports 150 problems
  (about 40 distinct) across Today, the team menu, bench mode, the help sheet,
  the color picker, who's-here, the plan sheet, Season, add-a-game, welcome
  and the confirm dialog. Some overlap filed issues (#188, #189, #191, #197);
  some need a look before anyone calls them real (Today's "Hawks" is 184px
  against a 241.1px floor). **Out of scope here** (see below): it becomes its
  own issue.

## What would settle it

1. `WORD_FLOOR_FN` never reads `getComputedStyle(...).font`. It copies the
   element's own computed longhands onto the measuring span. At least:
   `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `fontStretch`,
   `fontVariant`, `fontFeatureSettings`, `fontVariationSettings`,
   `fontKerning`, `letterSpacing`, `textTransform`. The list is one named
   constant in `dom.mjs`.
2. **Lindqvist within 1px.** In the smoke row `bench mode matches the
   prototype`, at 320px wide and 32px root text, the row for "Casey
   Lindqvist" reports its longest word as `Lindqvist`, and its measured width
   is within 1px of that word's drawn width. Drawn width is the width of a
   `Range` over "Lindqvist" inside that row's own text node, and that range
   must be one line (one client rect). Expected today: about 145.8px both.
3. **The assertion in item 2 can fail.** Its failure message names both
   numbers. It fails, rather than passing quietly, when no "Casey Lindqvist"
   row was measured, or when the word is drawn on more than one line.
4. **The floor assertion can now catch a squeeze it used to miss.** With the
   130px mutation above injected into bench mode at 320px/32px, `bench mode
   matches the prototype` fails naming Ana Reyes, Nia Brooks and Riley Novak.
   The same mutation against today's `dom.mjs` passes (recorded above). This
   is a falsification arm, run by hand, not committed.
5. These three rows pass on the finished tree:
   `node scripts/smoke.mjs --no-tests --only "bench mode matches the prototype"`,
   `--only "season: one list style, prototype row sizes"`,
   `--only "no cut-off text at 320px/32px text"`.
6. `npm test` and `npm run smoke -- --no-tests` pass.

## Surfaces

Change:

- `scripts/smoke/dom.mjs`: `WORD_FLOOR_FN` copies the longhands (item 1),
  and each row it returns also carries `longestWord` (the word string whose
  width is `longest`). Its header comment stops describing the shorthand.
- `scripts/smoke/bench-look.mjs`: `NAME_WORD_PROBE` also returns the drawn
  width and line count of the "Casey Lindqvist" row's `longestWord`;
  `runLargeText` asserts item 2 and item 3. The comment above
  `NAME_WORD_PROBE` that says the span "copies the real element's `font`
  shorthand" is corrected.

Must not change:

- Anything under `app/`. No `VERSION`/`SHELL` bump.
- `scripts/smoke/clip-sweep.mjs`, including the `cs.font !== ''` filter and
  `CLIP_SWEEP_KNOWN_ISSUES`. Eight sibling fixes (#187-#191, #195-#198) are
  editing that file's known-issue list; this change stays out of it.
- `scripts/smoke/season-look.mjs`: it picks up the fix through
  `WORD_FLOOR_FN` with no edit.
- Any threshold (the `+ 1` / `- 1` tolerances), fixture or allow list.

## Constraints

This edits a guard: `WORD_FLOOR_FN` is shared by three smoke checks. So it is
built and proved under **`/new-guard`**, and these apply:

- **Green first** (`/new-guard` step 1). Before editing, run the three rows in
  item 5 on the untouched tree and record that they pass.
- **Then make it go red on purpose** (step 2), twice:
  - The new Lindqvist assertion: write it first, against today's `dom.mjs`.
    It must fail with about 136.7px measured against 145.8px drawn. That is
    its red. Then fix `dom.mjs` and watch it pass.
  - The floor assertion: item 4's mutation. Record it green on the old
    `dom.mjs`, red on the new one.
  - One more for item 1's list: drop `fontWeight` (or `fontSize`) from the
    constant and confirm item 2 goes red. Restore.
- **A check that measured nothing fails** (step 2a). Item 3: no Lindqvist row,
  or a Lindqvist word on two lines, is a failure, not a skip.
- **Prove each mutation landed** (step 4). Read the value back through the
  probe after injecting (for the CSS mutation: the three rows' `width` is
  130). A mutation the probe never sees proves nothing.
- **Judge by exit code** (step 5), and read the printed row, not a parsed
  count.
- **Restore by reading back, never `git checkout <file>`** (step 6): that
  reverts to HEAD and deletes the uncommitted fix. Snapshot after the fix and
  read back a token from it (the longhand constant's name) after every
  restore.
- **Name the states** (the "one state" trap). The measurement has to hold for
  a 400-weight bench row and a 600-weight floor row (both in bench mode at
  320px/32px), and for Season's `.sn-gt` / `.sn-nm` (item 5). Nothing here
  covers a `text-transform: uppercase` element outside the clip sweep, which
  does not run its floor half today; say so in the handoff rather than
  claiming it.
- **Reuse, do not re-derive.** The measuring stays inside `WORD_FLOOR_FN`.
  Do not add a second word-measuring helper in `bench-look.mjs`; the drawn
  width there is a `Range` read of the existing row, nothing more.
  `LARGE_TEXT_WIDTH`, `LARGE_TEXT_PX` come from `sizes.mjs`;
  `goRichWithLongName` is the fixture (it keeps Casey Lindqvist, p8).
- Failure messages say what to do: item 2's names `WORD_FLOOR_FN`'s longhand
  list in `dom.mjs` as the place to look.
- AGENTS.md: smoke draws text in DejaVu Sans on a Mac and in CI, so the
  numbers above are CI's numbers too. `test/smoke-size.test.js` caps each file
  under `scripts/smoke/` at 55,000 bytes; `bench-look.mjs` is 36,535 today.
- AGENTS.md § the proof pair: iterate with `--only` on the three rows in item
  5; the full pair runs once, at commit, by whoever commits.
- `/browser-verify`: `getClientRects().length` is not a visibility test. Here
  it only counts lines of a range already known to be visible (the row is
  from `wordFloorRows`, which checks `checkVisibility` first).

## Design

In `dom.mjs`, next to `WORD_FLOOR_FN`:

```text
WORD_FONT_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'fontStretch', 'fontVariant', 'fontFeatureSettings',
  'fontVariationSettings', 'fontKerning', 'letterSpacing', 'textTransform']
```

interpolated into the page script, and the span setup becomes "for each prop,
`span.style[prop] = cs[prop]`". Each returned row gains `longestWord`
(`words[widths.indexOf(longest)]`). Nothing else in the function changes.

In `bench-look.mjs`, `NAME_WORD_PROBE` finds the `.nm` whose text is "Casey
Lindqvist", builds a `Range` over its `longestWord` in its direct text node,
and returns `{ drawn, lines }` for it alongside `rows`. `runLargeText` then
checks: the row exists; `longestWord === 'Lindqvist'`; `lines === 1`;
`Math.abs(longest - drawn) <= 1`. Otherwise a problem like
`320px/32px text: "Lindqvist" measured 136.7px but draws 145.8px -- the word
floor is not using the row's own font (WORD_FONT_PROPS in dom.mjs)`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Lindqvist calibration in `runLargeText` | `node scripts/smoke.mjs --no-tests --only "bench mode matches the prototype"` | 1, 2, 3 |
| 130px squeeze mutation, by hand | same row, with the CSS injected in a scratch edit of `runLargeText` or via the page, then restored | 4 |
| Longhand-list mutation, by hand | same row, with one prop dropped, then restored | 1, 3 |
| The other two callers | `--only "season: one list style, prototype row sizes"`, `--only "no cut-off text at 320px/32px text"` | 5 |
| Proof pair | `npm test`, `npm run smoke -- --no-tests` | 6 |

The calibration is a guard (it judges the tree's measuring code), so it is
built under `/new-guard`, not `/tdd`.

## Out of scope

- **Turning on the clip sweep's floor check.** It has measured zero elements
  since #192 because of the `cs.font !== ''` filter. Removing the filter
  surfaces about 40 distinct findings, several already filed and some that
  need investigation. That is #204, not this one.
- Any fix to the names or labels those findings point at.
- `AGENTS.md` says files under `scripts/smoke/` may not pass 40,000 bytes;
  `test/smoke-size.test.js` says 55,000. That drift is #203.

## Overlap with in-flight work

- **#197** (bench mode splits short names mid-word) and **#191** (long
  one-word names): the clip sweep excuses a split when `longest >
  rowContent + 1`, using this function. After this change, `longest` is
  larger for 600-weight rows, so a split of a word truly wider than its row
  is excused where today it is flagged. On today's tree this changed nothing
  (every known-issue entry still matched). A sibling branch that rebases onto
  this should re-run `--only "no cut-off text at 320px/32px text"`: an entry
  that stops matching shows up as stale and fails there.
- No other overlap: this change does not touch `app/app.css` or
  `clip-sweep.mjs`.
