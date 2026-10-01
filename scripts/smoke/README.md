# Smoke checks

Index of every row `npm run smoke` prints, one row per entry in `ROWS`
(`registry.mjs`), in the print order a full run uses. `test/smoke-index.test.js`
holds Check, File and Fixture to `ROWS` — this table carries no list of
checks of its own. Read the module a row's File cell names for what it
actually measures (widths, text sizes, theme); this index does not restate
that. Run one row with `node scripts/smoke.mjs --only "<Check>"`.

How a run spends its time (#241): every page plays animations at
`FAST_PLAYBACK_RATE` (`dom.mjs`); a row that asserts on an animation itself
carries `motion: 'real'` in `registry.mjs` and runs at 1x. A wait on an
animation or an app timer of at most `TRACKED_TIMER_MS` is a condition, not a
sleep: `settle`/`tap` (`sheet-drive.mjs`), `resize(..., { debounce: true })`
(`page-state.mjs`) or `quiet` (`dom.mjs`), all on `TIMERS_QUIET`, which sees
those timers through `TIMER_TRACKER`. Only real elapsed time (a toast still up
2s later, a drag's hold) or a poll uses `wait` in `dom.mjs`. A sleep written
inside a page-side template string is not counted anywhere. `--timing` prints
each timed row's seconds, the node-side sleep through `wait`, and how many
settles hit their cap; a capped settle is also named on stderr in every run.

| Check | File | Fixture |
| --- | --- | --- |
| `no console errors` | `scripts/smoke.mjs` | whole run |
| `no horizontal overflow` | `scripts/smoke-checks.js` | SEED |
| `card is 3.45 × 5in` | `scripts/smoke-checks.js`, `scripts/smoke/card-at-32.mjs` | SEED |
| `last control in an open dialog is reachable` | `scripts/smoke-checks.js` | SEED |
| `controls have accessible names` | `scripts/smoke-checks.js` | SEED |
| `images declare alt text` | `scripts/smoke-checks.js` | SEED |
| `ids unique, aria references resolve` | `scripts/smoke-checks.js` | SEED |
| `document lang, title, tab order` | `scripts/smoke-checks.js` | SEED |
| `first contentful paint (informational)` | `scripts/smoke-checks.js` | SEED |
| `card font loads before the card is fitted` | `scripts/smoke/card-font.mjs` | RICH |
| `rich fixture is live` | `scripts/smoke/rich-fixture.mjs` | RICH |
| `text draws in DejaVu Sans` | `scripts/smoke/font-draws.mjs` | RICH |
| `season: minutes so far, filed games, the day chart` | `scripts/smoke/season.mjs` | RICH |
| `season: one list style, prototype row sizes` | `scripts/smoke/season-look.mjs` | RICH |
| `game rows fit, 390×844` | `scripts/smoke/game-rows-fit.mjs` | RICH |
| `pinned row and details are one card` | `scripts/smoke/pinned-card.mjs` | RICH |
| `closing a pinned card returns focus to the name` | `scripts/smoke/pinned-focus.mjs` | RICH |
| `today and back` | `scripts/smoke/today-and-back.mjs` | RICH |
| `today keys and undo` | `scripts/smoke/today-keys-and-undo.mjs` | RICH |
| `no games: Today's empty state, blocked entry, undo` | `scripts/smoke/no-games.mjs` | RICH |
| `a past-dated day files itself on boot, no "New day"` | `scripts/smoke/dated-day.mjs` | RICH |
| `game passes` | `scripts/smoke/game-passes.mjs` | RICH |
| `a part-played game reads Underway on Today and the game screen` | `scripts/smoke/pass-underway.mjs` | RICH |
| `Today cards wrap at 320px/32px text, one line at 390px/16px` | `scripts/smoke/pass-large-text.mjs` | RICH |
| `three days: headings, title, back label, add for tomorrow, no overflow` | `scripts/smoke/three-days.mjs` | RICH |
| `game title: one h1, opponent + status sub-line` | `scripts/smoke/game-title.mjs` | RICH |
| `team color tints K1 only, and switches with the team` | `scripts/smoke/team-color.mjs` | RICH |
| `new teams start in Hardwood, a saved Graphite stays` | `scripts/smoke/team-color.mjs` | RICH |
| `welcome, about and advanced carry the Hardwood orange` | `scripts/smoke/hardwood-pages.mjs` | RICH |
| `bench mode wake lock` | `scripts/smoke/wake-lock.mjs` | RICH |
| `a11y in overlays and dialogs` | `scripts/smoke/overlay.mjs` | RICH |
| `tour: six steps at 390px, 1280px and 320px/32px text` | `scripts/smoke/tour-steps.mjs` | RICH |
| `touch targets ≥ 48px, 320–390px` | `scripts/smoke/touch.mjs` | RICH |
| `settings rows ≥ 48px, 320–390px` | `scripts/smoke/settings-rows.mjs` | RICH |
| `settings look: no border, 32px insets, sentence case, one footnote per group` | `scripts/smoke/settings-look.mjs` | RICH |
| `who's here rows ≥ 48px, 320–390px` | `scripts/smoke/who-rows.mjs` | RICH |
| `plan rows ≥ 48px, 320–390px` | `scripts/smoke/plan-rows.mjs` | RICH |
| `plan sheet controls ≥ 48px` | `scripts/smoke/plan-controls.mjs` | RICH |
| `today and game controls ≥ 48px, 320–390px` | `scripts/smoke/today-game-rows.mjs` | RICH |
| `sentence and sheets` | `scripts/smoke/sentence-sheets.mjs` | RICH |
| `plan sheet` | `scripts/smoke/plan-sheet.mjs` | RICH |
| `edit a rule in place` | `scripts/smoke/rule-edit.mjs` | RICH |
| `remove a platoon unit, then Undo` | `scripts/smoke/platoon-undo.mjs` | RICH |
| `sheet spacing` | `scripts/smoke/sheet-spacing.mjs` | RICH |
| `the list sheets share one background, one row, one check` | `scripts/smoke/sheet-family.mjs` | RICH |
| `game screen: Timeline \| Card and the card sheet` | `scripts/smoke/timeline-card-sheet.mjs` | RICH |
| `hand off: the code is the link, a fresh phone opens the same game` | `scripts/smoke/hand-off.mjs` | RICH |
| `hand off: a damaged link shows one toast and writes nothing` | `scripts/smoke/hand-off.mjs` | RICH |
| `hand off: the code loads when Hand off is picked, and works offline` | `scripts/smoke/hand-off.mjs` | RICH |
| `share sheet: Print card \| Hand off` | `scripts/smoke/share-door.mjs` | RICH |
| `team screen: roster rows, the player sheet, add and paste` | `scripts/smoke/team-screen.mjs` | RICH |
| `dark theme: print-sheet selects, minutes switch and roster fields stay transparent` | `scripts/smoke/dark-input-bg.mjs` | RICH |
| `phone gutter: five screens, #abBench and #resumeBar, 320–390px + 320px/32px text` | `scripts/smoke/phone-gutter.mjs` | RICH |
| `prototype control sizes: sentence, segs, steppers, switch rows` | `scripts/smoke/control-size.mjs` | RICH |
| `#removeGame and #removeTeam are .prow-danger rows` | `scripts/smoke/remove-rows.mjs` | RICH |
| `.mrow matches the pre-#141 literal` | `scripts/smoke/bar-rows.mjs` | RICH |
| `#gameDate, #label, #dayName and #when match #minMins` | `scripts/smoke/game-field-match.mjs` | RICH |
| `#gmOpen is filled and full width at 840/1280, hidden below 840` | `scripts/smoke/gm-open.mjs` | RICH |
| `bench mode matches the prototype` | `scripts/smoke/bench-look.mjs` | RICH |
| `bench mode: next change, scope control, no spill, reachable rows, Leave` | `scripts/smoke/bench-details.mjs` | RICH |
| `add a game: three steps` | `scripts/smoke/add-game-flow.mjs` | RICH |
| `M4: the switch knob and a player chip avatar change state instantly` | `scripts/smoke/m4-instant.mjs` | RICH |
| `heading outline: one h1 per screen, no skipped levels, dialogs start at h2` | `scripts/smoke/heading-outline.mjs` | RICH |
| `forced colors: selected/on differs from unselected, timeline blocks keep a border` | `scripts/smoke/forced-colors.mjs` | RICH |
| `landscape (844x390): both landscape blocks are live, no sideways scroll, gm-nav stays inside` | `scripts/smoke/landscape-a11y.mjs` | RICH |
| `first run: welcome, three steps, every way out` | `scripts/smoke/first-run-flow.mjs` | RICH |
| `welcome demo is built after removing the last team` | `scripts/smoke/welcome-after-remove.mjs` | RICH |
| `welcome: no "day is over" toast, and the first game is dated today` | `scripts/smoke/welcome-stale-day.mjs` | RICH |
| `roster in` | `scripts/smoke/roster-in.mjs` | RICH |
| `flow inset: 16px on every side, 390px and 320px, both flows` | `scripts/smoke/flow-inset.mjs` | RICH |
| `welcome On screen: "just on" tag is styled` | `scripts/smoke/welcome-tag.mjs` | RICH |
| `tab order stays clear of the floating bar and action bar` | `scripts/smoke/focus-clear.mjs` | RICH |
| `the floating bar and action bar` | `scripts/smoke/floating-controls.mjs` | RICH |
| `resume bar on Today` | `scripts/smoke/resume-bar.mjs` | RICH |
| `a coach finishes a game with Finish game` | `scripts/smoke/finish-game.mjs` | RICH |
| `mid-game rotation change offers Undo` | `scripts/smoke/rotation-undo.mjs` | RICH |
| `a This stint swap re-plans the rest of the game` | `scripts/smoke/swap-replans-rest.mjs` | RICH |
| `focus lands on the pushed heading, screens and Shuffle announce` | `scripts/smoke/focus-announce.mjs` | RICH |
| `wide layout: 360px rail at 840px+, centered sheet at 600px` | `scripts/smoke/wide-layout.mjs` | RICH |
| `no sideways pan at 360px` | `scripts/smoke/narrow.mjs` | RICH |
| `no overflow, 300–420px plus 600/840/1280px` | `scripts/smoke/sweep.mjs` | RICH |
| `app shell at 320px/32px text` | `scripts/smoke/app-large-text.mjs` | RICH |
| `no cut-off text at 320px/32px text` | `scripts/smoke/clip-sweep.mjs` | RICH |
| `type scale: 8 sizes, 4 weights` | `scripts/smoke/type-scale.mjs` | RICH |
| `static pages: 2 guides + 6 charts` | `scripts/smoke/static.mjs` | RICH |
| `initial payload ≤ budget` | `scripts/budgets.mjs` | whole run |
| `request count ≤ budget` | `scripts/budgets.mjs` | whole run |
| `DOM nodes ≤ budget` | `scripts/budgets.mjs` | whole run |
| `node --test` | `scripts/smoke.mjs` | whole run |
