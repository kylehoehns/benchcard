# 569 — Platoon and Closers start filled in

## Issue

#569 (part of #561, the ease-of-use pass): picking Platoon or Closers fills
the groups in for the coach, says it did, and says "Group" instead of "Unit".

## Goal

A coach who taps Platoon gets a plan straight away, with two groups of five
already filled (one with fewer than 10 kids here). A coach who taps Closers
gets five closers for the last period. Both say the app built them and that
the coach can change anyone. The "can't be built" message only shows once the
coach empties a group. Nobody reads "Unit" anywhere.

## Survey (on `2ebc070`)

- Picking a strategy: `#stratseg` button → `chooseStrategy(g, key)` in
  `app/state.js` (around line 1355) → `edit('strategy')`. Add a game's step 3
  sets `draft.strategy` directly (`app/teams-view.js` `stepSplit`) and
  `addGame` (`app/state.js` around line 868) is the commit path; it already
  writes Order's starting list there (`startingOrder`). Those two are the
  only ways a game's strategy changes (copySetup and newGame copy the
  constraints with the strategy, so a copied game keeps its groups).
- Platoon groups are `g.constraints.units` (arrays of ids). `platoonEditor`
  (`app/strategy.js`) turns `[]` into `[[]]` when it paints. The engine
  (`app/engine.js` around line 756) errors `UNITS_MISSING` when there are no
  groups and `UNIT_WRONG_SIZE` per group not of 5; `UNIT_LEFTOVERS` warns
  for kids in no group.
- Closers is `g.constraints.closing = { stints, players }`, default
  `{ stints: 2, players: [] }` (`emptyConstraints`, `app/team-ops.js`). The
  editor shows chips "last N min" for N = 1..min(6, stints) and a "Who
  closes" picker, plus "Until you pick someone, this plans exactly like Even."
- Levels: `tierOfPlayer` (1 Developing … 5 Go-to; higher is stronger,
  `DEFAULT_TIER` 3). Order already checks "levels differ" as more than one
  distinct tier among the kids here, and writes "Built for you: … Move anyone
  and the list is yours." under its list (`orderEditor`). Its ownership flag
  is `g.orderBuilt`, kept by `sanitize` only when `true`, copied by
  `copySetup`, cleared by the coach's first move.
- "Unit" in coach copy: the five engine messages above plus `UNIT_KEEPON`
  and `UNIT_AVOID`; `strategy.js` ("Unit N", "Remove unit N", "Add unit",
  "Removed unit N."); `rules.js` "Not used with fixed units."; `state.js`
  blocked-plan button "Fill a unit". No HTML page says it. Codes
  (`UNITS_MISSING` etc.) and `c.units` are not coach copy and keep their
  names.
- ADR 0001: Level is never shown in bench mode, on the card or in exports.
  Everything here is on the Plan sheet.

## Decisions this spec makes (gaps the issue left)

1. **Who is placed in Platoon never depends on level.** The kids placed are
   the first `5 × floor(n / 5)` here in roster order; the rest are left out
   and `UNIT_LEFTOVERS` names them. Levels only decide *who plays together*:
   when they differ, the placed kids are split so each group gets some of the
   stronger players (sorted strongest first, roster order breaking ties, then
   dealt in a snake: 1-2-2-1-1-2…). When they are all the same, Group 1 is
   the first five in roster order, Group 2 the next five. This keeps Level's
   meaning ("who plays together, never how many minutes", ADR 0001), the way
   Order's Mix the fives does. The issue's "use levels if they differ" did
   not say strong-vs-weak or mixed; mixed is the one that does not hand the
   lowest levels the bench.
2. **Number of groups is `floor(n / 5)`** for n kids here: 1 group for 5–9,
   2 for 10–14, 3 for 15+. The issue says "Group 1 and Group 2"; with 15 here
   a third full group keeps five kids from "will not play". Fewer than 5 here:
   nothing is filled (the plan already says there are not enough players).
