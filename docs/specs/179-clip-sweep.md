# #179 — One smoke check for cut-off text at 320px and 32px text

## Issue

#179. One smoke check should open every screen and sheet at 320px wide with
32px text, with long names, and fail if any text is cut off.

## Goal

A coach who sets a large font size on their phone never sees a name or label
chopped off, squeezed to a sliver, broken mid-word, or hidden under a button —
on any screen, not just the one the last ticket happened to test.

## Decisions

The survey held up the issue's claims, with one correction: an all-screens
sweep at 320/32 already exists (`applargetext`, `scripts/smoke/app-large-text.mjs`,
about 45 states). It only catches things sticking out past the screen edge.
It never checks text against its own box, never checks words, never looks for
text under something else, never scrolls to the bottom, and uses the long name
in one state only. So #179 is a new check over those same states, not a
second list of states.

- **Reuse `APP_LARGE_TEXT_STATES`,** plus `#confirm` (opened as in
  `heading-outline.mjs`), which is the one dialog it lacks. Do not write a
  new list of screens and sheets. `sweep.mjs`'s own `VIEWS` copy stays as is.
- **A new module,** `scripts/smoke/clip-sweep.mjs`, not more code in
  `app-large-text.mjs` (47 KB of a 55 KB per-file limit).
- **"Hidden under something else"** means a point in the middle of a text
  line, inside the viewport, where `elementFromPoint` returns an element that
  is neither the text's element, its descendant, nor its ancestor. Occluders
  that are `position: fixed` or `sticky` are ignored: content scrolling
  under the top bar or action bar is by design.
