# 27 — The sentence, with Who's here, Format and Sub interval sheets

## Issue

#27 (parent #18, blocked by #19, now closed): the top of the game screen
becomes a **sentence** that says how the game is set up. Its phrases open
**sheets**, and this ticket builds the first three live sheets (Who's here,
Format, Sub interval). They replace the Squad and Game format folds.

## Goal

A coach opens a game and reads one line: "11 players, 4 × 8, subbing every
4 min for even minutes, with no rules." To mark a no-show absent they tap
"11 players", tap the player, and watch the rotation rebuild above the sheet.
Format and sub interval work the same way. Nothing asks for a confirm,
because each tap has already happened.

## Survey (2026-09-16, on `be25ecb`)

Checked against the ticket. Nothing it says is false. These are the facts the
build rests on:

- **What this replaces.** In `app/index.html`, `#view-games` holds
  `section.s-squad > details#squadFold` (summary `Squad` and
  `#availcount`, a polite `role="status"`; body `#avail`, the player pills
  painted by `renderAvail` in `app/game-setup.js`). Below it is
  `details#fmtFold.s-fmt` (summary `Game format` and `#fmthint`; body
  `#periods` and `#periodMinutes` number inputs, and `#gran`, the sub
  interval chips painted by `renderGran`). `app/app.js` has the input
  handlers for `#periods` / `#periodMinutes` (lines ~104–112) and the
  first-paint code that shuts `#squadFold` and `#fmtFold` (lines ~358–373).
  `app/app.css` orders `.s-squad` (1) and `.s-fmt` (2) in the phone stack.
- **The edits to reuse.** A pill tap calls `setAvailable(g, id, available)`
  and then `soon('strategy', ...PLAN_ONLY)`. A format edit sets
  `game()[k]` and calls `soon('strategy', ...AFTER_EDIT)`. A sub interval
  chip does `Object.assign(game(), { granMode, granValue })` and then
  `renderAll()`.
- **The sub interval choices** are `GRAN_CHOICES` in `app/state.js` (eight
  entries: every 2/3/4/5/6 min, 2× and 3× a period, breaks only). First run
  (`onboarding.js`) draws its own chips from the same list, using `label`.
  `storage.js` keeps `granMode` in the three modes and `granValue` in 1–40,
  so a stored game can hold a value the list does not have.
- **Format ranges.** Storage allows periods 1–8 and minutes 1–40. The ticket
  asks for steppers of periods 1–4 and minutes 4–20 (decision 5).
