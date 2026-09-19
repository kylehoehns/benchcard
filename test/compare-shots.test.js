/* #86's own guard: `scripts/compare-shots.mjs`'s three pure rule functions,
 * fed known-bad readings (never recomputed the way the harness itself
 * computes them -- expected values are the spec's own literals) and the
 * shot table's required states. No Chrome here: `SHOTS`, `shotProblems` and
 * `twinProblems` are exported precisely so this file does not have to launch
 * one -- see docs/specs/86-compare-shots.md's Proof section for why these
 * are the named seams and no others.
 *
 * `--bg` values (rgb(244, 244, 246) light, rgb(11, 11, 12) dark) are typed
 * here from `app/tokens.css`/the spec, not imported from the module's own
 * `THEME_BG` -- a test that reads its expected value back out of the code
 * under test can never disagree with it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SHOTS, shotProblems, twinProblems, postCaptureProblems, deviceMetrics } from '../scripts/compare-shots.mjs';
import { VIEWS } from '../scripts/smoke/sweep.mjs';
import { WIDTH } from '../scripts/smoke/dom.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from '../scripts/smoke/registry.mjs';

const LIGHT_BG = 'rgb(244, 244, 246)';
const DARK_BG = 'rgb(11, 11, 12)';

/* ---------- importing the module launches nothing ----------
 *
 * Load bearing for every test below: if `main()` ran on import, this file
 * would try to launch Chrome and serve `app/` just by requiring the module,
 * and every assertion here would really be testing a live browser session it
 * never asked for. */
test('importing scripts/compare-shots.mjs does not launch Chrome or serve app/', () => {
  assert.ok(Array.isArray(SHOTS), 'SHOTS did not come back as an array on import');
  assert.equal(typeof shotProblems, 'function');
  assert.equal(typeof twinProblems, 'function');
});

/* ---------- SHOTS: item 5, the required states ---------- */

function plainShotsFor(view, theme) {
  return SHOTS.filter(s => s.view === view && s.theme === theme
    && !s.longNames && !s.bottom && !s.full && !s.firstRun && !s.titleCollapsed
    && !s.partPlayed && s.width === WIDTH && s.rootPx === 16);
}

/* "a light/dark pair and nothing else" -- the claim nine of the tests below
 * make about their own state, in one place so a tenth cannot make it
 * differently or make half of it. `label` keeps each failure naming the state
 * it is about; the two assertions are the ones every one of them wrote out by
 * hand, unchanged. */
