import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CHARTS } from '../scripts/charts.mjs';
import { linkedSheets, inlineSheets } from './page-sheets.js';

/* #434: the public pages share one stylesheet, `app/site.css`, and About draws
 * the app's own timeline from `app/timeline.css`.
 *
 * These are guards (/new-guard): they read the tree. Each asserts how many
 * things it measured before it asserts anything about them, because a guard
 * that read nothing is green about nothing.
 *
 *   1. the Hardwood block exists in exactly one file under app/;
 *   2. no public page carries an inline rule that site.css also defines, and
 *      the chart pages carry no inline sheet at all;
 *   3. app.css names no `.tl` / `.tl-*` class: the timeline lives once;
 *   4. About draws the timeline in the markup timeline.js builds, and links
 *      timeline.css; index.html links it right after app.css.
 */

const ROOT = new URL('../app/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const CHART_PAGES = CHARTS.map((c) => c.file);
const PUBLIC = ['about.html', 'advanced.html', '404.html', ...CHART_PAGES];

/* Every rule of a sheet as `context | selector`: the `@media` / `@container`
 * wrappers it sits in, then one entry per selector of its list. Nested blocks
 * are walked by depth, so a rule inside `@media (min-width: 46rem)` is not
 * confused with the same selector outside it. */
function rulesOf(css) {
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of strip(css)) {
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
    } else if (ch === '}') {
      const head = stack.pop();
      if (head !== undefined && !head.startsWith('@')) {
        const ctx = stack.filter((s) => s.startsWith('@')).join(' ');
        for (const sel of head.split(',')) out.push(`${ctx} | ${sel.trim()}`);
      }
      buf = '';
    } else if (ch === ';') {
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

const ownSheet = (html) => inlineSheets(html, { noscript: false }).join('\n');

const hardwoodBlock = /html:root\[data-tint="hardwood"\]\s*\{[^}]*--accent:\s*var\(--tint\)/;

test('the Hardwood block is written once, in site.css', () => {
  const files = readdirSync(ROOT).filter((f) => /\.(css|html|js)$/.test(f));
  assert.ok(files.length > 50, `only ${files.length} files under app/ were scanned`);
  const holders = files.filter((f) => hardwoodBlock.test(strip(read(f))));
  assert.deepEqual(holders, ['site.css']);
  // and its #332 arms came with it
  const site = strip(read('site.css'));
  assert.match(site, /\[data-tint="hardwood"\]\s*\{\s*--accent-text:\s*#B04308/);
  assert.match(site, /prefers-contrast:\s*more/);
});

test('every public page links site.css after tokens.css', () => {
  assert.equal(PUBLIC.length, 11, 'about, advanced, 404 and the eight generated pages');
  for (const p of PUBLIC) {
    const links = linkedSheets(read(p));
    const i = links.indexOf('tokens.css');
    assert.ok(i >= 0, `${p} does not link tokens.css`);
    assert.equal(links[i + (CHART_PAGES.includes(p) ? 2 : 1)], 'site.css',
      `${p} must link site.css after tokens.css (and card.css on a chart page)`);
  }
  assert.match(read('404.html'), /href="\/site\.css"/, '404 links site.css root-relative');
});

test('no public page restates a rule site.css already has', () => {
  const site = new Set(rulesOf(read('site.css')));
  assert.ok(site.size > 80, `site.css yielded only ${site.size} rules`);
  let measured = 0;
  const dupes = [];
  for (const p of PUBLIC) {
    for (const r of rulesOf(ownSheet(read(p)))) {
      measured += 1;
      if (site.has(r)) dupes.push(`${p}: ${r}`);
    }
  }
  assert.ok(measured > 50, `only ${measured} inline rules were read across the pages`);
  assert.deepEqual(dupes, [], 'an inline rule duplicates site.css; delete it or keep it in one place');
});

test('the chart pages carry no inline sheet but the noscript print rule', () => {
  assert.equal(CHART_PAGES.length, 8);
  for (const p of CHART_PAGES) {
    const html = read(p);
    assert.equal(ownSheet(html).trim(), '', `${p} has an inline <style> of its own`);
    assert.match(html, /<noscript><style>button\[onclick="print\(\)"\]/, `${p} lost its noscript rule`);
  }
});

test('the chart pages wear the top bar the guides do: topbar outside .wrap', () => {
  for (const p of CHART_PAGES) {
    const body = read(p).split('<body>')[1].replace(/<!--[\s\S]*?-->/g, '');
    assert.match(body, /^\s*<header class="topbar noprint">\s*<div class="top">/, `${p}: no .topbar > .top`);
    assert.ok(body.indexOf('class="topbar') < body.indexOf('class="wrap"'), `${p}: .topbar is inside .wrap`);
  }
});

test('app.css names no timeline class; timeline.css owns them', () => {
  const app = strip(read('app.css'));
  const named = [...app.matchAll(/([^{}]+)\{/g)]
    .map((m) => m[1].split(';').pop())
    .filter((sel) => /\.tl(?![\w])|\.tl-/.test(sel));
  assert.ok(app.length > 20000, 'app.css was not read');
  assert.deepEqual(named, [], 'app.css still has a .tl selector; it belongs in timeline.css');
  const tl = rulesOf(read('timeline.css')).join('\n');
  for (const sel of ['tl', 'tl-row', 'tl-lab', 'tl-track', 'tl-blk', 'tl-div', 'tl-tot', 'tl-body', 'tl-head', 'tl-periods']) {
    assert.ok(new RegExp(`\\.${sel}(?![\\w-])`).test(tl), `timeline.css has no rule for .${sel}`);
  }
});

test('index.html links timeline.css right after app.css', () => {
  const links = linkedSheets(read('index.html'));
  const i = links.indexOf('app.css');
  assert.ok(i >= 0, 'index.html does not link app.css');
  assert.equal(links[i + 1], 'timeline.css');
});

test('About draws its timeline in the markup timeline.js builds', () => {
  const about = read('about.html');
  assert.deepEqual(linkedSheets(about), ['tokens.css', 'site.css', 'timeline.css']);
  const body = about.replace(/<style[\s\S]*?<\/style>/g, '');
  const fig = body.slice(body.indexOf('class="tl'), body.indexOf('class="tl') + 6000);
  for (const c of ['tl-head', 'tl-periods', 'tl-body', 'tl-row', 'tl-lab', 'tl-track', 'tl-blk', 'tl-div', 'tl-tot', 'num', 'ex']) {
    assert.ok(new RegExp(`class="[^"]*\\b${c}\\b`).test(fig), `About's timeline has no .${c}`);
  }
  assert.ok(!/onblk|<button[^>]*tl-name/.test(body), 'About still draws a .tl-name button or an .onblk divider');
});

/* What timeline.js builds for this squad -- eleven players, sixteen minutes for
 * seven of them and twelve for four -- is `.tl.even` with plain `.tl-tot`s:
 * both ends are more than a third of the squad, so nobody is "the most" or
 * "the fewest" and no total takes the orange or blue (timeline.js drops
 * color-only meaning on purpose). The dot and name sit in a `.tl-name`, which
 * is what centers them in the one-row layout (timeline.css gives `.tl-lab`
 * `align-items: stretch` there); on About it is a span, since nothing taps. */
test('About\'s timeline is what timeline.js builds for its squad', () => {
  const about = read('about.html').replace(/<style[\s\S]*?<\/style>/g, '');
  const fig = about.slice(about.indexOf('<div class="tl'));
  const rows = fig.split('<div class="tl-row"').slice(1);
  assert.equal(rows.length, 11, `read ${rows.length} rows, expected eleven players`);
  assert.match(fig, /^<div class="tl even">/, 'sixteen/twelve over eleven players is an even plan');
  const totals = rows.map((r) => r.match(/<div class="(tl-tot[^"]*)"><span class="num">(\d+)<\/span>/));
  assert.ok(totals.every(Boolean), 'a row has no .tl-tot > .num');
  assert.deepEqual(totals.map((t) => t[1]), Array(11).fill('tl-tot'), 'an even plan marks no total hi or lo');
  assert.equal(totals.filter((t) => t[2] === '16').length, 7);
  assert.equal(totals.filter((t) => t[2] === '12').length, 4);
  for (const r of rows) {
    assert.match(r, /<div class="tl-lab"><span class="tl-name"><span class="dot"><\/span><span class="nm">[^<]+<\/span><\/span><\/div>/,
      'dot and name must sit together in a .tl-name inside .tl-lab');
  }
});
