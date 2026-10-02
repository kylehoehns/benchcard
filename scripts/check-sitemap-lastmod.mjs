/* Fail when a page listed in `app/sitemap.xml` changed but its <lastmod> did
   not.

   A <lastmod> that is not kept honest is read by Google as noise and then
   ignored, so a hand-set date is only worth having if something turns the
   promise to move it into a CI fact. The rule is deliberately one line: the
   page's HTML file is in the diff => its <lastmod> differs from the base's,
   OR is not earlier than the date the check runs (the HEAD commit's date).
   The second half is the same-day case, settled the way `check-about-date.mjs`
   settles it: a page edited on the day its <lastmod> already names is honest,
   and no other legal date exists (earlier is a lie, later is in the future).
   The six chart pages are generated, so a change to `scripts/charts.mjs` that
   alters a page shows up as that page's file changing, and the same rule
   covers it with no second path.

   WHY THIS IS A SCRIPT AND NOT A `node --test` TEST. The same reason
   `check-about-date.mjs` is: the mistake only exists in the diff between two
   commits, and the `tests` job checks out at depth 1. The `history` job in
   `.github/workflows/test.yml` fetches full history. The pure decision below
   is unit-tested in `test/sitemap-lastmod.test.js` with no git.

   Run it as `node scripts/check-sitemap-lastmod.mjs <base-ref>`. Exits 0 when
   there is nothing to check -- a first push, a shallow clone, a missing base
   -- because a guard that fails on a ref it cannot read teaches people to
   ignore it. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SITEMAP = 'app/sitemap.xml';
const ORIGIN = 'https://benchcard.app';

/* { 'index.html': '2026-08-22', 'about.html': ... } -- the file under app/
   that backs each <loc>, keyed to its <lastmod>. */
export function parseSitemap(xml) {
  const out = {};
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g)) {
    const path = m[1].trim().slice(ORIGIN.length);
    out[path === '/' ? 'index.html' : `${path.slice(1)}.html`] = m[2].trim();
  }
  return out;
}

/* The whole decision, pure. `changed` is the repo paths in the diff; `oldDates`
   is null when the base could not be read; `newDates` is the working
   sitemap; `today` is the date the check runs (YYYY-MM-DD), or null when it is
   unknown, in which case only a changed date passes. A page that is new to
   the sitemap has no old date to repeat. */
export function problems(changed, oldDates, newDates, today = null) {
  if (!oldDates) return [];
  const files = Object.keys(newDates);
  if (!files.length) {
    return [`${SITEMAP} has no <url> entries this check can read, so it checked nothing.`];
  }
  return files
    .filter((f) => changed.includes(`app/${f}`) && oldDates[f] === newDates[f]
      && !(today && newDates[f] >= today))
    .map((f) => `app/${f} changed but its <lastmod> in ${SITEMAP} is still ${newDates[f]}.`);
}

function git(args, quiet) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });
}

function main() {
  const base = process.argv[2];
  if (!base || /^0+$/.test(base)) {
    console.log('sitemap-lastmod: no base ref to compare against, skipping.');
    return 0;
  }
  let oldDates;
  try {
    oldDates = parseSitemap(git(['show', `${base}:${SITEMAP}`], true));
  } catch {
    console.log(`sitemap-lastmod: cannot read ${SITEMAP} at ${base}, skipping.`);
    return 0;
  }
  const newDates = parseSitemap(readFileSync(new URL(`../${SITEMAP}`, import.meta.url), 'utf8'));
  const changed = git(['diff', '--name-only', base, 'HEAD']).split('\n').filter(Boolean);

  let today = null;
  try { today = git(['log', '-1', '--format=%cs', 'HEAD'], true).trim(); } catch {}

  const found = problems(changed, oldDates, newDates, today);
  if (!found.length) {
    console.log(`sitemap-lastmod: ok (${Object.keys(newDates).length} pages).`);
    return 0;
  }
  console.error(
    'sitemap-lastmod: a sitemap <lastmod> is not honest:\n'
    + found.map((p) => `  - ${p}`).join('\n')
    + `\n\nSet the page's <lastmod> in ${SITEMAP} to the date the page changed.`,
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
