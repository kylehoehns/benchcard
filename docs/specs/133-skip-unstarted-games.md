# #133 — Games that were never started get filed into the season as played

> **Decided by the owner on 2026-09-25: #135 lands first, and it has.**
> #135 merged as a28e6ad. "Finished" is now a saved fact,
> `live.finished === true`, set only by Finish game. Reopening a finished
> game no longer clears it, so a game played in full always files.
>
> One case still reads `not-started` at filing: the coach opened bench mode
> and closed it on stint 1 without pressing Next or Finish game. Nothing was
> played from the plan, so the game is left out. Item 7 pins this.

## Issue

#133, under #153. When a day files, `archiveDay` (`app/state.js:1608`) keeps
every game whose plan solved (`p && p.ok`). It never asks whether the game was
played. So a game nobody started (rained out, forfeited, planned by mistake)
goes into the season with its planned minutes.

The owner decided on 2026-09-25: **option 1, skip games that were never
started.** Options 2 and 3 are out of scope.

## Goal

When a day files, only games that were started go into the season. A game that
was never started is left out, and the filing toast says so by name. Undo on
that toast puts the whole day back, both games included, exactly as it does
today.

## Decisions

- **"Started" is `live.js`'s `stage`, read once, never re-derived.** A game is
  filed when `stage(p, g.live)` is `'part-played'` or `'finished'`. It is left
  out when `stage` is `'not-started'`. `stage` returns `null` for a plan that
  did not solve, and that game stays out as it does today.
- **A skipped game is dropped with its day.** The ticket settles this. The day
  files and leaves Today as it does now. Its never-started games go with it
  and are not kept anywhere. The filing toast's Undo is the way back ("Undo
  still restores both"). They are not kept on Today and not moved to the next
  day:
  - Keeping a past day on Today would make `dueToFile` true on every boot and
    every return to the app, so it would try to file again each time.
  - Moving them forward was never offered in the ticket.
- **The toast's first sentence stays as it is, and one sentence is added.**
  The wording "`<Sat, Sep 26>`: N games saved to the season." and "`<day>` is
  over." does not change. Wording is #149's job, and those strings are pinned
  by tests and a smoke check. When any game was skipped, one sentence follows
  it:
  - exactly one skipped game, across all the days that filed: it is named with
    `gameLabel(g, i)` (`state.js:526`). That is the opponent, or "Game N" when
    there is no opponent. For example: "Ravens was never started, so it was
    left out."
  - two or more: they are counted, not named: "2 games were never started, so
    they were left out." A tournament day could skip five games, and five
    names do not fit one toast.
  - The existing " Started a new day." still comes last, and still only when
    nothing was filed and filing left no days.
- **An unsolved game is not a skipped game.** A plan that did not solve was
  never playable. It stays out silently, as it does today, and is not counted
  in the new sentence.
- **A one-stint plan follows the same rule.** Since #135, `stage` reads a
  one-stint plan at stint 0 as `'not-started'` unless the coach tapped
  Finish game. So a one-period game with no subs (`breaksOnly`) files only
  if it was finished. That comes from reusing `stage`, and is left as it
  is.
- **The split happens in `archiveDay`, once.** It sorts a day's solved games
  into filed and skipped in one pass and reports both. `fileIfPast` builds the
  toast from that report. No second filter over the same games elsewhere.

## What would settle it

The clock is pinned to Monday 2026-09-28, as `test/season.test.js` already
does. "Finished" below means `live` is `{ at: <the plan's last stint index>, overrides: {}, finished: true }`, as Finish game saves it.
"Never started" means `live.at` 0 with no overrides.

1. **One played, one never started.** A day dated 2026-09-26 (Saturday) has
   two solved games: Northgate, part-played (`live.at` 2), and Kingsway,
   never started. `fileIfPast` files **1** game. `season.games` ids are
   exactly `['g0']`, and its minutes equal `effectiveMinutes` for Northgate.
   The message is exactly
   `Sat, Sep 26: 1 game saved to the season. Kingsway was never started, so it was left out.`
2. **An unnamed skipped game.** Same as 1, with Kingsway's label set to `''`.
   The second sentence reads `Game 2 was never started, so it was left out.`
3. **Two skipped.** Three solved games dated 2026-09-26: Northgate finished,
   Kingsway and an unnamed third game never started. `season.games` ids are
   exactly `['g0']`. The message is exactly
   `Sat, Sep 26: 1 game saved to the season. 2 games were never started, so they were left out.`
