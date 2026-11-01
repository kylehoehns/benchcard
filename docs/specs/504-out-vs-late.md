# 504 — Out and Running late

## Issue

#504: bench mode lists every kid marked out, with a Here now button, above the
floor. Most weekends a kid marked out is not coming at all, so that list is
noise. Split "out" into **Out** (not coming, the default) and **Running late**
(the exception), and show only late kids at the top of bench mode.

## Goal

A coach marks a kid Out on Who's here and never sees them again in bench mode
unless they ask. A kid marked Running late is at the top of bench mode with a
Here now button, the way every out kid is today. A kid who was Out and shows up
anyway can still be marked here from one quiet row at the bottom of bench
mode. The plan is exactly the same either way.

## What would settle it

1. **Data.** A game has `late`, a list of player ids that is always a subset
   of `out`. `sanitizeGames` (`app/storage.js`) keeps only ids that are real
   players and also in that game's `out`, de-duplicated, and defaults to `[]`.
   A saved game with no `late` loads with `late: []`, so every kid in its old
   `out` list is Out (not coming). That is the owner's choice in the issue.
2. **Carried on every copy.** A game copied for the next game of the day
   (`newGame(i, from)`), the hand-off link (`app/handoff.js` `encode`; decode
   spreads `g` and `sanitizeTeam` cleans it) and backup/restore (whole record
   through `sanitizeTeam`) keep `late`. Filing that resets `out` to `[]` also
   resets `late`. `removePlayer` drops the id from `late`.
3. **Who's here sheet.** A row turned off reads **Out** (was "Absent") and
   shows a second, smaller button beside or under it: **Running late**, with
   `aria-pressed` and accessible name `Running late, <full name>`. It is not
   nested inside the row's own button (no interactive element inside a
   button). Default when a kid is turned off: Out (`aria-pressed="false"`).
   Tapping it toggles the kid in `late`. Turning the kid back on removes them
   from both `out` and `late`, and the Running late button goes away. Both
   controls at least 48px tall. Long names ("Alexandria Montgomery-Okafor")
   at 320 and 390 wide, 16 and 32px text: no clipping, no sideways scroll.
4. **Bench mode top section.** Titled **Running late** (was "Not here").
   Lists only kids in `late` who are still on the roster, each with **Here
   now** (`Here now, <name>`), in #430's place above the floor. Hidden when
   nobody is late, even when kids are Out.
5. **Bench mode bottom row.** Below the bench, inside the scroller, one quiet
   button **Someone showed up?** with a chevron, shown only when at least one
   kid is Out and not late. It has `aria-expanded`. Tapping it reveals a short
   list of those Out kids, each with the same **Here now**
   (`Here now, <name>`, calling the same `hereNow`). Hidden when nobody is
   Out-and-not-late. At least 48px tall.
6. **Here now and Undo.** Here now (either list) removes the kid from both
   `out` and `late` in one undoable step. Undo restores both lists exactly
   (the `undoable` snapshot already does this; a scenario proves it).
7. **The plan does not change.** Marking a kid Running late instead of Out
   leaves every stint identical, and the engine and every re-plan keep reading
   only `out`. Toggling Running late saves but does not need a re-plan.
8. **Words.** "Out" and "Running late" are the only two labels for the two
   kinds of absent kid, in the sheet, bench mode, aria labels, help text and
   docs. The add-game flow's tile aria suffix ", Absent" becomes ", Out".
   `CONTEXT.md` names both.

## Surfaces

- `app/storage.js` `sanitizeGames`: `late`.
- `app/team-ops.js`: `setAvailable` clears `late` when a kid is turned on;
  a new `setLate(g, id, late)` (no-op unless the kid is in `out`);
  `removePlayer` filters `late`.
- `app/state.js`: only `newGame` (default `late: []`, copy `late` from
  `from`) and the filing fallback that sets `g.out = []` (also `g.late = []`).
  Another lane (#443) is editing `state.js`; keep these edits to those lines.
- `app/handoff.js` `encode`: add `late`.
- `app/game-setup.js` Who's here rows; `app/teams-view.js` tile aria suffix.
- `app/gamemode.js` bench mode top section and the new bottom row;
  `app/index.html` markup for both; `app/app.css` styles.
- `test/coach.js`: verbs for the new controls (e.g. `runningLate()` replacing
  `notHere()`, `showedUp()` for the bottom list).
- `scripts/smoke/bench-call.mjs` and `scripts/smoke/app-large-text.mjs`: their
  fixtures mark a kid out to get a Here now; they now mark that kid late too.
- Must not change: `app/engine.js` (another lane), plan output.

## Constraints

- `storage.js` is one of the four pure modules: this change is explicitly
  about its `sanitizeGames`, and only `late` is added.
- `setAvailable`, never a bare `g.out` edit (existing comment in
  `game-setup.js` and `teams-view.js`); the late toggle goes through
  `setLate`, never a bare `g.late` edit.
- Reuse `hereNow` for both lists; do not write a second arrival path.
- Reuse `distinctNames` for names, `avatarOf`, the existing `.gm-b` row and
  `press btn` button for the Here now rows, `.prow` for the sheet row.
- Mobile first: 390x844, then 320. Touch targets at least 48px. Every control
  accessibly named. Dark mode through tokens only.
- No user quotes in the repo.

## Design

- **Sheet row.** Keep `.prow who-row` as the main toggle. Wrap each row in a
  container; when the kid is off, the container also holds a `Running late`
  button (`aria-pressed`) styled as a small chip. The sheet repaints the row
  on toggle. Toggling Running late calls `setLate` and saves (a plain save;
  the plan is unaffected).
- **Bench mode.** `#gmOutSec` becomes the Running late section (heading
  "Running late"), rendering `g.late` filtered to the roster. A new section
  after `#gmBenchSec` inside `.gm-body` holds the "Someone showed up?" button
  and a hidden list (`#gmShowed` or similar) of `out` minus `late`, each row
  built the same way as the top rows. Whether it is open is module state
  that survives repaints within one bench-mode visit, so Undo of a Here now
  from that list can focus the restored kid's button.
- **Focus.** After Here now: the next Here now in the same list, else the
  first floor row. Undo: the restored kid's own Here now button.

## Proof

| Seam | Covers |
| --- | --- |
| `node --test` on `sanitizeTeam` (existing storage tests) | 1: subset, dedupe, unknown ids dropped, missing `late` → `[]` |
| Coach scenario, Who's here sheet | 3, 7: turn off → Out, tap Running late (pressed), turn on clears it; reopen keeps it; plan stints identical Out vs late |
| Coach scenario, bench mode | 4, 5, 6: (a) nobody out: neither section; (b) one Out kid: no top section, bottom row shows, opening it and Here now marks the kid here; (c) one late kid: top section lists them, no bottom row; (d) both: each in its own place; Here now then Undo restores `out` and `late` (checked after reopen) |
| Coach scenario or unit test, copies | 2: next game of the day keeps `late`; hand-off link round trip keeps `late` |
| Smoke rows `bench call` and the 32px app pass | the top section still above the floor and on screen with a late kid |
| `look.mjs` by the committer | 3, 4, 5 visually at 320/390, 16/32px, light and dark, long names, scrolled to the bottom |

## Out of scope

- A Running late control on the add-game flow's tiles: new games copy `late`
  from the last game, and a kid turned off there is Out by default.
- #499's What's new entry: #499 has not landed, so a note goes on #499
  asking for an entry for this change when it does.
- Any change to how the engine reads `out`.
