# 489 — Re-plans keep the past; second-half warning; rule edits move little

One pull request for four engine tickets, cut as one batch: #489, #490, #448,
#449. Each keeps its own section under **What would settle it**.

## Issue

- **#489**: with By hand, a late arrival mid-game rewrites stints already
  played and shows the late kid on the floor before they arrived.
- **#490**: a departure mid-game rewrites stints already played when the caps
  left cannot cover the floor (CAPS_UNSATISFIABLE on the re-plan of the rest).
- **#448**: under period-break subs, a kid who sits the whole second half gets
  no warning; the first-half mirror (`HALF_LATE`) exists.
- **#449**: adding a rule that changes little still moves about a third of the
  seats on the card, about as many as Shuffle.

## Goal

A coach who has played part of a game never sees the stints already played
change, whatever the strategy or caps, when a kid arrives or leaves. A coach
told nothing about a kid who sits the whole second half now is. A coach who
adds a small rule to a card they already studied sees only the seats the rule
needs moved.

## Survey

Measured on `2a33369` with a scratch probe through `app/state.js` and
`generatePlan` (players `p0`..`pN`, or `A`..`J` for #449):

- **#489 holds.** 9 players, 4x8 every 4, By hand, p8 out, `live.at = 4`,
  p8 arrives: stints 0-3 change on 8/8 seeds, and p8 is shown on the floor
  before stint 4 on 8/8. Sweep of 80 By hand games (7-12 kids, 2 or 4
  periods, 6-10 min, sub every 3-5, an arrival or departure at a random
  stint): played stints change in 64/80. Cause as stated: `resolveRest`
  returns `reason: 'strategy'` for `minutes`, so `freezePlayedAndReplan`
  returns false and `syncOverrides` falls back to the #134 rewrite.
- **#490 holds.** The repro (7 players, 2x7 every 3, Plays at most 7 on p0 and
  p1, p2 leaves at `live.at = 2`) changes the played stints. Sweep of 88 games
  (6-9 kids, 1-3 caps, balanced / closers / By hand, a departure at a random
  stint): 21/88 change played stints (By hand included). Cause: the re-plan's
  caps are each cap minus minutes played, and their sum with the uncapped kids
  is under the floor, so `analyzeFeasibility` returns `CAPS_UNSATISFIABLE`.
- **#489 and #490 share the fallback, not the refusal.** Both end in
  `syncOverrides` taking the #134 path after `freezePlayedAndReplan` returns
  false. The refusals differ (strategy vs. caps), so each gets its own fix
  inside the one re-plan, `replanRest` / `resolveRest`.
- **#448 holds.** 4x5 breaksOnly, league minimum 10 (as `minMinutes`),
  maxSubs 3, seeds 1-20: 40 kids play only the first half and none is named
  (10 players); 9 players: 20. 4x8: same counts. maxSubs 5: 0. 2x10
  breaksOnly with 10 players: 100 (every plan, five kids). `HALF_LATE` lives
  in `finish()` in `app/engine.js`.
- **#449 holds.** Base: 10 players A-J, 4x8 every 4, Starting five A-E, Apart
  F-G, One of two on A-F, Rest limit 2. Seats moved in stints 1-7, seeds 1-10,
  through `computeAll`: Plays at least 8 for A mean 11.8 (16 9 14 13 20 15 0 8
  8 15); Apart I-J 16.2; soft Together H-I 14.4; cap 28 for J 0 on every seed;
  Shuffle 16.7.
