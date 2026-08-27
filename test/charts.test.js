/* The roster-size landing pages.
 *
 * Six near-identical documents is a drift machine: the failure mode is not one
 * page being wrong, it is page 11 quietly not matching page 10 six months
 * later, and nobody noticing because nobody reads all six. So the pages are
 * generated (scripts/charts.mjs) and these tests pin three separate joints:
 *
 *   1. disk vs generator — a hand edit, or an engine change that moves the
 *      plans, fails here until `node scripts/charts.mjs` is re-run;
 *   2. page vs its own roster size — the 9 page must actually print 9 players;
 *   3. page vs the rest of the site — sitemap, head hygiene, the favicon rule,
 *      the precache decision, and the ban on player levels in anything public.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SIZES, file, slug, pages, planFor, cardMetrics, measuredNames } from '../scripts/charts.mjs';

const url = p => new URL('../app/' + p, import.meta.url);
const read = p => readFileSync(url(p), 'utf8');
const html = new Map(SIZES.map(n => [n, read(file(n))]));
const sitemap = read('sitemap.xml');
const sw = read('sw.js');

/* ---------------- 1. the pages are what the generator says ---------------- */

test('every roster-size page on disk matches what scripts/charts.mjs renders', () => {
  /* This is the test that makes the whole approach safe. The cards are real
     `generatePlan` output baked at build time, so an engine change silently
     staled them; now it fails here instead, and the fix is one command. */
  for (const [name, want] of pages()) {
    assert.ok(existsSync(url(name)), `app/${name} is missing — run: node scripts/charts.mjs`);
    assert.equal(read(name), want,
      `app/${name} is stale or hand-edited — run: node scripts/charts.mjs`);
  }
});

/* ---------------- 2. each page is about its own roster size ---------------- */

test('each card names exactly as many players as its page claims', () => {
  for (const n of SIZES) {
    const page = html.get(n);
    const names = new Set([...page.matchAll(/<span class="nm(?: fresh)?">([^<]+)<\/span>/g)].map(m => m[1]));
    assert.equal(names.size, n,
      `${file(n)} prints ${names.size} distinct players on the floor, not ${n}`);

    /* The minutes footer is the other half of the claim, and it is the part a
       coach checks: one entry per player, and they must add up to the whole
       game five players at a time. */
    const ft = page.match(/<div class="card-ft">([^<]*)<\/div>/)[1].trim();
    const entries = ft.split(/\s{3}/).filter(Boolean);
    assert.equal(entries.length, n, `${file(n)}'s minutes footer lists ${entries.length} players, not ${n}`);
    const total = entries.reduce((a, e) => a + Number(e.split(' ')[1]), 0);
    assert.equal(total, 5 * 32, `${file(n)}'s minutes do not add up to five players for 32 minutes`);
    for (const e of entries) assert.ok(names.has(e.split(' ')[0]), `${file(n)} totals a player who never plays: ${e}`);
  }
});

test('every stint puts five on the floor and the substitutions are consistent', () => {
  for (const n of SIZES) {
    const page = html.get(n);
    const stints = [...page.matchAll(/<div class="five"[^>]*>([\s\S]*?)<\/div>/g)]
      .map(m => [...m[1].matchAll(/>([^<]+)</g)].map(x => x[1]));
    assert.equal(stints.length, 8, `${file(n)} does not print 8 stints`);
    for (const s of stints) assert.equal(new Set(s).size, 5, `${file(n)} has a stint that is not five players`);
  }
});

test('the page title, the heading and the URL all say the same number', () => {
  for (const n of SIZES) {
    const page = html.get(n);
    assert.match(page, new RegExp(`<title>${n}-player basketball rotation chart`), `${file(n)} title`);
    assert.match(page, new RegExp(`<h1[^>]*>${n}-player basketball rotation chart</h1>`), `${file(n)} h1`);
    assert.ok(page.includes(`<link rel="canonical" href="https://benchcard.app/${slug(n)}">`),
      `${file(n)} canonical does not point at its own URL`);
    assert.ok(page.includes(`${n}-PLAYER ROTATION`), `${file(n)}'s card header does not say ${n}`);
  }
});

/* ---------------- 3. the pages against the rest of the site ---------------- */

