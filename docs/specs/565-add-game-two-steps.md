# 565 — Add a game asks two things, not three

Short brief (light review lane, part of #561). The issue is the record of what
was asked; this lists each acceptance value, the seam that tests it, and the
choices the issue left open.

## Issue

#565: drop Add a game's step 3 ("How should minutes split?"). A new game takes
the strategy the team used last; the coach changes it from the game sentence.

## Survey (on `6e3db04`)

- Step 3 is `stepSplit` in `app/teams-view.js` (`FLOW_STEPS[2]`): five strategy
  cards. #563 already took the day switch off it, so the issue's "Even out
  earlier games" switch is gone.
- The issue's Platoon claim (`UNITS_MISSING` when picked here) no longer
  holds: #569 made `addGame` (`app/state.js`) call `fillForStrategy`, which
  fills empty groups and closers. Removing the step removes the path anyway.
- `newGame(n, from, settings)` copies the last game's strategy, groups,
  closers and the `unitsBuilt`/`closersBuilt` flags (`copySetup`, `plan:
  true`); a first game is `'balanced'` (Even). `freshDraft()` builds the
  draft from the team's last day's last game.
- The step count, progress segments and the last step's "Add game" button are
  all counted from `FLOW_STEPS`, so removing the entry makes them say 2.
- Coach copy naming three steps: How it works (`app/index.html`, "A tournament
  day, and the season": "asks three questions … skip the other two
  questions"). The tour names no step count.
- Smoke rows that walk to step 3: `scripts/smoke/add-game-flow.mjs` ("1 of 3",
  item 6), `add-game-visuals.mjs` (step 3's look), `flow-inset.mjs`,
  `app-large-text.mjs` (`add a game, step 3`), and `scripts/look.mjs` views.
  First run (`#firstRunFlow`, `app/onboarding.js`) is a separate three-step
  flow and is not touched.

## What would settle it

1. Add a game shows "1 of 2", then "2 of 2" on Who's here, whose primary
   button reads **Add game** and creates the game. Two progress segments.
   (Coach seam, `test/coach.js`; smoke `add-game-flow.mjs` updated to 2 steps.)
2. A team's first game is Even (`balanced`). (Coach seam.)
3. A game added after a Closers game is Closers, with the same closers; a game
   added after a Platoon game is Platoon with the same groups (and
   `unitsBuilt`/`closersBuilt` carried as before); a Platoon game whose groups
   are empty still gets them filled on add, as `addGame` does today.
   (Coach seam.)
4. The "Same as …?" card still adds the game in one tap, unchanged.
   (existing tests/smoke stay green.)
5. Add a game still copies Who's here, rules and format (existing
   `test/add-game.test.js` and smoke stay green).
6. "Make up minutes from" on a new game follows `newGameMakeUp`
   (`docs/specs/563-make-up-minutes.md`, decision 4) -- reused, not
   re-derived. Unchanged by this ticket.
7. Plans for existing games do not change: a seeded fingerprint test
   (`test/add-game-565-fingerprint.test.js`) whose hash was recorded on
   `6e3db04` before any edit. It seeds teams with every strategy as the last
   game, adds a game through `newGame` + `addGame` and plans every game with
   `computeAll`.
8. How it works says two questions and "skip the other question".
9. Look checks: both steps at 320 and 390 wide, 16 and 32px text, long names
   (e.g. "Alexandria Montgomery-Okafor"), Who's here scrolled to the bottom,
   full height. No clipping.
10. What's new entry (plain words, one change): Add a game now asks two
    things, and a new game plans the same way as your last one; to change it,
    tap it in the sentence on the game screen.

## Choices the issue left open

- **Where the reversal of #32 is recorded:** `docs/specs/32-add-a-game.md`,
  as a dated note under its Goal (`docs/design-decisions.md` is at its size
  cap).
- **Unused step 3 styles** (`.flow-opts`, `.opt` and the radio look in
  `app/app.css`) are removed only if nothing else uses them.
- **How it works copy:** "asks two questions: who you're playing and who's
  here … A new game plans the same way as your last one. To change it, tap it
  in the game's sentence."

## Out of scope

First run's three steps; Settings League rules (#566); any change to how a
strategy is picked on the Plan sheet.
