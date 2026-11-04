# 566 — League rules live together in Settings

## Issue

#566 (part of #561, the ease-of-use pass): one Settings group, **League
rules**, holds Everyone plays at least, Everyone plays in, Plays at most … in a
row and Sits at most … in a row. The two "in a row" rules become team values
that each new game starts from; a game can still change its own number (#447)
without touching the team value. The minimum gets a live line saying what it
comes to, its units are renamed, the plays-in row's detail gets its own text,
and the two "in a row" kinds leave Add a rule. A storage migration gives each
team a value from its saved games.

## Goal

A coach finds every league rule in one place in Settings, reads what the
minimum means in this game in plain words, and turns on a bench limit once for
the whole team. Games keep showing the rules as rows, and a game's own change
stays with that game. Nothing a coach saved plans differently.

## Survey (on `6e3db04`)

- The two rules are game fields only: `g.constraints.maxConsecutive` and
  `g.constraints.maxBench` (0 = off; `app/team-ops.js` `emptyConstraints`;
  cleaned by `sanitizeTeam` in `app/storage.js` to 0–20). The engine reads
  them from the game (`app/state.js` ~1808, ~1835, ~2885, ~2955). Both count
  stints in a row (whole periods under Breaks only), so the same number means
  different minutes in different formats.
- They are added through Add a rule (`KINDS` in `app/rules.js`, kinds `rest`
  and `bench`), edited from the rule's detail page (`replaceRule` draft,
  `kindControls`: stepper from 1 to `min(restLimitMax(g), 4)` (`runTop`) for rest and 4 for bench,
  starting at 2, value shown as minutes with Shorter / Longer buttons), and
  removed from the detail page (`removeRule`). `RULE_KEYS` includes both, so
  `newGame` copies them from the previous game, and Copy rules copies them.
- Add a game always clones the day's (or team's) last game (`freshDraft`,
  `app/teams-view.js`), so today a new game inherits the last game's in-a-row
  values. There is no team value.
- The minimum and plays-in are already team settings (`settings.minMinutes`,
  `minUnit`, `playsIn`), read live by every game, never stored on a game.
  Settings shows them in one `.pgrp` under "This team" (`app/index.html`
  ~1430): a number field `#minMins`, a unit select `#minUnit` (min, % of game,
  periods, full periods), and the `#playsInSeg` segment.
- The minimum's sentence is `leagueRuleText` (`app/state.js`): "2 periods
  (16 min)", "1 full period (8 min)".
- The plays-in row on a game is `removable: false`, so `openRuleDetail`
  (`app/rules.js`) gives it the minimum's text, "Your league minimum. Change it
  in Settings." That is the bug item 6 names.
