import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIZES, file, slug } from '../scripts/charts.mjs';
import { lacks } from './prose.js';
import { parseSitemap } from '../scripts/check-sitemap-lastmod.mjs';

/* #279: each page owns its own search phrase. This reads page source on
 * purpose -- a crawler reads source, and the spec (docs/specs/279-seo-pass.md)
 * names this as the seam. */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const meta = (html, re) => (html.match(re) || [])[1];
const titleOf = html => meta(html, /<title>([^<]*)<\/title>/);
const ogTitle = html => meta(html, /<meta property="og:title" content="([^"]*)">/);
const twTitle = html => meta(html, /<meta name="twitter:title" content="([^"]*)">/);
const descOf = html => meta(html, /<meta name="description" content="([^"]*)">/);

/* The title, og:title and twitter:title all say the same thing. */
function assertTitles(html, want) {
  assert.equal(titleOf(html), want);
  assert.equal(ogTitle(html), want);
  assert.equal(twTitle(html), want);
}

test('home owns the rotation and substitution planner phrase', () => {
  const html = read('index.html');
  assertTitles(html, 'Basketball rotation &amp; substitution planner | Benchcard');
  assert.ok(descOf(html).startsWith('Free youth basketball rotation planner'));
});

test('about owns the equal playing time phrase', () => {
  const html = read('about.html');
  assertTitles(html, 'Equal playing time in youth basketball | Benchcard');
  assert.ok(descOf(html).startsWith('Equal playing time'));
  assert.ok(descOf(html).includes('how to plan a youth basketball substitution rotation'));
  assert.ok(lacks(descOf(html), 'however else you want them split'));
});

/* ---- structured data ---- */

const ORIGIN = 'https://benchcard.app';
const sitemap = read('sitemap.xml');
const dates = parseSitemap(sitemap);
const locs = Object.keys(dates).map(f => (f === 'index.html' ? `${ORIGIN}/` : `${ORIGIN}/${f.replace(/\.html$/, '')}`));
const chartLoc = n => `${ORIGIN}/${slug(n)}`;

const blocks = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map(m => JSON.parse(m[1]));
/* Every typed node, whether the block is a bare node or an @graph. */
const nodes = html => blocks(html).flatMap(b => (b['@graph'] || [b]));
const strings = v => (typeof v === 'string' ? [v]
  : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

test('every JSON-LD block parses, and every page URL in it is one the sitemap lists', () => {
  assert.equal(locs.length, 9);
  for (const f of Object.keys(dates)) {
    const html = read(f);
    for (const s of strings(blocks(html))) {
      /* An image or other asset URL (og.png) is not a page. */
      if (!s.startsWith(ORIGIN) || /\.[a-z0-9]+$/i.test(s)) continue;
      assert.ok(locs.includes(s), `${f} names ${s}, which the sitemap does not list`);
    }
  }
});

const crumbs = list => list.itemListElement.map(i => [i.position, i.name, i.item]);

/* The page's WebPage and BreadcrumbList nodes, each asserted present. */
function pageAndList(html, label) {
  const all = nodes(html);
  const page = all.find(x => x['@type'] === 'WebPage');
  const list = all.find(x => x['@type'] === 'BreadcrumbList');
  assert.ok(page, `${label}: no WebPage`);
  assert.ok(list, `${label}: no BreadcrumbList`);
  return { page, list };
}

test('each chart page has a WebPage in the site and a Benchcard > About > chart breadcrumb', () => {
  for (const n of SIZES) {
    const html = read(file(n));
    const { page, list } = pageAndList(html, n);
    assert.equal(page.url, chartLoc(n));
    assert.equal(page.name, `${n}-player basketball rotation chart`);
    assert.equal(page.isPartOf.url, `${ORIGIN}/`);
    assert.deepEqual(crumbs(list), [
      [1, 'Benchcard', `${ORIGIN}/`],
      [2, 'About', `${ORIGIN}/about`],
      [3, `${n}-player chart`, chartLoc(n)],
    ]);
  }
});

test('advanced has a WebPage and a Benchcard > Reference breadcrumb', () => {
  const { page, list } = pageAndList(read('advanced.html'), 'advanced');
  assert.equal(page.url, `${ORIGIN}/advanced`);
  assert.equal(page.isPartOf.url, `${ORIGIN}/`);
  assert.deepEqual(crumbs(list), [
    [1, 'Benchcard', `${ORIGIN}/`],
    [2, 'Reference', `${ORIGIN}/advanced`],
  ]);
});

test('the home screen name stays Benchcard, whatever the title says', () => {
  assert.equal(meta(read('index.html'), /<meta name="apple-mobile-web-app-title" content="([^"]*)">/), 'Benchcard');
});
