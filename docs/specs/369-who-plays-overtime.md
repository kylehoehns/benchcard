# #369 — choose who plays overtime

## Issue

#369 (parent #366): the Overtime sheet gains a "Who plays" choice — Next
rotation, Even out, Keep this five, Strongest five — stored with the overtime
period, so the coach can pick fairness or winning for each overtime.

## Goal

When a tied game goes to overtime the coach decides in the same sheet who
plays it: carry on the way the game was going, even out minutes, keep the five
that just finished regulation, or put the strongest five out. Whatever they
pick holds through a reload, a re-plan and Undo, and they can still swap by
hand.

## What would settle it

Default fixture, as #368's: a game underway, 2 × 16, `everyN` 4, seed fixed,
Even strategy unless said, the game on its last stint.

1. **The control.** The Overtime sheet shows, under Minutes, a segmented
   control labelled **"Who plays"** with four options in this order:
   **Next rotation**, **Even out**, **Keep this five**, **Strongest five**.
   Next rotation is selected each time the sheet opens. One is selected at a
   time (`aria-pressed`).
2. **Strongest five.** 10 available players with Levels 5,5,4,4,4,3,3,2,2,1:
   Strongest five puts the two Level 5s and the three Level 4s on the floor in
   every OT stint of an 8-minute overtime (2 stints). With Levels
   5,5,4,4,4,4,… (two 4s competing for the last spot), the one with fewer
   minutes played so far gets it. Players in `g.out` are never chosen.
3. **Keep this five.** 8-minute OT with every-4 breaks: both OT stints have
   exactly the five on the floor in the last stint before the overtime,
   including a hand swap the coach made on that stint.
4. **Even out.** After an uneven regulation (player A at 12 minutes, everyone
   else at 16 or more), A is on the floor in every OT stint of a 4-minute
   overtime. Even out plans the same way for every strategy (a Closers game's
   closing group and a Platoon game's units do not apply in that overtime).
5. **Next rotation** behaves exactly as #368 built it (existing scenarios
   unchanged).
6. **Reload.** Closing and reopening the app keeps the same OT lineup for
   every choice.
7. **Undo.** Undo after adding restores the game exactly, for every choice.
8. **Pins hold.** A Keep or Strongest five is not moved by a re-plan: not by a
   one-stint swap re-planning later stints, not by bench mode's Reset, not by
   a Plays-at-most or Apart rule. The coach can still swap a player by hand in
   any OT stint.
9. **A pinned player goes Out** during the overtime: their spot is filled by
   the available player with the highest Level, then fewest minutes, for
   Strongest five; by fewest minutes for Keep this five. The other four stay.
10. **Second overtime.** Each overtime period keeps its own choice: OT can be
    Keep this five and OT2 Strongest five.
11. **Storage.** A game saved with the old shape `overtime: [2, 8]` loads as
    two Next rotation periods of 2 and 8 minutes. Junk is cleaned as before
    (minutes 1–10, at most 4 periods); an unknown `who` becomes Next rotation;
    a stored five keeps only ids of players on the team, at most 5. A filed
    season game keeps only the minutes.
12. **Level is still never shown.** No Level word or number appears in the
    sheet, in bench mode, on the card or in an export; the option is labelled
    "Strongest five". `test/leak.test.js` keeps passing (no `.tier` read in
    gamemode.js).
13. **Docs.** CONTEXT.md's Level entry and an ADR record the overtime
    exception; the roster sheet's Level note says Levels can pick the
    Strongest five in overtime.
14. **Smoke.** The Overtime sheet with the control does not clip or scroll
    sideways at 320px wide with 32px text.

## Surfaces

Change:
- `app/index.html` — the "Who plays" control in `#sheetOvertime`.
- `app/gamemode.js` — read the choice, pass it to `addOvertime`, reset it to
  Next rotation on open. No Level reads here (`test/leak.test.js`).
- `app/state.js` — `addOvertime(minutes, who)`, the Strongest/Keep five
  worked out once and stored; `gameFormat` hands the engine minutes only;
  `resolveRest` plans Even out as Even and writes pinned fives over the
  solve; the Out refill rule.
- `app/storage.js` — `g.overtime` entries become
  `{ minutes, who, five? }`; old numbers upgrade; season games file minutes.
- `app/roster-view.js` — the Level note sentence.
- `app/app.css` only if the control needs it (reuse `.seg.wide` first).
- `CONTEXT.md`, `docs/adr/0001-level-picks-the-overtime-five.md`.
- Tests: `test/coach.js` (the verb takes a choice), scenarios, state and
  storage cases; `scripts/smoke/` keeps the overtime sheet state.

