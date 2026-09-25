/* THE CHECK REGISTRY. One list names every row a full run prints, in the
 * order it prints them, and carries the `run` that produces it — adding a
 * smoke check means writing its module and one entry here, nothing else
 * (#124). `smoke.mjs` walks this list for both the full run and `--only`,
 * rather than keeping a second `RUN` map and a hand-written run order of its
 * own the way it used to: a run order stated twice is one of them going
 * stale the moment somebody edits the other.
 *
 * Row names are built from the same constants the passes in `scripts/smoke/`
 * measure with (`NARROW`, `SWEEP_FLOOR`, `SWEEP_HI`, `TOUCH_WIDTHS`,
 * `LARGE_TEXT_WIDTH`, `LARGE_TEXT_PX`, ...) rather than a second copy of
 * their template strings. Those constants live in `sizes.mjs`, imported here
 * and not re-exported: a second export of the same number is a second path
 * to one fact, which is the thing #124 exists to remove. `nameOf` is how a
 * check that is not itself a registry row still gets a name back out
 * (`card-at-32.mjs`'s `cardAt32Pass` extends the cold `cardsize` row rather
 * than being a row of its own, and `smoke.mjs` builds the `console` and
 * `node --test` rows by hand). Every check module that IS a row drops
 * `nameOf` entirely and returns `{ pass, detail }`; `smoke.mjs`'s `runCheck`
 * adds the row's own `name` to what it gets back.
 *
 * `selectable: false` marks the four rows `--only` may never choose: `no
 * console errors` covers passes it did not run, and the three budget rows plus
 * `node --test` measure the WHOLE run, not one check — see AGENTS.md § Layout.
 *
 * `setup` is what a partial run has to do before the row's own pass can run:
 * `cold` is the SEED load and the `smoke-checks.js` evaluate, everything a
 * full run has on screen before the fixture split; `rich` is that plus one
 * `goRich` — every row after the split, because `goRich` is a fresh reload of
 * the same fixture and so reproduces the arrival state whether it is the first
 * call or, as some rows below get it in a full run, a later one. `run` is the
 * pass itself, called with the session a partial run has open — `ctx.c`,
 * `ctx.origin`, `ctx.source` and, for `wakelock`, `ctx.consoleErrors`.
 *
 * `resetAfter: true` on a rich row means `smoke.mjs` calls `goRich` again
 * right after it, in the full run: `teamcolor` switches team and `wakelock`
 * stubs `navigator.wakeLock`, and both leave the fixture in a state the next
 * row should not inherit. `replaces: <name>` holds the cold row (evaluated
 * before the fixture split, so it only ever saw the closed/default state)
 * that this row's own swept verdict takes the place of — `smoke.mjs` drops
 * that name out of `report.checks` before pushing this row's own result, so
 * the two never both print. `planrows` replaces exactly one cold name,
 * `'plan rows ≥ 48px'`: `scripts/smoke-checks.js` builds only that one row
 * whose name starts with "plan rows" (the cold `minSizeCheck` calls it once,
 * for the Plan sheet), so an exact string does the same job the old
 * `startsWith('plan rows')` filter did, with no room for a second match to
 * hide behind the prefix.
 *
 * Checks that restore RICH themselves keep doing so from inside their own
 * `run` — making the harness own that reset is #125, out of scope here.
 *
 * The eight `cold` rows' names (`overflow` through `fcp`) are hand-pinned
 * copies of the `add(...)` calls in `scripts/smoke-checks.js`, for the same
 * reason the three budget names below are hand-pinned copies of
 * `budgets.mjs`'s: that file is evaluated as page text, not imported, so
 * there is nothing here a rename would fail to compile. The drift check after
 * the full run's table (`smoke.mjs`) is what actually catches a rename — it
 * is the guard, not the comment. */
import {
  NARROW, SWEEP_FLOOR, SWEEP_HI, SHEET_MIN, WIDE_MIN, RAIL, LAPTOP, SWEEP_EXTRA,
  TOUCH_WIDTHS, TOUCH_CHECK, LARGE_TEXT_PX, LARGE_TEXT_WIDTH,
} from './sizes.mjs';

