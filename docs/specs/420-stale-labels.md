# #420 — Five stale or untrue labels

## Issue

#420. Five places show text that is out of date or not true: the sheet status
line, the team name after a rename, the player count after Finish game, By
hand's "as they are" line, and "today" on a future game's Plan sheet.

## Goal

What a coach reads matches what the app is doing, without a reload: the same
change count everywhere, the new team name everywhere, the same player count
on the game screen as in its timeline and Season, a By hand line that does not
contradict its own rows, and no "today" on a game that is not today.

## Decisions

The ticket is `ready-for-agent`. The survey held up all five causes. It left
three things open; each was settled by the option closest to the ticket's
intent:

- **Item 1, where the fix lives.** The four status lines
  (`#sheetWhoStatus`, `#sheetFormatStatus`, `#sheetIntervalStatus`,
  `#sheetPlanStatus`) move to the `summary` section, the one that paints the
  summary line. The ticket says to repaint them "whenever the summary
  repaints", and `closeGameMode` already repaints `summary`.
- **Item 3, which players "played".** The ticket wants the count to agree with
  the timeline's rows and Season's "N played". The rule is the timeline's own
  (#247 item G): a player counts when they are here, or when they are marked
  out but have minutes in the effective rotation. On a game that has not
  started, a player marked out has no minutes, so the count is the same as
  today's `availIds` count. One rule for every stage, not a stage check.
- **Item 5, the words.** The ticket offers "that day" or the date. "that day"
  is picked: it is short at 320px and 32px text, and needs no date format.
  "today" stays when the open day's date is the phone's today
  (`seasonDate(new Date())`).

## What would settle it

Each item has a test that fails on `b297d80` (today's `main`) and passes after.

1. **Sheet status.** On a game in bench mode, after a change that moves the
   change count (a bench swap or Add overtime) and closing bench mode, the
   Plan sheet's `#sheetPlanStatus` reads exactly the summary line `#summary`
   reads (for example `12–16 min each · 23 changes`), with no re-plan in
   between. Same for the other three status lines.
2. **Rename.** Typing a new name, `Alexandria Montgomery-Okafor Hawks`, into
   Settings' Team name field, without a reload: Today's header pill
   (`#teamBtnLabel`), the team switcher's current item, `#backBtn`'s accessible
   name (`Back to Alexandria Montgomery-Okafor Hawks`), Today's Team entry
   (`#todayTeam`) and the Team page's large title (`#teamTitle`) all read the
   new name. The field the coach is typing in keeps focus and its value.
3. **Played count.** A game of 9 where one player is marked out after playing
   some minutes, then Finish game: the game screen's players phrase
   (`#phrasePlayers`) and Today's game card summary (`passSummary`) say
   `9 players`, the timeline lists 9 rows and Season says `9 played`. A player
   marked out before the game starts still drops the count (10 on the roster,
   one out, says `9 players`).
4. **By hand.** With the targets adding up exactly and every row playing its
   number, `#budgetMsg` reads `Adds up exactly, so the plan uses these numbers
   as they are.` With the targets adding up exactly but a rule (Apart, One of
   two on) making some rows play a different number, so at least one `.act`
   shows `plays N`, it reads `Adds up exactly, but the rules changed some rows.
   Each one says what it plays.`
5. **Today.** On a day dated the phone's today, the Plan sheet's Across the
   day footnote is unchanged: `This is the first game today, so there's
   nothing to even out.` and `Players who got fewer minutes earlier today get
   more here.` On a day dated a week ahead, they read `This is the first game
   that day, so there's nothing to even out.` and `Players who got fewer
   minutes earlier that day get more here.`

## Surfaces

Change: `app/game-setup.js`, `app/plan-view.js` and/or `app/render.js`
(item 1), `app/edit.js` (item 2), `app/state.js` and `app/timeline.js`
(item 3), `app/strategy.js` (item 4), `app/rules.js` (item 5), and tests
under `test/`. `test/coach.js` gains a verb only where a step has none.

Must not change: `engine.js`, `budget.js`, `storage.js`, `roster.js`; the card.

## Constraints

- **Reuse, do not re-derive.**
  - Item 1: `planSay` (state.js) is the one builder of the status text, and
    `summaryLine` the one builder of the summary. `renderSummary` and
    `planSay` already compute the same stints/minutes/subs; keep one copy of
    that, not three.
  - Item 3: the "who counts" rule is written once in `state.js` and read by
    `timeline.js`'s row list, `sentenceParts` and `passSummary`. Timeline's
    inline filter (`timeline.js` ~line 258) becomes a call to it. Minutes come
    from `effectiveMinutes(g, p)`, never `p.minutes`.
  - Item 4: "a row plays a different number" is the same test
    `refreshBudgetActuals` uses to show `.act` (half a minute of slack,
    regulation minutes only). Do not write a second version. The message is
    decided after a solve (`refreshBudgetActuals` runs then);
    `updateBudgetUI` runs mid-drag on a stale plan and must not decide it.
  - Item 5: today's date comes from `seasonDate(new Date())`, the same one
    `moveGame` and filing use.
- **A render never repaints the control a coach is using** (render.js top
  comment). Item 2 repaints while the coach types in `#teamName`. A section
  that rewrites that field must leave its value and caret alone.
- `edit.js`'s `EDITS` table is the one place an edit's repaint keys live.
- Coach-facing: each item starts from a red Coach scenario (`test/coach.js`),
  asserting only what is on screen. Item 3's rule may also get `node --test`
  cases on the pure helper if it has several inputs.
- American spelling. No new module in the boot graph (`requests` pin).
- New copy must fit at 320px and 32px text without clipping.

## Design

1. Move the `refreshSheetStatus` call so it runs with the `summary` section,
   and stop running it from `renderSentence`.
2. `teamName` in `EDITS` repaints every section that shows the team name:
   `teams` (pill, switcher, back button), `tabs` (`#todayTeam`), a new
   `teamTitle` section (`#teamTitle` alone, so the roster is not rebuilt
   mid-keystroke), and `cards`. `renderSettings` already runs on every render.
   `teamTitle` joins `AFTER_EDIT`: `test/storage.test.js` forbids the `roster`
   key in `edit.js`, and `test/render-sections.test.js` wants every section in
   an edit list. `renderRoster` writes `#teamName`'s value only when it
   differs.
3. Export one helper from `state.js` for "who this game counts" (here, or out
   with minutes > 0 in the effective rotation). `sentenceParts(g, i)` and
   `passSummary` count with it, using the game's plan when it is ok and
   `availIds(g)` when not. Today's passes span several days (`renderPass`
   reads `dayPlans[d][i]`, teams-view.js), so `passSummary` is handed that
   plan by its caller; `plans[i]` is only the open day's. `timeline.js` uses
   the helper for its rows.
4. In the `exact` state, `#budgetMsg` says the "rules changed some rows" line
   when any row's `.act` is shown after the solve, else the "as they are" line.
5. `renderDayGroup` picks `today` or `that day` from whether
   `state.day.date === seasonDate(new Date())`.

## Proof

- Coach scenarios (`node --test test/<name>-scenarios.test.js`) for items 1,
  2, 3, 4 and 5, each covering its **What would settle it** item.
- `node --test` cases on item 3's helper (here, out with minutes, out without,
  no plan).
- Smoke rows already cover layout at 320px/32px; a `look.mjs` check at 320 and
  390, 16 and 32px, of the Plan sheet and the By hand panel with the new copy.

## Out of scope

- Other places that say "today" outside the Plan sheet's Across the day group.
- Changing the summary line's own wording.
