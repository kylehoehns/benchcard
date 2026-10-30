# #376 — Sit for the rest changes one seat, not five

## Issue

#376. In bench mode, **Sit for the rest** re-solves from the current stint
with nothing holding the other four players on it, so more than one seat on the
current floor can change.

## Goal

A coach taps a player on the floor and **Sit for the rest**: that kid goes off,
one bench kid comes on, and the other four stay where they are. Later stints
are re-planned fairly, as today.

## Decisions

The ticket is `ready-for-agent`. The survey held up its claims:
`sitRest` (`app/gamemode.js`) calls `resolveRest(g, p, i, [outId])` from the
current stint, and `resolveRest` (`app/state.js`) sets `c.openingFive = []`, so
the solver is free on stint `i`. Two questions the ticket leaves open, decided
here as closest to its intent:

- **The hold is only for a sit.** `resolveRest` has other callers that pass no
  `sitIds` (Even out from the next stint, Reset, overtime). They plan stints
  nobody is standing on yet and keep today's behavior. The hold applies when
  `sitIds` is non-empty and stint `from` is an open (not coach-pinned, #369)
  stint.
- **If the held solve cannot be met, fall back to today's free solve** rather
  than refusing. A coach who needs a hurt kid off must not be blocked because,
  say, a hand swap earlier put two Apart players on the floor together. The
  fallback still sits the kid; only then may more than one seat change.

## What would settle it

1. Coach scenario (`test/coach.js`): 9 players, 4 quarters, the default sub
   interval, bench mode at stint 3. Tap a player on the floor, tap **Sit for
   the rest**. Stint 3's floor is the old floor minus that player plus exactly
   one bench player; the other four are unchanged.
2. Property test over `resolveRest` (`node --test`): for 8, 10 and 11 players,
   seeds 1–15, sitting a player on the floor at a mid-game stint `k`, the
   returned five for stint `k` shares exactly four players with the floor
   before the sit, and does not include the sat player.
3. The sat player plays 0 minutes in every stint from `k` on (as today).
4. Stints before `k` are unchanged (as today).
5. The existing sweep in `test/resolve-rest.test.js` (re-solve no worse than a
   one-for-one swap in any case) still passes.
6. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `app/state.js` (`resolveRest` only), `app/sw.js` (`VERSION`, `SHELL`
via `npm run sw:bump`), `test/resolve-rest.test.js`, a Coach scenario
(`test/game-day-scenarios.test.js` or a sibling), and `test/coach.js` only if a
9-player game day needs a fixture helper.

Must not change: `app/engine.js`, `app/gamemode.js` (its focus code already
assumes one new id), the toast copy, `Rest of game`, the other
`resolveRest` callers' results.

## Constraints

- Reuse the engine's existing forced-group input: hand the held four to the
  solver as `c.openingFive` (stint 0 of the solved suffix is stint `from`).
  Do not add a new engine option or post-process the solver's five.
- The held four are read from `effectiveStints(g, p)[from].onFloor` (what is on
  the floor now, hand swaps included), minus the sat ids, filtered to available
  players. Do not re-derive the floor from `p.stints`.
- The past is never written (stints `0..from-1`), as today.
- Precache: `app/state.js` is precached, so run `npm run sw:bump`.
- Interface rules A3 and P6 are already met by the existing undo toast; no copy
  changes.

## Design

In `resolveRest`, after `c` is cloned: when `sitIds` is non-empty and
`open[0] === k`, set `c.openingFive` to the current floor at `k` minus the sat
ids. Solve. If that solve is not ok, solve once more with
`c.openingFive = []` (today's behavior) and use that result; refuse only if
both fail.

## Proof

- **Coach seam** (`test/coach.js`, real Chrome): item 1, red first against
  today's tree.
- **`node --test` over `resolveRest`** in `test/resolve-rest.test.js`: items
  2–5, the sweep red first against today's tree.

## Out of scope

The This stint / Rest of game segment staying on after a swap (a design
question, per the ticket).
