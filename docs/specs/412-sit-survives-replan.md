# 412 — A sit for the rest survives a re-plan

## Issue

#412: "Sit for the rest" is undone by any later re-plan (an arrival, a Who's
here change, a Shuffle, overtime, a hand-off). Make the sit a standing fact of
the live game that every re-plan keeps.

## Goal

A coach sits an injured kid for the rest of the game. Whatever happens after
that (a late kid walks in, attendance changes, Shuffle, overtime with any of
the four choices, the game handed to another phone), the sat kid plays no
more stints in that game until the coach puts them back.

## Survey

- The sit is written only as `live.overrides[k..n-1]` (plus `live.hand`) by
  `sitRest` in `app/gamemode.js`. Nothing records "this kid is sat". Every
  re-plan path (`freezePlayedAndReplan` → `resolveRest(g, p, through)`, the
  #134 fallback in `syncOverrides`, `pinnedFive`/`pinFives` for overtime)
  plans from `availIds(g)`, which still includes the sat kid. The issue's
  cause holds.
- **Claim that does not hold:** the issue names an existing "Back in" path.
  There is no "Back in" control anywhere in `app/`. The ways a coach undoes a
  sit today are the Undo on the sit's toast and **Back to the printed plan**
  (`#gmReset`). Choice (closest to the intent): those two are the way back.
  `#gmReset` must stay visible while a sit stands, because a re-plan rewrites
  the sit's stints as non-hand and today's visibility rule (`live.hand` after
  the current stint) would then hide the only way back.
- **Question the issue leaves open:** "keep the existing short-bench behavior
  and say so". When sitting someone would leave fewer than five, `sitRest`
  refuses (`SIT_REFUSALS.nobody`). A re-plan cannot refuse (the arrival or
  attendance change already happened). Choice: the re-plan runs without the
  sit for that solve, so the sat kid fills the fifth seat (a five must be
  made), the sit **stays recorded**, and the coach is told once:
  `Not enough players to keep {call name} sitting.` (names joined with
  `joinNames` for more than one). When a later re-plan has five without them,
  the sit applies again.
- **Left as is:** after a re-plan, stints the sit wrote are overwritten by
  the re-plan, so the existing "swaps you made by hand were cleared" notice
  can still fire when the only hand stints were the sit's. Its wording is not
  changed here (one issue at a time); the sit itself is kept, which is what
  the issue asks.

## What would settle it

All Coach scenarios through `test/coach.js`, each red on today's code (the
sat player appears on the floor in a later stint):

1. **Arrival (Here now).** `onGameDay` (11 players, one out), Start game, sit
   Eli at stint 3 (index as the issue counts it), Next stint, **Here now** for
   the late player. Eli is on the floor in no stint from the sit on
   (`floorEachStint`, or stepping to each later stint with `onFloor`).
2. **Who's here.** Same, but Leave > Who's here > mark the late player here >
   Resume. Eli is on no later stint.
3. **Shuffle.** Sit Eli mid-game, leave, Shuffle, reopen: Eli on no later
   stint.
4. **Overtime, all four choices.** 9 players, sit Ana at stint 8 (the last
   regulation stint), add a 4-minute overtime with each of Next rotation,
   Even out, Strongest five, Keep this five (one scenario each, or one loop).
   Ana is in no OT1 five. This is the "overtime picker never offers a five
   with a sat player in it" criterion.
5. **Hand-off.** Sit Eli, share the hand-off link, open it on a fresh device,
   then mark the late player here there. Eli is on no later stint on the
   receiving phone.
6. **Reload.** Sit Eli, come back later (reload), then an arrival: Eli stays
   off. (`live.sat` survives `storage.js`'s sanitizer.)
7. **Way back.** After scenario 1's re-plan, **Back to the printed plan** is
   on screen; tapping it puts Eli back in the later stints the printed plan
   gives him. Undo on the sit's toast also puts him back (existing behavior,
   one assertion).
8. **Short bench.** A roster where marking players out leaves exactly five
   available including the sat kid: the re-plan puts the sat kid on, and the
   toast reads `Not enough players to keep {name} sitting.` Marking one of
   those players here again re-applies the sit (the kid is off the later
   stints again).
