# 547 — Order builds the list for you

## Issue

#547: when a game switches to Rotation order (#545) and has no list yet, the
app builds the list from the coach's criteria (the odd minutes setting and the
rules) instead of copying the roster order; the coach's own edits win.

## Goal

A coach who picks Order gets a list where the spots that play the most go to
the kids their odd minutes setting favors (best players, or furthest behind),
with Apart, Together, minimums, caps, One of two on and the league minimum
steering it. Each row shows that kid's minutes, so the coach can see what a
spot is worth before moving anyone. Once the coach moves a row, the list is
theirs until they ask for it to be built again.

## Survey (on `7ac3d91`)

- #545's order path: `effectiveOrder`, `cycleNext`, `orderCircle`,
  `orderAfter`, `startingOrder`, `moveInOrder`, `chooseStrategy` in
  `app/state.js` (around line 1186); `orderLineups`/`orderChanges`/
  `orderNotes` in `app/engine.js`; `orderEditor` in `app/strategy.js`;
  `addGame` writes the start for a game added on Order.
- The odd minutes setting is `state.settings.tieBreak` (`'behind' | 'levels'`,
  Settings row "The odd minutes": Furthest behind / Best players).
  `computeAll`'s `solveDay` already composes it into one number per kid:
  `priorityOf(id)` = level × 1000 + deficit under 'levels', the deficit alone
  under 'behind', where the deficit (`deficitOf`) is the season (when on) plus
  the earlier games that day. That map (`prio`) is the ranking this feature
  uses. Nothing is re-derived.
- The league minimum is composed into `c.minMinutes` in `solveDay`
  (`composedMinimum`) before `generatePlan` is called. The builder reads that
  composed map, so the league minimum steers it with no second reader.
- **Falsified claim: "Plays at most and Sits at most steer the choice."**
  Both are game-wide run limits (`maxConsecutive`, `maxBench`). Each spot's
  runs are fixed by the cycle, and every spot is filled by someone, so every
  list has exactly the same runs: no list can do better than another. Closest
  to intent: the builder ignores them, and #545's `CONSECUTIVE`/`BENCH` notes
  keep saying when the cycle breaks them. Recorded here and in the PR.
- **Gap filled: Starts the last period.** The issue's list of rules leaves it
  out, but #545 still reads it and it is steerable (who is in the window at
  the last period's first stint). The builder includes it, closest to "rules
  shape the list".
- Plan minutes per spot: with `n` here and `c` changing, spot `k` plays every
  stint `j` where `k` is one of `(j*c + t) mod n`, t = 0..4 — the same formula
  as `orderLineups`. For 9 players, 2 × 16, a sub every 4, c = 4: spots 2–5
  play 20, the rest 16 (checked against the issue).
- `edit('order')` repaints `PLAN_ONLY`, which has no `strategy` key, so the
  list itself is not repainted after the plan; `budget` is (in place,
  `refreshBudgetActuals`). `undoable` snapshots the whole state.
- `docs/design-decisions.md` has a size limit; detail goes in
  `docs/design-decisions-rotation-order.md`.
- `scripts/coverage.json` is 96.5 (lowered by #545).

## Decisions this spec makes (gaps the issue left)

1. **Who owns the list is one flag on the game: `g.orderBuilt === true`**
   means the app's. Absent means the coach's. Every record written before
   this change, every #545 list and every handed-off game (the handoff
   carries `g.order` but not the flag) is the coach's, so it plans exactly as
   before. `sanitize` keeps the flag only when it is `true` (absent otherwise,
   so no other record changes shape).
2. **The app's list is live until the game starts.** While `g.orderBuilt` is
   set and no stint has been played (`playedStints(g.live) === 0`, so a
   finished game is never rebuilt either), `solveDay` builds the list again on
   every plan, from that moment's roster, levels, availability, rules, format,
   Players changing at once and odd minutes setting, and writes it to
   `g.order` before the plan's cache key is taken. So adding an Apart rule,
   changing a level or marking a kid Out moves the app's list; the coach's
   list never moves by itself. Once a stint has been played the list is
   frozen even if it is the app's, and #545's mid-game behavior (re-plans keep
   the played stints and continue the cycle) applies unchanged.
