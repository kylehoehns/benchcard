/* #35's own guard (docs/specs/35-wide-screens.md, Proof 1), under
 * `/new-guard`. It reads `app/app.css` and `app/render.js` as text, which is
 * the weakest kind of check in this repo -- so it is named in the spec's Proof
 * section as a guard on purpose, and every assertion below is written so that
 * measuring nothing FAILS rather than reads clean (rule 2a).
 *
 * What it holds:
 *   - both new blocks exist and both are `screen`-scoped, so print is
 *     untouched -- a bare `min-width: 840px` also matches print and would
 *     shove the printed card 360px to the right;
 *   - `WIDE_MIN` in `app/render.js` is the same number as the CSS block's
 *     `min-width`, so the two copies of 840 cannot drift;
 *   - `--rail` is declared exactly once and every other rail rule reads
 *     `var(--rail)` rather than carrying a second `360px`;
 *   - the sheet's 560px cap appears only inside the 600px block, so nothing
 *     below 600px changes (What would settle it, item 5);
 *   - the three action-bar gates read `max-width: 839px`, pairing with the
 *     new `min-width: 840px` the way 1099/1100 already pair.
 *
 * Comments are stripped first: two guards in this repo have already scored
 * their own explanatory comment, and this file's subject -- a pixel count and
 * a media query -- is exactly the sort of thing prose repeats.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
/* Proof 2's seam is the same ticket's, so it lives in the same file: the two
 * predicates, imported and called. Everything below the guards is a behavior
 * test -- real functions, real arguments, no source text.
 *
 * The spec says to import `app/render.js` "the way `test/render-sections.test.js`
 * already imports that module", but that file does not import it: it reads the
 * source as text, and says why in its own header -- render.js pulls in fifteen
 * view modules and touches the DOM at import time. So it is imported here the
 * way `test/trap.test.js` imports a module with the same problem: `dom-stub.js`
 * first, for its side effect on globalThis. */
import './dom-stub.js';
import { todayPaneShowing, gamePaneShowing } from '../app/render.js';

