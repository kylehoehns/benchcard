# 439: A Rest limit that cannot hold is caught up front

## Issue

#439 (child of #453). A Rest limit that cannot hold with the players present
is not caught before the search, so the coach gets one `CONSEC_EXCEEDED` per
kid, and `SUBS_EXCEEDED` blames minutes when the Rest limit forced the changes.

## Goal

A coach who sets a Rest limit their roster cannot meet reads one line that
says so, with the number of players it needs and a limit that would work,
instead of a wall of per-kid warnings. A minimum that the limit makes
impossible is named as the cause. When the limit is what makes five change at
once, the subs warning says so. When the limit cannot hold, the plan shortens
the worst run first.

## What would settle it

Tests through `generatePlan` (4x8, sub every 4 minutes, so 8 equal stints;
seed 1 unless noted), each red on `a52cc05`:

1. Rest 1 with 8 players, Rest 2 with 7, Rest 3 with 6: exactly one up-front
   warning (code `CONSEC_TOO_FEW`) whose message names the number of players
   the limit needs (10, 8 and 7 respectively), and zero `CONSEC_EXCEEDED`.
2. Rest 2 with 8 players and Rest 3 with 7: no `CONSEC_TOO_FEW`.
3. Rest 1 with 6 players, seeds 1 to 10: every player's longest run is 5
   stints or fewer.
4. Rest 1 with 10 players and a Starting five (`openingFive` p0-p4):
   `SUBS_EXCEEDED` is present and its message names the Rest limit, and does
   not say "cost somebody minutes".
5. Minimum 28 for one player plus Rest 2, 10 players: an up-front warning
   (code `CONSEC_MIN_CONFLICT`) naming that player and their 28-minute
   minimum, and no `CONSEC_EXCEEDED` for that player.
6. `test/engine.test.js` and `test/fuzz.test.js` stay green. The fuzz check
   "ran past the limit with no warning" now accepts the up-front line
   (`CONSEC_TOO_FEW`, `CONSEC_IMPOSSIBLE`, or `CONSEC_MIN_CONFLICT` for that
   player) in place of `CONSEC_EXCEEDED`, since the issue asks for exactly that
   swap.

Survey on `a52cc05` confirmed every repro in the issue: 8 / 4+subs / 0+subs
`CONSEC_EXCEEDED` for Rest 1 at 8 / 9 / 10 players; Rest 1 with 6 players worst
runs `7 6 5 6 6 6 6 6 5 7`; min 28 + Rest 2 blames "no legal lineup". Squaring
the overrun alone took the 6-player worst runs to `5` on all ten seeds.

## Surfaces

- `app/engine.js`: `analyzeFeasibility`, `cost`, `finish`.
- `test/engine.test.js`, `test/fuzz.test.js`.
- `docs/design-decisions.md` (doc-writer).
- Must not change: `app/rules.js`, `app/state.js`, the rule's internal name
  `maxConsecutive` and its label "Rest limit" (#441 renames it later),
  `CONSEC_IMPOSSIBLE`'s message (pinned by an existing test).

## Constraints

- `engine.js` is one of the four pure modules: behavior changes only where this
  spec says. Every other plan must come out byte-identical where no Rest limit
  is set (the cost change is inside `if (ctx.maxConsecutive)`).
- `docs/design-decisions.md`: infeasibility is arithmetic, checked before any
  search, and the message names the constraint and the numbers.
- New messages are coach copy: name the rule by its `KINDS` label "Rest limit",
  and avoid `test/rule-words.test.js`'s banned words (`cap`, `floor(s)`,
  `pinned`, ` -- `, ...). American spelling. End with a full stop.
- Reuse `longestRun`, `fmtMinutes`, `label`, `warn` as they are. Do not add a
  second solve to find out what the limit costs.

## Design