import { cardFontPass } from './card-font.mjs';
import { fixturePass } from './rich-fixture.mjs';
import { seasonPass } from './season.mjs';
import { gameRowsFitPass } from './game-rows-fit.mjs';
import { todayAndBackPass } from './today-and-back.mjs';
import { todayKeysAndUndoPass } from './today-keys-and-undo.mjs';
import { noGamesPass } from './no-games.mjs';
import { datedDayPass } from './dated-day.mjs';
import { gamePassesPass } from './game-passes.mjs';
import { passUnderwayPass } from './pass-underway.mjs';
import { passLargeTextPass } from './pass-large-text.mjs';
import { threeDaysPass } from './three-days.mjs';
import { gameTitlePass } from './game-title.mjs';
import { teamColorPass } from './team-color.mjs';
import { wakeLockPass } from './wake-lock.mjs';
import { overlayPass } from './overlay.mjs';
import { touchPass } from './touch.mjs';
import { settingsRowPass } from './settings-rows.mjs';
import { whoRowsPass } from './who-rows.mjs';
import { planRowsPass } from './plan-rows.mjs';
import { planControlsPass } from './plan-controls.mjs';
import { todayGameRowsPass } from './today-game-rows.mjs';
import { sentenceSheetsPass } from './sentence-sheets.mjs';
import { planSheetPass } from './plan-sheet.mjs';
import { sheetSpacingPass } from './sheet-spacing.mjs';
import { timelineCardSheetPass } from './timeline-card-sheet.mjs';
import { teamScreenPass } from './team-screen.mjs';
import { addGameFlowPass } from './add-game-flow.mjs';
import { firstRunPass } from './first-run-flow.mjs';
import { focusClearPass } from './focus-clear.mjs';
import { floatingControlsPass } from './floating-controls.mjs';
import { resumeBarPass } from './resume-bar.mjs';
import { finishGamePass } from './finish-game.mjs';
import { wideLayoutPass } from './wide-layout.mjs';
import { narrowPass } from './narrow.mjs';
import { sweepPass } from './sweep.mjs';
import { appLargeTextPass } from './app-large-text.mjs';
import { typeScalePass } from './type-scale.mjs';
import { staticPass } from './static.mjs';
import { darkInputBgPass } from './dark-input-bg.mjs';
import { phoneGutterPass } from './phone-gutter.mjs';
import { controlSizePass } from './control-size.mjs';

// The same "swept at these widths" suffix five rows below share verbatim —
// named once so it cannot drift between them the way TOUCH_CHECK's own name
// used to (see the sizes.mjs comment on TOUCH_FLOOR).
const TOUCH_RANGE = `${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`;

