# 28 — The Plan sheet

## Issue

#28 (parent #18, blocked by #27, now merged as PR #67). Tapping the strategy
in the sentence opens the **Plan sheet**. It holds the strategy and its
controls, the game's rules, lineup balance and evening out. It replaces the
Plan, Lineup balance and Rules folds, and keeps every feature they have today.

## Goal

A coach taps "for even minutes" and one sheet has everything about how the
game's minutes are shared out. They switch to By hand and drag the minutes.
They read each rule as a plain sentence and remove one with Undo. They add a
rule of any of the eight types, and "Add rule" stays disabled until the rule
is complete. They choose a lineup balance shape and turn evening out on or off.
The rotation re-plans behind the sheet as they tap.

## Survey (2026-09-16, on `8071ee5`)

Checked against the ticket. Nothing it says is false. These are the facts the
build rests on:

- **What this replaces.** In `app/index.html`, `#view-games .col-main` holds
  three folds:
  - `details#planFold.s-plan`: summary `Plan`, `#stratnote` and a `?`
    (`data-help="help-plan"`); body `#stratseg` (four static `data-strat`
    buttons), `#stratwhy` and `#stratbody`.
  - `section.s-balance > details#balanceFold`: summary `Lineup balance`,
    `#balancehint` and a `?` (`help-balance`); body `#balancebody`.
  - `details#consdetails.dz`: summary `Rules`, `#conscount` and a `?`
    (`help-rules`); body `#constraints`.
- **Who paints them.**
  - `app/strategy.js` `renderStrategy` paints `#stratseg`'s state,
    `#stratnote`, `#stratwhy` and `#stratbody`. The By hand editor
    (`minutesEditor`) has a range and a lock button per player, "Even out the
    rest" (`#budgetSpread`), "Reset to even", the budget meter, and the
    "plays N" `.act` readout from `refreshBudgetActuals`. Closers has the
    closing-window chips and "Who closes" (`pickFive`). Platoon has its units,
    "Remove unit N" and "+ Add unit".
  - `app/balance.js` `renderBalance` paints `#balancebody` only while
    `#balanceFold` is open, and fills `#balancehint`. `initBalance` wires the
    fold's `ontoggle`.
  - `app/rules.js` `renderConstraints` paints `#constraints`:
    - the rules as chips with an ✕ named `Remove rule` (the ✕ removes at once,
      with no undo);
    - a league-minimum note;
    - an "Add a rule" chip row with **seven** kinds (Minutes limit, which is
      minimum and cap together; Starting five; Last period; Play together;
      Keep apart; Always one on; Rest limit) and an inline editor with an
      `Add` button;
    - three switches: `hardPairs` ("Force “together” pairs every stint"),
      `useCarryover` ("Balance against minutes already played today", shown
      only when `state.activeGame > 0`), and `useSeasonTargets` ("Even out
      the season so far", shown only when the season has filed games, with
      the `#seasonadj` readout painted by `renderSeasonAdjust`).
  - `app/game-setup.js` `renderConsCount` fills `#conscount`.
  - `app/app.js` wires `#stratseg` clicks (`game().strategy = …;
    track(…); renderAll()`), and its first-paint code shuts `#planFold` for a
    coach not on Even.
