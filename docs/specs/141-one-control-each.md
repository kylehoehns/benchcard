# #141 — One version of each control

## Issue

#141 (item 11 of #153). The segmented control, the remove action, the minutes
bar row, the text input and the wide-screen Start game are each built two or
three different ways. Pick one of each and delete the rest.

## Goal

A coach sees one kind of tab switch, one kind of red "Remove", one kind of
field and one Start game button, wherever they are in the app and at any
width. Nothing that already looks right moves.

## Survey (origin/main at 2f28915, after #140)

- **Segs.**
  - `.seg` (app.css:172-188) already draws 32 on a 36 track with a 48px
    `::after`. The ticket's "48 tall" is stale since #140.
  - `#viewSeg` (app.css:244-248) repeats that geometry with its own rules:
    `inline-grid`, px padding, a `z-index: 1` on the `::after`.
  - `.wel-seg` / `.wel-seg-b` (app.css:2404-2411, stacked at 3718) is used
    only on the welcome screen (index.html:911-917): "The plan", "On paper"
    and "On screen", as `role="tablist"`, wired in onboarding.js:318-320 and
    736-738. Its buttons are 40px with no larger hit area, so they fail I1.
    The touch sweep does not visit the welcome screen, so nothing caught it.
  - `app/advanced.html:169-173` has an inline `.seg` drawing. It is an
    `aria-hidden` picture on a page that does not load `app.css`. Out of
    scope.
- **Remove actions.**
  - `#removeGame` "Remove this game" (index.html:748) and `#removeTeam`
    "Remove this team" (:1481) are `btn ghost danger sm`.
  - Season's delete button (season-view.js:373) is also
    `btn ghost danger sm … sn-del`, and says "Delete this game". Its toast
    says "Deleted … from the season." (:383).
  - `#playerRemove` "Remove from team" (index.html:1125), "Remove rule"
    (rules.js:230) and "Remove unit N" (strategy.js:303) are
    `prow prow-center prow-danger`. That is the prototype's style
    (`.row.danger`, prototype index.html:81).
- **Bar rows.** `.mrow` (app.css:1247), `.dayrow` (:1256) and
  `.sn-row` / `.sn-track` (:4110-4121) share a label / track / value grid.
  Their columns, track heights and track colors differ (see the survey table
  on the issue).
- **Inputs.**
  - The base rule (app.css:1021-1026) draws `--surface` with a `--line-2`
    border. In dark it draws `--surface-2`.
  - The "This game" box (`#view-games .side-box.s-thisgame`, rule at
    app.css:1036-1041) overrides that with `--bg` and a transparent border:
    `#gameDate`, `#label`, `#dayName` and `#when`. In dark that is darker
    than the card it sits on.
- **Start game at ≥840.** `#gmOpen` (index.html:758) is `btn press`, with no
  `primary`, centered by `.gm-start` (app.css:1576). Below 840 the action
  bar's `#abBench` (`.ab-main`, filled and full width) is Start game
  instead, and `.gm-start` is hidden.

## Decided (owner, on the issue, 2026-09-25)

1. **Remove actions: the red list row.** Every remove action is a
   `prow prow-center prow-danger` row inside a `.pgrp` group: a full-width,
   48px row with centered red text. `btn ghost danger sm` is gone from
   remove actions. The filled red `#confirmYes` in the one confirm dialog
   stays: it is the confirm itself, not a remove action.
2. **Inputs: bordered, surface fill** (the base rule) everywhere. Only the
   "This game" override changes.
3. **Bar rows: shared base, same looks.** One `.barrow` rule. Custom
   properties carry each row's columns, track height and track color, and
   nothing a coach sees changes.