export const ROWS = Object.freeze([
  { id: 'console', name: 'no console errors', selectable: false, setup: null },
  { id: 'overflow', name: 'no horizontal overflow', selectable: true, setup: 'cold' },
  { id: 'cardsize', name: 'card is 3.45 × 5in', selectable: true, setup: 'cold' },
  { id: 'dialog', name: 'last control in an open dialog is reachable', selectable: true, setup: 'cold' },
  { id: 'names', name: 'controls have accessible names', selectable: true, setup: 'cold' },
  { id: 'alt', name: 'images declare alt text', selectable: true, setup: 'cold' },
  { id: 'ids', name: 'ids unique, aria references resolve', selectable: true, setup: 'cold' },
  { id: 'doc', name: 'document lang, title, tab order', selectable: true, setup: 'cold' },
  { id: 'fcp', name: 'first contentful paint (informational)', selectable: true, setup: 'cold' },
  { id: 'cardfont', name: 'card font loads before the card is fitted', selectable: true, setup: 'rich',
    run: ctx => cardFontPass(ctx.c, ctx.origin) },
  { id: 'fixture', name: 'rich fixture is live', selectable: true, setup: 'rich',
    run: ctx => fixturePass(ctx.c) },
  // #30's own guard (see docs/specs/30-season-screen.md's Proof section):
  // Season's minutes-so-far order, a filed game's rows and Delete, the day
  // chart's move off the game screen, touch sizes and Export's placement --
  // see season.mjs.
  { id: 'season', name: 'season: minutes so far, filed games, the day chart', selectable: true, setup: 'rich',
    run: ctx => seasonPass(ctx.c, ctx.origin) },
  // #72 (see docs/specs/72-fit-nine-rows.md's Proof section): all 9 timeline
  // rows and #abBench on screen with no scrolling, .tl-name's own tap-target
  // geometry in the one-row layout, and the pin toggle by click and by Enter
  // -- see game-rows-fit.mjs. Runs its own `?try=9` landing rather than
  // reading the rich fixture, so it sits right after `fixture` and restores
  // RICH itself before `todayback` needs it.
  { id: 'gamerowsfit', name: 'game rows fit, 390×844', selectable: true, setup: 'rich',
    run: ctx => gameRowsFitPass(ctx.c, ctx.origin) },
  { id: 'todayback', name: 'today and back', selectable: true, setup: 'rich',
    run: ctx => todayAndBackPass(ctx.c, ctx.origin) },
  { id: 'todaykeys', name: 'today keys and undo', selectable: true, setup: 'rich',
    run: ctx => todayKeysAndUndoPass(ctx.c, ctx.origin) },
  // #126's own guard (see docs/specs/126-remove-last-game.md's Proof
  // section): removing a team's last game empties the day rather than
  // filling a fallback one back in -- Today's note and Add a game, no frame
  // forced open beside it at 1280px, Undo, reload, and every way into a game
  // screen that no longer exists staying blocked -- see no-games.mjs.
  { id: 'nogames', name: 'no games: Today\'s empty state, blocked entry, undo', selectable: true, setup: 'rich',
    run: ctx => noGamesPass(ctx.c, ctx.origin) },
  // #100's own guard (see docs/specs/100-dated-days.md's Proof section,
  // smoke row): no `#todayNewDay` anywhere on Today, and a fixture with a
  // day dated in the past boots to that day filed into the season, under
  // its own date, with the Undo toast shown -- see dated-day.mjs.
  { id: 'dateddayfiling', name: 'a past-dated day files itself on boot, no "New day"', selectable: true, setup: 'rich',
    run: ctx => datedDayPass(ctx.c, ctx.origin) },
  { id: 'gamepasses', name: 'game passes', selectable: true, setup: 'rich',
    run: ctx => gamePassesPass(ctx.c, ctx.origin) },
  // #92's own guard (see docs/specs/92-underway-status.md's Proof section):
  // a part-played game's Today card and game-screen sub line both read
  // "Underway" with an --accent dot, while the fixture's other cards keep
  // Planned/Needs a fix -- see pass-underway.mjs.
  { id: 'passunderway', name: 'a part-played game reads Underway on Today and the game screen', selectable: true, setup: 'rich',
    run: ctx => passUnderwayPass(ctx.c, ctx.origin) },
  // #66's own guard (see docs/specs/66-pass-large-text.md's Proof section): at
  // 320px/32px text every Today card's own pieces (summary, title, tip-off,
  // status, the top row) fit their own box with nothing ellipsized or
  // clipped, the status clears the card's own content edge, and at
  // 390px/16px the summary and title stay one line -- see pass-large-text.mjs.
  { id: 'passlargetext', name: `Today cards wrap at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text, one line at 390px/16px`, selectable: true, setup: 'rich',
    run: ctx => passLargeTextPass(ctx.c, ctx.origin) },
  // #101's own guard (Proof row 5): a three-day fixture (2/1/3 games, a
  // 40-char day name) -- headings stack in order, the large title opens the
  // team menu, #backBtn names the team, adding a game for tomorrow lands as
  // a new leading day, no overflow at 390 or 320px/32px text -- see
  // three-days.mjs.
  { id: 'threedays', name: 'three days: headings, title, back label, add for tomorrow, no overflow', selectable: true, setup: 'rich',
    run: ctx => threeDaysPass(ctx.c, ctx.origin) },
  // #69 decision 5, item 8: the game screen's title block -- one visible h1
  // (the opponent), a sub line with the tip-off and the reused status word --
  // see game-title.mjs.
  { id: 'gametitle', name: 'game title: one h1, opponent + status sub-line', selectable: true, setup: 'rich',
    run: ctx => gameTitlePass(ctx.c, ctx.origin) },
  { id: 'teamcolor', name: 'team color tints K1 only, and switches with the team', selectable: true, setup: 'rich',
    run: ctx => teamColorPass(ctx.c, ctx.origin), resetAfter: true },
  { id: 'wakelock', name: 'bench mode wake lock', selectable: true, setup: 'rich',
    run: ctx => wakeLockPass(ctx.c, ctx.origin, ctx.consoleErrors), resetAfter: true },
  { id: 'overlay', name: 'a11y in overlays and dialogs', selectable: true, setup: 'rich',
    run: ctx => overlayPass(ctx.c, ctx.source) },
  { id: 'touch', name: `${TOUCH_CHECK}, ${TOUCH_RANGE}`, selectable: true, setup: 'rich',
    run: ctx => touchPass(ctx.c, ctx.origin, ctx.source), replaces: TOUCH_CHECK },
  { id: 'settingsrows', name: `settings rows ≥ 48px, ${TOUCH_RANGE}`, selectable: true, setup: 'rich',
    run: ctx => settingsRowPass(ctx.c, ctx.source), replaces: 'settings rows ≥ 48px' },
  // #27 item 10: the Who's here sheet swept the same way settingsrows sweeps
  // Settings — see who-rows.mjs.
  { id: 'whorows', name: `who's here rows ≥ 48px, ${TOUCH_RANGE}`, selectable: true, setup: 'rich',
    run: ctx => whoRowsPass(ctx.c, ctx.source), replaces: "who's here rows ≥ 48px" },
  // #28 item 11: the Plan sheet swept the same way `whorows` sweeps Who's
  // here -- see plan-rows.mjs.
  { id: 'planrows', name: `plan rows ≥ 48px, ${TOUCH_RANGE}`, selectable: true, setup: 'rich',
    run: ctx => planRowsPass(ctx.c, ctx.source), replaces: 'plan rows ≥ 48px' },
  // #28 review finding: the sheet's other controls (segments, chips, tiles,
  // stepper buttons, the back button, ✕, "Add rule"), at level 1 and the add
  // page -- see plan-controls.mjs.
  { id: 'planctrls', name: 'plan sheet controls ≥ 48px', selectable: true, setup: 'rich',
    run: ctx => planControlsPass(ctx.c, ctx.source), replaces: 'plan sheet controls ≥ 48px' },
  // #69 item 4: the restyle's own named control list on Today and the game
  // screen, swept the same way settingsrows sweeps Settings -- see
  // today-game-rows.mjs.
  { id: 'todaygamerows', name: `today and game controls ≥ 48px, ${TOUCH_RANGE}`, selectable: true, setup: 'rich',
    run: ctx => todayGameRowsPass(ctx.c, ctx.source), replaces: 'today and game controls ≥ 48px' },
  // #27's own guard (see docs/specs/27-sentence-and-sheets.md's Proof
  // section): the sentence, and the Who's here / Format / Sub interval
  // sheets it opens, driven with real buttons, keys and pointer events.
  { id: 'sentencesheets', name: 'sentence and sheets', selectable: true, setup: 'rich',
    run: ctx => sentenceSheetsPass(ctx.c, ctx.origin) },
  // #28's own guard (see docs/specs/28-plan-sheet.md's Proof section): the
  // Plan sheet, its Rules and Lineups groups and the "across the day/season"
  // switches, driven with real buttons, keys and pointer events.
  { id: 'plansheet', name: 'plan sheet', selectable: true, setup: 'rich',
    run: ctx => planSheetPass(ctx.c, ctx.origin) },
  // #73's own guard (see docs/specs/73-sheet-polish.md's Proof section):
  // stepper column equality at 390px and 320px/32px, equal row padding
  // whether a row wraps, the balance value clearing its label, and every
  // sheet's status line clear of the last row -- see sheet-spacing.mjs.
  { id: 'sheetspacing', name: 'sheet spacing', selectable: true, setup: 'rich',
    run: ctx => sheetSpacingPass(ctx.c, ctx.origin) },
  // #29's own guard (see docs/specs/29-timeline-card-sheet.md's Proof
  // section): Timeline | Card, a reload keeping the choice, the card sheet
  // reached from #shareBtn, changing Size, P, Stint by stint and the
  // blocked panel's three fixes -- see timeline-card-sheet.mjs.
  { id: 'timelinecardsheet', name: 'game screen: Timeline | Card and the card sheet', selectable: true, setup: 'rich',
    run: ctx => timelineCardSheetPass(ctx.c, ctx.origin) },
  // #31's own guard (see docs/specs/31-roster-and-player-sheet.md's Proof
  // section): the roster list's rows, the player sheet and its remove, the
  // add-a-player and paste sheets (including the discard ask), Edit mode and
  // the empty state -- see team-screen.mjs.
  { id: 'teamscreen', name: 'team screen: roster rows, the player sheet, add and paste', selectable: true, setup: 'rich',
    run: ctx => teamScreenPass(ctx.c, ctx.origin) },
  // #131 fix-pass finding, item 7: dark theme's own borderless inputs
  // (`#sheetCard .pgrp .prow-select`, `.pgrp .prow-in`, `input[switch]`)
  // stay transparent, guarding the `:where(:root)` fix against the plain
  // `:root` prefix that flipped them filled -- see dark-input-bg.mjs.
  { id: 'darkinputbg', name: 'dark theme: print-sheet selects, minutes switch and roster fields stay transparent', selectable: true, setup: 'rich',
    run: ctx => darkInputBgPass(ctx.c, ctx.origin) },
  // #132's own guard (see docs/specs/132-phone-gutter.md's Proof section):
  // Today, the game screen, Team, Season and Settings sit 16px from each
  // edge -- not 11.2px -- at TOUCH_WIDTHS and at the large-text cell, and
  // #abBench/#resumeBtn hold the same 16px -- see phone-gutter.mjs.
  { id: 'phonegutter', name: `phone gutter: five screens, #abBench and #resumeBar, ${TOUCH_RANGE} + ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, selectable: true, setup: 'rich',
    run: ctx => phoneGutterPass(ctx.c, ctx.origin) },
  // #140 (prototype control size), "Drawn sizes" (Proof section): sentence
  // pitch, seg button/track height, stepper pill/halves, row heights and
  // switch-row containment, all measured as painted, not as a hit area --
  // see control-size.mjs.
  { id: 'controlsize', name: 'prototype control sizes: sentence, segs, steppers, switch rows', selectable: true, setup: 'rich',
    run: ctx => controlSizePass(ctx.c, ctx.origin) },
  // #32's own guard (see docs/specs/32-add-a-game.md's Proof section): the
  // three-step Add-a-game flow -- full screen over the chrome, the back
  // gesture stepping back through it, "Use it" and "Plan it" committing the
  // draft, and the discard ask -- see add-game-flow.mjs. It pushes games into
  // the day, so it reloads RICH before returning, exactly as `teamscreen`
  // above does after emptying the roster.
  { id: 'addgameflow', name: 'add a game: three steps', selectable: true, setup: 'rich',
    run: ctx => addGameFlowPass(ctx.c, ctx.origin) },
  // #36's own guard (see docs/specs/36-first-run.md's Proof section): the
  // welcome screen, all three first-run steps, every way out (Back, the
  // cancel gesture, discard, the sample) and finishing onto the tour and the
  // game itself -- see first-run-flow.mjs. Runs its own wiped landing (twice
  // -- step 3 commits for real, a one-way door) rather than reading the rich
  // fixture, the same way `gamerowsfit` lands on `?try=9`, and restores RICH
  // itself before `focusclear` needs it.
  { id: 'firstrun', name: 'first run: welcome, three steps, every way out', selectable: true, setup: 'rich',
    run: ctx => firstRunPass(ctx.c, ctx.origin) },
  // #33 decision 15 (item 7): tabbing the game screen never leaves focus
  // under the floating bar or action bar -- see focus-clear.mjs.
  { id: 'focusclear', name: 'tab order stays clear of the floating bar and action bar', selectable: true, setup: 'rich',
    run: ctx => focusClearPass(ctx.c) },
  // #33 "What would settle it" items 1-6 and 10: the floating chrome itself
  // -- the collapsing bar title, the round chips, the full-width action
  // bar and the solid fallbacks. See floating-controls.mjs.
  { id: 'floatingcontrols', name: 'the floating bar and action bar', selectable: true, setup: 'rich',
    run: ctx => floatingControlsPass(ctx.c, ctx.origin) },
  // #34's own guard (see docs/specs/34-resume-bar.md's Proof section): the
  // bar names the later part-played game, a tap resumes on the right stint,
  // it hides everywhere else and does not reopen bench mode on a reload, its
  // geometry and solid fallbacks hold at 320-390px, and focus never lands
  // under it -- see resume-bar.mjs.
  { id: 'resumebar', name: 'resume bar on Today', selectable: true, setup: 'rich',
    run: ctx => resumeBarPass(ctx.c, ctx.origin) },
  // #135's own guard (see docs/specs/135-finish-game.md's Proof section):
  // closing on the last stint keeps a game Underway, resume opens on it,
  // #gmFinish shows only there, tapping it closes bench mode, marks the game
  // Finished with an --info dot, offers an Undo the tip/install must wait
  // behind, and a finished game stays finished (with no un-finish) once it
  // is reopened -- see finish-game.mjs.
  { id: 'finishgame', name: 'a coach finishes a game with Finish game', selectable: true, setup: 'rich',
    run: ctx => finishGamePass(ctx.c, ctx.origin) },
  // #35's own guard (see docs/specs/35-wide-screens.md's Proof section): the
  // two-pane layout at 1280px and 840px -- the rail at left 0 and the open
  // screen starting where it ends, Team replacing the right pane and back
  // putting the game back, one bottom bar -- and the sheet centered at 600px
  // but still flush to the bottom at 599px. See wide-layout.mjs.
  { id: 'widelayout', name: `wide layout: ${RAIL}px rail at ${WIDE_MIN}px+, centered sheet at ${SHEET_MIN}px`, selectable: true, setup: 'rich',
    run: ctx => wideLayoutPass(ctx.c, ctx.origin) },
  { id: 'narrow', name: `no sideways pan at ${NARROW}px`, selectable: true, setup: 'rich',
    run: ctx => narrowPass(ctx.c) },
  { id: 'sweep', name: `no overflow, ${SWEEP_FLOOR}–${SWEEP_HI}px plus ${SWEEP_EXTRA.join('/')}px`, selectable: true, setup: 'rich',
    run: ctx => sweepPass(ctx.c) },
  { id: 'applargetext', name: `app shell at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, selectable: true, setup: 'rich',
    run: ctx => appLargeTextPass(ctx.c, ctx.origin) },
  { id: 'typescale', name: 'type scale: 7 sizes, 4 weights', selectable: true, setup: 'rich',
    run: ctx => typeScalePass(ctx.c, ctx.origin) },
  { id: 'static', name: 'static pages: 2 guides + 6 charts', selectable: true, setup: 'rich',
    run: ctx => staticPass(ctx.c, ctx.source, ctx.origin) },
  // These three names are `budgets.mjs`'s, verbatim — that file is untouched by
  // this change, so the names are pinned here by hand rather than imported.
  { id: 'budgetbytes', name: 'initial payload ≤ budget', selectable: false, setup: null },
  { id: 'budgetrequests', name: 'request count ≤ budget', selectable: false, setup: null },
  { id: 'budgetnodes', name: 'DOM nodes ≤ budget', selectable: false, setup: null },
  { id: 'nodetest', name: 'node --test', selectable: false, setup: null },
]);

export const nameOf = id => ROWS.find(r => r.id === id).name;
