# 440 — A pinned overtime five that breaks a rule says so

## Issue

#440: Strongest five can put two Apart kids on together, leave both kids of a
One of two on pair off, or play a capped kid past their cap, and no note says
so. Keep the five; add the note.

## Goal

A coach who picks Strongest five for overtime gets the five they asked for,
and if it breaks one of their rules, a note beneath the plan names the kids
and the rule. Nothing is dropped quietly, which is what `advanced.html`
promises.

## Survey

The issue's claims hold on `900024f` (scratch probe through `addOvertime` and
`computeAll`; the game below with the game on `live.at = 7`):

- Strongest five: OT five `p1+p2+p5+p6+p7` (p1 and p2 are Apart; p3 and p4,
  One of two on, both off). Plan issues: `SPREAD_FLOOR` only.
- Next rotation and Even out: `p2+p3+p4+p5+p8`; Keep this five:
  `p2+p3+p5+p7+p8`. All keep both rules and p0's cap.
- Cause as stated: `pinnedFive` / `fillFive` sort by Level and minutes and read
  no rules; `pinFives` writes the five after the solve; nothing checks it.
- Where a note shows: `plan-view.js` `issuesList(p)` lists `p.issues` beneath
  the plan. The freeze re-plan's own issues are not surfaced (#456), so the
  note goes on the plan's issues.

Choices the issue did not make:

- **Keep this five is checked too.** It is pinned the same way and reads no
  rules either. With the game on `live.at = 6`, Keep this five plays p0 for 20
  minutes against a 16-minute cap and says nothing. The same promise covers
  it, so the check covers every pinned choice and the note names the choice
  ("Keep this five ..."). In the acceptance game (`live.at = 7`) Keep breaks
  nothing, so acceptance item 3 still holds.
- **Only Apart, One of two on and Plays at most**, the three the issue names.
  Together and the Rest limit are not checked (#442 left the Rest limit inside
  pinned periods to the pin).
- **A note needs the choice's five and the floor to agree.** A pinned stint
  counts when the five the choice puts there (`pinFives`, Out refills
  included) breaks the rule *and* the five on the floor in that stint
  (`effectiveStints`, hand swaps included) still breaks it. So a coach who
  swaps one Apart kid off by hand clears the note, and a hand swap of the
  coach's own is never blamed on the choice. The cap note reads the player's
  whole-game minutes from `effectiveMinutes`.
- **One note per rule per choice label**, so two overtimes that both break
  the same Apart pair with Strongest five give one note.

## What would settle it

Game: 10 players `p0`..`p9`, Levels `[3,5,5,1,1,4,4,4,2,2]`, 4x8 every 4,
seed 7, Apart `[p1,p2]`, One of two on `[p3,p4]`, Plays at most p0 16. Game
underway on `live.at = 7`, then `addOvertime(g, 4, who)` and the plan from
`S.plans[0]`. Tests red on `900024f`, green after:

1. Strongest five: the plan's issues include a warn note whose `playerIds`
   are p1 and p2 and whose message is "Strongest five puts p1 and p2 on
   together; they are set Apart.", and one naming p3 and p4: "Strongest five
   leaves p3 and p4 both off; they are set One of two on."
2. A capped kid: the same game with Plays at most on p1 at 16 instead of p0
   (Levels unchanged, so p1 is still in the five): a note whose `playerIds`
   are [p1]: "Strongest five gives p1 20 minutes; Plays at most is 16."
3. Next rotation, Even out and Keep this five, same game: no note of the new
   code.
4. The five does not change: with Strongest five the OT stint is
   `p1+p2+p5+p6+p7` and `g.overtime[0].five` is those ids.
5. A hand swap that takes p2 off the OT stint clears the Apart note.
6. The notes do not pile up: `computeAll()` run again leaves exactly one of
   each.

Names in messages are the call names from `callNames(state.players)` (the
fixture's players have no names beyond their ids).

## Surfaces

- `app/state.js`: a function that builds the notes for a game's pinned
  overtime periods, and `computeAll` puts them on the plan's issues.
- `test/`: the cases above, beside the #369 state-level cases in
  `test/overtime-grow.test.js` or in a new file using
  `test/state-fixture.js`.
- `docs/specs/369-who-plays-overtime.md` item 8: a broken rule gets a note
  (the issue asks for it). `docs/` prose that describes pinned overtime, if
  any names this.
- Must not change: `app/engine.js`, `budget.js`, `storage.js`, `roster.js`;
  `pinnedFive` / `fillFive` / `pinFives`'s choice of five; `app/site.css`,
  `about.html`, `advanced.html`, the chart pages, `scripts/charts.mjs`
  (another lane).

## Constraints

- **Reuse, do not re-derive:** the pinned fives come from `pinFives(g, p,
  firstOvertimeStint, playingIds(g))`; the floor from `effectiveStints`;
  minutes from `effectiveMinutes`; the choice from `overtimeOf` /
  `isPinned`; names from `callNames` (already imported). Rules from
  `g.constraints.avoids`, `.keepOnFloor`, `.maxMinutes`.
- `computeAll`'s plans are cached (`planCache`) and the same object comes
  back on the next call, so writing the notes must be idempotent: drop this
  code's earlier notes before adding the current ones (`sayTheSeasonSetThem`
  writes the cached plan the same way).
- The notes are added after `syncOverrides`, which writes the overrides they
  read. `tally` is the one place both solve paths pass through.
- Keep #442 (`streakBefore`) and #444 (`lastPeriodAhead`) as they are.
- One new issue code, severity `warn` (the same as `PAIR_PARTIAL`,
  `KEEPON_PARTIAL`, `CAP_EXCEEDED`). Rule names as the Rules sheet says them
  (`rules.js`): Apart, One of two on, Plays at most. American spelling.

## Design

`pinNotes(g, p)` in `state.js`: for each pinned overtime stint `j` (from
`pinFives` from the first overtime stint), with `f` the pinned five, `e` the
floor's five and `label` "Strongest five" or "Keep this five":

- Apart `[a, b]`: `a` and `b` both in `f` and in `e`.
- One of two on `[a, b]`, both available: neither in `f` nor in `e`.
- Plays at most on `id`: `id` in `f` and `e`, and `effectiveMinutes` over the
  cap.

Messages are deduplicated by text. `computeAll`'s `tally` strips earlier
notes of the code from `p.issues` and appends the new ones.

## Proof

- `node --test` through `state.js` (`addOvertime` + `computeAll`, the
  `test/overtime-grow.test.js` harness shape): items 1-6. The issue names this
  seam. The note's on-screen rendering is `issuesList`, which already lists
  `p.issues` verbatim, so no new Coach verb is added.
- `/browser-verify` on the preview: the note shows beneath the plan for the
  acceptance game at 390x844.

## Out of scope

- Changing which five Strongest or Keep picks (ADR 0001, spec 369 item 8).
- Together and the Rest limit inside a pinned period.
- Surfacing the freeze re-plan's own issues (#456).