- **Strategy words.** `STRATEGY_WORDS` in `state.js` is one map used by
  `#stratnote` and the game pass summary (#26 decision 1). Closers reads
  `a group finishes`, which does not fit after "for" (decision 3).
- **Rules count.** `ruleCount(g)` (`state.js`, #26) is the one count.
- **Evening out the day** is `g.useCarryover`. `computeAll` evens a later
  game against **all** of the day's earlier games (`cum`), not only the one
  before it. Its switch is in the Rules drawer (`rules.js`, only when
  `state.activeGame > 0`).
- **The numbers for the announcement.** `renderStats` (`plan-view.js`)
  already works out the minute range from `effectiveMinutes(g, p)` and the
  changes as `effectiveStints(g, p).slice(1)` summed over `r.in.length` (the
  Subs tile). A blocked plan is `p.ok === false`, and its reasons are the
  `p.issues` with `severity: 'error'`.
- **There is no sheet yet.** The app has no `<dialog>` element. Its overlays
  are `.keyswrap` divs with `role="dialog"` and the focus trap in
  `app/trap.js`. The team menu is a native `popover`.
- **History.** `render.js` keeps history at most one screen deep
  (`[Today]` or `[Today, X]`). `popstate` paints the screen its state
  names.
- **The tour.** Step 1 in `app/tour.js` points at `#squadFold` / `#avail`
  and opens the fold in `before`. `test/tour-anchors.test.js` pins that an
  anchor inside a fold is opened first.
- **Budgets.** `requests` is 40 of 41. A new module would use the last slot,
  so this ticket adds none (decision 12). Nodes and bytes are alarms only.
- **Tests and checks written against the markup this replaces:**
  `test/game-format.test.js` (the whole file is about `#fmtFold`),
  `test/rules-position.test.js` and `test/this-game.test.js` (`.s-squad`,
  `.s-fmt`), `test/render-sections.test.js` (the `avail` section),
  `test/tour-anchors.test.js` and `test/tour-scroll.test.js` (the step 1
  anchors), `scripts/smoke/overlay.mjs` (`shows: '#squadFold[open]'`),
  `scripts/smoke/game-passes.mjs` (clicks `#avail .plr`) and
  `scripts/smoke/team-color.mjs` (reads `#gran .chip.sel`).
- **Copy that names the folds.** Settings says "You can still change it per
  game under Game format." (`index.html`, the "A game is" row).

## Decisions made in this spec without asking

The ticket was decided with the human. These fill in what it leaves open, in
the direction #18 already points.

1. **Where the sentence sits.** It is the first thing in `#view-games`'s
   `.wrap`, above the day name, at every width. It is `noprint`.
2. **Which words are buttons.** Five phrases on the first line, and the whole
   of the second line:
   - `{N} player(s)` opens **Who's here**.
   - `{periods} × {minutes}` opens **Format**.
   - `{interval}` opens **Sub interval**.
   - `{strategy}` opens the Plan fold (see decision 4).
   - `{n} rule(s)` or `no rules` opens the Rules drawer (decision 4).
   - `Evens out the … game(s).` opens the Rules drawer, where its switch is.

   "subbing", "for", "with", the commas and the full stop are plain text.
3. **Strategy words.** The sentence uses `STRATEGY_WORDS`, so the three
   places that name a strategy still agree. Closers changes from
   `a group finishes` to `a closing group`, so the sentence reads "subbing
   every 4 min for a closing group". The game pass and `#stratnote` change
   with it. The others stay: `even minutes`, `minutes set by hand`,
   `fixed fives`. This is flagged on the PR.
4. **Strategy and rules phrases, until the Plan sheet exists (#28).** The
   strategy phrase opens `#planFold` and moves focus to the selected
   `#stratseg` button. The rules phrase and the evens-out line open
   `#consdetails` and move focus to its `summary`. Both scroll the target
   into view. #28 re-points them at the Plan sheet.
5. **Stepper ranges.** Periods step within 1–4 and minutes within 4–20, one
   at a time. A step is `clamp(value ± 1, min, max)`. The − button is
   disabled at the minimum and + at the maximum. A stored value outside the
   range (say 30 minutes) is shown as it is. Its first − goes to 20.
   Settings keeps its own 1–8 and 1–40 number fields.
6. **Sub interval words.** Each `GRAN_CHOICES` entry gains a `phrase`:
   `every 2 min` … `every 6 min`, `2× a period`, `3× a period`,
   `only at breaks`. The sentence uses the phrase. The sheet row shows it
   with a capital first letter ("Every 4 min", "Only at breaks"). `label`
   stays for first run. A stored value that is not in the list still gets
   words: `every {v} min` or `{v}× a period`. It then has no checkmark in
   the sheet.
7. **The evens-out line names the earlier games.** It shows only for a game
   after the first (`i > 0`) with `useCarryover` on. Each earlier game is
   named by its tip-off, or by its opponent when it has no tip-off. The names
   are joined "a", "a and b", "a, b and c":
   - one earlier game: `Evens out the 9:00 game.`
   - two: `Evens out the 9:00 and 11:30 games.`
   - If any earlier game has neither a tip-off nor an opponent, the line
     reads `Evens out the earlier game.` (or `games.`).
8. **Accessible names.** Each phrase button is named
   `{sheet or target}, {phrase text}`:
   - `Who's here, 11 players`
   - `Format, 4 × 8`
   - `Sub interval, every 4 min`
   - `Plan, even minutes`
   - `Rules, no rules`
   - `Evening out the day, Evens out the 9:00 game.`
9. **Sheet controls.**
   - The ✕ is a button named `Close`, top right (C4, live sheet).
   - The drag handle is a real button, so resizing never needs a gesture
     (I3). It is named `Full height` when the sheet is at half, and
     `Half height` when it is at full.
   - Each sheet has a visible title in an `h2`: `Who's here`, `Format`,
     `Sub interval`. The dialog is labelled by it.
   - All three open at half height.
10. **The announcement lives inside the sheet.** `showModal()` makes
    everything outside the dialog inert, and an inert live region is not
    read out. So each sheet ends with its own polite status line
    (`role="status"`), which is visible and muted. After each change in the
    sheet, once the plan has been re-solved, the line reads the new summary.
11. **Back.** Sheets add no history entry, so history stays one screen deep.
    Android's back gesture closes a modal `<dialog>` natively (a close
    request, the same path Escape takes). Any screen change, including a
    `popstate`, closes an open sheet first. So the browser's back button
    with a sheet open closes the sheet and returns to Today.
12. **No new module.** The sheet primitive (open, close, half/full, swipe,
    outside tap, only one open, focus return) goes into `app/trap.js`,
    which is already the overlay-and-focus module. The sentence and the
    three sheets' contents go into `app/game-setup.js`. The pure helpers go
    into `app/state.js`.
13. **The phrases are updated in place.** The six phrase buttons are static
    markup, and a `sentence` render section rewrites their text and names.
    It never replaces the buttons, so the button that opened a sheet is
    still there to take focus back. `sentence` is in `AFTER_EDIT` and
    `PLAN_ONLY`.
14. **An empty roster.** The sentence still shows (`0 players`). Who's here
    then shows the line `No players on the roster yet.`

## What would settle it

On the smoke suite's `RICH` record (11 players; games `Hawks` 9:00 and
`Ravens` 11:30; both 4 × 8, every 4 min, Even, no rules, evening out off),
at 390×844, with the Hawks game open:

1. **The sentence.** `#sentence`'s first line reads exactly
   `11 players, 4 × 8, subbing every 4 min for even minutes, with no rules.`
   It has no second line. Each of the five phrases is a `button` with the
   decision 8 name, e.g. `Who's here, 11 players`.
2. **The sentence as a function.** `sentenceParts(g, i)` (state.js, pure)
   gives, for:
   - 1 player, 2 × 20, `perPeriod` 3, By hand, 1 rule →
     `1 player, 2 × 20, subbing 3× a period for minutes set by hand, with 1 rule.`
   - `breaksOnly`, Closers, 3 rules →
     `… subbing only at breaks for a closing group, with 3 rules.`
   - a stored `everyN` 7 → `every 7 min`.
   - Ravens (i = 1) with `useCarryover` on, after Hawks at 9:00 →
     second line `Evens out the 9:00 game.`
   - a third game after 9:00 and 11:30 → `Evens out the 9:00 and 11:30 games.`
   - a third game after `9:00` and a game with no tip-off and opponent
     `Owls` → `Evens out the 9:00 and Owls games.`
   - a later game after a game with neither → `Evens out the earlier game.`
   - game 0 with `useCarryover` on, or any game with it off → no second line.

   In the page: turn Ravens' `useCarryover` on, open Ravens, and the second
   line is a button reading `Evens out the 9:00 game.`
3. **Who's here.** Tapping `Who's here, 11 players` opens `#sheetWho`, a
   `<dialog>` that is `open` and modal, at half height (its top edge is
   between 40% and 60% of the viewport height). It lists 11 rows in roster
   order. Each row is a `button` named with the player's name, with
   `aria-pressed="true"` and a visible checkmark. Tapping `Devon Ellis`'s row:
   - leaves the sheet open;
   - flips that row to `aria-pressed="false"` with the visible text `Absent`
     and no checkmark;
   - after the re-plan, the first phrase reads `10 players`, and
     `#timeline` has 10 player rows;
   - leaves focus on that row.

   Tapping it again brings back 11.
4. **Format.** `Format, 4 × 8` opens `#sheetFormat` with two steppers,
   `Periods` and `Minutes each`. Their buttons are named `Fewer periods`,
   `More periods`, `Fewer minutes` and `More minutes`, and each shows its
   value. The periods range is 1–4, so at 4 `More periods` is disabled.
   `Fewer periods` gives 3, and
   after the re-plan the phrase reads `3 × 8` and the timeline's periods
   number 3. `More minutes` from 8 gives 9. From 20, `More minutes` is
   disabled; from 4, `Fewer minutes` is. `stepFormat(v, d, lo, hi)` (pure)
   gives `stepFormat(30, -1, 4, 20) === 20`, `stepFormat(4, -1, 4, 20) === 4`
   and `stepFormat(8, 1, 4, 20) === 9`.
5. **Sub interval.** `Sub interval, every 4 min` opens `#sheetInterval` with
   eight rows, in order: `Every 2 min`, `Every 3 min`, `Every 4 min`,
   `Every 5 min`, `Every 6 min`, `2× a period`, `3× a period`,
   `Only at breaks`. Only `Every 4 min` has `aria-pressed="true"` and a
   visible checkmark. Tapping `Only at breaks`:
   - sets `granMode: 'breaksOnly'`;
   - moves the checkmark;
   - leaves the sheet open;
   - after the re-plan, the phrase reads `only at breaks`.
6. **The announcement.** After each change in steps 3–5, the open sheet's
   `[role=status]` reads exactly `planSay(g, plans[activeGame])`.
   `planSay` (pure) gives:
   - `{lo} to {hi} minutes each, {n} changes`, with `fmtMinutes` numbers and
     `1 change` in the singular;
   - `{m} minutes each, {n} changes` when `lo === hi`;
   - for a blocked plan, `Plan blocked: {the first error's message}`.

   In the page, the text matches `/^\d+(\.\d+)? (to \d+(\.\d+)? )?minutes each, \d+ changes?$/`.
   Marking absent every player but four makes it start `Plan blocked: `.
7. **Sheet behavior**, on `#sheetWho` and on each of the other two at least
   once:
   - **Focus.** On open, focus is inside the dialog. On close, focus is back
     on the phrase button that opened it.
   - **Ways to close.** Each of these leaves the dialog without `open`:
     - the `Close` button;
     - Escape;
     - a click on the backdrop (a point above the sheet's top edge);
     - a pointer drag on the handle downward by more than a quarter of the
       sheet's height.
   - **Resizing.** A pointer drag upward on the handle from half height, or a
     click on the handle button, rests the sheet at full height: its top edge
     is at most 15% of the viewport height, and the handle is then named
     `Half height`. Clicking it again returns to half.
   - **One at a time.** Opening Format while Who's here is open (by calling
     the opener) leaves exactly one `dialog[open]` in the document.
   - **Back.** `history.back()` with Who's here open leaves no
     `dialog[open]`, and Today is on show.
8. **The folds are gone.** `#squadFold`, `#fmtFold`, `#avail`, `#gran`,
   `#periods`, `#periodMinutes`, `#availcount` and `#fmthint` no longer
   exist, and neither do `.s-squad` and `.s-fmt`. Their CSS order lines and
   their `app.js` handlers and first-paint code are removed. The Settings
   copy no longer says "under Game format".
9. **The tour.** Step 1 points at the players phrase (`#phrasePlayers`), and
   its copy says to tap the number of players. It has no `before` that opens
   a fold.
10. **Checks on an open Who's here.** The smoke suite covers an open Who's
    here sheet, on `RICH`:
    - the overlay pass gets a `who's here sheet` state (every control named,
      ids resolve, the last control in the open dialog is reachable);
    - every row in it is at least 48px tall at 320, 360 and 390px;
    - the `app shell at 320px / 32px text` pass gets a `who's here sheet`
      state, with no horizontal overflow and nothing stranded above the
      viewport.
11. **Tinting.** With a team color set, the phrase buttons' text is the tint
    (K1), as `scripts/smoke/team-color.mjs` measures it. That check no
    longer reads `#gran`. It reads a selected state that still exists
    (the selected `#stratseg` button, or the interval sheet's selected row).
12. `npm test` and `npm run smoke` pass. Every test or smoke state listed in
    the Survey's last point is updated or retired in the same change.

## Surfaces

Change:

- `app/index.html`:
  - add the sentence and the three `<dialog class="bsheet">` shells;
  - remove the two folds;
  - Settings copy (item 8).
- `app/game-setup.js`:
  - `renderSentence`;
  - the three sheets' bodies and their handlers;
  - remove `renderAvail`, `renderGran`, `renderFmtHint` and `availCountText`.
- `app/trap.js`: the sheet primitive (decision 12).
- `app/state.js`:
  - pure `sentenceParts`, `intervalWords`, `evensOutLine`, `planSay` and
    `stepFormat`;
  - `GRAN_CHOICES[].phrase`;
  - the Closers words.
- `app/render.js`:
  - the `sentence` section in `AFTER_EDIT` and `PLAN_ONLY`;
  - remove the `avail` section;
  - a screen change closes an open sheet.
- `app/app.js`: remove the fold handlers and the first-paint code.
- `app/roster-view.js`: its `soon('avail', …)` calls become
  `soon('sentence', …)` or drop `avail`.
- `app/tour.js`: step 1.
- `app/app.css`:
  - sentence and sheet styles, with half/full heights in `dvh`;
  - reduced motion drops the slide;
  - remove the `.s-squad` and `.s-fmt` order lines. Keep `.plr`, which
    `.pick` still uses.
- `app/sw.js`: `VERSION` bump and `SHELL` digest.
- `scripts/smoke/`:
  - a new check `sentence and sheets`;
  - the overlay, 320px/32px and row-height states (item 10);
  - update `game-passes.mjs` and `team-color.mjs`.
- `scripts/smoke-checks.js`: a sheet-row measurement, if the row check needs
  one.
- `test/`:
  - a new `test/sentence.test.js`;
  - retire or rewrite `game-format.test.js`;
  - update `rules-position`, `this-game`, `render-sections`,
    `tour-anchors` and `tour-scroll`.
- `scripts/budgets.mjs`: widen `bytesAbs` if the byte ceiling is hit
  (routine; say so in the comment).
- `docs/` and `README.md`: where they describe the game screen.

Must not change:

- `engine.js`, `budget.js`, `storage.js` and `roster.js`;
- the printed card (`card.js`, `card.css`);
- `onboarding.js`'s own sub interval chips;
- `scripts/budgets.json` and anything under `app/vendor/`.

## Constraints

- **The card does not change.** The sentence and the sheets are `noprint`.
  Nothing touches the card's markup, fitting or print styles.
- **Mobile first.** Build and check at 390×844 first, then at 320px with
  32px root text.
- **The four pure modules are untouched.** The new helpers go in `state.js`.
- **No new module.** `requests` stays 40 of 41.
- **Precache bump.** Precached files change, so bump `VERSION` in
  `app/sw.js` and set `SHELL` to the digest `npm test` names.
- **Reuse, do not re-derive:**
  - availability: `setAvailable(g, id, on)` and `availIds(g)`, never a bare
    `g.out` edit;
  - the re-plan after an edit: `soon('strategy', ...PLAN_ONLY)` for Who's
    here, and `soon('strategy', ...AFTER_EDIT)` for format and interval;
  - the rules count: `ruleCount(g)`;
  - the strategy words: `STRATEGY_WORDS`;
  - the interval list: `GRAN_CHOICES`;
  - minutes and changes: `effectiveMinutes(g, p)` and
    `effectiveStints(g, p)`, never `p.minutes` or `p.stints`, with
    `fmtMinutes` for numbers;
  - the label: `gameLabel(g, i)`;
  - player color: `colorOf(id)`, if a row shows a dot;
  - the focus trap's `FOCUSABLE` set and its focus-return rule;
  - the smoke passes' shared state lists and `widthSweep`, `TOUCH_WIDTHS`
    and `TODAY_HOME`.
- **No animation of `top` or `height`.** The sheet rises and follows a drag
  with `transform`. Resting at half or full height may set `height` once,
  but a drag never animates it.
- **Guidelines:**
  - **C3:** a `<dialog>` with a drag handle, resting at half or full, and
    closed by swipe down, outside tap, back or ✕.
  - **C4:** a live sheet has only the ✕, top right. There is no Done.
  - **C5:** only one sheet is open at a time, and a sheet opens nothing on
    top of itself.
  - **C6:** rows are at least 48px, with one control per row. A checkmark
    means chosen.
  - **M2:** the sheet rises. Under reduced motion it appears without the
    slide.
  - **A3:** the polite announcement (decision 10).
  - **I3:** each gesture has a button that does the same (✕, handle).
  - **N6:** a sheet closes on back.
- **Words** (`CONTEXT.md`): `Who's here`, `Absent` (never "Out"),
  `Sub interval`, `Sheet`, `Sentence`, and `Evens out`. Say "sheet" in code
  comments, not "modal" or "drawer".
- **The privacy claim** is unchanged. No new copy makes an absolute upload
  claim.
- **Spelling:** American.

## Design

```
Game (390px)
┌───────────────────────────────────┐
│ ‹  Hawks                          │
│ [11 players], [4 × 8], subbing    │
│ [every 4 min] for [even minutes], │
│ with [no rules].                  │
│ Saturday (day name)               │
│ … This game, Plan, Rules, Rotation│
├───────────────────────────────────┤  ← half height
│              ═══                  │  handle (button)
│ Who's here                     ✕  │
│ Maya Brooks                    ✓  │
│ Devon Ellis               Absent  │
│ …                                 │
│ 16 to 20 minutes each, 21 changes │  role=status
└───────────────────────────────────┘
```

- **`sentenceParts(g, i)`** returns
  `{ players, format, interval, strategy, rules, evens }`. Each is the
  phrase text, and `evens` is `''` when there is no second line.
  `renderSentence` writes them into the static buttons and adds the plain
  words between them.
- **`intervalWords(g)`** looks up the phrase for `granMode`/`granValue`
  (decision 6).
- **`evensOutLine(i)`** returns the decision 7 line, reading
  `state.day.games`.
- **`planSay(g, p)`** returns item 6's text.
- **`stepFormat(v, d, lo, hi)`** returns decision 5's step.
- **The sheet primitive** (`trap.js`):
  - `openSheet(dialog, trigger)` closes any open sheet, shows the dialog
    with `showModal()` at half height, and remembers the trigger.
  - `closeSheet(dialog)` closes it and puts focus back on the trigger.
  - `closeSheets()` closes whatever is open. The screen change in
    `render.js` calls it.
  - The native `cancel` event (Escape, Android back) routes to
    `closeSheet`, and so does a click whose target is the dialog itself
    (the backdrop).
  - The handle takes pointer events: a drag translates the sheet. On
    release, more than a quarter of its height downward closes it, and
    upward past a threshold sets full height. A click toggles half and full.
  - Height is a class on the dialog: `half` or `full`.
- **The sheet bodies** are painted when the sheet opens. After that they
  update in place: a row flips its own state, and a stepper updates its own
  value and disabled state. Once the scheduled re-plan has run, the status
  line is refreshed. Hook that refresh into the `sentence` section, which
  runs after every re-plan, so the line reads the new plan.
- **Strategy and rules phrases** (decision 4) open and focus the existing
  folds. They do not open a sheet.

## Proof

The seams `/tdd` builds at:

- **`node --test test/sentence.test.js`** (new). It imports `state.js` with
  the `document` stub from `test/league-min.test.js`, and exercises
  `sentenceParts`, `intervalWords`, `evensOutLine`, `planSay` and
  `stepFormat` on hand-built games and plans. It covers item 2, item 4's
  `stepFormat` values, item 5's row words (from `GRAN_CHOICES`), item 6's
  `planSay` cases, and decision 3's words.
- **Smoke, new check `sentence and sheets`**, on `RICH` (`setup: 'rich'`).
  It drives the real buttons, keys and pointer events over CDP. It covers
  items 1, 2 (the in-page line), 3, 4, 5, 6, 7 and 8. It reads `plans`,
  `planSay`, `game` and `state` from `state.js` in the page. Geometry comes
  from `getBoundingClientRect`, not `getClientRects`. The drag and the
  backdrop click are `Input.dispatchMouseEvent` at real coordinates. It is a
  guard under `/new-guard`, and must be seen failing against `main`'s markup
  before it passes.
- **Smoke, existing checks** (item 10 and item 11):
  - the overlay pass gets a `who's here sheet` state, and its
    `games view, every disclosure open` state shows `#planFold[open]`;
  - the row-height sweep over Who's here uses `widthSweep` at
    `TOUCH_WIDTHS`, the same pattern as `settingsRowPass`;
  - the `app shell at 320px / 32px text` pass gets a `who's here sheet`
    state;
  - `game-passes.mjs` marks a player absent through Who's here;
  - `team-color.mjs` is re-pointed at a selected state that still exists,
    and measures the phrase text.
- **Existing tests** (item 12): `test/game-format.test.js` is retired, and
  the source-reading tests that named the folds are updated. Those are
  guards: say what each now pins.
- **`npm test`** (item 12).
- **`/browser-verify`** at 390×844, then at 320px with 32px root text, in
  light and dark:
  - a screenshot of the sentence;
  - Who's here at half height with the rotation visible above it;
  - marking a player absent and back;
  - Format and Sub interval;
  - closing each sheet by ✕, Escape, backdrop and drag.

## Out of scope

- The Plan sheet (#28). The strategy and rules phrases point at the existing
  folds until then.
- Timeline or Card, and the card sheet (#29). The stat tiles stay.
- The game's large title and tip-off line (story 15), and the one Start game
  button.
- History entries for sheets. A sheet pushes nothing (decision 11).
- First run's own sub interval chips.
- Commit sheets (add a rule, paste a list), and asking before throwing away
  typed text.
- Checking Android's back gesture on a real phone. It is native `<dialog>`
  behavior, and #18 lists N6 as needing a real phone.
