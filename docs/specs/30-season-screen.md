# 30 — Season screen

## Issue

#30 (parent #18; blocker #23 merged as PR for "Today is home"; built on #69's
restyle, #29's card sheet). Season, opened from Today, shows minutes so far per
player with who is behind or ahead, the across-the-day chart for a tournament
day, the filed games by day, and the spreadsheet export. The chart leaves the
game screen.

## Goal

A coach between games opens Season and reads, without scrolling, who is behind
on minutes this season. Below that, on a tournament day, the across-the-day
chart that used to sit on the game screen. Below that, the games already filed,
grouped by the day they were played, each opening to the minutes it recorded.
The spreadsheet is one button in the header. With nothing filed the screen says
so in one line.

## Survey (2026-09-17, on `0ce42d8`)

Nothing in the ticket is false. The facts the build rests on:

- **The screen** is `main#view-season.view.wrap.noprint` in `app/index.html`,
  `max-width:820px`, holding one `.side-box` with `p.note#seasonCount`, a
  second `p.note` of prose, and `div#seasonbox`. `applyView` (`app/render.js`)
  toggles its `hidden`, writes `SCREEN_TITLE.season = 'Season'` into
  `#barTitle`, and hides `#barTitle` only when `v === 'games'`.
- **The painter** is `renderSeason()` in `app/season-view.js`, render key
  `season` in `SECTIONS` (`app/render.js`), deliberately in neither
  `AFTER_EDIT` nor `PLAN_ONLY` (`test/render-sections.test.js` holds that in
  its `KEEP` map, reason: nothing about today changes what is filed).
- **The ledger's parts**, all in `season-view.js`: `seasonGames()` (exported;
  `teams-view.js` counts Today's Season row with it), `totals(games)`
  (exported, sorted furthest-behind-first off `seasonShare`), `offNote(off)`
  (` · N behind` / ` · N ahead` / `''`), `playerRow(id, min, extra)`,
  `dateLabel(iso)` (`Sep 14`, parsed as parts so it does not slip a day west of
  Greenwich), `gameTitle(g, sep)`, `seasonCsv(games)` (exported), `saveCsv`,
  `gameBlock(g)`, `deleteGame(id, title)`.
- **`seasonShare(games)`** (`app/storage.js`) returns `{ played, expected,
  deficit, appearances }`. It is the one answer for behind/ahead and for
  attendance; `totals` reads it and must not re-derive either.
- **A filed game** is `seasonGame(...)` (`app/storage.js`):
  `{ id, date: 'YYYY-MM-DD', day, opponent, periods, periodMinutes, minutes }`.
  `minutes` holds a key for everyone who was available, a `0` included, so key
  presence is the attendance record. Games filed by one "New day" all share a
  `date`. No tip-off is stored on a filed game.
- **A player who has left** is an id `byId` does not find. Their row reads
  "Left the team", italic and muted, with a hollow dot; the season is never
  swept against the roster.
- **The across-the-day chart** is `section.block.s-day` in `#view-games`:
  `details.fold#dayFold` > `summary` (`h3` "Across the day",
  `span.hint#dayhint`, a `button.helpq` with `data-help="help-season"`) >
  `div.surface#daytotals`. It is painted by `renderDayTotals()`
  (`app/plan-view.js`), render key `totals`, which **is** in `AFTER_EDIT` and
  `PLAN_ONLY`. Under two games today it returns early with a `.day-empty`
  prompt and a `+ Add a game` button — the only thing in `plan-view.js` that
  uses the `renderAll` handed in by `initPlanView` (`app/app.js:396`), and the
  only other sender of `track('day_game_count', …)`, which `teams-view.js:552`
  also sends.
- **`app/app.js`** collapses `#dayFold` on first paint below 620px.
- **CSS**: `.sn-*` rules at `app/app.css:3495`–`3550`; `.dayrow`, `.legend`,
  `.day-empty` around `1133`–`1484`; the phone-stack `order:` list near `272`
  (`.s-day { order: 2 }`); the big-text block near `3227` carrying
  `.sn-row { flex-wrap: wrap }`, `.sn-row .sn-x { flex-basis: 100% }` and
  `.sn-game > summary { flex-wrap: wrap }`; `.dayrow` narrow override at
  `3170`.
