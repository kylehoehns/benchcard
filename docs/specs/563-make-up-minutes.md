# 563 — One "Make up minutes from" choice (with #581)

## Issue

#563 (part of #561, the ease-of-use pass): replace the two Plan sheet
even-out switches and the Settings "A new game starts" row with one Plan sheet
row, **Make up minutes from**, with three choices, and migrate saved games to
it. Folds in #581: By hand ignores the day credit, so it must stop saying it
evens out the day.

## Goal

A coach sees one row that says whose minutes a game makes up: this game only,
earlier today, or the season so far. It shows only the choices that would
change their plan, and hides when none would. A new game starts the way the
coach last chose. Nothing they saved plans differently, except one known edge
case the migration decides on purpose (below).

## Survey (on `82c9ba3`, after #562)

- The day switch is `renderDayGroup`, the season switch `renderSeasonGroup`
  (`app/rules.js`). #562 hides the day group under Platoon and Order, and the
  season group under By hand, Platoon, Order, and when nothing is filed.
- Settings "A new game starts" (`#seasonDefSeg`, `app/index.html`;
  handler in `app/teams-view.js`) writes `settings.seasonDefault`, read only by
  `newGame` (`app/state.js`): `useCarryover: n > 0`,
  `useSeasonTargets: settings?.seasonDefault === true`.
- Add a game step 3 shows the day switch again (`stepSplit`,
  `app/teams-view.js`), writing `draft.useCarryover` only.
- `evensOutDay` (`app/state.js`) is `i > 0 && g.useCarryover &&
  !fivesAreSet(g.strategy)`; it gates the solver's day carryover input, the
  pass summary's "evens out the day", the sentence's "Evens out …" line and the
  Season day chart note.
