#!/usr/bin/env node
/* The roster-size landing pages: /7-player-basketball-rotation-chart and its
 * five siblings.
 *
 *   node scripts/charts.mjs           # write app/<n>-player-basketball-rotation-chart.html
 *   node scripts/charts.mjs --check   # exit 1 if any page on disk is stale
 *
 * WHY A GENERATOR AND NOT SIX HTML FILES
 *
 * Six near-identical hand-kept pages drift; that is the whole failure mode of
 * this shape of SEO page. One template renders all six, so structure cannot
 * drift at all, and `--check` (wired into test/charts.test.js) fails the suite
 * the moment a page on disk stops matching what this file would write.
 *
 * WHERE THE CARD COMES FROM
 *
 * The card on each page is a REAL plan: `generatePlan` from app/engine.js is
 * run at build time for that roster size, and the stints, the substitutions
 * and the minutes footer are its answer. Nothing here invents a rotation.
 * about.html draws its artefacts by hand out of the app's class vocabulary,
 * which is lighter but can drift from the engine with nothing catching it --
 * this does not have that hazard for the card's *content*. What it can still
 * drift on is markup: the class names below mirror `buildCard` in app/card.js,
 * and test/charts.test.js pins every one of them against that file.
 *
 * The one thing the engine cannot give us at build time is card.js's auto-fit,
 * which measures type on a canvas. The height half of that fit is pure
 * arithmetic and is reproduced exactly; the width half uses a measured
 * advance constant (see ADVANCE) and is deliberately conservative.
 *
 * THE PROSE IS NOT MINE
 *
 * Everything in COPY marked PLACEHOLDER is a slot for the author. It ships
 * visible and bracketed on purpose: a page that quietly reads as finished is
 * how placeholder copy goes live. Elements built from a placeholder carry
 * `data-draft="1"`, so `grep -l data-draft app/*.html` lists what is still
 * unwritten.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePlan, fmtClock, fmtMinutes } from '../app/engine.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const ORIGIN = 'https://benchcard.app';
/* The share card is the same og.png on every page of the site, so the alt text
   is the same too -- it describes the image, not the page. Kept byte-identical
   to index.html's and about.html's; test/charts.test.js pins all eight. Already
   entity-escaped, so it is interpolated raw rather than through esc().
   Used twice per page: X reads twitter:image:alt and ignores og:image:alt. */
const OG_ALT = 'Benchcard&rsquo;s bench mode open on a phone: the five players on the floor with minutes played, and the next substitution &mdash; who is coming off and who is going on &mdash; beside the words &ldquo;Even minutes, worked out before the game.&rdquo;';

export const SIZES = [7, 8, 9, 10, 11, 12];
export const slug = n => `${n}-player-basketball-rotation-chart`;
export const file = n => `${slug(n)}.html`;

/* ------------------------------------------------------------------ *
 * the sample roster
 *
 * First names only, and no `tier` on any of them: test/leak.test.js bans a
 * player level from every artefact the app hands out, and a public page is
 * the most public artefact there is. Twelve names, first N used, chosen so
 * `deriveShortNames` resolves them to four characters with no collisions --
 * which is also what keeps the width fit below honest.
 * ------------------------------------------------------------------ */
const NAMES = ['Ava', 'Beckett', 'Cole', 'Dev', 'Elena', 'Finn',
  'Grace', 'Harper', 'Isaiah', 'Jonah', 'Kai', 'Luca'];

/* The app's own defaults, and the same game the About page describes: four
   eight-minute quarters, a substitution every four minutes. Uniform across
   all six pages on purpose -- the pages are meant to be compared, and a coach
   who lands on the 9 and then the 10 should be reading the same game. */
const FORMAT = { periods: 4, periodMinutes: 8 };
const GRANULARITY = { mode: 'everyN', value: 4 };
const SEED = 11;

export function planFor(n) {
  const players = NAMES.slice(0, n).map((name, i) => ({ id: `p${i}`, name }));
  const plan = generatePlan({
    players,
    availableIds: players.map(p => p.id),
    format: FORMAT, granularity: GRANULARITY, seed: SEED,
  });
  if (!plan.ok) throw new Error(`the engine will not plan ${n} players: ${JSON.stringify(plan.issues)}`);
  return plan;
}