test('every sitemap URL resolves to a file that ships, and a draft page is not listed', () => {
  const locs = [...sitemap.matchAll(/<loc>https:\/\/benchcard\.app\/([^<]*)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.length >= 2, 'the sitemap lost entries');
  for (const loc of locs) {
    /* Cloudflare 307s `/<name>.html` to `/<name>`, so a `<loc>` ending in
       `.html` advertises a redirect as if it were the page — which is exactly
       what /about.html did until it was caught. There is no accommodating
       branch here on purpose: the extensionless spelling is the only one that
       returns a 200, and this is the guard that keeps it that way. */
    assert.ok(!loc.endsWith('.html'), `sitemap lists /${loc}, which 307s — use the extensionless URL`);
    const name = loc === '' ? 'index.html' : loc + '.html';
    assert.ok(existsSync(url(name)), `sitemap lists /${loc} and app/${name} does not exist`);
  }
  /* A chart page belongs in the sitemap exactly when it is no longer a draft.
     Draft prose on a young domain is a bad first impression to hand a crawler,
     and these pages are linked from about.html, so absence from the sitemap is
     not on its own enough -- the noindex below is what actually keeps Google
     off. Both are derived from the same fact, so writing the copy lifts both at
     once and neither is a switch anyone has to remember to flip. */
  for (const n of SIZES) {
    const draft = html.get(n).includes('data-draft="1"');
    assert.equal(locs.includes(slug(n)), !draft,
      draft ? `${slug(n)} still has placeholder copy and must stay out of the sitemap`
            : `${slug(n)} is written and should now be in the sitemap`);
  }
});

test('no absolute benchcard.app URL this site publishes points at a redirect', () => {
  /* The same rule as the sitemap, applied to every public absolute URL:
     canonicals, og:url, JSON-LD. Cloudflare 307s `/<name>.html`, so an
     absolute URL ending in `.html` advertises a redirect to a crawler or a
     share scraper. About had four of them — canonical, og:url, the sitemap
     entry, and index.html's JSON-LD `softwareHelp` — while all six chart
     pages were already correct.

     Only ABSOLUTE URLs. The in-app links stay `./about.html` on purpose:
     that spelling is the service worker's precache key, and
     `scripts/redirect-check.mjs` exists to prove a navigation through it
     works. Rewriting those would break the offline About link. */
  const files = ['index.html', 'about.html', 'sitemap.xml', ...SIZES.map(file)];
  for (const name of files) {
    for (const m of read(name).matchAll(/https:\/\/benchcard\.app\/(\S*?)(?=["'<\s])/g)) {
      assert.ok(!m[1].endsWith('.html'),
        `${name} publishes https://benchcard.app/${m[1]}, which 307s — use /${m[1].slice(0, -5)}`);
    }
  }
});

test('about.html links to all six, so the pages are reachable without the sitemap', () => {
  const about = read('about.html');
  for (const n of SIZES) {
    assert.ok(about.includes(`href="./${file(n)}"`), `about.html does not link to ${file(n)}`);
  }
  // and each page links to its five siblings
  for (const n of SIZES) {
    for (const o of SIZES) {
      if (o === n) continue;
      assert.ok(html.get(n).includes(`href="./${file(o)}"`), `${file(n)} does not link to ${file(o)}`);
    }
  }
});

test('the card uses the same class vocabulary app/card.js emits', () => {
  /* The card content cannot drift from the engine — it is generated from it —
     but the markup can drift from card.js, and then card.css styles one and
     not the other. Every class the generated card uses has to exist in the
     module that builds the real one. */
  const cardjs = read('card.js');
  const used = new Set();
  for (const m of html.get(9).matchAll(/class="((?:card|stint|chg|clk|io|five|nm|opp|when)[^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) used.add(c);
  }
  assert.ok(used.size >= 10, 'the card markup no longer looks like the app card');
  for (const c of used) {
    assert.ok(new RegExp(`'[^']*\\b${c}\\b`).test(cardjs) || cardjs.includes(`'${c}'`),
      `the landing card uses .${c} and app/card.js does not — the two have drifted`);
  }
});

test('the printed rows fit inside the card, at the size the generator baked in', () => {
  /* card.js measures type on a canvas; the generator cannot, so it uses a
     deliberately pessimistic advance constant. If a name ever got long enough
     to overflow at the chosen size, this is where it shows up. */
  const contentPx = (3.45 - 2 * 0.11) * 96;
  for (const n of SIZES) {
    const m = cardMetrics(planFor(n));
    assert.ok(m.widest <= contentPx + 0.5,
      `${file(n)}'s widest row is ${m.widest}px in a ${contentPx}px card`);
    assert.ok(m.five >= 16, `${file(n)} prints names at ${m.five}px, below the legibility floor`);
  }
});

test('every name the cards print has a measured width behind it', () => {
  /* The auto-fit is only as good as its width table, and the table was
     measured by hand in a browser. If the sample roster or deriveShortNames
     ever produces a name that is not in it, the generator silently falls back
     to an estimate and the card is sized by guesswork. */
  const known = new Set(measuredNames());
  for (const n of SIZES) {
    for (const s of Object.values(planFor(n).shortNames)) {
      assert.ok(known.has(s),
        `the card prints "${s}" and scripts/charts.mjs has no measured width for it — ` +
        'measure it in a browser with card.js\'s widthAt at 100px and add it to WIDTH_AT_100');
    }
  }
});

test('the landing pages are not precached, and do not reference favicon.ico', () => {
  /* Recorded decision: offline value is near zero for a document reached from
     a search result, and the precache list is the payload budget's problem.
     If that is ever revisited, revisit it here too — and re-run
     `npm run redirect-check`, because every precached path has to survive
     Cloudflare's .html redirect. */
  for (const n of SIZES) {
    assert.ok(!sw.includes(slug(n)), `${file(n)} is precached; it was deliberately left out`);
    assert.ok(!html.get(n).includes('favicon.ico'),
      `${file(n)} references favicon.ico, which is deliberately unreferenced`);
  }
});

test('nothing public shows a player level, real or sample', () => {
  /* test/leak.test.js bans levels from the card, the bench, the share image,
     analytics and the CSV. A public landing page is the most public artefact
     there is, so the same ban applies to the sample roster. */
  for (const n of SIZES) {
    const page = html.get(n);
    assert.ok(!/\btier\b/i.test(page), `${file(n)} mentions a tier`);
    assert.ok(!/\blevel\b/i.test(page), `${file(n)} mentions a player level`);
  }
});

test('the pages read correctly with JavaScript off', () => {
  for (const n of SIZES) {
    const page = html.get(n);
    /* Exactly one inline script — the pre-paint theme resolution — and no
       external one. There is nothing here to reveal, so there is nothing that
       can stay hidden. */
    const scripts = [...page.matchAll(/<script[^>]*>/g)];
    assert.equal(scripts.length, 1, `${file(n)} has ${scripts.length} scripts; it should only have the theme one`);
    assert.ok(!/<script[^>]+src=/.test(page), `${file(n)} loads an external script`);
    const style = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
    assert.ok(!/opacity:\s*0\s*[;}]|visibility:\s*hidden/.test(style),
      `${file(n)} hides content in CSS with no script to unhide it`);
    // and the card is in the markup, not built at runtime
    assert.ok(page.includes('<div class="card">'), `${file(n)} has no card in the HTML itself`);
  }
});

test('head hygiene matches the two pages that came before', () => {
  for (const n of SIZES) {
    const page = html.get(n);
    for (const needle of [
      '<meta name="description" content="',
      // a draft page is noindex; see the sitemap test above for why
      html.get(n).includes('data-draft="1"')
        ? '<meta name="robots" content="noindex, nofollow">'
        : '<meta name="robots" content="index, follow',
      '<meta property="og:site_name" content="Benchcard">',
      '<meta property="og:image" content="https://benchcard.app/og.png">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<link rel="stylesheet" href="./tokens.css">',
    ]) assert.ok(page.includes(needle), `${file(n)} is missing ${needle}`);
    /* Open Graph URLs must be absolute — a relative one resolves against the
       scraper, not the site. */
    for (const m of page.matchAll(/<meta property="og:(url|image)" content="([^"]+)"/g)) {
      assert.match(m[2], /^https:\/\/benchcard\.app\//, `${file(n)} og:${m[1]} is not absolute`);
    }
  }
});

test('every page the site publishes describes its share card the same way', () => {
  /* All eight pages point at the same og.png, so all eight owe it the same
     four sub-properties. `alt` is the one that matters twice over: it is the
     only accessible description of the card a screen reader gets when the link
     is unfurled in a group chat, and a scraper reads its absence as a
     lower-quality card. index.html had all four; the other seven had only
     width and height until 2026-08-24. Byte-identical on purpose — one image,
     one description — and the chart pages get theirs from OG_ALT in
     scripts/charts.mjs, so a hand edit fails the disk-vs-generator test above
     before it reaches this one. */
  const ALT = 'Benchcard&rsquo;s bench mode open on a phone: the five players on the floor with minutes played, and the next substitution &mdash; who is coming off and who is going on &mdash; beside the words &ldquo;Even minutes, worked out before the game.&rdquo;';
  for (const name of ['index.html', 'about.html', ...SIZES.map(file)]) {
    const page = read(name);
    for (const needle of [
      '<meta property="og:image" content="https://benchcard.app/og.png">',
      '<meta property="og:image:type" content="image/png">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta property="og:image:alt" content="${ALT}">`,
      /* X reads twitter:image:alt, not the Open Graph one, so the same
         description has to be declared twice or the card is undescribed on
         that surface. Same string — it is still the same image. */
      '<meta name="twitter:image" content="https://benchcard.app/og.png">',
      `<meta name="twitter:image:alt" content="${ALT}">`,
    ]) assert.ok(page.includes(needle), `${name} is missing ${needle}`);
  }
});

test('the placeholder copy is marked, so nobody ships it by accident', () => {
  /* The prose on these pages is the author's, not the loop's. Until it lands,
     every slot is bracketed AND carries data-draft, so `grep -l data-draft
     app/*.html` is an accurate list of what is unwritten. This test does not
     fail when a page is still a draft — it fails if a draft stops being
     obvious. */
  for (const n of SIZES) {
    const page = html.get(n);
    const drafts = [...page.matchAll(/data-draft="1"[^>]*>([^<]*)</g)].map(m => m[1]);
    for (const d of drafts) {
      assert.match(d, /^\[PLACEHOLDER/, `${file(n)} has a data-draft element whose text is not a placeholder`);
    }
    const brackets = (page.match(/\[PLACEHOLDER/g) || []).length;
    assert.equal(brackets, drafts.filter(d => d.startsWith('[PLACEHOLDER')).length,
      `${file(n)} has placeholder text that is not marked data-draft`);
  }
});
