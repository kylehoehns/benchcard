# #100 — Days have dates and file themselves

## Issue

#100, the first slice of #64 (plan games for a future day). A day gets a
calendar date, and a day whose date has passed files itself into the season.
The **New day** button goes away.

## Goal

A coach never has to remember to press New day. On Sunday morning the app opens
with Saturday's games already in the season, filed under Saturday's date — not
the date someone happened to tap a button — and an empty day ready for today.
Nothing a coach has saved is lost on the way to the new shape.

## Decisions this slice rests on

Settled with the maintainer on #64 (2026-09-22) and already in `CONTEXT.md`
(**Day**, **Filing**, **Filed game**). Recorded here so the build does not
re-open them:

- A day has a real calendar date; its name is optional.
- Filing is automatic: a day dated before today files on its own. There is no
  button. Only games whose plan solved file, and a part-played game files the
  minutes it actually produced — the same rule New day has today.
- Existing saved data: the current day is dated today on first load.

Decided while writing this spec (not user-facing trade-offs, so not escalated):

- **No new storage key in this slice.** The change is one added field,
  `teams[].day.date`. A v6 build that has not updated yet reads a record with
  that field and ignores it, which is harmless — the key bump exists for when
  stale code would *misread* new data (see the comment at the top of
  `app/storage.js`). #101, which turns one day into a list, is the slice that
  needs a new key.
- **Filing waits while bench mode is open.** A game running past midnight must
  not be filed out from under the coach mid-stint. Filing runs at boot, when
  the app returns to the foreground, and when bench mode closes — whichever
  comes first once bench mode is not open.
- **The toast always says what happened**, even when nothing solved: a day
  vanishing silently reads as data loss.

## What would settle it

1. **Migration.** A v6 record with no `day.date` loads with `day.date` equal to
   the phone's local date (`YYYY-MM-DD`, same rule as `seasonDate`), and the
   day's name, games, plans, live progress, season and settings unchanged. The
   same holds for a backup file restored through `restoreBackup`, and for v5,
   v4, v3 and legacy records. A record with a valid `day.date` keeps it; a
   malformed one (`"2026-13-40"`, `42`, `""`) is treated as absent.
2. **Filing, dated by the day.** With the clock at 2026-09-28 and a day dated
   2026-09-27 holding three games of which two solved, filing adds exactly two
   filed games, each with `date: "2026-09-27"`, and replaces the day with one
   game dated 2026-09-28 built the way New day builds it now
   (`newGame(0, lastGame(), settings)`, `out = []`), name empty.
3. **Only past days file.** A day dated today does not file. A day dated
   tomorrow does not file (reachable today only through a hand-edited backup,
   but it must hold).
4. **Part-played minutes.** A part-played game in a past day files the minutes
   `effectiveMinutes` gives — the same function New day uses today.
5. **Idempotent.** Filing twice (boot then an immediate foreground) files each
   game once; `addSeasonGames` already dedupes by id and must still be the path.
6. **Toast with Undo.** One toast per filing, through `undoable`:
   - games filed: `"Sat, Sep 27: 2 games saved to the season."`
     (`"1 game"` for one), the date formatted with the phone's locale as short
     weekday, short month, day — en-US gives `Sat, Sep 27`;
   - nothing solved: `"Sat, Sep 27 is over. Started a new day."`
   Undo restores the day and the season exactly as they were. (After Undo the
   day is still in the past; it files again on the next boot or foreground —
   that is correct, not a loop, because nothing re-triggers in between.)
7. **Bench mode.** With bench mode open and the day's date in the past, a
   foreground event does not file; closing bench mode does.
8. **New day is gone.** `#todayNewDay`, `startNewDay` and every string telling a
   coach to press New day are removed. The Season screen's empty state reads
   `"Games file here once their day has passed."`. `docs/` and `README.md`
   no longer describe a New day button.
9. `npm test` and `npm run smoke` pass, and any test written against markup
   this slice removes is updated or retired in the same change.

## Surfaces

Changes: `app/storage.js` (sanitize `day.date`; `seasonGame` dated from the
day), `app/state.js` (`archiveDay` → filing of a past day; the "is it due"
check), `app/teams-view.js` (remove New day), `app/app.js` and/or
`app/gamemode.js` (the boot / foreground / bench-mode-close triggers),
`app/index.html` (remove the button), `app/season-view.js` (empty-state copy),
tests under `test/`, `app/sw.js` (`VERSION`, `SHELL`).

Must not change: `app/engine.js`, `app/budget.js`, `app/balance.js` (the
solver), `app/card.js` (the card — #103 owns its one change), the season's
shape (`seasonGame` keeps its fields; only where `date` comes from changes).

## Constraints

- **The shape is the migration** (`app/storage.js` header). No version branch in
  `sanitize`; an absent `date` is the migration. Keep it idempotent.
- **Reuse, do not re-derive:** `seasonDate` for every `YYYY-MM-DD`;
  `effectiveMinutes` for filed minutes; `addSeasonGames` for appending;
  `undoable` for the toast and Undo (P6, C9); `newGame(0, lastGame(), settings)`
  for the replacement game, exactly as `startNewDay` does now. `dateLabel` in
  `season-view.js` already turns a `YYYY-MM-DD` into a local label without a
  UTC shift — use it (or move it somewhere shared) for the toast's date rather
  than writing a second parser.
- **`new Date('2026-09-27')` is UTC midnight** and reads as the 26th west of
  Greenwich. Never parse a stored date that way; compare `YYYY-MM-DD` strings
  or build dates from parts.
- **"Today" is injectable.** Every function that asks what today is takes it as
  an argument defaulting to `new Date()`, so tests pin the clock.
- **Precache bump:** any change to a precached file bumps `VERSION` in
  `app/sw.js` and sets `SHELL` to the digest `npm test` names.
- Copy is sentence case (W1), American spelling.

## Design

- `sanitizeTeam`: `day.date` is kept when it matches `YYYY-MM-DD` and is a real
  calendar date; otherwise `seasonDate(today)`.
- `seasonGame(g, minutes, { dayName, date })`: `date` is the day's `YYYY-MM-DD`,
  passed through. Callers pass the day's date, never "now".
- `archiveDay` becomes the filing step for the current day: it files the solved
  games under `state.day.date`. A small pure predicate — `dayIsPast(day, today)`
  — answers whether a day is due.
- One entry point, e.g. `fileIfPast(today = new Date())`, runs the predicate and,
  when due, does exactly what `startNewDay` did inside `undoable`, with the new
  toast copy, and stamps the new day with today's date. It is a no-op while
  bench mode is open. It is called after boot's first render, on
  `visibilitychange` to visible, and when bench mode closes.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `sanitize` / `sanitizeTeam` exports | `node --test`, `test/storage.test.js` | 1 |
| `seasonGame` export | `node --test`, `test/storage.test.js` | 2 (date field) |
| `dayIsPast` and the filing entry point with a pinned today | `node --test` (existing state/DOM-stub pattern) | 2, 3, 4, 5, 6 (copy), 7 |
| smoke: Today has no `#todayNewDay`; a fixture with a past-dated day boots to a filed season and the toast | `npm run smoke` (named checks) | 6, 8 |
| `/browser-verify` at 390×844: boot with a past-dated fixture, read the toast, tap Undo | preview | 6 |

## Out of scope

- More than one day, adding a game for another date, the stacked Today and the
  team-name title — #101 (which also bumps the storage key).
- Tip-off as a time and sorting by it — #102.
- The card's corner — #103.