- **Reusable grammar that already exists**: `.pgrp` / `.pgrp-h` / `.pgrp-f` /
  `.prow` / `.prow-t` / `.prow-v` / `.prow-chev` (the grouped list built for
  the Plan sheet, `app.css:2577`+) is the prototype's white grouped surface.
  Its paddings are sheet paddings (`.pgrp { margin: 1.1rem 1rem 0 }`,
  `.pgrp-h { padding: 1.5rem 2rem .45rem }`), so a screen needs a modifier,
  not a second grammar. `.today-h1` (`app.css:49`) and `.game-h1` / `.game-sub`
  are the large-title pair #69 built.
- **Tests and checks that read what this ticket replaces:**
  - `test/season-view.test.js` — the ledger's behavior and the whole CSV.
    Its markup-shaped cases: "the empty season still names the spreadsheet"
    (asserts the empty copy mentions a spreadsheet), "an id with no player is
    shown, not dropped", "the ledger paints in the app's own color slots",
    "the ledger is on the roster page and is precached".
  - `test/big-text.test.js` — "the season ledger rows wrap, and only at big
    text" pins `.sn-row { flex-wrap: wrap }` inside the big-text block and
    nowhere else.
  - `test/this-game.test.js` — "This game reads after the rotation, but still
    above Across the day" reads `order:` for `.s-rot`, `.s-thisgame` and
    `.s-day` out of the `max-width: 1099px` block.
  - `test/help-deeplink.test.js` — `links.length >= 3` and a two-way match
    between `data-help="…"` values and `h4.help-h` ids inside `#help`.
    Today: `help-season` once (the Across-the-day `?`) and `help-bench` twice.
  - `test/note-placement.test.js` — no `p.note` as a direct child of a
    `main.view`.
  - `test/dead-class.test.js`, `test/dead-id.test.js`, `test/css-collide.test.js`,
    `test/dead-export.test.js` — sweeps that fail on an orphan left behind.
  - `scripts/smoke/overlay.mjs` — the state `games view, every disclosure open`
    asserts `shows: '#dayFold[open]'`; its `season view` state opens
    `#todaySeason`. Its comment claiming the harness record has no filed games
    is stale: RICH files three.
  - `scripts/smoke/rich-fixture.mjs` — counts `#daytotals .dayrow` (≥ 11) and
    `#daytotals .legend span` (≥ 2) **on the game screen**, and
    `#view-season details.sn-game` (≥ 3).
  - `scripts/smoke/app-large-text.mjs` — `APP_LARGE_TEXT_STATES` starts from
    `VIEWS`, so `season` is already measured at 320px / 32px root, on RICH.
    `APP_LARGE_TEXT_ALLOW` is empty and stays empty.
  - `scripts/smoke/fixtures.mjs` — the RICH comment naming three filed games
    and the second game in the day, and why each exists.
  - `scripts/smoke/touch.mjs` / `today-game-rows.mjs` — the ≥ 44px sweep that
    will measure a new header button.

## The look to match

`notes/mockups/prototype/light-season.png` and `dark-season.png` (390 × 844),
plus its README, which wins where it disagrees with the prototype. What the
PNG shows: a header action top right reading **Export**; the large title
**Season** with **3 games filed** under it; a small gray group label **Minutes
so far**; then one row per player — name on the left, a rounded track with a
fill in that player's color, the minutes right-aligned — on the gray ground
with no white box around them, sorted longest bar first. The README's "docs
win" list applies: no tab bar, 48px hit areas, an icon back button named "Back
to Today", rem sizes from `app/tokens.css`, tint on the three K1 things only.
Use the tokens; do not paste prototype CSS.

The prototype does not show the behind/ahead mark, the filed games or the
across-the-day chart, so those are designed here in the same language.

## Decisions made in this spec without asking