- **Plans are recomputed, never stored** (`state.js`, "plans -- recomputed,
  never stored. Deterministic from inputs + seed."). So #449's "start from
  the previous plan" cannot read an in-memory plan alone: after a reload the
  cache is empty, and a cold solve would move the card the warm solve kept.
  The start point has to be saved on the game. `render()` runs `computeAll()`
  then `save()`, so a field `computeAll` writes is saved (as `live.stamp` is).
  `sanitizeGames` in `app/storage.js` keeps only the fields it names, so a new
  game field needs a line there.

## Choices the issues left open

Recorded here and in the PR body.

1. **#489: By hand re-plans the rest; Platoon still does not.** The issue is
   about By hand. Platoon's units are exact fives with nothing to re-plan, and
   test E for Platoon stays as it is.
2. **#489: how hand targets map onto the stints left.** Each kid's target for
   the rest is their whole-game hand minutes minus the minutes they have
   played (never below 0). A kid who arrived late has their whole-game hand
   minutes scaled to the share of regulation left after the stint they arrived
   in, the same scaling `leagueMinFor` gives the league minimum. These "wants"
   are shared out over the minutes left with the same `carryoverTargets` the
   other strategies' re-plan uses, with no ±two-stint band (a hand number is
   the coach's word, not a nudge). Minimums and caps still win, as today.
   A locked hand number stays locked in the re-plan, for the kids still
   here (the other strategies' re-plans still drop locks: their targets are the
   fairness ones).
3. **#489: Sit for the rest stays refused under By hand.** Only re-plans with
   nobody sat lose the refusal (the freeze, and the one-stint swap's re-plan,
   which already calls `resolveRest` with no sitters). `SIT_REFUSALS.strategy`
   ("Its minutes are set by hand") stays true. This keeps the diff to what the
   issue asked.
4. **#490: relax the spent caps for the rest and warn**, the first of the
   issue's two options. The second ("show the refusal") would leave a game
   underway with no rotation for the rest, which a coach on the bench cannot
   use. Only `replanRest` (the freeze and the #134 fallback) relaxes; a sit
   or a swap still refuses as today.
5. **#449: what counts as "a rule edit", and where the start is kept.** A
   rule edit is a re-solve where the game's `constraints` changed and nothing
   else that reaches the solver did. The start is the previous plan's
   lineups, saved on the game as `g.basis`, keyed to the inputs it is valid
   for, so a reload solves the same plan. Shuffle (a new seed) and any other
   change (attendance, format, strategy, levels, settings) solve fresh, as
   today. Undo restores the saved `basis` with the rest of the record, so
   Undo gives back exactly the plan before the edit.

## What would settle it

### #489 (By hand)

- Repro through `state.js`: 9 players, 4x8 every 4, By hand, no other rules,
  p8 out; `live.at = 4`; `setAvailable(g, 'p8', true)`; `computeAll()`.
  Stints 0-4 (the one on the floor included) are the same fives as before on
  seeds 1-8, and p8 is in none of them. p8 plays in the stints after.
- Each on-time kid ends within one stint (4 min) of their hand target, on
  seeds 1-8, where their played minutes allow it.
- The By hand sweep above (80 games): 0 change played stints (from 64/80).
- `rotationMoved()` reports nothing for that arrival (no "Rotation changed").
- Platoon (test E) and a sub-interval change (test D) still take #134.
- Sit for the rest under By hand still returns `reason: 'strategy'`.

### #490 (caps)

- Repro: 7 players, 2x7 every 3, Even, Plays at most 7 on p0 and p1, p2 marked
  out at `live.at = 2`: stints 0-2 unchanged, every later stint has five, and
  the plan carries one warning (code `CAP_RELAXED`) naming each kid who ends
  over their cap, with the cap. Copy: "This game puts Kid 0 and Kid 1 over
  Plays at most 7." It states the fact, not a cause, because the note is
  derived from the minutes and a hand swap can put a kid over a cap too.
- The caps sweep above (88 games): 0 change played stints (from 21/88).
- A kid whose cap is not in the way is not named and not raised.
- `test/fuzz.test.js`'s #437 property drops its exclusion of this class (the
  comment that cites #490) and still passes; By hand joins its strategies.

### #448 (second half)

- Through `generatePlan`, red on `2a33369`: 4x5 breaksOnly, `minMinutes` 10
  for all, maxSubs 3, 10 players, seed 1: a warning names p5 and p9 as not
  playing after halftime.
- Same game with maxSubs 5: no such warning.
- Seeds 1-20 over 4x5 and 4x8 breaksOnly, 9 and 10 players, maxSubs 3: every
  kid who plays a stint before halftime and none after is named; a kid who
  plays in both halves, or plays nothing, is never named.
- Its code is `HALF_EARLY`; it is skipped for Platoon, as `HALF_LATE` is.
  When the clock and change limit explain it, it gives the same arithmetic and
  "allow more changes at once" advice `HALF_LATE` gives, counted for the
  stints after halftime.

### #449 (rule edits)

- Through `computeAll` (the state seam), red on `2a33369`: the base game above,
  add Plays at least 8 for A; seeds 1-10: mean seats moved in stints 1-7
  under 5 of 35 (from 11.8).
- Adding a cap of 28 for J still moves 0 seats on every seed.
- Shuffle still moves about as many as today (mean 14 or more on seeds 1-10;
  today 16.7).
- After the edit, a cold reload (empty plan cache, record round-tripped
  through `sanitize`) solves the same plan the warm solve showed.
- Undo of the edit (restoring the record snapshot) gives back the exact plan
  before it.
- Apart I-J and soft Together H-I: report the new means (no target; they
  are real new constraints).

### All four

- `npm test` and `npm run smoke` green; `npm run evals` shows no check that
  passed on `2a33369` now failing.
- `test/engine.test.js` and `test/fuzz.test.js` stay green.

## Surfaces

Change: `app/state.js` (`resolveRest`, `replanRest`, `computeAll`'s plan
cache), `app/engine.js` (`generatePlan` input, `greedy`, `finish`),
`app/storage.js` (`sanitizeGames`: keep `basis`), tests under `test/`,
`docs/design-decisions.md` (doc-writer). Must not change: anything under
`app/*.css`, any view module (another lane is restyling), `app/sw.js`.

## Constraints

- `engine.js`, `budget.js`, `storage.js` are pure and heavily tested; this
  task is explicitly about the engine. A call with no `start` given must be
  byte-identical to today: every existing engine test and the evals hold.
- **Reuse, do not re-derive:**
  - `replanRest` is the one re-plan for the freeze and the #134 fallback; the
    caps retry goes there, the way the #437 pin retry does (a new option on
    `resolveRest`, like `dropPins`).
  - The late-arrival scaling is `leagueMinFor`'s; reuse its share-of-regulation
    reading (`regulationLens`), do not write a second one.
  - Hand minutes from slots: `slotsToMinutes`; `normalizeTargets` has already
    run on the game before any re-plan.
  - Targets for the rest: `carryoverTargets` (budget.js), as the Even re-plan
    already calls it.
  - Halftime: `ctx.firstHalf` / `stintsBeforeHalftime`, `playedBeforeHalf`'s
    shape; the HALF_EARLY copy reuses `andList`, `plural`, `label`.
  - `lateArrivals(g, p, k)` is the one answer to who is late.
  - "Underway" is `isUnderway` / `stage()`; never read `live.at` for it.
- A test that drives the app goes through the seams below; no test reads
  source.
- No user-facing copy may say "nothing is uploaded" or similar
  (`test/analytics.test.js`); American spelling.

## Design

### #489

In `resolveRest`, the refusal becomes: Platoon as today; By hand (`minutes`)
only when `sitIds` is non-empty (outside an all-overtime suffix, as today).
For By hand with nobody sat, the strategy handed to the solver stays
`minutes`, and the targets are built from the hand minutes as in choice 2:
`fair[id]` (what each kid is owed in total) is their hand minutes, scaled for
a late arrival; the deficit is that minus what they played; `carryoverTargets`
with `cap: total` (no band). Everything else (pins, caps, minimums, streaks)
is the existing code path.

### #490

`resolveRest` gains an option `{ relaxCaps: true }`. With it, when the caps
left (each `cap - played`, plus `total` for each uncapped kid) sum to less
than `total * 5`, each capped kid's allowance is raised by an equal share of
the shortfall (never past `total`), and the plan says so with a
`CAP_RELAXED` note naming each kid who ends over their cap, with the cap. The
note is derived from the minutes on the floor on every render (as the pin and
minimum notes are), not stored, so it survives a reload and clears when the
minutes stop breaking the cap. `replanRest` retries with it when
the first solve is refused as infeasible with `CAPS_UNSATISFIABLE`, before
the pin retry. The kids whose cap is not in the way keep it.

### #448

In `finish()`, next to `HALF_LATE` and under the same `ctx.firstHalf &&
!platoon` guard: the kids who play at least one stint before halftime and
none from `ctx.firstHalf` on get one `HALF_EARLY` warning. Copy: "X and Y do
not play after halftime." plus, when the stints after halftime cannot seat
everyone at the change limit, "Only N can play after halftime here — K
stints, M changes at a time — and you have A. Sub more often, or allow more
changes at once." (the "changes at a time" part only when the change limit is
what binds, as `HALF_LATE`). Otherwise nothing more is said: no cost
term pushes second-half minutes, so no reason is claimed. The arithmetic is
one helper both warnings use. No new cost term: the issue asks for the warning only.

