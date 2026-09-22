/* Row names built from the constants the passes in sibling modules also
   import from here — see AGENTS.md's own reasoning for why one number backs
   both a threshold and a printed name. This module carries no pass import,
   so nothing here can create the load-time import cycle a pass importing
   the registry back would. */

/* 360, not 320. The narrowest phone in real use is a small Android at 360 and
   an iPhone SE 2/3 at 375; 320 is a 2016 SE. Claiming a floor the chrome cannot
   actually hold would mean either a permanently red check or five controls
   squeezed under `TOUCH_FLOOR`, and the second is worse than the bug
   this exists to catch. */
export const NARROW = 360;

/* A range, not a point — because a point is how this shipped twice.
 *
 * The bar overflowed at 375px, was fixed, and came back at 305–341px: the
 * narrowing stages left a band between where the bar's intrinsic floor sat and
 * where the last stage started. Both times the harness was green, for the same
 * reason both times — it measured one width somebody had thought to name (390,
 * then 360), and a floor is not a width you can guess. So this sweeps every
 * width in the band a phone can actually be and asserts the only thing that
 * matters at all of them: the document is no wider than the window.
 *
 * Both views, because the Games and Roster chrome differ and only one of them
 * has to be wrong.
 *
 * What it asserts is *not* `documentElement.scrollWidth <= innerWidth`, which
 * is the obvious thing and is worthless here: `overflow-x: clip` on the root
 * clamps that number to the viewport, so it reads green at every width even
 * with Print hanging 21px past the edge — measured, that is exactly what it
 * did against the bug this was written to catch. Clip removes the panning and
 * leaves the content out of reach, which is the same bug with its symptom
 * deleted. So the assertion is the one thing clip cannot hide: no element's
 * right edge past the viewport unless it sits in a box that scrolls sideways
 * on purpose (the game tabs). On failure it names the widths and the element,
 * so the next person gets the number instead of a hunt.
 *
 * SWEEP_FLOOR is the claim: every width from here to SWEEP_HI is clean. It is
 * 300 because that is comfortably under the narrowest phone anyone carries (an
 * iPhone SE 1st gen is 320), not because 300 is where the app gives out —
 * measured with the floor dropped to 240, it is clean from 252px up, and what
 * fails below that is an unlabelled span in the games view, not the chrome.
 * So there is ~48px of headroom under the claim, deliberately: a check pinned
 * to the exact limit goes red on any harmless change and stops being read.
 * Raise SWEEP_FLOOR only against a measured floor that genuinely cannot be
 * crossed without breaking something worse (`TOUCH_FLOOR` below is the one
 * that has been traded away before) — and write the reason down here. */
export const SWEEP_FLOOR = 300, SWEEP_HI = 420;

/* #35's three bands, as the harness measures them. `SHEET_MIN` is where a
 * bottom sheet becomes a centered dialog and `WIDE_MIN` is where Today becomes
 * a fixed left rail; `RAIL` is that rail's width, and `LAPTOP` is the wide
 * window every pass that wants "comfortably past the breakpoint" uses. They
 * live here, beside `SWEEP_FLOOR`/`SWEEP_HI` and named once, rather than
 * inline in the passes that sweep them -- the row names below are built from
 * the same constants the passes measure with, which is the whole point of this
 * module.
 *
 * SWEEP_EXTRA is decision 14: three discrete widths on top of the 300-420
 * band, not a wider band. Sweeping every integer from 300 to LAPTOP is 4,900
 * widths across five views for no extra signal -- the three numbers in the
 * acceptance criteria are the three that matter, and one of them (599, the
 * width below `SHEET_MIN`) is `widelayout`'s job rather than the sweep's. */
export const SHEET_MIN = 600, WIDE_MIN = 840, RAIL = 360, LAPTOP = 1280;
export const SWEEP_EXTRA = [SHEET_MIN, WIDE_MIN, LAPTOP];

// The three widths `touchPass` and `settingsRowPass` sweep every state at —
// the full rationale lives with `touchPass` in `touch.mjs`.
export const TOUCH_WIDTHS = [320, 360, 390];

