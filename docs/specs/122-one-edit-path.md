# #122 — Every edit goes through one place that saves, retires undo and repaints

## Issue

#122. Each edit handler picks its own save and repaint call and its own
repaint keys, and only `soon()` runs the "an edit happened" hooks. It asks
for one module that owns all of that.

## Goal

Whatever a coach changes, the app does the same three things: it treats the
change as an edit, saves it, and repaints exactly what the change touches.
Concretely: an Undo toast never survives a later edit, and nothing on screen
keeps showing the old value.

## Decisions

The issue is unlabelled and came from an architecture review, not from the
owner, so every open question is decided here from the tree and `AGENTS.md`.
None is the owner's to make.

- **The survey held up the issue's claims.**
  - `soon()` (`app/render.js`) is the only caller of `editHappened`,
    `retireUndo` and the `first_run_complete` track.
  - There are 89 `soon`/`render`/`renderAll` call sites in `app/`.
- **The Undo bug is real by reading.**
  - `#stratseg` sits inside `#sheetPlan` (`app/index.html`).
  - Removing a rule there puts its Undo toast inside that same sheet (`toastHost`, `app/toast.js`).
  - The strategy handler (`app/app.js`) calls `renderAll()`, which never retires undo.
  - So Undo restores a snapshot taken before the strategy tap, and the strategy reverts with the rule.
  - The build proves this with a failing test before fixing it, and the browser check confirms it.
- **The day-heading claim is real by reading.**
  - `#dayName` only saves.
  - `dayHeading(state.day)` is written by `renderTabs` (`teams-view.js`).
  - So on the wide layout, where Today and the game sit side by side, the heading keeps the old name until something else repaints.
  - The `dayName` kind repaints `tabs`.
- **Two classes of change.**
  - A **record edit** runs all three hooks: retire undo, clear the recovery notice, and count the first run.
  - A **preference** runs only `retireUndo`, because Undo snapshots the whole of `state`, including `state.ui`, so an undo after a preference change would silently revert it. Theme, Timeline/Card and the card-print options are preferences.
  - Why preferences skip the other two hooks: the recovery notice says "check the roster", and changing the theme is not checking it. A35 decision 1 counts the first edit as the coach claiming the roster, and a theme tap is not that.
- **In scope:** every handler listed under **Design**.
- **Out of scope:**
  - navigation and structure: team switch, add or remove a team, add, open or remove a game, New day;
  - `undoable` refresh callbacks;
  - bench mode's stepping and swaps (`gamemode.js`), which have their own undo and are not plan edits;
  - onboarding, the tour, and the tip and install flags.
  - None of these are coach edits of a plan, and several already carry their own undo.
- **The table replaces `AFTER_EDIT`/`PLAN_ONLY` as a caller-facing idea.** The key lists stay the one source of truth for their contents, but they live with the table. View modules stop receiving them through `init*`, and stop naming `SECTIONS` keys at all.
- **When to paint stays per kind, as today.**
  - `soon` (debounced, 140ms) for typing and sliders.
  - An immediate full `render()` where today's code does one on purpose: the settings segs (re-solving every plan), `#gameDate`, `#regen` and the strategy seg.
  - This changes where the choice lives, not when painting happens, so no timing a coach feels changes.

## What would settle it

1. One module, `app/edit.js`, holds the table from each kind of change to three things: whether it is a record edit or a preference, which `SECTIONS` keys it repaints (or all of them), and whether it paints now or debounced.
2. `app/edit.js` imports no view module and touches no DOM at import. The painter and `retireUndo` are handed to it at boot by `render.js`, in the same `init*` pattern the views already use. It runs under `node --test` with no `dom-stub`.
3. Every handler under **Design** calls the edit function with its kind. None of them calls `soon`, `render`, `renderAll`, `renderCards` or `save` directly, or names a `SECTIONS` key.
4. With a recording stub painter and stub hooks, for every kind in the table:
   - a record edit fires `retireUndo`, `editHappened` and the first-run check once;
   - a preference fires `retireUndo` only;
   - the painter receives exactly that kind's keys, either now or after the debounce.
   - Several debounced edits inside 140ms merge into one paint with the union of their keys, which is today's `soon` behavior.
5. **The Undo bug:** the strategy kind is a record edit, so it retires undo. This is covered by item 4's test. Checked in a browser at 390×844:
   - Before the fix: open the Plan sheet, remove a rule, tap a different strategy, tap Undo. The strategy goes back.
   - After the fix: there is no Undo toast left to tap.
6. **The day heading:** the `dayName` kind repaints `tabs`. Checked in a browser at 1280×800 on Today with a game open beside it: typing a day name updates the heading within one debounce.
7. Every `SECTIONS` key a handler repaints today is still repainted by its kind. The table may add keys, as `dayName` adds `tabs`, but never drop one. `test/render-sections.test.js`'s guarantees are carried over to the table as run-time tests.
8. The source-reading tests that exist only to guard these call sites are removed or narrowed to what the table can't express: in `test/render-sections.test.js`, and in `test/undo-view.test.js` where it checks that `soon` calls `retireUndo`. Each one removed is named in the commit message with the run-time test that replaces it.
9. `npm test` and `npm run smoke` pass (50 checks). The precache is bumped: `app/sw.js` `VERSION` +1, and `SHELL` set to the digest `npm test` names.

## Surfaces

Changes:

- `app/edit.js` (new)
- `app/render.js`: `soon` moves or delegates; `AFTER_EDIT`/`PLAN_ONLY` move
- `app/app.js`, `teams-view.js`, `strategy.js`, `rules.js`, `roster-view.js`, `balance.js`, `game-setup.js`: the handlers only
- `app/sw.js`
- `test/`

