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

## Survey (2026-09-16, on `8071ee5`; rechecked on `4bf7e12` after #68 and #69)

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

## The look to match

The prototype in `notes/mockups/prototype/` is the look (PR #68). The target
PNGs are `light-` and `dark-sheet-plan.png`, `-sheet-plan-day.png`,
`-sheet-rule.png` and `-sheet-add-rule.png`, at 390 × 844. The values come
from the prototype's CSS (`#sheet`, `.sh-h`, `.grp`, `.grp-h`, `.grp-f`,
`.row`, `.seg`, `.chips`, `.tiles`, `.tile`, `.stepper`, `.switch`,
`.row.danger`) and its `plan()`, `rule()` and `addRule()` builders. They are
written with `app/tokens.css` tokens, in rem, reusing what #69
(`docs/specs/69-restyle-today-and-game.md`) already set: `--seg-on`,
`--track`, `--r-sm` 12px, `--ease`, the `.seg` look, and the grouped-row look.

Where the prototype and `docs/interface-guidelines.md` disagree, the
guidelines win. The prototype README lists the cases. For this sheet they
are:

- ✕ top right on the live sheet, not "Done" (C4);
- 28px top corners, not 14px (L6);
- a round chevron back button named `Back to Plan`, not the text "‹ Plan"
  (N5, A2);
- 48px hit areas for the segments, chips, stepper buttons and rows (I1, C6);
- rem type from the seven `--fs-*` steps (T2, T3). Row text is Body;
- the tint only on selected states (K1), so "Add a rule" and the header's
  "Add rule" are ink, not tinted;
- no "Players changing at once" row (S2: Settings only).

Ease of use comes first. The three jobs a coach does here are changing the
strategy, removing a rule and adding one. Each has to be obvious, one-handed,
and as few taps as possible:

- strategy: phrase, then segment (2 taps);
- remove: phrase, rule row, Remove rule (3 taps), with Undo;
- add a minimum: phrase, Add a rule, type chip, player tile, Add rule
  (5 taps; the minutes stepper starts at a usable value).

## Decisions made in this spec without asking

The ticket was decided with the human. These fill in what it leaves open, in
the direction #18, the prototype and the guidelines already point.

1. **One dialog, `#sheetPlan`**, on the #27 sheet shell: the handle button,
   an `h2` title `Plan`, ✕ `Close`, a scrolling body and a polite
   `#sheetPlanStatus` reading `planSay`. It opens at **full height**.
   `openSheet` gains an option for that (`openSheet(dialog, trigger,
   { full: true })`, built). The three #27 sheets still open at half.
2. **The sheet shell takes the prototype's look, for all four sheets.** These
   are shell rules (`dialog.bsheet`, `.bsheet-hd`), so Who's here, Format and
   Sub interval get them too. Their bodies are not restyled here.
   - Top corners 28px. `--r-lg` is 20px, so add a token `--r-sheet: 28px`.
   - The header has no bottom border. It is a three-column grid: a left slot
     (empty at level 1, the back button at level 2), the title centered at
     `--fs-headline` 600, and a right slot (✕, or `Add rule`). Each slot
     control is at least 48 × 48.
   - The handle stays a real button. Its pill is 2.25rem × 5px, `--faint` at
     60% opacity, as the prototype's `.grab`.
