# #148 Let a coach edit a rule, not just remove it

## Issue

#148 (a sub-issue of #153, the UI review). Rules: C4, C5, C9, P6, W4.

## Decisions taken

These are defaults picked during the survey. None of them needs a product
call before building.

1. **Same controls as Add a rule.** A rule's page shows the controls Add a
   rule shows for that kind, without the kind chips. A rule cannot change
   kind; the coach removes it and adds a new one.
2. **Live.** Each tap writes to the game right away. The header stays Back
   plus ✕, as on other live sheets (C4). There is no Save button.
3. **Half-done picks are not applied.** Examples: one player in a pair, no
   players in a five, or no player for a minimum or cap. The stored rule keeps
   its last complete value. The pick header already says what to pick.
4. **No duplicates.** A pair that matches another rule of the same kind is
   not applied. The page says "You already have this rule." For a minimum or
   cap, players who already have that kind of rule are disabled in the
   picker.
5. **One Undo per visit.** The first change on a rule page takes one
   snapshot. Every later change on that page re-shows the same toast with
   the new sentence. Undo puts the rule back to how it was when the page
   opened.
6. **Toast copy.** Edit: `Changed: <sentence>`. Remove:
   `Removed: <sentence>`. `<sentence>` is the rule's own text from
   `ruleItems`.
7. **Level hint button.** The hint gets a button, "Open Team". It closes the
   sheet and goes to the Team page, the same way `rosterCta` does in
   `timeline.js`.
8. **Scroll claim.** The ~84px drift did not reproduce, so there is no
   scroll fix. A guard pins the current behavior. The survey found a
   different jump, the sheet collapsing while a toast shows. That jump gets
   fixed here, because live edits would trigger it on every tap.
9. The league-minimum page ("Change it in Settings.") gets no button in this
   change. See Out of scope.

## Open questions

None block the build. One is worth knowing: the issue's scroll claim is
falsified (see Survey row 4). The default is to guard the scroll restore and
fix the real jump, which is the toast collapse.

## Goal

A coach opens a rule from the Plan sheet and changes it in place. For
example, "Eli plays at most 20 min" becomes 24 in four taps. They do not
have to remove the rule and add it again. The change applies as they tap and
can be undone. Removing a rule says which rule went. The "set their level"
hint has a button that goes to the Team page. The Plan sheet does not jump
while any of this happens.

## Survey (before building)

Measured on `main` at c9442c7 with a real browser (CDP mouse clicks, not
scripted `.click()`), at 390×844, rich fixture (`goRich`). Rules were seeded
with `setGame`: minimum p0 16, cap p3 20, pair p1+p2, apart p4+p5, keep-on
p6+p7, starts, last period and at most 2 stints in a row. Scratch scripts:
`survey148.mjs`, `survey148b.mjs`, `survey148c.mjs` and `survey148d.mjs` in
the session scratchpad.