- Seeded probes (throwaway, through `test/state-fixture.js`, two games in a
  day, game 1 with two kids out, 7-11 players, 40 seeds each; the probe is in
  the lane's scratchpad, not committed):

  | Question | Strategy | Result |
  | --- | --- | --- |
  | "Both on" vs "season only", a filed season | Even, Closers | identical 40/40 |
  | "Both on" vs "season only", nothing filed | Even, Closers | differ 40/40 (both on = day only; season only = nothing) |
  | "Season only" vs neither, nothing filed | Even, Closers | identical 40/40 |
  | Day switch on vs off | By hand | identical 40/40 (filed season and none) |
  | Day + season on vs neither | By hand | identical 40/40 |

  Why: when the season moves anyone, `seasonTargetsFor` gives every open kid a
  target, and the day credit only moves kids with none. The two differ only
  when the season moves nobody (`seasonAdjust` reason `level`, `nobody` or
  `impossible`; nothing filed is `level`): then "both on" still evens out the
  day and "season only" does nothing. Under By hand every kid has a hand-set
  target (`computeTargets` pins them), so neither flag reaches the plan. This
  confirms #581.

## Choices the issue left open (decided here)

1. **"The season so far" means both on.** It evens out the season, and when
   the season can move nobody it still evens out the day. That is what a coach
   who had both on (the common case: game 2+ starts with the day switch on) was
   getting. The migration maps "season only" to it.
2. **The engine keeps both flags; the choice is a pure function of them.**
   `useCarryover` and `useSeasonTargets` stay on the game (the issue allows it,
   and ~40 test files and fixtures build games with them). There are three
   legal pairs: This game only = (off, off), Earlier today = (on, off), The
   season so far = (on, on). One reader (`makeUpOf(g)`) and one writer
   (`setMakeUp(g, choice)`) in `state.js`; nothing else writes the flags. The
   storage migration turns the fourth pair, (off, on), into (on, on).
3. **The team's last choice** is a new team setting, `settings.makeUp`
   (`'game' | 'day' | 'season'`, default `'day'`), written every time the coach
   picks on the Plan sheet. `seasonDefault` is dropped: true migrates to
   `makeUp: 'season'`, false (or absent) to `'day'`.
4. **The new-game rule** (one helper, used by `newGame` and Add a game):
   last choice The season so far gives The season so far; anything else gives
   Earlier today from a day's second game on and This game only on a first
   game. "This game only" is not carried to the next game: the issue makes
   Earlier today the default from game 2, and #565 relies on that rule. It is
   the old rule with `seasonDefault` replaced by the last choice.
5. **Which choices the row offers** (only under Even and Closers; By hand,
   Platoon and Order hide the row, following #562 and #581's finding):
   This game only always; Earlier today from the day's second game on; The
   season so far once a game is filed. Fewer than two offered: the row hides
   (game 1 with nothing filed). A saved choice that is not offered shows as
   what it does: The season so far with nothing filed shows Earlier today on
   game 2+ (it plans the same, per the probe); Earlier today or The season so
   far on game 1 with nothing filed is hidden, and Earlier today on game 1 with
   a filed season shows This game only. Showing never writes.
6. **"Earlier that day"** when the open day is not the phone's today, the
   same #420 rule the day group's footnote follows now.
7. **Add a game step 3 loses its day switch.** It wrote only `useCarryover`,
   so with a remembered season it could create the fourth pair. The strategy
   cards stay; #565 removes the step. The Date field still re-derives the
   draft's choice with the new-game rule.
8. **The skip lines** (`#stratskip`, `app/strategy.js`) name the new row:
   - Platoon: "Platoon plays whole groups, so Players changing at once,
     Everyone plays in, full periods and making up minutes from other games
     don't apply."
   - Order: "The order decides who plays, so Everyone plays in, full periods
     and making up minutes from other games don't apply."
   - By hand: "By hand plays the minutes you set, so making up minutes from
     other games doesn't apply."
   The league clause is unchanged.

## What would settle it

1. **Migration** (`node --test`, `sanitizeTeam`/`sanitizeSettings` in
   `app/storage.js`): each of the four flag pairs loads as
   (off, off) → This game only, (on, off) → Earlier today,
   (off, on) → The season so far (flags on, on), (on, on) → The season so far;
   `seasonDefault: true` → `makeUp: 'season'`, `false` → `'day'`, absent →
   `'day'`, junk `makeUp` → `'day'`; `seasonDefault` is gone from the cleaned
   settings. Running the cleaner twice is a no-op.
2. **Plans unchanged** (`node --test`): `test/make-up-563-fingerprint.test.js`
   keeps the hash `6d7e56c4…b64` recorded on `82c9ba3` before any edit
   (80 seeded days, all four pairs, all five strategies, filed and unfiled
   seasons, both `seasonDefault` values, loaded through `sanitizeTeam`, with
   "season only" pre-mapped to both on). On `82c9ba3` that one mapping moves
   1 of the 207 seeded games: a game 2 on Even whose team has nothing filed,
   where both on evens out the day. `test/hide-562-fingerprint.test.js` keeps
   its hash `2775a607…41a`.
3. **#581** (`node --test` on the state helpers): under By hand, game 2 with
   the day switch on: `evensOutDay` is false, the pass summary has no
   "evens out the day", `evensOutLine` is empty, and the solver gets no
   carryover. Plans unchanged (item 2).
4. **The row** (Coach seam, `test/coach.js`; long real-length names in the
   roster, e.g. "Alexandria Montgomery-Okafor"):
   - Even, game 2 of a day, a filed season: heading "Make up minutes from",
     three rows "This game only", "Earlier today", "The season so far", one
     checked; footnote exactly "Kids who played less get a little more here,
     and kids who played more get a little less. Never more than a sub or two
     either way."
   - Closers: the same three.
   - Even, game 1, a filed season: "This game only" and "The season so far".
   - Even, game 2, nothing filed: "This game only" and "Earlier today".
   - Even, game 1, nothing filed: no row.
   - By hand, Platoon, Order (game 2, filed season): no row.
   - A day that is not today: "Earlier that day".
   - Tapping a row checks it, saves the pair, survives a reopen, and the plan
     follows (The season so far shows the season panel, `#seasonadj`, as the
     season switch did).
   - Switching Even → By hand → Even keeps the choice.
5. **New games** (Coach seam): after picking The season so far, a new game
   (Add a game, or the Same as card) opens on The season so far; after picking
   This game only or Earlier today, a day's second game opens on Earlier today
   and a new day's first game on This game only (row hidden if nothing filed).
6. **Settings** has no "A new game starts" row (`#seasonDefSeg` gone); its
   group footnote still reads sensibly for A game is.
7. **Add a game** step 3 has the five strategy cards and no switch.
8. **Skip lines**: the three exact strings in choice 8.
9. **Look checks**: Plan sheet on game 1 (filed season) and game 2 of a day,
   long names, scrolled to the bottom and at full height, 320 and 390 wide,
   16 and 32px text; Settings team section. No clipping or cramped wrapping.
10. **What's new**: entries per ship-feature's rule (plain words), page
    regenerated, sitemap lastmod moved.

## Surfaces

Change: `app/state.js` (`newGame`, `evensOutDay`, new `makeUpOf`,
`setMakeUp`, offered-choices and new-game helpers, drop
`EVEN_OUT_DAY_LABEL`), `app/rules.js` (one group replaces `renderDayGroup` and
`renderSeasonGroup`; keeps the `#seasonadj` host), `app/strategy.js`
(skip lines), `app/storage.js` (migration, `DEFAULT_SETTINGS.makeUp`, drop
`seasonDefault`), `app/teams-view.js` (Settings handler and painter gone; step
3 switch gone; Date field uses the new-game helper), `app/index.html` (Settings
row gone; `#planDay`/`#planSeason` become one host), `app/edit.js` (one edit
kind for the choice), `app/game-setup.js` only if the `evens` scroll target
moves, tests, smoke checks that name the old controls
(`plan-sheet`, `settings-look`, `control-size`, `add-game-flow`,
`add-game-visuals`, `fixtures`, `app-large-text` states as needed),
`scripts/feature-keys.mjs`, `scripts/whats-new.json` + `app/whats-new.html` +
`app/sitemap.xml`, `CONTEXT.md`, docs.

Must not change: `app/engine.js`, `app/budget.js`, `app/roster.js`; what
`computeAll` plans for any game except By hand's carryover input (which
changes no plan) and the one known mapping.

## Constraints

- One reader and one writer for the choice (`makeUpOf`, `setMakeUp`); no
  other code writes `useCarryover`/`useSeasonTargets` (storage's cleaner maps
  them, the handoff decode's `useCarryover: false` stays, both legal).
- The strategies that honor the choice are read once (Even and Closers, i.e.
  not By hand and not `fivesAreSet`) and shared by `evensOutDay`,
  `seasonTargetsFor`'s existing guard and the row.
- Reuse `paintChoiceRows` (`app/game-setup.js`) for the three checkmark rows
  (interface guidelines C6: a checkmark means chosen); `.pgrp-h`, `.pgrp`,
  one `.pgrp-f` footnote (W3). Not a segmented control: three long labels do
  not fit at 320px and 32px text.
- Interface guidelines S1/S2: the Settings row goes; the Plan sheet keeps only
  this game's choice. The remembered last choice is not a setting a coach edits.
- `storage.js` is one of the four pure modules; this task is explicitly about
  its migration. Shape-driven, no version branch, idempotent.
- `docs/design-decisions.md` is at its 60000-byte limit: the season entry's
  "off by default, per game, and not inherited" sentence is replaced with a
  short pointer, and the new decisions go in a linked side file
  (`docs/design-decisions-make-up.md`), as #569 did.
- Coach copy: plain words, no "stint", "carryover", "re-plan", "By hand" as a
  noun of the app's own. Repo is public: made-up names only (Avery, Blake,
  Casey, Drew, Emery, Finley, Gray, Harper, Indy).
- Do not lower `scripts/coverage.json`. Byte budget: widen `bytesAbs` if
  needed and say so.

## Proof

- `node --test test/make-up-563-fingerprint.test.js` and
  `test/hide-562-fingerprint.test.js`: item 2.
- `node --test` on `storage.js` (`test/storage.test.js` or a new
  `test/make-up-migration.test.js`): item 1.
- `node --test` on the state helpers (`makeUpOf`, `setMakeUp`, the
  offered-choices helper, the new-game helper, `evensOutDay`, `passSummary`,
  `evensOutLine`): items 3, 5 (rule), part of 4 (which choices).
- Coach scenarios through `test/coach.js` (add a verb for the row if none
  fits): items 4, 5, 6, 7, 8.
- Smoke: the existing Plan sheet, Settings, control-size and Add a game rows,
  updated to the new controls; overflow and large-text passes cover item 9
  together with `scripts/look.mjs` pictures.

## Out of scope

- Removing Add a game step 3 (#565).
- #570's level work, and #572's statements (already merged).
- Changing what the engine does with either flag.