3. **Where a new list starts** (`startingOrder`, used by `chooseStrategy` and
   `addGame`): if the latest earlier Order game that same day is the coach's,
   the new game continues its cycle as #545 does and is the coach's too. In
   every other case (no earlier Order game that day, or it is the app's) the
   new game is the app's (`orderBuilt = true`; `g.order` gets the roster order
   as a placeholder that the next plan replaces). A new day and the game that
   replaces a filed day are therefore built.
4. **Out and Running late kids** are not placed by the builder; they go at the
   end of `g.order` in roster order, and the cycle skips them as in #545. A
   Running late kid who is Here now before the game starts is placed on the
   next build; one who arrives mid-game joins at the end (the list is frozen).
5. **Ties.** Kids with the same priority (within 1e-6) count as equal. With
   everyone equal (no levels set under Best players, or the first game of a
   day with no season under Furthest behind) and no rules, the built list is
   the roster order.
6. **The builder** is `buildOrder` in `app/engine.js` (pure, no import of
   state, node-tested). Input: `{ ids, stints, maxSubs, priority, constraints }`
   where `ids` are the available players in roster order, `stints` the game's
   stints (each with `minutes`), `constraints` the composed one with
   `minMinutes`, `maxMinutes`, `avoids`, `pairs`, `keepOnFloor`,
   `lastPeriodFive` (and `periods`, or the stints' `period`, to find the last
   period's first stint). Output: `{ order, short }`, `order` a permutation of
   `ids`, `short` the rules it could not meet as `{ kind, ids }`.
   - **Spot minutes** come from the `orderLineups` formula over the stints.
   - **Start:** rank kids by priority, highest first (roster order inside a
     tie); rank spots by minutes, most first (lowest index inside a tie).
     Each tie group of kids takes the next block of spots, placed into them in
     increasing spot index, so equal kids keep roster order.
   - **Score** (lower is better) = `1e6 × rule cost + preference cost`. Rule
     cost, in minutes: minimum shortfall, minutes over a cap, minutes an Apart
     pair share, minutes both of a One of two on pair sit, the Starts the last
     period kids missing from that stint (× its minutes), and for Together the
     minutes the two do not share beyond the fewest any two spots can manage
     (so a pair as close as the cycle allows costs 0). Preference cost is
     `−Σ weight(kid) × minutes(spot)`, where weight is the number of kids with
     a strictly lower priority (ties share a weight). With no rules this is
     the sorted match the start already is.
   - **Search:** best-improvement pairwise swaps until none improves; when
     stuck, try every 3-cycle once and go back to swaps if one improves.
     Strict improvement only, a fixed scan order and **a fixed cap on score
     evaluations** (not a clock), so the same input always gives the same
     list. Rosters run to 15, so a pass is at most 105 swaps or 910 3-cycles.
   - **Time budget:** 50 ms for the largest roster (15, 4 × 8 min, sub every
     2 min, every rule kind present) at a 4× CPU slowdown in Chrome. The
     evaluation cap is set so the worst case stays inside it; measured and
     stated in the PR.
   - **short:** each rule with cost above zero in the final list.
7. **When the app's list breaks a rule,** the plan gets one warn note, code
   `ORDER_BUILT_SHORT`, built by `orderShortNote(short, label)` in
   `engine.js`: "No order meets every rule, so this list comes closest. It
   can't keep Ava and Ben apart, give Cal their minimum and keep Ava or Ben on
   the floor." Parts: Apart "keep A and B apart"; Together "keep A and B
   together more"; minimum "give X their minimum"; cap "keep X to their most
   minutes"; One of two on "keep A or B on the floor"; Starts the last period
   "start X in the last period". #545's per-rule notes stay as they are.
   Written only by the rebuild in (2), so a coach's list and a frozen list
   never get it.
8. **Moving a row** (`moveInOrder`) deletes `g.orderBuilt`: the list is the
   coach's from then on.
9. **"Build it for me again"** is a `.prow` button under the list, shown only
   when the list is the coach's and the game has not started (a played stint
   freezes the list, (2)). Tapping it sets `g.orderBuilt`, through
   `undoable("Built the list for you.", …)`; Undo restores the coach's list
   and clears the flag. The repaint must show the rebuilt list (the rebuild
   happens inside the plan), so it uses an edit kind whose keys include
   `strategy` after the plan (new kind `orderBuild: AFTER_EDIT`). Focus then
   goes to the first row's "Move <name> down" button.