- `fmt()` (`app/teams-view.js`, #567) is the precedent for a Settings change
  reaching games: the open day's games that have not started take it at once;
  started games, filed games and other days keep theirs.
- `scripts/feature-keys.mjs` sources `rule:rest` and `rule:bench` from `KINDS`.
- The strategy skip lines (`app/strategy.js` `SKIPS`, `leagueClause`) say
  "full periods".

## Choices the issue left open (decided here)

1. **Only the two "in a row" rules gain a per-game value.** The minimum and
   plays-in stay team-wide and read live, as now. The issue's per-game rows
   and #447 are about the in-a-row rules; keeping the other two as they are is
   what keeps every saved plan identical.
2. **Team values**: new settings `maxConsecutive` and `maxBench`, integers
   0–20, 0 = off, default 0 (`DEFAULT_SETTINGS`). The game keeps its own
   `constraints.maxConsecutive` / `maxBench`; the engine is untouched.
3. **A new game takes the team values**, even when it clones the last game
   (`newGame` sets both from `settings` after the clone). A game's own change
   is for that game and is not carried to the next one. Copy rules (copying
   from a chosen game) still copies them: that is an explicit copy.
4. **Changing a team value in Settings reaches the open day's games that have
   not started**, the same rule as #567's format fields. Started games, filed
   games and other days keep their own value. This overwrites a per-game change
   on those games; the coach just set a team-wide rule, so that is the intent.
5. **Migration** (`sanitizeTeam`, shape-driven, idempotent): when the saved
   settings carry a valid number for a key, it is kept (clamped 0–20). When
   they do not (every team saved before this change), the team value is the
   strictest across all its days' games: the smallest non-zero value, or 0 if
   no game has the rule. Filed season games hold no constraints, so they do
   not count. Games keep their own values unchanged. Computed after the games
   are cleaned and before the no-games fallback `newGame`, so that fallback
   game takes the derived value.
6. **Settings layout**: an `h3.pgrp-h` "League rules" inside the team section,
   then four `.pgrp` groups so each footnote sits under its own rule (W3):
   - **Everyone plays at least**: the number field and unit select as now,
     with the live line as its footnote (`aria-live="polite"`, written only
     when it changes).
   - **Everyone plays in**: the segment as now.
   - **Plays at most**: a switch row "Limit time on the floor in a row"; when
     on, a stepper row below it, starting at 2, from 1 to `min(restLimitMax(ref), 4)`.
     Footnote when on: "Applies to every player."
   - **Sits at most**: a switch row "Limit time on the bench in a row"; when
     on, a stepper row, starting at 2, from 1 to 4. Footnote when on:
     "Counts across quarter breaks. Applies to every player." (with the game's
     period word: "Counts across halftime." in a 2-period game, "period
     breaks" in any other count but 4), followed by `benchPlatoonHint` when it
     applies.
   The stepper rows are the same control the rule's detail page uses (one
   shared builder, not a copy): label `runRowLabel(ref)`, value
   `runMinutesText(ref, n)` (the period count under Breaks only), buttons
   Shorter / Longer. Turning a switch off sets the value to 0; turning it on
   sets 2 (clamped to the top). `ref` is the open game, or a game built from
   the team's format when there is none.
7. **The live line** under the minimum, hidden when the amount is 0:
   - min, %, quarters of time: `= 16 min in a 4 × 8 game, any time`
     (`leagueMinFor(ref)`, and `ref`'s periods × period minutes).
   - whole quarters: `= 2 whole quarters (16 min)`, the count capped at the
     game's periods.
8. **Unit names** (saved values `periods` / `full` unchanged): the select
   reads "min", "% of game", "quarters of time", "whole quarters", using
   `ref`'s period word ("halves of time" / "whole halves" in a 2-period game,
   "periods of time" / "whole periods" otherwise). The rule's sentence on a
   game follows: "2 quarters of time (16 min)", "1 whole quarter (8 min)".
   The skip line's "full periods" becomes "whole quarters" with the game's
   own period word.
9. **Plays-in detail**: "Every player plays in every quarter. It's your
   league rule. Change it in Settings." (`playsInText(g)` gives "each half" /
   "every quarter" / "every half" / "every period"). The minimum keeps "Your
   league minimum. Change it in Settings."
10. **In-a-row rows on a game** stay editable and removable from the detail
    page, as now. The detail page adds the line "Changes this game only. Your
    team's rule is in Settings." Removing the row sets that game's value to 0;
    the team value stays.
11. **Add a rule** loses the `rest` and `bench` kinds. `kindControls` keeps
    their stepper for the detail page's edit. `#568`'s grouping is not started.
12. **How it works** (`#help`): the two "… N in a row" entries become one
    League rules entry describing the four rules, where they are set, and that
    a game can change its own in-a-row number. "Full periods" becomes "Whole
    quarters".
13. **What's new**: one entry, plain words (see ship-feature's rule).

## What would settle it

1. **Migration** (`node --test`, `sanitizeTeam`): for each saved shape:
   - no games with either rule → both team values 0;
   - one game with Plays at most 3 → team 3, game 3;
   - games with Sits at most 3 and 2 across two days → team 2; each game
     keeps its own (3 and 2);
   - a game with the rule and a game without → team takes the non-zero value,
     the game without stays 0;
   - both rules on different games → each key derived on its own;
   - saved settings already holding `maxBench: 4` while games hold 2 → kept 4;
   - junk team values (`-1`, `"x"`, `99`, `null`) → re-derived or clamped
     to 0–20 as the cleaner does for games;
   - no days at all → the fallback game takes the (0) team values;
   - running the cleaner twice gives the same team.
2. **Plans unchanged**: `test/league-566-fingerprint.test.js` keeps the hash
   `977cff93…044a` recorded on `6e3db04` before any edit (60 seeded teams, two
   days each, games with neither rule, one or both at 1–4, 2- and 4-period,
   Breaks only and every-N, all five strategies, overtime, every minimum unit
   and plays-in choice, loaded through `sanitizeTeam`). The hash also pins
   each game's own two values. The earlier fingerprints keep their hashes.
3. **New games** (`node --test` and Coach seam): with team values 3 and 2, a
   game added after a game whose own values are 1 and 0 opens with 3 and 2;
   the source game is unchanged.
