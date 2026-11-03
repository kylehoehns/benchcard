# 557 — Order: a choice to mix the fives

## Issue

#557: when Order builds the list (#547) the coach can pick between giving the
best players the most minutes (today) and mixing the fives, so the stronger
kids are spread round the list and every five has some of them.

## Goal

A coach on Order whose list the app builds sees a choice, "Best players play
the most" (the default, exactly today's list) or "Mix the fives". Under Mix the
fives the app's list spreads the higher-level kids so no five is stacked and no
five is empty of them. Rules still beat it. The minutes under each name show
who gives up time for it.

## Survey (on `22855f7`)

- `buildOrder` (`app/engine.js`, ~line 1422): spots are fixed by the cycle
  (`placesOn`), each spot's minutes are fixed, the search permutes kids over
  spots. Score = `1e6 × rule cost + pref`, pref = `−Σ weight(kid) ×
  minutes(spot)`. Start = priority-sorted match; best swap, then every 3-cycle,
  `BUILD_CAP` = 12000 score evaluations; restarts from the winner turned by 1,
  2, ... places run **only while a rule is broken**.
- `solveDay` (`app/state.js`, ~line 2462) calls `buildOrder` when
  `g.strategy === 'order' && g.orderBuilt === true && !gameStarted(g.live)`,
  memoized per game on a JSON key of its inputs.
- Levels: `p.tier`, 1–5, default `DEFAULT_TIER` 3 (`storage.js` clamps to an
  integer 1–5). `state.js`'s `tiers` map exists **only under the 'levels'
  tie-break**, so it is not the input here; `tierOfPlayer(p)` is.