10. **Minutes beside each row.** Each available kid's row shows their minutes
    this game, `<m> min` (`fmtMinutes`), from the open plan's
    `effectiveMinutes(g, p)`, as a muted second line under the name (so it
    costs the name no width at 320px and 32px text). Out or Running late kids
    show their mark instead, as now. No plan, no minutes line. The numbers
    are refreshed in place after every plan (from the `budget` painter in
    `render.js`, beside `refreshBudgetActuals`): if the list order on screen
    no longer matches `effectiveOrder(g)` (the app rebuilt it), the order
    editor is re-rendered instead, keeping focus where it was when the
    focused button still exists.
11. **Footer lines** (plain words):
    - the app's list: "Built for you: your best players get the spots that
      play the most." or "Built for you: the kids furthest behind get the
      spots that play the most." then "Move anyone and the list is yours."
    - the coach's list: "You set this list."
    - both, after: "The first five start. Players who are out are skipped."
12. **Copy outside the sheet:** Help's Rotation order `<dd>` says the app
    builds the list from the odd minutes setting and the rules, shows each
    kid's minutes, and that moving anyone makes it yours. One What's new entry.

## What would settle it

1. **The issue's example** (Coach seam, red on `7ac3d91`): 9 players with
   levels (four at a higher level than the other five, not the first four on
   the roster), 2 × 16, sub every 4, 4 changing, odd minutes on Best players;
   the coach picks Order. The four higher-level kids are in list spots 2–5,
   each row shows 20 min, the rest 16 min, and the plan's minutes agree.
2. **Rules** (`node --test` on `buildOrder`): an Apart pair never shares a
   five; a Together pair shares as many minutes as the cycle allows (cost 0);
   a minimum of 20 with 9/4 puts that kid in a 20 spot; a cap of 16 keeps a
   high-level kid in a 16 spot; One of two on and Starts the last period met
   when possible. An impossible set (e.g. three kids each with a minimum of
   20 and Apart from each other where the 20 spots overlap) returns the
   closest list and names each unmet rule in `short`; `orderShortNote` reads
   as in (7). Coach seam: an Apart pair the app's list separates (no
   `APART_TOGETHER` note), and an impossible minimum shows the
   `ORDER_BUILT_SHORT` note on screen.
3. **The coach's hand wins** (Coach seam): after moving a row, changing a
   level or adding a rule does not change the list; "Build it for me again"
   appears, rebuilds, and Undo puts the coach's list back.
