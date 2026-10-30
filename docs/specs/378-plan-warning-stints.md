# 378 — Plan warnings check caps against the stint they mean

## Issue

#378: two feasibility checks in `app/engine.js` compare a cap with the longest
stint instead of the stint that matters, and several messages print raw floats.

## Goal

A coach who pins a starter with a 7-minute cap in a 2×20 game subbing every 6
gets a plan, not a block. The opening stint is 6 minutes, so the cap covers it.
Every number a plan warning shows reads the way the card prints minutes
(`3.3`, never `3.3333333333333335`).

## What would settle it

All under `node --test`, through `analyzeFeasibility` / `generatePlan`:

1. 2×20, `everyN` 6 (stints 6, 6, 8, 6, 6, 8), a starter in `openingFive` with
   `maxMinutes` 7: no `FORCED_OVER_CAP` and no `CAP_BELOW_STINT`.
2. Same format, the starter capped at 5: `FORCED_OVER_CAP` fires, and its
   message names a `6-minute stint`.
3. Same format, a player in `lastPeriodFive` capped at 7: no `FORCED_OVER_CAP`
   (the last period's first stint is 6). Capped at 5: it fires and names 6.
4. 4×10, `perPeriod` 3: no message contains `3.333`; a stint length in a
   message reads `3.3` (for example a 7-minute minimum gives
   `rounds up to 10 (stints are 3.3 minutes)`).
5. 4×10, `perPeriod` 3, a 10-minute minimum: no `MIN_OFF_STINT_BOUNDARY`
   (10 is three whole stints; the old `%` said otherwise by float error).
6. The fuzzer generates at least one format with overtime and at least one with
   uneven stints, asserts so, and asserts no issue message in any scenario
   matches `/\d\.\d{3,}/`.
7. Property (fuzz): a starting five whose caps all cover `stints[0]` is never
   blocked by `FORCED_OVER_CAP`.

## Surfaces

- Changes: `app/engine.js` (`analyzeFeasibility`, and the call in
  `generatePlan`), `test/engine.test.js`, `test/fuzz.test.js`, `app/sw.js`
  (version bump only).
- Must not change: the solver's search, `buildForced`'s behavior, the issue
  codes, the message wording beyond the numbers, `app/plan-view.js`,
  `app/gamemode.js`.

## Constraints

- `engine.js` is one of the four pure modules (`AGENTS.md` § Rules): no DOM, no
  state import; the change stays arithmetic.
- **Reuse `fmtMinutes`** (`engine.js`) for every minute value derived from
  stint lengths. Do not write a second formatter.
- **Do not re-derive "the first stint of the last period".** `buildForced`
  already finds it (`stints.findIndex(s => s.period === format.periods)`).
  Pull that into one small helper both `buildForced` and `analyzeFeasibility`
  call, so the warning and the solver cannot disagree about which stint the
  last-period five covers. `generatePlan` passes `format.periods` to
  `analyzeFeasibility`. When a direct caller omits it, fall back to the highest
  non-overtime `period` among the stints (`isOvertimeStint`), which gives the
  same index for a full game and for a mid-game suffix.
- A suffix (mid-game re-plan, `input.stints`) keeps working: the opening five
  is checked against the suffix's `stints[0]`, which is what the solver pins.
  When no last-period stint remains (all overtime), the last-period check is
  skipped, as `buildForced` skips it.
- `app/engine.js` is precached: run `npm run sw:bump`.
- No interface rule changes; W4 (plain wording) already holds for these
  messages and the words stay the same.

## Design

- `CAP_BELOW_STINT`: compare with the **shortest** stint, and name it.
- `FORCED_OVER_CAP`: for the opening five, compare with `stints[0].minutes`;
  for the last-period five, with the first stint of the last period (skip if
  none). The message names that stint's length.
- `MIN_OFF_STINT_BOUNDARY`: the divisibility test tolerates float error (a
  ratio within `1e-9` of a whole number counts as whole), and the rounded-up
  value uses the same tolerance before `Math.ceil`.
- Every minute value in a feasibility message that comes from stint lengths
  (stint lengths, `gameMinutes`, `floorMinutes`, closing-window minutes,
  target budget arithmetic) goes through `fmtMinutes`. Coach-typed values
  (caps, minimums, targets) print as typed.
- Fuzz: the scenario generator sometimes adds `format.overtime` (one or two
  periods of e.g. 3–5 minutes) and includes uneven-stint granularities
  (`everyN` that does not divide the period, so a folded tail). Keep the
  existing scenarios' meaning; new random draws go at the end of the generator
  so the earlier draws stay the same where possible.

## Proof

- `node --test test/engine.test.js`: items 1–5, calling `analyzeFeasibility`
  with `buildStints` output (and `generatePlan` for item 3's `periods` path).
- `node --test test/fuzz.test.js`: items 6–7.
- No Coach scenario: nothing a coach taps changes, and the wording rules are
  unchanged; the pure-function seam has the many cases.

## Out of scope

- New wording for any message, new issue codes, plan-view collapsing.
- `CLOSER_OVER_CAP`'s comparison (it already uses the closing window's
  minutes); only its number is formatted.
- The halves card-title quirk and anything else in the overtime tickets.
