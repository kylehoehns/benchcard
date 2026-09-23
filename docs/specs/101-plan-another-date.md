# #101 — Plan games for another date

## Issue

#101, the second slice of #64 (plan games for a future day). A coach can add a
game for a future date; Today shows every day, stacked in date order, and its
large title becomes the team name.

## Goal

On Friday night a coach sets up Saturday's two games and Sunday's one, as two
separate days. Today reads as the team's schedule, not "today": each day under
its own heading, the team's name at the top. Sunday's game is planned on its
own — Saturday's minutes reach it only once Saturday is filed into the season.

## Decisions this slice rests on

Settled with the maintainer on #64 (2026-09-22) and in `CONTEXT.md` (**Day**,
**Filing**, **Today**): a day has a real date and an optional name; a team holds
any number of days; Today stacks them in date order; Today's title is the team
name and is the team menu; evening out stays within one day; there are no empty
days; a game moves to another day by changing its date on the game screen; no
dates before today can be picked.

Decided while writing this spec, unattended (the ticket leaves them open; each
follows from the docs as noted):

- **Storage key bumps to `benchcard.v7`.** One day becomes a list of days
  (`teams[].days`); a v6 build reading a v7-shaped record under its own key
  would see no `day` and rebuild an empty one, which is the misread the header
  of `app/storage.js` says a new key exists for. #100's spec named this slice as
  the bump.
- **A team always has at least one day with at least one game.** Today's
  invariant (a team always has a game — `sanitizeTeam` falls back to
  `newGame(0, …)`) is kept rather than re-derived: when the list would be empty
  (a new team, or every day filed), it holds one day dated today with one new
  game, exactly what #100's filing builds now. "No empty days" means no day with
  zero games, never zero days.
- **"Same as …?" offers the team's last game** — the last game of the last day
  — because that is the game the coach set up most recently, which is what N8's
  shortcut copies.
- **The team menu lives on the large title.** `#teamBtn` moves out of the bar
  into Today's `h1`. When the large title collapses on scroll (L4), the bar shows
  the team name as plain text, the same way every other screen's collapsed title
  works; the menu is back at the top. C1 allows at most two actions on the right,
  and the bar already carries the gear, so a second copy of the menu in the bar
  is not added.
- **Filing several past days** (possible now that days are a list) shows one
  toast. One day: #100's copy unchanged. More than one: `"<n> past days: <k>
  games saved to the season."`, or `"<n> past days are over."` when nothing
  solved. `" Started a new day."` is appended only when filing leaves no days and
  the fallback day is created (one past day, nothing solved, nothing left keeps
  #100's exact copy).
- **Where the date shows on the game screen:** the day's heading (same label as
  on Today) leads `#gameSub`, and a date input sits in the "This game" box beside
  Opponent and Tip-off.

## What would settle it

1. **Migration.** A v6 record with `teams[].day = {name, date, games}` loads as
   `teams[].days = [{name, date, games}]` with every game, plan input, live
   progress, season and setting unchanged, and `activeGame` pointing at the same
   game. Same for v5, v4, v3, legacy and a restored backup. A v7 record keeps its
   days; days are sorted by date; a day with no games is dropped; two days with
   the same date merge (games in stored order); a malformed date becomes today
   (as #100). The record saves under `benchcard.v7` / `benchcard.v7.bak` and
   stamps `version: 7`; every inline key chain in `app/index.html` and the
   theme line in every other `app/*.html` page reads `benchcard.v7` first.
2. **Add a game, step 1.** A native `<input type="date">` labelled "Date" sits
   above Opponent and Tip-off, `min` = today (local `YYYY-MM-DD`), defaulting to
   the last day's date. Committing for a date with no day creates that day in
   date order; for a date that already has a day, the game goes at the end of
   that day. The new game's "Even out earlier games" defaults on only when its
   day already has games (the rule `newGame` applies by index today). "Same as
   <tip-off>?" still shows and copies the team's last game.
3. **Changing a game's date.** The game screen shows the day's heading at the
   start of `#gameSub` and a "Date" input (`#gameDate`, `min` today) in "This
   game". Changing it moves the game to the end of that date's day (created if
   needed); the source day disappears if it has no games left; the game screen
   stays on the moved game. A value before today or empty is ignored and the
   input shows the game's date again.
