# 415: a This stint swap says the rest was re-planned

Started in the small lane; the diff came to 22 added lines outside `test/`
(limit 20), so it switched to the full lane mid-build.

## Issue

#415: a This stint swap re-plans the rest of the game (on purpose, #247
decision 3), but the moved line, the toast and the Advanced and help copy all
say nothing else moved.

## Goal

A coach who makes a This stint swap is told the rest of the game was
re-planned, so they follow bench mode rather than the paper card from then on.

## What would settle it

RICH game day (`coach.onGameDay`), Hawks, Start game, Ana off, Devon on (This
stint is the default scope):

1. The toast reads exactly `Devon on for Ana this stint. The rest of the game
   was re-planned to keep minutes even.`
2. Walk to the last stint: `#gmMoved` does not read `1 stint no longer
   matches your printed card.`; it names a count of 2 or more.
3. When the re-plan changes no later stint (or refuses), the toast is today's
   text, unchanged.
4. Advanced (`app/advanced.html`) and the in-app help (`app/index.html`) no
   longer say the printed plan picks up again or that nothing else moves.

## Surfaces

Change: `app/gamemode.js` (`swapToastText`, `applySwap`, the `#gmMoved`
count), `app/advanced.html`, `app/index.html`, `app/sitemap.xml` (Advanced's
`<lastmod>`). Must not change: `engine.js`, `budget.js`, `storage.js`,
`roster.js`, `state.js`, `live.js`; the re-plan behavior itself.

## Constraints

- Behavior stays: the swap and its re-plan are still one Undo.
- The moved count keeps comparing against `p.stints[k]` order-independently
  (`test/sit-rules.test.js` reads that).
- #247 decision 10 kept freeze overrides out of the count. That still holds
  for stints before the first hand swap: the attendance freeze pins played
  stints to the old plan, which matches the paper card.
- `check-sitemap-lastmod.mjs`: Advanced changed, so its `<lastmod>` moves.
- American spelling.

## Design

- **Moved count.** A stint counts when its five differs from `p.stints[k]`
  and it is at or after the first hand-swapped stint. The sentences stay
  ("1 stint no longer matches…" / "N stints no longer match…").
- **Toast.** `applySwap` notes whether the re-plan changed any later stint
  (compared with the effective lineup before writing) and passes `replanned`
  to `swapToastText`, which then returns the sentence in item 1 and drops the
  two-player minutes clause. Naming two of the many changed totals is the
  misleading part the issue names.
- **Copy.** Advanced and help say the rest is re-planned to keep minutes even,
  so the printed card is out of date and bench mode is the one to follow.

## Proof

| Seam | Covers |
| --- | --- |
| Coach scenario, `test/bench-mode-scenarios.test.js` | items 1, 2 |
| `node --test` on `swapToastText`, `test/gamemode-bench-text.test.js` | items 1, 3 |
| Existing `test/game-day-scenarios.test.js` toast assertion, updated | item 1 |
| Read in review and on the preview | item 4 |

## Out of scope

- Listing every player whose total changed (the issue says not needed).
- Changing what the attendance freeze writes or how `live.hand` is kept.