- **The phrases.** `wireSentence` (`game-setup.js`) points the strategy
  phrase at `openFoldAt('#planFold', …)`, and the rules and evens phrases at
  `openFoldAt('#consdetails', …)` (#27 decision 4). This ticket re-points
  them.
- **The sheet primitive** (`app/trap.js`): `openSheet(dialog, trigger)`
  always opens at half height (`setSheetHeight(dialog, false)`), and
  `closeSheet` / `closeSheets` exist. The native `cancel` event (Escape,
  Android back) closes the sheet. A screen change (`applyView`) calls
  `closeSheets()`.
- **Undo** is `undoable(message, mutate, refresh)` in `app/toast.js`. The
  default refresh calls `setView(state.view)`, which closes every open sheet.
  The snackbar is appended to `#toasts`, which is outside every dialog.
  `showModal()` makes it inert, so a coach cannot tap Undo while a sheet is
  open. This ticket has to fix that for Remove rule (decision 9).
- **Rule words.** `CONTEXT.md` names the eight rules: Minimum, Cap,
  Together, Apart, One of two on, Starting five, Last-period five, Rest limit.
  Rule sentences follow the pattern "Maya plays at least 16 min".
  `ruleCount(g)` (`state.js`) counts the league minimum as one rule, and
  counts a starting five or last-period five once.
- **Other readers of the fold markup:**
  - `app/timeline.js` `jumpToEditor('#constraints', '.rchip .x')` ("Fix the
    rules") and `jumpToEditor('#stratbody')` ("Fill a unit");
  - `app/tour.js` step 2 (`sel: ['#stratseg', '#planFold']`, with a `before`
    that opens the fold);
  - `app/app.css`: the `.s-plan`, `.s-balance` and `#consdetails` order
    lines, and the `.helpq` rules;
  - tests: `test/rules-position.test.js`, `test/this-game.test.js` (`.s-plan`),
    `test/game-format.test.js` (`#constraints`, `#conscount`),
    `test/league-min.test.js` (`#conscount`), `test/aria-state.test.js`
    (`#stratseg`), `test/tour-anchors.test.js`, `test/tour-scroll.test.js`,
    `test/help-deeplink.test.js` (`data-help`, `.helpq`),
    `test/render-sections.test.js`, `test/season.test.js` (`seasonadj`),
    `test/dead-class.test.js`;
  - smoke: `scripts/smoke/overlay.mjs` (`shows: '#planFold[open]'`) and
    `scripts/smoke/sentence-sheets.mjs` (turns `useCarryover` on through
    `#consdetails input[type=checkbox]`).
- **The `?` controls.** After this ticket, only the two `help-bench` ones
  remain. The help sheet's `help-plan`, `help-balance` and `help-rules`
  sections stay, as How it works content.
- **RICH** (smoke): 11 players (`p0` Marcus Williams … `p10` Nia Brooks);
  `p2` is level 5 and `p10` level 1; games Hawks 9:00 and Ravens 11:30, both
  Even with no rules; three filed games. So the season switch shows, and
  lineup balance has levels to work with.
- **Budgets.** `requests` is 40 of 41. This ticket adds no module.

## Decisions made in this spec without asking

The ticket was decided with the human. These fill in what it leaves open, in
the direction #18 and the guidelines already point.

1. **One dialog, `#sheetPlan`**, the same shell as the three #27 sheets:
   handle, `h2` title `Plan`, ✕ `Close`, a scrolling body and a polite
   `#sheetPlanStatus` reading `planSay`. It opens at **full height**.
   `openSheet` gains an option for that (`openSheet(dialog, trigger,
   { full: true })`). The three #27 sheets still open at half.
2. **Level 1 sections, in order, each with an `h3`:**
   1. no heading: `#stratseg` (Even · By hand · Closers · Platoon, `aria-pressed`
      as today), then `#stratwhy` (one line), then `#stratbody`;
   2. `Rules` (`#planRules`);
   3. `Lineup balance` (`#planBalance`);
   4. `Evening out` (`#planEvens`).

   The existing ids `#stratseg`, `#stratwhy`, `#stratbody`, `#balancebody`
   and `#constraints` move into the dialog, so `renderStrategy`,
   `renderBalance` and `renderConstraints` keep their render sections.
   `#stratnote`, `#balancehint` and `#conscount` go, with the folds' summaries.
3. **Which phrase lands where.**
   - The strategy phrase opens the sheet scrolled to the top, so `#stratseg`
     is in view.
   - The rules phrase opens it with the `Rules` heading at the top of the
     scrolling body.
   - The evens line (`Evens out the … game.`) opens it with the `Evening out`
     heading at the top.

   Focus goes into the dialog, as #27 does. Each open starts at level 1.
4. **The Rules section** lists each rule as a row: a `button` whose text and
   accessible name are the rule's sentence, with a chevron (C6: a chevron means
   the row opens something). Below the list is a row button, `Add a rule`.
   Below that is the `hardPairs` switch, which keeps its current label and
   note. With no rules, one line reads `No rules yet. The plan just evens out
   the minutes.` (today's copy). With an empty roster, the section says
   `Nobody available.` as today.
5. **The rule sentences** come from a pure `ruleItems(g)` in `state.js`, in
   this order. Names are full names (`byId(id).name`), joined with the
   existing `joinNames`.

   | Rule | Sentence |
   | --- | --- |
   | league minimum (when set) | `Everyone plays at least {n} min` |
   | minimum | `{name} plays at least {v} min` |
   | cap | `{name} plays at most {v} min` |
   | together | `{a} and {b} play together` |
   | apart | `{a} and {b} never share the floor` |
   | one of two on | `{a} or {b} is always on the floor` |
   | starting five | `{names} start the game` (`starts` for one name) |
   | last-period five | `{names} start the last period` (`starts` for one) |
   | rest limit | `Nobody plays more than {n} stint(s) in a row` |

   Minimum and cap rows skip absent players, as today. So
   `ruleItems(g).length === ruleCount(g)` always holds. Each item carries
   `{ kind, text, removable }`, plus what `removeRule(c, item)` needs to
   delete exactly that rule. The league minimum is `removable: false`.
6. **A rule's detail (level 2).** Tapping a rule row pushes a page inside the
   sheet. The header shows a back chevron (`‹`) named `Back to Plan` in place
   of the handle's left side, the title changes to `Rule`, and the ✕ stays.
   The body shows the sentence, then a `Remove rule` button. For the league
   minimum there is no Remove button, and one line reads `Your league minimum.
   Change it in Settings.` `Remove rule` removes the rule and returns to level
   1 with focus on the Rules heading or the next row. It shows the snackbar
   `Rule removed.` with Undo.
7. **Add a rule (level 2).** `Add a rule` pushes a page titled `Add a rule`,
   with a back chevron on the left. On the right, in place of the ✕, is a
   confirm button reading `Add rule` (C4, W2). The page has:
   - a group of eight `aria-pressed` chips: `Minimum`, `Cap`, `Together`,
     `Apart`, `One of two on`, `Starting five`, `Last-period five`,
     `Rest limit`. None is chosen at first;
   - the editor for the chosen type:
     - Minimum and Cap: a player `select` (available players) and a minutes
       `input type=number inputmode=numeric`, labelled `Minutes`;
     - Together, Apart and One of two on: two player `select`s, labelled
       `First player` and `Second player`;
     - Starting five and Last-period five: `pickFive` (up to five). One line
       reads `Replaces the one you have.` when that rule already exists;
     - Rest limit: four `aria-pressed` chips, `1 stint` … `4 stints`. One line
       reads `Replaces the one you have.` when a rest limit exists.

   `Add rule` is **disabled until the draft is complete**. A pure
   `ruleComplete(kind, draft)` in `state.js` decides:
   - Minimum: a player, and a whole number from 1 to 40;
   - Cap: a player, and a whole number from 0 to 40;
   - Together, Apart and One of two on: two different players;
   - Starting five and Last-period five: 1 to 5 players;
   - Rest limit: a choice of 1 to 4;
   - no kind chosen: not complete.

   Pressing `Add rule` writes the rule the way today's editor does:
   - a pair is not added twice;
   - a five or a rest limit replaces the existing one;
   - minimum and cap write `minMinutes` and `maxMinutes`.

   It then returns to level 1 with the new row in the list and schedules
   `soon(...PLAN_ONLY)`. There is no undo for an add.
8. **Going back.** The back chevron returns to level 1 and puts focus back on
   the row or button that pushed the page. The native `cancel` event (Escape,
   Android back) at level 2 also goes back one level, and at level 1 it closes
   the sheet. ✕, a backdrop tap and a drag down close the whole sheet at
   either level. The draft is thrown away without asking (see Out of scope).
9. **Undo inside a sheet.** While a sheet is open, the snackbar is mounted
   inside that open dialog, pinned to its bottom, so it is not inert. When
   no sheet is open it goes to `#toasts` as today. `undoable`'s refresh for
   Remove rule re-renders without calling `setView`, so the sheet stays open.
   The Undo button puts the rule back and the row reappears in the list.
10. **Lineup balance section.** The four-button `.seg.wide`: `Steady`,
    `Start strong`, `Finish strong`, `Both ends`, with `aria-pressed` and
    today's `g.balance` handler. Below it is one line: the chosen shape's
    blurb. When no player has a level, a second line says so and names the
    Team page (today's copy). The `bal-intro` paragraph goes (W3: at most one
    line under a group, plus the one that explains why the control does
    nothing). `renderBalance` no longer checks a fold.
11. **Evening out section.** Two switches, each an `input type=checkbox` with
    the `switch` attribute inside today's `label.switch`:
    - `Even out earlier games` (`g.useCarryover`), on every game. On game 0
      it is `disabled` and unchecked, and one line under it reads
      `This is the first game of the day, so there is nothing earlier to even
      out.` On a later game the line reads `Plans this game against the
      minutes already played today.`
    - `Even out the season so far` (`g.useSeasonTargets`), shown only when
      the season has filed games, as today. It keeps its note and the
      `#seasonadj` readout.

    Toggling `useCarryover` schedules `soon(...PLAN_ONLY)`, and the
    sentence's second line appears or goes.
12. **Other readers.**
    - The timeline's "Fix the rules" opens the Plan sheet at Rules.
    - "Fill a unit" opens it at the top.
    - Tour step 2 points at `#phraseStrategy`, with no `before`.
    - The `app.js` first-paint `#planFold` code goes.
    - `openFoldAt` goes, since no phrase opens a fold any more.
    - The `.s-plan`, `.s-balance` and `#consdetails` order lines go.
    - The `.helpq` CSS stays, because the `help-bench` controls still use it.
13. **No new module.** The Plan sheet's opener and level-2 navigation go in
    `game-setup.js` (export `openPlanSheet(section, trigger)`), and the rules
    list, detail and add pages go in `rules.js`. The level-2 push and pop may
    be a small helper in `trap.js` if it is generic. The pure helpers go in
    `state.js`.

## What would settle it

On the smoke suite's `RICH` record, at 390×844, with Hawks open:

1. **Opening.**
   - Tapping `Plan, even minutes` opens `#sheetPlan`: a `dialog`, open and
     modal, with its top edge at most 15% of the viewport height, and the
     handle named `Half height`.
   - Its `h2` reads `Plan`.
   - `#stratseg` has four buttons reading `Even`, `By hand`, `Closers` and
     `Platoon`. Only `Even` has `aria-pressed="true"`.
   - Closing it returns focus to `#phraseStrategy`.
   - Tapping `Rules, no rules` opens the same dialog at full height, with the
     `Rules` `h3` at most 8px from the top of the scrolling body's box.
   - With Ravens open and `useCarryover` on, tapping the evens line does the
     same for the `Evening out` `h3`.
2. **By hand.**
   - Tapping `By hand` sets `strategy: 'minutes'`. The sheet stays open. The
     strategy phrase reads `minutes set by hand`.
   - `#stratbody` has 11 ranges, each named `Target minutes for {name}`, 11
     lock buttons with `aria-pressed`, `Even out the rest`, and `Reset to
     even`.
   - Moving Marcus Williams's range up by 2 steps (keyboard `ArrowRight`
     twice): after the re-plan, `#budgetSpread` is enabled, and the row's
     `.mv` shows the new minutes.
   - Locking a row flips its lock button to `aria-pressed="true"` and
     disables its range.
   - `Even out the rest` gets the budget to `exact`, so `#budgetSpread` is
     disabled.
   - `Reset to even` clears `targetSlots` and `lockedTargets`.
   - Setting a row away from what the plan can give shows its `.act` as
     `plays N`, as `test/budget-actuals.test.js` already pins.
3. **Closers and Platoon.**
   - `Closers` shows the `Closing window` chips and a `Who closes` picker.
     Choosing two players updates the picker's `2 of 5`.
   - `Platoon` shows `Unit 1` and `+ Add unit`. Tapping it adds `Unit 2`,
     and each unit gets a `Remove unit N` button.
   - Back to `Even`, `#stratbody` is empty.
4. **Rules list and detail.**
   - With Hawks given `minMinutes: { p0: 16 }` and `pairs: [['p1','p2']]`,
     the Rules section lists two row buttons, in this order and exactly:
     `Marcus Williams plays at least 16 min` and
     `Devon Ellis and Hana Kim play together`.
   - The rules phrase reads `2 rules`.
   - Tapping the first row shows a back chevron named `Back to Plan`, the
     title `Rule`, the sentence, and a `Remove rule` button. The dialog is
     still the one open dialog.
   - `Remove rule` returns to level 1 with one row left, and after the
     re-plan the phrase reads `1 rule`.
   - A snackbar reading `Rule removed.` is inside `#sheetPlan`, and its Undo
     button is not inert (`!btn.closest('[inert]')`, and
     `document.elementFromPoint` at its center is the button).
   - A real click on Undo brings back 2 rows and `2 rules`. The sheet is
     still open.
   - `Back to Plan` from a detail returns to level 1 and puts focus on the
     row that opened it. Escape at level 2 does the same, and a second Escape
     closes the sheet.
5. **Add a rule.**
   - `Add a rule` shows the title `Add a rule`, a back chevron, and on the
     right a button reading `Add rule` that is `disabled`. There is no ✕ on
     this page.
   - It shows exactly eight type chips, in the decision 7 order.
   - Choosing `Minimum`: `Add rule` is still disabled. Choosing Eli Tran, it
     is still disabled. Typing `12`, it is enabled. Pressing it returns to
     level 1, and a row reads `Eli Tran plays at least 12 min`.
   - Choosing `Together` with the same player twice leaves `Add rule`
     disabled. With two different players it is enabled.
   - `ruleComplete` gives, for each of the eight kinds, `false` for an empty
     draft and `true` for a complete one, plus:
     - `ruleComplete('minimum', { id: 'p0', minutes: 0 }) === false`;
     - `ruleComplete('cap', { id: 'p0', minutes: 0 }) === true`;
     - `ruleComplete('minimum', { id: 'p0', minutes: 41 }) === false`;
     - `ruleComplete('minimum', { id: 'p0', minutes: 12.5 }) === false`;
     - `ruleComplete('together', { a: 'p0', b: 'p0' }) === false`;
     - `ruleComplete('starts', { ids: [] }) === false`;
     - `ruleComplete('starts', { ids: ['p0'] }) === true`;
     - `ruleComplete('rest', { n: 0 }) === false`;
     - `ruleComplete(null, {}) === false`.
   - `ruleItems` gives each decision 5 sentence for a hand-built game,
     including `Nobody plays more than 1 stint in a row`,
     `Marcus Williams starts the game` for one name, and
     `Marcus Williams, Devon Ellis and Hana Kim start the last period`.
     It skips a minimum for an absent player, and its length equals
     `ruleCount(g)` with a league minimum set.
6. **Lineup balance.** The section has a group of four buttons: `Steady`
   (pressed), `Start strong`, `Finish strong`, `Both ends`. Tapping `Both ends`
   sets `g.balance === 'both'`, moves `aria-pressed`, and the sheet stays open.
7. **Evening out.**
   - On Hawks (game 0), the `Even out earlier games` switch is `disabled` and
     unchecked, and the line under it reads exactly `This is the first game of
     the day, so there is nothing earlier to even out.`
   - On Ravens it is enabled. Turning it on sets `useCarryover` and shows the
     sentence's second line `Evens out the 9:00 game.`
   - `Even out the season so far` is present (RICH has filed games), and
     toggling it sets `useSeasonTargets`.
   - The `switch` attribute is on both inputs.
8. **The folds are gone.**
   - None of these exist any more: `#planFold`, `#balanceFold`,
     `#consdetails`, `#stratnote`, `#balancehint`, `#conscount`, `.s-plan`,
     `.s-balance`, and any `[data-help="help-plan"]`,
     `[data-help="help-balance"]` or `[data-help="help-rules"]`.
   - `#stratseg`, `#stratbody`, `#balancebody` and `#constraints` all sit
     inside `#sheetPlan`.
   - Tour step 2's `sel` is `['#phraseStrategy']`.
9. **The announcement.** After each change in items 2, 3, 6 and 7,
   `#sheetPlanStatus` reads exactly `planSay(g, plans[activeGame])`.
10. **Sheet behavior.** The #27 sheet behaviors hold on `#sheetPlan`:
    - Close, Escape (at level 1), a backdrop click and a drag down each close
      it;
    - the handle toggles half and full;
    - only one `dialog[open]` at a time;
    - `history.back()` closes it.
11. **Checks on an open Plan sheet**, on `RICH`:
    - the overlay pass gets `plan sheet` and `plan sheet, add a rule` states;
    - the `games view, every disclosure open` state proves itself with an
      element that still exists;
    - the touch-target sweep measures with the Plan sheet open, and every
      target is at least 44px;
    - every rule row and the `Add a rule` row are at least 48px tall at 320,
      360 and 390px;
    - the `app shell at 320px / 32px text` pass gets a `plan sheet` state,
      with no horizontal overflow and nothing stranded above the viewport.
12. The existing strategy, rules, balance and resolve tests stay green
    (`balance`, `budget`, `budget-actuals`, `league-min`, `resolve-rest`,
    `sit-rules`, `engine`). `npm test` and `npm run smoke` pass. Every test or
    smoke state in the Survey's list is updated or retired in the same change.

## Surfaces

Change:

- `app/index.html`:
  - add `#sheetPlan`, with the moved static controls;
  - remove the three folds and their `?` buttons;
  - update the comments that describe them.
- `app/trap.js`:
  - `openSheet`'s `full` option;
  - level-2 push and pop, with `cancel` routing (decision 8), if generic;
  - the snackbar host while a sheet is open, if that is where it fits best
    (decision 9).
- `app/toast.js`: mount the snackbar in the open sheet (decision 9).
- `app/game-setup.js`:
  - `openPlanSheet`;
  - re-point the strategy, rules and evens phrases;
  - `#sheetPlanStatus` in `refreshSheetStatus`;
  - remove `openFoldAt`, `renderConsCount` and `CONS_HINT`.
- `app/rules.js`: the rules list, the detail page, the add page, and the
  evening-out switches (decisions 4–8, 11).
- `app/strategy.js`: drop `#stratnote`. The editors keep their behavior.
- `app/balance.js`:
  - drop the fold check, `#balancehint` and the `ontoggle` wiring;
  - drop the intro line (decision 10).
- `app/state.js`: pure `ruleItems`, `removeRule` and `ruleComplete`.
- `app/timeline.js`: the two CTAs (decision 12).
- `app/tour.js`: step 2.
- `app/app.js`: remove the first-paint `#planFold` code.
- `app/render.js`: keep the sections, and adjust anything that named the
  folds.
- `app/app.css`:
  - Plan sheet styles (sections, rule rows with a chevron, the level-2
    header, the snackbar inside a sheet);
  - remove the three order lines and any rule that only the folds used.
- `app/sw.js`: `VERSION` bump and `SHELL` digest.
- `scripts/smoke/`:
  - a new check `plan sheet` (items 1–10);
  - the overlay, touch, row-height and 320px/32px states (item 11);
  - update `sentence-sheets.mjs` to turn `useCarryover` on through the Plan
    sheet.
- `test/`:
  - a new `test/plan-sheet.test.js` (the pure helpers);
  - update or retire the tests in the Survey's list.
- `scripts/budgets.mjs`: widen a byte or node ceiling if it is hit (routine;
  say so in the comment).
- `docs/`, `README.md` and the How it works text in `index.html`: where they
  name the Plan, Lineup balance or Rules folds, or a `?` beside them.

Must not change:

- `engine.js`, `budget.js`, `storage.js` and `roster.js`;
- the printed card (`card.js`, `card.css`);
- `scripts/budgets.json` and anything under `app/vendor/`;
- the Who's here, Format and Sub interval sheets' behavior.

## Constraints

- **The card does not change.** The Plan sheet is `noprint`.
- **Mobile first.** Build and check at 390×844, then at 320px with 32px root
  text.
- **The four pure modules are untouched.** The new helpers go in `state.js`.
- **No new module.** `requests` stays 40 of 41.
- **Precache bump.** Precached files change, so bump `VERSION` in `app/sw.js`
  and set `SHELL` to the digest `npm test` names, in the same edit.
- **Reuse, do not re-derive:**
  - the sheet primitive: `openSheet`, `closeSheet`, `closeSheets`, the
    `.bsheet` shell and its CSS;
  - the rules count: `ruleCount(g)`. `ruleItems` must agree with it, and a
    test pins that;
  - name joining: `joinNames`;
  - the announcement: `planSay`, through `refreshSheetStatus`;
  - the re-plan: `soon(...PLAN_ONLY)` for rules, locks and switches, as
    today. A strategy change stays `renderAll()`;
  - undo: `undoable` and its snackbar, never a second toast;
  - the editors in `strategy.js`, `pickFive` and `renderSeasonAdjust`, moved
    rather than rewritten;
  - the strategy words: `STRATEGY_WORDS` and `STRATEGIES`;
  - the shapes: `SHAPES` in `balance.js`;
  - the smoke passes' shared state lists, `widthSweep`, `TOUCH_WIDTHS`, and
    the `who-rows.mjs` pattern for the row sweep.
- **No animation of `top`, `left`, `width` or `height`.** A level-2 push may
  slide with `transform`, and reduced motion drops the slide.
- **Guidelines:**
  - **C4:** level 1 is live, with only the ✕. The Add a rule page is a commit
    page, with a confirm named `Add rule`.
  - **C5:** one level deep, with a back chevron. Nothing opens a second sheet.
  - **C7:** the strategy control has four equal text segments, and so does
    the balance shape control.
  - **W2:** `Add rule` and `Remove rule`, never `Done` or `OK`.
  - **I3:** every gesture has a button. The back chevron stands in for back,
    and the handle button for the drag.
  - **W3:** no `?` beside a control, and at most one line under a group.
- **Words** (`CONTEXT.md`): Minimum, Cap, Together, Apart, One of two on,
  Starting five, Last-period five, Rest limit, Lineup balance, Steady, Even,
  By hand, Lock, Closing group, Unit, Evening out. Say "sheet", not "modal"
  or "drawer".
- **The privacy claim** is unchanged.
- **Spelling:** American.

## Design

```
Plan sheet, full height (390px)
┌───────────────────────────────────┐
│              ═══                  │ handle (button)
│ Plan                           ✕  │
│ [Even][By hand][Closers][Platoon] │
│ Everyone gets as close to …       │
│ (strategy editor, if any)         │
│ Rules                             │
│ Marcus Williams plays at le… ›    │
│ Add a rule                     ›  │
│ [ ] Force “together” pairs …      │
│ Lineup balance                    │
│ [Steady][Start][Finish][Both]     │
│ Every stint about as strong …     │
│ Evening out                       │
│ [ ] Even out earlier games        │
│ This is the first game of the day…│
│ [ ] Even out the season so far    │
│ 16 to 20 minutes each, 21 changes │ role=status
└───────────────────────────────────┘

Level 2
│ ‹  Add a rule            [Add rule]│
│ [Minimum][Cap][Together][Apart]…  │
│ (editor)                          │
```

- The dialog's body holds two panes: level 1 (`#planMain`) and level 2
  (`#planSub`). Only one is shown at a time (`hidden`). Pushing:
  - paints `#planSub`;
  - hides the main pane;
  - shows the back chevron;
  - sets the `h2` text;
  - swaps the ✕ for `Add rule` on the add page;
  - moves focus to the first control in the sub pane.

  Popping reverses this and restores focus to the pusher. `openPlanSheet`
  always resets to level 1 first.
- The rules list, the add page's draft and its editor live in `rules.js`.
  The draft is module state (`{ kind, id, minutes, a, b, ids, n }`), reset on
  each push. Editor inputs update the draft and re-check `ruleComplete` in
  place. They never rebuild the input being typed in.
- `renderConstraints` paints level 1's Rules list and switches into
  `#constraints`, and `#planEvens`'s switches, and it does not repaint an open
  level-2 page. `constraints` stays out of `AFTER_EDIT` and `PLAN_ONLY`.

## Proof

The seams `/tdd` builds at:

- **`node --test test/plan-sheet.test.js`** (new). It imports `state.js` with
  the `document` stub `test/sentence.test.js` uses, and exercises
  `ruleItems`, `removeRule` and `ruleComplete` on hand-built games. It covers
  item 5's pure values, decision 5's sentences, the absent-player skip,
  `ruleItems(g).length === ruleCount(g)`, and that `removeRule` deletes
  exactly the one rule it names (a minimum, one pair of two, a starting five,
  the rest limit).
- **Smoke, new check `plan sheet`**, on `RICH` (`setup: 'rich'`). It drives
  real buttons, keys and pointer events over CDP, the way
  `sentence-sheets.mjs` does. It covers items 1–10. Rules for item 4 are
  seeded by editing `game().constraints` in the page, then `renderAll()`,
  before opening. It reads `plans`, `planSay`, `game` and `state` from
  `/state.js`. Geometry comes from `getBoundingClientRect`. The Undo click
  and the backdrop click are `Input.dispatchMouseEvent` at real coordinates.
  It is a guard under `/new-guard`, and must be seen failing against
  `main`'s markup before it passes. It leaves Hawks and Ravens as it found
  them (Even, no rules, `useCarryover` off, balance Steady), so later checks
  are not disturbed.
- **Smoke, existing checks** (item 11):
  - `overlay.mjs` states;
  - the touch pass opens the Plan sheet;
  - a `plan rows ≥ 48px` row sweep modeled on `who-rows.mjs`;
  - the app-large-text state;
  - `sentence-sheets.mjs` re-pointed.
- **Existing tests** (item 12): the source-reading tests that named the folds
  are updated or retired. Each one is a guard, so say what it now pins.
- **`npm test`** (item 12).
- **`/browser-verify`** at 390×844, then at 320px with 32px root text, in
  light and dark:
  - a screenshot of the Plan sheet at each strategy;
  - a rule's detail, removing a rule and undoing it;
  - Add a rule, going from disabled to enabled;
  - the first game's disabled switch and its line.

## Out of scope

- Asking before closing throws away a half-built rule (C4's "ask first"). No
  text a coach typed is longer than a number here, and #18 lists it with the
  commit sheets still to come.
- Editing an existing rule in place. The detail offers Remove only, as the
  ticket says.
- The blocked-plan panel and its "Change the rules" button (#29). This
  ticket only keeps today's two CTAs working.
- The How it works text, beyond removing references to the removed `?`
  controls and folds.
- Removing the `.helpq` style and the `help-bench` controls (#37).
- A history entry for a level-2 page. Sheets push none (#27 decision 11).
