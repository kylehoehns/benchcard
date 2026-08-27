import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A39. Below 900px the in-card row keeps Share card only, and the two
 * breakpoints carry DIFFERENT rows on purpose.
 *
 * Below 900px `#actionbar` is up, pinned in thumb reach, and it holds bench and
 * print; `.gm-cta` repeated both about two screens down the page. Above 900px
 * there is no action bar at all, so `.gm-cta` is the only path to any of them
 * and keeps everything. The obvious "cleanup" is to make one row serve both
 * widths, which silently deletes either the phone's thumb reach or desktop's
 * only Print button — hence this file.
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
  return html.slice(start, html.indexOf('</div>', html.indexOf('id="abCard"')) + 6);
})();

const cta = (() => {
  const at = html.indexOf('class="gm-cta noprint"');
  assert.ok(at > -1, '.gm-cta is gone');
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('s-cardopts', at);
  assert.ok(end > start, 'cannot find the end of the in-card button row');
  return html.slice(start, end);
})();

test('the phone bar still owns bench and print', () => {
  assert.match(bar, /id="abBench"/, 'the action bar lost its bench button');
  assert.match(bar, /id="abCard"/, 'the action bar lost its printer');
});

test('below 900px the in-card row hides the two the bar already has', () => {
  /* Match the RULE, not the ids on their own: `#print` and `.gmq` are named in
     half a dozen other places in this file, and one of them is the rule that
     lays `.gmq` out. */
  const at = css.search(/@media \(max-width: 900px\) \{\s*\.gm-cta/);
  assert.ok(at > -1,
    'nothing hides the duplicated bench/print pair below 900px — the phone shows each control twice');
  const rule = css.slice(at, css.indexOf('}', css.indexOf('{', css.indexOf('{', at) + 1)) + 1);
  assert.match(rule, /\.gm-cta\s+\.gmq/,
    'the in-card bench button (and the "?" wrapped with it) is not hidden below 900px');
  assert.match(rule, /\.gm-cta\s+#print/,
    'the in-card Print is not hidden below 900px, so it still duplicates the bar');
  assert.match(rule, /display:\s*none/, 'the phone rule does not hide anything');
  assert.doesNotMatch(rule, /#shareCard/,
    'Share card is the one control the action bar does NOT have — it must survive on a phone');
});

test('#print stays in the DOM: a CSS hide, never `hidden` and never removal', () => {
  /* Three separate mechanisms find this button and none of them can see it if
     it is removed: `card.js`'s `[data-needs-card]` sweep, the handler discovery
     in `test/print-gate.test.js`, and the `p` shortcut, which clicks it from
     any view. A `display: none` button still takes a programmatic click. */
  const btn = cta.match(/<button[^>]*id="print"[^>]*>/)?.[0];
  assert.ok(btn, '#print left the in-card row — the `p` shortcut has nothing to click');
  assert.doesNotMatch(btn, /\shidden(\s|>|=)/,
    '#print must not carry the `hidden` attribute; hide it with CSS or the sweep loses it');
  assert.match(btn, /data-needs-card/, '#print lost its blocked-plan gate');
  assert.match(read('app/shortcuts.js'), /\$\('#print'\)\.click\(\)/,
    'the `p` shortcut no longer clicks #print');
});

test('the bench "?" has a home at BOTH breakpoints, and only one shows at a time', () => {
  /* `#help` cannot be opened from inside game mode — `shortcuts.js` refuses
     every key while a sheet is up — and A20 slice 3 moved the three bench
     scopes off about.html on the promise that `#help` is the surface a coach at
     the bench can reach. That promise is only true while a "?" stands beside
     whichever bench control the viewport has. */
  const q = /data-help="help-bench"/g;
  assert.match(bar, q, 'the phone has no bench "?" — below 900px there is no way into #help at all');
  assert.match(cta, q, 'desktop lost its bench "?" — there is no action bar above 900px');
  assert.equal((html.match(q) || []).length, 2,
    'expected exactly two bench "?" buttons, one per breakpoint');
  /* Mutually exclusive by construction: the bar is display:none above 900px and
     only turns on inside the same query that hides `.gmq`. */
  assert.match(css, /\.actionbar \{[^}]*display: none/,
    '.actionbar no longer defaults to display:none, so both "?" would show at once on desktop');
  assert.match(css, /@media \(max-width: 900px\) \{ \.actionbar:not\(\[hidden\]\) \{ display: flex/,
    'the action bar is no longer gated on the same 900px breakpoint the in-card row is');
});