/* ------------------------------------------------------------------ *
 * the card
 *
 * Class-for-class what `buildCard` in app/card.js emits, so app/card.css
 * styles it and prints it with no page-local rules at all.
 * ------------------------------------------------------------------ */
const IN = 96;
// Must match CARD_SIZES.pocket in app/card.js.
const CARD = { w: 3.45, h: 5.0, pad: 0.11, header: 26, footer: 18, minName: 16, maxName: 26 };
const SAFETY_PX = 10, CHG_RATIO = 0.70;
const contentPx = (CARD.w - 2 * CARD.pad) * IN;
const bodyPx = (CARD.h - 2 * CARD.pad) * IN - CARD.header - SAFETY_PX - CARD.footer;
const stintPx = px => px * 1.12 + px * CHG_RATIO * 1.3;

/* Type widths, measured rather than guessed.
 *
 * card.js sizes the card by measuring names on a canvas in the real font; a
 * build script has no canvas and no font parser, and an estimate from a mean
 * character advance is not good enough -- the first cut of this used 0.64em
 * and the true worst-case advance for these names is 0.695em, so the card
 * would have been sized MORE generously than the app's own fit and could
 * overflow.
 *
 * So the widths are measured once, in Chrome, against the vendored InterVar
 * at weight 800 -- card.js's own `widthAt`, at 100px, on exactly the twelve
 * short names these pages print. `deriveShortNames` is deterministic and the
 * sample roster is fixed, so this table is complete; test/charts.test.js
 * fails if a plan ever prints a name that is not in it, which is the only way
 * it could go stale.
 *
 * ADVANCE is the fallback for a name that is somehow not in the table, and it
 * is deliberately above the measured worst case rather than near the mean. */
const WIDTH_AT_100 = {
  AVA: 214.28, BECK: 275.64, COLE: 269.17, DEV: 210.21,
  ELEN: 255.11, FINN: 240.25, GRAC: 288.24, HARP: 283.22,
  ISAI: 197.96, JONA: 289.79, KAI: 179.37, LUCA: 277.50,
};
const ADVANCE = 0.72;
export const measuredNames = () => Object.keys(WIDTH_AT_100);
const nameWidth = (s, px) => (WIDTH_AT_100[s] != null ? WIDTH_AT_100[s] / 100 : s.length * ADVANCE) * px;
const rowWidth = (names, px) =>
  names.reduce((a, s) => a + nameWidth(s, px), 0) + (names.length - 1) * 0.42 * px;

export function cardMetrics(plan) {
  const rows = plan.stints.map(r => r.onFloor.map(id => plan.shortNames[id]));
  const at100 = Math.max(...rows.map(r => rowWidth(r, 100)));
  const widthFit = 100 * contentPx / at100;
  const heightFit = bodyPx / (plan.stints.length * stintPx(1));
  const five = Math.max(CARD.minName, Math.min(widthFit, heightFit, CARD.maxName));
  const chg = Math.min(five * CHG_RATIO, CARD.maxName * 0.65);
  return { five: round(five), chg: round(chg), widest: round(rowWidth(rows[widestRow(rows)], five)) };
}
const widestRow = rows => rows.reduce((best, r, i) => (rowWidth(r, 100) > rowWidth(rows[best], 100) ? i : best), 0);
const round = n => Math.round(n * 100) / 100;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cardHtml(n, plan) {
  const m = cardMetrics(plan);
  const sh = plan.shortNames;
  const out = [];
  out.push('<div class="card">');
  out.push(`<div class="card-hd"><span class="opp">${n}-PLAYER ROTATION</span>` +
    '<span class="when">4 QUARTERS · 8 MIN</span></div>');
  out.push('<div class="stints">');
  for (const r of plan.stints) {
    const newPeriod = r.index === 0 || plan.stints[r.index - 1].period !== r.period;
    const cls = 'stint' + (r.index > 0 && newPeriod ? ' newper' : '');
    const clk = (newPeriod ? `${r.periodName || 'Q' + r.period} ` : '') + fmtClock(r.startSec);
    const io = r.out.length
      ? `<span class="io">▼${r.out.map(id => sh[id]).join(' ')}</span>`
      : `<span class="io start">${r.index === 0 ? 'START' : 'NO SUBS'}</span>`;
    const five = r.onFloor
      .map(id => `<span class="nm${r.in.includes(id) ? ' fresh' : ''}">${sh[id]}</span>`).join('');
    out.push(`<div class="${cls}">` +
      `<div class="chg" style="font-size:${m.chg}px"><span class="clk">${clk}</span>${io}</div>` +
      `<div class="five" style="font-size:${m.five}px">${five}</div></div>`);
  }
  out.push('</div>');
  out.push(`<div class="card-ft">${Object.entries(plan.minutes).sort((a, b) => b[1] - a[1])
    .map(([id, mins]) => `${sh[id]} ${fmtMinutes(mins)}`).join('   ')}</div>`);
  out.push('</div>');
  return out.join('\n    ');
}

