# #632 — Ask whether a game that was never started was played

## Issue

#632: a game the coach only printed (never run in bench mode) should be able
to count toward the season. The grilling on 2026-11-06 changed the ticket's
answer. The owner chose not to file these games automatically, and not to
carry them forward silently. **The app asks.**

## Goal

A coach who coaches from the printed card opens the app later and sees each
past game they never started, with three choices: it was played, play it
today, or it didn't happen. A played one counts toward the season's minutes
from then on. Nothing is guessed on their behalf.

## Decisions (owner, 2026-11-06)

1. The question is a **card at the top of Today**, not a popup. It blocks
   nothing and stays until answered.
2. **Unanswered games wait and do not count.** They are not in the season, so
   season totals and "Even out earlier games" ignore them until answered.
3. **One row per game,** each with its own three buttons.
4. **Started games still file silently**, exactly as today (`part-played` or
   `finished` from `stage()`).
5. **The night-before carry (#379) is removed.** A game set up Friday night is
   asked about on Saturday like any other, and "Play it today" is how the
   coach keeps it. `carryUnplayedDay` and its three call sites go.
6. This replaces #133's "left out" rule. Never-started games are no longer
   dropped; they are asked about.

## What would settle it

Coach scenarios with a pinned clock (`test/coach.js`), on the sample team
(10 players):

1. **Asked, not filed.** A day dated 2026-09-26 holds Northgate (part-played,
   `live.at` 2) and Kingsway (solved, never started). Booting on 2026-09-28
   files Northgate only: `season.games` holds 1 game. Today shows the card with
   one row, `Sat, Sep 26 · Kingsway`, and buttons `Played`, `Move to today`,
   `Didn't play`. The filing toast reads
   `Sat, Sep 26: 1 game filed to the season.` with no "left out" sentence.
2. **Played.** Tapping `Played` on that row files Kingsway under 2026-09-26
   with its planned minutes (`effectiveMinutes`, which with no swaps equals
   `plan.minutes`). `season.games` holds 2 games. The card is gone. The toast
   reads `Kingsway is in the season.` with Undo; Undo brings the row back
   and leaves the season at 1 game.
3. **Didn't play.** Tapping `Didn't play` removes the row and files nothing.
   The toast reads `Kingsway removed.` with Undo, and Undo brings the row back.
4. **Move to today.** Tapping `Move to today` puts Kingsway, with its roster,
   who's-here list, format and rotation, into today's day (2026-09-28). The
   row is gone. The toast reads `Kingsway moved to today.` with Undo. The
   game's id is unchanged.
5. **Night before.** First run on 2026-10-30 at 21:00 with the sample team,
   then a boot on 2026-10-31 at 09:00. Today shows the card with one row,
   `Fri, Oct 30 · Game 1`. After `Move to today`, today's day holds exactly
   that one game (same id and the same five players in every stint), not that
   game plus the empty one filing made (see Design, "The filler game").
6. **Several.** Two past days, 2026-09-26 (Kingsway, never started) and
   2026-09-27 (Ravens and Game 2, never started), booted on 2026-09-29. The
   card shows 3 rows, oldest first: `Sat, Sep 26 · Kingsway`,
   `Sun, Sep 27 · Ravens`, `Sun, Sep 27 · Game 2`. Answering one leaves the
   other two.
7. **Waiting does not count.** While Kingsway waits, the season minutes
   `computeAll` reads (`seasonShare(team().season.games)`) do not include it.
8. **Survives a reload and a backup.** A waiting row is still there after a
   reload, and after exporting and re-importing a backup. A row whose player
   was removed from the roster keeps the other players' minutes only.
9. **Per team.** A second team's waiting rows do not show on the first team's
   Today.
10. **A link for a past game.** A hand-off link for a game dated yesterday,
    received today (#379's case 3), behaves as any game on that date: on the
    next filing it is asked about.
11. **Unsolved games** (`p.ok` false) are still dropped silently, as today.

## Surfaces

- Changes: `app/state.js` (`archiveDay`, `fileIfPast`, the new answer
  functions; `carryUnplayedDay` removed), `app/storage.js` (`sanitizeTeam`
  keeps the waiting list), `app/app.js` (the carry calls go),
  `app/handoff.js` (its carry call goes), `app/teams-view.js` (the card on
  Today), `app/app.css` or the existing Today styles, `app/sw.js`
  (`npm run sw:bump`), `scripts/whats-new.json` and `app/whats-new.html`,
  `app/sitemap.xml` (What's new `<lastmod>`).
- Tests that encode the old rules are **rewritten to the new rule, not
  deleted**: `test/season.test.js` (#133 block), `test/day-list.test.js`,
  `test/game-day-scenarios.test.js`, `test/reopen-scenarios.test.js`,
  `test/night-before-scenarios.test.js`, `test/handoff.test.js`,
  `scripts/smoke/dated-day.mjs`.
- Docs (doc-writer): `CONTEXT.md` (Filing), `docs/design-decisions-season.md`,
  `docs/architecture/bench-mode.md` lines 89-90.
- Must not change: `app/live.js` (`stage` stays the one "started" signal),
  `app/engine.js`, the printed card, `seasonGame`'s shape.

## Constraints

- "Started" is `stage(p, g.live)` from `live.js`, read once, as `archiveDay`
  does now. Do not re-read `live.at`.
- The minutes filed on `Played` are the ones snapshotted at filing time with
  `effectiveMinutes(g, p)`. Do not re-solve the game to get them: a waiting
  game is not in any day, so `computeAll` has no plan for it.
- Filing goes through `seasonGame` and `addSeasonGames` (idempotent by id).
  No second way to build a season game.
- Moving a game into a day reuses `dayFor` and `sortDay` (as `addGame` does).
- Every answer is wrapped in `undoable` (P6: act, then offer Undo). The answer
  buttons ask nothing more.
- Filing keeps its guards (`dueToFile`: not while bench mode is open, not
  before onboarding).
- Coach copy is plain words (memory: no "bench mode", "stint", "filed" on the
  card itself). The card says what happened in a coach's words.
- Interface guidelines: the card is an inset group on Today (§ the inset
  groups rule), buttons are at least 44px tall, nothing clips at 320px wide or
  at 32px text. The card is not a sheet or a dialog.
- `sanitizeTeam` gates the new list like everything else: a bad entry is
  dropped, minutes keep only ids on the roster, dates must be valid.

## Design

**The waiting list.** Each team gains `unplayed: []`. An entry is
`{ game, date, dayName, label, minutes }`: the sanitized game record, its
day's date and name, `gameLabel(g, i)` as it read in its day, and the
`effectiveMinutes` snapshot. It is capped like the season (reuse
`SEASON_MAX`'s idea; oldest dropped first).

**Filing.** `archiveDay` files `part-played` and `finished` games exactly as
now. A `not-started` solved game is pushed onto `t.unplayed` instead of the
old skipped list. `fileIfPast` drops the "was never started" sentence. Its
other toasts are unchanged ("… is over." when nothing filed; "A new game is
ready for today." when it built the fallback day).

**The filler game.** When `fileIfPast` builds the fallback day (no days
left), it records that game's id as `t.filler`. `Move to today` replaces that
game instead of adding next to it when all of these hold: today's day is the
only day, that game is its only game, its id is `t.filler`, and it was never
started. Any answer, or any game added, clears `t.filler`. Otherwise
`Move to today` adds the game to today's day and sorts it.

**Answers** (in `state.js`, one function each, called from the card):
`playedUnplayed(i)`, `moveUnplayedToday(i, today)`, `dropUnplayed(i)`.

**The card.** At the top of Today, above the day list, only when the active
team's `unplayed` is non-empty. Title: `Did you play these?` (one row:
`Did you play this game?`). One line under it: `They were planned but never
started in the app. Played games count toward minutes.` Then one row per
entry, oldest first: `<weekdayLabel(date)> · <label>`, and three buttons:
`Played`, `Move to today`, `Didn't play`.

## Proof

- **Coach seam** (`test/coach.js`, pinned clock): items 1-6, 8 (reload and
  backup), 9, 10. Each starts red.
- **`node --test` on `state.js` / `storage.js` exports:** item 7 (season
  share ignores waiting games), item 8's sanitizer cases (bad entry dropped,
  removed player's minutes dropped), item 11, the filler rule's negative cases
  (filler started, a second game in the day, a second day).
- **Smoke:** `scripts/smoke/dated-day.mjs` updated: Ravens is asked about, not
  left out, and the toast has no "left out" sentence.
- **`/browser-verify`**: the card at 320 and 390 wide, 16px and 32px text,
  light and dark, with 1 row and with 3 rows, and with a long game label.

## Out of scope

- Asking about started games (decision 4).
- A popup or a reminder outside Today.
- Changing how the Season screen shows or removes filed games.