### #449

**Engine.** `generatePlan` takes an optional `start`: one array of ids per
stint. When it is given and has one row per stint, `greedy` prefers it: at
each stint, after the forced, minimum-due and bench-limit picks, the kids in
`start[s]` are tried first (still through `legalWith`, so a new rule repairs
the lineup), then everyone else by score. The local search then runs from
that, with the same seed. If the warm start alone does not bring the #449
mean under 5, add a small per-seat charge in `cost()` for a seat that
differs from `start` (only when `start` is given), sized below every rule
term so it only breaks ties, and record the weight and the measurement in
this spec. Without `start`, nothing changes.

*Tuning, recorded.* The warm start alone was not enough (mean 11.8 seats
moved per seed on "Plays at least 8 for A", because the cold search moved a
plan that already met the rule). The charge is `START_WEIGHT = 5` per seat
not in `start`, below the smallest rule term (20). Weight 1 left a no-op cap
edit moving seats on 4 of 10 seeds; 5, 10 and 15 all gave 0. Two additions
went with it: `startLegal()` (a start with an Apart pair, which `cost()`
does not price, is never kept) and `keepStart()` (a legal start that costs
no more than the search's result is the answer; on the minute-neutral balance
pass only when its per-kid minutes equal the result's, so levels never move
minutes). Measured over seeds 1-10:
Plays at least 8 for A, mean 0.0; cap 28 for J, 0 on every seed; Apart I-J,
5.2 (10 5 4 1 9 3 4 4 3 9; the rule forces a repair); soft Together H-I,
7.2; Shuffle still 16.7 (at least 14, unchanged).

