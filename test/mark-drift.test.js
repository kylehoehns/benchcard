import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { faviconHref, logoSvg, welcomeLogoSvg, shareShapesSource, SHARE_BEGIN, SHARE_END } from '../scripts/mark.mjs';

/* The static pages hold literal copies of the mark, because they are static.
   These tests fail when a copy differs from what scripts/mark.mjs produces,
   and when a ball seam path is left anywhere outside app/vendor. The fix for
   a failure is `node scripts/mark.mjs` (and `node scripts/charts.mjs` for the
   six chart pages). */

const ROOT = new URL('..', import.meta.url).pathname;
const APP = join(ROOT, 'app');
const read = p => readFileSync(join(APP, p), 'utf8');
const PAGES = ['index.html', 'about.html', 'advanced.html',
  ...[7, 8, 9, 10, 11, 12].map(n => `${n}-player-basketball-rotation-chart.html`)];

test('every page declares the card mark as its tab icon', () => {
  assert.match(faviconHref(), /^data:image\/svg\+xml,/);
  for (const p of PAGES) {
    const links = [...read(p).matchAll(/<link rel="icon" href="([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual(links, [faviconHref()], `${p} icon differs from scripts/mark.mjs`);
  }
});

test('every page draws the card mark as its logo, hidden from assistive tech', () => {
  assert.match(logoSvg(), /aria-hidden="true"/);
  assert.match(logoSvg(), /width="26" height="26"/);
  for (const p of PAGES) {
    const html = read(p);
    const logo = p === 'index.html'
      ? html.match(/<span class="wel-mark" aria-hidden="true">\s*(<svg[\s\S]*?<\/svg>)/)
      : html.match(/<a class="mark"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/);
    assert.ok(logo, `${p} has no logo svg`);
    const want = p === 'index.html' ? welcomeLogoSvg() : logoSvg();
    assert.equal(logo[1], want, `${p} logo differs from scripts/mark.mjs`);
  }
});

test('no basketball seam path is left in app/ or scripts/', () => {
  // built from pieces so this file does not match itself
  const seams = [['M4.6 3.7', 'c3.5'], ['M4.5 3.6', 'c3.5'], ['M12 1.5', 'v21']].map(p => p.join(''));
  const files = [];
  const walk = d => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (p === join(APP, 'vendor')) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(html|js|mjs|css|svg|webmanifest|json)$/.test(f)) files.push(p);
    }
  };
  walk(APP); walk(join(ROOT, 'scripts'));
  assert.ok(files.length > 50, `only ${files.length} files scanned`);
  const hits = files.filter(f => seams.some(s => readFileSync(f, 'utf8').includes(s)));
  assert.deepEqual(hits.map(f => f.slice(ROOT.length)), []);
});

test('app/share.js holds the mark\'s shapes exactly as scripts/mark.mjs produces them', () => {
  const src = read('share.js');
  const a = src.indexOf(SHARE_BEGIN), b = src.indexOf(SHARE_END);
  assert.ok(a >= 0 && b > a, 'share.js has no generated mark block');
  assert.equal(src.slice(a, b + SHARE_END.length), shareShapesSource(),
    'share.js mark block is stale: run node scripts/mark.mjs');
});