4. **Today stacks the days.** Each day renders as its own group, in date order,
   with a heading: `"Today"` for today's date, `"Tomorrow"` for the next,
   otherwise the phone's short weekday, month and day (en-US `"Sat, Sep 27"`);
   when the day has a name, `" · <name>"` follows. Its game passes sit under it,
   and tapping one opens that game.
5. **Title and menu.** Today's large title is the team's name (`teamLabel`, so
   `"Team 1"` when unnamed) and is the team-menu button (`#teamBtn`, N3); the
   separate "Today" title is gone. At 320px wide with 32px root text, a
   30-character team name wraps or truncates with no horizontal scroll, and the
   gear stays on screen and tappable.
6. **Back buttons.** `#backBtn` has the accessible name `"Back to <team
   name>"`, updated when the team is renamed or switched.
7. **Evening out stays within each day.** With Sat (2 games) and Sun (1 game),
   Sunday's game has no carryover from Saturday's games, its "Even out earlier
   games" is off and disabled as the first game of its day, and Saturday's second
   game still evens out against Saturday's first.
8. **Resume bar.** A part-played game on any day — including a day that is not
   the one currently open — shows the Resume bar, and Resume opens that game in
   bench mode.
9. **Filing every past day.** With the clock at 2026-09-28 and days dated
   2026-09-26, 2026-09-27 and 2026-09-29, filing files the first two under their
   own dates, keeps the 29th, and shows one toast with Undo per the copy above;
   Undo restores all three days and the season exactly.
10. **Removing a game.** "Remove this game" shows whenever the team has two or
    more games in total; removing the last game of a day drops the day.
11. **Look check** (`/browser-verify`, and a smoke check for the numbers): 3
    days with 2, 1 and 3 games; a long day name (40 characters); scrolled to the
    bottom; 390×844 and 320px at 32px text; light and dark. No horizontal
    scroll, no heading or pass clipped, every pass reachable.
12. `npm test` and `npm run smoke` pass; tests and smoke checks written against
    `teams[].day`, the "Today" title or "Back to Today" are updated in the same
    change.

## Surfaces

Changes: `app/storage.js` (v7 key, `days`), `app/state.js` (the `day` accessor,
per-day plans, filing, add/move/remove), `app/teams-view.js` (Today groups,
title, add-a-game Date, remove), `app/card.js` (`resumeBarAt` across days),
`app/game-setup.js`, `app/app.js` (wiring `#gameDate`), `app/render.js` (bar on
Today, back-button name), `app/index.html` (title, `#gameDate`, key chains),
`app/app.css`, the other `app/*.html` theme lines, `app/onboarding.js` and
`app/roster-view.js` and `app/plan-view.js` where they read the day, tests,
`scripts/smoke/*`, `scripts/og.mjs` / `scripts/charts.mjs` / `scripts/bands.mjs`
if they write records, `app/sw.js` (`VERSION`, `SHELL`).

Must not change: `app/engine.js`, `app/budget.js`, `app/balance.js` (the
solver), `app/card.js`'s card rendering (#103 owns the card's corner), the
season's shape, tip-off as free text (#102 owns it).

## Constraints

- **The shape is the migration** (`app/storage.js` header): no version branch
  in `sanitize`; a record with `day` and no `days` is the migration, and running
  sanitize twice is a no-op.
- **Reuse, do not re-derive:** `seasonDate` for every `YYYY-MM-DD`; `localDate`
  for parsing one (never `new Date('YYYY-MM-DD')`, which is UTC); `weekdayLabel`
  (state.js) for the short date, shared with the day headings rather than a
  second formatter; `teamLabel` for the team's name everywhere (title, back
  label); `newGame(n, from, settings)` for new games; `undoable` for filing's
  toast; `sameAsLast` stays the one source of the shortcut; `addSeasonGames` for
  filing; the plan cache keyed by `g.id` so per-day plans do not re-solve
  unchanged games.
