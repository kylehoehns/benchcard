/* Row names built from the constants the passes in sibling modules also
   import from here — see AGENTS.md's own reasoning for why one number backs
   both a threshold and a printed name. This module carries no pass import,
   so nothing here can create the load-time import cycle a pass importing
   the registry back would. */

/* 360, not 320. The narrowest phone in real use is a small Android at 360 and
   an iPhone SE 2/3 at 375; 320 is a 2016 SE. Claiming a floor the chrome cannot
   actually hold would mean either a permanently red check or five controls
   squeezed under the 44px touch minimum, and the second is worse than the bug
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
 * crossed without breaking something worse (the 44px touch minimum is the one
 * that has been traded away before) — and write the reason down here. */
export const SWEEP_FLOOR = 300, SWEEP_HI = 420;

// The three widths `touchPass` and `settingsRowPass` sweep every state at —
// the full rationale lives with `touchPass` in `touch.mjs`.
export const TOUCH_WIDTHS = [320, 360, 390];

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
  // #72 (see docs/specs/72-fit-nine-rows.md's Proof section): all 9 timeline
  // rows and #abBench on screen with no scrolling, .tl-name's own tap-target
  // geometry in the one-row layout, and the pin toggle by click and by Enter
  // -- see game-rows-fit.mjs. Runs its own `?try=9` landing rather than
  // reading the rich fixture, so it sits right after `fixture` and restores
  // RICH itself before `todayback` needs it.
  { id: 'gamerowsfit', name: 'game rows fit, 390×844', selectable: true, setup: 'rich' },
  { id: 'todayback', name: 'today and back', selectable: true, setup: 'rich' },
  { id: 'todaykeys', name: 'today keys and undo', selectable: true, setup: 'rich' },
  { id: 'gamepasses', name: 'game passes', selectable: true, setup: 'rich' },
  // #69 decision 5, item 8: the game screen's title block -- one visible h1
  // (the opponent), a sub line with the tip-off and the reused status word --
  // see game-title.mjs.
  { id: 'gametitle', name: 'game title: one h1, opponent + status sub-line', selectable: true, setup: 'rich' },
  { id: 'teamcolor', name: 'team color tints K1 only, and switches with the team', selectable: true, setup: 'rich' },
  { id: 'wakelock', name: 'bench mode wake lock', selectable: true, setup: 'rich' },
  { id: 'overlay', name: 'a11y in overlays and dialogs', selectable: true, setup: 'rich' },
  { id: 'touch', name: `touch targets ≥ 44px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich' },
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
  { id: 'narrow', name: `no sideways pan at ${NARROW}px`, selectable: true, setup: 'rich' },
  { id: 'sweep', name: `no overflow, ${SWEEP_FLOOR}–${SWEEP_HI}px`, selectable: true, setup: 'rich' },
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
