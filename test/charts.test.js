/* The roster-size landing pages.
 *
 * Near-identical documents are a drift machine: the failure mode is not one
 * page being wrong, it is page 11 quietly not matching page 10 six months
 * later, and nobody noticing because nobody reads every one. So the pages are
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
import { sampleRoster } from '../app/roster.js';
import { lacks } from './prose.js';
import {
  SIZES, CHARTS, HALVES_FILE, HALVES_SLUG, file, slug, pages, planFor, planForHalves,
  cardMetrics, measuredNames, article,
} from '../scripts/charts.mjs';

const url = p => new URL('../app/' + p, import.meta.url);
const read = p => readFileSync(url(p), 'utf8');
const html = new Map(SIZES.map(n => [n, read(file(n))]));
/* CHARTS is the generator's own list of every generated page: the seven size
   pages and the two-halves page (#425). Per-page invariants loop over it, so a
   page added there is held to them without anyone editing a test. */
const sitemap = read('sitemap.xml');
const sw = read('sw.js');

/* ---------------- 1. the pages are what the generator says ---------------- */

test('article picks "a" or "an" the way the roster-size copy needs', () => {
  // an before 8, 11, 18 and 80-89; a everywhere else (item 8 of #75)
  assert.equal(article(6), 'a');
  assert.equal(article(8), 'an');
  assert.equal(article(11), 'an');
  assert.equal(article(18), 'an');
  assert.equal(article(12), 'a');
});

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
     entry, and index.html's JSON-LD `softwareHelp` — while all the chart
     pages were already correct.

     Only ABSOLUTE URLs, because relative in-app links are a different
     question and `test/link-graph.test.js` owns it.

     THIS COMMENT USED TO SAY THE OPPOSITE, and it is worth knowing why it was
     wrong. It read: "the in-app links stay `./about.html` on purpose -- that
     spelling is the service worker's precache key... rewriting those would
     break the offline About link." The premise was real but the conclusion
     was backwards: the links and the precache key HAD already drifted apart
     for `advanced.html`, and offline that served the app shell in place of
     the page. `sw.js` now resolves a navigation to the file backing it, so
     the href is free to be the address the canonical names, and
     `redirect-check.mjs` arm 5 is what holds that. */
  const files = ['index.html', 'about.html', 'sitemap.xml', ...CHARTS.map(c => c.file)];
  for (const name of files) {
    for (const m of read(name).matchAll(/https:\/\/benchcard\.app\/(\S*?)(?=["'<\s])/g)) {
      assert.ok(!m[1].endsWith('.html'),
        `${name} publishes https://benchcard.app/${m[1]}, which 307s — use /${m[1].slice(0, -5)}`);
    }
  }
});

test('about.html links to every size, so the pages are reachable without the sitemap', () => {
  const about = read('about.html');
  for (const n of SIZES) {
    assert.ok(about.includes(`href="./${slug(n)}"`), `about.html does not link to ${slug(n)}`);
  }
  // and each page links to its five siblings
  for (const n of SIZES) {
    for (const o of SIZES) {
      if (o === n) continue;
      assert.ok(html.get(n).includes(`href="./${slug(o)}"`), `${file(n)} does not link to ${slug(o)}`);
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
  for (const c of CHARTS) {
    assert.ok(!sw.includes(c.slug), `${c.file} is precached; it was deliberately left out`);
    assert.ok(!read(c.file).includes('favicon.ico'),
      `${c.file} references favicon.ico, which is deliberately unreferenced`);
  }
});

test('nothing public shows a player level, real or sample', () => {
  /* test/leak.test.js bans levels from the card, the bench, the share image,
     analytics and the CSV. A public landing page is the most public artefact
     there is, so the same ban applies to the sample roster. */
  for (const c of CHARTS) {
    const page = read(c.file);
    assert.ok(!/\btier\b/i.test(page), `${c.file} mentions a tier`);
    assert.ok(!/\blevel\b/i.test(page), `${c.file} mentions a player level`);
  }
});

test('the pages read correctly with JavaScript off', () => {
  for (const c of CHARTS) {
    const page = read(c.file);
    /* Exactly one inline script — the pre-paint theme resolution — and no
       external one. There is nothing here to reveal, so there is nothing that
       can stay hidden. */
    const scripts = [...page.matchAll(/<script[^>]*>/g)]
      .filter(m => !/type="application\/ld\+json"/.test(m[0])); // data, not code (#279)
    assert.equal(scripts.length, 1, `${c.file} has ${scripts.length} scripts; it should only have the theme one`);
    /* ...and the data blocks skipped above are counted, so extras cannot pile up unchecked. */
    const data = page.match(/<script type="application\/ld\+json">/g) || [];
    assert.equal(data.length, 1, `${c.file} has ${data.length} ld+json blocks; it should have exactly one`);
    assert.ok(!/<script[^>]+src=/.test(page), `${c.file} loads an external script`);
    const style = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
    assert.ok(!/opacity:\s*0\s*[;}]|visibility:\s*hidden/.test(style),
      `${c.file} hides content in CSS with no script to unhide it`);
    // and the card is in the markup, not built at runtime
    assert.ok(page.includes('<div class="card">'), `${c.file} has no card in the HTML itself`);
  }
});

test('head hygiene matches the two pages that came before', () => {
  for (const c of CHARTS) {
    const page = read(c.file);
    for (const needle of [
      '<meta name="description" content="',
      // a draft page is noindex; see the sitemap test above for why
      page.includes('data-draft="1"')
        ? '<meta name="robots" content="noindex, nofollow">'
        : '<meta name="robots" content="index, follow',
      '<meta property="og:site_name" content="Benchcard">',
      '<meta property="og:image" content="https://benchcard.app/og.png">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<link rel="stylesheet" href="./tokens.css">',
    ]) assert.ok(page.includes(needle), `${c.file} is missing ${needle}`);
    /* Open Graph URLs must be absolute — a relative one resolves against the
       scraper, not the site. */
    for (const m of page.matchAll(/<meta property="og:(url|image)" content="([^"]+)"/g)) {
      assert.match(m[2], /^https:\/\/benchcard\.app\//, `${c.file} og:${m[1]} is not absolute`);
    }
  }
});

test('every page the site publishes points at the same share image', () => {
  /* Every page listed below points at the same og.png, and get there with `og:image`,
     its MIME type and `twitter:image` — the same URL/type sub-properties
     regardless of what size the image is or what it depicts. The width,
     height and alt text are the part that actually describes the image, and
     those are `test/static-pages.test.js`'s job: it reads the size back from
     og.png's own bytes and checks every page's alt text against every other
     page's, rather than a literal copy of both here that would drift the
     moment either changed and only one file got the memo. */
  for (const name of ['index.html', 'about.html', 'advanced.html', ...CHARTS.map(c => c.file)]) {
    const page = read(name);
    for (const needle of [
      '<meta property="og:image" content="https://benchcard.app/og.png">',
      '<meta property="og:image:type" content="image/png">',
      '<meta name="twitter:image" content="https://benchcard.app/og.png">',
    ]) assert.ok(page.includes(needle), `${name} is missing ${needle}`);
  }
});

test('the placeholder copy is marked, so nobody ships it by accident', () => {
  /* The prose on these pages is the author's, not the loop's. Until it lands,
     every slot is bracketed AND carries data-draft, so
     `grep -l 'data-draft="1"' app/*.html` is an accurate list of what is unwritten. This test does not
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

/* ---------------- 4. the sample cast and the searched words (#423) ---------------- */

test('each chart prints the same kids the app\'s "Try it with n sample players" team has', () => {
  for (const n of SIZES) {
    assert.deepEqual(planFor(n).players?.map(p => p.name), sampleRoster(n).map(p => p.name),
      `${file(n)} is not built from the first ${n} of the app's sample cast`);
  }
  // and the card shows their short names, so a visitor who taps "Try" sees MAYA, ELI, DEVO...
  assert.deepEqual(Object.values(planFor(7).shortNames).sort(),
    ['CALE', 'DEVO', 'ELI', 'HARP', 'MAYA', 'NIA', 'SILA']);
});

test('each lede says substitution, printable and equal playing time, and still hedges', () => {
  for (const n of SIZES) {
    const lede = html.get(n).match(/<p class="lede[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    assert.ok(lede, `${file(n)} has no lede`);
    const text = lede.replace(/\s+/g, ' ').toLowerCase();
    for (const w of ['substitution', 'printable', 'equal playing time']) {
      assert.ok(text.includes(w), `${file(n)}'s lede does not say "${w}": ${text}`);
    }
    assert.ok(text.includes('as close to equal playing time as the arithmetic allows'),
      `${file(n)}'s lede lost its hedge: ${text}`);
    assert.ok(!/\b(equal|even) minutes\b/.test(text.replace(/minutes each/g, '')),
      `${file(n)}'s lede claims equal minutes flat: ${text}`);
  }
});


/* ---------------- 5. six players, and two halves (#425) ---------------- */

const lede = page => (page.match(/<p class="lede[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/\s+/g, ' ');
const meta = (page, re) => page.match(re)?.[1];
const footerMinutes = page => page.match(/<div class="card-ft">([^<]*)<\/div>/)[1].trim()
  .split(/\s{3}/).filter(Boolean).map(e => Number(e.split(' ')[1]));

test('SIZES is 6 to 12, and the 6-player page prints 24 to 28 minutes each over 8 stints', () => {
  assert.deepEqual(SIZES, [6, 7, 8, 9, 10, 11, 12]);
  const page = read('6-player-basketball-rotation-chart.html');
  const mins = footerMinutes(page);
  assert.equal(mins.length, 6);
  assert.ok(Math.min(...mins) >= 24 && Math.max(...mins) <= 28, `minutes are ${mins}`);
  assert.equal((page.match(/<div class="stint(?: newper)?"/g) || []).length, 8);
  assert.ok(page.includes('6-PLAYER ROTATION') && page.includes('4 QUARTERS · 8 MIN'));
});

test('the generator lists every chart page once: the seven sizes, then the halves page', () => {
  assert.deepEqual(CHARTS.map(c => c.file), [...SIZES.map(file), HALVES_FILE]);
  assert.deepEqual(CHARTS.map(c => c.slug), [...SIZES.map(slug), HALVES_SLUG]);
  assert.deepEqual([...pages().keys()], CHARTS.map(c => c.file), 'pages() and the list disagree');
  assert.ok(!SIZES.map(file).includes(HALVES_FILE), 'the halves page is not a roster size');
});

test('the halves page is 10 players, two 20-minute halves, 10 stints of 20 minutes each', () => {
  const page = read(HALVES_FILE);
  assert.ok(page.includes('<span class="opp">10-PLAYER ROTATION</span><span class="when">2 HALVES · 20 MIN</span>'));
  assert.deepEqual(footerMinutes(page), Array(10).fill(20));
  assert.equal((page.match(/<div class="stint(?: newper)?"/g) || []).length, 10);
  const names = new Set([...page.matchAll(/<span class="nm(?: fresh)?">([^<]+)<\/span>/g)].map(m => m[1]));
  assert.equal(names.size, 10);
  const clocks = [...page.matchAll(/<span class="clk">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.equal(clocks.filter(c => /^H\d /.test(c)).map(c => c.slice(0, 2)).join(), 'H1,H2');
  assert.ok(lacks(page, '4 QUARTERS'), 'the halves card says quarters');
  assert.ok(!page.includes('data-draft="1"'), 'the halves page is a draft');
  assert.ok(page.includes('<meta name="robots" content="index, follow'));
});

test('the halves page copy is exactly the spec\'s', () => {
  const page = read(HALVES_FILE);
  assert.equal(meta(page, /<title>([^<]*)<\/title>/), 'Basketball rotation chart for two halves | Benchcard');
  assert.equal(meta(page, /<h1[^>]*>([^<]*)<\/h1>/), 'Basketball rotation chart for two halves');
  const desc = meta(page, /<meta name="description" content="([^"]*)"/);
  assert.equal(desc, 'A printable substitution chart for two 20-minute halves: 10 players, subs every 4 minutes, ' +
    '20 minutes each. Free, no signup, works offline.');
  assert.ok(desc.length <= 160);
  assert.equal(lede(page), 'A finished, printable substitution chart for 10 players over two twenty-minute halves, ' +
    'subbing every four minutes: 20 minutes each, as close to equal playing time as the arithmetic allows, ' +
    'worked out before tip-off. Paste your own roster into Benchcard and it prints yours.');
  assert.match(page, /<figcaption[^>]*>Each box is one stint: the clock is time left in the period, and the underlined names just came on\. 10 stints, five on the floor, and it cuts out to fit a pocket\.<\/figcaption>/);
  assert.ok(page.includes('<p class="trust noprint">Free, and there is no account. Your roster never leaves your device.</p>'));
  assert.ok(page.includes('<a class="btn" href="./?try=10">Try it with 10 sample players</a>'));
  assert.ok(page.includes('<link rel="canonical" href="https://benchcard.app/basketball-rotation-chart-two-halves">'));
  const ld = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  assert.equal(ld[0].name, 'Basketball rotation chart for two halves');
  assert.equal(ld[0].url, 'https://benchcard.app/basketball-rotation-chart-two-halves');
  assert.deepEqual(ld[1].itemListElement.map(i => i.name), ['Benchcard', 'About', 'Two-halves chart']);
});

test('the halves card is a real generatePlan run and fits the card', () => {
  const plan = planForHalves();
  assert.equal(plan.stints.length, 10);
  assert.deepEqual(plan.players.map(p => p.name), sampleRoster(10).map(p => p.name));
  const contentPx = (3.45 - 2 * 0.11) * 96;
  const m = cardMetrics(plan);
  assert.ok(m.widest <= contentPx + 0.5 && m.five >= 16, `halves card: ${JSON.stringify(m)}`);
  for (const s of Object.values(plan.shortNames)) assert.ok(measuredNames().includes(s), `no width for ${s}`);
});

test('size pages and the halves page link to each other', () => {
  const nav = (page, label) => page.match(new RegExp(`<nav class="sizes" aria-label="${label}">([\\s\\S]*?)</nav>`))?.[1];
  const chips = n => [...(n ?? '').matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map(m => [m[1], m[2]]);
  for (const n of SIZES) {
    const page = html.get(n);
    assert.deepEqual(chips(nav(page, 'Other roster sizes')),
      SIZES.filter(o => o !== n).map(o => [`./${slug(o)}`, `${o} players`]), `${file(n)} siblings`);
    assert.ok(page.includes('<h2>Playing two halves?</h2>'), `${file(n)} has no halves heading`);
    assert.deepEqual(chips(nav(page, 'Other game formats')),
      [[`./${HALVES_SLUG}`, 'Two 20-minute halves']], `${file(n)} halves chip`);
  }
  const page = read(HALVES_FILE);
  assert.ok(page.includes('<h2>A chart for your roster size</h2>'));
  assert.deepEqual(chips(nav(page, 'Rotation charts by roster size')),
    SIZES.map(o => [`./${slug(o)}`, `${o} players`]));
});

test('about and advanced link the 6 chart first, then the halves page in its own nav', () => {
  for (const name of ['about.html', 'advanced.html']) {
    const src = read(name);
    const sizes = src.match(/<nav class="sizes" aria-label="Rotation charts by roster size">([\s\S]*?)<\/nav>\s*<nav class="sizes" aria-label="Rotation charts by game format">([\s\S]*?)<\/nav>/);
    assert.ok(sizes, `${name} has no game-format nav directly after the roster-size nav`);
    assert.deepEqual([...sizes[1].matchAll(/href="([^"]*)"/g)].map(m => m[1]), SIZES.map(n => `./${slug(n)}`));
    assert.ok(sizes[1].includes('>6 players<'));
    assert.deepEqual([...sizes[2].matchAll(/<a href="([^"]*)">([^<]*)</g)].map(m => [m[1], m[2]]),
      [[`./${HALVES_SLUG}`, 'Two halves']]);
  }
});

test('the sitemap lists the 6-player page before the 7 and the halves page after the 12', () => {
  const entries = [...sitemap.matchAll(/<url>\s*<loc>([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>\s*<changefreq>[^<]*<\/changefreq>\s*<priority>([^<]*)<\/priority>/g)]
    .map(m => m.slice(1));
  const at = loc => entries.findIndex(e => e[0] === `https://benchcard.app/${loc}`);
  assert.equal(at(slug(6)) + 1, at(slug(7)));
  assert.equal(at('basketball-rotation-chart-two-halves'), at(slug(12)) + 1);
  for (const loc of [slug(6), 'basketball-rotation-chart-two-halves']) {
    assert.deepEqual(entries[at(loc)].slice(1), ['2026-11-01', '0.7'], loc);
  }
});