4. **Seg labels: the prototype's weight.** 500, and 600 on the selected
   button (#140 Q2 left this to #141).

## What would settle it

At 390×844, and at 840 and 1280 where a line says so, light and dark.

1. **One seg class.**
   - The welcome tabs are `.seg` (with `.wide` if they need equal widths;
     that is the one size modifier).
   - `.wel-seg` and `.wel-seg-b` have no rule in app.css and no use in
     markup or JS.
   - `#viewSeg` keeps only its placement rules (margins, `inline-grid` width
     if needed). Its button size, padding and `::after` come from `.seg`.
   - Every `.seg` button draws 32 on a 36 track, ±2px, and has a ≥48px hit
     area. That includes the three welcome tabs, measured on the welcome
     screen at 390 and at 320px with a 32px root.
   - Labels are weight 500, and the selected one (`.on` or
     `[aria-selected=true]`, whichever the control uses) is 600.
2. **One remove style.**
   - `#removeGame`, `#removeTeam`, the Season screen's remove button,
     `#playerRemove`, "Remove rule" and "Remove unit N" are all
     `.prow-danger` rows in a `.pgrp`, each 48px tall (±2), with centered
     `--err` text.
   - Season's button says **"Remove this game"**, and its toast says
     "Removed … from the season.".
   - Each keeps its current behavior: the same handler, the same confirm
     (team only) and the same Undo.
   - `.sn-del` has no rule unless it still carries spacing the row needs.
     `danger sm` appears nowhere.
3. **One bar row.**
   - `.mrow`, `.dayrow` and `.sn-row` each also carry `.barrow`.
   - `.barrow` owns `display: grid`, the gap, the vertical centering, the
     track's radius and the value column's alignment and tabular figures.
   - `--barrow-cols`, `--barrow-track-h` and `--barrow-track` (names may
     differ; one set) carry the per-row values.
   - Each row's computed column widths, track height, track color and value
     alignment are identical to `main`'s, measured in the browser at 390
     and 1280, light and dark.
4. **One input.** `#gameDate`, `#label`, `#dayName` and `#when` compute the
   same background and border color as `#teamName` in Settings, in light
   and dark. No `#view-games` input rule sets `background` or
   `border-color` any more.
5. **Start game.** At 840 and 1280, `#gmOpen` is `.btn.primary`: filled,
   and the full width of its panel (±1px of the panel's content box). It is
   still the only filled button on screen (C2), and below 840 it is still
   hidden. The "Resume · …" relabel and the disabled state still work.
6. **Guards.** One test in `test/` fails if:
   - a `.wel-seg` rule or class comes back
   - `danger sm` comes back in markup or JS
   - a remove action (a button whose text starts with "Remove" or "Delete")
     is anything but a `.prow-danger`
   It strips comments first, the way `test/help-deeplink.test.js` does.
7. **Nothing else moves.** The existing smoke suite passes, including the
   touch sweep, `app-large-text`, `controlsize`, `game rows fit` and the
   dark/light sweeps.

## Surfaces

- Changes:
  - `app/app.css`
  - `app/index.html` (the welcome tabs, `#removeGame`, `#removeTeam`,
    `#gmOpen`)
  - `app/season-view.js` (the remove button and its toast copy)
  - `app/plan-view.js` (adds `.barrow`)
  - `app/onboarding.js`, only if its selectors name `.wel-seg`
  - `scripts/smoke/team-color.mjs` (it names `.wel-seg` at :94 and :255)
  - `scripts/smoke/control-size.mjs` (the welcome tabs, and the weight)
  - `app/sw.js`
  - `test/`
- Must not change:
  - `app/engine.js`
  - any handler's behavior (remove, confirm, Undo)
  - `app/advanced.html`
  - `#confirmYes`
  - the Discard buttons in the inline "Discard …?" asks (`#addDiscard`,
    `#pasteDiscard`, `#agDiscard`, `#frDiscard`). These are one of two
    answers to a question, not remove actions. They keep `btn ghost danger`
    (not `sm`).

## Constraints

- I1: every control keeps a ≥48px hit area. The welcome tabs gain one.
- C2: at ≥840 `#gmOpen` is the only filled button on screen.
- C7: segs are text only, with equal widths.
- W2: "Remove", not "Delete".
- L7: the same controls at every width.
- K5: the red row's `--err` text already clears the text floor on
  `--surface` (the contrast tests cover `--err`). Do not add a new red.
- Reuse, do not re-derive:
  - `.seg` and `.seg.wide` for the welcome tabs, not a new seg class
  - `.pgrp` / `.prow` / `.prow-center` / `.prow-danger` for remove rows
  - the base input rule at app.css:1021 for the game fields
  - `.btn.primary` for `#gmOpen`
- The welcome tabs are `role="tab"` inside `role="tablist"`. Keep that
  ARIA and the keyboard wiring in onboarding.js. `.seg`'s selected rule must
  match however those tabs mark selection, whether `aria-selected` or `.on`.
- `#removeGame` sits inside `.side-box.s-thisgame`, and `#removeTeam` sits
  in a Settings `.side-box`. Wrapping each in a `.pgrp` must not put a group
  inside a box that already draws its own card. Place the group where it
  reads as its own card, and check the collapsed stack below 1100.
- Precache: bump `VERSION` in `app/sw.js` and set `SHELL` to the digest
  `npm test` names.
- A long smoke run can hang. Wrap any smoke you run in
  `perl -e 'alarm 900; exec @ARGV' …`.

## Design

1. **Segs.**
   - Move the welcome tabs to `.seg.wide`, and delete `.wel-seg` and
     `.wel-seg-b` (including the 3718 stacking rule; `.seg.wide` already
     wraps at large text).
   - Strip `#viewSeg`'s geometry down to placement.
   - Set `.seg button` to weight 500, and the selected button to 600.
2. **Remove rows.**
   - Wrap `#removeGame`, `#removeTeam` and Season's remove button in
     `.pgrp`, and give each `prow prow-center prow-danger`.
   - Change Season's copy to "Remove this game" and "Removed … from the
     season.".
   - Delete `.sn-del`, or keep only the spacing it needs.
3. **Bar rows.**
   - Add `.barrow` with the shared declarations and three custom
     properties.
   - Each of `.mrow`, `.dayrow` and `.sn-row` then sets only its own
     properties, plus what is truly its own (the day row's stacked fill,
     the season row's border and name weight).
   - Add the class in plan-view.js and season-view.js.
4. **Inputs.** Delete the background and border-color override in the
   `#view-games` field rule, and keep its `min-height: 48px`.
5. **Start game.** Add `primary` to `#gmOpen`, and make `.gm-start` / `.gmq`
   stretch it to the panel's width.
6. **Guard.** Add a new test file following `test/help-deeplink.test.js`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Absence and shape guard | new `node --test` file, comment-stripped | 1 (no `.wel-seg`), 2 (no `danger sm`; every remove action is `.prow-danger`), 6 |
| Seg drawn size, hit area and weight, including the welcome tabs | extend `scripts/smoke/control-size.mjs` | 1 |
| Remove rows are 48 with `--err` text; Season's copy | smoke, a new check or an extension of an existing Season or Settings check | 2 |
| Bar rows match main | a smoke check comparing computed values to literals measured on `main` before the change | 3 |
| Game fields match `#teamName` | smoke, light and dark | 4 |
| `#gmOpen` filled and full width at 840 and 1280 | smoke at those widths | 5 |
| Everything else | the full smoke suite | 7 |
| Look | `/browser-verify` on the preview: welcome, game screen, Plan sheet, Season, Settings, at 390, 840 and 320/32, light and dark | 1-5 |

## Out of scope

- The prototype's borderless field style (decided against).
- Making the three bar rows look alike (decided against).
- `app/advanced.html`'s illustration.
- "Remove unit N" offers no Undo today (strategy.js:303). That is a
  behavior gap, not a style one. Filed as #159.