4. **Nothing started.** A day dated 2026-09-26 whose only game, Northgate, is
   solved and never started. The season stays empty. Today gets a fresh day
   dated 2026-09-28. The message is exactly
   `Sat, Sep 26 is over. Northgate was never started, so it was left out. Started a new day.`
5. **An unsolved game is not counted as skipped.** Two games dated
   2026-09-26: Northgate finished, and Kingsway with 4 of 10 available (its
   plan does not solve, `ok === false`). The message is exactly
   `Sat, Sep 26: 1 game saved to the season.` That is today's copy, with
   nothing added.
6. **Several past days.** Days dated 2026-09-26 (game A finished, game B never
   started), 2026-09-27 (game C never started) and 2026-09-29 (one game). The
   message is exactly
   `2 past days: 1 game saved to the season. 2 games were never started, so they were left out.`
   Only 2026-09-29 is left in `days`.
7. **A game with bench mode opened but still on stint 0 is left out.**
   Northgate at `live.at` 0 with one override on stint 0 is skipped and
   named. This pins the case in the note at the top.
8. **The season ignores the skipped game.** After item 1, with an empty
   season beforehand: `seasonShare(t.season.games)` equals
   `seasonShare([the filed Northgate game])`. A new game on 2026-09-28 with
   "Even out the season so far" (`useSeasonTargets`) on plans exactly as it
   would if only Northgate had ever been filed. In the browser, after item 9's
   boot, the Season screen's heading reads "4 games filed" and its filed list
   has Hawks under Jan 6 and no Ravens.