3. **Closers pre-fill:** levels differ → the five highest levels here,
   roster order breaking ties. Levels the same → the five on the floor in the
   last regulation stint of the game's current plan (the plan from the strategy it had
   before). No plan to read (Add a game, where the game has never been
   planned, or a blocked plan) → the first five here in roster order. Fewer
   than 5 here → nothing is filled.
4. **Closers window:** when the closers are filled for the coach, the window
   becomes the stints of the last regulation period (4 × 8 subbing every 4:
   2 stints, "last 8 min"). A window the coach already chose with no closers
   picked is replaced at the same time; nothing else about the window
   changes.
5. **When it fills:** on picking Platoon (or adding a game on Platoon) when
   every group is empty (`c.units.flat().length === 0`), and on picking
   Closers (or adding a game on Closers) when no closer is picked. Nothing is
   filled at any other moment: a coach who empties a group sees the blocked
   message, and a game saved before this change that is on Platoon with no
   groups stays as it is until Platoon is picked again.
6. **Ownership flags**, like `orderBuilt`: `g.unitsBuilt === true` and
   `g.closersBuilt === true`, set when the app fills, cleared on the coach's
   first change to that list (a tap in a picker, Add group, Remove group).
   `sanitize` keeps each only when exactly `true`; `copySetup` copies them
   with the plan. They decide only the line under the editor.