/* ------------------------------------------------------------------ *
 * the numbers each page states about itself
 *
 * Read off the generated plan rather than written down, so a description can
 * never claim minutes the card does not print.
 * ------------------------------------------------------------------ */
export function facts(plan) {
  const mins = Object.values(plan.minutes);
  const lo = Math.min(...mins), hi = Math.max(...mins);
  return {
    lo, hi,
    minutes: lo === hi ? `${fmtMinutes(lo)} minutes each` : `${fmtMinutes(lo)}–${fmtMinutes(hi)} minutes each`,
    stints: plan.stints.length,
  };
}

/* ------------------------------------------------------------------ *
 * COPY
 *
 * ==================================================================
 * THE AUTHOR'S TABLE. Everything marked PLACEHOLDER below is a slot,
 * not copy. Fill it in, run `node scripts/charts.mjs`, commit the six
 * regenerated pages. Do not deploy with the brackets still in.
 * ==================================================================
 *
 * `title` and `description` are NOT placeholders: they are assembled from the
 * roster size and the generated plan's own numbers, so they are factual by
 * construction and cannot contradict the card. Rewrite them if you want a
 * better line, but they are shippable as they stand.
 *
 * `lede` and `caption` are WRITTEN as of this commit. They are the two places
 * the page speaks. The vocabulary the research found, in
 * order: chart > calculator > sheet / template / generator > printable.
 * Question-and-advice phrasings return zero autocomplete suggestions, so this
 * is not the place for an explainer -- it is the place to hand over the
 * artefact and point at the app.
 */
const COPY = {
  title: n => `${n}-player basketball rotation chart | Benchcard`,
  description: (n, f) =>
    `A printable substitution chart for a ${n}-player basketball roster: four 8-minute ` +
    `quarters, subs every 4 minutes, ${f.minutes}. Free, no signup, works offline.`,
  h1: n => `${n}-player basketball rotation chart`,
  /* Written. Both lines take their numbers from the generated plan, so neither
     can drift from the card printed underneath it.

     "as close to even as the arithmetic allows" rather than "even minutes":
     with some roster sizes the slots do not divide, and the timeline directly
     below would disprove the stronger claim. The page must not overclaim what
     its own artefact shows. */
  lede: (n, f) =>
    `A finished rotation for ${n} players over four eight-minute quarters, ` +
    `subbing every four minutes — ${f.minutes}, as close to even as the ` +
    `arithmetic allows, worked out before tip-off. Paste your own roster into ` +
    `Benchcard and it prints yours.`,
  caption: (n, f) =>
    `Each block is one substitution: the clock is time left in the period, and ` +
    `the underlined names just came on. ${f.stints} stints, five on the floor, ` +
    `and it cuts out to fit a pocket.`,
  /* The trust line, and the one thing these pages were missing. A coach who
     arrives here from a search result meets a rotation chart and two buttons
     with no idea what the thing costs or what happens to the names they type;
     the answer was only in <meta name="description">, where a reader cannot
     see it. Not a function, because it is the same on all six.

     The words are lifted from what the site already says rather than written
     fresh: index.html's welcome foot is "No account. Your roster never leaves
     your device." and about.html's FAQ answers "Is
     Benchcard free?" with "Yes. It is free, there is no account...". Nothing
     here is a new claim, and deliberately no "runs entirely in your browser"
     -- that absolute is wider than anything the site says elsewhere, and it
     stays unsaid until someone can stand behind it. */
  trust: 'Free, and there is no account. Your roster never leaves your device.',
};
const PLACEHOLDER_KEYS = ['lede', 'caption'];

