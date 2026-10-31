# #367 — a game's stints can grow at the end without moving what was played

## Issue

#367 (parent #366, overtime): when a game's stint grid only grows at the end,
freeze every stint already played and re-plan only the new ones, instead of
#134's rewrite. The survey found nothing can grow a grid at the end today, so
this ticket also adds the game's overtime field that does (decided with the
coach, comment on #367).

## Goal

Groundwork for overtime. A game can carry overtime periods after regulation,
and adding them to a game underway never moves a minute already played or a
swap the coach made. No coach-facing change yet: #368 adds the button.

## What would settle it

All on a game underway, Even strategy, 8 players, 2 × 16, `everyN` 4
(8 regulation stints), seed fixed:

1. **Stints.** `buildStints({ periods: 2, periodMinutes: 16, overtime: [2] }, everyN 4)`
   gives the 8 regulation stints unchanged, then one stint: `period` 3,
   `periodName` `'OT'`, `startSec` 120, `endSec` 0, `minutes` 2.
   `overtime: [8]` with `everyN 4` gives two OT stints (480→240, 240→0).
   `overtime: [2, 2]` gives `'OT'` then `'OT2'`. Under `perPeriod` (#404) OT is cut
   by the regulation stint length, so `perPeriod 2` on 2 × 16 gives an 8-minute
   OT as one 8; `breaksOnly` gives one. `overtime` absent or `[]` gives
   exactly today's stints (same objects' fields, same count).
2. **Freeze on growth.** With a hand swap in stint 3 and the game on stint 8
   (index 7), setting `g.overtime = [2]` and recomputing: every player's
   effective minutes over stints 1–8 are identical to before, the stint-3
   swap is still recorded as a hand swap, and the game is still on stint 8.
   `rotationMoved()` does not report the game and `overridesDropped()` is 0.
3. **The new stints are planned around minutes played.** Same game with
   `g.overtime = [8]`: both OT stints have five players, and the player with
   the fewest effective minutes after stint 8 is on the floor in the first
   OT stint.
4. **Closers.** Same game with strategy `closers` and a closing group of five:
   after `g.overtime = [2]`, the OT stint's five is the closing group, and
   stints 1–8 are unchanged.
5. **Not a prefix keeps #134.** Changing `periodMinutes` 16 → 12, or `periods`
   2 → 4, on an underway game still takes the #134 path exactly as today
   (`rotationMoved()` reports the game).
6. **Removing unplayed overtime.** With the game on stint 8, setting
   `g.overtime = [2]` then `[]` leaves stints 1–8's effective minutes and the
   stint-3 hand swap unchanged.
7. **By hand and Platoon are not covered yet.** With strategy `minutes` or
   `platoon`, growth still falls back to #134 as today (`resolveRest` refuses
   them). #368 handles them. A test names this so #368 turns it over.
8. **Storage.** A game saved with `overtime: [2, 8]` reloads with `[2, 8]`.
   Junk is cleaned: a non-array becomes `[]`; entries that are not whole
   numbers 1–10 are dropped; at most 4 entries are kept. A record with no
   `overtime` key loads as `[]`. A filed season game keeps the field the same
   way.
9. **Nothing moves without overtime.** A game with `overtime: []` produces the
   same plan (same seed, same rotation, same stamp) as before this change.
10. `npm run smoke` green.

## Surfaces

Change: `app/engine.js` (`buildStints`), `app/state.js` (one format builder,
plan signature, `sameGrid`/the freeze entry), `app/storage.js` (game sanitizer,
season sanitizer, `seasonGame`), tests.

Must not change: anything a coach sees (no UI, no copy), `app/live.js` (no new
live fields or operations: that is #368), `app/handoff.js` and `app/card.js`
(#370), the precached shell beyond the `sw:bump` a changed precached file needs.

## Constraints

- **One answer for a game's format.** Today `{ periods: g.periods,
  periodMinutes: g.periodMinutes }` is built by hand in three places in
  `state.js` (`stintShape`, `computeAll`'s solve, `resolveRest`). Make one
  builder that includes `overtime` and use it in all three. The plan signature
  includes `g.overtime`.
- **Reuse the #247 freeze.** "Grew at the end" is: the old grid's stints are
  the first stints of the new grid, same period name and clock window each,
  and the new grid is longer. Shrinking where the removed stints were never
  played is the same rule read the other way. That widens `sameGrid`'s
  question; it does not add a second freeze. `freezePlayedAndReplan` already
  freezes through the stint on the floor and re-plans the rest with
  `resolveRest`.
- **`live.js` is the only writer of the live record** (#356,
  `test/live-guard.test.js`). Nothing here writes `live.at` or
  `live.finished`.
- **Period numbering.** OT periods are numbered `periods + 1`, `+ 2`, … so the
  Last-period five (`period === format.periods`) never forces an OT stint.
  Names come from one place next to `periodLabel`.
- `rules.js`'s `periods * periodMinutes` total is regulation and stays so for
  now.
- `engine.js`, `budget.js`, `roster.js` and `storage.js` are pure modules with
  heavy coverage: changes there come with `node --test` cases.
- If a precached file changes, run `npm run sw:bump`.

## Design

`format.overtime` is a list of whole minutes, one entry per overtime period.
`buildStints` appends, after regulation, each OT period split by the same
granularity rule a regular period uses (`periodLengths`), named `OT`, `OT2`,
`OT3`, `OT4`. The game record carries `overtime: []` by default; storage
sanitizes it. `syncOverrides` sends an underway game whose old grid is a prefix
of the new one (or the new a prefix of the old, with the cut stints unplayed)
down the existing freeze path instead of #134.

## Proof

- **Engine, `node --test`** (new cases beside the existing `buildStints`
  tests): item 1, across lengths 1–10 × `everyN`/`perPeriod`/`breaksOnly`, and
  item 9's empty-overtime identity.
- **State, `node --test`** through `computeAll` on an underway game, harness as
  in `test/resolve-rest.test.js` (localStorage and document stubbed): items
  2–7. Item 2 is the guard for the highest-risk path: falsify it once (break
  the prefix rule, watch it go red) per `/new-guard`.
- **Storage, `node --test`** in `test/storage.test.js`: item 8.
- **`npm run smoke`**: item 10.

## Out of scope

- Any UI, the live operation that adds overtime, Undo, remembered length
  (#368).
- By hand and Platoon overtime (#368).
- Who-plays choices (#369). Share link and card labels (#370).
