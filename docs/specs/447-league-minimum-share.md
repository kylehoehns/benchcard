# 447 — League minimum as a share of the game, scaled for late arrivals

## Issue

#447: the league minimum is a fixed number of minutes, so "half the game"
cannot be set once for games of different lengths, and a kid who arrives late
is still owed the whole-game minimum, which turns into "play every stint left"
with no note. Let the league minimum be a share of the game, and scale it for a
late arrival.

## Goal

A coach whose league says "everyone plays half the game" sets that once in
Settings, and every game owes half of its own length: 16 in a 4x8, 12 in a
2x12, 12 in a 4x6. A kid who walks in at halftime is owed half of the time left
(8 in a 4x8 with a 16-minute floor), not every stint that is left, and the kids
who were there all along keep their floor. When a minimum still cannot be met in
the time left, the plan notes say so.

## Survey

On `7f63ad0` (main after #446, #504, #509, #511). Scratch probe
`probe.mjs` (scratchpad, not committed) through the real `state.js`:
`setAvailable` + `computeAll`, 6 game shapes (4x8/4, 2x16/4, 4x6/3, 2x12/4,
4x8/8, 2x20/5) x 7-12 players x seeds 1-5 x arrival at 1/4, 1/2 and 3/4 of the
stints, league minimum = half the game in minutes.

- The issue's repro holds: 10 players, 4x8 every 4, league minimum 16, p9
  marked here at stint 4 plays stints 5-7, 12 minutes. Cause as the issue says:
  `resolveRest` sets `lo = max(own, leagueMin)` and clamps `lo - played` to the
  minutes left, silently.
- Of 360 cases that solved, **100** give the late kid every stint left although
  the scaled minimum is lower, and **40** leave the late kid under the scaled
  minimum with no note at all (the clamp case: they arrived during the last
  stints).
- **90** cases refuse once the late kid is marked here. On a closer look
  these are real: ten on-time kids at 16 already fill all 160 floor-minutes of
  a 4x8, so any minimum at all for an eleventh kid cannot fit. They still
  refuse after this change, which is right; the plan says so with
  `MINS_UNSATISFIABLE`. The smaller case the issue did not name (9 on time, 2
  late, 4x8, 16) is a real fix: the full solve composed the whole-game 16 onto
  the late kids (176 > 160) although they are owed 8 each (160), see J.
- Fixed 16 in short games, as the issue says: 2x12 with 8 and with 9 players
  refuse with `MINS_UNSATISFIABLE`; 4x6 (every 3) with 9 players refuses, first
  message `MIN_OFF_STINT_BOUNDARY`.
- The issue's line numbers moved (#446): the composition is in `computeAll`
  (`state.js` ~1946) and the clamp in `resolveRest` (~2183). Both still read
  one `leagueMinutes()`.
- #412 has merged (the issue's "build after").

## Choices the issue did not make

1. **How a share is entered.** One number box and a unit picker beside it:
   `min`, `% of game`, `periods`. "Half the game" is 50 `% of game`. A percent
   covers half, a third and a quarter in one box, and the rule sentence says
   "half the game" for 50. The issue asked for "half the game, other shares, or
   N periods"; this is the smallest control that holds all three.
2. **Storage.** `settings.minMinutes` stays the amount and a new
   `settings.minUnit` (`'min'`, `'pct'` or `'periods'`, default `'min'`) says
   what it counts. A record with no `minUnit` is minutes, so every saved team
   loads unchanged. The amount is clamped per unit: 0-60 minutes, 0-100
   percent, 0-8 periods. Changing the unit keeps the number, clamped.
3. **"Rounded up to a whole stint"** means: when every regulation stint of the
   game is the same length L, round up to a multiple of L. When stint lengths
   differ, the exact value is used. This is the same test the engine's
   `MIN_OFF_STINT_BOUNDARY` uses, so a share never trips that warning. Never
   more than the game's regulation minutes.
4. **Game minutes** are regulation minutes (`periods x periodMinutes`).
   Overtime does not grow the league minimum.
5. **The late-arrival scaling is rounded up to a whole stint too**, the same
   way, then held to the minutes from the start of the stint they arrived in
   to the end of regulation. "Minutes after arrival" counts from the start of
   the stint `live.arrived[id]` names (the issue's halftime example: stint 4
   onward is 16 of 32, so 16 x 16/32 = 8). It applies to both units: the
   acceptance case is a 16-minute league minimum.
6. **The full solve uses the scaled minimum too.** `computeAll` composes the
   scaled league minimum for a kid in `g.live.arrived`, so marking a late kid
   here does not refuse the whole game for a minimum they are no longer owed
   (case J). A game whose minimums cannot fit even scaled still refuses.
7. **The note.** Code `MIN_CLAMPED`, severity `warn`, one per player, added
   to the plan's issues after the overrides are synced (the way `notePins`
   adds `PIN_BREAKS_RULE`). It fires in a game underway when a kid's minimum
   (their own whole-game minimum, or the scaled league minimum, whichever is
   higher, held under their cap) is more than the most they can still finish
   with: minutes in the stints already played and the current one, plus every
   minute after the current stint. Wording: "Lily can finish with at most 4
   min, under the league minimum of 8: that is all the time left." when the
   league part bound, and "...under their 20-minute minimum: ..." when the
   coach's own minimum bound. The plan view's #414 rebuild does not drop it.
