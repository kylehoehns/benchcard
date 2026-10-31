# #359 — record-changing operations a test can run

## Issue

#359: move the operations that change the record out of `app/state.js`,
which loads the saved record from localStorage the moment it is imported,
into a module with no import-time side effects, so a plain test can run them.

## Goal

Nothing a coach sees changes. Removing a player, sitting one out and removing
a team behave exactly as today. What changes is that the three operations live
in a module a test can import and run, so `test/remove-player.test.js` stops
regex-matching source, and "the record always holds at least one team" gets a
home and a test.

## Decided (the owner's comment on #359)

1. Start small: `removePlayer`, `setAvailable` and team removal move now.
   `reseed`, the game moves and `archiveDay` / `fileIfPast` are later tickets.
2. The functions take one team. Team removal is the exception: it takes the
   whole record, because "always at least one team" is a rule about the record.
3. `state.js` keeps the current names as thin calls bound to the active team,
   so views do not change. `teams-view.js` calls the new team-removal operation
   instead of doing the splice inline.
4. #356 (live.js owns the live record) is merged; #360 is merged. Nothing
   blocks this.

## Choices the issue left open (made here, closest to its intent)

- **Module name: `app/team-ops.js`.**
- **`setAvailable` keeps its signature `(g, id, available)`.** It already takes
  a game (part of one team) and never touches `state`. Changing it would change
  three view call sites, which decision 3 says not to do.
- **`emptyConstraints` moves into `team-ops.js` too** (re-exported from
  `state.js` under the same name, so every importer is unchanged). The sweep in
  `removePlayer` has to know every field `emptyConstraints` builds, and the
  sweep test's completeness check read that shape out of `state.js`'s source.
  With both in one importable module, the test runs `emptyConstraints()`
  instead of slicing text. It is a shape factory with no dependencies.
- **Team removal takes a factory for the blank team:**
  `removeTeam(record, index, blank)`, where `blank` is a function returning a
  new empty team. `newTeam` stays in `state.js` (it needs `uid` from `dom.js`,
  which builds a canvas at import time). The state.js binding passes
  `() => newTeam('')`.
- **`keepOnFloor` stays unswept, and is filed as #409.** The build found that
  `removePlayer` has never cleared `keepOnFloor` (the old regex test missed
  it). Bodies move verbatim here, so the sweep test lists it as an id-holding
  field that is known to be unswept; #409 fixes it.
- **The `removalCosts` tests in `test/remove-player.test.js` move, unchanged,
  to `test/removal-costs.test.js`.** They test `roster-view.js` (a view, not
  in scope here), not `removePlayer`. Making `removalCosts` runnable is not
  part of this ticket; the acceptance line "no source reading is left in it"
  is about the `removePlayer` file.

## What would settle it

1. `app/team-ops.js` exports `emptyConstraints`, `removePlayer(team, id)`,
   `setAvailable(g, id, available)` and `removeTeam(record, index, blank)`.
   It imports only `./live.js` (no `state.js`, `dom.js`, `storage.js`), and a
   test file that imports it with **no** `dom-stub.js` and no localStorage
   runs green under `node --test`.
2. `test/remove-player.test.js` builds a team (two days, a game with every
   id-holding constraint field naming `p1`, `out`, an overtime five, and a
   live override naming `p1`), calls `removePlayer(team, 'p1')`, and asserts
   `"p1"` appears nowhere in `JSON.stringify(team)` while `p2`'s entries
   survive. A second test fails when `emptyConstraints()` grows a field the
   test has not classified (holds ids / does not), read by calling it. No
   `readFileSync` is left in the file.
3. `removeTeam` has tests in a no-stub file:
   - removing the only team leaves `record.teams` holding exactly one team (the
     one `blank()` returned, with no players), `record.onboarded === false`,
     `record.activeTeam === 0`;
   - removing team 1 of 3 while it is active leaves 2 teams, `activeTeam` 1,
     `onboarded` unchanged (true);
   - removing the last of 3 while active clamps `activeTeam` to 1;
   - `blank` is not called when other teams remain.
4. `test/availability.test.js` imports `setAvailable` from `team-ops.js`
   rather than slicing it from `state.js`'s source; its existing cases keep
   their expectations.
