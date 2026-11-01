# 441 — Sits at most N in a row, and Plays at most N in a row

## Issue

#441: add a rule that limits how long a kid sits in a row ("Sits at most N in
a row", `maxBench`), and rename the Rest limit to "Plays at most N in a row",
because the old name sounds like a bench limit and is not one.

## Goal

A coach whose league says "no more than two half-quarters on the bench in a
row" can set exactly that, and the plan holds it without changing anyone's
total minutes. When the roster or the change limit makes it impossible, one
line up front says so with the numbers. The old Rest limit reads as what it
is, "Plays at most N in a row", everywhere a coach looks, and a team saved
with it loads under the new name.

## Survey

The issue's claims hold on `46bc43d`:

- `KINDS` (`app/rules.js`) has eight kinds; the only run rule is
  `['rest', 'Rest limit']`, stored as `maxConsecutive` (most stints on the
  floor in a row). Its picker row reads "Stints in a row", no help. The
  sentence is "Nobody plays more than N stints in a row" (`ruleItems`,
  `app/state.js`). Help: `app/index.html` `<dt>Rest limit</dt>`,
  `app/about.html` and `app/advanced.html` `<b>Rest limit</b>` plus a mock
  rule row each.
- Nothing limits a bench run: `cost()` charges a flat 30 per stint sat after
  the first in a row; greedy adds +8/+30 to a sitter's score.
- Repro through `generatePlan` (scratch script), 4x8 perPeriod 2, seeds 1-20:
  12 players with Rest limit 2, 20/20 plans have a 3+ stint sit, seed 1
  longest sits `3 2 3 2 3 2 2 2 3 5 2 2` (matches the issue exactly); 12
  players with no rule, 20/20; 9 players, 10/20.
- `DEFAULT_MAX_SUBS` is 3 and Settings allows 1-5. With 12 players (7 sit)
  and Sits at most 2, entries over any 2 breaks must cover the 7 who sat, so
  3 changes a break cannot hold it (2 x 3 = 6 < 7). The default game in
  acceptance item 1 is therefore one where the up-front line fires and the
  rule is still held by going over the change limit (a soft preference, 40
  per extra change, against 400 per stint over the bench limit).