9. **In the browser, with Undo.** The `dateddayfiling` smoke check's past day
   (RICH's Saturday dated 2024-01-06) has Hawks finished (`live.at` 7, the
   last of its 8 stints, and `finished: true`) and Ravens never started. On boot:
   - the season has **4** games: RICH's 3 and Hawks. Ravens is not in it.
   - the toast reads exactly
     `Sat, Jan 6: 1 game saved to the season. Ravens was never started, so it was left out.`
   - Today shows 1 game, the fresh day.
   - Tapping Undo shows 2 games on Today (Hawks and Ravens). The day, its games
     (Hawks' `live` included) and the season in the saved record are exactly
     what they were before filing.
10. **Nothing re-derives "started".** `test/live-guard.test.js` stays green
    with no change to it. `app/live.js` is byte-identical to `main`.
11. **The longer toast fits.** At 390×844, and at 320px wide with 32px root
    text, the item 9 toast and its Undo button are fully on screen. Nothing
    sits above the top of the viewport or off either side.

## Surfaces

- Changes:
  - `app/state.js`: `archiveDay` (the split, and its report) and `fileIfPast`
    (the added sentence). It imports `stage` from `./live.js`. The comment
    block above `archiveDay` ("`p.ok` is the one honest signal") is updated to
    say what is filed now.
  - `app/sw.js`: `VERSION` and `SHELL`.
  - `test/season.test.js`: new tests for items 1–5, 7 and 8. Existing tests
    that file games move their fixtures, not their assertions (see
    Constraints).
  - `test/day-list.test.js`: item 6, and the existing "fileIfPast files every
    past day" test's fixture.
  - `scripts/smoke/dated-day.mjs`: the `PAST_DAY` fixture, and what it
    expects (item 9).
  - `docs/design-decisions.md` (the "A day that ends is kept" entry, around
    line 96), `docs/architecture.md` (filing, around line 875) and
    `CONTEXT.md`'s **Filing** entry: one clause each, saying games that were
    never started are left out. This goes to the doc-writer.
- Must not change:
  - `app/live.js`, since `stage` is reused as it is. #135 set what
    "finished" means.
  - `app/gamemode.js`, `app/app.js` (`fileOverdueDay` and its `undoable`
    wrapper), `app/toast.js`.
  - `app/storage.js`: `seasonGame`, `addSeasonGames`, `seasonShare`.
  - `app/season-view.js`: it only reads `season.games`, so leaving a game
    out at filing is enough.
  - `scripts/smoke/fixtures.mjs`'s `RICH`. Every other check uses it. Only
    `dated-day.mjs`'s own copy of the day changes.

## Constraints

- **Reuse `stage` from `app/live.js`. Do not re-derive "started".** No
  `live.at` comparison, no `> 0`, and no check of "does `live` exist" or "are
  there overrides" in `state.js` or anywhere else. `test/live-guard.test.js`
  already fails on a `live.at` comparison outside `live.js`. Do not add an
  exception to it. `state.js` does not import `live.js` today. The import adds
  no request, since `live.js` is already in the boot graph through `card.js`,
  `gamemode.js`, `teams-view.js` and `timeline.js`, so `REQUESTS_BASELINE`
  does not move. Nothing in `live.js` imports `state.js`, so this makes no
  cycle.
- **Reuse `gameLabel`** (`state.js:526`) for the skipped game's name. Do not
  build another "opponent or Game N" string.
- **Reuse `weekdayLabel`** and the existing message shapes in `fileIfPast` for
  the first sentence. The new sentence is added to them. They are not
  rewritten.
- **Reuse `undoable`, through `fileOverdueDay` as it is.** Undo already
  snapshots the whole record, so it brings back both games with no new code.
  Do not add a second restore path.
- **Existing filing tests keep their assertions and change their fixtures.**
  `test/season.test.js`'s `setup()` builds never-started games, and 11 tests
  there expect them to file: "a day of games lands in the season", "a game
  that never produced a rotation" (its solved game), "archiving twice", "a
  team with no season yet", "the season belongs to the team", "state.season
  is a non-enumerable accessor", "replaceState swaps the record", and four in
  the `fileIfPast` block ("a past day files its solved games", "filing
  twice", "names the day's own weekday", "one game files with singular
  copy"). `test/day-list.test.js:373` does the same. Mark those games
  started, for example with a `started` option on `setup()` that marks each
  game finished, the way Finish game saves it. Do not weaken or delete an assertion to
  get green. A test that checks a return value of `archiveDay` follows its
  new report shape.
- **Precache bump.** `state.js` is precached (`sw.js:55`). Bump `VERSION` in
  `app/sw.js` and set `SHELL` to the digest `npm test` names, in the same
  change.
- **Guidelines:** P6 (undo, don't ask: no confirm when a day files), C9 (one
  Undo toast; a new one replaces the old). C9 asks for "one line". The added
  sentence makes the toast two sentences, which the ticket's own example
  already does. Item 11 checks that it still fits.
- **Glossary words:** "filed", "season", "never started". Not "archived",
  "played" (for a filed game) or "in progress" (`CONTEXT.md`).
- **American spelling** (`test/spelling.test.js`).
- Mobile first: check the toast at 390×844, then 320px with 32px text.
- One issue: the toast's "saved to the season" wording (which `CONTEXT.md`
  says to avoid for a filed game) is left for #149.

## Design

`archiveDay(d)` walks the day's games with their plans, as now. For each solved
game it asks `stage(p, g.live)`:

- `'part-played'` or `'finished'`: build `seasonGame` from `effectiveMinutes`,
  as now.
- `'not-started'`: record `gameLabel(g, i)` in a skipped list.

It adds the filed games with `addSeasonGames`, as now, and returns both the
number added and the skipped labels. `fileIfPast` adds up both across every
past day it files. It then builds the message it builds today, and adds the one
sentence from the Decisions when the skipped list is not empty. It adds
" Started a new day." last, under the same condition as now. Bump the precache.
Update the smoke fixture and expectations.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `archiveDay` / `fileIfPast` with a pinned clock | `node --test test/season.test.js`, through `state.js`'s exports (`fileIfPast`, `archiveDay`, `computeAll`, `plans`, `effectiveMinutes`, `seasonShare` from `storage.js`) | 1, 2, 3, 4, 5, 7, 8 (the planning half) |
| Several past days | `node --test test/day-list.test.js` (`withDays`, `state-fixture.js`) | 6 |
| No re-derivation, `stage` unchanged | `node --test test/live-guard.test.js test/live.test.js`, and `git diff main -- app/live.js` is empty | 10 |
| Filing on boot, toast, Undo | `node scripts/smoke.mjs --only 'a past-dated day files itself on boot, no "New day"'` (`scripts/smoke/dated-day.mjs`), then the full `npm run smoke -- --no-tests` | 9 |
| Season screen count, toast fit | `/browser-verify` on `npm run serve`: boot the item 9 record, read Season's "N games filed" heading and its filed list (no Ravens), and measure the toast's box at 390×844 and at 320px / 32px root | 8 (the screen half), 11 |
| Precache | `node --test test/sw.test.js` | the bump |

`npm test` then `npm run smoke -- --no-tests`, once, by whoever commits.

## Out of scope

- Remembering that bench mode was opened, so a game closed on stint 1
  without a Next would file. That would be a new issue.
- Options 2 ("file them as Not played") and 3 (ask the coach).
- The toast's "saved to the season" wording, and every other item under #153
  (#149 owns wording).
- A never-started game's planned minutes still count in the same day's "Even
  out earlier games" (day carryover) before the day files. That is the day,
  not the season.
- Filing for teams other than the active one.