4. **Later games** (Coach seam): game 1 set by hand → game 2 continues its
   cycle (#545's GAME_TWO_ORDER); game 1 the app's → game 2 is built again
   (Furthest behind: the kids game 1 left short get the 20 spots).
5. **Same answer:** `buildOrder` called twice with the same input, and with
   ids in a different roster order where priorities are distinct, gives the
   same list; no `Math.random`, no clock in it.
6. **Every other strategy unchanged and hand lists unchanged:** a seeded
   before/after script (scratch, not committed) over Even, By hand, Closers,
   Platoon and Order with explicit lists (rosters 6–15, several formats and
   change counts, seeds 1–20, rules on) gives byte-identical `generatePlan`
   output on this branch and on `7ac3d91`; and `computeAll` on a record whose
   Order games carry no flag gives the same plans on both trees. Result in the
   PR.
7. **Evals** do not regress (`npm run evals` counts same as main).
8. **Build time:** `buildOrder` on the largest roster (6) at 4× CPU slowdown,
   median of several runs, under 50 ms; stated in the PR.
9. **Look:** the order list with minutes, roster of 9–12 long names
   ("Alexandria Montgomery-Okafor"), each sheet scrolled to the bottom and at
   full height, at 320 and 390 wide, 16 and 32px text: no clipping,
   `measurements.json` findings empty, the minutes line and the Build button
   visible. Smoke green.
10. **Coverage:** the line floor in `scripts/coverage.json` is not lowered;
    if the measured total is at or above 97.3 it is raised to 97.3.
11. **Copy:** Help entry and one `scripts/whats-new.json` entry in plain coach
    words (no "cap", "stint", "pin"); the `ORDER_BUILT_SHORT` note plain.

## Surfaces

Change: `app/engine.js` (`buildOrder`, `orderShortNote`; nothing in any other
path), `app/state.js` (`startingOrder`, `chooseStrategy`, `addGame`,
`moveInOrder`, a `buildOrderAgain(g)` export, the rebuild in `solveDay`, the
note), `app/storage.js` (keep `orderBuilt`), `app/strategy.js` (minutes line,
footer, button, in-place refresh), `app/edit.js` (`orderBuild` kind),
`app/render.js` (call the refresh), `app/app.css` (minutes line, button),
`app/index.html` (Help), `scripts/whats-new.json` → `app/whats-new.html`,
`app/sitemap.xml`, `scripts/coverage.json` (only up), `CONTEXT.md` (Rotation
order entry gains the built list), `docs/design-decisions-rotation-order.md`,
tests (`test/engine-order.test.js` or a new `test/order-build.test.js`,
`test/rotation-order-scenarios.test.js`, `test/coach.js` verbs).

Must not change: `generatePlan`'s output for any input (the builder only
chooses `g.order`), other strategies' plans, the card, `handoff.js` (it must
not carry the flag), `docs/design-decisions.md` (size limit), the
`requests` pin (no new module).

## Constraints

- `engine.js` is pure and heavily tested; the builder is a new pure export
  beside `orderLineups` and touches no existing path.
- Reuse: `prio` from `solveDay` (do not re-rank by `tierOfPlayer` or
  deficits), the composed `c.minMinutes` (do not read the league minimum
  again), `orderChanges`, `orderLineups`'s formula (one place: factor a
  shared "who is on at stint j" helper rather than a second copy),
  `buildStints`, `effectiveOrder`, `effectiveMinutes`, `fmtMinutes`,
  `andList`, `moveButton`, `.prow`/`.pgrp`/`.pgrp-f`, `undoable`.
- #545 scenario tests that pick Order through the UI and then rely on the
  roster order or on game-2 continuation get a list set by hand first (a move
  down and back up), which is the issue's own "set by hand" case; tests that
  seed `strategy: 'order'` directly are the coach's list already and should
  pass unchanged. Change a #545 test only where this issue changes the
  behavior it asserts, and say which in the PR.
- Mobile first, 320–390, 48px targets, names wrap, never clip; American
  spelling; plain coach words (`/ship-feature` § Would a coach notice this?).
- Bytes: widen `bytesAbs` if needed and say so.

## Proof

- `node --test` on `buildOrder`/`orderShortNote` (many input cases): items 2,
  5, and the spot-minutes formula; these also count the builder's lines for
  coverage (10).
- Coach seam (`test/coach.js`; add verbs: the minutes shown on each order row,
  the footer text, tap "Build it for me again"): items 1, 2 (on screen), 3, 4.
- Scratch before/after script on both trees: item 6. `npm run evals`: 7.
- A scratch CDP probe with `Emulation.setCPUThrottlingRate` 4 timing
  `buildOrder` in the page: item 8.
- `scripts/look.mjs` and smoke: item 9; the smoke coverage row: 10.

## Out of scope

- Shuffle or any random choice of list.
- Rebuilding a list once the game has started.
- Making Plays at most / Sits at most in a row steer the list (no list can).
- Carrying the flag in a handoff.
- Changing #545's per-rule notes.