/* A page is a DRAFT while any author slot still holds its placeholder, and a
   draft must not be indexed. Placeholder prose on a young domain is a bad first
   impression to hand a crawler, and these pages are linked from about.html, so
   staying out of sitemap.xml alone would not keep Google away.

   Derived, never a flag: the moment the author writes both slots the noindex
   disappears by itself. A hand-set switch is one someone forgets to flip, and
   the failure is silent in the direction that costs us. */
const isDraft = (n, f) =>
  PLACEHOLDER_KEYS.some(k => String(COPY[k](n, f)).includes('[PLACEHOLDER'));

/* ------------------------------------------------------------------ *
 * the shared head furniture
 *
 * Lifted out of about.html at build time rather than copied. The pre-paint
 * theme script in particular is pinned by test/storage.test.js as a byte-level
 * match across every page, and a hand-kept copy is exactly the drift that test
 * exists to catch -- so there is only ever one copy of it in the repo.
 * ------------------------------------------------------------------ */
function fromAbout() {
  const src = readFileSync(join(APP, 'about.html'), 'utf8');
  const themeStart = src.indexOf('<script>');
  const themeEnd = src.indexOf('</script>', themeStart) + '</script>'.length;
  const theme = src.slice(themeStart, themeEnd);
  const icon = src.match(/<link rel="icon"[^>]*>/)[0];
  if (!theme.includes('benchcard.v6') || !icon.includes('data:image/svg')) {
    throw new Error('about.html no longer has the shape this generator lifts from');
  }
  return { theme, icon };
}

/* ------------------------------------------------------------------ *
 * the page
 * ------------------------------------------------------------------ */
export function renderPage(n, shared = fromAbout()) {
  const plan = planFor(n);
  const f = facts(plan);
  const url = `${ORIGIN}/${slug(n)}`;
  /* Marked on the page, and derived from the copy rather than set by hand:
     a hard-coded data-draft survives the copy being written, so the noindex
     would never lift and nobody would notice. Both signals come from the
     same fact. */
  const draftAttr = isDraft(n, f) ? ' data-draft="1"' : '';
  const title = COPY.title(n);
  const desc = COPY.description(n, f);

  const siblings = SIZES.filter(o => o !== n)
    .map(o => `<a href="./${file(o)}">${o} players</a>`).join('\n      ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F6F4F0">
${shared.theme}
<!-- The same data-URI icon as the app and the About page, and the same
     reason: the crawlable .ico at the site root is deliberately referenced by
     nothing, so no page pays a request for it. test/favicon.test.js pins that
     for the first two documents; test/charts.test.js extends it to these. -->
${shared.icon}
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<link rel="manifest" href="./site.webmanifest">

<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<!-- Canonical is the extensionless URL, which is what Cloudflare actually
     serves a 200 for: html_handling: auto-trailing-slash 307s
     /<name>.html to /<name>. Internal hrefs keep the .html spelling so the
     pages also work under python3 -m http.server, and so the precached
     spelling and the linked spelling stay the same as they are for
     about.html -- see scripts/redirect-check.mjs. -->
<link rel="canonical" href="${url}">
<meta name="robots" content="${isDraft(n, f) ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Benchcard">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ORIGIN}/og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">

<!-- tokens.css is the app's palette and type stack, card.css is the card
     itself -- both already precached for anyone who has opened the app, and
     both shared rather than copied so this page cannot drift into looking
     like a different product. card.css also brings the @page and print rules,
     which is why Ctrl-P on this page yields the card at true size and none of
     the chrome: everything else here is .noprint. -->
<link rel="stylesheet" href="./tokens.css">
<link rel="stylesheet" href="./card.css">
<style>
/* Page chrome only. Deliberately no scroll reveals and no page script: this
   document exists to be read by someone arriving cold from a search result,
   including with JavaScript off, and the About page's reveal guard is a cost
   with nothing to buy here. */
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: var(--font); font-size: 17px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  padding: 0 1.15rem env(safe-area-inset-bottom);
}
.wrap { max-width: 40rem; margin: 0 auto; }
/* Wraps because at a 32px root the wordmark (200px) and "Open the app" (143px
   at its min-content, both already wrapping internally) cannot both fit a
   316px column, and neither can shrink further -- so without this the button
   hung 29px off a 390px viewport and 112px off a 320px one, clipped mid-word,
   and the whole page panned sideways. The spacer keeps the button hard right
   on one line and drops it under the wordmark on two. */
