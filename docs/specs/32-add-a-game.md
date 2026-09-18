# Add a game in three steps

## Issue

[#32](https://github.com/kylehoehns/benchcard/issues/32), cut from #18 and
blocked by #26 (merged). "Add a game" on Today stops creating a game silently
and instead opens a short full-screen flow: who we're playing, who's here, how
minutes should split — with a one-tap "Same as 9:00? Use it" shortcut when the
new game is a copy of the last one.

## Goal

A coach standing on the sideline between games taps **Add a game** and gets
asked the three things that actually differ between this game and the last one,
in that order, on a screen that covers everything else. When nothing differs —
same team, same format, same strategy — one tap on **Use it** makes the game and
opens it, which is the path most second and third games of a day take.

Today the same tap creates a game instantly with no questions, then drops the
coach on the game screen to go find what changed. That is faster to build and
slower to use.

## Survey

Read on 2026-09-18, on `6605424` ("The roster becomes a list, and a player gets
a sheet (#31) (#84)"), `app/sw.js` at VERSION 309 / SHELL 8277addc1925.

1. **`newGame(n, from, settings)` (`app/state.js:110`) already is the whole
   "Use it" behavior.** It sets the format, sub interval, strategy and rules
   from `settings`, mints `seed: (Math.random()*2**31)>>>0`, sets
   `useCarryover: n > 0`, and then, when `from` is passed, copies `periods`,
   `periodMinutes`, `granMode`, `granValue`, `out` (availability),
   `constraints` (rules) and `strategy` off it. The acceptance criterion's list
   — "availability, format, sub interval, strategy and rules, with a new seed
   and evening out on" — is that function, item for item. Nothing about the
   copy needs to be written again.

2. **`addGame()` (`app/teams-view.js:549`) is "Use it" as it stands**:
   `state.day.games.push(newGame(len, lastGame(), state.settings))`, set
   `state.activeGame`, `track('day_game_count', …)`, `setView('games')`. The
   flow's "Use it" and "Plan it" both end in exactly this, and the analytics
   event does not change (`app/analytics.js`'s header says the event list does
   not grow without an explicit argument; `day_game_count` already covers this).

3. **The ticket's "on a day with no games yet" state cannot be reached the way
   it is written.** `newTeam` (`state.js:173`) seeds `day.games` with one game,
   `sanitizeTeam` backfills one when the array is empty, and `startNewDay`
   (`teams-view.js`) builds the new day with one. `state.day.games.length` is
   never 0, so a "no games yet" branch keyed on the count is dead code. See
   decision 6.

4. **Android back.** `openTrap` (`app/trap.js:37`) — the primitive bench mode's
   full-screen `.gm` div uses — handles **Escape only**, at a document-level
   capture keydown. It has no Android-back path and no way for a caller to veto
   a close. A native `<dialog>` opened with `showModal()` fires a cancelable
   `cancel` event for **both** Escape and Android's back gesture, which is the
   only API in the tree that can satisfy "Android back moves to the previous
   step". See decision 1.

5. **The discard ask cannot be `confirmAction`.** `confirmAction`
   (`app/toast.js:512`) drives `#confirm`, which is a plain `<div class=keyswrap>`
   at z-index 320 (`app/index.html:1661`, `app/app.css:1647`). `showModal()`
   inerts every element outside the dialog, so that div would paint behind the
   flow and take no taps. `app/roster-view.js` already solves this for the paste
   and add-player sheets with an in-dialog `.bsheet-cta` ask row swapped in for
   the footer, driven by `guardClose(dialog, ask)` (`trap.js:504`). Same shape
   here. See decision 2.

6. **No new module.** `scripts/budgets.json` pins `requests` at 39, by hand, one
   under the 40 the app actually makes, against a 41 ceiling. A new module would
   spend the entire remaining headroom on this one ticket. The flow's code goes
   in `app/teams-view.js`, which already owns `addGame()` and the
   `#todayAddGame` handler.

7. **The summary line on the "Same as" card already exists.**
   `sentenceParts(g, i)` (`state.js:735`) returns `players` ("9 players"),
   `format` ("4 × 8") and `strategy` ("even minutes") — the acceptance
   criterion's "{N} players, {periods} × {minutes}, {strategy}" is those three
   joined. `STRATEGY_WORDS` is the single map both the game pass and the
   sentence read; a third copy of "even minutes" is a review finding.

8. **`pickFive` (`app/pills.js:16`) is not the step 2 grid.** It is a 3-across
   tile grid with the right CSS (`.pick` / `.plr` / `.plr-check`), but its
   semantics are "choose at most five, with a taken set and a replace slot", and
   it renders initials with no surname line. Step 2 toggles every player with no
   maximum and shows jersey number, first name and surname. The **CSS** is
   reused; the builder is not. See decision 5.

9. **`switchRow` (`app/rules.js:79`) is module-private** and is the app's one
   switch builder. `app/rules.js` imports `icons`, `dom`, `engine`, `state`,
   `pills`, `game-setup`, `trap` and `toast` — none of which imports
   `teams-view.js` — so `teams-view.js` can import from `rules.js` without a
   cycle.

10. **`app/shortcuts.js`'s `onKey` (`:137`) has no guard for an open dialog.**
    It checks `#tour`, `#help`, `#keys` and `#gamemode`, then acts on `p`, `v`,
    `s`, `b`. With the flow open and focus on a tile rather than an input,
    pressing `v` would switch views behind it.

11. **View modules are importable under `node --test`** with the document stub
    in `test/dom-stub.js` (`test/season-view.test.js` does exactly this), so a
    helper exported from a view module has a real unit-test seam.

12. **Smoke sizes.** The 40,000-byte per-file limit
    (`test/smoke-size.test.js`); the largest today is `plan-sheet.mjs` at
    37,300. A new check file starts empty, so the limit is not in play, but the
    registry rows it needs (`overlay.mjs`'s `STATES`,
    `app-large-text.mjs`'s `APP_LARGE_TEXT_STATES`, `touch.mjs`'s
    `TOUCH_STATES`) each grow by one line.

## Decisions made in this spec without asking

The ticket is `ready-for-agent`; every acceptance criterion carries a concrete
value and the survey falsified only the one noted in decision 6. These are the
calls made to close the gaps between the criteria, the prototype and the tree.

1. **The flow is a native `<dialog id="addGameFlow">` opened with
   `showModal()`, not an `openTrap` div.** *Why:* only `showModal()` gives the
   cancelable `cancel` event that Android's back gesture fires, and the ticket
   requires back to step through the flow. It also inerts the rest of the page
   and keeps Tab inside for free. It is **not** a `.bsheet` — it gets its own
   `.flow` class, edge to edge, so the sheet drag/height machinery and
   `closeSheets()` do not apply to it.

2. **The discard ask is an in-dialog `.bsheet-cta` row, not `confirmAction`.**
   *Why:* survey point 5 — a second overlay is inert under `showModal()`. Copy
   is the ticket's: title **"Discard this game?"**, buttons **"Keep editing"**
   (primary) and **"Discard"** (ghost danger), matching `#addAsk` /
   `#pasteAsk` in `app/index.html:1124` and `:1150` exactly.

3. **✕ "Close" sits top left on every step; "‹ Back" is a footer button beside
   the primary one on steps 2 and 3.** *Why:* the prototype puts "Cancel" on
   step 1 and "‹ Back" after it in the header's left slot;
   `notes/mockups/prototype/README.md` records that the app overrides this and
   puts a close ✕ top left on every step (N8, C10). That leaves back without a
   home, and I3 says a gesture is never the only way — so Android back's visible
   twin goes in the footer, where the thumb already is. The header stays the
   prototype's three-column bar: ✕ · "New game" · "N of 3".

4. **The flow edits a detached draft game; nothing is pushed into
   `state.day.games` until the coach commits.** *Why:* a game pushed on open
   would flash on Today behind the flow, be saved to storage mid-edit, and be
   the wrong thing for Undo to snapshot. The draft is built by the same
   `newGame(len, lastGame(), settings)` call "Use it" would make, so the two
   paths cannot drift: "Use it" commits the draft untouched, "Plan it" commits
   it after steps 2 and 3 have edited it.

5. **Step 2 reuses the `.pick` / `.plr` / `.plr-check` CSS and `colorOf`, and
   builds its own tiles.** *Why:* survey point 8 — `pickFive`'s max/taken/
   replace semantics are a different control, and bending it into an unbounded
   toggle that also renders a surname would make one function serve two jobs.
   What must not be duplicated is the tile's look, so the classes are shared and
   the flow adds only what the prototype adds: the jersey number in the player's
   color and a muted surname line.

6. **"No last game" is a real branch, reached through the roster rather than the
   game count.** *Why:* survey point 3 — the count is never 0. The card is
   suppressed when there is no previous game **or** when the previous game has
   no available players (`availIds(last).length === 0`), which is the state a
   brand-new team is actually in: one unplanned Game 1 and an empty roster. A
   "Same as Game 1? 0 players, 4 × 8, even minutes" card would offer to copy
   nothing. With the card gone, the draft's defaults come from
   `state.settings`, which is what the criterion asks for.

7. **The "Even out earlier games" switch appears only when the day has an
   earlier game, and is on when it appears.** *Why:* `newGame` already sets
   `useCarryover: n > 0`, and `app/rules.js:109` already shows the disabled row
   with "This is the first game today, so there's nothing to even out." for the
   first game. A switch that cannot do anything is worse than no switch on a
   screen this short. Since the flow only ever adds game 2 or later, in practice
   it always appears; the branch keeps the rule true rather than assumed.

8. **A tile's absent state reads "Absent", not the prototype's "Out".** *Why:*
   `CONTEXT.md` fixes the word: **Absent**, avoid "out", "sitting out",
   "no-show", "not here".

9. **Availability changes go through `setAvailable(g, id, on)`, never a bare
   `g.out` edit.** *Why:* it is the one place that moves a live override off a
   player who has just been marked absent. On a draft with no live overrides it
   does nothing extra, but the flow must not be the one caller that knows better.

10. **The "Same as" card names the last game by its tip-off, falling back to its
    opponent, falling back to "Game N".** *Why:* the criterion says "{that
    game's tip-off or Game N}" and the mockup shows "Same as 11:30?".
    `evensOutLine` (`state.js:779`) already uses `when || label` in that order
    for the same job, and `gameLabel` supplies "Game N". Same precedence, so the
    two lines cannot disagree about what a game is called.

11. **`shortcuts.js` gets a guard for the open flow**, in the same shape as the
    existing `#gamemode` guard. *Why:* survey point 10 — `v` / `s` / `p` / `b`
    would otherwise change the screen behind an open modal.

12. **The flow cannot ask before a back-to-back close request, so it keeps the
    draft instead.** *Why:* this was measured, not assumed — a bare `<dialog>`
    with none of the app's scripts, once on a `data:` page and once on a real
    http origin, three runs in all. The first close request after a real tap
    fires `cancel` and `preventDefault()` holds. A second one right behind it,
    with nothing touched in between, fires `cancel` and runs
    `preventDefault()` too, and Chrome closes the dialog anyway: the page's
    activation for the close watcher is spent and a handler cannot buy more
    back. On that forced path **no `close` event fires either** (the log ends
    at the second vetoed `cancel`, re-sampled 1.5s later in case it were
    merely late). So none of our code runs at all.

    C4's "ask first" therefore cannot hold for this one close, and the honest
    fix is to make the close harmless rather than to fight it: `draft` is
    module state that outlives the dialog, and `openAddGame` resumes it.
    Doing nothing *is* the mechanism. The `close` listener is for the ordinary
    closes, where `closeSheet` calls `d.close()` and `close` does fire — it
    clears a draft with nothing typed in it so the next open starts at step 1
    rather than resuming a blank. A pushState/popstate alternative was ruled
    out and not merely skipped: a modal dialog's close watcher is first in
    line for a close request, so back never reaches `popstate`.

13. **In the flow only, each part of a tile's name gets its own line, and a
    part too long for the column ends in an ellipsis.** *Why:* the `.pick`
    grid's columns are `minmax(6.5rem, 1fr)`, and at 390×844/16px a real roster
    overflows 7 of 11 tiles — "Rajeshwaran Balasubramanian" loses 37px of 124px,
    "Konstantinos Papadopoulos" 16px of 103px. Widening the column would drop
    the grid below three across, which the spec and `stepTwoReads` both pin.

    Two other fixes were tried and rejected, both on measurement. A two-line
    `-webkit-line-clamp` measures clean across the width while cutting a third
    line off 9 of those 11 tiles (48px of 96px on the longest) — the same loss
    one axis over. `overflow-wrap: break-word` on `.nm` measured clean on
    *both* axes across all 73 shots, and then reading the PNGs showed
    "Konstantin/os", "Bartholom/ew", "Rajeshwar/an", "Wetheringt/on": exactly
    #31's defect, an ordinary name in pieces, invisible to a width comparison
    because each piece fits its own box.

    What ships instead: `tile()` wraps the first name and the surname in their
    own `<span>`s (`.plr-first`, `.plr-sur`) with a real space between them, so
    `.nm`'s `textContent` is still "First Last" for anything that copies a name
    out of the DOM. Each span is a block that clips with `text-overflow:
    ellipsis`, scoped to `dialog.flow` so the roster screen's tiles are
    untouched. A name is then never split mid-word — it either fits or it ends
    in an ellipsis, which is the ordinary way a too-long word is shortened.
    The prototype gave no answer here: every name in it is short.

14. **At large text on a narrow screen the flow bar breaks into two rows, on a
    `@media (max-width: 14em)` query.** *Why:* the bar holds three things --
    the ✕, the screen's name, the step count -- and at 320px with 32px text
    they do not fit one row. The first attempt let the title wrap in place; it
    passed here with 3px of margin and failed CI by 14px, because CI's font
    metrics are wider. A 3px margin is a coin flip, not a fix, so the title
    gets its own row: `.flow-bar-row` drops to two columns, the ✕ and the step
    count share row 1, `.flow-t` spans row 2. Measured after: 223px of room
    for the longest word instead of 14px short.

    `em` in a *media query* is the lever, and this was measured rather than
    assumed (under `Page.setFontSizes`, own Chrome, own origin): unlike `em`
    in a declaration, it resolves against the browser's **default** font size,
    not the root element's. So `14em` means "the viewport is under 14 lines of
    the reader's own text size" -- the only way in plain CSS to ask whether
    the text is large *and* the screen is narrow. A `px` query cannot: 320px
    is 320px whether the text is 16px or 32px, and the bar is fine at 320px
    with ordinary text.

    The footer had the same shape of bug -- `#agNext` ran 5px past the dialog
    at step 2 and 33px at step 3 -- and takes the same shape of fix:
    `.flow-foot` gets `flex-wrap: wrap` and the primary button `flex: 1 1
    9rem`, so "‹ Back" and "Plan it" sit on one row when they fit and stack
    when they do not. No query needed; the wrap is the condition.

## What would settle it

The ticket's acceptance criteria, with the values each one is measured at.

1. **Full screen, step count, close button.** Tapping `#todayAddGame` on Today
   opens `#addGameFlow`. At 390×844 the dialog's bounding box is the full
   viewport (width 390, height 844, within 1px), it covers `#actionbar`, the
   header reads **"New game"** with **"1 of 3"**, and the first control is a
   button whose accessible name is **"Close"**. The progress bar has three
   segments, one marked on.
2. **Android back.** With the flow on step 3, dispatching the browser's close
   request (Escape, which fires the same `cancel` event Android back fires)
   moves to step 2, then step 1, then — with nothing typed — closes the flow and
   leaves `state.day.games.length` unchanged.
3. **Step 1.** Heading reads **"Who are you playing?"**. There is a text input
   labeled **"Opponent"** and one labeled **"Tip-off"**. With a previous game
   present, a card reads **"Same as {tip-off}?"** over
   **"{n} players, {periods} × {minutes}, {strategy words}"** — for the smoke
   fixture's 11-player rich day, **"11 players, 4 × 8, even minutes"** — and a
   button named **"Use it"**.
4. **"Use it" copies.** Pressing it closes the flow, `state.day.games.length`
   goes from 1 to 2, and the new game matches the previous one on `periods`,
   `periodMinutes`, `granMode`, `granValue`, `strategy`, `out` (same members)
   and `constraints`, has a different `seed`, and has `useCarryover === true`.
   The game screen is open on the new game.
5. **Step 2.** Heading reads **"Who's here?"**. There is one tile per roster
   player — 11 for the rich fixture — each showing the jersey number, first name
   and surname, laid out three across. The count line reads **"11 of 11"**.
   Tapping a tile drops it to **"10 of 11"**, marks that tile absent with an
   accessible name that contains "Absent", and puts the player's id in the
   draft's `out`. Tapping again restores it.
6. **Step 3.** Heading reads **"How should minutes split?"**. Four options named
   **Even**, **By hand**, **Closers** and **Platoon**, exactly the four words
   `#stratseg` uses, each with the one-line description `STRATEGIES` holds for
   it. One is selected. Below them a switch labeled **"Even out earlier games"**
   is on. The primary button reads **"Plan it"**; pressing it closes the flow,
   creates the game with the chosen strategy and `useCarryover` matching the
   switch, and opens it.
7. **Discard ask.** Typing "Panthers" into Opponent (or anything into Tip-off)
   and then pressing ✕ does **not** close the flow. The footer is replaced by a
   row reading **"Discard this game?"** with **"Keep editing"** and
   **"Discard"**. "Keep editing" returns to the flow with the typed text intact;
   "Discard" closes it and leaves `state.day.games.length` unchanged. With both
   fields empty, ✕ closes at once with no ask.
8. **No previous game.** With no previous game available to copy — a team whose
   only game has no available players — step 1 shows no "Same as" card and no
   "Use it" button, and the draft's `periods`, `periodMinutes`, `granValue` and
   `strategy` equal the team's settings.
9. **The game lands on Today.** After "Plan it" or "Use it", going back to Today
   shows the new game as a pass, last in day order, its summary line matching
   `passSummary` for the new game.
10. **Mobile first and large text.** At 320px with a 32px root font size, on all
    three steps: no horizontal overflow of `document.documentElement`, no
    element wider than the viewport, every button at least 44px tall, the
    footer's primary button fully on screen, and no word broken mid-word — the
    step 2 tile for a real-length name ("Marcus Williams") stays whole or wraps
    at the space, measured by comparing the rendered text against the name's own
    characters, not by width alone. `APP_LARGE_TEXT_ALLOW` stays empty.
11. **Guards stay green.** `npm test` and `npm run smoke` both pass. Every test
    written against the markup this ticket replaces — the bare `addGame()` path
    — is updated or retired in the same change, not left asserting a screen that
    no longer exists.

## Surfaces

**Changes:**

- `app/index.html` — the `#addGameFlow` dialog shell (bar, progress, body,
  footer, ask row). No step content: the three steps are built in JS.
- `app/app.css` — `.flow` and the step-content classes.
- `app/teams-view.js` — the flow: open, step render, step move, commit, close
  guard. `addGame()` becomes the flow's commit, called from two places.
- `app/state.js` — one pure addition, `sameAsLast()` (decision 10 / criteria 3
  and 8), built from `sentenceParts`, `gameLabel` and `availIds`.
- `app/rules.js` — `switchRow` gains an `export`; its body does not change.
- `app/shortcuts.js` — one guard line for the open flow.
- `app/sw.js` — `VERSION` 309 → 310 and `SHELL` set to the digest `npm test`
  names, **in the same edit**, because every file above is precached.
- `test/` — the new unit tests, plus any existing test that asserts the old
  one-tap `addGame()`.
- `scripts/smoke/` — a new check module, its `registry.mjs` row, and one line
  each in `overlay.mjs`'s `STATES`, `app-large-text.mjs`'s
  `APP_LARGE_TEXT_STATES` and `touch.mjs`'s `TOUCH_STATES`.
- `scripts/budgets.mjs` — only if `bytes` overruns; see Constraints.

**Must not change:**

- `app/engine.js`, `app/budget.js`, `app/storage.js`, `app/roster.js` — the four
  pure modules. Nothing here needs them.
- `scripts/budgets.json` — the `requests` pin especially. Never re-recorded,
  never `--update-budgets`.
- `APP_LARGE_TEXT_ALLOW` and `LARGE_TEXT_ALLOW` — both stay as they are. Raising
  a number in either to clear a new failure is a `REVIEW.md` Blocker.
- `app/vendor/**` and the six generated chart pages.
- `app/analytics.js`'s `EVENTS` — `day_game_count` already covers this.
- The bench-mode `.gm` screen, `#confirm`, and the existing sheets.
- `newGame`'s copy semantics. It is already the acceptance criterion.

## Constraints

**Reuse, do not re-derive:**

- `newGame(n, from, settings)` for the draft **and** for "Use it". One call site
  shape, two buttons.
- `sentenceParts(g, i)` for the "Same as" summary. Do not build
  "{n} players" / "{p} × {m}" / the strategy words again.
- `STRATEGY_WORDS` and `STRATEGIES` for strategy wording — the short words and
  the one-line descriptions respectively. A third copy is a review finding.
- The four strategy button labels exactly as `#stratseg` in `app/index.html`
  writes them: Even, By hand, Closers, Platoon.
- `setAvailable(g, id, on)` for every availability change.
- `switchRow` from `app/rules.js` for the "Even out earlier games" switch —
  export it, do not write a second switch. If exporting it turns out to create
  an import cycle, move it to `app/pills.js` and have both callers import it
  from there; there must be exactly one switch builder either way.
- `guardClose(dialog, ask)` from `app/trap.js` and the `.bsheet-cta` ask row
  from `app/roster-view.js` for the discard ask.
- `.pick` / `.plr` / `.plr-check` CSS and `colorOf` for the step 2 tiles.
- `gameLabel`, `lastGame`, `availIds`, `track('day_game_count', …)`.
- The empty-roster copy already on the Who sheet: **"No players on the roster
  yet."** (`app/game-setup.js:238`).
- Font sizes come from the seven `--fs-*` tokens; `test/type-scale.test.js`
  allows nothing else. The step question is `--fs-large`, the same token
  `.today-h1` uses. Radii come from the `--r-*` tokens; the prototype's 16px
  tile radius is `--r`, its 12px field radius is `--r-sm`.

**Interface guidelines the ticket names:**

- **N8** — full screen, a step count, a close button, always skippable. "Same
  as 9:00? Use it" is the skip.
- **C4** — this is a commit sheet: it collects something before anything
  happens. "If closing would lose typed text, ask first" is criterion 7.
- **C10** — full screen, close ✕ top left, covers everything including the
  floating bar.
- **W2** — buttons are verbs naming the result: "Use it", "Plan it", "Discard",
  "Keep editing", "Close". Not "OK", not "Done".
- **I3** — Android back is a gesture, so it gets a visible twin: the footer's
  "‹ Back" button, which does the same thing.

**Harness traps this walks into:**

- **The precache bump.** Every file under `app/` is precached. `VERSION` and
  `SHELL` move in the same edit as the first `app/` change, and `SHELL` is the
  digest `test/sw.test.js`'s failure message names — not a guess.
- **The `requests` pin.** No new module under `app/`.
- **The byte budget is routine.** If `initialPayload.bytes` overruns its
  ceiling, widen `bytesPct` / `bytesAbs` in `scripts/budgets.mjs` with a comment
  in the same shape as the ones already there — measured, ceiling, headroom left
  — and keep going. Do not touch `scripts/budgets.json`. The one hard
  constraint is `test/budgets.test.js`'s
  `100000 + 100000*bytesPct + bytesAbs < 160000`.
- **Guards go red first.** Every new test and every new smoke check must be run
  against the tree before the code exists, and the failure reported must be the
  behavior's assertion — not an import error, not a typo.
- **Dead ids and classes.** `test/dead-id.test.js` and
  `test/dead-class.test.js` fail on anything written in `index.html` that no
  JS or CSS reads. Keep the shell markup to ids the code actually uses.
- **`git add -A` is blocked.** Stage explicit paths.
- **American spelling** (`test/spelling.test.js`), and no commit trailers.

**Mobile first:** 390×844 before anything else, then 320px at a 32px root.

**The card and the privacy claim:** untouched by this ticket.

## Design

### The shell (`app/index.html`)

```
<dialog id=addGameFlow class=flow>
  ┌──────────────────────────────────────────┐
  │ [✕]        New game            1 of 3    │  .flow-bar  (✕ = #agClose)
  │ ▓▓▓▓▓▓▓▓  ░░░░░░░░  ░░░░░░░░             │  #agProg, three <i>, .on
  ├──────────────────────────────────────────┤
  │                                          │
  │  Who are you playing?                    │  built into #agBody
  │                                          │
  │  Opponent                                │
  │  [ Panthers                           ]  │
  │  Tip-off                                 │
  │  [ Sat 9:00                           ]  │
  │                                          │
  │  ┌────────────────────────────────────┐  │
  │  │ Same as 11:30?          [ Use it ] │  │
  │  │ 9 players, 4 × 8, even minutes     │  │
  │  └────────────────────────────────────┘  │
  │                                          │
  ├──────────────────────────────────────────┤
  │              [      Next      ]          │  #agFoot: #agBack + #agNext
  └──────────────────────────────────────────┘
```

On steps 2 and 3 the footer is `[ ‹ Back ] [        Next        ]`, the back
button sized to its content and the primary one filling the rest. Step 3's
primary reads **"Plan it"**.

The ask row, hidden until needed, replaces `#agFoot`:

```
  │  Discard this game?                      │
  │  [       Keep editing       ]            │
  │  [         Discard          ]            │
```

Ids in the markup: `#addGameFlow`, `#agClose`, `#agStep`, `#agProg`, `#agBody`,
`#agFoot`, `#agBack`, `#agNext`, `#agAsk`, `#agKeep`, `#agDiscard`. Everything
else is built by `el()` in JS and needs no id.

### Step bodies (built in `teams-view.js`)

**Step 1 — "Who are you playing?"** Two labeled inputs writing straight to
`draft.label` and `draft.when` on `input`, using the app's existing label +
input pattern (the `.f` label and input pair `app/index.html:654` uses for the
same two fields on the game screen). Then, when `sameAsLast()` returns
non-null, the card: title, summary line, "Use it".

**Step 2 — "Who's here?"** `.tiles` grid, three across, one `<button>` per
roster player in roster order, `aria-pressed` reflecting present. Each tile:
jersey number in the player's color, first name in bold, surname muted, a ✓ top
right when present. Absent tiles lose their fill and gain a hairline ring. The
accessible name is the full name plus ", Absent" when absent. Under the grid,
the count — "11 of 11" — and, when the draft was copied from a previous game,
one gray line: "Copied from the last game. Tap anyone who's changed." With an
empty roster the grid is replaced by "No players on the roster yet. Build your
roster on the Team page, then come back." This is a first-run screen — a coach
can reach it before ever opening the roster — so unlike the same empty state
inside game setup (`app/game-setup.js`), it says where to go next. Two things
constrain the second sentence: N1 ("there is no tab bar") makes it "Team page",
not "Team tab"; and `test/team-tab-copy.test.js` requires any sentence naming
the Team page to be about levels or the roster, never a setting — so it says
"roster" in the sentence that does the pointing, which is the guard's point
rather than a way around it.

**Step 3 — "How should minutes split?"** A `role=radiogroup` of four `.opt`
cards, each a `role=radio` with `aria-checked`, showing the label from
`#stratseg`'s wording and the description from `STRATEGIES`. Then `switchRow`
for "Even out earlier games", bound to `draft.useCarryover`.

### Behavior

```
openAddGame(trigger)
  draft = newGame(state.day.games.length, lastGame(), state.settings)
  step  = 1
  dialog.showModal();  paint()

paint()
  #agStep   -> `${step} of 3`
  #agProg   -> segment `step-1` gets .on, the others lose it
  #agBody   -> replaceChildren(stepBody(step))
  #agFoot   -> back shown when step > 1; next labelled "Next" / "Next" / "Plan it"
  focus moves to the step's heading (a11y: the screen changed)

next()  step < 3 ? (step++, paint()) : commit()
back()  step > 1 ? (step--, paint()) : requestClose()

requestClose()
  dirty = draft.label.trim() || draft.when.trim()
  dirty ? showAsk(true) : close()

commit()                       // "Plan it" and "Use it" are the same two lines
  state.day.games.push(draft)
  state.activeGame = state.day.games.length - 1
  track('day_game_count', { games: state.day.games.length })
  close(); setView('games')
```

`dialog.oncancel` — the one event Escape **and** Android back both fire — calls
`preventDefault()` and then `back()`. That is what makes back step through the
flow and close it from step 1. `#agClose` calls `requestClose()` directly, so ✕
asks from any step rather than walking back to step 1 first.

The discard ask is `#agAsk` shown and `#agFoot` hidden, exactly as
`roster-view.js` does it: `#agKeep` hides the ask, `#agDiscard` clears the
typed fields and closes.

### `sameAsLast()` (`app/state.js`)

```js
/** The "Same as …?" card's two lines, or null when there is nothing to copy. */
export function sameAsLast()
  // -> null when state.day.games is empty, or the last game has no
  //    available players (decision 6)
  // -> { title: `Same as ${g.when || gameLabel(g, i)}?`,
  //      summary: `${players}, ${format}, ${strategy}` from sentenceParts(g, i) }
```

Pure, reads only `state.day.games`, and re-derives nothing.

## Proof

The `/tdd` seams, in build order.

1. **`sameAsLast()` — `test/add-game.test.js` under `node --test`**, importing
   `app/state.js` with `test/dom-stub.js`, in the shape
   `test/game-pass.test.js` already uses. Covers **What would settle it** 3
   (the card's exact two lines, including "11 players, 4 × 8, even minutes"),
   8 (null with no copyable previous game), and 10's precedence — tip-off,
   then opponent, then "Game N".
2. **The draft's copy — same file.** Asserts that
   `newGame(len, lastGame(), settings)` produces a game matching the previous
   one on `periods`, `periodMinutes`, `granMode`, `granValue`, `strategy`,
   `out` and `constraints`, with a different `seed` and `useCarryover === true`;
   and that with no previous game the four values come from settings. Covers 4
   and 8. This is a characterization of existing behavior written first because
   two buttons now depend on it.
3. **`switchRow` is exported once — same file**, asserting `app/rules.js`
   exports it and that neither `rules.js` nor `teams-view.js` builds a second
   `input[switch]`. A source guard, named here so it counts as a seam, written
   under `/new-guard`.
4. **A new smoke check, `scripts/smoke/add-game-flow.mjs`**, registered in
   `scripts/smoke/registry.mjs` with `setup: 'rich'` (11 players, booted on
   Today), run at 390×844. It is the seam for everything that needs a browser:
   - opens the flow from `#todayAddGame` and measures the dialog's box against
     the viewport, reads "New game" / "1 of 3", the ✕'s accessible name and the
     three progress segments (settles 1);
   - presses Escape from step 3 down to step 1 and once more, checking the step
     count each time and `games.length` at the end (settles 2);
   - walks all three steps, reading every heading, the two field labels, the
     card's two lines and the "Use it" button, the tile count and the count
     line, a tile tap in both directions, the four option names with their
     descriptions and the switch's label and state (settles 3, 5, 6);
   - presses "Use it" on a second open and reads back the new game's fields
     from `localStorage`, then "Plan it" on a third (settles 4, 6, 9);
   - types an opponent, presses ✕, reads the ask row's three strings, presses
     "Keep editing" and checks the text survived, reopens and presses
     "Discard" and checks `games.length` (settles 7);
   - returns to Today and reads the new pass's position and summary
     (settles 9).
5. **Large text and touch — existing suites, one row each.** The flow's three
   steps go into `app-large-text.mjs`'s `APP_LARGE_TEXT_STATES` (320px at 32px
   root) and `touch.mjs`'s `TOUCH_STATES`; the open flow goes into
   `overlay.mjs`'s `STATES` for the accessibility audit. `APP_LARGE_TEXT_ALLOW`
   stays empty — if a state fails, the screen is fixed, not the map. Settles 10.
6. **The replaced markup — existing tests.** Any test asserting that
   `#todayAddGame` creates a game on the tap is rewritten against the flow or
   retired. Settles 11.
7. **`/browser-verify` at 390×844, then 320px at 32px root**, for what no
   harness can judge: that the three steps look like
   `notes/mockups/prototype/{light,dark}-add-game-{1,2,3}.png` minus the tab
   bar, that Chrome's repeated `preventDefault()` on `cancel` really does step
   back three times rather than closing on the second press, and the screenshot
   set for `notes/mockups/prototype/compare/32/` — light, dark, 320px at 32px
   root, long real-length names, every scroll area scrolled to its bottom, the
   full-height state, and the first-run state with an empty roster.

## Out of scope

- **Editing an existing game through the flow.** Add only. The game screen
  stays the place a game is changed.
- **Rules in the flow.** Step 3 sets the strategy and the carryover switch.
  Rules are copied from the last game and edited on the Plan sheet, as now.
- **`startNewDay`'s first game.** A new day still gets one game made directly,
  not through the flow.
- **A new analytics event.** `day_game_count` already fires.
- **Removing the tab bar or any other prototype/guideline reconciliation** not
  named by this ticket.
- **Touching `newGame`'s copy semantics.** They are the acceptance criterion
  already.