| # | Claim in #148 | Verdict | Evidence |
|---|---|---|---|
| 1 | A rule's page shows its sentence and one action, "Remove rule" (`rules.js:230`) | **Holds**, line moved | `openRuleDetail` is now at `rules.js:224`. All 8 kinds show the sentence plus "Remove rule" and nothing else. The league minimum shows its sentence plus "Your league minimum. Change it in Settings." and no button. |
| 2 | The level hint has no button that goes to Team (W4) | **Holds** | `noLevelsLine()` in `balance.js` gives the text "…Open a player on the **Team** page to set their level." with 0 buttons or links. It shows only when every player is on the same level. RICH has levels 5 and 1, so the probe set everyone to 3. At 390×844 it sat at y≈921, below the fold. |
| 3 | The remove toast says "Rule removed." (C9) | **Holds** | "Rule removed." with Undo, mounted inside `#sheetPlan`'s `.bsheet-toasts`. |
| 4 | Back from a rule returns scrolled ~84px, with the strategy toggle under the header | **Falsified** | Every way back restores the exact `scrollTop` from before: Back tap, Escape, Remove, Undo and Add a rule's commit. Measured 0→0, 250→250 and 69→69. `pushPane`/`popPane` (`trap.js:686`/`713`) save and restore it. No commit since the review's base (699987e) touched `trap.js` or `game-setup.js`. Opening from the "rules" phrase *lands* scrolled to Rules by design: scrollTop 69 with Even at 320, 375, 390 and 430 wide (641 with Closers, 737 with Platoon, since their editors are longer). At 69 the toggle's top is at y 82, under the header bottom at 143. That is where the sheet opened, and Back keeps it. No 84 appeared anywhere. The likely source is that landing, or row 5 below. |
| 5 | (found in the survey) The sheet jumps while a toast shows | **New defect** | `app.css:2800` (from #134), `dialog.bsheet:has(.bsheet-toasts .toast)`, sets `height: auto; min-height: 50dvh`, and `.bsheet-body` gets `flex-basis: 0`. A **full** sheet holding a toast shrinks to about half height for the 9 s the toast lives. After Remove at 390×844, the dialog top went 68→422 and the header bottom 143→497, leaving a 235px body. It springs back when the toast expires. Live edits would show a toast on every tap, so the edit page would jump every time. |
| 6 | (checked) The rotation offer replaces the rule toast on an underway game | **Does not happen** | Part-played game with a cap of 4 on p0. Remove showed "Rule removed." and it was still there 700 ms later. `undoable` wraps its refresh in `suppressRotationOffer`. |

### What exists to reuse

**How each rule is stored** (`g.constraints`), with `ruleItems(g)`
(`state.js:297`) text:

| Kind | Stored as | Values | Sentence |
|---|---|---|---|
| minimum | `minMinutes[id]` | 1 to 40 | "Ana plays at least 16 min" |
| cap | `maxMinutes[id]` | 0 to 40 | "Eli plays at most 20 min" |
| together | `pairs` | `[[a, b]]` | "Devon and Hana together" |
| apart | `avoids` | `[[a, b]]` | "Ana and Jordan apart" |
| keepon | `keepOnFloor` (lazy, via `keepOnList(c)`) | `[[a, b]]` | "Sam or Riley is always on the floor" |
| starts | `openingFive` | 1 to 5 ids | "X, Y and Z start the game" |
| lastq | `lastPeriodFive` | 1 to 5 ids | "… start the last period" |
| rest | `maxConsecutive` | 1 to 4, 0 = none | "Nobody plays more than 2 stints in a row" |
| leagueMinimum | Settings | not removable | "Everyone plays at least N min" |

`ruleItems` returns `{kind, text, removable, id | pair}`, drops minimum and
cap rows for players who are not available, and names players with
`callNames`. `removeRule(c, item)` (`state.js:355`) and
`ruleComplete(kind, draft)` (`state.js:376`) are pure.

**Add a rule's controls** (`rules.js`, `renderKindBody` at 315). The draft is
`{kind, id, minutes, a, b, ids, n}`.
- minimum and cap: `pickFive(sel, onToggle, {max: 1, replace: true, title: 'Pick a player'})`,
  then `stepperRow('Minutes', get, set, lo, 40, 'minutes')`. `lo` is 1 for
  minimum and 0 for cap.
- together, apart, keepon: `pickFive(…, {max: 2, title: 'Pick two players'})`.
- starts and lastq: `pickFive(…, {max: 5, title: 'Pick up to five'})`.
- rest: `stepperRow('Stints in a row', …, 1, 4, 'stints')`.
- starts, lastq and rest also show the footer "Replaces the one you have."
- `pickFive` (`pills.js:16`) shows available players and takes a `taken`
  Set that disables tiles. `stepperRow` is `game-setup.js:273`.
- `commitAddRule` (369) uses `addPairOnce` to skip duplicate pairs.

**Undo** (`toast.js`). `undoable(message, mutate, refresh)` takes
`clone(state)`, runs `mutate` and `refresh` under `suppressRotationOffer`,
then calls `showUndo`. `message` may be a function, which is read after
`mutate`. `showUndo(message, snap, refresh)` is exported. There is one toast
at a time, a new one replaces the old, and it lasts `UNDO_MS` (9000).
`edit(kind)` (`edit.js`) calls `retireUndo()` first, so any edit dismisses a
live undo toast. `edit('rule')` is debounced 140 ms. So calling `undoable`
once per stepper tap would make Undo reverse only the last tap. That is why
Decision 5 keeps one snapshot per visit.

**Panes.** `pushPlanPane(trigger, {title, showAddRule})` (`game-setup.js:137`)
and `pushPane`/`popPane` (`trap.js`) save and restore scroll and focus.
`PANE_MS` is 260.

**Going to Team.** `setView('team')` (`render.js:290`) closes any open sheet.
View modules get `setView` injected through their `init*` function and never
import `render.js`; `timeline.js`'s `initTimeline(setViewFn)` and `rosterCta`
are the precedent. `balance.js` has `initBalance(editFn)` today.

## What would settle it

Rich fixture, Plan sheet open full. 390×844, light and dark, unless a line
says otherwise. Each rule is seeded with `setGame`.

1. **Edit a cap.** Seed cap p3 20. Open its row. The page shows the
   sentence "Eli plays at most 20 min" (whatever `callNames` gives p3), a
   one-player picker with p3 selected, and a "Minutes" stepper reading 20.
   Four taps on + make the stepper read 24. `g.constraints.maxMinutes.p3`
   is 24, the sentence reads "… at most 24 min", and the level-1 row reads
   the same after Back. A cap stepper goes down to 0 and a minimum stepper
   stops at 1.
2. **Pick a different player** for a cap. Tap another tile. The rule moves
   to that player: the old key is gone and the new key holds the same
   minutes. A player who already has a cap is disabled in the picker.
3. **Pairs.** Seed together p1+p2. Tap p2 off: the store still holds
   `[['p1','p2']]` and the header asks for two players. Tap p4: the store
   holds `[['p1','p4']]` at the same index. A pair that matches an existing
   `pairs` entry is not applied, and the page shows "You already have this
   rule." Apart and keep-on behave the same, each in its own list.
4. **Fives.** Seed starts with five players. Tapping one off applies at
   once (four players is complete). Tapping the last one off leaves the
   stored five with one player, and nothing is applied until a player is
   picked again. The same holds for last period.
5. **Rest.** Seed `maxConsecutive` 2. The "Stints in a row" stepper runs
   1 to 4. Changing it to 3 stores 3.
6. **Undo an edit.** From item 1 (20 → 24 in four taps), the toast in
   `#sheetPlan` reads exactly `Changed: Eli plays at most 24 min` (the
   name follows p3) with Undo. There is one toast, not four. Tapping Undo
   restores 20, the page repaints to 20, and the toast goes away. Leaving
   the page and coming back starts a new snapshot.
7. **Remove toast.** Remove the cap. The toast reads exactly
   `Removed: Eli plays at most 20 min`. Undo brings the rule back at the
   same index.
8. **The sheet does not jump with a toast.** In a full Plan sheet, the
   dialog's top and height are the same (±1px) before and after a toast
   appears, and stay so until it leaves. At 390×844 the top is 68. A half
   sheet holding a toast keeps #134's behavior: it still grows enough to
   show the toast.
9. **Scroll is restored.** Open from the strategy phrase (scrollTop 0), open
   a rule, go Back: scrollTop is 0 (±1px). Scroll to 250, open a rule, change
   it, go Back: 250 (±1px). The same holds after Remove and after Undo.
10. **Level hint button.** Set every player to level 3. `#planLineups`'s hint
    has a `button.btn` with the text "Open Team". The sentence ends "…Open a
    player on the Team page to set their level." Tapping the button closes
    the sheet, and `document.documentElement.dataset.view` and `state.view`
    are both `team`. With mixed levels the hint and button are not shown.
11. **League minimum** is unchanged: sentence plus "Your league minimum.
    Change it in Settings.", no controls.
12. **Touch targets.** Every new control is at least 48px tall (I1 and the
    existing `control-size` check).
13. **Large text.** At 320px wide with a 32px root, the edit page for a cap
    rule and for a pair rule has no horizontal overflow, and the stepper and
    tiles stay reachable. Add these as `APP_LARGE_TEXT_STATES` rows.
14. **Underway game.** On a part-played game, editing a cap shows the
    "Changed:" toast, and the rotation offer does not replace it (±700 ms
    after the last tap).
15. **No console errors** in any of the above.

## Surfaces

**Change:**
- `app/rules.js`: `openRuleDetail` builds the controls; a new edit flow; the
  remove toast text.
- `app/state.js`: one pure helper that applies a rule draft to
  `g.constraints` in place of an existing rule (see Design). Reuse
  `ruleComplete`; do not change it.
- `app/balance.js`: the button in `noLevelsLine()`; `initBalance` also takes
  `setView`.
- `app/app.js`: line 398, `initBalance(edit)`, also passes `setView`.
- `app/app.css`: the toast rule at ~2800, only for `.full`; any small style
  the edit page needs.
- `app/sw.js`: bump VERSION and set SHELL, since precached files change.
- `test/`: a node test for the pure helper and the toast sentence.
- `scripts/smoke/plan-sheet.mjs` (or a new check module plus its registry
  entry): items 1 to 11 and 14.
- `scripts/smoke/app-large-text.mjs`: the new rows for item 13.
- Docs, for the doc-writer: `docs/architecture.md` if it describes the rule
  page.

**Must not change:** `app/engine.js`, `app/budget.js`, `app/storage.js`,
`app/roster.js`, `KINDS`, `ruleComplete`'s meaning, `pushPane`/`popPane`,
and the way `ruleItems` words a rule. `REQUESTS_BASELINE` does not move, as
there is no new boot module.

## Constraints

- AGENTS.md: mobile first at 390×844, and the 320px/32px large-text pass.
  Bump `sw.js`. No new boot module. The pure modules stay untouched. Guards
  come from `/new-guard` and behavior tests from `/tdd`. Iterate with
  `--only "<check>"`, wrapped in `perl -e 'alarm 900; exec @ARGV'`. American
  spelling.
- Screens match the prototype in `notes/mockups/prototype/` where it shows
  them, with no tab bar.
- **C4:** live sheet. ✕ top right, changes apply as you tap, no confirm.
- **C5:** still one level deep (Plan › Rule), with the back chevron.
- **C9:** one line naming what happened, with Undo. A new toast replaces
  the old.
- **P6:** Undo, not a confirm dialog, for edit and remove.
- **W4:** the level hint carries the button that goes to Team.
- **Reuse, do not re-derive:**
  - Controls: `pickFive` and `stepperRow`, with the same labels, ranges and
    nouns Add a rule uses. Pull those into one shared place in `rules.js` so
    Add a rule and the edit page read them from the same code. Do not write
    a second copy of the ranges.
  - The sentence: `ruleItems(g)` text. The toast and the page heading both
    use it. Do not build a second sentence.
  - Completeness: `ruleComplete(kind, draft)`.
  - Duplicate pairs: the check `addPairOnce` already makes.
  - Undo: `undoable`/`showUndo`. Do not write a second undo stack.
  - Navigation: injected `setView`, the same as `rosterCta`.
  - One name per thing (#149): "Team" is the page's name; do not call it
    "Roster" on the button.

## Design

**Pure helper (state.js).** Something like
`replaceRule(c, item, draft)`. It takes the item from `ruleItems` and a
draft in Add a rule's shape. If `ruleComplete(item.kind, draft)` is false,
it does nothing and returns false. For minimum and cap it deletes
`[item.id]` and sets `[draft.id] = draft.minutes`. For pairs it replaces the
entry at the item's index in its own list, and returns false if the new pair
is already in that list. For fives it sets the list to `draft.ids`. For rest
it sets `maxConsecutive`. It returns the new item (for its sentence), or
false. The node test covers each kind, a half-done draft, and a duplicate.

**Edit page (rules.js).** `openRuleDetail` seeds a draft from the stored
rule and renders `.plan-rule-sentence`, then the kind's controls via the
shared control builder from Add a rule, then "Remove rule". On every change
it calls the helper. If that returns an item, it updates the sentence, calls
`renderConstraints()`, and calls `edit('rule')`.

**Undo, once per visit.** Keep `snap = null` for the open page. On the first
applied change, `snap = clone(state)` taken *before* the helper runs. After
every applied change, call
`showUndo('Changed: ' + item.text, snap, refresh)`. Call it after
`edit('rule')`, because `edit` retires the live toast. `refresh` repaints
the rule rows and `edit('rule')`s. If the page is still open, it repaints
the page from the restored rule; if the rule no longer exists, it pops back.
Leaving the page clears `snap`. Wrap the change in `suppressRotationOffer`
the way `undoable` does. `edit('rule')` is debounced, so check item 14
against the debounced render too. If the rotation offer does fire there, the
fix belongs in this change.

**Remove.** Same flow as today, with the message
`` `Removed: ${item.text}` ``.

**Toast collapse (app.css).** Scope #134's `:has(.bsheet-toasts .toast)`
height rule to sheets that are not `.full`, or give `.full` a
`height: 92dvh` that wins. A full sheet already has room for the toast
inside its body. Keep `.bsheet-body`'s `min-height: 0` so the body scrolls
under the toast.

**Level hint (balance.js).** After the sentence, append a
`button.btn.press` "Open Team" whose click calls `setView('team')`. The
sentence keeps "Team" in bold. `initBalance(editFn, setViewFn)`.

## Proof seams

| Item | Seam |
|---|---|
| Helper, per kind, half-done, duplicate (1 to 5 store side) | `node --test`, new file in `test/` |
| Toast sentences (6, 7) | node test on the message builder, plus smoke reads the exact text |
| Page controls, live apply, one toast, Undo (1 to 7) | smoke: extend the "plan sheet" check in `scripts/smoke/plan-sheet.mjs` with real taps |
| No jump with a toast (8) | smoke: dialog rect before and during the toast, full and half |
| Scroll restore (9) | smoke: scrollTop 0 and 250 round trips, including Remove and Undo |
| Level button (10) | smoke: all levels 3, tap, view is team, sheet closed |
| League minimum (11) | existing plan-sheet assertion, kept |
| 48px (12) | existing `control-size` check (add the edit page state if it does not reach it) |
| Large text (13) | `APP_LARGE_TEXT_STATES` rows |
| Underway (14) | smoke on `partPlayed(RICH)` |
| New `.btn` colors | `team-color` check if it covers `#planLineups` |

## Out of scope

- A "Change it in Settings" button on the league-minimum page. It is the
  same W4 pattern and could be a follow-up.
- Changing a rule's kind in place.
- The landing offset when the sheet opens from the "rules" phrase. It is by
  design and is not what the issue asks about.
- Any change to how `ruleItems` words rules (#149 owns naming).
- Focus and announce behavior beyond what `pushPane`/`popPane` already do
  (#139).
