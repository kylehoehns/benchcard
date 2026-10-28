# #356 — live.js is the only module that writes a game's live record

## Issue

#356: make `app/live.js` the only module that assigns `live.at`,
`live.hand`, `live.overrides` and `live.finished`, by giving it the few
operations `state.js` and `gamemode.js` perform today.

## Goal

Nothing a coach sees changes. The rule "`hand` only lists stints that still
have an override" is kept in one file, so a new caller cannot forget it and
leave a stale swap showing mid-game.

## What would settle it

1. `grep -nE '\.live\.(at|hand|overrides|finished)\s*=|live\.(at|hand|overrides|finished)\s*=' app/*.js`
   prints matches only in `app/live.js` (comment lines aside).
2. The aliased write the issue's grep misses is gone too: `gamemode.js`'s
   `gmStep` (`l.at = stepAt(...)`) goes through `live.js`. No file other than
   `live.js` assigns, `delete`s, or mutates in place (`ov[k]` deletes through a
   local alias included) any of the four fields.
3. `test/live-guard.test.js` enforces item 2 for all four fields: it fails on
   `x.at = …`, `x.hand = …`, `x.overrides = …`, `x.finished = …`,
   `delete <...>overrides[...]` / `delete ov[k]` where `ov` aliases
   `live.overrides`, in any `app/` file but `live.js` and `storage.js`. It
   replaces today's two narrower tests (the `live.at = <expr>;` allowance and
   the `gamemode.js may write live.finished = true` allowance), keeping their
   read-side rules (no comparison/clamp/arithmetic on `live.at`, no read of
   `live.finished`) outside `live.js`/`storage.js`.
4. `test/live.test.js` covers each new `live.js` operation directly, with a
   hand-built plan and live record and no DOM stub — including a swap being
   removed so its stint must leave `hand`.
5. `reseed` (`state.js`) has no copy of the trim logic; it calls the same
   `live.js` operation `clearRest` uses (or `clearRest` itself, if it reports
   what it dropped).
6. `npm test` and `npm run smoke` pass with no change to the expectations of
   existing bench-mode tests (`test/live.test.js`, the Coach scenarios,
   `test/*gamemode*`, `test/*state*`). New tests are added; old ones may only
   change their import lines.

## Surfaces

Change: `app/live.js`, `app/state.js` (`removePlayer`, `setAvailable`,
`reseed`, `freezePlayedAndReplan`, `syncOverrides`), `app/gamemode.js`
(`openGameMode` ~:202, `gmFinish` ~:404, `gmStep` ~:1025),
`test/live.test.js`, `test/live-guard.test.js`, `app/sw.js` (bump only).

Must not change: `app/storage.js` (its sanitizer builds a whole record; it is
the named exception), `app/handoff.js`'s decoder at ~:118 (builds a whole
record from a link, not a field write), `engine.js`, `budget.js`,
`roster.js`.

## Constraints

- `live.js` stays pure: no DOM, no `state.js`, imports only `./engine.js`
  (`live-guard.test.js` already enforces this). Its new operations take the
  `live` record (and plain values: an id, a stint index, a map of fives) —
  never a game, plan lookup or `state`.
- Reuse, do not re-derive: `handStints` is the one reader of `hand`;
  `writeOverrides` is the one way a batch of fives lands; `resetFrom` decides
  where "the rest" starts. The new operations are built on these. `reseed`'s
  trim is exactly `clearRest` restricted to `k < keep` — one function, not two.
- Order matters in `freezePlayedAndReplan`: `resolveRest` reads
  `g.live.overrides` (through `effectiveStints`), so the frozen overrides must
  be on the record before `resolveRest` runs, and restored if it refuses.
- Undo: `gmFinish`'s write stays inside its `undoable` closure; `undoable`
  snapshots state, so only *which function* makes the write changes.
- `hand` on a record from before the list existed (no array) keeps its
  current meaning: `handStints` treats every override as by hand. Today's
  `if (Array.isArray(live.hand))` guards in `removePlayer`/`setAvailable`/
  `reseed` must keep that behavior — a pre-list record stays pre-list where it
  did before, or the result through `handStints` is identical.
- Precache: `app/live.js`, `app/state.js`, `app/gamemode.js` are precached —
  run `npm run sw:bump`.
- `live.arrived`, `live.stamp` and `liveOf`'s `g.live ||= {...}` creation are
  not among the four fields; leave them where they are.

## Design

Add to `live.js` roughly these (names are the developer's to settle, one job
each):

- `dropPlayer(live, id, from = 0)` — delete every override at stint `>= from`
  whose five includes `id`, and drop those stints from `hand`. Serves
  `removePlayer` (from 0) and `setAvailable` (from `at`, and a finished game
  is the caller's existing no-op).
- `keepThrough(live, keep)` — keep overrides and hand entries with `k < keep`
  only; `clearRest` becomes `keepThrough(live, resetFrom(live))`, and `reseed`
  calls `keepThrough(live, resetFrom(live))` after reading `had`.
- `replaceOverrides(live, overrides, hand)` (or a freeze/restore pair) for
  `freezePlayedAndReplan` and `syncOverrides`' clear-all.
- `moveTo(live, at)` for `openGameMode`/`gmStep`, and `finish(live)` for
  `gmFinish`.

## Proof

- **`node --test` on `live.js`'s exports** (`test/live.test.js`) — the pure
  seam; covers items 4 and 5 (each operation, hand-built plans and records,
  including "swap removed → stint leaves `hand`" and a pre-list record).
- **Guard** (`test/live-guard.test.js`, written under `/new-guard`, falsified
  by planting each forbidden shape) — covers items 1, 2 and 3.
- **Existing suite and smoke unchanged** — the Coach scenarios and bench-mode
  tests are the behavior oracle for item 6. No new Coach scenario: nothing a
  coach sees changes.

## Out of scope

- Moving `live.arrived` / `live.stamp` writes, or `liveOf`, into `live.js`.
- `storage.js`'s sanitizer and `handoff.js`'s link decoder, which build whole
  records.
- Any visible change.