- Per-game Order fields live on the game (`g.order`, `g.orderBuilt`), kept by
  `sanitize` only when set. `copySetup`'s `plan` part copies `strategy`,
  `order` and `orderBuilt` (that is what Copy from another game's "How it
  plans" switch and the Same as card both run). `g.constraints` is
  whitelisted by `sanitize`, so a new constraints key would need its own
  sanitize line anyway; a game field like `orderBuilt` changes no other
  record's shape.
- `paintChoiceRows` (`app/game-setup.js`) is the app's checkmark choice row
  (`.prow`, `aria-pressed`, focus kept). Lineup balance's choice
  (`balance.js`) sets the value and calls `edit()`, no Undo.
- The issue's example checked with a scratch copy of the builder: 9 kids,
  2 × 16, a sub every 4, 4 changing, top four at one level above the other
  five (levels 5/3, 4/2, 5/1, 4/3; top four first, last, or every other on the
  roster). With the minutes-weighted variance below **and** restarts also run
  under Mix, every five holds 2 of the top four (one holds 3) in all twelve
  cases. Without restarts the search stalls: on 300 random small cases it was
  above the best possible spread in 132; with restarts in 20, and then only
  slightly. Evaluations stay far under `BUILD_CAP` (about 2100 for nine kids).

## Decisions this spec makes (gaps the issue left)

1. **Where the choice is stored:** `g.orderMix === true` on the game means
   Mix the fives; absent means Best players play the most. `sanitize` keeps it
   only when exactly `true`. `copySetup`'s `plan` part copies it (or deletes
   it), beside `orderBuilt`, so Copy from another game ("How it plans") and a
   new game made from another (Same as) carry it. `newGame` keeps it (it is
   not a property of one list, like `order`/`orderBuilt`, but of how the game
   plans). The handoff does not carry it (a handed-off list is the coach's,
   and the choice only matters for the app's list).
2. **The score under Mix (the issue left the formula to the spec).** For each
   stint `j`, strength `s_j` = the sum of the levels of the five on. Mix cost
   `V = Σ_j m_j × (s_j − s̄)²`, where `m_j` is the stint's minutes and
   `s̄ = Σ_j m_j s_j / Σ_j m_j` (the minutes-weighted variance of the fives'
   strength, times the game's minutes). Under Mix:
   `score = 1e6 × rule cost + V + pref / (1 + n² × M²)`, `M` = the game's
   minutes, `pref` today's preference cost. The divided pref is always under
   1/M in size, so it only chooses between lists whose fives are equally even
   (with whole minutes, V moves in steps of 1/M): among those, the kids the
   odd minutes setting favors still get the longer spots. Why the variance
   and not the gap or the fewest top kids: the gap and the count only look at
   the worst five, so most swaps do not change them and the search has
   nothing to follow; the variance moves with every five, and it met the
   issue's target in every case tried. Rules still dominate: V is at most
   `M × 20²` for levels 1–5, the same order as today's pref.
3. **Restarts under Mix.** The restarts from the winner turned by 1..n−1
   places run under Mix whether or not a rule is broken (still stopping at
   `BUILD_CAP`). Under Best players they run as today, only while a rule is
   broken.
4. **When Mix changes nothing.** Mix applies only when the levels of the kids
   in play differ. With every kid at one level (or Mix off), `buildOrder` runs
   exactly today's code path, so the list is today's, evaluation for
   evaluation.
5. **Interface:** `buildOrder({ ..., mix })` where `mix` is a map of player id
   → level, passed only when the game is on Mix. Absent (or every level the
   same) is today's builder. `solveDay` passes
   `Object.fromEntries(inPlay.map(id => [id, tierOfPlayer(byId)]))` (levels
   read with `tierOfPlayer`, whatever the odd minutes setting) when
   `g.orderMix`, and the memo key gains `[mix]` only when it is set, so a
   default game's key is unchanged.
6. **Where the choice shows:** on the Plan sheet's Order body, only while the
   app owns the list and the game has not started (`g.orderBuilt &&
   !gameStarted(g.live)`) — the issue says it only matters then, and a
   control that changes nothing is not shown (W3). A coach's list shows
   "Build it for me again" as today; once built, the choice appears, and the
   stored choice is the one used. It sits above the list as one `.pgrp` group
   of two `paintChoiceRows` rows under a `.pgrp-h` header **"How to build the
   list"**:
   - **"Best players play the most"** when the odd minutes setting is Best
     players, **"Kids furthest behind play the most"** when it is Furthest
     behind (that is what today's list does under each);
   - **"Mix the fives"**.
   Tapping a row sets or deletes `g.orderMix` and calls `edit('orderBuild')`
   (the plan rebuilds the list, then the Order body repaints after it); focus
   goes back to the tapped row. No Undo: it is a choice like Lineup balance,
   and tapping the other row undoes it.
7. **Footer under the list** (the existing `.pgrp-f`, one line, plain):
   - Mix, levels differ: "Built for you: your stronger players are spread
     out so every five has some. Move anyone and the list is yours."
   - Mix, every level the same: "Built for you: everyone is at the same
     level, so there is nothing to mix. Move anyone and the list is yours."
   - Otherwise as today. Each is followed by today's "The first five start.
     Players who are out are skipped."
8. **A coach's list is never rebuilt** by the choice: it cannot be tapped
   while the list is the coach's (it is not shown), and `solveDay` builds
   only for `orderBuilt`.

## What would settle it

1. **Default byte for byte** (`node --test`): a seeded fingerprint taken on
   `22855f7` before any app change, committed in a test:
   (a) `buildOrder` over seeded inputs (rosters 2–15, 1–5 changing, several
   formats incl. unequal stints, random priorities and random rules), hash of
   every `{ order, short, evals }`; the same calls on this branch also pass a
   `mix` map whose levels are all equal, and must hash the same;
   (b) `computeAll` (`test/state-fixture.js`) over seeded records with Order
   games whose list is the app's (`orderBuilt`), random levels, both odd
   minutes settings, random rules: hash of every game's `g.order` and plan.
   Both hashes recorded on `22855f7` and unchanged here.
2. **The issue's game** (`node --test` on `buildOrder`, and Coach seam): 9
   kids, 2 × 16, a sub every 4, 4 changing, four kids one level above the
   rest and not the first four on the roster. Mix on: every one of the 8
   fives (worked out on paper from the list) holds at least 2 of the four.
   Off: today's list (spots 2–5 to the four).
3. **Rules beat the mix** (`node --test`): an Apart pair Mix would put
   together is kept apart (shared minutes 0, `short` empty); a minimum Mix
   would break is met.
4. **Equal levels** (`node --test`): Mix with every kid at one level returns
   the same `{ order, short, evals }` as Mix off, over many inputs (covered by
   1a) and on the issue's nine.
5. **Same answer:** two calls with the same input under Mix give the same
   list; evaluations never pass `BUILD_CAP`.
6. **Coach seam** (`test/coach.js`, made-up names only: Avery, Blake, Casey,
   Drew, Emery, Finley, Gray, Harper, Indy): pick Order → the choice shows with
   "Best players play the most" chosen; tap "Mix the fives" → the list
   changes, every five holds at least 2 of the four higher-level kids, the
   minutes under the names agree with the plan, the footer reads as (7);
   reload keeps Mix; moving a row hides the choice and the list stays the
   coach's when a level changes; "Copy from another game" with How it plans
   carries Mix to another game; under Furthest behind the first row reads
   "Kids furthest behind play the most".
7. **Build time:** `buildOrder` under Mix on 15 players, 4 × 8, a sub every 2,
   every rule kind, at 4× CPU slowdown in Chrome, median and max of 9 runs,
   under 50 ms (the #547 budget); stated in the PR.
8. **Look:** the Order body with the choice, 9–12 players with long names
   ("Alexandria Montgomery-Okafor"), the sheet scrolled to the bottom and at
   full height, 320 and 390 wide, 16 and 32px text: no clipping, no cramped
   wrapping, `measurements.json` findings empty. Smoke green.
9. **Copy:** one What's new entry in plain coach words; Help's Rotation order
   entry mentions the choice; `scripts/coverage.json` not lowered.

## Surfaces

Change: `app/engine.js` (`buildOrder` only), `app/state.js` (`copySetup`,
the `solveDay` build call and memo key), `app/storage.js` (keep `orderMix`),
`app/strategy.js` (`orderEditor`: the choice group and footer),
`app/index.html` (Help's Rotation order `<dd>`), `scripts/whats-new.json` →
`app/whats-new.html`, `app/sitemap.xml`, `CONTEXT.md` (Rotation order entry),
`docs/design-decisions-rotation-order.md`, tests (`test/order-build.test.js`
or a new `test/order-mix.test.js`, a new Coach scenario file, `test/coach.js`
verbs if needed).

Must not change: any plan or list while `g.orderMix` is absent;
`generatePlan`; other strategies; the card; `handoff.js`;
`docs/design-decisions.md` (size limit); the `requests` pin (no new module);
`scripts/coverage.json` downward.

## Constraints

- `engine.js` is pure and heavily tested: the change is inside `buildOrder`
  and is inert when `mix` is absent or flat.
- Reuse: `placesOn` for who is on at stint j (no second copy of the
  formula), `tierOfPlayer` for levels (do not read `p.tier` raw or the
  'levels'-only `tiers` map), `paintChoiceRows`, `.pgrp`/`.pgrp-h`/`.pgrp-f`,
  `edit('orderBuild')`, `copySetup` (one copy routine), `BUILD_CAP`.
- Same input, same list: no `Math.random`, no clock; fixed scan order.
- Mobile first, 48px rows, names wrap and never clip; American spelling;
  coach copy in plain words (`/ship-feature` § Would a coach notice this?).
- Public repo: tests and docs use made-up names only.

## Proof

- `node --test` on `buildOrder` (many input cases): items 1a, 2, 3, 4, 5.
- `node --test` on `computeAll` through `test/state-fixture.js`: item 1b, and
  that `copySetup` and `sanitize` keep `orderMix`.
- Coach seam: items 2 (on screen) and 6.
- Scratch CDP probe at 4× CPU throttle: item 7. `look.mjs` and smoke: item 8.

## Out of scope

- Mixing a list the coach set by hand.
- Any other goal (e.g. strongest five to close).
- Using Lineup balance for Order.