7. **The line under the editor** (`.pgrp-f`, the class Order's uses), shown
   only while the flag is set:
   - Platoon, levels differ and 2+ groups: "Built for you: your stronger
     players are split so each group has some. Change anyone and the groups
     are yours."
   - Platoon otherwise: "Built for you in roster order. Change anyone and the
     groups are yours."
   - Closers, levels differ: "Built for you: your best players close. Change
     anyone and the group is yours."
   - Closers otherwise: "Built for you. Change anyone and the group is
     yours."
   "Levels differ" is read at paint time over the kids here, as Order does.
8. **"Change when":** the Closers editor shows the window as one line, "The
   closing group plays the last N min.", then a `Change when` button. Tapping
   it shows the chips (unchanged). It stays open for the rest of the visit
   (a module flag in `strategy.js`, reset when the strategy changes).
9. **Group wording** (all coach copy):
   - `UNITS_MISSING`: "Platoon needs at least one group of 5. Pick the
     players for Group 1."
   - `UNIT_WRONG_SIZE`: "Group N has K player(s); a group needs exactly 5."
   - `UNIT_LEFTOVERS`: "… is/are not in any group and will not play."
   - `UNIT_KEEPON` / `UNIT_AVOID`: "Group N …" and "The group wins — drop the
     rule or change the group."
   - Editor: "Group N", "Remove group N", "Add group", toast "Removed group
     N.".
   - Blocked-plan button: "Fill a group".
   - Rules sheet note: "Not used with fixed groups. The fives you set decide
     who plays."
   Codes, `c.units` and the edit kinds (`units`, `unitCount`) keep their names.

## What would settle it

1. Picking Platoon on a game with 10 kids here, all level Regular, gives a
   plan (no blocked message), Group 1 = the first five in roster order,
   Group 2 = the next five, and the "Built for you in roster order" line.
2. Picking Platoon with 8 here gives Group 1 = the first five, no Group 2,
   the leftovers warning naming the other three, and a plan.
3. Picking Platoon with 10 here at different levels gives two groups each
   holding some of the stronger players (snake split), and the "split so each
   group has some" line.
4. Picking Platoon on a game that already has groups leaves them exactly as
   they were, with no "Built for you" line.
5. Picking Closers with levels the same gives five closers equal to the last
   stint's five of the plan before, and the window is the last period
   ("last 8 min" on 4 × 8 subbing every 4). With levels different, the five
   highest levels.
6. Picking Closers with closers already picked leaves them and the window as
   they were.
7. Taking a kid out of a pre-filled group shows "Group 1 has 4 players; a
   group needs exactly 5." and the "Fill a group" button; the Built for you
   line is gone.
8. No "unit" or "Unit" in any coach-facing string (engine messages, the
   editor, the toast, the button, the rules note).
9. The fingerprint in `test/prefill-fingerprint.test.js` (taken on
   `2ebc070` before the change) still matches: games whose groups or closers
   were already filled plan the same fives, minutes and issues.
10. Look checks: the Plan sheet on Platoon and on Closers, scrolled to the
    bottom, with long names (e.g. "Alexandria Montgomery-Okafor"), 9 and 12
    kids, at 320 and 390 wide, 16 and 32px text: nothing clipped.

## Surfaces

Change: `app/state.js` (`chooseStrategy`, `addGame`, `copySetup`, the
blocked-plan label), a pure fill helper in `app/engine.js` (exported,
no state), `app/strategy.js` (editors, line, Change when),
`app/storage.js` (keep the two flags), `app/rules.js` (one note),
`app/engine.js` messages, `app/app.css` only if Change when needs a style,
tests, `scripts/whats-new.json` + generated `app/whats-new.html` +
`app/sitemap.xml` lastmod, `scripts/smoke/platoon-undo.mjs` literals.

Must not change: how a game with filled groups or closers plans (the
fingerprint), bench mode, the card, exports.

## Constraints

- `engine.js` is pure: the fill helpers take ids, a level map and (for
  Closers) the last five, and return lists. No DOM, no state.
- Level never shows in bench mode, on the card or in exports (ADR 0001,
  `test/leak.test.js`). The copy above says "stronger"/"best players", not a
  Level name, the way Order does.
- Reuse: `tierOfPlayer` for levels; Order's "levels differ" test
  (distinct tiers among kids here > 1); `availIds(g)` for who is here;
  `planOf`/`plans` for the current plan; `periodNoun` /
  `lastPeriodStintIndex` / `buildStints` for the last period; the `.pgrp-f`
  line and `undoable` already used. Do not write a second "levels differ"
  or "last period stints" helper if one exists.
- Interface guidelines: C6 (rows ≥48px; Change when is one button on its
  own row), W1 (sentence case), W3 (one gray line under a group), W4 (the
  blocked message keeps its button).
- Coach copy plain; What's new per `/ship-feature`.

## Design

- `engine.js`: `fillGroups(ids, tierOf)` → array of groups (decisions 1–2);
  `fillClosers(ids, tierOf, lastFive)` → five ids (decision 3). Pure.
- `state.js`: `fillForStrategy(g, day)` used by `chooseStrategy` and
  `addGame`: fills per decision 5, sets the window (decision 4) and the flag.
  `copySetup` copies the flags. `blockedFix` label "Fill a group".
- `strategy.js`: the editors clear the flag on any coach change and show the
  line (decision 7); Closers gets the summary line and Change when
  (decision 8); Group wording (decision 9).
- `storage.js`: keep `unitsBuilt` / `closersBuilt` only when `true`.

## Proof

- **Coach seam** (`test/coach.js`, a new
  `test/platoon-closers-filled-scenarios.test.js`): items 1, 2, 3, 4, 5, 6, 7
  — tap Plan, tap Platoon/Closers, read the sheet's text, the timeline and
  the blocked panel. A verb is added to the driver only if one is missing.
- **`node --test` on the pure helpers** (`fillGroups`, `fillClosers`): the
  many-input cases (5, 8, 9, 10, 12, 15 kids; levels equal and different;
  ties; fewer than 5).
- **Fingerprint** (`test/prefill-fingerprint.test.js`): item 9. Already
  written and green on `2ebc070`.
- **Sanitize** (`test/` storage tests): the two flags kept only when `true`.
- Existing tests and `scripts/smoke/platoon-undo.mjs` move to the Group
  wording; item 8 is a source-reading check only if one already exists for
  this kind of copy (none is added).
- **Look** (`scripts/look.mjs`, by the orchestrator): item 10.

## Out of scope

- Rebuilding app-built groups when Who's here changes (Order does this; the
  issue asks only for the first fill).
- The Closers and Finish strong blurbs (#571) and other wording tickets.
- Renaming codes, `c.units` or edit kinds.
