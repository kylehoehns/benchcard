# #382 — removePlayer clears the removed id from a game's overtime five

## Issue

#382. `removePlayer` sweeps a removed player's id from every id-keyed field on
a game except `g.overtime[i].five`, which #369 added.

## Goal

Removing a player leaves no trace of their id in any game, overtime included,
so a backup or hand-off link made before the next reload carries no stale id.

## Decisions

The ticket is `ready-for-agent`. The survey held up its claims:

- `removePlayer` (`app/state.js`) touches `g.out`, the constraints and
  `g.live`, never `g.overtime`.
- `storage.js` describes an overtime period as `{ minutes, who, five? }`;
  `cleanOvertime` drops unknown ids on load and omits `five` when it is empty.
- `test/remove-player.test.js` guards the sweep with a regex over
  `removePlayer`'s source, one `MUST_SWEEP` row per field, and has no row for
  overtime.
- `pinFives` filters `five` against available players and `isPinned` treats an
  empty or missing `five` as not pinned, so today's impact is in memory and in
  anything exported before a reload.

Questions the ticket leaves open, decided here as closest to its intent:

- **An emptied `five`.** When the removed player was the only id in `five`,
  the field is left as `[]` rather than deleted. `isPinned` already reads an
  empty `five` as not pinned, and `cleanOvertime` drops the empty field on the
  next load, so both shapes behave the same; keeping the key is the smaller
  change.
- **Entries without `five`.** Left exactly as they are (same object). A legacy
  bare-number entry never reaches memory (`cleanOvertime` upgrades it on load),
  but the sweep only touches entries that hold a `five` array, so it is safe
  either way.

## What would settle it

1. A game whose `overtime` is `[{ minutes: 3, who: 'keep', five: [p1..p5] }]`:
   after `removePlayer('p3')`, `g.overtime[0].five` does not contain `'p3'` and
   still holds the other four, before any reload. Shown red before the fix.
2. A new `MUST_SWEEP` row, `overtime.five`, in `test/remove-player.test.js`
   fails with the fix reverted.

## Surfaces

- Changes: `app/state.js` (`removePlayer` only), `test/remove-player.test.js`,
  a behavioral test file under `test/`.
- Must not change: `app/storage.js`, the engine, `live.js`, anything a coach
  sees.

## Constraints

- `app/state.js` is precached: when it changes, run `npm run sw:bump`.
- Reuse `test/state-fixture.js` (`withTeam`, `player`, `bareGame`) for the
  behavioral test; do not hand-build another state.js import harness.
- The sweep's comment block in `removePlayer` names what it sweeps; keep it
  true.

## Design

In `removePlayer`'s per-game loop, map `g.overtime` so every entry that holds
a `five` array gets a copy with `id` filtered out. Leave other entries as they
are.

## Proof

- **`node --test` on `removePlayer`** through `test/state-fixture.js`: item 1.
  Not a Coach scenario: a coach cannot see a stale id in `five` (`pinFives`
  hides it), so no screen can assert it.
- **Guard** (`/new-guard`): the `MUST_SWEEP` row in
  `test/remove-player.test.js`, a source-reading check named here as a seam.
  Falsified by reverting the fix and watching that row fail: item 2.

## Out of scope

- #359: moving record-changing operations off the `state.js` singleton.