1. **The header carries the export.** `button#seasonExport.btn.ghost.press`
   in `.bar-back`, right side, visible text **Export**, `title="Save the
   season as a spreadsheet"`, hit area ≥ 48px. `applyView` shows it only on
   Season, the same way it shows `#shareBtn` only on the game screen. It is
   `hidden` when no game is filed, because a file with a header row and no
   rows is a support email. It calls the existing `saveCsv(seasonGames())`;
   the CSV bytes, filename, BOM and flash copy do not change.
   `button.sn-csv` and its `p.sn-csvnote` are removed from the body.
2. **The screen has its own large title.** `div.dayhead` in `#view-season`
   holding `h1#seasonTitle` "Season" and `p#seasonSub` "3 games filed"
   ("1 game filed" singular, "Nothing filed yet" when empty — see 7).
   `applyView` hides `#barTitle` on `season` as well as on `games`, by a set
   rather than a second hand-typed comparison. The title and sub reuse the
   game screen's rules by **extending their selector lists** in `app.css`
   (`.game-h1, .season-h1 { … }`), not by copying the values.
3. **Minutes so far.** A group label `h2.sn-h` reading **Minutes so far**,
   restyled to the prototype (footnote size, `--muted`, sentence case, no
   uppercase and no letter-spacing), then `div.sn-list` of one `.sn-row` per
   player, in `totals(games)` order (furthest behind first — unchanged), on
   the gray ground with no surface box, as the prototype has it. A row is a
   grid of three cells:
   - **name cell**: `span.sn-nm` (the player's name, `--fs-body`, weight 500,
     wrapping, never ellipsed or clipped) and under it `span.sn-x`, the
     footnote `3 games · 7 behind` / `3 games · 9 ahead` / `3 games`, built
     from `appearances` and `offNote` exactly as today;
   - **track**: `span.sn-track` with `span.sn-fill` whose width is the
     player's minutes as a percentage of the largest total (the prototype's
     bar), the fill painted `colorOf(id)`;
   - **minutes**: `span.sn-min`, `fmtMinutes(min)`, `--fs-body`, weight 600,
     tabular figures, right aligned.
   The colored dot goes: the fill already carries the player's color and the
   name is on the same row, which is what K2 asks for. A player who has left
   keeps the same row with the name "Left the team", italic and muted, and a
   fill in `var(--line-2)` — no player color, because they have no slot.
