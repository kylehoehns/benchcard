/* Can a crawler that starts at "/" actually walk to every page this site
 * ships?
 *
 * The six roster-size chart pages were filed as orphans -- "sitemap.xml
 * carries 11 URLs and index.html links to none of them". Neither half held.
 * The sitemap carries NINE <loc> entries, one per shipped document; the 11 was
 * a `grep -c` counting the two comment lines that mention `<loc>`. And the
 * pages were wired into the graph the day they shipped (8dc9b1e): about.html
 * carries a deliberately non-`.reveal` nav to all six, and each page links its
 * five siblings. So this file does not add links. It pins the property, which
 * nothing did.
 *
 * WHY A WALK AND NOT A LIST. test/charts.test.js already asserts the two edges
 * it knows the names of -- about -> six, and page -> five siblings. A named
 * edge cannot notice a page that stops being reachable for a reason nobody
 * wrote down, and it cannot notice a SEVENTH page arriving with nothing
 * pointing at it. This derives its scope from the directory and from the hrefs
 * in the files, so both of those fail here.
 *
 * WHY index.html's `.foot` IS CUT OUT OF THE GRAPH. `render.js:197` sets
 * `.foot { display: none }` on the welcome view, and welcome is the view a
 * cold visitor -- and a rendering crawler -- lands on. So the footer's "How it
 * works" is in the source of "/" and is NOT on the page anyone arrives at. The
 * only live path off the welcome screen is the "What is this?" link
 * (`.wel-about`), and the whole six-page long tail hangs off that one anchor.
 * Cutting the footer out is what makes this test able to say so: with the
 * footer counted, deleting `.wel-about` would still look fine here, and the
 * charts would go dark behind a hidden link with the suite green.
 *
 * Confirmed in a browser at 390x844 on 2026-08-26, because a source href is
 * not a link a reader can follow: "What is this?" is visible on welcome, the
 * six chips on about.html are visible, and the hop resolves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const APP = new URL('../app/', import.meta.url);
const read = p => readFileSync(new URL(p, APP), 'utf8');

/* Derived, never listed: whatever HTML is in app/ is what the site ships. */
const shipped = readdirSync(APP).filter(f => f.endsWith('.html')).sort();

/* THREE THINGS HOLD AN href A READER CANNOT FOLLOW, and all three are cut out
   before the walk. This is the "a grep hit is not proof" rule applied to a
   link: the mutation arm that neutered `.wel-about` passed the first cut of
   this file, because index.html mentions ./about.html in a source comment AND
   again inside <noscript>, and neither is on the page a rendering crawler
   sees. Comments and noscript go first, footer second. */
const strip = src => src
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');

/* `.foot` on index.html is display:none on the welcome view -- see the header.
   Scoped to index.html: the chart pages and about.html have plain footers that
   are always on screen. */
function crawlable(name) {
  const src = strip(read(name));
  if (name !== 'index.html') return src;
  const start = src.indexOf('<footer class="foot');
  assert.ok(start > 0, 'index.html no longer has the .foot footer this test cuts out');
  const end = src.indexOf('</footer>', start);
  return src.slice(0, start) + src.slice(end);
}

/* An href becomes a page name, or null if it is not a page on this site.
   `./advanced` has no extension on purpose: Cloudflare serves the
   extensionless spelling and 307s the .html one, so both spellings are real
   and both have to resolve here. */
function target(href) {
  if (/^(https?:|mailto:|data:|#)/.test(href)) return null;
  const path = href.replace(/[?#].*$/, '').replace(/^\.\//, '');
  if (path === '' ) return 'index.html';
  if (path.endsWith('.html')) return path;
  if (/\.[a-z0-9]+$/i.test(path)) return null;   // .css, .png, .webmanifest
  return `${path}.html`;
}

function linksFrom(name) {
  return [...crawlable(name).matchAll(/href="([^"]*)"/g)]
    .map(m => target(m[1]))
    .filter(t => t && shipped.includes(t));
}

function reachable() {
  const seen = new Set(['index.html']);
  const queue = ['index.html'];
  while (queue.length) {
    for (const next of linksFrom(queue.shift())) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

test('every page the site ships is reachable by following links from "/"', () => {
  const seen = reachable();
  const orphans = shipped.filter(p => !seen.has(p));
  assert.deepEqual(orphans, [],
    `orphaned — nothing on this site links to: ${orphans.join(', ')}`);
  /* A walk that reached one page would also report zero orphans if `shipped`
     came back empty. Pin the floor: index, about, advanced and six charts. */
  assert.ok(shipped.length >= 9, `only ${shipped.length} pages found in app/`);
});

test('every URL in sitemap.xml is a page the crawl actually reaches', () => {
  /* charts.test.js checks each <loc> resolves to a file that exists. Existing
     and being linked are different things, and the whole ticket was the
     difference. */
  const locs = [...read('sitemap.xml').matchAll(/<loc>https:\/\/benchcard\.app\/([^<]*)<\/loc>/g)]
    .map(m => (m[1] === '' ? 'index.html' : `${m[1]}.html`));
  assert.ok(locs.length >= 9, `sitemap.xml lists ${locs.length} URLs; it lost entries`);
  const seen = reachable();
  for (const loc of locs) assert.ok(seen.has(loc), `sitemap lists ${loc} and no page links to it`);
});

test('the welcome screen, not the hidden footer, is what links off "/"', () => {
  /* The load-bearing anchor, stated once so a future edit to the welcome
     screen has to argue with it. Two iterations rebuilt that screen this week;
     the next one should know this link is holding up six pages. */
  const withoutFoot = crawlable('index.html');
  assert.ok(withoutFoot.includes('href="./about.html"'),
    'nothing outside index.html\'s hidden .foot links to about.html — the six chart pages just went dark');
  assert.ok(/<a class="wel-about" href="\.\/about\.html"/.test(withoutFoot),
    'the welcome screen\'s "What is this?" link is gone; the only about.html hrefs left are in the hidden footer, a comment or <noscript>');
});
