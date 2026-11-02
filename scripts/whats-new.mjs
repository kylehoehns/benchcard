#!/usr/bin/env node
/* The What's new page: /whats-new (#499).
 *
 *   node scripts/whats-new.mjs           # write app/whats-new.html
 *   node scripts/whats-new.mjs --check   # exit 1 if the page on disk is stale
 *
 * The source is scripts/whats-new.json: an array, newest first, of
 * { date: 'YYYY-MM-DD', text: '<one plain sentence for a coach>' }. It sits
 * outside app/ because nothing in the browser fetches it (app/ is what
 * deploys), and it is JSON so scripts/check-whats-new.mjs can read the base
 * branch's copy with `git show`. The text is plain: it is escaped here, so no
 * markup and no issue numbers.
 *
 * The source keeps every entry; the page shows the newest LIMIT of them,
 * grouped by week (Monday start), newest week first. `--check` is wired into
 * test/whats-new.test.js, so a source edit without a regenerated page fails
 * `npm test`. The same shape as scripts/charts.mjs, whose head furniture this
 * reuses rather than retypes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faviconHref, logoSvg } from './mark.mjs';
import { OG_ALT, fromAbout } from './charts.mjs';
import { humanize } from './check-about-date.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'scripts', 'whats-new.json');
const ORIGIN = 'https://benchcard.app';
export const FILE = 'whats-new.html';
export const LIMIT = 15;

const TITLE = 'What\'s new | Benchcard';
const DESC = 'What changed in Benchcard lately, newest first, in plain words for coaches.';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* The Monday on or before `iso`, as YYYY-MM-DD. UTC throughout, so the week
   never depends on the machine's zone. */
function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

/* The newest `limit` entries, grouped into weeks in the order given (the
   source is newest first): [{ monday, heading, entries }]. */
export function weeks(entries, limit = LIMIT) {
  const out = [];
  for (const entry of entries.slice(0, limit)) {
    const monday = mondayOf(entry.date);
    let week = out.find(w => w.monday === monday);
    if (!week) {
      week = { monday, heading: `Week of ${humanize(monday)}`, entries: [] };
      out.push(week);
    }
    week.entries.push(entry);
  }
  return out;
}

export function renderPage(entries) {
  const list = weeks(entries).map(w => `  <section>
    <h2>${esc(w.heading)}</h2>
    <ul>
${w.entries.map(x => `      <li>${esc(x.text)}</li>`).join('\n')}
    </ul>
  </section>`).join('\n\n');
  return `<!doctype html>
<html lang="en" data-tint="hardwood">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F4F4F6">
${fromAbout().theme}
<link rel="icon" href="${faviconHref()}">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<link rel="manifest" href="./site.webmanifest">

<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESC)}">
<link rel="canonical" href="${ORIGIN}/whats-new">
<meta name="robots" content="index, follow, max-image-preview:large">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Benchcard">
<meta property="og:url" content="${ORIGIN}/whats-new">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(TITLE)}">
<meta name="twitter:description" content="${esc(DESC)}">
<meta name="twitter:image" content="${ORIGIN}/og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">

<link rel="stylesheet" href="./tokens.css">
<link rel="stylesheet" href="./site.css">
</head>
<body>
<div class="wrap">
  <a class="mark" href="/">
    ${logoSvg()}
    <b>Benchcard</b>
  </a>

  <h1>What's new</h1>
  <p class="lede">The latest changes, newest first.</p>

${list}

  <div class="cta">
    <a class="btn primary" href="/">Open Benchcard</a>
    <a class="btn" href="/about">About</a>
  </div>
</div>
</body>
</html>
`;
}

export const entries = () => JSON.parse(readFileSync(SOURCE, 'utf8'));

/* Every page this generator owns, path relative to app/. */
export const pages = () => new Map([[FILE, renderPage(entries())]]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [name, html] of pages()) {
    const path = join(ROOT, 'app', name);
    let cur = null;
    try { cur = readFileSync(path, 'utf8'); } catch { /* new */ }
    if (cur === html) continue;
    stale.push(name);
    if (!check) writeFileSync(path, html);
  }
  if (check) {
    console.log(stale.length ? `stale: ${stale.join(', ')}` : 'up to date');
    process.exit(stale.length ? 1 : 0);
  }
  console.log(stale.length ? `wrote ${stale.join(', ')}` : 'up to date');
}
