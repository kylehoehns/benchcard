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
 * WHY THE WELCOME SCREEN'S LINK IS WHAT MATTERS. A cold visitor -- and a
 * rendering crawler -- lands on the welcome view, and the only live path off
 * it is the "What is this?" link (`.wel-about`); the whole six-page long
 * tail hangs off that one anchor. #33 removed the footer that used to also
 * carry an `href="./about"` in the source (and had to be cut out of this
 * walk by hand so that a deleted `.wel-about` still went red here, not green
 * behind the footer's hidden copy) -- there is nothing left to cut.
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

/* #33 removed index.html's `.foot` footer -- the one thing this used to cut
   out by hand (it carried a source-only `href="./about"` a rendering crawler
   on the welcome view never actually saw). Nothing left needs cutting. */
function crawlable(name) {
  return strip(read(name));
}

/* An href becomes a page name, or null if it is not a page on this site.

   ONE SPELLING. Every internal href is extensionless, because that is what
   the canonical tag, og:url and sitemap.xml name and what Cloudflare 200s;
   the .html spelling is a live URL that 307s there, and nothing on this site
   links to it. This used to accept both, which is exactly how the two drifted
   apart -- see the assertion at the bottom of this file, which now bans the
   redirecting spelling outright. */
function target(href) {
  if (/^(https?:|mailto:|data:|#)/.test(href)) return null;
  const path = href.replace(/[?#].*$/, '').replace(/^\.\//, '');
  if (path === '' ) return 'index.html';
  if (path.endsWith('.html')) return path;      // a stale link; the ban below catches it
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

test('the welcome screen is what a first visit links off "/" with', () => {
  /* The load-bearing anchor, stated once so a future edit to the welcome
     screen has to argue with it. Several iterations have rebuilt that screen;
     the next one should know this link is holding up six pages. */
  const src = crawlable('index.html');
  assert.ok(/<a class="wel-about" href="\.\/about"/.test(src),
    'the welcome screen\'s "What is this?" link is gone');
});

/* ------------------------------------------------------------------ *
 * One spelling per page.
 *
 * The walk above proves every page is REACHABLE. It cannot notice that the
 * link reaching it is a URL Cloudflare 307s away from, because a redirect
 * still arrives -- which is precisely how this went unnoticed: `about.html`
 * was linked 16 times, every one of them a hop, while the canonical tag,
 * og:url and sitemap.xml all named `/about`.
 *
 * That cost more than a crawl hop. `sw.js` keys its cache on the file
 * (`./about.html`), the hrefs to `advanced.html` had ALREADY moved to the
 * extensionless spelling, and offline the mismatch served the app shell in
 * place of the page -- silently, since the shell is a valid document.
 *
 * Derived from the files, never listed: a seventh page cannot arrive exempt.
 * ------------------------------------------------------------------ */
test('no internal href points at a URL that redirects', () => {
  /* The RAW hrefs, deliberately -- not `linksFrom`, which resolves each one to
     a page name and so hands back `about.html` whatever the markup said. The
     first cut of this test used it and could not pass on any tree. */
  const offenders = [];
  for (const name of shipped) {
    for (const m of crawlable(name).matchAll(/href="([^"]*)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|data:|#)/.test(href)) continue;
      if (href.replace(/[?#].*$/, '').endsWith('.html')) offenders.push(`${name}: href="${href}"`);
    }
  }
  assert.deepEqual(offenders, [],
    'these hrefs name the .html spelling, which Cloudflare 307s to the extensionless one. '
    + 'The canonical tag, og:url and sitemap.xml all name the extensionless URL, and sw.js '
    + 'caches by file — so a .html href is both a wasted hop for a crawler and, offline, a '
    + 'cache miss that hands back the app shell instead of the page:\n  ' + offenders.join('\n  '));
});
