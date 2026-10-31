# 428: the "Same as" card adds the game it names

## Issue

#428: on Add a game, the "Same as…" card adds whatever the draft became after
steps 2 and 3 were edited, not the game its label describes.

## Goal

A coach who taps "Same as 11:30 AM? 11 players, 4 × 8, even minutes" gets a
game with 11 players, 4 × 8 and even minutes. That holds even if she wandered
into steps 2 or 3, changed something, and came Back.

## What would settle it

- On RICH's day (`coach.onGameDay()`: 11 players, Hawks 9:00 AM, Ravens
  11:30 AM, 4 × 8, even minutes), open Add a game, sit Marcus Williams down on
  step 2, pick Closers on step 3, go Back twice, tap the card. The added game
  shows `Who's here, 11 players`, `Format, 4 × 8` and `Plan, even minutes`.
  Red on today's code.
- An opponent typed on step 1 ("Owls") before tapping the card is the added
  game's title.
- The #32 and #416 scenarios and unit tests stay green.

## Survey, and what it changed

- The flow has no format step, so on one team the format cannot drift. The
  issue's "format matches the card's label" is read as the card's whole
  summary line. Players (step 2) and strategy (step 3) are what drift.
- The card sits on step 1 beside Date, Opponent and Tip-off. Its label does
  not name them, and the help text says only the opponent and tip-off are new.
  So the card keeps those three fields and drops every other draft edit. The
  issue says it "ignores any unsaved draft edits"; keeping step 1's fields is
  the choice closest to its intent, because dropping a typed opponent would be
  a new bug.

## Surfaces

- Changes: `app/teams-view.js` (the Add a game flow), `test/day-scenarios.test.js`.
- Must not change: `app/state.js` (`sameAsLast`, `newGame`), the four pure modules.

## Constraints

- Reuse, do not re-derive: the card's fresh game comes from the same builder
  `openAddGame` uses (`freshDraft()`), not a second copy of the `newGame` call.
- `useCarryover` for the kept date follows step 1's Date rule
  (`carriesOver(date)`), shared rather than written twice.
- One commit path: the card still ends in `commitFlow`, which clears the draft.

## Design

Extract `freshDraft()` from `openAddGame`. The card's handler builds a fresh
draft, copies `date`, `label`, `tipoff` onto it, sets `useCarryover` from the
date, and calls `commitFlow()`.

## Proof

- Coach seam, `test/day-scenarios.test.js`: the two scenarios above cover all
  three "What would settle it" items. The existing suite covers the third.

## Out of scope

- Per-team drafts (#416 chose to start fresh).
- Any change to what the card's label says.
