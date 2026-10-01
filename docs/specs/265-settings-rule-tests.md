# #265 — Test the Settings policy controls and adding each rule kind

## Issue

#265: The Settings controls a coach uses to set team policy, and the Add a
rule commit for six of the seven rule kinds, never run in any test. The
coverage report from #259 lists them as uncovered. Drive each one and check
what it writes.

## Goal

Every Settings policy control and every rule kind's Add rule is exercised
once, in the browser, and checked by the state it writes and the text the
coach sees. The recorded line coverage for `app/` goes up, and the PR
re-records it.

## What the survey found

On `main` (cc2ad7f):

- **Uncovered lines this issue owns** (from the #259 per-line dump):
  - `app/teams-view.js` 136-141, 146, 152-156, 166-172, 181-187, 196-203:
    the handlers for `#maxSubsSeg`, `#tieBreakSeg`, `#seasonDefSeg`,
    `#minMins`, `#setPeriods` and `#setPerMins`;
  - `app/app.js` 60-63, 110, 113: `#themeSeg` and `#teamName`;
  - `app/rules.js` 113 (the Force Together switch), 519 and 527-534 (the
    `cap`, `together`, `apart`, `keepon`, `starts`, `lastq` and `rest` cases
    of `commitAddRule`). `minimum` is already committed by the `plansheet`
    row.
- **None of it runs under `node --test`.**
  - The handlers are closures wired by `initTeams` and at `app.js`'s top
    level. No test imports `app.js`.
  - `test/dom-stub.js`'s `querySelector` returns `null`, so `commitAddRule`'s
    `renderConstraints()` throws on `$('#constraints')`.
  - The rule text for every kind is already pinned in node by `ruleItems`
    tests (`test/plan-sheet.test.js`, `test/rule-edit.test.js`). The gap is
    the commit path, not the wording.
- **Defaults** (`DEFAULT_SETTINGS`, `app/storage.js:147`): `maxSubs: 3`,
  `tieBreak: 'behind'`, `minMinutes: 0`, `seasonDefault: false`,
  `periods: 4`, `periodMinutes: 8`.
- **Force Together** (`rules.js:112`): a `switch` checkbox in `#planPairs`,
  shown only when the game has a together pair. It sets
  `game().constraints.hardPairs` and calls `edit('pairs')`. The engine then
  charges each minute a pair spends apart at 400 instead of 25
  (`engine.js:1123`).
- **The league floor shows as a rule.** A non-zero `settings.minMinutes`
  adds a fixed row "Everyone plays at least N min" to the plan's Rules
  (`state.js:315`).
- **Rows that already stand on the right page:**
  - `settingslook` (`scripts/smoke/settings-look.mjs`, rich fixture) opens
    Settings and reads it.
  - `plansheet` (`scripts/smoke/plan-sheet.mjs`, rich fixture, Hawks) adds
    "Hana plays at least 14 min", then picks two tiles under Together
    (about line 435) and closes without committing.

## Decisions (made with the human)

1. **Scope.** Core coach flows, Settings and rule commits, and dead code are
   in, as four issues. Phone-only and timing-only branches are out.
2. **Split.** Four issues, built in parallel worktrees, merged one at a time.
   Each lane rebases on the last merge and re-records the coverage floor.
3. **Placement: node first, extend rows.** Anything importable under
   `test/dom-stub.js` gets a `node --test` test. Browser flows extend smoke
   rows that already have the page loaded. The PR reports the smoke time
   before and after. There is no hard cap.
4. **Bugs found.** A fix of about 20 lines of `app/` or fewer goes in this PR
   and is called out in the PR body. Anything bigger becomes its own issue.

## What would settle it

At 390×844, under the smoke clock, rich fixture. Each check reads the
team's settings (or `game().constraints`) from `state.js` and the page's
own text.

- **A. Subs per break.** Tap `#maxSubsSeg [data-subs="1"]`, then `"5"`.
  `settings.maxSubs` is 1, then 5. The tapped button is `.on` with
  `aria-pressed="true"` and the others are not. Tapping 5 again changes
  nothing. Restore 3.
- **B. Tie-break.** Tap `data-tie="levels"` ("Best players"):
  `settings.tieBreak === 'levels'`. Tap `"behind"` ("Furthest behind"): back
  to `'behind'`.
- **C. Season default.** Tap `data-sdef="1"` ("Evening out the season"):
  `settings.seasonDefault === true`, and the current game's own season
  setting is unchanged. Tap `"0"`: `false`.
- **D. League floor (`#minMins`).** Set the value and fire `change`:

  | Typed | `settings.minMinutes` | Field reads |
  | --- | --- | --- |
  | `12` | 12 | `12` |
  | `99` | 60 | `60` |
  | `-4` | 0 | `0` |
  | `12.6` | 13 | `13` |
  | blank | 0 | `0` |

  With 12 set, the plan's Rules show "Everyone plays at least 12 min".
  Restore 0.
- **E. Game format.** `#setPeriods`: `0` → 1, `9` → 8, blank → 4.
  `#setPerMins`: `0` → 1, `41` → 40, blank → 8. Each field reads back the
  number that took. The current game's `periods` and `periodMinutes` do not
  change. Restore 4 and 8.
- **F. Theme.** Tap `#themeSeg` `data-theme="dark"`, then `"light"`, then
  `"auto"`. `state.ui.theme` follows each tap. `<html data-theme>` is `dark`,
  then `light`, then whatever the page's color scheme resolves to.
- **G. Team name.** Type into `#teamName` (an `input` event).
  `state.teamName` matches, and the value survives a reload. Restore the
  fixture's name.
- **H. Each rule kind commits.** In `plansheet`, after the Together picks:
  tap Add rule, then add one rule of each remaining kind. After each, the
  sheet is back on "Plan" and `#constraints` has a row reading:
  - cap: "<name> plays at most N min"
  - together: "<a> and <b> together"
  - apart: "<a> and <b> apart"
  - keepon: "<a> or <b> is always on the floor"
  - starts: "<names> start the game"
  - lastq: "<names> start the last period"
  - rest: "Nobody plays more than 2 stints in a row"

  Names come from the picked tiles, as the row's minimum check does today.
  `game().constraints` holds the matching entry.
- **I. Force Together.** With the together pair added, `#planPairs` shows
  the "Force Together pairs every stint" switch, unchecked. Turn it on:
  `game().constraints.hardPairs === true`, the switch reads checked, and the
  plan still solves. Turn it off: `false`. Then the row restores Hawks to no
  rules, as it does today.
- **J. Coverage.** The full run's `app/ line coverage` row is green. The PR
  re-records `scripts/coverage.json` above the figure it rebased on, and
  states both numbers. Each line listed under the survey is covered.
- **K. Nothing else moves.** Every other smoke row keeps its result. The PR
  states the smoke time before and after.

## Surfaces

- **Changes:**
  - `scripts/smoke/settings-look.mjs`: A–G, after its current checks, each
    one restoring what it changed;
  - `scripts/smoke/plan-sheet.mjs`: H and I, in place of closing without
    committing after the Together picks;
  - `scripts/coverage.json`, from `--update-coverage`;
  - `scripts/smoke/README.md` if it describes either row's checks.
- **Must not change:**
  - anything under `app/`, except a bug fix under Decision 4;
  - the row names and ids in `scripts/smoke/registry.mjs`;
  - the checks either row makes today.

## Constraints

- **Reuse, do not re-derive.** `tap`, `tapPane`, `evalJSON`, `settle` and
  `setGame` from the row's own imports. Read state with
  `(await import('/state.js'))`, as `plansheet` does. Expected rule text is
  spelled out in the row, matching `ruleItems`; do not import `ruleItems`
  to build the expectation.
- **No navigation.** Both extensions stay on the loaded page. G's reload is
  the one exception, and it goes through `Page.reload` so #259's coverage
  hook takes coverage first.
- **Leave the fixture as found.** Later rows read the same rich state. Every
  setting and rule this adds is put back before the row returns.
- **No app refactor for testability.** The handlers stay inline closures.
  Pulling the clamps into a pure helper is out of scope.
- **Timing.** If a step flakes, stop and report. No retry loops.

## Design

1. **Settings.** In `settingsLookPass`, after its reads: one helper that
   sets a field's value and dispatches `change`, then reads back the setting
   and the field. Run the tables in D and E through it. Seg taps use
   `button[data-…]` selectors. Restore the defaults at the end.
2. **Rules.** In `planSheetPass`, commit the Together pair, check I, then
   loop over the remaining kinds: open Add a rule, pick the kind chip, pick
   tiles or step the number, tap `#planAddRuleBtn`, and check the row text.
3. **Record.** One full `npm run smoke`, then `--update-coverage`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Settings seg, number fields, theme, team name | `settingslook` smoke row | A–G |
| Each rule kind's commit and Force Together | `plansheet` smoke row | H, I |
| Coverage floor and re-record | one full `npm run smoke` | J, K |

## Out of scope

- Share image, backup and season CSV (#263).
- Roster reorder, add/paste and the level meter (#264).
- Dead code (#262).
- Editing or removing a rule (the `ruleedit` row covers it).
- Proving the engine keeps a forced pair together. That is `engine.js`'s
  own tests.