Must not change: `app/engine.js`'s reading of `format.overtime` (numbers),
`app/card.js`, `app/handoff.js`, `app/share.js` (#370).

## Constraints

- **One list.** The choice lives on the overtime entry itself, not in a
  parallel list. Every reader that wants minutes reads them through one helper
  (`gameFormat` for the engine, the same mapping elsewhere) — one answer.
- **Reuse #367's freeze and #368's `addOvertime`.** The pin is applied inside
  `resolveRest`, after the solve, so every path that re-plans (freeze, swap
  re-plan, Sit for the rest) keeps it. If every stint in a suffix is pinned,
  skip the solve so a rule cannot refuse the five. Do not put the pin in
  `buildForced`: forced players still pass caps and Apart rules.
- **Work out Strongest and Keep once**, at add time, after the first
  `computeAll()`, and store the ids — a later Level edit or the OT's own
  minutes must not move the five.
- **Reset** (`clearOverrides` → `clearRest`) must leave pinned OT stints on
  their stored five.
- **live.js is the only writer of the live record.** Undo is the whole-state
  snapshot (one `undoable`).
- **Level**: ranking reads `tierOfPlayer` in state.js; nothing coach-facing
  shows a Level. Interface rules C3, C4, C7 (segmented, ≤5 text options, equal
  widths; `.seg.wide` with `role="group"`, `.on`, `aria-pressed`, as
  `#stratseg`), W1, W2, T4.
- `storage.js` and `engine.js` are pure modules: changes come with
  `node --test` cases. Run `npm run sw:bump` when a precached file changes.

## Design

`g.overtime[k]` is `{ minutes, who: 'next'|'even'|'keep'|'strongest',
five?: [ids] }`. The sheet's control picks `who`; `addOvertime` stores the
entry, and for `keep`/`strongest` computes the five after the first
`computeAll()` (Keep: `effectiveLineup` on the stint on the floor; Strongest:
available players by Level, then fewest effective minutes, then roster order)
and stores it. `resolveRest` maps each suffix stint to its OT period
(`s.period - g.periods - 1`): `even` periods plan with `strategy: 'balanced'`,
no closing, no units; `keep`/`strongest` periods take the stored five minus
Out players, refilled per item 9. Hand swaps go on top as today.

Decided while surveying (the ticket's claims that did not hold):
- `notes/DECISIONS.md` is closed ("no longer appended"); the decision goes in
  `docs/adr/` per `AGENTS.md`.
- Settled in the fix pass after review:
  - Even out is decided over the stints that are not pinned, so an Even-out
    period next to a Keep or Strongest period is still planned as Even. A mix
    of Even out with anything else in one re-plan (regulation stints left in the
    suffix, or an Even-out period beside a Next rotation one) stays on the
    game's strategy: there is one solve per re-plan and no second planner.
    Reset plans each Even-out period on its own, so it is exact there.
  - Only the stints that are not pinned are solved. The pinned fives count as
    minutes already played for caps, minimums and fairness, and the budget is
    the open stints.
  - The #134 fallback in `syncOverrides` keeps pins: it writes the pinned fives
    back after it drops the swaps. The regulation it rewrites is the coach's
    played game; the overtime they chose is not the plan's to move.
  - Reset (`resetRest` in state.js) puts pinned periods back on their stored
    five and plans Even-out periods again as Even through `resolveRest`; none
    of it counts as a hand swap.
  - A pinning choice with no five to settle on (the plan did not solve) is not
    added: "Overtime could not be added."
- No "sat for the rest" list is stored, so Strongest five leaves out only
  `g.out` players; the coach swaps a sat player off by hand.

## Proof

- **Coach seam** (`test/overtime-scenarios.test.js`, `addOvertime(minutes,
  who)`): items 1, 3, 6, 7, 8 (swap, Reset), 10, 12 (no Level text in the
  sheet).
- **`node --test` at state level** (`test/overtime-grow.test.js` harness):
  items 2, 4, 5, 8 (rules), 9.
- **Storage, `node --test`**: item 11.
- **Smoke** (`scripts/smoke/app-large-text.mjs`): item 14.
- **`/browser-verify`** on the preview: items 1–3 at 390×844.

## Out of scope

- Sudden death. Share link, handoff and card labels (#370).
- Changing the choice after the overtime is added (Undo and re-add).
- A stored "sat for the rest" list.
