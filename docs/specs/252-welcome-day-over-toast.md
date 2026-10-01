# #252 — no "day is over" toast on the welcome screen

## Issue

#252: after every team is removed, opening the app on a later day shows
"<yesterday> is over. A new game is ready for today." on the welcome screen,
where there is nothing of the coach's to file.

## Goal

A coach who has no team never hears about days ending. When they do set up a
team, its first game is dated the day they set it up. It shows under Today
and is not filed away the next time the app opens.

## What the survey found

Reproduced under `node` against `app/state.js` on `main` (44e524d):
- **Setup:** a state shaped like Remove-last-team leaves it (`[newTeam('')]`,
  `onboarded = false`), with its one day dated 2026-09-29.
- **Result:** `dueToFile(2026-09-30)` is `true`. `fileIfPast` returns "Tue, Sep
  29 is over. A new game is ready for today."

Why:
- **Remove last team:** `app/teams-view.js:425` puts in `newTeam('')` with
  `onboarded = false`. Its day is dated the day it was made (`app/state.js:187`).
- **`dueToFile`** (`app/state.js:1909`) checks bench mode and past dates only.
  Boot, coming back to the app and closing bench mode all call it
  (`app/app.js:404` `fileOverdueDay`).
- **`freshState`** (first install) builds the same placeholder. A first-time
  visitor who leaves the welcome screen open past midnight has the same day.

The survey also found a second bug, which the human chose to fix here too:
- **`startTeam`** (`app/onboarding.js:389`, the end of the welcome flow) fills
  `state.day.games[0]` and never re-dates `state.day`. A team set up on
  Thursday from a placeholder made on Tuesday keeps Tuesday's date:
  - Today labels it "Tue, Sep 29", not "Today".
  - On the next open the day is past, so it is filed.
  - The game was never started, so filing drops it rather than keeping it, and
    puts in a fresh one with the "is over" toast.
- **Not affected:** the hand-off receiver (`app/handoff.js:143`) swaps out the
  placeholder team whole, and `newTeam` dates every other team it builds as
  today.

## Decisions (made with the human)

1. **No filing while not onboarded.** No toast, and the state does not
   change.
2. **Fix the onboarding date in the same change.** `startTeam` dates the day
   it fills to today.

## What would settle it

Dates: the placeholder day is dated 2026-09-29, and "today" is 2026-09-30.

- **A. Removed last team.** For a not-onboarded state whose one team is
  `newTeam('')` with a day dated 2026-09-29:
  - `dueToFile(2026-09-30)` is `false`;
  - `fileIfPast(2026-09-30)` returns `null`;
  - the state is deep-equal to what it was before the call.
- **B. First install.** The same holds for `freshState()`'s shape with its
  day re-dated to 2026-09-29.
- **C. No regression.** An onboarded team with a day dated 2026-09-29 still
  files on 2026-09-30, exactly as today. The existing `test/season.test.js`
  filing tests stay green unchanged.
- **D. Onboarding re-dates.** Start a team with `startTeam` on 2026-09-30 from
  a placeholder dated 2026-09-29:
  - the team's day is dated `2026-09-30`;
  - `dueToFile(2026-09-30)` is `false`, and the game the coach set up is still
    `days[0].games[0]`, with the periods and minutes the draft gave it.
- **E. In the browser, at 390×844**, under the smoke clock:
  - Seed a stored not-onboarded record whose day is dated the day before the
    clock. Load it. The welcome screen shows, and no toast is visible after
    the page settles.
  - Finish the first-run flow, then reload. The game's day heading reads
    "Today", and no "is over" toast is shown.

## Surfaces

- **Changes:**
  - `app/state.js`: `dueToFile`;
  - `app/onboarding.js`: `startTeam`;
  - `app/sw.js`, from the precache bump;
  - `test/`, and one smoke row under `scripts/smoke/`.
- **Must not change:**
  - `engine.js`, `budget.js`, `storage.js` and `roster.js`;
  - `fileIfPast`'s filing, messages and fallback day;
  - `teams-view.js`'s remove-team path;
  - `handoff.js`;
  - the card.

## Constraints

- **One answer in one place.** `dueToFile` is the single answer to "should
  filing happen" (its own comment, and `app/app.js:394`). Put the onboarded
  check there. Add no second check in `fileOverdueDay` or `fileIfPast`.
- **Reuse, do not re-derive:**
  - Date the day with `seasonDate`. Do not format a date by hand.
  - "Not onboarded" is `state.onboarded === false`, the same question
    `render.js:306` and `setView` ask. Do not infer it from an empty roster.
- **Injectable today.** `startTeam` takes an optional `today = new Date()`, as
  `dueToFile` and `fileIfPast` do, so a test can pin it.
- **Precache.** `state.js` and `onboarding.js` are precached, so run
  `npm run sw:bump`.
- **Mobile first.** The smoke row runs at 390×844.

## Design

1. `dueToFile`: return `false` when `!state.onboarded`, before the date
   check.
2. `startTeam(players, teamName, draft, today = new Date())`: set
   `state.day.date = seasonDate(today)` along with the game fields it already
   sets.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `dueToFile` / `fileIfPast` on a not-onboarded state | `node --test`, `test/season.test.js` (imports `app/state.js`) | A, B, C |
| `startTeam` with a pinned today | `node --test`, `test/first-run.test.js` (imports `app/onboarding.js` and `app/state.js`) | D |
| Seeded stale welcome record, then the first-run flow and a reload | a smoke row under the smoke clock (`scripts/smoke/clock.mjs`) | E |

## Out of scope

- Changing what Remove team leaves behind (the placeholder stays).
- Re-dating anything for an onboarded coach.
- #255 (the hand-off welcome flash).
