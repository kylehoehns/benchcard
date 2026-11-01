# #431 — First run asks what day the game is

## Issue

#431 (from the redesign review). First run never asks what day the game is,
so a coach setting up on Friday night for Saturday gets a game, and a printed
card, dated Friday.

## Goal

A coach setting up their team the night before gets a game and a card dated
the day they will play, without leaving first run.

## Decisions

The ticket is `ready-for-agent`. The survey confirmed its claim: `startTeam`
(`app/onboarding.js`, the `#252` line) sets `state.day.date` to today, always,
and the card's corner (`cornerLabel(state.day.date, ...)`, `app/card.js`)
prints that day's short weekday. Choices the ticket left open, made here:

- **Where:** first run's step 2 ("How long is a game?"), the step that sets up
  the game's format. A "Game day" label and three rows go after the "How often
  do you sub?" rows, in the same label-plus-`.pgrp` shape that section uses.
  The step's heading stays as it is. Add a team (`frMode === 'add'`) has no
  format step and does not ask; it is out of scope.
- **The three choices** are rows, not a three-way segmented control: "Pick a
  date" in a third of a 320px row at 32px text would clip. Rows are the same
  `.prow` + `aria-pressed` + `checkMark()` rows `paintGranRows` draws, so a
  coach meets one kind of single-choice list in this flow.
- **"About 6 PM"** is 18:00 local: at 18:00 or later the default is Tomorrow,
  before it Today. Read from the phone's clock when first run opens.
- **Pick a date** shows a native date field (`flowField(..., 'date')`, the one
  Add a game's step 1 uses) under the rows, prefilled with the date currently
  chosen, `min` today. Clearing the field keeps the last valid date. The field
  is shown only while Pick a date is chosen.
- **`?try=` keeps today.** The sample landing never asks, so `startTeam` falls
  back to today when the draft carries no date, exactly as today.

## What would settle it

1. Coach scenario, clock pinned at 2026-09-12 12:00 (a Saturday): a fresh
   device, Try a sample team, Next, tap Tomorrow, Next. The card's corner reads
   `Sun`, and after Go to the game (tour skipped) Today shows the game under
   `Tomorrow`. Fails on today's code (no Tomorrow control).
2. Coach scenario, clock pinned at 2026-09-12 19:00: step 2 shows Tomorrow
   pressed and Today not pressed. At 12:00, Today is pressed.
3. Coach scenario: Pick a date, set the field to 2026-09-15; the card corner
   reads `Tue`.
4. `startTeam` with a draft with no date still dates the day today (the
   existing #252 test keeps passing unchanged).
5. Look checks with `scripts/look.mjs` on `first run, step 2` at 320 and 390
   wide, 16 and 32px text, top and scrolled to the bottom: no clipped text and
   no cramped wrapping in the Game day rows or the date field. The large-text
   smoke row covering first run step 2 stays green.

## Surfaces

Changes: `app/onboarding.js` (draft fields, step 2's body, `startTeam`'s date),
possibly a few lines of `app/app.css` if the date field needs spacing,
`test/first-run-scenarios.test.js` (or a new scenario file), `test/coach.js` (a
verb that reads the card corner, if none exists), `docs/` lines that describe
first run's steps.

Must not change: `storage.js`, `engine.js`, `budget.js`, `roster.js` (the pure
modules), `state.js`'s `dayHeading`, Add a team's steps, the `?try=` landing's
date, or the card's size.

## Constraints

- Coach-facing: Coach seam first (`AGENTS.md` § Test seams). Mobile first, at
  390x844.
- **Reuse, do not re-derive:** today's ISO date is `seasonDate` (storage.js);
  the corner label is `cornerLabel`; the single-choice row is `.prow` +
  `aria-pressed` + `checkMark()` as `paintGranRows` builds it; the date field
  is `flowField(..., 'date')` (trap.js). "Today"/"Tomorrow" date math is the
  same `new Date(y, m, d + 1)` local-parts form `dayHeading` uses, never
  `new Date('YYYY-MM-DD')` (UTC, a day early west of Greenwich).
- Step 2's body must not rebuild in a way that steals focus from the row the
  coach just tapped (same rule `paintGranRows` follows).
- Every touch target at least 48px (smoke checks this on the first-run steps).

## Design

- The draft gains the chosen game date. `openFirstRun` sets it from the clock
  (Today before 18:00, Tomorrow from 18:00) and remembers whether the coach
  is on Pick a date. `newDraft()` itself carries no date, so `?try=` is
  unchanged.
- Step 2 appends a `span.f.fr-f` "Game day" and a `.pgrp` of three rows:
  Today, Tomorrow, Pick a date. Tapping a row sets the draft and repaints just
  that group, then puts focus back on the tapped row. While Pick a date is
  chosen, the date field sits under the rows.
- `startTeam(players, teamName, draft, today)` sets `state.day.date` to the
  draft's date when it has one, else `seasonDate(today)`.

## Proof

- Coach seam (`test/coach.js`, real Chrome): items 1, 2 and 3. A driver verb
  for the card's corner text and, if needed, for typing a date into a date
  field.
- `node --test` on `startTeam` (`test/first-run.test.js`): item 4, the
  existing test, plus one case that a draft date wins.
- `scripts/look.mjs`, and the smoke rows `app shell at 320px/32px text`,
  `no cut-off text at 320px/32px text`, `touch targets ≥ 48px, 320–390px`
  and `first run: welcome, three steps, every way out`: item 5.

## Out of scope

- Asking the game day in Add a team.
- A tip-off time in first run.
- Changing step 2's heading.
