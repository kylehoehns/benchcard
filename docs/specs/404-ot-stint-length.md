# 404 — Overtime under "× / period" uses the regulation stint length

## Issue

#404: in `perPeriod` mode, plan an overtime period by the regulation stint
length (`periodMinutes / n`), the way `everyN` does, instead of cutting it into
`n` equal pieces.

## Goal

A coach who subs "4× a period" with 8-minute quarters and adds a 2-minute
overtime gets one 2-minute overtime stint, not four 30-second ones. Nobody
swaps players every 30 seconds.

## What would settle it

1. **Engine, short OT.** `buildStints({ periods: 4, periodMinutes: 8,
   overtime: [2] }, { mode: 'perPeriod', value: 4 })` gives the 16 regulation
   stints unchanged, then exactly one OT stint: `minutes` 2, `startSec` 120,
   `endSec` 0. On the old code this test is red (four 0.5-minute stints).
2. **Engine, full-length OT.** Same format with `overtime: [8]` under
   `perPeriod 4` gives four 2-minute OT stints.
3. **Engine, tail fold.** `everyN`'s rule folds a tail strictly under half
   the interval. So 2 × 16 with `perPeriod 2` and `overtime: [9]` gives one
   9-minute OT stint (the 1-minute tail is under half of 8). A 3-minute OT
   under `perPeriod 4` on 4 × 8 gives `[2, 1]`, exactly what `everyN 2` gives
   today: a 1-minute tail is exactly half of 2, not under it.

   *Survey correction:* the issue said a 3-minute OT here is one 3-minute
   stint "as `everyN 2` does today". `everyN 2` on 3 minutes gives `[2, 1]`.
   The issue's stated rule (reuse `everyN`'s fold) and its example disagree;
   the rule wins, because a second fold threshold would be the second copy
   of a fact this repo forbids.
4. **Nothing else moves.** Regulation stints under every `perPeriod` value are
   unchanged; `everyN` and `breaksOnly` overtime stints are unchanged.
5. **Coach, bench mode.** On a 4 × 8 game set to "4× / period", a coach on
   the last stint taps **Tied? Add overtime**, sets 2 minutes and adds it: the
   game shows one OT stint, not four (e.g. the stint after the last regulation
   one is the final stint, and the next-box / end-of-game text says the game
   ends at 0:00 from OT, with no further OT stint).
6. **Docs.** `docs/design-decisions.md` and the Overtime section of
   `app/advanced.html` say how overtime is split: in stints as long as the
   regulation ones, with a short tail folded in.

## Survey: a claim the issue got wrong

The issue says #367's spec example "still holds" if an 8-minute OT under
`perPeriod 4` stays four stints. But #367's example (spec line 26, and the
test `overtime is split by the same granularity rule as a period` in
`test/engine.test.js`) is **2 × 16 with `perPeriod 2`**, an 8-minute OT split
into two 4s. Under the new rule the regulation stint is 8 minutes, so that
OT is **one 8-minute stint**. Choice (closest to the issue's intent, and the
issue already allows updating that line): apply the rule as the issue states
it, change that test's expectation to `[8]`, and update the #367 spec line to
say the new rule with that value.

## Surfaces

- `app/engine.js` — `periodLengths` / `buildStints`: the only logic change.
- `test/engine.test.js` — new cases 1–4; the #367 case updated.
- A Coach scenario for item 5, in the existing overtime scenario file that
  fits (`test/overtime-add-scenarios.test.js` or
  `test/overtime-minutes-scenarios.test.js`), through `test/coach.js`.
- `docs/specs/367-grid-grows-at-end.md` line 26 wording.
- `docs/design-decisions.md`, `app/advanced.html` (doc-writer for docs/;
  `advanced.html` is app copy — a one-sentence addition, by the developer).
- `app/sw.js` via `npm run sw:bump` (engine.js and advanced.html are precached).
- Must not change: `state.js`, `live.js`, the solver, storage, the link format.

## Constraints

- `engine.js` is one of the four pure modules: no DOM, no storage, stays
  deterministic.
- The stint shape comes from `buildStints`, never a local copy
  (design-decisions). Reuse `periodLengths`' `everyN` branch for overtime —
  do not write a second tail-fold rule.
- If a precached file changes, run `npm run sw:bump`.
- `advanced.html` copy: plain, short, American spelling; check the public page
  tests (`test/advanced-overtime.test.js`, seo) still pass.

## Design

In `buildStints`, an overtime period under `perPeriod` is split with the
`everyN` rule at interval `periodMinutes / n` (n as `periodLengths` computes
it: `Math.max(1, Math.floor(g.value))`). Regulation periods keep calling
`periodLengths(periodMinutes, g)` as now. `everyN` and `breaksOnly` overtime
are unchanged (they were already independent of period length or one stint).

## Proof

- `node --test test/engine.test.js` (pure-function seam, many inputs): items
  1–4, and the updated #367 case.
- Coach seam (`test/coach.js` scenario): item 5.
- Item 6 is copy; the existing advanced/seo tests cover the page still
  rendering. No new guard.

## Out of scope

- Changing regulation splitting, `everyN` or `breaksOnly`.
- Any change to who plays overtime, the Add overtime sheet, or the card.
