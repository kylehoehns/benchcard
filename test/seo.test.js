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

/* #386: what sets Benchcard apart is in the metadata a search engine reads. */
const appNode = () => nodes(read('index.html')).find(x => x['@type'] === 'SoftwareApplication');

test('home featureList names the season, hand-off, mid-game re-plan and overtime', () => {
  const list = appNode().featureList;
  for (const re of [/season/i, /hand/i, /mid-game/i, /overtime/i]) {
    assert.ok(list.some(f => re.test(f)), `featureList has no entry matching ${re}`);
  }
});

test('home meta description mentions the season and fits in 160 characters', () => {
  const d = descOf(read('index.html'));
  assert.match(d, /season/i);
  assert.ok(d.length <= 160, `meta description is ${d.length} characters`);
});

test('home JSON-LD description says across the season', () => {
  assert.match(appNode().description, /across the season/);
});

/* ---- #423: the words the title targets are on the page, not only in <head> ---- */

/* What a reader sees, as source: the head, scripts, styles and comments cut,
   tags dropped, whitespace flattened (prose here wraps at ~78 columns). */
const visible = html => html
  .replace(/<head[\s\S]*?<\/head>/i, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const WORDS = {
  'index.html': ['basketball', 'rotation', 'substitution', 'planner'],
  'about.html': ['equal playing time', 'youth basketball', 'substitution'],
  'advanced.html': ['setting', 'rule', 'card'],
  ...Object.fromEntries(SIZES.map(n => [file(n),
    [`${n}-player basketball rotation chart`, 'substitution', 'printable', 'equal playing time']])),
};

test('each page says its title words where a reader can see them', () => {
  assert.equal(Object.keys(WORDS).length, 9, 'a page lost its row');
  for (const [f, words] of Object.entries(WORDS)) {
    const text = visible(read(f));
    assert.ok(text.length > 500, `${f}: the visible text measured ${text.length} characters, so nothing was checked`);
    for (const w of words) assert.ok(text.includes(w), `${f}'s visible text never says "${w}"`);
  }
});

test('the welcome screen says what the app is, in one sentence under the headline', () => {
  const html = read('index.html');
  const hero = html.match(/<div class="wel-hero">([\s\S]*?)<div class="wel-stage">/)?.[1] ?? '';
  assert.match(hero, /<h1 class="wel-h">[\s\S]*?<\/h1>\s*<p class="wel-sub">A basketball rotation and substitution planner for equal playing time\.<\/p>/,
    'the welcome sentence is not directly under h1.wel-h');
});

test('about keeps its H1 and its lede carries the searched words', () => {
  const html = read('about.html');
  assert.match(html, /<h1><span class="hl">Even minutes<\/span>, worked out before the game\.<\/h1>/);
  const lede = (html.match(/<p class="lede">([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/\s+/g, ' ');
  assert.equal(lede, 'Benchcard is a free substitution planner for youth basketball, built around equal playing time. ' +
    'Give it your roster and say how the minutes should be split, and it works out who is on the floor ' +
    'for every stint, then prints it on a card that fits in your pocket.');
});

const ABOUT_DESC = 'Equal playing time, and how to plan a youth basketball substitution rotation: even minutes, the rules a coach needs, and how to read the printed card.';

test('about description is the agreed sentence, within 160, with youth basketball once', () => {
  const html = read('about.html');
  const d = descOf(html);
  assert.equal(d, ABOUT_DESC);
  assert.equal(d.length, 150);
  assert.equal(d.match(/youth basketball/g).length, 1);
  // og and twitter either repeat it exactly or say something else entirely
  for (const re of [/<meta property="og:description" content="([^"]*)">/, /<meta name="twitter:description" content="([^"]*)">/]) {
    const o = meta(html, re);
    assert.ok(o === ABOUT_DESC || lacks(o, 'rotation: even minutes'), `${re} half-repeats the description`);
  }
});

test('home JSON-LD has a WebSite named Benchcard beside the SoftwareApplication', () => {
  const all = nodes(read('index.html'));
  const site = all.find(x => x['@type'] === 'WebSite');
  assert.ok(site, 'index.html has no WebSite node');
  assert.equal(site.name, 'Benchcard');
  assert.equal(site.url, 'https://benchcard.app/');
  assert.equal(all.find(x => x['@type'] === 'SoftwareApplication')?.name, 'Benchcard');
});