4. **Per-game change** (Coach seam): changing a game's Sits at most from 2 to
   3 on its detail page leaves the team value 2 and the day's other game 2;
   removing a game's row leaves the team value on.
5. **Settings** (Coach seam, long names in the roster such as "Alexandria
   Montgomery-Okafor"):
   - one "League rules" heading; under it, in order, Everyone plays at least,
     Everyone plays in, Plays at most, Sits at most; no "N" anywhere;
   - Sits at most is off on a new team; switching it on shows the stepper at
     2, footnote "Counts across quarter breaks. Applies to every player."; the
     stepper stops at 1 and 4;
   - Plays at most on: stepper at 2, stops at `min(restLimitMax, 4)`;
   - switching either on or stepping it changes the open day's unstarted
     games and not a started game or another day's game; switching off sets
     them to 0.
6. **Live line** (`node --test` on the helper, Coach seam for one case), for
   a 4 × 8 and a 2 × 16 game:
   - min 12 → "= 12 min in a 4 × 8 game, any time";
   - 50% → "= 16 min in a 4 × 8 game, any time";
   - 2 quarters of time → "= 16 min in a 4 × 8 game, any time"; 1 half of
     time in 2 × 16 → "= 16 min in a 2 × 16 game, any time";
   - 2 whole quarters → "= 2 whole quarters (16 min)"; 1 whole half →
     "= 1 whole half (16 min)"; 0 → no line.
7. **Unit labels**: the select's four labels for a 4-period and a 2-period
   game; the rule sentence "2 quarters of time (16 min)" and "1 whole half
   (16 min)".
8. **Plays-in detail** shows "Every player plays in every quarter. It's your
   league rule. Change it in Settings." and not the minimum's text.
9. **Add a rule** lists no Plays at most / Sits at most kind.
10. **Must hold**: #441 Sits at most tests, #442 overtime counts toward Plays
    at most, #541 overtime does not count toward Sits at most, #447 per-game
    change — their existing tests stay green unchanged except for how they
    turn the rule on (no longer Add a rule).
11. **Look checks**: Settings scrolled to the League rules group with both
    in-a-row rules on, and a game's Plan sheet rule rows with both on and the
    detail page, long names, 320 and 390 wide, 16 and 32px text, scrolled to
    the bottom and at full height. No clipping or cramped wrapping.
12. **What's new**: entry added, page regenerated, sitemap lastmod moved.

## Surfaces

Change: `app/storage.js` (defaults, cleaner, migration), `app/state.js`
(`newGame`, `leagueRuleText`, a live-line helper, unit-label helper,
plays-in detail text, an apply-to-open-day helper), `app/rules.js` (`KINDS`,
`openRuleDetail`, shared stepper builder), `app/teams-view.js` (Settings
handlers and painter), `app/index.html` (Settings group, How it works),
`app/strategy.js` (skip line wording), `app/edit.js` if a new edit kind is
needed, `scripts/feature-keys.mjs`, smoke checks that add the two kinds
through Add a rule (`plan-sheet`, `rule-edit`, `clip-sweep`, others found by
grep), tests, `scripts/whats-new.json` + `app/whats-new.html` +
`app/sitemap.xml`, docs.

Must not change: `app/engine.js`, `app/budget.js`, `app/roster.js`; what
`computeAll` plans for any saved game.

## Constraints

- One reader for each team value (beside `leagueSetting` / `playsInSetting`
  in `state.js`); one writer that also applies it to the open day.
- The stepper is one builder shared by Settings and the detail page.
- Interface guidelines: `.pgrp-h`, `.pgrp`, one `.pgrp-f` per group (W3);
  a switch for on/off; 44px targets; nothing clipped at 320px / 32px.
- `storage.js` is pure; shape-driven migration, no version branch, idempotent.
- `docs/design-decisions.md` is at its 60000-byte limit: new decisions go in
  `docs/design-decisions-league-rules.md`, linked from it with one short line
  (replacing an older sentence if needed to stay under the limit).
- Coach copy in plain words, no "stint". Made-up names only (Avery, Blake,
  Casey, Drew, Emery, Finley, Gray, Harper, Indy).
- Do not lower `scripts/coverage.json`. Widen `bytesAbs` if needed and say so.

## Out of scope

- #568 (grouping Add a rule, Force together per pair).
- #565 (Add a game drops its strategy step), running in another lane.
- A per-game minimum or plays-in.