- **Keep `state.day` as the accessor for the open day** (`teams[].activeDay`
  indexing `teams[].days`, `activeGame` indexing that day's games) so the
  game-screen code that reads `state.day` keeps meaning "this game's day";
  everything that must see every day (Today, Resume bar, filing, remove) walks
  `days` explicitly.
- **"Today" is injectable**: every function that asks what today is takes it as
  an argument defaulting to `new Date()`.
- **Mobile first, 390×844; nothing clips at 320px / 32px text** (T2, T4). The
  look check needs real-data states: long names, scrolled to the bottom, full
  height.
- **The storage-key chains in HTML are pinned by tests** to `KEY`; bump them
  with it.
- **Precache bump:** any change to a precached file bumps `VERSION` in
  `app/sw.js` and sets `SHELL` to the digest `npm test` names.
- Interface guidelines: N1, N2, N3, N5, N8, L4, C1, C6, T2, T4, A2, W1
  (sentence case copy; headings are not buttons; the pass rows stay ≥48px).

## Design

- **Storage.** `teams[].days: [{ date, name, games }]`, sorted by date, plus
  `teams[].activeDay`. `sanitizeTeam` builds `days` from `raw.days`, or from
  `[raw.day]` when only `day` exists; merges same-date days; drops empty ones;
  falls back to one day dated today with `newGame(0, null, settings)`; clamps
  `activeDay`, then `activeGame` against that day. `KEY = 'benchcard.v7'`, v6
  joins the older-key list, `complete` checks `version === 7`.
- **State.** `day` becomes an accessor over `team().days[team().activeDay]`.
  `computeAll` solves each day on its own (carryover and deficits reset per
  day), keeping `plans` = the open day's plans and adding `dayPlans[d]` for all
  days. Helpers: `dayFor(date)` (find or insert in order), `addGame(g, date)`,
  `moveGame(date)`, `removeGame()`, `openGame(d, i)`.
- **Filing.** `archiveDay(d)` files one day with `dayPlans[d]`; `fileIfPast`
  files every past day in date order and then applies the fallback rule;
  `dueToFile` asks whether any day is past (bench-mode rule unchanged).
- **Today.** `renderTabs` renders one group per day: a heading (`dayHeading(day,
  today)`) and that day's passes. `h1` holds `#teamBtn` with the team name; the
  bar's Today cluster keeps `#keysHint` and `#settingsBtn`. `#backBtn`'s
  `aria-label` is set in `renderTeams`.
- **Add a game.** Step 1 gets a Date field (`flowField` with type `date`, `min`
  today); the draft carries its date, re-deriving `useCarryover` when the date
  changes; `commitFlow` calls `addGame`.
- **Game screen.** `#gameSub` leads with `dayHeading`; `#gameDate` in "This
  game" calls `moveGame`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `sanitize` / `sanitizeTeam` / `loadState` exports; the HTML key-chain pins | `node --test`, `test/storage.test.js`, `test/first-paint.test.js` | 1 |
| state exports (`addGame`, `moveGame`, `removeGame`, `computeAll`/`dayPlans`, `sameAsLast`, `fileIfPast` with a pinned today) over the DOM-stub fixture | `node --test` | 2, 3, 7, 9, 10 |
| `dayHeading` with a pinned today | `node --test` | 4 |
| `resumeBarAt` across days | `node --test`, `test/resume-bar.test.js` | 8 |
| smoke: a three-day fixture (2/1/3 games, 40-char day name) renders three headings in order with their passes; title is the team name and opens the team menu; `#backBtn` is "Back to <team>"; add a game for tomorrow through the flow; no horizontal overflow at 390 and 320/32px | `npm run smoke`, named checks | 2, 4, 5, 6, 11 |
| `/browser-verify` on the preview: the three-day fixture, scrolled to the bottom, 390×844 and 320px at 32px, light and dark | preview | 5, 11 |

## Out of scope

- Tip-off as a time and sorting by it — #102.
- The card's weekday and time — #103.
- Naming a day from Today (the name is still edited in "This game").
- Logging games for past dates; evening out across days.