- **Real bugs on `main` are filed, not fixed here.** The first run found
  four: #187 (Today card team name breaks mid-word), #188 (Team color and
  How it works dialogs too narrow), #189 (Plan sheet's Lineup balance value
  over its label), #190 (pair rule heading off screen with a long name). The second run added
  #191 (a very long one-word name cut off on the roster and in the plan's
  info box).
  The maintainer chose to ship the check with a **known issues** list: one
  entry per problem, each naming its issue and a reason. The check fails on
  any problem not on the list, and on a list entry that no longer happens
  (so fixing #187 forces its entry out). Each bug is fixed later in its own
  PR. No `app/` change in this PR.
- **The check's own false alarms are fixed first.** Seen on the first run:
  - `p#sentence` (271px in 256px): the phrase buttons' negative margin, not
    cut-off text. Measure overflow from the rendered text's `Range` rects
    against the element's box, not `scrollWidth` alone.
  - "Even out earlier games" 93px in a 66px box on add-a-game step 3: the
    text wraps and is fully visible. Text that wraps inside its box is not
    overflow.
  - "Featherstonehaugh" splitting in bench mode, Who's here and the season
    list: a single word wider than the widest its row can ever be may
    split. Same rule as `WORD_FLOOR_FN`'s floor, not a new one.
- **What "cut off" means, settled after the second run:**
  - Text that escapes its own box is cut off when it passes the nearest
    ancestor that hides overflow, **including a scroll container**. A sheet
    or dialog that scrolls up and down (`overflow: auto`) still hides what
    sticks out sideways. The only exceptions are the few boxes built to
    scroll sideways (the stint-by-stint table). Those are a short named
    list, and like the allow list, an entry that no longer applies fails.
  - Text drawn outside its own box on top of another element's text is a
    problem even if nothing clips it (#189: "Steady" over "Lineup balance").
    Text that spills into empty space and stays fully visible is not.
  - An element on the allow list (meant to end in "…") is not a clip, even
    though a `Range` over its text measures the hidden part.

## What would settle it

1. The row exists, is `--only`-selectable, and passes on `main` with only
   the known issues list's entries excused; every entry is seen on the run.
2. For each state, at 320px viewport and 32px root text, with a roster where
   one player is `LONG_NAME` (`fixtures.mjs`) and one is long enough to
   force a squeeze: scrolled to the top, and then to the bottom of the
   page and of any open sheet's scroller, it fails on any visible text
   element that:
   - has `scrollWidth > clientWidth + 1` while its computed `overflow-x` is
     not `auto`/`scroll` (text wider than its box), unless on the allow list;
   - is narrower than its longest word (`WORD_FLOOR_FN`'s floor);
   - has a word that splits across two lines (per-word `Range` rects, the
     technique in `row-stack.mjs`), except after a hyphen;
   - is hidden under something else, as defined above.
   Screen-reader-only boxes (`IS_SR_ONLY_RECT`) are skipped.
3. Two named exports, each entry with a reason of at least a few words and
   stale entries failing the check: the **allow list** (meant to end in
   "…") and the **known issues list** (each entry also names an open issue
   number, one of #187–#191). The allow list is a named export, one entry per selector, each with a
   reason of at least a few words. It holds only elements that are meant to
   end in "…". The survey found about 15 such rules in `app/app.css`; each
   one that needs an entry gets one, and no entry exists that the run does
   not need (a stale entry fails the check).
4. **Put two old bugs back:** a test fails the check with each of these
   reverted in the page (injected CSS is fine), and passes without:
   - #138: remove the 320/32 bench-row stacking
     (`.gm-p, .gm-b { display: grid; grid-template-columns: 1fr; }` in the
     `max-width:19em` block) — names break one letter per line.
   - #144: restore `.sn-game > summary { display: flex; flex-wrap: wrap; }`
     and drop `.sn-game > summary .sn-gt { grid-column: 1 / -1; }` — filed
     game titles squeezed to a few pixels.
   A third, #143 (Who's here row padding back to `.5rem`, name breaks
   mid-word), is added if it fails the check; if it does not, say why.
5. `node scripts/smoke.mjs --only clipsweep` finishes the check in under 60 s
   on this machine (report the time printed by `time`).
6. Full `npm test` and the smoke suite pass.

## Surfaces

Change: `scripts/smoke/clip-sweep.mjs` (new), `scripts/smoke/registry.mjs`
(one row), `scripts/smoke/sizes.mjs` (the row name), `scripts/smoke/row-stack.mjs`
(export `WORD_RECTS_FN` so it is shared, not copied), `test/` as the smoke
registry tests require, No `app/` file changes, so no `VERSION`/`SHELL` bump.

Must not change: `APP_LARGE_TEXT_STATES`' behavior in `applargetext`, any
existing check's verdicts, the budgets.

## Constraints

- **Reuse, do not re-derive:** `APP_LARGE_TEXT_STATES` and how
  `app-large-text.mjs` opens/closes them; `WORD_FLOOR_FN`, `IS_SR_ONLY_RECT`,
  `evalIn`, `setWidth` from `dom.mjs`; `LARGE_TEXT_PX`/`LARGE_TEXT_WIDTH`
  from `sizes.mjs`; `LONG_NAME` and `goRich`/`reloadWithRecord` from
  `fixtures.mjs`; the per-word technique from `row-stack.mjs` (export it).
- Set 32px text and 320px the way `app-large-text.mjs:677-681` does, reload
  once, and restore 16px/`WIDTH` in a `finally`.
- AGENTS.md: no blanket pixel tolerance; CI's Linux fonts render wider than
  macOS, so a measurement that passes by less than about 15% here will fail
  there. The `+ 1` in item 2 is for sub-pixel rounding only.
- Every exported `...Pass` is the `run` of exactly one row
  (`test/smoke-registry.test.js`). Files stay under 55,000 bytes.

## Design

`clipSweepPass(c, origin)`: set 320/32, load the rich fixture with a player
renamed to `LONG_NAME` (the pattern in `row-stack.mjs`'s
`ROW_STACK_LONG_NAME_STATE`), then for each state: open it, run one in-page
probe at the top, scroll the page and the open sheet's scroll container to
the bottom, run it again, close it. The probe returns every problem (not just
the worst), each with the state, scroll position, a selector-ish path, the
text, and the numbers. The pass fails with the first few problems listed.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| `clipsweep` row on `main` | `node scripts/smoke.mjs --only clipsweep` | 1, 2, 5 |
| the probe against injected old-bug CSS | a mode or helper the check exposes, run by the developer and reported (red with the CSS, green without) | 4 |
| allow list shape (reasons, no stale entries) | the check itself, plus a `node --test` test on the exported list's shape | 3 |
| registry wiring | `test/smoke-registry.test.js`, `test/smoke-only.test.js` | 1 |
| the proof pair | orchestrator | 6 |

## Out of scope

- Timing for the rest of the smoke suite.
- Changing `applargetext`, `sweep` or the per-screen look checks, or folding
  them into this one.
- Other widths or font sizes.