5. `app/state.js` no longer contains the bodies of `removePlayer`,
   `setAvailable` or `emptyConstraints`. It exports `removePlayer(id)` bound to
   `team()`, re-exports `setAvailable` and `emptyConstraints`, and exports a
   `removeActiveTeam()` bound to `state` / `state.activeTeam` / `newTeam('')`.
6. `app/teams-view.js`'s `removeTeam` calls `removeActiveTeam()`; the inline
   `state.teams.splice` / `newTeam('')` / `onboarded = false` / clamp is gone
   from it. `track('team_removed', …)`, the confirm copy and the undo refresh
   stay where they are.
7. `npm test` and `npm run smoke` pass. No Coach scenario, bench-mode test or
   view test changes its expectations; tests that read source change only to
   follow code that moved.

## Surfaces

Change: `app/team-ops.js` (new), `app/state.js`, `app/teams-view.js`,
`app/sw.js` (`PRECACHE` gains `./team-ops.js`; `SHELL` is stamped by the
build, never edited), `scripts/budgets.mjs` (`REQUESTS_BASELINE` +1, bytes
re-pinned if needed), `test/remove-player.test.js`,
`test/removal-costs.test.js` (new), `test/availability.test.js`, a new
`test/team-ops.test.js` (or the `removeTeam` cases inside
`remove-player.test.js` if that reads better), and any source-reading test
that pointed at a moved body.

Must not change: `engine.js`, `budget.js`, `storage.js`, `roster.js`,
`live.js`, any view other than `teams-view.js`, any copy a coach reads.

## Constraints

- `team-ops.js` has no import-time side effects and no DOM: it may import
  `./live.js` (which imports only `./engine.js`) and nothing else.
- Reuse, do not re-derive: `dropPlayer`, `playedStints`, `finishedGame` from
  `live.js` stay the only way these operations touch `live`. `newTeam` stays
  the one way a blank team is built — `removeTeam` gets it through `blank`, it
  does not build its own team shape.
- Bodies move verbatim (aside from `state.players` / `team()` becoming the
  `team` argument). The long comments explaining each sweep move with them.
- Undo: `teams-view.js`'s write stays inside its `undoable` closure.
- New module joins the boot graph: add it to `PRECACHE` (`test/sw.test.js`
  checks the list against what loads) and re-pin `REQUESTS_BASELINE` in
  `scripts/budgets.mjs` with a comment naming `team-ops.js` (AGENTS.md §
  Layout).
- American spelling.

## Design

```js
// app/team-ops.js
import { playedStints, finishedGame, dropPlayer } from './live.js';
export const emptyConstraints = () => ({ ... });          // moved verbatim
export function removePlayer(team, id) { ... }            // was state.js:649
export function setAvailable(g, id, available) { ... }    // was state.js:915
export function removeTeam(record, index, blank) {
  record.teams.splice(index, 1);
  if (!record.teams.length) { record.teams.push(blank()); record.onboarded = false; }
  record.activeTeam = Math.max(0, Math.min(record.activeTeam, record.teams.length - 1));
}

// app/state.js
import { emptyConstraints, removePlayer as removeFrom, setAvailable, removeTeam } from './team-ops.js';
export { emptyConstraints, setAvailable };
export const removePlayer = id => removeFrom(team(), id);
export const removeActiveTeam = () => removeTeam(state, state.activeTeam, () => newTeam(''));
```

## Proof

- **`node --test` on `team-ops.js`'s exports**, no DOM stub: items 1, 2, 3, 4.
  These are pure functions with many input cases (AGENTS.md § Test seams).
- **Existing Coach scenarios, bench-mode and view tests, and smoke** stay
  green unchanged: items 5, 6, 7 (nothing a coach sees changes, so no new
  scenario).
- Item 5/6 are also checked by reading the diff in review; no new guard.

## Out of scope

`reseed`, `addGame` / `moveGame` / `removeGame`, `archiveDay` / `fileIfPast`,
team add, `removalCosts`, and the hand-copied `emptyConstraints` in other test
files (`backup.test.js`, `first-paint.test.js`) — each a later ticket.
