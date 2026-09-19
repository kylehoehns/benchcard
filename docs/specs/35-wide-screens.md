# Wide screens: Today and the game side by side

## Issue

[#35](https://github.com/kylehoehns/benchcard/issues/35) — one layout that
adapts by width: below 600px nothing changes, from 600px sheets become centered
dialogs, and from 840px Today is a fixed 360px column on the left with the open
screen filling the rest.

## Goal

A coach who opens Benchcard on a laptop or a tablet sees the day's games and the
game she is planning at the same time. She picks a game on the left, the plan
fills the right, and picking Team, Season or Settings swaps the right side
without losing her place. On a phone nothing about the app changes at all.

## Survey

What the tree actually looks like today, checked before any of the design below
was written.

1. **There is no wide layout.** The only `min-width` rules in `app/app.css` are
   `1100px` (the game screen's own timeline/card two-up, `.cols`) and `760px`
   (the ⌨︎ Shortcuts hint). Every other width query is a narrowing stage:
   `620px`, `385px`, `19em`, `900px`. So this ticket is additive, not a rewrite.

2. **One shared header, two halves.** `header.bar` (`app/index.html:371`) holds
   `#barToday` (team button, New day, gear) and `#barBack` (back, Edit, `+`,
   Share, Export). `applyView` toggles them with `hidden`. The bar is
   `position: sticky; top: 0` and a child of `.app`, so it spans whatever `.app`
   spans.

3. **Visibility is the `hidden` attribute.** `app/app.css:11` is
   `[hidden] { display: none !important; }`, and `applyView`
   (`app/render.js:576-581`) sets `.hidden` on each of the six `<main>`s. Any
   rule that puts Today on screen while `state.view` is something else has to
   beat that `!important`. The first-paint block (`app/app.css:1972-2012`)
   already does exactly this with `display: … !important`, so the idiom exists.

4. **Today's passes are deliberately not painted off-screen.**
   `renderTabs` in `app/teams-view.js` guards `#todayGames` with
   `state.view === 'today'` and the game header with `state.view === 'games'`
   (#26 decision 6). Side by side breaks both guards: whichever pane is not the
   current view goes stale.

5. **The floating action bar is viewport-wide.** `.actionbar`
   (`app/app.css:1572`) is `position: fixed; left: 0; right: 0`, and both
   `#actionbar` (Start game) and `#resumeBar` (Resume) use it. It is gated on
   `@media (max-width: 900px)`; above that the inline `.gm-start` row carries
   Start game instead (`app/app.css:3315`). `#resumeBar` overrides the gate by
   id and shows at every width.

6. **`--ab-h` assumes one bottom bar.** `measureChromeHeights`
   (`app/render.js:513-517`) takes whichever of the two is not hidden. Two panes
   could put both on screen at once for the first time.

7. **Sheets are bottom-anchored.** `dialog.bsheet` (`app/app.css:2439`) is
   `inset: auto 0 0 0; width: 100%`, with `.bsheet-half` at `50dvh`, `.full` at
   `92dvh`, a `0 80px 0 0` shadow slab filling the gap under a dragged sheet,
   and a `translateY(100%)` entry and exit. `display` is deliberately kept off
   the base rule so the UA's `dialog:not([open])` keeps deciding visibility.
   The drag gesture lives in `app/trap.js` (`beginDrag`/`moveDrag`/`endDrag`).

8. **The boot stamp.** An inline script in the head writes
   `html[data-boot="<view>"]` when the stored view is not Today, and
   `applyView` removes it. It is only present for four of the six views, so it
   cannot be the attribute a permanent layout keys off.

9. **The overflow sweep.** `scripts/smoke/sweep.mjs` walks every integer width
   from `SWEEP_FLOOR` (300) to `SWEEP_HI` (420) across the five views. Both
   constants live in `scripts/smoke/registry.mjs`. The sweep row's name is built
   from them, so the `--only` list in `test/smoke-only.test.js` follows along on
   its own.

10. **`app/render.js` reads as binary to `grep`.** It holds two NUL bytes at
    offsets 27365 and 27409, inside a template literal used as a cache key, so
    plain `grep` skips the file silently. Use `grep -a`. Pre-existing on `main`
    and not this ticket's to fix — file it as its own issue.

## Decisions

1. **Two new blocks, both `screen`-scoped.** `@media screen and
   (min-width: 600px)` for the sheets and `@media screen and (min-width: 840px)`
   for the two-pane layout. `screen and` matters: a plain `min-width: 840px`
   also matches print, which would shove the printed card 360px to the right.
   The repo already writes `@media screen and (max-width: 1099px)` for the same
   reason.

2. **Below 600px nothing changes.** Every rule this ticket adds lives inside one
   of those two blocks. Nothing is removed from, and nothing is added to, the
   existing `max-width` stages except the boundary move in decision 7.

3. **`html[data-view]` is how CSS learns the current screen.** `applyView`
   writes `document.documentElement.dataset.view = v` — one line, one place, the
   same line that already sets `state.view`. The head's boot stamp writes it too,
   beside the existing `data-boot` line, so the first frame is right. This is a
   projection of `state.view` into the DOM for the cascade, not a second copy of
   it: nothing reads it back as state.

4. **The left rail is Today, fixed, with its own scroller.**
   ```
   @media screen and (min-width: 840px) {
     html:not([data-view="welcome"]) #view-today,
     html:not([data-view="welcome"]) #view-today[hidden] {
       display: block !important;
       position: fixed; inset: var(--bar-h, 4.5rem) auto 0 0;
       width: var(--rail); max-width: var(--rail); margin: 0;
       overflow-y: auto; overscroll-behavior: contain;
       border-right: 1px solid var(--line);
       padding-bottom: calc(var(--ab-h, 0px) + 1.5rem);
     }
   }
   ```
   with `--rail: 360px` declared once on `:root` inside the block. Welcome is
   excluded so first run stays a single full-width screen. Place the block
   **after** the `data-boot` rules in the file: `html[data-boot="games"]
   #view-today` and `html:not([data-view="welcome"]) #view-today` have the same
   specificity, so source order decides the tie, and the rail has to win.

5. **The bar stays full width.** It is the window's title bar, not a pane's.
   Leaving it alone keeps `measureBarSide`, `watchLargeTitle` and `--bar-h`
   exactly as #33 built them, and the rail starts below it at `var(--bar-h)`.

6. **The right pane is a margin, not a grid.** `#view-games`, `#view-team`,
   `#view-season`, `#view-settings` and `#storagewarn` get
   `margin-left: var(--rail)`. `.wrap`'s `margin: 0 auto` keeps `auto` on the
   right, so the content still caps at its own `max-width`. No grid on `.app`:
   its thirteen direct children include four fixed overlays and a `<dialog>`,
   and auto-placing those is a bigger blast radius than five margins.

7. **The open game is the right pane's resting state.** At 840px and up,
   `html[data-view="today"] #view-games[hidden] { display: block !important; }`.
   So the wide layout is never half empty: Today on the left, the open game on
   the right, and Team, Season or Settings covering the game when one is open.
   Back from any of those returns to Today — which is the game again. That is
   what "back returns to the previous choice" means at this width, and it is
   what the ticket's own title asks for.

   This pulls two consequences:

   - **The floating Start-game bar becomes a narrow-screen affordance.** The
     three `@media (max-width: 900px)` gates that own it — `.actionbar`'s
     `display: flex` (1597), `.wrap`'s bottom clearance (1666) and
     `.gm-start`'s `display: none` (3315) — move to `max-width: 839px`, pairing
     with the new `min-width: 840px` the way `1099`/`1100` already pair. Above
     840px the inline `.gm-start` row carries Start game, in the right pane
     where the game is. `test/actionbar-split.test.js` pins those literals and
     moves with them.
   - **Only one bottom bar is ever on screen.** `#actionbar` is gone above
     840px, so `#resumeBar` — Today's — is the only one left, and
     `measureChromeHeights`'s one-bar assumption still holds. `#resumeBar` is
     constrained to the rail: `left: 0; right: auto; width: var(--rail)`.

8. **Two pure predicates replace the two stale guards.** `app/render.js`
   exports
   ```js
   export const WIDE_MIN = 840;
   export const todayPaneShowing = (view, wide) => wide || view === 'today';
   export const gamePaneShowing  = (view, wide) => view === 'games' || (wide && view === 'today');
   ```
   plus one module-scoped `matchMedia(`(min-width: ${WIDE_MIN}px)`)` whose
   `.matches` is the `wide` argument at call time. `renderTabs` and
   `renderResumeBar` in `app/teams-view.js` call them instead of comparing
   `state.view` themselves. `#barTitle` stays on `state.view === 'games'` — the
   bar belongs to the current screen, not to the pane.

   `WIDE_MIN` and the CSS `840` are two copies of one number, which is what the
   guard in Proof 1 exists to hold together.

9. **The mini rotations now repaint on every edit at wide widths.** #26 decision
   6 skipped building Today's four passes while the coach was on the game screen
   because nobody could see them. At 840px and up she can, so the work is no
   longer wasted and the guard has to let it through. `tabs` is already in both
   `AFTER_EDIT` and `PLAN_ONLY`, and `soon()` debounces at 140ms, so no new
   scheduling is needed — only the guard changes.

10. **`applyView` repaints both panes at wide widths.** Today it calls
    `render()` for games and `render('tabs', 'resume')` for today, and nothing
    for team/season/settings. When the wide layout is live, both panes are on
    screen whatever the view is, so it calls `render()` — every section — on
    every view change. One full repaint per view change is not a hot path.

11. **From 600px a sheet is a centered dialog, capped at 560px.**
    ```
    @media screen and (min-width: 600px) {
      dialog.bsheet {
        inset: 0; margin: auto;
        width: min(560px, calc(100% - 2rem)); max-width: 560px;
        height: auto; max-height: min(92vh, 92dvh);
        border-radius: var(--r-sheet);
        box-shadow: var(--shadow-lg);
      }
      dialog.bsheet.bsheet-half, dialog.bsheet.full { height: auto; }
      dialog.bsheet.grouped { box-shadow: var(--shadow-lg); }
      .bsheet-handle { display: none; }
    }
    ```
    The `0 80px 0 0` slab goes: it exists to fill the gap under a sheet dragged
    past the bottom edge, and there is no bottom edge to drag past. `display` is
    still not declared on the base rule — the UA keeps deciding that (survey 7).
    `.bsheet-body` is already `flex: 1; overflow-y: auto`, so `height: auto`
    plus a `max-height` scrolls inside the dialog with no further change.

12. **The slide becomes a fade.** Inside the same block and still under
    `@media (prefers-reduced-motion: no-preference)`, the `@starting-style`
    becomes `transform: none; opacity: 0` and `.closing` becomes
    `transform: none; opacity: 0`. A centered dialog sliding up from the bottom
    of the screen reads as a bug.

13. **Dragging is refused when the sheet is not against the bottom edge.**
    `beginDrag` in `app/trap.js` returns early when the dialog's
    `getBoundingClientRect().bottom` is more than 1px above `innerHeight`. This
    is measured, not a second copy of the 600px breakpoint: the rule is "only a
    sheet that touches the bottom can be pulled down past it".

14. **The sweep gets three discrete widths, not a wider band.**
    `SWEEP_EXTRA = [600, 840, 1280]` in `scripts/smoke/registry.mjs`, walked
    after the 300–420 band. Sweeping every integer from 300 to 1280 is 4,900
    widths across five views for no extra signal; the three numbers in the
    acceptance criteria are the three that matter.

15. **`compare-shots.mjs` gains a `mobile` flag and a `sheet` modifier.** Every
    `Emulation.setDeviceMetricsOverride` in that file hardcodes `mobile: true`,
    which is wrong for a 1280px laptop shot. `mobile` joins the shot shape,
    defaulting to `true`. `sheet` is a selector string plus the click that opens
    it, asserted to have actually opened — the same "prove the modifier
    happened" pattern `titleCollapsed` and `bottom` already use.

## What would settle it

Straight from the ticket's acceptance criteria, with the values this build is
measured against.

1. At **840px** and wider: `#view-today` is on screen with `left === 0` and
   `width === 360`, and the open screen's left edge is at `360`. Choosing Team
   on the left replaces the right pane; pressing back puts the game back.
2. At **1280px**: the same, with the right pane 920px wide.
3. From **600 to 839px** the layout is one column (`#view-today` is not on
   screen unless it is the current view), and an open `dialog.bsheet` is
   centered — `width <= 560`, `left > 0`, `right < clientWidth`, `top > 0` —
   rather than flush to the bottom.
4. At **599px** an open `dialog.bsheet` is still full width and flush to the
   bottom edge.
5. Below **600px** nothing changes: at 390×844 and at 320px with a 32px root,
   every existing smoke row still reports the same numbers.
6. The overflow sweep runs at **600, 840 and 1280** on top of 300–420, with
   nothing overflowing and nothing stranded past either edge.
7. `npm test` and `npm run smoke` both pass, and every test written against
   markup or CSS this ticket replaces is updated in the same change.

## Surfaces

**Changes**

- `app/index.html` — one line in the head's boot stamp writing `data-view`.
- `app/app.css` — the two new blocks; three `900px` → `839px` boundary moves.
- `app/render.js` — `WIDE_MIN`, the two predicates, the `matchMedia`, the
  `data-view` write in `applyView`, the full repaint at wide widths, and a
  `change` listener on the query so crossing the breakpoint repaints.
- `app/teams-view.js` — `renderTabs` and `renderResumeBar` call the predicates.
- `app/trap.js` — `beginDrag` refuses a sheet that is not at the bottom edge.
- `app/sw.js` — `VERSION` and `SHELL`, in the same edit as any `app/` change.
- `scripts/smoke/registry.mjs` — `SWEEP_EXTRA`; the `widelayout` row.
- `scripts/smoke/sweep.mjs` — walk `SWEEP_EXTRA` after the band.
- `scripts/smoke/wide-layout.mjs` — new.
- `scripts/smoke.mjs` — register `widelayout` in both places `resumebar` appears.
- `scripts/compare-shots.mjs` — `mobile` and `sheet` on the shot shape; the new
  wide and mid shots.
- `test/wide-layout.test.js` — new guard.
- `test/actionbar-split.test.js` — the boundary literals.
- `test/smoke-only.test.js` — 39 selectable rows becomes 40.
- `test/compare-shots.test.js` — the new shots' hand-typed counts.
- `docs/specs/35-wide-screens.md` — this file.

**Must not change**

- `scripts/budgets.json` — `requests` is hand-pinned at 39 and the file is
  guarded against editing. If the payload goes over, widen `SLACK.bytesAbs` in
  `scripts/budgets.mjs` and never run `--update-budgets`.
- `app/vendor/**`, the six `*-player-basketball-rotation-chart.html` pages.
- `notes/mockups/prototype/**` — the prototype is phone screens only and says so;
  it has no wide layout to match.
- The history model in `setView` (`app/render.js:182-302`). Decision 7 gets
  "back returns to the previous choice" without touching it.
- `LARGE_TEXT_ALLOW` / `APP_LARGE_TEXT_ALLOW`, `SWEEP_FLOOR`, `NARROW`, `WIDTH`,
  `HEIGHT`.

## Constraints

- **Interface guideline L7** is the whole ticket: one layout that adapts by
  width, not a separate desktop design. The bands are <600 / 600–839 / 840+.
  There is no tab bar and this ticket adds none.
- **Mobile first.** The phone is the shipped product; every rule here is behind
  a `min-width`. Decision 2 is the form that takes, and Proof 1 guards it.
- **The precache bump.** Every file under `app/` in Surfaces is precached.
  `VERSION` (`app/sw.js:21`) and `SHELL` (`app/sw.js:32`) move in the same edit.
  Do not trust a digest quoted anywhere, including this spec: run
  `npm test 2>&1 | grep -A 25 "SHELL matches the bytes"` and use what the tree
  itself reports.
- **Reuse, do not re-derive.**
  - Reuse `--bar-h` and `--ab-h` (`measureChromeHeights`); do not measure the
    bar or the action bar again for the rail's top or bottom.
  - Reuse `--rail` everywhere the 360 appears in CSS; declare it once.
  - Reuse `VIEWS` from `scripts/smoke/sweep.mjs` in the new smoke check; do not
    write a second list of the five screens or of how to open them.
  - Reuse `SWEEP_FLOOR`/`SWEEP_HI`/`WIDTH`/`HEIGHT` from the registry and
    `scripts/smoke/dom.mjs`; the new widths go beside them, not inline.
  - Reuse `gameLabel`, `passStatusEl` and `resumeBarAt` in `teams-view.js`
    exactly as they are used now; only the guards change.
  - Reuse the `pair()` factory in `scripts/compare-shots.mjs` for the new shots.
- **Guards go red first.** `test/wide-layout.test.js` is new and
  `test/actionbar-split.test.js`, `test/smoke-only.test.js` and
  `test/compare-shots.test.js` are edited. Each one runs and fails, with the
  failure quoted, before the code that makes it pass.
- **Smoke files stay under 40,000 bytes each.** `scripts/smoke/wide-layout.mjs`
  is a new file, so this is headroom rather than a problem.
- **American spelling** in every comment and every string.

## Design

At 840px and up the app is a title bar across the top, a 360px rail on the left
holding Today, and everything else in the space that is left.

The rail is `position: fixed` under the bar with its own scroller, so the day's
games stay put while the plan on the right scrolls. Today is on screen whatever
`state.view` says — the `hidden` attribute keeps tracking the view for the
narrow layout's sake, and the wide block overrides it. Welcome is the one
exception: first run is a single full-width screen at every width.

The right pane is whichever screen is open. When nothing is open — `data-view`
is `today` — it shows the open game, so the two panes are Today and the game,
which is the arrangement the ticket is named after. Choosing Team, Season or
Settings covers the game; back uncovers it.

Because the game now lives in the right pane above 840px, the floating
Start-game bar retires there and the inline `.gm-start` row takes over, moving
the existing 900px boundary to 839px so it pairs with the new one. That leaves
the Resume bar as the only floating control above 840px, and it is pinned to the
rail's 360px because it belongs to Today.

From 600px a sheet stops rising from the bottom and becomes a centered dialog at
most 560px wide, with all four corners rounded, a fade instead of a slide, no
drag handle, and dragging refused. Below 600px the sheet is untouched, down to
the last pixel.

Two pure predicates carry the one behavior change in JavaScript: Today's passes
and the game screen's own title paint when their pane is on screen rather than
when it is the current view. Everything else the wide layout does is CSS.

## Proof

Seven items above; five seams below.

1. **`test/wide-layout.test.js` — a guard, under `/new-guard`.** Reads
   `app/app.css` and `app/render.js` as text. It is a guard, not a behavior
   test, and it is named here so it is allowed to be one. It asserts:
   - both new blocks exist and both are `screen`-scoped, so print is untouched;
   - `WIDE_MIN` in `app/render.js` is the same number as the CSS block's
     `min-width` — the two copies of 840 cannot drift;
   - `--rail` is declared exactly once, and every other rail rule uses
     `var(--rail)` rather than a second `360px`;
   - the sheet cap `560px` appears only inside the 600px block;
   - the three action-bar gates read `max-width: 839px`.

   Covers: **What would settle it** 5 (nothing below 600px is touched) and the
   "no second copy of the breakpoint" constraint.

2. **`app/render.js`'s predicates, under `node --test`.**
   `todayPaneShowing` and `gamePaneShowing` are pure functions of
   `(view, wide)`. Seven tests import them the way `test/render-sections.test.js`
   already imports that module: today/games/team/season/settings × narrow, and
   the same five × wide. Covers **What would settle it** 1's "back puts the game
   back" at the level where the decision is actually made.

3. **The `widelayout` smoke check — `scripts/smoke/wide-layout.mjs`.** Drives
   the real app over CDP, reusing `VIEWS` from `sweep.mjs`. At 1280×844 and
   840×844 it reads `getBoundingClientRect()` for `#view-today` and the open
   `<main>` and asserts the rail is at `left 0`, `width 360`, and the open
   screen starts at `360`; it clicks Team, asserts the rail is still there and
   the right pane is Team, presses back and asserts the game is back. It checks
   `#resumeBar` is `<= 360` wide at `left 0` when it is showing, and that
   `#actionbar` is not showing. At 600×844 it opens a sheet and asserts the four
   centered numbers; at 599×844 it asserts the same sheet is flush to the bottom
   and full width. Restores 390×844 on the way out, as `narrow.mjs` does.

   Covers **What would settle it** 1, 2, 3 and 4. Adding the row takes the
   selectable count from 39 to 40, which is why `test/smoke-only.test.js` is
   edited.

4. **The sweep at 600, 840 and 1280.** `SWEEP_EXTRA` in the registry, walked by
   `sweepPass` after the band, with the row's detail string naming the extra
   widths so the smoke table says what ran. Covers **What would settle it** 6.

5. **`/browser-verify`, and `node scripts/compare-shots.mjs --issue 35`.** The
   look check a harness cannot do, in both themes: long real opponent names,
   scrolled to the bottom, full height, the 320px/32px large-text cell, and the
   empty first-run state — plus, at 840px and 1280px, the rail and the right
   pane both at the bottom of a long scroll, and a sheet centered at 600px.
   Clipping blocks the merge. New shots: `wide-today`, `wide-game`,
   `wide-bottom` at 1280 and `wide-840` at 840, each light and dark with
   `mobile: false`, and `mid-sheet` at 600. Covers **What would settle it** 1,
   2 and 3 by eye.

The proof pair — `npm test` then `npm run smoke -- --no-tests` — runs once per
commit, by whoever commits, and is not run by the agents that build the slices.

## Out of scope

- **A tab bar.** The interface guidelines rule one out and this ticket adds
  none, whatever the prototype shows.
- **Matching a prototype PNG.** `notes/mockups/prototype/README.md` lists the
  wide layout among the things it leaves out on purpose. There is nothing to
  match; the guidelines decide.
- **Deepening the history stack.** Decision 7 gets the acceptance criterion's
  back behavior out of the existing one-entry model. Rewriting `setView` is a
  separate, larger change.
- **A resizable or remembered rail width.** 360px, fixed.
- **Anything above 1280px beyond "it does not break".** The `.wrap` caps already
  stop the content sprawling; no third band.
- **The NUL bytes in `app/render.js`** (survey 10). Real, worth fixing, its own
  issue.
- **`#storagewarn` spanning both panes.** It sits in the right pane with the
  rest. It is a rare banner and a full-width variant is a second layout to
  maintain for no gain.