9. **Docs.** `docs/specs/247-played-stints-stay-played.md` (an amendment
   line) and `docs/design-decisions.md` say a sit for the rest survives a
   re-plan; `docs/architecture/bench-mode.md`'s Sit for the rest paragraph
   no longer says the rotation stamp drops it. `CONTEXT.md`'s **Sit for the
   rest** entry names `live.sat`.

## Surfaces

- `app/live.js` — the record op: `live.sat` (array of player ids). Add
  `satIds(live)` (read), `sitOut(live, id)` (write) and clear it in the Reset
  path. live.js stays the one writer of live fields (#356).
- `app/state.js` — `resolveRest` excludes `satIds(g.live)` always (union with
  `sitIds`); `pinnedFive`, `repinOvertime` plan from available-and-not-sat;
  `freezePlayedAndReplan` retries without the sit on `reason: 'nobody'` and
  raises the short-bench signal; the #134 fallback re-applies a standing sit
  with `resolveRest` from `resetFrom(live)` (not by hand) when the game is
  underway; `resetRest` clears the sit. A read-and-reset signal like
  `overridesDropped` for the short-bench names.
- `app/gamemode.js` — `sitRest` records the sit through `sitOut`;
  `#gmReset` shows when `satIds(live).length` too.
- `app/render.js` — flashes the short-bench sentence, beside the
  `overridesDropped` notice.
- `app/storage.js` — the sanitizer keeps `sat` as a list of valid, unique
  player ids; absent when empty (same shape rule as `arrived`).
- `app/handoff.js` — the payload's `l` carries `sat`; decode passes it to the
  sanitizer.
- `test/*-scenarios.test.js` (new `test/sit-survives-scenarios.test.js`),
  `test/coach.js` only if a verb is missing.
- Docs (doc-writer): the files in item 9.
- Must not change: `engine.js`, `budget.js`, `roster.js`; the sit's own
  one-seat behavior (#376); the wording of existing toasts.

## Constraints

- **Reuse, do not re-derive:** `resolveRest` is the one re-plan; every path
  gets the sit by passing through it, not by filtering fives afterwards.
  `availIds(g)` stays "at the game"; "playing" is `availIds` minus
  `satIds(live)`, built in one helper in `state.js`, not inlined per caller.
- The `#376` opening-five seed applies only to a fresh sit (the `sitIds`
  argument), never to the standing ones, so a re-plan does not start seeding
  the suffix's first stint.
- `live.sat` is written only in `live.js` (`test/live-guard.test.js`-style
  rule, #356).
- `storage.js` is one of the four pure modules: the change is one more field
  in the sanitizer's `live` block, nothing else.
- Undo needs nothing new: `undoable` snapshots the whole record, `sat`
  included.
- Copy: plain, American spelling, the call name (`callNames`) as the other
  bench toasts use.
- The hand-off link format gains one optional key; an older link without it
  decodes as before (no sit).

## Design

`live.sat = [id, ...]` is the standing fact. `sitRest` writes the overrides
exactly as today and adds the id with `sitOut`. Every re-plan reads it
through `resolveRest`, which drops sat ids from `avail` the same way it drops
`sitIds`, so the suffix solve, the pinned overtime fives (`pinFives` already
takes `avail`) and the fairness targets all see the kid as not playing.
`pinnedFive` (Keep / Strongest at add time) picks from the playing ids. If
`resolveRest` answers `nobody` only because of the standing sit, the freeze
solves again without it and records the names for the notice. Reset
(`resetRest`) clears `sat` before it re-plans: back to the printed plan means
everyone. A sat kid later marked out and back here keeps the sit.

## Proof

- **Coach seam** (`test/coach.js`, new `test/sit-survives-scenarios.test.js`):
  items 1-8.
- **`node --test` on `test/handoff.test.js`** if the payload's `l` shape is
  asserted there: `sat` round-trips; a link without it decodes with no sit.
- **`node --test` storage sanitizer** case beside the `arrived` one: `sat`
  keeps valid unique ids, drops unknown ones, absent when empty.
- Smoke: unchanged rows; full `npm run smoke` once per commit.

## Out of scope

- A "Back in" control, or any on-screen marker that a kid is sat.
- Rewording "The swaps you made by hand were cleared" for the sit's stints.
- Sit for the rest under By hand / Platoon (still refused).