8. **The rule sentence** for a share names the game's minutes too, so a coach
   sees what it means for this game: "Everyone plays at least half the game
   (16 min)", "Everyone plays at least 40% of the game (16 min)" (12.8 rounded up to a whole 4-minute stint), "Everyone
   plays at least 2 periods (16 min)". Minutes read as today: "Everyone plays
   at least 16 min".

## What would settle it

All through the `state.js` seam (`computeAll`, `resolveRest`, `setAvailable`),
red on `7f63ad0` except where marked:

- **A. Late arrival, minutes.** 10 players, 4x8 every 4, league minimum 16
  min, p9 out, game at stint 4, p9 marked here. p9's projected total is 8
  (not 12). Every other player ends at 16 or more.
- **B. Same with 12 min**: p9 is owed 6, rounded up to 8 (stints are 4); p9
  ends at 8, everyone else at 12 or more.
- **C. Share, 4x8.** League minimum 50 % of game: the composed minimum is 16
  (`MIN_OFF_STINT_BOUNDARY` absent), every player ends at 16 or more.
- **D. Share, 2x12 every 4, 8 players.** Composed minimum 12; the plan is ok
  with no `MINS_UNSATISFIABLE`. Same with 9 players.
- **E. Share, 4x6 every 3, 9 players.** Composed minimum 12; the plan is ok,
  no `MIN_OFF_STINT_BOUNDARY`, no `MINS_UNSATISFIABLE`.
- **F. Periods.** 2 periods in a 4x8 is 16; in a 2x12 is 24.
- **G. Minutes behave as today** (green on `7f63ad0` too): a 16-minute
  minimum on a 4x8 with no late arrival plans byte-identically to today
  (same `rotationStamp`).
- **H. Saved team loads unchanged** (green on `7f63ad0` too):
  `sanitizeSettings({ minMinutes: 16 })` gives `minMinutes: 16, minUnit:
  'min'`; junk `minUnit` falls back to `'min'`; 150 with `'pct'` clamps to 100;
  12 with `'periods'` clamps to 8.
- **I. The clamp note.** 10 players, 4x8 every 4, league minimum 16, p9
  marked here at stint 7 (the last): one `MIN_CLAMPED` note naming p9. A late kid
  with a coach's own Plays at least 28, marked here at stint 2 (at most 20
  left), gets the "their 28-minute minimum" wording. Built with a 12-minute
  league minimum: with 16, 9 x 16 + 28 = 172 passes the 160 floor-minutes and
  the full solve refuses first.
- **J. The late kids do not refuse the game.** 11 players, 4x8 every 4,
  league minimum 16 min, p9 and p10 out (9 x 16 = 144 fits in 160). Game at
  stint 4, both marked here: `plans[0].ok` is true. On `7f63ad0` it is false
  (11 x 16 = 176 > 160, `MINS_UNSATISFIABLE`).
- **K. Settings, a coach.** In Settings, a coach sets the league minimum to
  50 with `% of game`. After a reopen the game's Plan sheet Rules section reads
  "Everyone plays at least half the game (16 min)", and Settings still shows
  50 and `% of game`.
- **L. Probe.** The survey's probe re-run: 0 cases give a late kid every
  stint left beyond their scaled minimum, 0 late kids short with no note, and
  no on-time kid under the floor.
- **M. Evals** do not regress (`npm run evals` pass/fail counts the same as
  on `7f63ad0`).
- **N. Look.** Settings at 320 and 390 wide, 16 and 32px text: the
  Everyone plays at least row (number box, unit picker) is not clipped and
  every control is 48px tall. Smoke's settings-row and touch-target rows pass.

## Surfaces