.top { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; padding: .9rem 0 .3rem; }
/* \`min-height\` because the wordmark is a live link home, not decoration, and it
   was 27px tall -- under the 44px floor the rest of the app holds itself to.
   It costs no bar height while the CTA pill shares the row (that pill is
   already 44px); it only pays when the row wraps at large text. */
.mark { display: flex; align-items: center; min-height: 44px; gap: .5rem; text-decoration: none; color: inherit; }
.mark b { font-size: 1.05rem; font-weight: 660; letter-spacing: -.03em; }
.spacer { flex: 1; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
  min-height: 44px; padding: 0 1.05rem; border-radius: 999px;
  font: inherit; font-size: .95rem; font-weight: 580; letter-spacing: -.01em;
  text-decoration: none; border: 1px solid var(--line-2); color: var(--ink);
  background: var(--surface);
  transition: transform 110ms cubic-bezier(.22,.61,.36,1);
}
.btn.primary { background: var(--accent); border-color: transparent; color: var(--accent-ink); }
.btn:active { transform: scale(.97); }
h1 {
  font-size: clamp(1.9rem, 7.5vw, 2.7rem); line-height: 1.06; letter-spacing: -.045em;
  font-weight: 700; margin: 1.6rem 0 0;
}
.lede { font-size: 1.16rem; line-height: 1.5; color: var(--ink-2); margin: 1rem 0 0; }
.cta { display: flex; flex-wrap: wrap; gap: .6rem; margin: 1.5rem 0 .9rem; }
/* Sits under the buttons, where the question it answers gets asked. Muted and
   small: it is a fact, not a pitch. */
.trust { font-size: .92rem; color: var(--muted); margin: 0 0 1.8rem; }
figure { margin: 0 0 1.6rem; }
figcaption { font-size: .88rem; color: var(--muted); margin-top: .7rem; }
section { border-top: 1px solid var(--line); padding-top: 1.6rem; margin-top: 2.2rem; }
h2 { font-size: 1.15rem; letter-spacing: -.03em; font-weight: 640; margin: 0 0 .8rem; }
p { margin: .8rem 0; color: var(--ink-2); }
a { color: var(--accent); text-underline-offset: .18em; text-decoration-thickness: .07em; }
/* The sibling links. Chips rather than a list: six roster sizes is a picker,
   and 44px keeps it tappable on a phone. */
.sizes { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; }
.sizes a {
  display: inline-flex; align-items: center; min-height: 44px; padding: 0 .95rem;
  border-radius: 999px; border: 1px solid var(--line-2); background: var(--surface);
  color: var(--ink); text-decoration: none; font-size: .95rem; font-weight: 580;
}
/* Placeholder copy, and it should look like it until the author lands. */
[data-draft] { color: var(--muted); font-style: italic; }
footer {
  border-top: 1px solid var(--line); margin: 2.6rem 0 0; padding: 1.4rem 0 2.6rem;
  font-size: .92rem; color: var(--muted);
  display: flex; flex-wrap: wrap; gap: .5rem 1.2rem; align-items: center;
}
/* The footer links are standalone controls, not words inside a sentence, so the
   44px floor applies to them the same as anywhere else. They are already flex
   items (blockified), so a min-height grows the box rather than overlapping the
   line beside it. */
