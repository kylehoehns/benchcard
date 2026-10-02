import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSitemap, problems } from '../scripts/check-sitemap-lastmod.mjs';

/* The pure decision behind `scripts/check-sitemap-lastmod.mjs`: a page whose
 * HTML changed in the diff must carry a new <lastmod>. No git here; the
 * script's header says why the rest lives in a CI history job. */

const ABOUT = 'app/about.html';
const CHART = 'app/8-player-basketball-rotation-chart.html';
const before = { 'about.html': '2026-08-22', '8-player-basketball-rotation-chart.html': '2026-08-23' };

test('a changed page whose lastmod did not move fails, naming the page', () => {
  const found = problems([ABOUT], before, { ...before });
  assert.equal(found.length, 1);
  assert.match(found[0], /app\/about\.html/);
  assert.match(found[0], /2026-08-22/);
});

test('a changed page with a new lastmod passes', () => {
  assert.deepEqual(problems([ABOUT], before, { ...before, 'about.html': '2026-10-02' }), []);
});

test('a changed chart page is held to the same rule', () => {
  assert.equal(problems([CHART], before, { ...before }).length, 1);
});

test('a page that did not change passes with its old lastmod', () => {
  assert.deepEqual(problems(['app/app.css', 'README.md'], before, { ...before }), []);
});

test('an unreadable base passes', () => {
  assert.deepEqual(problems([ABOUT], null, { ...before }), []);
});

test('a page new to the sitemap passes', () => {
  assert.deepEqual(problems([ABOUT], {}, { ...before }), []);
});

test('parseSitemap maps each extensionless loc to its file and lastmod', () => {
  const xml = `<urlset>
  <url><loc>https://benchcard.app/</loc><lastmod>2026-01-02</lastmod></url>
  <url><loc>https://benchcard.app/about</loc><lastmod>2026-03-04</lastmod></url>
</urlset>`;
  assert.deepEqual(parseSitemap(xml), { 'index.html': '2026-01-02', 'about.html': '2026-03-04' });
});

test('the shipped sitemap is parseable and every lastmod is a date', () => {
  const dates = parseSitemap(readFileSync(new URL('../app/sitemap.xml', import.meta.url), 'utf8'));
  assert.equal(Object.keys(dates).length, 9);
  for (const d of Object.values(dates)) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test('a sitemap that parsed to nothing fails rather than checking nothing', () => {
  assert.equal(problems([ABOUT], before, {}).length, 1);
});