- `streakBefore` (#442) is the floor run at the cut; there is no bench run at
  the cut today.

Choices the issue did not make (closest to its intent):

1. **Kind key `bench`, stored as `maxBench`, 1-4 stints, default 2** — the
   same range and default as the Rest limit's picker.
2. **Labels keep a literal N**: the chips and help `<dt>`s read exactly
   "Plays at most N in a row" and "Sits at most N in a row", as the issue
   writes them. The rule's sentence puts the number in:
   "Everyone plays at most 2 stints in a row (8 min)" and
   "Everyone sits at most 2 stints in a row (8 min)" ("1 stint" singular).
   "Everyone ..." matches the league minimum's sentence.
3. **Minutes** are the most minutes in N stints in a row of the game's own
   stints (`buildStints` of the game's format and stint choice). All stints
   equal: "(8 min)". Unequal: "(up to 9 min)". One helper in `state.js`
   answers this for both the sentence and the picker hint.
4. **The picker shows the minutes too**: under the stepper, one line that
   updates as it steps, "2 stints in a row is 8 min." ("up to 9 min" when
   unequal). The Sits at most picker adds a second line: "With 10 players,
   Sits at most 1 in a row is Platoon." Both lines on both kinds' Add a rule
   page and edit page (both build from `kindControls`).
5. **Scoring** mirrors `maxConsecutive` exactly: `over * over * 400`, which is
   400 for one stint over. "Like maxConsecutive" and "400 per stint over" agree
   at one stint; the squared form is what the Rest limit does.
6. **Two up-front lines, said once each, and what each suppresses:**
   - `BENCH_TOO_FEW` — the rule truly cannot hold: every kid needs at least
     `X = ceil((S - m) / (m + 1))` stints on (S stints, m the limit), and
     `n * X > 5 * S`. It suppresses the after-the-fact `BENCH_EXCEEDED`, as
     `CONSEC_TOO_FEW` suppresses `CONSEC_EXCEEDED`.
   - `BENCH_SUBS` — the change limit cannot hold beside it: `S > m`,
     `maxSubs * m < n - 5`. The plan still holds the bench limit by changing
     more at once, so this line replaces `SUBS_EXCEEDED` (said once) and does
     not suppress `BENCH_EXCEEDED`. Skipped for Platoon (alternating fives is
     the strategy, the same exemption `SUBS_EXCEEDED` has).
   - Only one of the two is said: `BENCH_TOO_FEW` wins. Neither is said with
     5 or fewer available (nobody sits).
7. **Messages name the rule by its name with the number in**, for both rules,
   replacing "a Rest limit of 2" / "the Rest limit":
   "Plays at most 2 in a row", "Sits at most 2 in a row".
8. **Bench run at the cut** (`sitBefore`, the sibling of `streakBefore`) is
   read only when `maxBench` is on, so a plan without the rule is
   byte-identical whether or not a caller passes it. A kid who walked in late
   (`lateArrivals`) counts only stints after they arrived.
9. **Pinned overtime fives** (Keep this five / Strongest five) win over Sits
   at most, as they do over the Rest limit (#442, #440). Not checked.

## What would settle it

Tests red on `46bc43d`, green after. "4x8 pp2" = 4 periods of 8, perPeriod 2
(eight 4-minute stints); players `p0..p(n-1)`.

1. 4x8 pp2, 12 players, `maxBench: 2`, default `maxSubs` (3), seeds 1-20:
   for every kid the longest bench run is at most 2 stints, or the plan's
   issues hold a `BENCH_EXCEEDED` warning whose `playerIds` name that kid.
   Same with `maxSubs: 5`.
2. 4x8 pp2, 12 players, `maxBench: 1`, `maxSubs: 3`: exactly one up-front
   bench warning (`BENCH_TOO_FEW` or `BENCH_SUBS`), its message names the
   player count, the limit and the numbers that do not fit; no
   `SUBS_EXCEEDED`. With 11 players, `maxBench: 1`: `BENCH_TOO_FEW`
   (11 x 4 = 44 > 40), message "With 11 players, Sits at most 1 in a row
   cannot hold: everyone needs 4 stints on, 44 in all, and the game has 40.
   Try a limit of 2." With 12 players, `maxBench: 2`, `maxSubs: 3`:
   `BENCH_SUBS`, message "With 12 players and 3 changes at a time, Sits at
   most 2 in a row needs 4 changes at some breaks. Allow 4 changes at a time,
   or try a limit of 3." (the suggested limit is `ceil((n - 5) / maxSubs)`,
   or "turn it off" wording when that is not below S). 10 players,
   `maxBench: 2`, `maxSubs: 3`: no bench warning.
3. 4x8 pp2, 9, 11 and 12 players, `maxBench: 2`, `maxSubs: 5`, seeds 1-20:
   every kid's total minutes with the rule are within 4 (one stint) of the
   same seed without it.
4. `streakBefore` analog: `sitBefore: { p0: 2 }`, `maxBench: 2`, 12 players:
   p0 is on the floor in the first stint, seeds 1-8. Without `maxBench`, a
   plan with and without `sitBefore` is identical (deep-equal), and a plan
   with `maxBench: 0` equals one with no `maxBench` key.
5. Re-plan (`state.js` seam, as `test/rest-limit-replan.test.js` does): 12
   players, Sits at most 2, 4x8 every 4, seeds 1-8, `resolveRest` from every
   stint k in 1..n-1: each kid's longest bench run over played stints
   `0..k-1` followed by the re-plan's stints is at most 2, or the re-plan
   carries `BENCH_EXCEEDED` naming the kid. A run wholly inside the played
   stints is not the re-plan's.
6. Coach scenario (`test/coach.js`): the Add a rule page offers chips
   "Plays at most N in a row" and "Sits at most N in a row" and no "Rest
   limit"; adding Sits at most with the stepper at 2 on a 4x8 every-4 game
   shows the rule row "Everyone sits at most 2 stints in a row (8 min)" and
   it survives a reopen. A team saved with `maxConsecutive: 2` loads and its
   rule row reads "Everyone plays at most 2 stints in a row (8 min)".
7. Storage: `maxBench` round-trips through `sanitizeTeam` (clamped like
   `maxConsecutive`, 0-20), and a record without it loads as 0.
8. No "Rest limit" survives in app copy: CONTEXT.md's entry becomes
   **Plays at most N in a row** with `_Avoid_: rest limit, ...`, and
   `test/one-name.test.js` lists it, so the scan fails if the old name comes
   back. The help sheet's `<dt>`s still pass `rule-words.test.js` (each is a
   `KINDS` label), and `test/feature-coverage.test.js` pins `rule:rest` and
   a new `rule:bench` on `#help`, `about.html` and `advanced.html`, with no
   collision against the cap's "Plays at most".
9. `test/engine.test.js` and `test/fuzz.test.js` stay green (message
   assertions updated to the new name only).

## Surfaces

- `app/engine.js`: `normalize` (`maxBench`), `ctx.maxBench`, `ctx.sitLeadOf`,
  greedy, `repairChurn`'s must-stay set, `cost()`, `finish()`
  (`BENCH_EXCEEDED`, `SUBS_EXCEEDED` attribution and suppression),
  `analyzeFeasibility` (`BENCH_TOO_FEW`, `BENCH_SUBS`), Rest limit message
  wording.
- `app/state.js`: `ruleCount`, `ruleItems` (both sentences), `removeRule`,
  `replaceRule`, `ruleComplete`, the run-minutes helper, `resolveRest`
  (`sitBefore`).
- `app/rules.js`: `KINDS`, `kindControls` (stepper and hint lines),
  `renderKindBody` ("Replaces the one you have."), `commitAddRule`,
  `draftFrom`, chip default `n`.
- `app/team-ops.js` `emptyConstraints`, `app/storage.js` sanitize: the new
  field only (storage is a pure module; this task is explicitly about a new
  stored field and changes nothing else in it).
- Copy: `app/index.html` (help `<dt>`s and the JSON-LD "rest limits"),
  `app/about.html`, `app/advanced.html` (list items and mock rule row text
  only — another lane is moving these pages' CSS; touch text only). About's
  dateline moves (`npm run check:history`).
- Guards and harness: `scripts/feature-keys.mjs`, `test/one-name.test.js`
  TERMS, `scripts/smoke/plan-sheet.mjs` and `scripts/smoke/sheet-spacing.mjs`
  label lists, `test/rule-words.test.js` comment.
- Docs (doc-writer): `CONTEXT.md`, `docs/design-decisions.md`, `README.md`.
- Must not change: `budget.js`, `roster.js`; stored keys `rest` /
  `maxConsecutive`; existing specs under `docs/specs/` (records); `notes/`.

## Constraints

- `engine.js` is pure: with no `maxBench`, every plan is byte-identical to
  today (existing engine suite and item 4).
- One place counts a run: extend `runEndingAt` / `longestRun` (an `on`
  flag or a sibling built from them) for bench runs; do not write a second
  run counter in `state.js` beyond building `sitBefore` at the cut, the way
  #442 builds `streakBefore`.
- Reuse `effectiveStints` for what was played, never `p.stints`.
- Keep #442 (`streakBefore`), #444 (`lastPeriodAhead`) and #440
  (`PIN_BREAKS_RULE`, overtime pins) behavior as is.
- Reuse `stepperRow`, `kindControls`, `pgrp-f`; no new CSS unless the look
  check needs it.
- Coach copy: American spelling, no banned #136 words, the privacy phrasing
  untouched. Names appear exactly as the `KINDS` labels.
- Mobile first: the chips, stepper, hint lines and rule rows at 320 and 390
  wide, 16 and 32px text, long names, sheet scrolled to the bottom, no
  clipping.

## Design

Engine:

- `normalize`: `maxBench: c.maxBench > 0 ? c.maxBench : 0`.
- `ctx.maxBench`, `ctx.sitLeadOf = id => ctx.maxBench ? input.sitBefore?.[id] || 0 : 0`.
- Greedy: a separate bench counter seeded with `sitLeadOf` (do not change
  the existing `sitStreak` scoring). After the forced pins, a kid whose bench
  run has reached `maxBench` goes in now if `legalWith` allows. `repairChurn`
  must not swap such a kid back out (add them to the set it treats as
  forced).
- `cost()`: `longestSit - maxBench`, `over * over * 400`.
- `finish()`: `BENCH_EXCEEDED` per kid, "{name} sits {run} stints in a row
  against a limit of {m} — no legal lineup kept them under it.", skipped when
  `BENCH_TOO_FEW` was said. `SUBS_EXCEEDED` is skipped when `BENCH_SUBS` was
  said; otherwise a break is "forced" when either rule forced it (kids coming
  on at their bench limit, or off at their floor limit, more than
  `maxSubs`), and the reason names the rule that forced it:
  "— Sits at most 2 in a row makes more than 3 come on at once." /
  "— Plays at most 2 in a row makes more than 3 come off at once."
- Rest limit messages, new wording:
  `CONSEC_IMPOSSIBLE` "With only 5 available, nobody can be rested — the
  Plays at most N in a row rule will be ignored.";
  `CONSEC_TOO_FEW` "With 7 players, Plays at most 1 in a row cannot hold: it
  needs 10 players. Try a limit of 3." / "... Turn off Plays at most N in a
  row or add players.";
  `CONSEC_MIN_CONFLICT` "... more than Plays at most 2 in a row allows (24
  minutes at most), ...".

State: `resolveRest` builds `sitBefore` over the same `lead` list it builds
`streakBefore` from (played stints plus leading pinned fives), only non-zero
entries, late arrivals counted from arrival; passes both.

UI: `['bench', 'Sits at most N in a row']` after
`['rest', 'Plays at most N in a row']`; stepper "Stints in a row", 1-4; the
hint lines in choice 4; storage as in item 7.

## Proof

- `node --test` on `generatePlan` (many input cases), a new
  `test/sits-at-most.test.js`: items 1-4; `test/engine.test.js` message
  updates: item 9.
- `node --test` through `state.js` (`resolveRest`), beside
  `test/rest-limit-replan.test.js`: item 5; `ruleItems` sentences and the
  minutes helper with equal and unequal stints.
- Coach scenario in `test/rules-scenarios.test.js`: item 6.
- `test/storage.test.js` (or the sanitize suite already there): item 7.
- Guards under `/new-guard`, each falsified once by putting "Rest limit"
  back: `test/one-name.test.js` TERMS, `scripts/feature-keys.mjs` keys
  (item 8). `rule-words.test.js` already reads labels from `KINDS`.
- Smoke: `plan-sheet.mjs` and `sheet-spacing.mjs` find the kinds by their new
  labels; the 32px pass covers the Add a rule sheet. Look check at 320/390,
  16/32px with long names on the Add a rule page (both run kinds) and the
  rule list.

## Out of scope

- Fuzzing `maxBench` in `test/fuzz.test.js` (it stays green unchanged).
- Pinned overtime fives breaking Sits at most (the pin wins).
- Changes across the cut itself (`maxSubs` between the last played stint and
  the first re-planned one), as #442.
- A per-player bench limit.
