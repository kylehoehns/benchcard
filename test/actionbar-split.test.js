import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A39. Below 900px the phone action bar is the only bench control; above it,
 * `.gm-start` is. The two breakpoints carry the SAME one control, mutually
 * exclusive, on purpose.
 *
 * Below 900px `#actionbar` is up, pinned in thumb reach, and it holds Start
 * game and its "?"; `.gm-start` repeats both, further down the page, for the
 * width where there is no action bar at all. The obvious "cleanup" is to make
 * one row serve both widths, which silently deletes the phone's thumb reach
 * or the only Start-game control above 900px — hence this file.
 *
 * #29 decision 8 retired `#abCard`, the phone bar's printer button, and moved
 * Print / Share image into `#sheetCard`, a dialog reached from `#shareBtn` in
 * the top bar at every width. So Print is no longer duplicated at two
 * breakpoints — there is one door into it, not two — and this file no longer
 * has anything to say about it; `test/print-gate.test.js` covers the sheet's
 * own gating.
 *
 * Everything here is read out of the shipped source with comments stripped: two
 * guards in this repo have already scored their own explanatory comment, and
 * the notes beside both of these rules name every id they gate.
 */

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

const html = read('app/index.html').replace(/<!--[\s\S]*?-->/g, '');
const css = read('app/app.css').replace(/\/\*[\s\S]*?\*\//g, '');

const bar = (() => {
  const at = html.indexOf('id="actionbar"');
  assert.ok(at > -1, '#actionbar is gone');
  const start = html.lastIndexOf('<div', at);
  return html.slice(start, html.indexOf('</div>', html.indexOf('id="abBench"')) + 6);
})();

test('the phone bar owns bench, and only bench', () => {
  assert.match(bar, /id="abBench"/, 'the action bar lost its bench button');
  assert.doesNotMatch(bar, /id="print"|id="shareCard"/,
    '#29 decision 8: Print/Share moved into #sheetCard — the phone bar must not grow them back');
});

test('below 900px the desktop Start-game row hides, because the bar already has it', () => {
  const at = css.search(/@media \(max-width: 900px\) \{\s*\.gm-start/);
  assert.ok(at > -1,
    'nothing hides .gm-start below 900px — the phone would show Start game twice');
  const rule = css.slice(at, css.indexOf('}', at) + 1);
  assert.match(rule, /display:\s*none/, 'the phone rule does not hide .gm-start');
});

test('the phone bar and the desktop row stay mutually exclusive', () => {
  /* #33 decision 11 (W3) removed the bench "?" this test used to pin at both
     breakpoints. What still has to hold is the reason this file exists at
     all: the bar is display:none above 900px and only turns on inside the
     same query that hides `.gm-start`, so a coach never sees both Start-game
     controls at once. */
  assert.match(css, /\.actionbar \{[^}]*display: none/,
    '.actionbar no longer defaults to display:none — the phone and desktop Start-game rows could both show at once');
  assert.match(css, /@media \(max-width: 900px\) \{ \.actionbar:not\(\[hidden\]\) \{ display: flex/,
    'the action bar is no longer gated on the same 900px breakpoint the desktop row is');
});