function assertLightDarkPair(shots, label) {
  assert.equal(shots.length, 2, `want a light+dark ${label} shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
}

// The two shots `pair()` builds for one state name, found by name rather than
// by the modifiers that happen to be set on them.
const namedPair = name => SHOTS.filter(s => s.name === `${name}-light` || s.name === `${name}-dark`);

test('SHOTS covers every VIEWS name in both light and dark', () => {
  for (const v of VIEWS) {
    assert.equal(plainShotsFor(v.name, 'light').length, 1,
      `want exactly one plain light shot for view "${v.name}"`);
    assert.equal(plainShotsFor(v.name, 'dark').length, 1,
      `want exactly one plain dark shot for view "${v.name}"`);
  }
});

test('SHOTS includes a long real name, light and dark', () => {
  assertLightDarkPair(SHOTS.filter(s => s.longNames), 'long-name');
});

test('SHOTS includes a screen scrolled to its bottom, light and dark', () => {
  /* `!s.partPlayed` so #34's own bottom-scrolled large-text cell below is not
     read as a third member of this plain light/dark pair, and `s.width ===
     WIDTH` so #35's `wide-bottom` pair (the same scroll at 1280px, where both
     panes are on screen) is not either. Both are narrowings of the filter,
     not of the claim: this test still says there is exactly one
     bottom-scrolled pair at the phone width every other plain shot uses. */
  assertLightDarkPair(SHOTS.filter(s => s.bottom && !s.partPlayed && s.width === WIDTH), 'bottom-scrolled');
});

test('SHOTS includes a full-height capture, light and dark', () => {
  assertLightDarkPair(SHOTS.filter(s => s.full && !s.partPlayed), 'full-height');
});

test('SHOTS includes exactly one 320px/32px-root shot, light only, no twin', () => {
  const shots = SHOTS.filter(s => s.width === LARGE_TEXT_WIDTH && s.rootPx === LARGE_TEXT_PX
    && !s.partPlayed && !s.firstRunStep);
  assert.equal(shots.length, 1, `want exactly one 320px/32px shot, found ${shots.length}`);
  assert.equal(shots[0].theme, 'light', 'the large-text cell is about layout and runs light only');
  assert.ok(!shots[0].twin, 'the large-text cell never runs dark, so it should declare no twin');
});

// #36 item 10: the same 320px/32px repro cell, applied to the first-run
// flow's own step 1 -- kept in its own domain (`s.firstRunStep`) the same
// way `resume-bar-320` below is kept out of the plain cell's count above,
// rather than widening that count to mean two different things.
test('SHOTS includes exactly one first-run 320px/32px shot, light only, no twin', () => {
  const shots = SHOTS.filter(s => s.width === LARGE_TEXT_WIDTH && s.rootPx === LARGE_TEXT_PX && s.firstRunStep);
  assert.equal(shots.length, 1, `want exactly one first-run 320px/32px shot, found ${shots.length}`);
  assert.equal(shots[0].theme, 'light', 'the large-text cell is about layout and runs light only');
  assert.ok(!shots[0].twin, 'the first-run 320px/32px cell never runs dark, so it should declare no twin');
});

test('SHOTS includes the empty first-run screen, light and dark', () => {
  assertLightDarkPair(SHOTS.filter(s => s.firstRun), 'first-run');
});

/* #33 decision 1's `.bar.title-in` state -- item 11's own required addition
 * to this table. A screen scrolled just past its `[data-large-title]`, not
 * to the bottom (that is the `bottom` state above, and a different scroll
 * depth); `capture()` verifies `.bar` actually carries `title-in` after the
 * scroll before writing the PNG, so a shot that never collapsed cannot read
 * as one that did. */
test('SHOTS includes the title-collapsed state, light and dark', () => {
  const shots = SHOTS.filter(s => s.titleCollapsed);
  assertLightDarkPair(shots, 'title-collapsed');
  assert.ok(shots.every(s => !s.bottom && !s.full),
    'the title-collapsed shot should be its own scroll depth, not reuse bottom/full');
});

/* #34 decision 16: the part-played bar on Today, behind one new
 * `partPlayed` flag -- `plainShotsFor` above excludes it, or these would be
 * read as a second plain Today pair and `plainShotsFor('today', ...)` would
 * find two. */
test('SHOTS includes the resume-bar pair, light and dark', () => {
  assertLightDarkPair(SHOTS.filter(s => s.partPlayed && s.view === 'today'
    && !s.full && s.width === WIDTH && s.rootPx === 16), 'resume-bar');
});

test('SHOTS includes the resume-bar-full pair, light and dark', () => {
  assertLightDarkPair(SHOTS.filter(s => s.partPlayed && s.full), 'resume-bar-full');
});

test('SHOTS includes exactly one resume-bar-320 shot, light only, no twin', () => {
  const shots = SHOTS.filter(s => s.partPlayed && !s.bottom
    && s.width === LARGE_TEXT_WIDTH && s.rootPx === LARGE_TEXT_PX);
  assert.equal(shots.length, 1, `want exactly one resume-bar-320 shot, found ${shots.length}`);
  assert.equal(shots[0].theme, 'light', 'the wrapping cell is about layout and runs light only');
  assert.ok(!shots[0].twin, 'resume-bar-320 never runs dark, so it should declare no twin');
});

/* AND THAT SAME CELL SCROLLED TO ITS END, which nothing above covers and
 * which is the one place the bar's own height can strand content. The plain
 * `bottom` pair is Season at 390px/16px; `resume-bar-full` is a
 * full-document capture, so it shows the whole page at once and never shows
 * a fixed bar against the LAST screenful. Measured on this tree before the
 * clearance fix: a 310px bar over 208px of `.wrap` padding left
 * `#todaySeason` 84px underneath it with nowhere left to scroll. Light only,
 * for the same reason as the other large-text cells -- layout, not paint. */
test('SHOTS includes the resume bar at 320px/32px scrolled to its bottom', () => {
  const shots = SHOTS.filter(s => s.partPlayed && s.bottom
    && s.width === LARGE_TEXT_WIDTH && s.rootPx === LARGE_TEXT_PX);
  assert.equal(shots.length, 1, `want exactly one resume-bar-bottom-320 shot, found ${shots.length}`);
  assert.equal(shots[0].theme, 'light', 'the wrapping cell is about layout and runs light only');
  assert.ok(!shots[0].twin, 'resume-bar-bottom-320 never runs dark, so it should declare no twin');
});

/* #35 decision 15 and Proof 5: the wide layout's own look check. Four states
 * -- Today and the game side by side, the game screen itself, both panes at
 * the bottom of a long scroll, and the breakpoint itself at 840px -- each
 * light and dark.
 *
 * `mobile: false` is the point of the flag: every
 * `Emulation.setDeviceMetricsOverride` in the harness hardcoded `mobile:
 * true`, which paints a 1280px laptop as a 1280px phone (touch emulation,
 * mobile viewport handling). The widths and the flag are typed here from the
 * spec, not read back out of the table they describe. */
test('SHOTS includes the four wide states, light and dark, captured as a laptop', () => {
  const WIDE = [['wide-today', 1280], ['wide-game', 1280], ['wide-bottom', 1280], ['wide-840', 840]];
  for (const [name, width] of WIDE) {
    const shots = namedPair(name);
    assertLightDarkPair(shots, name);
    for (const s of shots) {
      assert.equal(s.width, width, `${s.name} is captured at ${s.width}px, want ${width}px`);
      assert.equal(s.mobile, false,
        `${s.name} is captured with mobile: ${s.mobile} -- a ${width}px laptop shot is not a phone`);
    }
  }
});

/* #37: the middle phone width. The touch floor is swept at 320, 360 and 390,
 * and every shot above is 320, 390 or wider -- so the width where a control
 * is widest before it has to wrap, and where a roster name is closest to its
 * row's edge, was the one nobody ever looked at. Team carries the roster rows
 * criterion 2 measures; settings carries the rows criterion 1 raised. 360 is
 * typed here from the spec rather than read out of `TOUCH_WIDTHS`, the same
 * independent second reading the 600px test above takes. */
test('SHOTS includes the 360px pairs, light and dark', () => {
  for (const name of ['touch-360-team', 'touch-360-settings']) {
    const shots = namedPair(name);
    assertLightDarkPair(shots, name);
    for (const s of shots) {
      assert.equal(s.width, 360, `${s.name} is captured at ${s.width}px, want 360px`);
      assert.equal(s.rootPx, 16, `${s.name} asks for a ${s.rootPx}px root -- this pair is about width, not text size`);
    }
  }
});

/* The flag has to reach the override, or it is a field nobody reads.
 * `deviceMetrics` is the one place the `Emulation.setDeviceMetricsOverride`
 * payload is built, exported for the same reason `shotProblems` is: it is
 * pure, so the rule can be checked without launching Chrome. Height is passed
 * in because a full-height shot grows it after the first override. */
test('deviceMetrics carries the shot\'s own mobile flag into the override', () => {
  assert.equal(typeof deviceMetrics, 'function',
    'compare-shots.mjs does not export deviceMetrics, so nothing proves the mobile flag is ever read');
  assert.deepEqual(deviceMetrics({ width: 1280, mobile: false }, 844),
    { width: 1280, height: 844, deviceScaleFactor: 2, mobile: false },
    'a laptop shot still asks Chrome for a phone');
  assert.deepEqual(deviceMetrics({ width: 390, mobile: true }, 844),
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  // The default is the phone every shot before #35 was.
  assert.equal(deviceMetrics({ width: 390 }, 844).mobile, true,
    'a shot that declares no mobile flag must still be captured as a phone');
});

test('every shot in SHOTS declares a mobile flag', () => {
  const missing = SHOTS.filter(s => typeof s.mobile !== 'boolean').map(s => s.name);
  assert.deepEqual(missing, [],
    `these shots declare no mobile flag, so what Chrome is asked for is decided elsewhere: ${missing.join(', ')}`);
});

/* #35 decision 15 and Proof 5's last state: the centered sheet at 600px,
 * light and dark. 600 is the spec's own breakpoint, typed here rather than
 * imported from the registry the harness reads -- the two disagreeing is the
 * signal this test exists to give.
 *
 * `sheet` is the new modifier: a selector for the dialog plus the click that
 * opens it. Both halves are required, because the click is what capture()
 * runs and the selector is what it then asserts actually opened -- the same
 * "prove the modifier happened" shape `bottom` and `titleCollapsed` already
 * have, and the reason #34's part-played bottom cell shipped byte-identical
 * to the unscrolled one. */
test('SHOTS includes the centered-sheet pair at 600px, light and dark', () => {
  const shots = namedPair('mid-sheet');
  assertLightDarkPair(shots, 'mid-sheet');
  for (const s of shots) {
    assert.equal(s.width, 600, `${s.name} is captured at ${s.width}px, want 600px -- the sheet band starts there`);
    assert.equal(s.view, 'games',
      `${s.name} opens on ${s.view}, but the card sheet is reached from the game screen's own chrome`);
    assert.ok(s.sheet && typeof s.sheet.selector === 'string' && s.sheet.selector,
      `${s.name} names no sheet selector, so nothing proves the dialog ever opened`);
    assert.ok(s.sheet && typeof s.sheet.open === 'string' && s.sheet.open.includes('click'),
      `${s.name} names no click to open the sheet, so the shot would be of the game screen`);
  }
});

/* ---------- shotProblems: items 2 and 3 ---------- */

test('shotProblems: a measured 16px root against a requested 32px root is reported', () => {
  const want = { name: 'large-text-320', theme: 'light', rootPx: 32 };
  const got = { fontSizePx: 16, bg: LIGHT_BG };
  const problems = shotProblems(want, got);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /16px/);
  assert.match(problems[0], /32px/);
});

test('shotProblems: within 0.5px of the requested root is not reported', () => {
  const want = { name: 'today-light', theme: 'light', rootPx: 16 };
  const got = { fontSizePx: 16.4, bg: LIGHT_BG };
  assert.deepEqual(shotProblems(want, got), []);
});

test('shotProblems: a light paint under a shot that claims dark is reported', () => {
  const want = { name: 'today-dark', theme: 'dark', rootPx: 16 };
  const got = { fontSizePx: 16, bg: LIGHT_BG };
  const problems = shotProblems(want, got);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /rgb\(244, 244, 246\)/);
  assert.match(problems[0], /rgb\(11, 11, 12\)/);
});

test('shotProblems: the correct root and the correct paint is trustworthy', () => {
  const want = { name: 'today-dark', theme: 'dark', rootPx: 16 };
  const got = { fontSizePx: 16, bg: DARK_BG };
  assert.deepEqual(shotProblems(want, got), []);
});

/* ---------- postCaptureProblems: bug 1's runtime guard ----------
 *
 * `Page.captureScreenshot` with `captureBeyondViewport: true` resizes the
 * renderer internally, which drops the `Page.setFontSizes` override *after*
 * `shotProblems` already banked a clean pre-capture reading. This rule
 * re-compares a post-capture reading against the pre-capture one so a
 * capture call that changes the rendering is caught, not just a bad setup. */

test('postCaptureProblems: post-capture reading matches pre-capture reading is trustworthy', () => {
  const want = { name: 'large-text-320' };
  const pre = { fontSizePx: 32, bg: LIGHT_BG };
  const post = { fontSizePx: 32, bg: LIGHT_BG };
  assert.deepEqual(postCaptureProblems(want, pre, post), []);
});

test('postCaptureProblems: post-capture root 16 where pre-capture measured 32 is reported', () => {
  const want = { name: 'large-text-320' };
  const pre = { fontSizePx: 32, bg: LIGHT_BG };
  const post = { fontSizePx: 16, bg: LIGHT_BG };
  const problems = postCaptureProblems(want, pre, post);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /16px/);
  assert.match(problems[0], /32px/);
  assert.match(problems[0], /post-capture/i);
});

