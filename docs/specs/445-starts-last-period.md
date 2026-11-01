# #445 — Rename "Last-period five" to "Starts the last period"

## Issue

#445 (child of #453). The rule named "Last-period five" only puts the five on
for the first stint of the last period, but every coach-facing name and
help line says they finish the game. Rename it everywhere a coach reads it.

## Goal

A coach reading the rule's name or help knows the five start the last period,
not that they are on at the end, and is pointed to Closers for that.

## Lane

Full lane. Step 1's estimate is about 27 changed lines outside test/ and
docs/ (copy in three pages, a label, a message, comments that carry the old
name), over the small lane's 20.

## Survey (origin/main at a52cc05)

Every claim in the issue holds; line numbers match. The rule row sentence
(`ruleItems`, state.js ~340) already reads "... start the last period", and
spec 148 already says "start". The Rule edit page has no kind label (title is
"Rule"), so the kind chip in Add a rule is the one place the label shows,
plus the help, about, advanced and the FORCED_OVER_CAP re-plan toast.


The issue (`gh issue view 445`) is the spec. Its acceptance values stand in for
"What would settle it". Decided by the owner: the new name is exactly
**Starts the last period**. Stored data stays compatible: the rule kind key
`lastq` and the `lastPeriodFive` field do NOT change. Engine behavior does not
change (it already pins only the first stint of the last period).

## What would settle it, and Proof (the seam for each)

1. The Add a rule picker shows a kind chip named exactly "Starts the last
   period", and no chip named "Last-period five".
   Seam: Coach scenario in `test/rules-scenarios.test.js` (driven through
   `test/coach.js`): open the Hawks plan, tap "Add a rule", tap
   "Starts the last period", pick five players, "Add rule", Close.
2. A team saved with a `lastq` rule loads and shows the rule, with the same
   five. Seam: the same scenario continues with `coach.comeBackDaysLater(0)`,
   reopens the Rules sheet, and asserts the rule row reads
   "<the five names> start the last period" (the existing `ruleItems`
   sentence in state.js; it already says "start") and the plan's first stint
   of Q4 is those five (`coach.planStints()` / `floorEachStint()`, stint 7 of 8
   in RICH's 4x8 every 4).
3. No coach-facing page or message contains "Last-period five".
   Seam: the existing guard `test/one-name.test.js` (#149), extended: add
   **Starts the last period** to `CONTEXT.md` as the glossary term (replacing
   the "Last-period five" entry; `_In code_: lastPeriodFive`, key `lastq`),
   with `_Avoid_: last-period five, finishing five, closing five`, and add
   'Starts the last period' to `TERMS` in one-name.test.js. If an avoid word
   is legitimately used elsewhere (e.g. engine.js uses "closing five" for the
   Closers group in FORCED_GROUP_KEEPON), drop it in `DROPS` with a reason, as
   the file already does. Watch this guard fail on today's tree first
   (/new-guard: a guard that has never failed proves nothing).
4. The help text for the rule points to Closers for "on at the end", and says
   overtime is not the last period. Seam: `test/rule-words.test.js` help
   section checks (dt labels from KINDS) plus a small assertion that the
   help `<dd>` for this rule mentions "Closers".
5. Existing rule-name tests (`test/rule-names.test.js`, `test/one-name.test.js`,
   `test/rule-words.test.js`, `test/glossary.js` users, feature-keys tests)
   and the smoke scripts pass with the new name.

## Surfaces (re-grep: `git grep -n -i -E "last.period five"`)

- `app/rules.js` KINDS: `['lastq', 'Starts the last period']`.
- `app/index.html` help (~1860): `<dt>Starting five / Starts the last period</dt>`,
  dd along the lines of: "Names who is on the floor at tip-off, or who is on
  for the first stint of the last period. Overtime is not the last period. To
  keep a group on until the end, use Closers."
- `app/advanced.html` ~575: replace "The last period five — who is out there at
  the end. Set both and you have bracketed the game..." with
  `<b>Starts the last period</b>` — who is on when the last period begins (its
  first stint only; overtime does not count). To keep a group on at the end,
  use Closers.
- `app/about.html` ~1047: "Starting five and Starts the last period — who is
  out there at tip-off, and who is on when the last period begins." (it must
  not say "who finishes").
- `app/gamemode.js` SIT_RULES.FORCED_OVER_CAP: must contain the KINDS label
  (test/rule-words.test.js checks the cap label is in it): e.g.
  "a Plays at most maximum will not cover the Starts the last period rule".
- `scripts/feature-keys.mjs` 128-139: comment and `rule:lastq` terms per
  surface ('starts the last period' wherever the page now uses it).
- `scripts/smoke/plan-sheet.mjs:375, :485`, `scripts/smoke/rule-edit.mjs:237`.
- Code comments with the old name so a grep finds one name: `app/app.css`
  (~3275; also check whether "Starts the last period" is now the longest
  label in that group and fix the comment's claim), `app/state.js:275, :295`,
  `app/engine.js:86, :273` (comments only), test names in
  `test/engine.test.js:1220`, `test/game-pass.test.js:66`,
  `test/plan-sheet.test.js:45, :166`, comment in `test/rule-words.test.js:10`.
- Do NOT touch docs/ (doc-writer does docs) except CONTEXT.md as above.

## Constraints

- engine.js, budget.js, storage.js, roster.js are pure: comments only there.
- American spelling. No "pinned" in coach copy. Never quote the owner.

## Out of scope

- Renaming the `lastq` key or the `lastPeriodFive` field (stored data).
- Changing what the rule does (engine behavior).
- Engine warning sentences that say "the last period" (they name the period,
  not the rule).