footer a { display: flex; align-items: center; min-height: 44px; }

/* 19em is the app's own name for "the reader has turned their text up" --
   304px at a default root, so a 320px phone at normal text never sees this,
   but 608px at a 32px root, so a 320px phone at 200% does. The mail link is
   one unbreakable token 305px wide in a 288px column; without this the page
   measured 342px in a 320px viewport, and overflow-x: clip deleted the
   scrollbar rather than the overflow, so nothing panned and nothing showed.
   about.html has carried the identical rule since it shipped; this template
   never got it. */
@media (max-width: 19em) {
  footer a { overflow-wrap: anywhere; }
}
</style>
</head>
<body>
<div class="wrap">

  <div class="top noprint">
    <a class="mark" href="./">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" fill="var(--accent)"/>
        <g stroke="var(--accent-ink)" stroke-width="1.35" fill="none" opacity=".55">
          <path d="M12 1.5v21M1.5 8.5h21M1.5 15.5h21"/>
          <path d="M4.6 3.7c3.5 3.8 3.5 12.8 0 16.6M19.4 3.7c-3.5 3.8-3.5 12.8 0 16.6"/>
        </g>
      </svg>
      <b>Benchcard</b>
    </a>
    <span class="spacer"></span>
    <a class="btn" href="./">Open the app</a>
  </div>

  <h1 class="noprint">${esc(COPY.h1(n))}</h1>
  <p class="lede noprint"${draftAttr}>${esc(COPY.lede(n, f))}</p>

  <div class="cta noprint">
    <a class="btn primary" href="./">Build one for your roster</a>
    <!-- The link that continues the thought they arrived with. try=${n}
         opens the app with a clearly-labelled ${n}-player SAMPLE team, so a
         coach with nothing to paste can push this rotation around instead of
         reading about it. It is read only when the app has no team, it is
         stripped from the URL immediately, and it carries one integer and
         nothing about anybody -- it is not a URL share. -->
    <a class="btn" href="./?try=${n}">Try it with ${n} sample players</a>
    <a class="btn" href="./about.html">How it works</a>
  </div>
  <p class="trust noprint">${esc(COPY.trust)}</p>

  <figure>
    <!-- Generated by scripts/charts.mjs from a real generatePlan() run:
         ${n} players, 4 x 8 minutes, subs every 4, seed ${SEED}. Nothing in
         here is drawn by hand. -->
    <div class="stage">
    ${cardHtml(n, plan)}
    </div>
    <figcaption class="noprint"${draftAttr}>${esc(COPY.caption(n, f))}</figcaption>
  </figure>

  <section class="noprint">
    <h2>A different number of players?</h2>
    <nav class="sizes" aria-label="Other roster sizes">
      ${siblings}
    </nav>
  </section>

  <footer class="noprint">
    <span>Benchcard — free, offline, and yours.</span>
    <a href="./">Open the app</a>
    <a href="./about.html">How it works</a>
    <a href="mailto:hello@benchcard.app">hello@benchcard.app</a>
  </footer>
</div>
</body>
</html>
`;
}

/* Every page this generator owns, path relative to app/. */
export function pages() {
  const shared = fromAbout();
  return new Map(SIZES.map(n => [file(n), renderPage(n, shared)]));
}

export { PLACEHOLDER_KEYS };

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [name, html] of pages()) {
    const path = join(APP, name);
    let cur = null;
    try { cur = readFileSync(path, 'utf8'); } catch { /* new */ }
    if (cur === html) continue;
    stale.push(name);
    if (!check) writeFileSync(path, html);
  }
  if (check) {
    console.log(stale.length ? `stale: ${stale.join(', ')}` : `up to date — ${SIZES.length} pages`);
    process.exit(stale.length ? 1 : 0);
  }
  console.log(stale.length ? `wrote ${stale.length}: ${stale.join(', ')}` : `up to date — ${SIZES.length} pages`);
}