3. **The Plan sheet is a grouped sheet** (`dialog.bsheet.grouped`). Its
   background is a new token `--sheet` (light `#F1F1F5`, dark `#141416`, the
   prototype's values). In dark the sheet is lighter than `--bg` (K4). Add
   `--sheet` to the contrast test's grounds and the neutral-gray token test.
   On it, content sits in groups:
   - **group** (`.pgrp`): `--surface`, `--r-sm`, 1rem side margins, no border;
   - **group header** (`.pgrp-h`): `--fs-footnote`, `--muted`, 2rem from the
     edge, 1.5rem above, .45rem below, sentence case;
   - **group footer** (`.pgrp-f`): `--fs-footnote`, `--muted`, 2rem from the
     edge, .45rem above, line-height 1.35. One line at most (W3);
   - **row** (`.prow`): at least 48px, 0 1rem padding, `--fs-body`, ink,
     .75rem gap. Rows after the first get a 1px `--line` hairline inset 1rem
     from the left. A value (`.prow-v`) sits at the right in `--muted`, and a
     chevron (`chevron_right` from `icons.js`, .8rem, `--faint`) after it.
     Long text wraps; it is never cut off.
   The status line sits on `--sheet` with no top border.
4. **Level 1, top to bottom** (as `light-sheet-plan.png`):
   1. **Strategy.** `#stratseg` as a full-width `.seg.wide` with 1rem side
      margins and .5rem above: `Even`, `By hand`, `Closers`, `Platoon`, with
      `aria-pressed` as today. Under it `#stratwhy` as a group footer (one
      line). Then `#stratbody` when the strategy has an editor (decision 5).
   2. **Rules** (header `Rules`, group `#constraints`): one row per rule
      (decision 6), then an `Add a rule` row with a `plus` icon. With no
      rules, the group holds only `Add a rule`, and the footer reads `No
      rules yet. The plan just evens out the minutes.` With an empty roster,
      the footer reads `Nobody available.` and `Add a rule` is disabled.
      The `hardPairs` switch (decision 12) follows in its own group only while
      at least one Together rule exists, since it does nothing otherwise.
   3. **Lineups** (header `Lineups`): one row, `Lineup balance`, with the
      chosen shape as its value (`Steady`) and a chevron. It opens a level-2
      page (decision 11). When no player has a level, the footer reads
      today's no-levels line.
   4. **Across the day** (header `Across the day`, `#planDay`): the
      `Even out earlier games` switch row, then its footer (decision 12).
   5. **Across the season** (header `Across the season`), only when the
      season has filed games, as today: the `Even out the season so far`
      switch row, its footer, and the `#seasonadj` readout.

   The existing ids `#stratseg`, `#stratwhy`, `#stratbody`, `#balancebody`
   and `#constraints` move into the dialog, so `renderStrategy`,
   `renderBalance` and `renderConstraints` keep their render sections.
   `#stratnote`, `#balancehint` and `#conscount` go, with the folds'
   summaries.
5. **The strategy editors stay inline and keep their behavior**, restyled to
   match:
   - By hand: the player rows sit in a group; `Even out the rest` and
     `Reset to even` are rows below it.
   - Closers: `Closing window` is a group header over today's chips, then
     `Who closes` is a group header over the player tiles (decision 8).
     Inline, not the prototype's extra "Who closes" page, so picking closers
     stays one tap each.
   - Platoon: each unit is a group headed `Unit N`, with the player tiles and
     a `Remove unit N` row; `Add unit` is a row with a `plus` icon.
   - Chips (`.chips`, everywhere in the sheet) take the prototype's look:
     pill, `--surface`, `--fs-secondary` 500, at least 48px tall. The chosen
     chip is `--tint` with `--tint-ink` text (K1: a selected state).
6. **The rule rows** are `button.prow` whose text and accessible name are the
   rule's sentence, with a chevron (C6: the row opens something). The
   sentences come from the pure `ruleItems(g)` in `state.js`, in this order:

   | Rule | Sentence |
   | --- | --- |
   | league minimum (when set) | `Everyone plays at least {n} min` |
   | minimum | `{name} plays at least {v} min` |
   | cap | `{name} plays at most {v} min` |
   | together | `{a} and {b} play together` |
   | apart | `{a} and {b} never play together` |
   | one of two on | `{a} or {b} is always on the floor` |
   | starting five | `{names} start the game` (`starts` for one name) |
   | last-period five | `{names} start the last period` (`starts` for one) |
   | rest limit | `Nobody plays more than {n} stint(s) in a row` |

   Names are the on-court names from `callNames(state.players)` (`roster.js`):
   "Maya", or "Maya R." or the full name when first names collide, as the
   prototype's "Maya plays at least 16 min". They are joined with
   `joinNames`. Minimum and cap rows skip absent players, as today. So
   `ruleItems(g).length === ruleCount(g)` always holds. Each item carries
   `{ kind, text, removable }`, plus what `removeRule(c, item)` needs to
   delete exactly that rule. The league minimum is `removable: false`.
7. **A rule's detail (level 2)**, as `light-sheet-rule.png`. The header: the
   back button on the left, the title `Rule`, ✕ on the right. The body: the
   sentence at `--fs-title` 600 (1.125rem above, 1.5rem side padding), then
   a group with one centered row button `Remove rule` in `--err`, 1.375rem
   below. For the league minimum there is no Remove row; a footer reads
   `Your league minimum. Change it in Settings.` `Remove rule` removes the
   rule, returns to level 1 with focus on the next rule row (or `Add a rule`),
   and shows the snackbar `Rule removed.` with Undo (decision 13).
8. **Player tiles.** `pickFive` (`pills.js`) is the one player picker in the
   sheet: closers, units, starting fives, and the Add-a-rule players. Its
   grid takes the prototype's `.tiles` look:
   - a grid of `repeat(auto-fill, minmax(6.5rem, 1fr))`, .625rem gap, 1rem
     side margins, so three columns at 390px and fewer at 320px or with
     large text;
   - each tile is a button, `--surface`, 1rem radius, at least 4.375rem tall,
     .75rem padding: the jersey number (or initials when there is none) in
     the player's color at `--fs-secondary` 700, then the on-court name at
     `--fs-body` 600, wrapping rather than cut;
   - chosen: a 2.5px inset ring in `--tint` and a checkmark top right,
     `aria-pressed="true"` (K1: a selected state; in Graphite that is the
     prototype's ink ring);
   - a tile that cannot be picked (the group is full) is `disabled` and dims.
   `pickFive` gains `opts.replace`: with `max: 1`, tapping another tile moves
   the pick instead of being blocked. The `N of 5` count stays, as a group
   header's right-hand value.
9. **Add a rule (level 2)**, as `light-sheet-add-rule.png`. The header: the
   back button on the left, the title `Add a rule`, and on the right a text
   button `Add rule` (`--fs-headline` 600, ink, `disabled` at 35% opacity)
   in place of ✕ (C4, W2). The body:
   - eight `aria-pressed` chips, wrapping: `Plays at least`, `Plays at
     most`, `Never together`, `Always together`, `One of two always on`,
     `Starting five`, `Last-period five`, `Rest limit` (minimum, cap, apart,
     together, one of two on, starting five, last-period five, rest limit).
     `Plays at least` is chosen when the page opens, so a coach adding the
     most common rule skips a tap;
   - for Plays at least and Plays at most: header `Pick a player`, tiles
     (`max: 1`, `replace`), then a group with a `Minutes` stepper row. It
     starts at 12, clamped to the game's length, and steps by 1 (0 to 40 for
     a cap, 1 to 40 for a minimum). The value is tabular, `--muted`, to the
     left of the stepper, as the prototype;
   - for Never together, Always together and One of two always on: header
     `Pick two players`, tiles (`max: 2`);
   - for Starting five and Last-period five: header `Pick up to five`, tiles
     (`max: 5`);
   - for Rest limit: a group with a `Stints in a row` stepper row, 1 to 4,
     starting at 2;
   - a footer `Replaces the one you have.` when a starting five, last-period
     five or rest limit already exists.

   The stepper (`.pstep`): `--surface-2`, 9px radius, two buttons (`−`, `+`)
   of 2.75rem × 2rem painted, each with a 48px hit area, a `--line` divider
   between them, and accessible names `Fewer minutes` / `More minutes` (or
   `Fewer stints` / `More stints`). A button at its limit is `disabled`.

   `Add rule` is **disabled until the draft is complete**. The pure
   `ruleComplete(kind, draft)` in `state.js` (built) decides:
   - minimum: a player, and a whole number from 1 to 40;
   - cap: a player, and a whole number from 0 to 40;
   - together, apart and one of two on: two different players;
   - starting five and last-period five: 1 to 5 players;
   - rest limit: 1 to 4;
   - no kind: not complete.

   The draft is `{ kind, id, minutes, a, b, ids, n }`. Tile picks write `id`
   (one player), `a` and `b` (two, in tap order) or `ids` (fives).
   Changing the kind keeps the minutes and clears the players.

   Pressing `Add rule` writes the rule the way today's editor does:
   - a pair is not added twice;
   - a five or a rest limit replaces the existing one;
   - minimum and cap write `minMinutes` and `maxMinutes`.

   It then returns to level 1 with the new row in the list and schedules
   `soon(...PLAN_ONLY)`. There is no undo for an add.
10. **Going back.** The back button (a 2.25rem `--surface-2` circle with
    `chevron_left`, 48px hit area, named `Back to Plan`, the same look as
    `#backBtn`) returns to level 1 and puts focus back on the row that
    pushed the page. The native `cancel` event (Escape, Android back) at
    level 2 also goes back one level; at level 1 it closes the sheet. ✕, a
    backdrop tap and a drag down close the whole sheet at either level. A
    draft is thrown away without asking (see Out of scope). The page change
    slides with `transform` over `--t` `--ease`; reduced motion drops the
    slide.
11. **Lineup balance (level 2).** A live page titled `Lineup balance`, with
    the back button and ✕. One group of four rows, `Steady`, `Start strong`,
    `Finish strong` and `Both ends`, each a button with the shape's blurb as
    a second line in `--fs-secondary` `--muted`, and a checkmark on the
    chosen one (C6), `aria-pressed` on each. Tapping a row sets `g.balance`
    with today's handler, moves the check, and stays on the page (live). The
    footer holds today's no-levels line when it applies. The `bal-intro`
    paragraph goes (W3). `renderBalance` no longer checks a fold.
    `#balancebody` is this page's body.
12. **Switches.** Each is an `input type=checkbox` with the `switch`
    attribute, filling a `.prow` (the whole row is the label, so the whole
    row is the target). The track is 3.1875rem × 1.9375rem with a 1.6875rem
    white knob, as the prototype. Off is `--surface-2`, on is `--tint`
    (K1: a selected state; the prototype's green is a status color, K3).
    `disabled` dims to 40%.
    - `Even out earlier games` (`g.useCarryover`), on every game. On game 0
      it is `disabled` and unchecked, and the footer reads `This is the first
      game today, so there's nothing to even out.` On a later game it reads
      `Players who got fewer minutes earlier today get more here.` (the
      prototype's words).
    - `Even out the season so far` (`g.useSeasonTargets`), with today's note
      as its footer and the `#seasonadj` readout under it.
    - `Force together pairs every stint` (`hardPairs`), with today's note as
      its footer.

    Toggling `useCarryover` schedules `soon(...PLAN_ONLY)`, and the
    sentence's second line appears or goes.
13. **Undo inside a sheet.** While a sheet is open, the snackbar is mounted
    inside that open dialog, pinned to its bottom above the status line, so
    it is not inert. When no sheet is open it goes to `#toasts` as today.
    `undoable`'s refresh for Remove rule re-renders without calling
    `setView`, so the sheet stays open. Undo puts the rule back, and its row
    reappears in the list.
14. **Which phrase lands where.**
    - The strategy phrase opens the sheet at the top, so `#stratseg` shows.
    - The rules phrase opens it with the `Rules` header at the top of the
      scrolling body.
    - The evens line (`Evens out the … game.`) opens it with the `Across the
      day` header at the top.

    Focus goes into the dialog, as #27 does. Each open starts at level 1.
15. **Other readers.**
    - The timeline's "Fix the rules" opens the Plan sheet at Rules.
    - "Fill a unit" opens it at the top.
    - Tour step 2 points at `#phraseStrategy`, with no `before`.
    - The `app.js` first-paint `#planFold` code goes.
    - `openFoldAt` goes, since no phrase opens a fold any more.
    - The `.s-plan`, `.s-balance` and `#consdetails` order lines go.
    - The `.helpq` CSS stays, because the `help-bench` controls still use it.
16. **No new module.** The opener and the level-2 navigation go in
    `game-setup.js` (export `openPlanSheet(section, trigger)`). The rules
    list, detail and add pages go in `rules.js`, the balance page in
    `balance.js`. The level-2 push and pop may be a small helper in
    `trap.js` if it is generic. The pure helpers are in `state.js` (built).

## What would settle it

On the smoke suite's `RICH` record, at 390×844, with Hawks open:

1. **Opening.**
   - Tapping `Plan, even minutes` opens `#sheetPlan`: a `dialog`, open and
     modal, with its top edge at most 15% of the viewport height, and the
     handle named `Half height`.
   - Its `h2` reads `Plan`, centered in the header (its center within 2px of
     the dialog's center).
   - The dialog's background computes to `--sheet`, and its top-left radius
     to 28px. The header has no bottom border.
   - `#stratseg` has four buttons reading `Even`, `By hand`, `Closers` and
     `Platoon`. Only `Even` has `aria-pressed="true"`.
   - Closing it returns focus to `#phraseStrategy`.
   - Tapping `Rules, no rules` opens the same dialog at full height, with the
     `Rules` header at most 8px from the top of the scrolling body's box.
   - With Ravens open and `useCarryover` on, tapping the evens line does the
     same for the `Across the day` header.
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
   - `Closers` shows the `Closing window` chips and the `Who closes` tiles.
     Tapping two tiles sets them `aria-pressed="true"` and the count reads
     `2 of 5`.
   - `Platoon` shows `Unit 1` and `Add unit`. Tapping it adds `Unit 2`,
     and each unit gets a `Remove unit N` button.
   - Back to `Even`, `#stratbody` is empty.
4. **Rules list and detail.**
   - With Hawks given `minMinutes: { p0: 16 }` and `pairs: [['p1','p2']]`,
     the Rules group lists two row buttons, in this order and exactly:
     `Marcus plays at least 16 min` and `Devon and Hana play together`,
     then `Add a rule`.
   - The rules phrase reads `2 rules`.
   - Tapping the first row shows the back button named `Back to Plan`, the
     title `Rule`, the sentence, and a `Remove rule` button. The dialog is
     still the one open dialog.
   - `Remove rule` returns to level 1 with one rule row left, and after the
     re-plan the phrase reads `1 rule`.
   - A snackbar reading `Rule removed.` is inside `#sheetPlan`, and its Undo
     button is not inert (`!btn.closest('[inert]')`, and
     `document.elementFromPoint` at its center is the button).
   - A real click on Undo brings back 2 rule rows and `2 rules`. The sheet is
     still open.
   - `Back to Plan` from a detail returns to level 1 and puts focus on the
     row that opened it. Escape at level 2 does the same, and a second Escape
     closes the sheet.
5. **Add a rule.**
   - `Add a rule` shows the title `Add a rule`, the back button, and on the
     right a button reading `Add rule` that is `disabled`. There is no ✕ on
     this page.
   - It shows exactly eight type chips, in the decision 9 order, with `Plays
     at least` pressed.
   - Tapping Eli's tile enables `Add rule` (minutes start at 12). Tapping
     Hana's tile moves the pick to Hana. Tapping `More minutes` twice shows
     `14`. Pressing `Add rule` returns to level 1, and a row reads `Hana
     plays at least 14 min`.
   - Choosing `Always together` clears the pick and disables `Add rule`. One
     tile leaves it disabled; a second tile enables it; a third tile is
     `disabled`.
   - The `ruleComplete` and `ruleItems` truth tables in
     `test/plan-sheet.test.js` pass (built), with `ruleItems` updated to the
     decision 6 names and apart wording.
6. **Lineup balance.** The `Lineup balance` row's value reads `Steady`.
   Tapping it opens the level-2 page with four rows, `Steady` pressed.
   Tapping `Both ends` sets `g.balance === 'both'`, moves `aria-pressed`,
   and stays on the page. `Back to Plan` shows the row's value `Both ends`.
7. **Evening out.**
   - On Hawks (game 0), the `Even out earlier games` switch is `disabled` and
     unchecked, and the footer reads exactly `This is the first game today,
     so there's nothing to even out.`
   - On Ravens it is enabled. Turning it on sets `useCarryover` and shows the
     sentence's second line `Evens out the 9:00 game.`
   - `Even out the season so far` is present (RICH has filed games), and
     toggling it sets `useSeasonTargets`.
   - The `switch` attribute is on every switch input, and each switch row is
     at least 48px tall and toggles when tapped anywhere on the row.
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
    The #27 sheets still pass `sentence-sheets.mjs` with the new header.
11. **Checks on an open Plan sheet**, on `RICH`:
    - the overlay pass gets `plan sheet`, `plan sheet, a rule` and `plan
      sheet, add a rule` states;
    - the `games view, every disclosure open` state proves itself with an
      element that still exists;
    - the touch-target sweep measures with the Plan sheet open (level 1 and
      the add page) and passes at its floor; the `plan sheet` check also
      measures every new sheet control (segments, rows, chips, tiles,
      stepper buttons, the back button, ✕, `Add rule`) at 48 × 48 or more;
    - every row (`.prow`) and tile is at least 48px tall at 320, 360 and
      390px;
    - the `app shell at 320px / 32px text` pass gets `plan sheet` and `plan
      sheet, add a rule` states, with no horizontal overflow and nothing
      stranded above the viewport.
12. **Looks like the prototype.** Side-by-side screenshots at 390 × 844,
    light and dark, of level 1 (Hawks, and Ravens with evening out on), a
    rule, and Add a rule, next to the matching prototype PNGs, read as the
    same design. Plus the Plan sheet at 320px with 32px text. They are
    committed under `notes/mockups/prototype/compare/28/`.
13. The existing strategy, rules, balance and resolve tests stay green
    (`balance`, `budget`, `budget-actuals`, `league-min`, `resolve-rest`,
    `sit-rules`, `engine`). `npm test` and `npm run smoke` pass, with the
    contrast and token guards unweakened. Every test or smoke state in the
    Survey's list is updated or retired in the same change.

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
  switch groups (decisions 4, 6, 7, 9, 12).
- `app/strategy.js`: drop `#stratnote`. The editors keep their behavior.
- `app/balance.js`:
  - drop the fold check, `#balancehint` and the `ontoggle` wiring;
  - drop the intro line (decision 10).
- `app/state.js`: pure `ruleItems`, `removeRule` and `ruleComplete` (built;
  `ruleItems` moves to `callNames` and the new apart wording).
- `app/timeline.js`: the two CTAs (decision 12).
- `app/tour.js`: step 2.
- `app/app.js`: remove the first-paint `#planFold` code.
- `app/render.js`: keep the sections, and adjust anything that named the
  folds.
- `app/app.css`:
  - the sheet shell (decision 2), the grouped sheet (decision 3), tiles
    (decision 8), chips, the stepper and switch rows, the level-2 header,
    the snackbar inside a sheet;
  - remove the three order lines and any rule that only the folds used.
- `app/tokens.css`: `--sheet` and `--r-sheet`.
- `app/pills.js`: `pickFive`'s tile markup and `opts.replace` (decision 8).
- `app/balance.js`: the Lineup balance page (decision 11).
- `test/contrast.test.js` and `test/graphite-tokens.test.js`: add `--sheet`
  as a ground and a neutral gray (a stronger guard, never a weaker one).
- `notes/mockups/prototype/compare/28/`: the side-by-side images.
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
- the Who's here, Format and Sub interval sheets' behavior and bodies (only
  the shared shell changes, decision 2).

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
    the `who-rows.mjs` pattern for the row sweep;
  - names: `callNames` (`roster.js`), not a new first-name helper;
  - icons: `plus`, `chevron_left`, `chevron_right` from `icons.js`;
  - #69's `.seg`, `--seg-on`, `--r-sm`, `--ease` and the `#backBtn` look.
- **The prototype's values, not its CSS.** Nothing is pasted from
  `notes/mockups/prototype/index.html`.
- **No animation of `top`, `left`, `width` or `height`.** A level-2 push
  slides with `transform`, and reduced motion drops the slide.
- **Guidelines over the prototype:** see "The look to match". I1 48px, T2/T3
  rem type, K1 tint, L6 28px corners, N5/A2 icon back button, S2.
- **Guidelines:**
  - **C4:** level 1 is live, with only the ✕. The Add a rule page is a commit
    page, with a confirm named `Add rule`.
  - **C5:** one level deep, with a back chevron. Nothing opens a second sheet.
  - **C7:** the strategy control has four equal text segments. The balance
    shapes are a checkmark list (C6), as the prototype's row suggests.
  - **W2:** `Add rule` and `Remove rule`, never `Done` or `OK`.
  - **I3:** every gesture has a button. The back chevron stands in for back,
    and the handle button for the drag.
  - **W3:** no `?` beside a control, and at most one line under a group.
- **Words** (`CONTEXT.md`): Minimum, Cap, Together, Apart, One of two on,
  Starting five, Last-period five, Rest limit, Lineup balance, Steady, Even,
  By hand, Lock, Closing group, Unit, Evening out. The Add-a-rule chips use
  the prototype's plainer labels ("Plays at least" for Minimum, and so on),
  as decision 9 maps. Say "sheet", not "modal"
  or "drawer".
- **The privacy claim** is unchanged.
- **Spelling:** American.

## Design

```
Plan sheet, level 1, full height (390px), on --sheet
┌───────────────────────────────────┐
│               ━━                  │ handle (button)
│               Plan             ✕  │ no border
│ ┌Even┐ By hand  Closers  Platoon  │ .seg.wide
│   As close to equal as the clock… │ footer
│   Rules                           │ header
│ ┌───────────────────────────────┐ │
│ │ Maya plays at least 16 min  › │ │ .prow
│ │ Caleb and Jonah never play… › │ │
│ │ +  Add a rule                 │ │
│ └───────────────────────────────┘ │
│   Lineups                         │
│ │ Lineup balance       Steady › │ │
│   Across the day                  │
│ │ Even out earlier games   (○ ) │ │ switch row
│   This is the first game today, … │
│   16 to 20 minutes each, …        │ role=status
└───────────────────────────────────┘

Level 2: a rule                 Level 2: Add a rule
│ (‹)       Rule            ✕  │  │ (‹)    Add a rule    Add rule │
│ Maya plays at least 16 min   │  │ (Plays at least)(Plays at most)│
│ ┌──────────────────────────┐ │  │ (Never together)(Always …) …   │
│ │       Remove rule        │ │  │   Pick a player                │
│ └──────────────────────────┘ │  │ [12 Maya][4 Eli][7 Devon]      │
                                  │ │ Minutes        12  [−|+]  │  │
```

- **Panes.** The dialog's body holds two panes: level 1 (`#planMain`) and
  level 2 (`#planSub`). Only one is shown at a time (`hidden`). Pushing:
  - paints `#planSub`;
  - hides the main pane (remembering its scroll position);
  - shows the back button in the header's left slot;
  - sets the `h2` text;
  - swaps the ✕ for `Add rule` on the add page;
  - moves focus to the first control in the sub pane.

  Popping reverses this, restores the scroll position, and restores focus to
  the pusher. `openPlanSheet` always resets to level 1 first.
- **State.** The add page's draft is module state in `rules.js`, reset on
  each push. Taps update the draft and re-check `ruleComplete` in place.
- **Painting.** `renderConstraints` paints level 1's Rules group and the
  switch groups, and does not repaint an open level-2 page. `constraints`
  stays out of `AFTER_EDIT` and `PLAN_ONLY`.
- **Classes.** New sheet classes are prefixed `p` (`.pgrp`, `.pgrp-h`,
  `.pgrp-f`, `.prow`, `.prow-v`, `.pstep`, `.ptiles`), scoped under
  `dialog.bsheet.grouped`, so the #27 `.sheetrow` look and the old `.row`
  field grid are untouched. Colors come from tokens only; no raw hex in
  `app.css` except the switch knob's white, as `.switch` has today.
- **Tokens added** to `app/tokens.css`, in the light, dark and both
  more-contrast blocks as each needs: `--sheet`, `--r-sheet`. Every
  `[data-tint]` block that names a ground names its theme explicitly.

## Proof

The seams `/tdd` builds at:

- **`node --test test/plan-sheet.test.js`** (new). It imports `state.js` with
  the `document` stub `test/sentence.test.js` uses, and exercises
  `ruleItems`, `removeRule` and `ruleComplete` on hand-built games. It covers
  item 5's pure values, decision 6's sentences, the absent-player skip,
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
- **`node --test`** on tokens: `--sheet` and `--r-sheet` are declared in
  light and dark, and `--sheet` passes the contrast guard as a ground.
- **`/browser-verify`** at 390×844, then at 320px with 32px root text, in
  light and dark:
  - side-by-sides with the prototype PNGs (item 12), iterated until they
    read as the same design;
  - the Plan sheet at each strategy;
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
