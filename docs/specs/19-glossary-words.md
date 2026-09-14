# 19 — Rename the app's words to the glossary's

## Issue

#19 (parent #18): everywhere a coach reads the app, use the glossary's words
instead of the old ones, without changing what any stored value means.

## Goal

A coach reads one name for one thing. The player who didn't come tonight is
**absent**, not "out". The strategies are **Even · By hand · Closers ·
Platoon**. The balance shape that keeps every stint alike is **Steady**. Level 3
is **Regular**. The phone view during a game is **Bench mode**, opened with
**Start game**. The help sheet is **How it works**. A coach's saved teams load
exactly as before.

## What would settle it

These are the ticket's acceptance criteria, with the values the survey pinned.

1. **Absent.** The squad count beside Who's here reads `9 of 11 · 2 absent`
   (today `game-setup.js` `availCountText` renders `· 2 out`). No user-facing
   string in `app/index.html` or `app/*.js` uses "out" to mean a player not at
   the game — including the tour step on Who's here (`tour.js`, today "sit them
   out for a no-show") and the How it works copy.
2. **Strategies.** The strategy segment (`index.html` `data-strat` buttons)
   reads, in order: `Even` · `By hand` · `Closers` · `Platoon`. The same four
   names are used wherever a strategy is named to a coach: the How it works
   `Choosing a plan` list, the tour's strategy step (`tour.js`), and copy such
   as `strategy.js` "this plans exactly like Balanced" (becomes "like Even").
3. **Balance shapes.** The lineup balance segment reads `Steady` · `Start
   strong` · `Finish strong` · `Both ends` (`balance.js` `SHAPES`, and the
   How it works `Lineup balance` list).
4. **Levels.** Wherever levels are named (`balance.js` `LEVELS`, and any copy
   that lists them) they read `Developing` · `Learning` · `Regular` ·
   `Reliable` · `Go-to`.
5. **Bench mode.**
   - The dialog `#gamemode` has accessible name `Bench mode`; its close button
     is `Leave bench mode`.
   - Both buttons that open it — `#abBench` (phone action bar) and `#gmOpen`
     (desktop, beside the card) — read `Start game` when the game is not
     part-played, in the static HTML and in `card.js` `labelBench`.
   - When the game is part-played, **both** read `Resume · Q2 4:00` (period and
     clock from `resumeAt`). Today the phone button already reads that and the
     desktop one reads `Resume the game · Q2 4:00`; the ticket gives one label,
     so both use it.
   - The keyboard shortcuts list reads `B` → `Start game`, and every help line
     or accessible name that says "game mode" or "Use on the bench" says bench
     mode / Start game instead.
6. **How it works.** The help sheet title `#helpTitle` reads `How it works`,
   and so do its entry point in Settings (the row title and `#helpBtn`'s
   accessible name).
7. **Stored values unchanged.** A save written before this change loads with
   the same strategy, balance shape and levels: `strategy: 'balanced'`,
   `strategy: 'minutes'`, `balance: 'even'` and `tier: 3` round-trip through
   `storage.js` unchanged. A storage test covers all four.
8. `test/analytics.test.js` (privacy phrasing) and `test/trust-line.test.js`
   still pass.
9. `npm test` and `npm run smoke` pass. Any test that asserts an old label is
   updated in this change to the new one — not deleted.

## Surfaces

Change:

- `app/index.html` — strategy segment, How it works sheet (title and copy),
  Settings help row, bench-mode dialog labels, both bench buttons, keyboard
  shortcut list, `?` button accessible names that say "game mode".
- `app/balance.js` — `LEVELS[2].label`, `SHAPES[0].label`.
- `app/game-setup.js` — squad count.
- `app/card.js` — `labelBench` labels.
- `app/tour.js`, `app/strategy.js`, and any other `app/*.js` string a coach
  reads that uses an old word in the renamed sense.
- `app/sw.js` — `VERSION` bump and `SHELL` digest.
- `test/` — tests that pin old labels; a storage round-trip test.

Must not change:

- Stored keys and values: `balanced`, `minutes`, `even`, `tier`, `g.out`,
  the `data-strat` values and the `v` values in `LEVELS` / `SHAPES`, element ids (`#gamemode`,
  `#gmOpen`, `#abBench`, `#helpBtn`, `help-*` anchors). Code identifiers stay
  (`openGameMode`, `gamemode.js`), per the glossary's _In code_ lines.
- `app/engine.js`, `app/budget.js`, `app/storage.js`, `app/roster.js` behaviour.
  `engine.js`'s "Balanced against minutes already played today." uses the word
  as a description, not the strategy name; leave it.
- The printed card (`card.js` rendering, `card.css`). Nothing on the card uses
  any of these words.
- The static pages: `about.html`, `advanced.html`, the six
  `*-basketball-rotation-chart.html` pages (parent #18, Out of scope).

## Constraints

- **Only the renamed sense changes.** "Out" also appears meaning *comes off*
  (`plan-view.js` table header `Out`, the card's ▼), *sit for the rest*
  (`gamemode.js` "is out for the rest"), and in ordinary English ("even out",
  "worked out", "out there"). Those stay. "Minutes" as a stat or a number stays;
  only the strategy *name* becomes By hand. "Rotation" as the plan's lineups
  (the `Rotation` section heading) stays; only level 3 becomes Regular. "Even"
  as a word for equal minutes stays; only the shape *name* becomes Steady.
- **Sentence case (W1)** for every new label: `By hand`, `Start game`,
  `How it works`, `Bench mode`, `Leave bench mode`.
- **Buttons name the result (W2)**: `Start game`, `Resume · Q2 4:00`.
- **Reuse `resumeAt`** for the resume label; do not compute period or clock
  again.
- **The privacy claim** is narrow and pinned: do not reword the How it works
  lede's second sentence. `test/analytics.test.js` scans every string literal in
  `app/*.js`, so new copy must not use a banned absolute phrasing.
- **Precache bump.** Every file above except `test/` is precached: bump
  `app/sw.js` `VERSION` and set `SHELL` to the digest `npm test` names.
- **Pure modules** (`engine.js`, `budget.js`, `storage.js`, `roster.js`): no
  edits. The storage test exercises `storage.js` as it is.
- **Smoke.** Every control stays accessibly named and ≥44px; a longer label
  (`By hand` in a four-way segment, `Start game` in the action bar) must not
  overflow at 320px with 32px root text — the smoke suite's app large-text pass
  checks it. Do not raise an allow map.

## Design

A copy change, file by file, in the renamed senses only. No new components, no
markup restructuring, no new modules (the `requests` budget is pinned).

`labelBench` in `card.js` collapses to one label pair for both buttons:
`r ? \`Resume · ${r.where}\` : 'Start game'`. The icon swap it does today stays.

The How it works sheet keeps its sections and anchors; its `dt` terms and
prose take the new names, and any sentence that told a coach to "sit them out"
or mark them "out" says absent.

## Proof

- `npm test` — including the updated label tests, the new storage round-trip
  test for `balanced` / `minutes` / `even` / tier 3, `analytics.test.js`,
  `trust-line.test.js`, and the `SHELL` guard in `sw.test.js`.
- `npm run smoke` — accessible names, touch targets, and the 320px / 32px pass.
- `/browser-verify` at 390×844 on the rich fixture: read the squad count with
  two players absent, the strategy and shape segments, a player's level
  labels, the action bar button before and after advancing bench mode past
  stint 1, the bench-mode dialog's accessible name, and the How it works title.
- Guard going red: the storage test must fail if `storage.js` rewrote
  `balanced` to `even` (or `even` to `steady`) on load. `guard-falsifier`
  checks it.

## Out of scope

- "Theme" → "Appearance" and the Settings layout (#22).
- Removing `?` help controls and the footer (#37 and the screen tickets).
- The static pages, including `advanced.html`, which the app's help links into
  and which keeps the old names until its own issue.
- The six doc/code disagreements parent #18 lists (e.g. whether By hand totals
  always add up) — the copy is renamed, not corrected.
- Renaming code identifiers or stored keys.