/* The floor (I1, `docs/interface-guidelines.md`) and the NAME the in-page
 * touch check reports it under. `smoke-checks.js` builds the same name from
 * its own `TOUCH_FLOOR` -- it is read as text and evaluated in the page, so
 * it cannot import this -- but every module on this side looks the check up
 * by name (`touch.mjs` twice, `static.mjs`'s `STATIC_A11Y`, `smoke.mjs`'s
 * filter) and the row below prints it, which was five hand-typed copies of
 * one string until #37 had to change all five at once. A copy that misses is
 * silent rather than loud: `STATIC_A11Y.has(name)` DROPS a verdict whose name
 * it does not recognize, so a stale spelling reads as seven clean pages. */
export const TOUCH_FLOOR = 48;
/* The measurement tolerance that goes with it, for the checks on THIS side
 * that measure a box themselves instead of reading the in-page verdict back
 * (`team-screen.mjs`'s roster rows, `timeline-card-sheet.mjs`'s card-sheet
 * rows). `smoke-checks.js` spells the same pair at the top of its IIFE and
 * says there what the half pixel buys and what it costs; the two constants
 * are tied together by `test/touch-floor.test.js`, which reads that file as
 * text the way `smoke.mjs` does. Before #37's review this side spelled it
 * three ways -- `TOUCH_FLOOR - 0.5`, a bare `47.5`, and nothing at all. */
export const TOUCH_TOL = 0.5;
export const TOUCH_MIN = TOUCH_FLOOR - TOUCH_TOL;
export const TOUCH_CHECK = `touch targets ≥ ${TOUCH_FLOOR}px`;

// A 200% reader's root, and the narrowest phone anyone carries — the full
// rationale for this one cell lives with `staticPass` in `static.mjs`.
export const LARGE_TEXT_PX = 32;       // a 200% reader, via CDP `Page.setFontSizes`
export const LARGE_TEXT_WIDTH = 320;   // the narrowest phone anyone carries

