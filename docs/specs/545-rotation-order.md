# 545 — Rotation order

## Issue

#545: a fifth strategy, **Rotation order**. For each game the coach lists the
players in an order, the plan cycles through it, and a later game's order
starts out continuing where the earlier game's cycle stopped.

## Goal

A coach who already runs a paper rotation ("next five in the list, four
change at a time") can type that list into the game once and get exactly the
card they would have written by hand. Game 2 of the day starts from where
game 1 stopped without the coach working it out. Rules the order breaks are
said in plain words; the order is never changed to fix them.

## Survey (on `317022e`)

- Strategies are `balanced | minutes | closers | platoon`
  (`STRATEGIES`, `STRATEGY_WORDS` in `app/state.js`; `#stratseg` in
  `app/index.html`; `renderStrategy` in `app/strategy.js`; sanitize in
  `app/storage.js:567`; analytics enum `app/analytics.js:61`;
  `scripts/feature-keys.mjs:117`; Help `<dl>` "Choosing a plan" in
  `app/index.html`; tour line in `app/tour.js:71`).
- Platoon is the nearest shape: the coach decides the fives, the engine does
  no search (`platoonLineups`, `engine.js`), and `finish` skips the notes
  that blame the search (`SUBS_EXCEEDED`, `HALF_LATE`, `HALF_EARLY`,
  `SPREAD_RULE`, missed pins). It is also treated as hand-set in
  `seasonTargetsFor`, `playsInRule`, full periods (`assignFullPeriods` is
  skipped) and `resolveRest` (refuses a re-plan).
- Players changing at once is `state.settings.maxSubs`, 1–5, passed to the
  engine as `maxSubs`. It is a team setting.
- `analyzeFeasibility` blocks a plan on rule conflicts (caps that cannot
  cover the floor, Apart pairs, minimums too high, …). For Rotation order a
  rule never blocks.
- A late kid is in `g.out` and `g.late` until Here now, which calls
  `setAvailable` and records `live.arrived[id] = stint`. Any edit to an
  underway game goes through `freezePlayedAndReplan` → `replanRest` →
  `resolveRest`, which keeps stints `0..through-1` and writes
  `live.overrides` for the rest. Sit for the rest goes through
  `resolveRestRelaxing` with `sitIds`.
- `effectiveStints(g, p)` gives each played stint's `onFloor`;
  `benchStints(g, p)` gives `sitting`. So the circle as it was at any stint is
  readable from the record with nothing new stored.
- `docs/design-decisions.md` is 59,302 bytes against a 60,000 limit.

## Owner's design change (2026-11-02)

The issue body was updated after it was first published. The order is set
**per game**, not on the team, and there is **no "Starts with" control**: the
first five in the game's order start (s = 0). This spec follows the updated
issue.

## Decisions this spec makes (gaps the issue left)

1. **Code name `order`.** `g.strategy === 'order'`; the game's list is
   `g.order`, an array of player ids. Help and the picker say "Rotation
   order"; the segmented button says **Order** (five equal buttons must fit
   at 320px and 32px text). CONTEXT.md gets **Rotation order** with
   _In code_: `order`.
2. **The game's effective order** is `g.order` with ids no longer on the
   roster dropped, then any roster player missing from it appended in roster
   order. So an empty `g.order` is the roster order, a new player joins the
   end, and a removed player leaves cleanly (`removePlayer` sweeps
   `g.order`). Out kids keep their place in the list; they are skipped when
   the circle is made.
3. **When the starting point is written.** The starting point is written into
   `g.order` once, so editing one game never moves another:
   - when the coach picks Order for a game whose `g.order` is empty;
   - when a game is added by cloning a game whose strategy is `order`
     (`newGame` copies the strategy).
   The starting point is: the latest earlier game that day with strategy
   `order` — its effective order turned to begin at the player its cycle
   would put on next; with no such game, the roster order. Until written (an
   old record, say) the same rule is read lazily.
4. **Where the earlier game's cycle stopped** is read from that game's last
   effective stint, not stored: take the circle as it was at that stint
   (the game's order filtered to that stint's `onFloor ∪ sitting`), find the
   window start `w` (the member of the five whose circle predecessor is not
   in the five; with five or fewer in the circle, the first in order), and
   the next player is `circle[(w + c) mod n]`. If the five is not a run of
   the circle (a hand swap broke it), fall back to the engine's `orderNext`
   on that game's plan. The same helper gives the lead for a re-plan (5).
   In the example this gives Sheeks.
5. **A change of plan mid-game** (late arrival, Out, Sit for the rest, a rule
   or setting change) keeps the stints played, as every strategy does, and
   plans the rest with the formula: the lead for the first re-planned stint
   is (4) applied to the stint before it; the new circle is the game's order
   filtered to who is playing now (a late kid appears at their place in the
   order, a sat or out kid is gone). If the lead is not in the new circle,
   the next player after them in the game's order who is. `resolveRest` no
   longer refuses `order`.
   Sit for the rest of a kid on the floor re-plans from the current stint
   like the other strategies do, with the new circle; the four who stay are
   not forced (the order decides).