**Window arithmetic.** The issue's "exact form" (`n * (S - floor(S/(r+1)))
< 5 * S`) is wrong: it calls Rest 2 with 7 players possible (7 x 6 = 42 >= 40),
but the issue's own acceptance wants a warning there, and it is right to. Any
`r+1` stints in a row must hold a sit for every player, and those stints have
only `(r+1) * (n-5)` bench seats. So when there are at least `r+1` stints, the
limit can hold only if `(r+1) * (n-5) >= n`, which is the issue's
`5/n <= r/(r+1)`. It is also enough: benching players in turn, `n-5` per
stint, gives nobody a run longer than `r`. Players needed:
`ceil(5*(r+1)/r)` (10, 8, 7, 7 for Rest 1, 2, 3, 4). Suggested limit, the
smallest that holds with `n` players: `ceil(5/(n-5))`. No stint lengths enter
it; seats are per stint. With fewer than `r+1` stints the limit cannot bind
and nothing is checked.

**`analyzeFeasibility`**, inside `if (c.maxConsecutive)`:

- `n <= 5`: keep `CONSEC_IMPOSSIBLE` exactly as it is.
- else if `stints >= r+1` and `(r+1) * (n-5) < n`: `warn('CONSEC_TOO_FEW', ...)`, `playerIds`
  empty. Message shape, for example: "With 8 players, a Rest limit of 1 stint
  in a row cannot hold: it needs 10 players. Try a limit of 2."
- for each available player with a minimum: the most minutes they can play
  under the limit is computed exactly over the stint lengths (a small DP: pick
  stints, no run longer than `r`, maximize minutes; handles unequal stints).
  If the minimum is above it, `warn('CONSEC_MIN_CONFLICT', ...)` naming the
  player, the minimum and the most the limit allows, for example: "A's
  28-minute minimum needs more than a Rest limit of 2 allows (24 minutes at
  most), so they will play longer runs. Lower one of the two." The minimum
  still wins over the limit, as today (cost 1000 a minute short).

**`cost`**: the overrun term becomes `over * over * 400` per player, so one
long run costs more than the same overrun spread out.

**`finish`**:

- `CONSEC_EXCEEDED` is skipped entirely when `CONSEC_TOO_FEW` or
  `CONSEC_IMPOSSIBLE` is among the issues, and skipped for a player named by
  `CONSEC_MIN_CONFLICT`.
- `SUBS_EXCEEDED`: at each break `i` that goes over, count the players in
  lineup `i-1` whose run ending there has reached the limit. They must come
  off, so if that count is above `maxSubs` the limit forced the break. If every
  over-number break was forced, the reason clause names the Rest limit (for
  example "— a Rest limit of 1 makes that many come off together.") instead of
  "holding to your number would have cost somebody minutes". Otherwise the
  existing reason stays.

## Proof

- `node --test test/engine.test.js`: items 1-5, through `generatePlan`, each
  seen red before the code.
- `node --test test/fuzz.test.js`: item 6.
- `npm test` green, CI smoke green. No coach-visible layout changes (new
  warning lines use the existing issue list), so the preview check reads the
  warning text on a real plan.

## Choices the issue left open

- The up-front test uses the window bound above, not the issue's "exact
  form", which disagrees with the issue's own acceptance for Rest 2 with 7.
- New codes `CONSEC_TOO_FEW` and `CONSEC_MIN_CONFLICT` rather than reusing
  `CONSEC_IMPOSSIBLE`, whose message an existing test pins exactly.
- The minimum check uses exact minutes (a DP over stint lengths) rather than a
  stint count, so it holds for unequal stints too.
- `SUBS_EXCEEDED` names the Rest limit only when the limit forced every
  over-number break; the test for "forced" is the count of players who hit
  the limit at that break.
- `docs/design-decisions.md` has no Rest limit section today; the doc-writer
  adds the up-front check and the numbers next to the existing
  consecutive-stint bullet.

## Out of scope

- Minute evenness under an impossible limit at 4x8 every 3 (spread 4 with 7
  players, Rest 1). Squaring the cost did not change it; not in the acceptance.
- Runs carried in from before a mid-game re-plan (#442).
- Renaming the rule (#441).