- **Changes:**
  - `app/state.js`: one per-game reader replaces `leagueMinutes()` (the
    minutes the league owes in game `g`, and the scaled minutes for a late
    kid); `ruleCount`, `ruleItems`, `computeAll`'s composition and signature,
    `sayTheLeagueMinimum`, `resolveRest`'s floor; the `MIN_CLAMPED` note.
  - `app/storage.js`: `DEFAULT_SETTINGS.minUnit`, `sanitizeSettings` (the
    per-unit clamp). Asked for by this task; nothing else in it moves.
  - `app/teams-view.js`: the unit picker's handler and paint.
  - `app/index.html`: the unit picker in the row, the input's label, the help
    text under "Everyone plays at least".
  - `app/app.css` only if the row needs it to fit.
  - `test/`, `test/coach.js` (a verb for the league minimum if none exists).
- **Must not change:** `app/engine.js`, `app/budget.js`, `app/roster.js`. The
  card. A coach's per-player Plays at least (stays whole-game minutes).

## Constraints

- **One reader.** Every place that reads the league minimum reads it through
  the one per-game helper in `state.js`. `test/league-min.test.js`'s guard
  (nothing outside `state.js`, `storage.js` and the settings editor reads
  `settings.minMinutes` raw) stays and covers `minUnit` too.
- **Reuse, do not re-derive:** stint lengths from `buildStints` (as
  `runMinutes` does); late kids from `lateArrivals` inside `resolveRest`; the
  composition order of `computeAll` (league floor, own minimum higher wins,
  cap lower wins), now in one place both callers use; `plural` for "1
  period"; `fmtMinutes` for minutes.
- **The engine never learns the setting exists** (design-decisions, "A league
  minimum is a floor on the map the engine already reads"): it is still handed
  a per-player `minMinutes` map.
- **Precache:** `state.js`, `storage.js`, `teams-view.js`, `index.html` are
  precached; the build stamps `SHELL`, nothing to bump by hand.
- **Mobile first,** 390x844; the row must work at 320 with 32px text
  (`docs/interface-guidelines.md`: 48px targets, a visible label).
- **Settings writes with `edit('teamSetting')`** on `onchange`, like
  `#minMins`.

## Design

1. `storage.js`: `minUnit: 'min'` in `DEFAULT_SETTINGS`; `sanitizeSettings`
   keeps a valid unit, else `'min'`, and clamps `minMinutes` to the unit's
   range.
2. `state.js`: `leagueMinFor(g)` returns the minutes the league owes a kid
   who was there all game (0 off): minutes as stored for `'min'`; for `'pct'`
   regulation minutes x pct/100, for `'periods'` n x `periodMinutes`, both
   rounded up to a whole stint (choice 3) and held to regulation.
   `leagueMinFor(g, arrivedAt)` scales it by the regulation minutes from the
   start of stint `arrivedAt` over regulation minutes, rounded up the same way
   and held to those minutes. A small text helper gives the rule sentence.
3. `computeAll` composes `leagueMinFor(g, g.live?.arrived?.[id])` per player
   (own minimum higher wins, cap lower wins) and puts the per-game value in the
   cache signature. `sayTheLeagueMinimum` gets the per-player league number.
4. `resolveRest` uses `leagueMinFor(g, arrived[id])` for each kid in
   `lateArrivals`, and the whole-game value for everyone else.
5. The `MIN_CLAMPED` note (choice 7), computed from the plan and `g.live` in
   `computeAll`'s tally, beside `notePins`, replacing its earlier copies on
   the cached plan the same way.
6. Settings: `<select id="minUnit" class="prow-select">` beside `#minMins`,
   options `min`, `% of game`, `periods`; the number box's `max` follows the
   unit; the input is labeled "How much everyone plays at least" and the select
   "Counted in". Help text explains the share, and that a late arrival is owed
   the same share of the time left.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `computeAll` / `setAvailable` on a fixture team | `node --test`, new `test/league-share.test.js` importing `state.js` through `test/state-fixture.js` | A, B, C, D, E, F, G, I, J |
| `sanitizeSettings` | `node --test`, `test/storage.test.js` | H |
| Coach scenario: Settings, then the game's Plan sheet, after a reopen | `test/coach.js` driver, a scenario file | K |
| Probe re-run | scratch `probe.mjs` by the orchestrator | L |
| `npm run evals` | orchestrator | M |
| `scripts/look.mjs` + smoke | orchestrator / quality reviewer | N |

## Out of scope

- A coach's per-player Plays at least as a share (the issue keeps it
  whole-game).
- A late kid catching up toward a whole-game share (spec 247 decision 4).
- Per-game overrides of the league minimum.
- Any change to the card.