test('postCaptureProblems: post-capture paint flipped from the pre-capture paint is reported', () => {
  const want = { name: 'today-dark' };
  const pre = { fontSizePx: 16, bg: DARK_BG };
  const post = { fontSizePx: 16, bg: LIGHT_BG };
  const problems = postCaptureProblems(want, pre, post);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /rgb\(11, 11, 12\)/);
  assert.match(problems[0], /rgb\(244, 244, 246\)/);
  assert.match(problems[0], /post-capture/i);
});

test('postCaptureProblems: a missing/NaN post-capture font-size reading is reported, not skipped', () => {
  const want = { name: 'today-light' };
  const pre = { fontSizePx: 16, bg: LIGHT_BG };
  const post = { fontSizePx: NaN, bg: LIGHT_BG };
  const problems = postCaptureProblems(want, pre, post);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /no post-capture root font size/i);
});

test('postCaptureProblems: a missing post-capture paint reading is reported, not skipped', () => {
  const want = { name: 'today-light' };
  const pre = { fontSizePx: 16, bg: LIGHT_BG };
  const post = { fontSizePx: 16, bg: undefined };
  const problems = postCaptureProblems(want, pre, post);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /no post-capture background paint/i);
});

/* ---------- twinProblems: item 4, all four states named in the spec ---------- */