4. **Across the day moves to Season, unfolded.** A `section#daySection` in
   `#view-season`, between Minutes so far and Filed games, holding
   `h2.sn-h` "Across the day", `span#dayhint` (the existing "N games") and
   `div#daytotals`. No `<details>`, no `.surface` box, and **no `?`**: W3
   bans a help icon beside a control, so `.helpq[data-help="help-season"]`
   goes and `id="help-season"` comes off its `h4` in `#help` (the section's
   words stay). `renderDayTotals` keeps its name, its file and its `totals`
   render key, so the chart still repaints on every plan edit while Season is
   the open screen. Its `< 2 games` branch now sets `#daySection.hidden =
   true` and paints nothing: the `.day-empty` prompt and its `+ Add a game`
   button go, because Today already owns Add a game (#26). With that branch
   gone, `initPlanView` and its call in `app.js` go if nothing else uses the
   `renderAll` it stores. `track('day_game_count', …)` survives in
   `teams-view.js`, so the event, `analytics.js` and `test/events.test.js`
   are untouched. `#dayFold`, `.s-day`, `.fold` usage here and the
   `matchMedia('(max-width: 620px)')` collapse in `app.js` go with it.
5. **Filed games, by day.** A group label `h2.sn-h` **Filed games**, then one
   block per day, newest day first:
   - a day heading `div.sn-day` reading `` `${dateLabel(date)} · ${n} game${s}` ``
     — "Sep 14 · 2 games". `dateLabel` is reused unchanged, so the CSV's
     column headers do not move;
   - a `.pgrp` grouped white surface (the Plan sheet's grammar, with a
     screen modifier for side margins and label padding) holding one
     `details.sn-game` per game **in filed order** within the day, so a
     tournament reads 9:00 then 11:30. Its `summary` is a `.prow`-shaped row
     at least 48px tall: the game's own title on the left — `vs Falcons`, or
     the day name, or `Game 2` (its 1-based place in that day) when neither
     exists — `10 played · 4×8` on the right, and the existing rotating
     chevron. Opening it shows the same minutes rows it shows today (name and
     minutes, one per id, highest first, "Left the team" for a departed id)
     and the same `Delete this game` button, still `undoable` and still with
     no confirm. The delete toast keeps `gameTitle(g)` so it still names the
     date.
   Within a day the games keep their filed order; days run newest first, which
   is where the old `[...games].reverse()` goes.
6. **Order on the screen**: title, Minutes so far, Across the day (only with
   two or more games today), Filed games. Today's chart sits above the archive
   because both top blocks are about now.
7. **Empty.** With no filed game the screen shows the title, the sub line
   "Nothing filed yet", `#seasonExport` hidden, no group labels, and one
   `p.note` inside `#seasonbox` reading exactly:
   `Nothing filed yet. New day on Today files the day's games here.`
   The across-the-day section still shows when today has two or more games,
   because it does not depend on anything being filed. The old prose
   paragraph in the markup ("Every game you have finished with this team…")
   and the CSV note go: W3 allows at most one gray line under a group, and
   `#seasonCount`'s job is now `#seasonSub`'s.
8. **Wrapping at large text.** `.sn-row`'s big-text escape is the grid
   collapsing: the name cell spans the full width on its own line and the
   track and minutes share the line below it. That replaces
   `.sn-row { flex-wrap: wrap }` and `.sn-row .sn-x { flex-basis: 100% }`,
   which stop meaning anything once the row is a grid, so
   `test/big-text.test.js`'s season case is re-pointed at the new declaration
   (under `/new-guard`: tighten it and watch it go red first).
9. **Removed:** `#dayFold`, `.s-day`, `.day-empty` and its CSS, `.helpq` on
   the day chart, `id="help-season"`, `button.sn-csv`, `p.sn-csvnote`,
   `p.note#seasonCount`'s prose neighbor, `.sn-dot` and `.sn-dot.gone`, and
   the `.s-day` line from the phone-stack `order:` list. `test/this-game.test.js`
   loses its `.s-day` neighbor and is re-pointed at `.s-rot` < `.s-thisgame`
   plus whatever now follows it on the phone stack.
10. **Unchanged:** `seasonCsv` and every byte it produces, `seasonFilename`,
    `downloadText`, the BOM, `totals`, `offNote`, `dateLabel`, `gameTitle`,
    `seasonGames`, `seasonShare`, `archiveDay`, `seasonGame`, the storage
    schema, `engine.js`, `budget.js`, `roster.js`, the printed card, and
    Today's Season row in `teams-view.js`.

## What would settle it

At 390 × 844 unless a width is named, on the RICH fixture (11 players, two
games today, three filed games).

1. **Minutes so far.** Season shows a group labeled "Minutes so far" with one
   row per player, 11 rows. Each row has the player's name, a track whose fill
   width is that player's share of the largest total, and their season minutes
   as a number. The row furthest behind their season share is first and the
   order matches `totals(seasonGames())`. Every row's footnote reads
   `N games`, `N games · M behind` or `N games · M ahead`, with `M` the
   rounded `seasonShare(...).deficit` for that id and `N` its `appearances`.
2. **Behind and ahead come from the one answer.** A player whose deficit is
   `+7.2` reads "7 behind"; `-9.4` reads "9 ahead"; `0` reads neither word.
   No second computation of a share exists in `season-view.js`.
3. **Filed games.** A group labeled "Filed games" lists the three filed games
   under day headings of the form `Sep 14 · 2 games`, newest day first. Each
   game is a row at least 48px tall carrying its opponent (or `Game N`) and
   `K played · 4×8`. Opening one shows one row per id in its `minutes` map,
   highest first, and a "Delete this game" button; deleting goes through
   `undoable` with no `confirm`.
4. **The spreadsheet.** A header button reading "Export" is on Season and on
   no other screen, is at least 48 × 48, and saves a file whose bytes are
   identical to `main`'s for the same record: same filename, same BOM, same
   header row `Player,Aug 31 vs …,…,Total`, same row order, same em dash for
   a game a player was not at. With nothing filed the button is not shown.
5. **The day chart.** With two games today, `#daytotals` renders 11
   `.dayrow`s and a `.legend` naming both games, **inside `#view-season`**,
   under a heading "Across the day" with the hint "2 games". Editing the plan
   (marking a player absent) while Season is open changes those bars without
   a screen change. `#view-games` contains no `#dayFold`, no `#daytotals` and
   no `.s-day`. With one game today the section is `hidden` and Season shows
   no "Across the day" heading anywhere.
6. **Left the team.** An id in a filed game with no player on the roster shows
   as "Left the team" in both lists, is never dropped, and its track fill is
   not a player color.
7. **Empty.** With `season.games` empty, `#seasonbox` contains exactly one
   paragraph reading `Nothing filed yet. New day on Today files the day's
   games here.`, the sub line reads "Nothing filed yet", and `#seasonExport`
   is hidden.
8. **No clipping.** At 390 × 844 and at 320px with a 32px root, with the
   longest sample name in the roster and a filed game open: no horizontal
   overflow, nothing stranded above the viewport, and scrolled to the bottom
   the last control (Delete this game in the last filed game) is fully
   visible. `APP_LARGE_TEXT_ALLOW` gains no key.
9. **Touch.** Every control on Season is at least 48 × 48 at 320, 360 and
   390px: Export, each filed-game summary, each Delete this game.
10. **The existing season tests stay green**, and `npm test` and `npm run
    smoke` pass. Any test written against markup this ticket replaces is
    updated or retired in the same change.

## Surfaces

Change: `app/index.html`, `app/app.css`, `app/season-view.js`,
`app/plan-view.js`, `app/render.js`, `app/app.js`, `app/sw.js`
(VERSION/SHELL), `scripts/smoke/registry.mjs`, a new
`scripts/smoke/season.mjs`, `scripts/smoke.mjs` (wire the new row),
`scripts/smoke/overlay.mjs`, `scripts/smoke/rich-fixture.mjs`,
`scripts/smoke/app-large-text.mjs`, `scripts/budgets.mjs` (only to widen a
ceiling, with the reason), and the tests named in the survey
(`season-view`, `big-text`, `this-game`, `help-deeplink`).

Must not change: `app/engine.js`, `app/budget.js`, `app/roster.js`,
`app/storage.js` (`seasonShare`, `seasonGame`, `sanitizeSeason` and the
schema), `app/backup.js`, `app/card.js`, `app/card.css`, the printed card,
`seasonCsv`'s output, `test/season.test.js`, `test/leak.test.js`,
`test/analytics.test.js`, `test/events.test.js`.

## Constraints

- **Reuse, do not re-derive:** `seasonShare` for behind/ahead and attendance
  (never a second mean); `totals()` for the row order, shared with the CSV;
  `offNote` for the words; `fmtMinutes` for every minute; `colorOf` for a
  player's color; `dateLabel` and `gameTitle` as they are; `seasonGames()`
  for "is anything filed"; `undoable` for delete; `downloadText` /
  `seasonFilename` for the file; the `.pgrp` / `.prow` grouped-list grammar
  for the filed-games list (add a screen modifier, do not write a second one);
  the `.game-h1` / `.game-sub` rules for the large title (extend the
  selector, do not copy the values); `renderDayTotals` where it lives, with
  its `totals` render key.
- **Guideline rules:** L1 (gray ground, white grouped surfaces; the bars and
  the chart need no box), K2 (a player's color never means anything but that
  player, and a name is always beside it), W3 (no help icon, no paragraph
  beside a control, at most one gray line under a group), W4 (the empty state
  says what to do and where), plus the ones every screen is held to: I1 and
  C6 (48px), T2 and T3 (rem sizes from the scale, nothing under footnote),
  L6 (8px grid, 16px side margins).
- **Mobile first.** Verify at 390 × 844 first.
- **Animation** on transform/opacity only. The existing bar `transition:
  width` on `.dayrow .trk i` is pre-existing and out of scope; the new
  `.sn-fill` gets no width transition.
- **Precache bump.** `app/index.html`, `app/app.css`, `app/season-view.js`,
  `app/plan-view.js`, `app/render.js` and `app/app.js` are all precached:
  bump `VERSION` in `app/sw.js` past `main`'s 298 and set `SHELL` to the
  digest `npm test` prints, both in the same commit.
- **American spelling**, and no quotation of any person in code, comments,
  commits or docs.
- **Budgets:** if bytes or nodes exceed a ceiling, widen it in
  `scripts/budgets.mjs` with the reason. Never re-record `requests` (pinned
  at 40 of 41) and never run a blanket `--update-budgets`.
- **Smoke allow maps:** do not add a key to `APP_LARGE_TEXT_ALLOW` or
  `LARGE_TEXT_ALLOW`, and do not raise a number in either.
- **`scripts/smoke/*.mjs` each stay under 40,000 bytes**
  (`test/smoke-size.test.js`); split along a real seam rather than raising
  the limit.
- **Guards:** every edit to a test that reads source or markup rather than
  running it (`big-text`, `this-game`, `help-deeplink`, `season-view`'s
  source-shaped cases) and the new smoke module follow `/new-guard` — watch
  each fail against the tree it is meant to catch before trusting it.

## Proof

- **`node --test test/season-view.test.js`** — extended, not replaced. New
  cases at the module's exported seam: the empty copy is exactly the ticket's
  sentence; a row's footnote words come from `seasonShare`'s deficit and
  appearances for every sign; the filed games group by `date` newest day
  first and keep filed order inside a day; a game with no opponent and no day
  name titles as `Game N` within its day. The CSV cases stay untouched and
  must pass byte for byte. (Settles 1, 2, 3, 6, 7.)
- **`node --test test/big-text.test.js`** — its season case re-pointed at the
  new grid collapse, proved by tightening it until it fails. (Settles part
  of 8.)
- **`node --test test/this-game.test.js`, `test/help-deeplink.test.js`,
  `test/note-placement.test.js`, `test/render-sections.test.js`,
  `test/dead-*.test.js`** — updated where they name removed markup, green
  otherwise. (Settles 5's "gone from the game screen" and 10.)
- **Smoke, a new check `season: minutes so far, filed games, the day chart`**
  in its own `scripts/smoke/season.mjs`, RICH fixture, reached through
  `#todaySeason` like a coach: counts the minutes rows and reads their name,
  footnote, fill width and number; checks the order against
  `totals(seasonGames())` read from the page's own modules; opens a filed
  game and reads its rows and its Delete button; measures Export, each
  summary and each Delete at 320, 360 and 390px for ≥ 48px; asserts
  `#view-games` holds no `#dayFold` / `#daytotals` and `#view-season` holds
  both the chart and its legend; asserts Export exists on Season and on no
  other screen. (Settles 1, 3, 4's placement, 5, 9.)
- **`scripts/smoke/rich-fixture.mjs`** — its day-chart counts move to the
  Season screen, so the fixture check still fails when the fixture does not
  arrive. (Settles 5.)
- **`scripts/smoke/overlay.mjs`** — the `games view, every disclosure open`
  state stops pointing at `#dayFold`, and a new `season view, every game
  open` state audits the filed-game folds, which the stale comment there says
  could not exist. (Settles 8's a11y half.)
- **`scripts/smoke/app-large-text.mjs`** — a `season, filed game open` state
  joins `APP_LARGE_TEXT_STATES`, measured at 320px / 32px root on both axes
  with no new allowance. (Settles 8.)
- **`/browser-verify`** on the preview: side-by-side against
  `light-season.png` and `dark-season.png` at 390 × 844, a long-name roster,
  each scrollable area scrolled to the bottom, the full-height state, the
  empty state, and 320px with large text. The Export file is diffed against
  the same record exported from `main`. (Settles 4 and 8 by eye and by
  bytes.)

## Out of scope

- The large title collapsing into the header, floating translucent controls,
  the content fade, and removing the remaining `?` controls and the footer
  (#33).
- The roster screen and the player sheet (#31).
- Raising the smoke touch floor to 48px for every screen (#37).
- The wide-screen two-column layout (#35).
- Any change to the printed card, the shared image, the CSV's contents, or
  the storage schema.
- Planning games for a future day (#64), and the 320px pass summary clipping
  on Today (#66).