Must not change:

- what any `SECTIONS` painter does;
- `render()`'s own order: compute, drop notice, save, theme, tint, warning, settings, sections, bar title;
- `undoable` and `showUndo`;
- `setView`;
- `state.js`'s mutators (`setTipoff`, `moveGame`, `reseed`, `removeRule`, …);
- bench mode;
- the out-of-scope handlers above.

## Constraints

- **One answer lives in one place.**
  - Each kind's keys and class live in the table only.
  - `AFTER_EDIT`/`PLAN_ONLY` keep one definition each, beside the table.
- **Reuse, do not re-derive.**
  - `render()` stays the painter.
  - `editHappened` and `takeFirstRunPending` (`state.js`), `retireUndo` (`toast.js`) and `track`/`bucketRoster` (`analytics.js`) are called, not copied.
  - The debounce is today's: 140ms, merging keys into a union.
- **No import cycle.** `edit.js` may import `state.js` and `analytics.js`. It must not import `render.js`, `toast.js` or any view. Whatever touches the DOM is injected, the way `render.js`'s header describes.
- **Do not repaint the container being typed into.** A kind for a text field keeps today's exclusions: `#label`, `#when`, `#teamName` and `#dayName` must not repaint `setup` or `roster` while typing. `render.js`'s rendering comment says why.
- **The settings handlers keep their own clamps.** That duplication with `sanitizeSettings` is #122's follow-on, not this build. Only their repaint call changes.
- **Precache bump** for every changed file under `app/`.
- **`wrap-blind.test.js`:** negative checks use `lacks` from `test/prose.js`.

## Design

- **`app/edit.js`:**
  - `EDITS`: kind → `{ pref?: true, keys: [...] | 'all', now?: true }`;
  - `edit(kind)`: runs the hooks for the kind's class, then either paints now or merges the kind's keys into the debounced pending set;
  - `initEdits({ paint, retireUndo })`: called once by `render.js`.
  - An unknown kind throws, so a typo fails loudly in tests.
  - `keys: []` means save and run the hooks but paint nothing. `render()` with no keys paints every section, so an empty list must never reach the painter. `save` comes from `state.js`.
- **Kinds.** Keys are today's unless noted. The developer may merge kinds that are identical rows.

  | Kind | Handler | Keys | When |
  | --- | --- | --- | --- |
  | `strategy` | `#stratseg` | all | now |
  | `regen` | `#regen` | all | now |
  | `gameDate` | `#gameDate` | all | now |
  | `opponent` | `#label` | `tabs`, `totals`, `cards` | debounced |
  | `tipoff` | `#when` | `tabs`, `cards` | debounced |
  | `teamName` | `#teamName` | `cards` | debounced |
  | `dayName` | `#dayName` | `tabs` (new) | debounced |
  | `teamSetting` | the six Settings handlers in `teams-view.js` | all | now |
  | `teamColor` | `#colorOpts` | `[]`: save only; the handler keeps its own `applyTint()`/`renderSettings()` (a full render re-ran the solver, a past fix) | now |
  | `theme` (pref) | `#themeSeg` | `[]`: save only; the handler keeps its own `applyTheme()` | now |
  | `gameView` (pref) | `#viewSeg` | `gameview` | now |
  | `cardOptions` (pref) | `#copies`, `#cardId`, `#printScope`, `#showMinutes` | `cards` | now |
  | `cardSize` (pref) | `#cardSize` | `setup`, `cards`, `gameview` | now |

  - Every `soon(...)` in `strategy.js`, `rules.js`, `roster-view.js`, `balance.js` and `game-setup.js` becomes a kind named for what it changes, with its keys copied exactly. Examples: `rule`, `pairs`, `budget`, `closers`, `units`, `player`, `levels`, `format`.
  - A handler's local in-place repaint before `soon`, such as `renderStrategy()` or `renderConstraints()`, stays where it is. Only the `soon` call becomes `edit(kind)`.
- **`render.js`:**
  - `soon` goes, or becomes a thin internal used only by `edit.js`'s injected painter.
  - `AFTER_EDIT`/`PLAN_ONLY` move beside the table.
  - `init*` calls stop passing them.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `edit.js`'s exports with a recording painter and stub hooks, for every kind: class, keys, now vs debounced, key merging (fake timers), unknown kind throws | `node --test` | 1, 2, 4, 5, 6, 7 |
| a guard: no handler file under Surfaces calls `soon(`, `renderAll(`, `renderCards(` or names `AFTER_EDIT`/`PLAN_ONLY`; `edit.js` imports no view and no `render.js`/`toast.js` (named here, so it is a seam; `/new-guard` applies) | `node --test`, reading source | 2, 3 |
| the carried-over key guarantees from `render-sections.test.js` | `node --test` against `EDITS` | 7, 8 |
| the full app still paints and behaves: overflow, large text, undo views, every smoke check | `npm run smoke` | 9 |
| strategy-after-rule-removal Undo at 390×844; day heading at 1280×800 | a browser look | 5, 6 |
| `test/sw.test.js`'s digest | `npm test` | 9 |

## Out of scope

- The Settings clamps moving into `sanitizeSettings` (a follow-on).
- Team, game and day structure changes, `undoable` refreshes, bench mode, onboarding and the tour.
- Any change to what a section painter draws or to `render()`'s order.
- Looking a plan up by its game rather than by index (a separate review finding).