**State.** In `computeAll`, the plan signature gets a companion key with
`g.constraints` and player names (name and nickname) left out (everything else in `sig`). When
the cache holds a plan for the game, the new `sig` differs, the companion key
is the same, the cached plan solved, and `g.basis` is still what the cached
plan was solved with (so an Undo that restored an older `basis` is left
alone), then `g.basis = { key, lineups }` from the cached plan. A
solve passes `start: g.basis.lineups` when `g.basis.key` matches the current
companion key and the stint count matches; otherwise no `start`. The key may
be a short hash of the companion key's JSON. `sanitizeGames` keeps a
well-formed `basis` (ids filtered to the roster, five per row) and drops a
malformed one.

## Proof

| Seam | Covers |
| --- | --- |
| `node --test` through `app/state.js` (`computeAll`, `setAvailable`), as `test/played-stints.test.js` | #489 repro and sweep; #490 repro and sweep; #449 seats moved, reload, Undo |
| `test/played-stints.test.js` test E | Platoon still takes #134; By hand case moves to the new freeze |
| `test/resolve-rest.test.js` | By hand re-plan allowed with no sitters, refused with a sitter; `relaxCaps` |
| `test/fuzz.test.js` #437 property | caps class and By hand included, no stint before `live.at` moves |
| `node --test` through `generatePlan` | #448 warning cases; #449 `start` absent is byte-identical, `start` given keeps seats |
| `test/storage*` (sanitize) | `basis` kept when well formed, dropped when not |
| `npm run evals` | no regression |

## Out of scope

- Platoon re-plans (choice 1). Sit for the rest under By hand (choice 3).
- A cost term that keeps kids on after halftime (#448 asks for the warning).
- Warm starts for attendance, format, strategy or level changes (choice 5).
- Any UI or CSS change: the new warnings show where plan warnings already
  show.
