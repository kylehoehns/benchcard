/* #180: `scripts/look.mjs`'s pure parts, at the seams the spec's Proof names:
 * `knownIssueFor` and `reloadsPage` (clip-sweep.mjs, shared with look.mjs),
 * `parseArgs`, `cells`, `slug`, the two "measured nothing" rules, and that
 * importing the module launches nothing. No Chrome here. Expected values are
 * typed from the spec, not recomputed the way the code computes them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { knownIssueFor, reloadsPage, CLIP_STATES } from '../scripts/smoke/clip-sweep.mjs';
import { parseArgs, cells, slug, emptyRunProblem, unscannedProblem } from '../scripts/look.mjs';

/* A list shaped like the entry #187 used to have (`CLIP_SWEEP_KNOWN_ISSUES` is
 * empty now that every filed issue is fixed, so the matcher is fed its own
 * list rather than the live one). */
const LIST_LIKE_187 = [{
  issue: 187,
  reason: "the Today card's pass-title badge breaks a team name mid-word",
  match: p => p.kind === 'split' && p.el === 'span.pass-title',
}];

test('knownIssueFor returns the issue number whose entry matches a finding', () => {
  const finding = { kind: 'split', where: 'today', pos: 'top', el: 'span.pass-title', word: 'Featherstonehaugh' };
  assert.equal(knownIssueFor(finding, LIST_LIKE_187), 187);
});

test('knownIssueFor returns null for a finding no entry matches', () => {
  const finding = { kind: 'clip', where: 'today', pos: 'top', el: 'p.sub', text: 'x', scrollWidth: 400, clientWidth: 300 };
  assert.equal(knownIssueFor(finding, LIST_LIKE_187), null);
});

/* ---------- parseArgs: item 2, refused before Chrome launches ---------- */

const refused = (argv, pattern) => assert.throws(() => parseArgs(argv), pattern);

test('--out is required', () => {
  refused(['--widths', '320'], /--out/);
});

test('an unknown --view is refused by name, and the known names are printed', () => {
  assert.throws(() => parseArgs(['--out', 'o', '--view', 'today,nosuchview']), e => {
    assert.match(e.message, /nosuchview/);
    for (const known of ['today', 'games', 'team', 'season', 'settings', 'plan sheet', 'about']) {
      assert.ok(e.message.includes(known), `the known view "${known}" is not listed in: ${e.message}`);
    }
    return true;
  });
});

test('a width or font that is not a positive integer is refused', () => {
  for (const bad of ['0', '-320', '3.5', 'abc', '320,x', '']) {
    refused(['--out', 'o', '--widths', bad], /width/i);
    refused(['--out', 'o', '--font', bad], /font/i);
  }
});

test('the defaults are widths 320 and 390, fonts 16 and 32, light only, the five app views', () => {
  const a = parseArgs(['--out', 'o']);
  assert.deepEqual(a.widths, [320, 390]);
  assert.deepEqual(a.fonts, [16, 32]);
  assert.equal(a.dark, false);
  assert.deepEqual(a.views, ['today', 'games', 'team', 'season', 'settings']);
  assert.equal(a.out, 'o');
  assert.equal(a.url, null);
});

test('every flag is read', () => {
  const a = parseArgs(['--out', 'o', '--url', 'http://127.0.0.1:8201/', '--widths', '360', '--font', '24',
    '--dark', '--view', 'today,about', '--headful']);
  assert.deepEqual(a.widths, [360]);
  assert.deepEqual(a.fonts, [24]);
  assert.equal(a.dark, true);
  assert.deepEqual(a.views, ['today', 'about']);
  assert.equal(a.url, 'http://127.0.0.1:8201');
  assert.equal(a.headful, true);
});

test('a state name that itself holds a comma survives --view splitting on commas', () => {
  const a = parseArgs(['--out', 'o', '--view', 'add a game, step 1,today,bench mode, undo toast']);
  assert.deepEqual(a.views, ['add a game, step 1', 'today', 'bench mode, undo toast']);
});

/* ---------- cells: item 3, one shot per cell, named predictably ---------- */

test('cells is view x width x font x theme, light plus dark with --dark', () => {
  const list = cells({ views: ['today', 'settings'], widths: [320, 390], fonts: [16, 32], dark: true });
  assert.equal(list.length, 16);
  const stems = list.map(c => c.stem);
  assert.equal(new Set(stems).size, 16, 'two cells share a file name');
  for (const want of ['today-320-16-light', 'today-390-32-dark', 'settings-320-32-light', 'settings-390-16-dark']) {
    assert.ok(stems.includes(want), `no cell named ${want} in ${stems.join(', ')}`);
  }
});

test('cells without --dark is light only', () => {
  const list = cells({ views: ['today'], widths: [320], fonts: [16, 32], dark: false });
  assert.deepEqual(list.map(c => c.stem), ['today-320-16-light', 'today-320-32-light']);
  assert.deepEqual(list[1], { view: 'today', width: 320, font: 32, theme: 'light', stem: 'today-320-32-light' });
});

test('slug lowercases and turns every run of non-alphanumerics into one dash', () => {
  assert.equal(slug('bench mode, undo toast'), 'bench-mode-undo-toast');
  assert.equal(slug('sample flash, ?try= landing'), 'sample-flash-try-landing');
  assert.equal(slug("who's here sheet"), 'who-s-here-sheet');
});

/* ---------- reloadsPage: which states wipe the page they were opened on ---------- */

test('reloadsPage is true for the four states that reload their own fixture and false for the rest', () => {
  const byName = name => CLIP_STATES.find(s => s.name === name);
  assert.equal(reloadsPage({ name: 'x', firstRun: true }), true);
  assert.equal(reloadsPage({ name: 'x', tryLink: 'sample' }), true);
  assert.equal(reloadsPage({ name: 'x', four: true }), true);
  assert.equal(reloadsPage({ name: 'x', firstRunTypedRoster: true }), true);
  assert.equal(reloadsPage({ name: 'x', open: 'noop' }), false);
  assert.equal(reloadsPage({ name: 'x', rotationToast: true }), false);
  assert.equal(reloadsPage(byName('today')), false);
});

/* ---------- a run that measured nothing fails ---------- */

test('a run with zero shots is a failure with a message, one shot is not', () => {
  assert.match(emptyRunProblem(0), /no shot was taken/);
  assert.equal(emptyRunProblem(1), null);
});

test('a shot whose probe scanned zero elements is a failure naming the file, a scan is not', () => {
  assert.match(unscannedProblem('today-320-32-light.png', 0, '127.0.0.1:8201'), /today-320-32-light\.png.*scanned no elements/);
  assert.equal(unscannedProblem('today-320-32-light.png', 412, '127.0.0.1:8201'), null);
});

/* ---------- a flag's value is not another flag ---------- */

test('--out followed by another flag is refused rather than writing into a directory named --dark', () => {
  refused(['--out', '--dark'], /--out/);
  refused(['--out', 'o', '--url', '--headful'], /--url/);
});

/* ---------- importing the module launches nothing ----------
 * In a child process: if `main()` ran on import it would start a server and
 * Chrome and either print or hang past the timeout. */
test('importing scripts/look.mjs exits 0 quickly and prints nothing', () => {
  const r = spawnSync(process.execPath, ['-e',
    "import('./scripts/look.mjs').then(m => { if (typeof m.main !== 'function') process.exit(3); })"],
  { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 8000 });
  assert.equal(r.error, undefined, String(r.error));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout + r.stderr, '');
});