test('twinProblems: no shots at all fails -- measured nothing to compare', () => {
  const problems = twinProblems([]);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /no shot/i);
});

test('twinProblems: shots with no twin declared fails the same way', () => {
  const records = [
    { name: 'today-light', twin: null, digest: 'aaa' },
    { name: 'today-dark', twin: null, digest: 'bbb' },
  ];
  const problems = twinProblems(records);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /no shot/i);
});

test('twinProblems: one matched pair that differs is trustworthy', () => {
  const records = [
    { name: 'today-light', twin: 'today-dark', digest: 'aaa' },
    { name: 'today-dark', twin: 'today-light', digest: 'bbb' },
  ];
  assert.deepEqual(twinProblems(records), []);
});

test('twinProblems: one matched pair that is identical fails, naming both files', () => {
  const records = [
    { name: 'today-light', twin: 'today-dark', digest: 'same-digest' },
    { name: 'today-dark', twin: 'today-light', digest: 'same-digest' },
  ];
  const problems = twinProblems(records);
  assert.equal(problems.length, 1, `want exactly one problem, got ${JSON.stringify(problems)}`);
  assert.match(problems[0], /today-light/);
  assert.match(problems[0], /today-dark/);
});

/* ---------- the source itself: item 2's captureBeyondViewport clause ----------
 *
 * A plain `!src.includes('captureBeyondViewport: true')` passes on
 * `captureBeyondViewport:true` (no space), on `captureBeyondViewport: flag`,
 * and on any other truthy spelling -- so the property is matched by regex and
 * compared against the literal `false`, not against one exact spelling of
 * `true`. And per /new-guard rule 2a, a check that measured nothing fails: a
 * file with no `Page.captureScreenshot` call in it at all must not read
 * clean, so that is asserted first. */

test('scripts/compare-shots.mjs never passes captureBeyondViewport as anything but false', () => {
  const src = readFileSync(fileURLToPath(new URL('../scripts/compare-shots.mjs', import.meta.url)), 'utf8');
  assert.ok(src.includes('Page.captureScreenshot'),
    'the source has no Page.captureScreenshot call at all -- this guard checks a flag on a call that has to exist for the check to have measured anything');
  const match = src.match(/captureBeyondViewport\s*:\s*([^\s,}]+)/);
  assert.ok(!match || match[1] === 'false',
    `found captureBeyondViewport set to ${match ? match[1] : ''} -- bug 1, the font-size override this harness exists to protect would be silently dropped on the resize captureScreenshot does internally. Grow the viewport with Emulation.setDeviceMetricsOverride instead.`);
});
