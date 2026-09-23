/* The shared sizes the checks under `scripts/smoke/` measure against and
   `registry.mjs` builds its row names from — moved out of `registry.mjs`
   itself (#124) so a check can read a breakpoint or a floor without
   importing the row list its own module sits in. `registry.mjs` imports
   these same constants for the names it prints, but does not re-export
   them: a second export of the same number is a second path to one fact.
   This module imports nothing, so nothing importing it can create a load
   cycle either. */

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
 * inline in the passes that sweep them -- the row names in `registry.mjs` are
 * built from the same constants the passes measure with, which is the whole
 * point of this module.
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
 * by name (`touch.mjs` twice, `static.mjs`'s `STATIC_A11Y`, `registry.mjs`'s
 * `touch` row, whose `replaces` retires it) and the row below prints it,
 * which was five hand-typed copies of one string until #37 had to change all
 * five at once. A copy that misses is silent rather than loud:
 * `STATIC_A11Y.has(name)` DROPS a verdict whose name it does not recognize,
 * so a stale spelling reads as seven clean pages. */
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