6. **c** is Players changing at once (1–5). **"Doesn't fit"** means
   `c > n − 5`: fewer players sit than c, so fewer than c change. The plan
   says: "With N players, only N−5 sit each stint, so fewer than c change at
   a break." (exact words the developer may tighten, plain English). With
   exactly 5 available, everybody plays everything, as today.
7. **Rules warn, never block or reorder.** For `order`, `analyzeFeasibility`
   keeps only the hard errors that make five impossible (fewer than five
   available). After the lineups are built, these notes are written, each
   ending in the plain reason that the order puts them there (never "no
   legal lineup …", which is false here): a minimum or league minimum missed
   (`MIN_MISSED`), Plays at most (`CAP_EXCEEDED`), Plays at most N in a row
   (`CONSEC_EXCEEDED`), Sits at most N in a row (`BENCH_EXCEEDED`), Apart
   (new `APART_TOGETHER`: "X and Y are set Apart but are on the floor
   together for N stints."), Starts the last period missed (existing missed
   pin note), and (6). Keep-together (`PAIR_PARTIAL`) and One of two on
   (`KEEPON_PARTIAL`, with an order-true reason) stay as notes.
   `SUBS_EXCEEDED`, `HALF_LATE`, `HALF_EARLY`, `SPREAD_RULE` and
   `SPREAD_FLOOR` are not written for `order` (they describe a search).
   The notes rebuilt from shown fives after a swap or re-plan
   (`consecNotes`, `benchNotes`) use their existing wording, which is order-true.
8. **The Starting five rule** does not apply: Add a rule does not offer it
   for an `order` game, and an existing Starting five rule shows in the list
   with the short line "Not used: the order picks who starts." The engine
   ignores `openingFive` for `order`.
9. **Lineup balance and Shuffle** are hidden for an `order` game (the Plan
   sheet's Lineups row, `#regen`, and the `S` shortcut does nothing).
10. **Like Platoon elsewhere:** no season targets and no day carryover reach
    the plan (`seasonTargetsFor` refuses it; carryover is not used to change
    the order); league full periods and Plays in each half/period are not
    applied, as for Platoon (`playsInRule` 'off', `assignFullPeriods`
    skipped). The league minimum in minutes or percent composes into
    `minMinutes` and warns as (7).
11. **Fairness note.** For `order` the engine writes one info with the minutes
    as they fall, naming the low end in the same words as
    `minutesNote`/`lowEndPhrase` (e.g. "Sheeks 16, everyone else 20.") or the
    even sentence when equal. Code `SPREAD_ORDER`; `plan-view.js`'s rebuild
    after a swap treats it like the other spread notes.
12. **Handoff** carries `g.order` with the game so a handed-off Rotation order
    game plans the same.
13. **The order list** lives in the Plan sheet's strategy body (the order is
    a choice about this game, S2). One `.pgrp` with a row per roster player in
    the game's order: position number, name (wraps, never clipped), "Out" or
    "Running late" muted on a kid not available, and two 48px icon buttons
    named "Move <name> up" / "Move <name> down" (first row's up and last
    row's down disabled). Two controls in a row is a deliberate exception to
    C6, because I3 asks for a visible button for reordering and the issue
    decided up/down buttons; written in the design-decisions linked doc.
    Moving acts at once (live sheet, C4); focus stays on the moved button in
    its new row. One footer line (W3): "The first five start. Players who are
    out are skipped." A move is `edit('order')` (a new `edit.js` kind, plan
    keys like `units`).

## What would settle it

1. **Example, exactly.** Roster Webb, Kade, Brooks, Brody, Jack, Sheeks,
   Cooper, Tate, Damari; 2 periods × 16 min, sub every 4 min (8 stints),
   Players changing at once 4, strategy Order. Game 1's eight fives are the
   issue's list, in order. Adding game 2 the same day (cloned) gives game 2
   the order Sheeks, Cooper, Tate, Damari, Webb, Kade, Brooks, Brody, Jack,
   stint 1 Sheeks, Cooper, Tate, Damari, Webb, stint 2 Webb, Kade, Brooks,
   Brody, Jack. A Coach-seam scenario; red on `317022e`.
2. **Independence.** Editing game 1's order after game 2 exists leaves game 2's
   order unchanged.
3. **Engine cases** (`node --test`): c = 1..5 against the formula for n = 6,
   7, 9, 10; n = 5 everybody every stint; `orderNext` correct; (6)'s note
   present exactly when `c > n − 5`.
4. **Out kid**: marked Out before the game, skipped; the circle is the other
   n−1 in order.
5. **Late arrival mid-game**: Running late kid, Here now after stint 3 of 8:
   stints 1–3 unchanged; stint 4 onward is the formula over the circle with
   the kid in their place, starting from the lead (5) gives.
6. **Sit for the rest**: allowed for `order` (no "does not apply" refusal);
   played stints unchanged; the rest cycles without the kid.
7. **Change of plan mid-game**: a rule or attendance change in an underway
   `order` game keeps played stints and continues the cycle (5).
8. **Rules warn**: an Apart pair the order puts together, a cap the order
   breaks and a minimum it misses each produce one note, the plan still
   shows exactly the formula's fives, and nothing blocks.
9. **Other strategies unchanged**: a seeded before/after over Even, By hand,
   Closers and Platoon (rosters 6–12, several formats, seeds 1–20, rules
   on) gives byte-identical `generatePlan` output on this branch and on
   `317022e`. Recorded in the PR.
10. **Evals** do not regress (`npm run evals` pass/fail counts same as main).
11. **Look**: the strategy picker and the order list, roster of 9 long names
    (e.g. "Alexandria Montgomery-Okafor"), sheet scrolled to the bottom and at
    full height, at 320 and 390 wide, 16 and 32px text: no clipping,
    `measurements.json` findings empty. Smoke stays green (touch targets,
    names, large text).
12. **Copy**: Help's "Choosing a plan" gets a `<dt>Rotation order</dt>` entry
    in plain words; `scripts/whats-new.json` gets one entry; Starting five's
    reason line and the (6) note read as plain English.

## Surfaces

Change: `app/engine.js` (an `order` path in `generatePlan`, `finish`
exemptions and wording, `orderNext`/per-stint leads), `app/state.js`
(`STRATEGIES`, `STRATEGY_WORDS`, `computeAll` input and cache key, starting
point, `resolveRest`, `seasonTargetsFor`, `playsInRule`, `newGame`),
`app/team-ops.js` (`removePlayer` sweep), `app/storage.js` (accept `order`,
sanitize `g.order`), `app/strategy.js` (order editor), `app/edit.js`
(`order` kind), `app/index.html` (`#stratseg` button, Help entry),
`app/rules.js` (Starting five), `app/plan-view.js`, `app/app.js` (Shuffle),
`app/analytics.js`, `app/handoff.js`, `app/tour.js` if it lists every
strategy, `app/app.css` for the list, `scripts/feature-keys.mjs`,
`scripts/whats-new.json` → `app/whats-new.html`, `app/sitemap.xml`,
`CONTEXT.md`, tests, a linked `docs/design-decisions-rotation-order.md`.

Must not change: the card's size, other strategies' output (9), the
design-decisions.md byte limit (add only a one-line link there).

## Constraints

- `engine.js` and `storage.js` are pure and heavily tested; this task is
  about the engine, so it is touched, but every other strategy's path must
  stay byte-identical (9). Keep the order path separate rather than
  threading conditions through the search.
- Reuse: `lowEndPhrase`/`evenMinutesSentence` for (11), `runOverSentence`
  for run notes, `effectiveStints`/`benchStints` for (4), `availIds` and
  `playingIds` for who is in the circle, `pickFive`-style row styles
  (`.pgrp`, `.prow`) and `icon()` for the list. Do not re-derive who is
  playing.
- Mobile first, 320–390, 48px targets, names wrap rather than clip,
  American spelling, plain coach words (`/ship-feature` § Would a coach
  notice this?).
- Bytes: widen `bytesAbs` / re-pin the bytes baseline if needed and say so.
  `requests` must not move (no new boot module).

## Design

Engine: `generatePlan({ strategy: 'order', order, … })` where `order` is the
circle (available ids, in the game's order, already turned so the first stint's
lead is first). Stint `j` of the stints handed in is
`circle[(j*c + t) mod n]`, t = 0..4, c = clamp(maxSubs, 1, 5). Returns the
usual plan plus `orderNext` (`circle[(S*c) mod n]`, S stints). No search, no
seed dependence.

State: one helper turns a game into its circle and lead; `computeAll` passes
`order` for `order` games (the cache key includes `g.order`). The starting
point (3)/(4) and the re-plan lead (5) share the "where did the cycle stop"
helper. `resolveRest` for `order` builds the suffix circle and calls the
engine with the suffix stints.

UI: the fifth segment, the order list (13), hidden Lineups and Shuffle,
Starting five line (8).

## Proof

- Coach seam (`test/coach.js`, add verbs as needed: pick strategy Order, move
  a player up/down, add a game, Here now, Sit for the rest): items 1, 2, 4,
  5, 6, 7, and the hidden Shuffle/Lineups and Starting five line.
- `node --test` on `generatePlan` (many input cases): items 3, 8.
- A seeded before/after script run on both trees (scratch, not committed;
  result in the PR): item 9. `npm run evals`: item 10.
- `scripts/look.mjs` plus smoke: item 11. Smoke's large-text state list may
  gain an Order state if it doesn't reach the list today.

## Out of scope

- Storing the order on the team (dropped by the owner's change).
- A "Starts with" control (dropped).
- Drag to reorder.
- Changing the order to even out minutes across the day.
- about.html / advanced.html marketing copy.
