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

import { SHOTS, shotProblems, twinProblems, postCaptureProblems } from '../scripts/compare-shots.mjs';
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

test('SHOTS covers every VIEWS name in both light and dark', () => {
  for (const v of VIEWS) {
    assert.equal(plainShotsFor(v.name, 'light').length, 1,
      `want exactly one plain light shot for view "${v.name}"`);
    assert.equal(plainShotsFor(v.name, 'dark').length, 1,
      `want exactly one plain dark shot for view "${v.name}"`);
  }
});

test('SHOTS includes a long real name, light and dark', () => {
  const shots = SHOTS.filter(s => s.longNames);
  assert.equal(shots.length, 2, `want a light+dark long-name shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
});

test('SHOTS includes a screen scrolled to its bottom, light and dark', () => {
  // `!s.partPlayed` so #34's own bottom-scrolled large-text cell below is not
  // read as a third member of this plain light/dark pair.
  const shots = SHOTS.filter(s => s.bottom && !s.partPlayed);
  assert.equal(shots.length, 2, `want a light+dark bottom-scrolled shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
});

test('SHOTS includes a full-height capture, light and dark', () => {
  const shots = SHOTS.filter(s => s.full && !s.partPlayed);
  assert.equal(shots.length, 2, `want a light+dark full-height shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
});

test('SHOTS includes exactly one 320px/32px-root shot, light only, no twin', () => {
  const shots = SHOTS.filter(s => s.width === LARGE_TEXT_WIDTH && s.rootPx === LARGE_TEXT_PX && !s.partPlayed);
  assert.equal(shots.length, 1, `want exactly one 320px/32px shot, found ${shots.length}`);
  assert.equal(shots[0].theme, 'light', 'the large-text cell is about layout and runs light only');
  assert.ok(!shots[0].twin, 'the large-text cell never runs dark, so it should declare no twin');
});

test('SHOTS includes the empty first-run screen, light and dark', () => {
  const shots = SHOTS.filter(s => s.firstRun);
  assert.equal(shots.length, 2, `want a light+dark first-run shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
});

/* #33 decision 1's `.bar.title-in` state -- item 11's own required addition
 * to this table. A screen scrolled just past its `[data-large-title]`, not
 * to the bottom (that is the `bottom` state above, and a different scroll
 * depth); `capture()` verifies `.bar` actually carries `title-in` after the
 * scroll before writing the PNG, so a shot that never collapsed cannot read
 * as one that did. */
test('SHOTS includes the title-collapsed state, light and dark', () => {
  const shots = SHOTS.filter(s => s.titleCollapsed);
  assert.equal(shots.length, 2, `want a light+dark title-collapsed shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
  assert.ok(shots.every(s => !s.bottom && !s.full),
    'the title-collapsed shot should be its own scroll depth, not reuse bottom/full');
});

/* #34 decision 16: the part-played bar on Today, behind one new
 * `partPlayed` flag -- `plainShotsFor` above excludes it, or these would be
 * read as a second plain Today pair and `plainShotsFor('today', ...)` would
 * find two. */
test('SHOTS includes the resume-bar pair, light and dark', () => {
  const shots = SHOTS.filter(s => s.partPlayed && s.view === 'today'
    && !s.full && s.width === WIDTH && s.rootPx === 16);
  assert.equal(shots.length, 2, `want a light+dark resume-bar shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
});

test('SHOTS includes the resume-bar-full pair, light and dark', () => {
  const shots = SHOTS.filter(s => s.partPlayed && s.full);
  assert.equal(shots.length, 2, `want a light+dark resume-bar-full shot, found ${shots.length}`);
  assert.deepEqual(shots.map(s => s.theme).sort(), ['dark', 'light']);
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