const ROOT = new URL('../', import.meta.url);
// Both files are read the same way -- text, with the comments stripped, for
// the reason the header gives -- so the stripping is part of the read rather
// than a regex repeated at each call.
const source = f => readFileSync(new URL(f, ROOT), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const css = source('app/app.css');
const renderSrc = source('app/render.js');

const SHEET_Q = '@media screen and (min-width: 600px)';
const PANE_Q = '@media screen and (min-width: 840px)';

test('both wide-screen blocks exist and both are screen-scoped, so print is untouched', () => {
  assert.ok(css.includes(SHEET_Q),
    `app/app.css has no "${SHEET_Q}" block -- decision 11's centered sheet has nowhere to live`);
  assert.ok(css.includes(PANE_Q),
    `app/app.css has no "${PANE_Q}" block -- decision 4's left rail has nowhere to live`);
  /* The failure mode this clause exists for: `@media (min-width: 840px)`
     without `screen and` also matches print, and the two-pane block's
     `margin-left: var(--rail)` would then shove the printed card 360px to
     the right on every sheet of paper. */
  for (const px of [600, 840]) {
    const bare = new RegExp(String.raw`@media\s*\(\s*min-width:\s*${px}px\s*\)`);
    assert.ok(!bare.test(css),
      `a bare "@media (min-width: ${px}px)" matches print too -- write it as "@media screen and (min-width: ${px}px)"`);
  }
});

/* The two copies of 840: `WIDE_MIN` in `app/render.js` (decision 8, the
 * argument to the two predicates' `matchMedia`) and the CSS block's own
 * `min-width` (decision 4). Neither can be derived from the other -- one is a
 * JavaScript number and the other is a media feature -- so the only thing
 * that can stop them drifting is an assertion that reads both. */
test('WIDE_MIN in render.js is the same number as the wide block\'s min-width', () => {
  const m = renderSrc.match(/export const WIDE_MIN = (\d+);/);
  assert.ok(m, 'app/render.js no longer exports WIDE_MIN -- the predicates have no breakpoint to read');
  const wideMin = Number(m[1]);
  assert.equal(wideMin, 840,
    `WIDE_MIN is ${wideMin}px; the spec's wide band starts at 840px (What would settle it, items 1 and 3)`);
  assert.ok(css.includes(`@media screen and (min-width: ${wideMin}px)`),
    `app/app.css has no "@media screen and (min-width: ${wideMin}px)" block, so the CSS and WIDE_MIN have drifted apart`);
  /* And the query the predicates are actually asked at, built from that same
     constant rather than a second literal -- a `matchMedia('(min-width:
     840px)')` typed out by hand would go on matching while WIDE_MIN moved. */
  assert.match(renderSrc, /matchMedia\(`\(min-width: \$\{WIDE_MIN\}px\)`\)/,
    'the wide media query in render.js is not built from WIDE_MIN, so it is a third copy of the breakpoint');
});

/* `--rail` is the 360px column (decision 4), and the "reuse, do not
 * re-derive" constraint says it is declared once and read with `var(--rail)`
 * everywhere else -- the rail's own width, the right pane's `margin-left`
 * and the Resume bar's width are three rules that must move together, and a
 * second `360px` typed into any of them is how they stop.
 *
 * Both directions, so neither a deleted declaration nor an added literal
 * reads clean: the declarations are counted (exactly one) AND the readers are
 * counted (rule 2a -- a file with no `var(--rail)` in it at all has measured
 * nothing and must not pass) AND every `360px` in the sheet is required to be
 * that one declaration. */
test('--rail is declared once, and every other rail rule reads var(--rail)', () => {
  const decls = [...css.matchAll(/--rail\s*:/g)];
  assert.equal(decls.length, 1,
    `--rail is declared ${decls.length} times; decision 4 declares it once, on :root inside the wide block`);
  const readers = [...css.matchAll(/var\(--rail\)/g)];
  assert.ok(readers.length >= 3,
    `only ${readers.length} rule(s) read var(--rail) -- the rail's own width, the right pane's margin-left `
    + 'and the Resume bar all have to read it, so this guard has measured almost nothing');
  const literals = [...css.matchAll(/360px/g)];
  assert.equal(literals.length, 1,
    `360px appears ${literals.length} times in app.css; exactly one of them may exist and it is the --rail declaration itself`);
  assert.match(css, /--rail:\s*360px/,
    'the one 360px left in app.css is not the --rail declaration, so the rail width has been re-derived somewhere else');
});

/* The extent of one block, by balanced braces rather than "up to the next
 * `\n}`": both new blocks nest rules (and the 600px one nests a whole
 * `@media (prefers-reduced-motion: no-preference)`), so a line-shaped scan
 * would cut the block short and then report the rules it never read as
 * "outside the block" -- a false RED, which is the mirror of the false green
 * /new-guard warns about and just as useless. */
function blockAt(source, header) {
  const at = source.indexOf(header);
  assert.ok(at > -1, `"${header}" is not in app/app.css`);
  const open = source.indexOf('{', at);
  assert.ok(open > -1, `"${header}" has no body`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return { start: at, end: i + 1, body: source.slice(at, i + 1) };
  }
  assert.fail(`"${header}" is never closed -- app.css has an unbalanced brace`);
}

/* What would settle it, item 5: below 600px nothing changes. The sheet's
 * 560px cap is the single declaration that most obviously breaks that if it
 * escapes its block -- a sheet capped at 560px on a 390px phone is the bottom
 * sheet the whole app is built around, three centimetres narrower than the
 * screen -- so it is the one pinned.
 *
 * Only WIDTH declarations count. `560px` is already in this sheet twice as a
 * landscape `max-height`, and folding those in would make this assertion a
 * statement about an unrelated rule. */
test("the sheet's 560px cap appears only inside the 600px block", () => {
  const widthCaps = [...css.matchAll(/(?:^|[;{\s])(?:max-width|width)\s*:\s*[^;}]*560px[^;}]*/g)];
  assert.ok(widthCaps.length >= 2,
    `found ${widthCaps.length} width declaration(s) naming 560px -- decision 11 writes two `
    + '(`width: min(560px, ...)` and `max-width: 560px`), so this guard has measured almost nothing');
  const sheet = blockAt(css, SHEET_Q);
  for (const m of widthCaps) {
    assert.ok(m.index >= sheet.start && m.index < sheet.end,
      `a 560px width cap sits outside the ${SHEET_Q} block ("${m[0].trim()}") -- `
      + 'below 600px the sheet must be untouched, down to the last pixel');
  }
});

/* Decision 7's first consequence. The floating Start-game bar is a
 * narrow-screen affordance: above 840px the game lives in the right pane and
 * the inline `.gm-start` row carries Start game there, so the three gates
 * that own the split pair with the new `min-width: 840px` the way 1099/1100
 * already pair. Left at 900px they would leave a 60px band -- 840 to 899 --
 * where the coach sees BOTH Start-game controls at once, which is the exact
 * bug `test/actionbar-split.test.js` exists to prevent.
 *
 * Counted before anything is read out of them (rule 2a), and the old literal
 * is required to be gone: a gate left at 900px is the same 60px band with one
 * rule in it instead of three. */