/* ---------- the check registry ----------
 *
 * ONE LIST NAMES EVERY ROW A FULL RUN PRINTS, in the order it prints them, so
 * `--only` has one place to validate a name against and the header's "21" is
 * counted rather than typed. It is built from the same constants the passes
 * in `scripts/smoke/` already use (`NARROW`, `SWEEP_FLOOR`, `SWEEP_HI`,
 * `TOUCH_WIDTHS`, `LARGE_TEXT_WIDTH`, `LARGE_TEXT_PX`) rather than a second
 * copy of their template strings — `nameOf` below is how a pass gets its name
 * back out, so the template lives here exactly once. This module is named
 * ROWS, not REGISTRY: `smoke.mjs` attaches each row's own `run` (which needs
 * every pass imported) and freezes the result as `REGISTRY`, so this base
 * list stays import-free and nothing here can create a load cycle.
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
 * call or, as two rows below get it in a full run, the second. `run` is the
 * pass itself, called with the session a partial run has open.
 *
 * The eight `cold` rows' names (`overflow` through `fcp`) are hand-pinned
 * copies of the `add(...)` calls in `scripts/smoke-checks.js`, for the same
 * reason the three budget names below are hand-pinned copies of
 * `budgets.mjs`'s: that file is evaluated as page text, not imported, so
 * there is nothing here a rename would fail to compile. The drift check after
 * the full run's table is what actually catches a rename — it is the guard,
 * not the comment. */
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
  { id: 'cardfont', name: 'card font loads before the card is fitted', selectable: true, setup: 'rich' },
  { id: 'fixture', name: 'rich fixture is live', selectable: true, setup: 'rich' },
  // #30's own guard (see docs/specs/30-season-screen.md's Proof section):
  // Season's minutes-so-far order, a filed game's rows and Delete, the day
  // chart's move off the game screen, touch sizes and Export's placement --
  // see season.mjs.
  { id: 'season', name: 'season: minutes so far, filed games, the day chart', selectable: true, setup: 'rich' },
  // #72 (see docs/specs/72-fit-nine-rows.md's Proof section): all 9 timeline
  // rows and #abBench on screen with no scrolling, .tl-name's own tap-target
  // geometry in the one-row layout, and the pin toggle by click and by Enter
  // -- see game-rows-fit.mjs. Runs its own `?try=9` landing rather than
  // reading the rich fixture, so it sits right after `fixture` and restores
  // RICH itself before `todayback` needs it.
  { id: 'gamerowsfit', name: 'game rows fit, 390×844', selectable: true, setup: 'rich' },
  { id: 'todayback', name: 'today and back', selectable: true, setup: 'rich' },
  { id: 'todaykeys', name: 'today keys and undo', selectable: true, setup: 'rich' },
  // #100's own guard (see docs/specs/100-dated-days.md's Proof section,
  // smoke row): no `#todayNewDay` anywhere on Today, and a fixture with a
  // day dated in the past boots to that day filed into the season, under
  // its own date, with the Undo toast shown -- see dated-day.mjs.
  { id: 'dateddayfiling', name: 'a past-dated day files itself on boot, no "New day"', selectable: true, setup: 'rich' },
  { id: 'gamepasses', name: 'game passes', selectable: true, setup: 'rich' },
  // #69 decision 5, item 8: the game screen's title block -- one visible h1
  // (the opponent), a sub line with the tip-off and the reused status word --
  // see game-title.mjs.
  { id: 'gametitle', name: 'game title: one h1, opponent + status sub-line', selectable: true, setup: 'rich' },
  { id: 'teamcolor', name: 'team color tints K1 only, and switches with the team', selectable: true, setup: 'rich' },
  { id: 'wakelock', name: 'bench mode wake lock', selectable: true, setup: 'rich' },
  { id: 'overlay', name: 'a11y in overlays and dialogs', selectable: true, setup: 'rich' },
  { id: 'touch', name: `${TOUCH_CHECK}, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich' },
  { id: 'settingsrows', name: `settings rows ≥ 48px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich' },
  // #27 item 10: the Who's here sheet swept the same way settingsrows sweeps
  // Settings — see who-rows.mjs.
  { id: 'whorows', name: `who's here rows ≥ 48px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich' },
  // #28 item 11: the Plan sheet swept the same way `whorows` sweeps Who's
  // here -- see plan-rows.mjs.
  { id: 'planrows', name: `plan rows ≥ 48px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich' },
  // #28 review finding: the sheet's other controls (segments, chips, tiles,
  // stepper buttons, the back button, ✕, "Add rule"), at level 1 and the add
  // page -- see plan-controls.mjs.
  { id: 'planctrls', name: 'plan sheet controls ≥ 48px', selectable: true, setup: 'rich' },
  // #69 item 4: the restyle's own named control list on Today and the game
  // screen, swept the same way settingsrows sweeps Settings -- see
  // today-game-rows.mjs.
  { id: 'todaygamerows', name: `today and game controls ≥ 48px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich' },
  // #27's own guard (see docs/specs/27-sentence-and-sheets.md's Proof
  // section): the sentence, and the Who's here / Format / Sub interval
  // sheets it opens, driven with real buttons, keys and pointer events.
  { id: 'sentencesheets', name: 'sentence and sheets', selectable: true, setup: 'rich' },
  // #28's own guard (see docs/specs/28-plan-sheet.md's Proof section): the
  // Plan sheet, its Rules and Lineups groups and the "across the day/season"
  // switches, driven with real buttons, keys and pointer events.
  { id: 'plansheet', name: 'plan sheet', selectable: true, setup: 'rich' },
  // #73's own guard (see docs/specs/73-sheet-polish.md's Proof section):
  // stepper column equality at 390px and 320px/32px, equal row padding
  // whether a row wraps, the balance value clearing its label, and every
  // sheet's status line clear of the last row -- see sheet-spacing.mjs.
  { id: 'sheetspacing', name: 'sheet spacing', selectable: true, setup: 'rich' },
  // #29's own guard (see docs/specs/29-timeline-card-sheet.md's Proof
  // section): Timeline | Card, a reload keeping the choice, the card sheet
  // reached from #shareBtn, changing Size, P, Stint by stint and the
  // blocked panel's three fixes -- see timeline-card-sheet.mjs.
  { id: 'timelinecardsheet', name: 'game screen: Timeline | Card and the card sheet', selectable: true, setup: 'rich' },
  // #31's own guard (see docs/specs/31-roster-and-player-sheet.md's Proof
  // section): the roster list's rows, the player sheet and its remove, the
  // add-a-player and paste sheets (including the discard ask), Edit mode and
  // the empty state -- see team-screen.mjs.
  { id: 'teamscreen', name: 'team screen: roster rows, the player sheet, add and paste', selectable: true, setup: 'rich' },
  // #32's own guard (see docs/specs/32-add-a-game.md's Proof section): the
  // three-step Add-a-game flow -- full screen over the chrome, the back
  // gesture stepping back through it, "Use it" and "Plan it" committing the
  // draft, and the discard ask -- see add-game-flow.mjs. It pushes games into
  // the day, so it reloads RICH before returning, exactly as `teamscreen`
  // above does after emptying the roster.
  { id: 'addgameflow', name: 'add a game: three steps', selectable: true, setup: 'rich' },
  // #36's own guard (see docs/specs/36-first-run.md's Proof section): the
  // welcome screen, all three first-run steps, every way out (Back, the
  // cancel gesture, discard, the sample) and finishing onto the tour and the
  // game itself -- see first-run-flow.mjs. Runs its own wiped landing (twice
  // -- step 3 commits for real, a one-way door) rather than reading the rich
  // fixture, the same way `gamerowsfit` lands on `?try=9`, and restores RICH
  // itself before `focusclear` needs it.
  { id: 'firstrun', name: 'first run: welcome, three steps, every way out', selectable: true, setup: 'rich' },
  // #33 decision 15 (item 7): tabbing the game screen never leaves focus
  // under the floating bar or action bar -- see focus-clear.mjs.
  { id: 'focusclear', name: 'tab order stays clear of the floating bar and action bar', selectable: true, setup: 'rich' },
  // #33 "What would settle it" items 1-6 and 10: the floating chrome itself
  // -- the collapsing bar title, the round chips, the full-width action
  // bar and the solid fallbacks. See floating-controls.mjs.
  { id: 'floatingcontrols', name: 'the floating bar and action bar', selectable: true, setup: 'rich' },
  // #34's own guard (see docs/specs/34-resume-bar.md's Proof section): the
  // bar names the later part-played game, a tap resumes on the right stint,
  // it hides everywhere else and does not reopen bench mode on a reload, its
  // geometry and solid fallbacks hold at 320-390px, and focus never lands
  // under it -- see resume-bar.mjs.
  { id: 'resumebar', name: 'resume bar on Today', selectable: true, setup: 'rich' },
  // #35's own guard (see docs/specs/35-wide-screens.md's Proof section): the
  // two-pane layout at 1280px and 840px -- the rail at left 0 and the open
  // screen starting where it ends, Team replacing the right pane and back
  // putting the game back, one bottom bar -- and the sheet centered at 600px
  // but still flush to the bottom at 599px. See wide-layout.mjs.
  { id: 'widelayout', name: `wide layout: ${RAIL}px rail at ${WIDE_MIN}px+, centered sheet at ${SHEET_MIN}px`, selectable: true, setup: 'rich' },
  { id: 'narrow', name: `no sideways pan at ${NARROW}px`, selectable: true, setup: 'rich' },
  { id: 'sweep', name: `no overflow, ${SWEEP_FLOOR}–${SWEEP_HI}px plus ${SWEEP_EXTRA.join('/')}px`, selectable: true, setup: 'rich' },
  { id: 'applargetext', name: `app shell at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, selectable: true, setup: 'rich' },
  { id: 'typescale', name: 'type scale: 7 sizes, 4 weights', selectable: true, setup: 'rich' },
  { id: 'static', name: 'static pages: 2 guides + 6 charts', selectable: true, setup: 'rich' },
  // These three names are `budgets.mjs`'s, verbatim — that file is untouched by
  // this change, so the names are pinned here by hand rather than imported.
  { id: 'budgetbytes', name: 'initial payload ≤ budget', selectable: false, setup: null },
  { id: 'budgetrequests', name: 'request count ≤ budget', selectable: false, setup: null },
  { id: 'budgetnodes', name: 'DOM nodes ≤ budget', selectable: false, setup: null },
  { id: 'nodetest', name: 'node --test', selectable: false, setup: null },
]);

export const nameOf = id => ROWS.find(r => r.id === id).name;
