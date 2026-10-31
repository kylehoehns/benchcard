# 414 — Notes under the timeline match the minutes shown

## Issue

#414: the notes under the timeline (`#issues`) describe the solver's first
plan, not the minutes the timeline shows, so after a swap, an availability
change, Finish game or overtime they can name the wrong kids and offer
Shuffle on a game that is over.

## Goal

A coach reads the note under the timeline and it agrees with the rows above
it: the same names, the same minutes. On a finished game it offers nothing
the coach can no longer do.

## What would settle it

All on `onGameDay` (RICH: Hawks, 11 players, 4 × 8, subbed every 4 minutes,
8 stints, 160 player-minutes), read on the Game screen's `#issues`:

1. **Swap.** Start game, swap Ana Reyes off for Devon Ellis in stint 1,
   Leave. The timeline shows four players at 12 and seven at 16. The spread
   note names exactly the four at 12 (in roster order) with `play 12`, and
   names nobody else. Red on today's code, which still names the solver's
   four (Marcus, Hana, Sam and Riley).
2. **Finish game.** Same swap, step to the end, Finish game. The note still
   names the timeline's four at 12, and no note contains `Shuffle` or
   `by hand`.
3. **Availability change.** Start game, step forward, mark one player not
   here mid-game (the kid leaves), finish. The timeline shows that kid below
   the others. No note says every player gets the same minutes
   (`every player gets`); the note names that kid with the minutes the
   timeline shows for them.
4. **Overtime.** Bench mode on the last stint, Tied? Add overtime. The note's
   names and minutes match the timeline's (or, if the timeline is even, the
   note says the even number the timeline shows).
5. **Unchanged plan.** Before Start game, with no swap, the notes are
   byte-identical to today's (the engine's SPREAD_FLOOR sentence, with its
   "Best possible spread…" prefix and `sayWhyTheyAreShort`'s reason).

## Surfaces

Changes:

- `app/plan-view.js` — `issuesList` rebuilds the minutes notes from
  `effectiveMinutes` when they no longer describe what is shown.
- `app/state.js` — one pure wording builder beside `spreadOf` /
  `summaryLine` (`minutesNote` or similar) that takes an effective minutes
  map and a name lookup and returns one info issue.
- `app/engine.js` — export `andList` (no logic change) so the builder reuses
  it rather than writing a second one.
- `test/coach.js` — a `notes()` verb if `text('#issues')` is not enough.
- New scenario file under `test/`, and a `node --test` file for the builder.

Must not change: `engine.js`'s solve or its issue wording; `computeAll`'s
caching; `sayWhyTheyAreShort` (it stays right for the solver's plan, and its
note is kept whenever nothing moved).

## Constraints

- Reuse `effectiveMinutes` / `effectiveStints` (state.js) — the timeline,
  summary and plan table already read them. Do not re-derive minutes from
  `live.overrides`.
- Reuse `spreadOf` for the spread, `fmtMinutes` for every number, and the
  engine's `andList` (exported) for the name list. Do not write another
  "A, B and C" joiner.
- "Finished" is asked through `live.js` (`stage(p, g.live) === 'finished'`
  or `finishedGame(g.live)`); `test/live-guard.test.js` forbids reading
  `live.finished` anywhere else.
- The precedent this follows is `renderPlanTable`'s spread line: once a hand
  swap has moved the minutes, a sentence that describes the solve is dropped
  rather than restated wrongly.
- Mobile first and long names: the note can wrap; with real-length names
  (e.g. "Alexandria Montgomery-Okafor") at 320 and 390 wide, 16 and 32px
  text, nothing clips. The six-name cap the engine uses (past six, a count
  instead of names) applies here too.
- Names are `player.name`, the same label the engine's notes use.

## Design

In `issuesList(p)`, with `g = game()` and `eff = effectiveMinutes(g, p)`:

- **Moved** means: the game is finished, or `eff` differs from `p.minutes`
  (a different set of ids, or any player's minutes differ).
- When not moved, nothing changes (item 5).
- When moved:
  - `SPREAD_EVEN` and `SPREAD_FLOOR` (whichever the engine emitted; Platoon
    has already dropped `SPREAD_FLOOR` above) are replaced, in place, by one
    note built from `eff`. If the engine emitted neither (targets, carryover,
    or a floor that is not exact), none is added.
  - `SPREAD_CONSTRAINED` is dropped (its two numbers are the solver's).
  - `MIN_MISSED` and `CAP_EXCEEDED` are dropped for a player whose
    effective minutes differ from planned (the number they quote is stale).
- The rebuilt note's wording (pure builder, `node --test`):
  - spread 0: `Minutes divide evenly: every player gets 16.`
  - two values, six or fewer at the low end:
    `Eli Tran, Ana Reyes, Theo Alvarez and Nia Brooks play 12, everyone else 16.`
    (`plays` for one name)
  - two values, more than six at the low end:
    `7 players play 12, the other 4 play 16.`
  - three or more values: the low end named the same way, then
    `, the fewest. The most is 24.`
  - names in roster order; `playerIds` is the low end; code `SPREAD_SHOWN`.
  - no reason and no action (no Shuffle, no set by hand): the reason the
    engine and `sayWhyTheyAreShort` give is about the solver's choice, and is
    not true of a rotation the coach changed or a game that is over.

## Proof

- **Coach seam** (new scenario file, `test/coach.js`): items 1–4, each
  asserting only what `#issues` and the timeline (`planMinutes()`) show.
  Item 1 must be seen red on today's code before the change.
- **Coach seam:** item 5 — a not-started game's notes equal the engine's
  SPREAD_FLOOR message (an existing scenario may already cover it; if so,
  name it rather than add one).
- **`node --test`** on the builder: the four wording cases above, plus one
  name (`plays`) and roster order.
- **Smoke/look:** the `#issues` note with long names at 320/390, 16/32px —
  `scripts/look.mjs` pictures, judged by `quality-reviewer`.

## Out of scope

- Other notes that describe the solver's lineups rather than its minutes
  (`PAIR_PARTIAL`, `CONSEC_EXCEEDED`, `HALF_LATE`, `KEEPON_PARTIAL`,
  `SUBS_EXCEEDED`) — they can also go stale after a swap; a follow-up issue
  if confirmed.
- `HALF_LATE`'s "Sub more often" advice on a finished game.
- The Shuffle button itself on a finished game (#413).
- The plan table's own spread line (`renderPlanTable`), already effective.