const GATE_Q = '@media (max-width: 839px)';

test('the three action-bar gates read max-width: 839px, not 900px', () => {
  const bodies = [];
  for (let from = 0; ;) {
    const at = css.indexOf(GATE_Q, from);
    if (at === -1) break;
    const b = blockAt(css.slice(at), GATE_Q);
    bodies.push(b.body);
    from = at + b.end;
  }
  assert.equal(bodies.length, 3,
    `found ${bodies.length} "${GATE_Q}" block(s); decision 7 moves exactly three gates to that boundary`);
  const ANCHORS = [
    ['.actionbar:not([hidden])', "the phone action bar's own display: flex"],
    ['.wrap { padding-bottom', "the document's clearance under the floating bar"],
    ['.gm-start', "the inline Start-game row's display: none"],
  ];
  for (const [anchor, what] of ANCHORS) {
    assert.ok(bodies.some(b => b.includes(anchor)),
      `no 839px gate carries ${anchor} (${what}) -- it is still on the old boundary, so between `
      + '840 and 899px the coach would see both Start-game controls at once');
  }
  assert.ok(!css.includes('@media (max-width: 900px)'),
    'a "@media (max-width: 900px)" gate is still in app.css -- all three move to 839px so they pair with min-width: 840px');
});

/* Decision 8. Today's four mini rotations used to be guarded with
 * `state.view === 'today'` (#26 decision 6: do not build what nobody can see).
 * At 840px and up Today is the left rail whatever the current screen is, so
 * the question the guard has to ask changed from "is this the current screen?"
 * to "is this pane on screen?" -- which is what these two functions answer.
 *
 * Pure functions of `(view, wide)`, so every case is a call. The five views
 * are the five the app has apart from welcome, which is a full-width screen at
 * every width and has no panes at all (decision 4). */
const VIEWS = ['today', 'games', 'team', 'season', 'settings'];

test("on a narrow screen Today's pane paints only on Today", () => {
  assert.equal(todayPaneShowing('today', false), true,
    'Today is the current screen on a phone and its passes still would not paint');
  for (const view of VIEWS.filter(v => v !== 'today')) {
    assert.equal(todayPaneShowing(view, false), false,
      `Today's pane claims to be on screen under ${view} on a phone, where one screen is all there is -- `
      + '#26 decision 6 skips that work for a reason');
  }
});

/* The other half of decision 8's first predicate, and the reason it exists:
   at 840px and up Today is the rail, so it is on screen under the game screen,
   under Team, under Season and under Settings. Its four mini rotations have to
   be built on all five. */
test('at 840px and up Today paints whatever screen is current, because it is the rail', () => {
  for (const view of VIEWS) {
    assert.equal(todayPaneShowing(view, true), true,
      `Today's pane is dark under ${view} on a wide screen, where the rail is on screen beside it -- `
      + 'the coach would be looking at a stale rotation');
  }
});

/* Decision 8's second predicate, narrow half. Nothing changes on a phone: the
   game screen's own header is built when the game screen is the current
   screen, which is the guard #26 decision 6 left behind. */
test('on a narrow screen the game pane paints only on the game screen', () => {
  assert.equal(gamePaneShowing('games', false), true,
    'the game screen is open on a phone and its header still would not paint');
  for (const view of VIEWS.filter(v => v !== 'games')) {
    assert.equal(gamePaneShowing(view, false), false,
      `the game pane claims to be on screen under ${view} on a phone, where one screen is all there is`);
  }
});

/* Decision 7, at the level where the decision is actually made. At 840px and
   up the open game is the right pane's RESTING state, so it is on screen on
   Today as well as on the game screen -- that is the arrangement the ticket is
   named after. Team, Season and Settings COVER it, so under those three the
   game pane is genuinely off screen and must not be painted; that is also what
   makes "back puts the game back" mean something. */
test('at 840px and up the game pane is on screen on Today too, but Team, Season and Settings cover it', () => {
  assert.equal(gamePaneShowing('games', true), true,
    'the game screen is the current screen on a wide window and its header would not paint');
  assert.equal(gamePaneShowing('today', true), true,
    'on a wide window Today is the rail and the open game is the right pane beside it -- '
    + 'the game pane is on screen and has to be painted');
  for (const view of ['team', 'season', 'settings']) {
    assert.equal(gamePaneShowing(view, true), false,
      `${view} covers the game in the right pane (decision 7), so the game pane is not on screen `
      + 'and painting it is the wasted work #26 decision 6 removed');
  }
});
