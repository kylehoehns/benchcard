/* Fail when a precached file changed but sw.js VERSION did not.

   `sw.js` names its cache `benchcard-v${VERSION}-${SHELL}`. SHELL is the
   digest of the precached bytes, so the busting itself no longer depends on
   anyone remembering VERSION — a forgotten bump leaves a stale LABEL on a
   fresh cache, not a stale shell on a coach's phone. This job keeps the label
   honest: it is the one thing here that can see two commits, and a version
   number that stops tracking releases is a debugging aid nobody can trust.

   Run it as `node scripts/check-sw-version.mjs <base-ref>` (CI passes the push's
   before-sha or the PR base). Locally, `node scripts/check-sw-version.mjs origin/main`
   answers "have I forgotten the bump on this branch". Exits 0 when there is
   nothing to check — a first push, a shallow clone, a missing base — because a
   guard that fails on a ref it cannot read teaches people to ignore it. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/* Everything the service worker serves lives under app/, so PRECACHE entries
   are relative to that directory while `git diff --name-only` reports repo
   paths. This is the one place the two namespaces meet. */
const APP = 'app/';

export const parsePrecache = (src) =>
  [...(src.match(/const PRECACHE = \[[\s\S]*?\];/) || [''])[0].matchAll(/'(\.\/[^']*)'/g)]
    .map((m) => m[1].replace(/^\.\//, ''))
    .filter(Boolean);

export const parseVersion = (src) => (src.match(/const VERSION = '([^']*)'/) || [])[1] ?? null;

/* The whole decision, pure so it can be tested. Both sides' precache lists
   count: a file removed from PRECACHE in this very diff still needs the bump,
   or the old shell keeps serving it from the old cache. */
export function needsBump(changed, oldPrecache, newPrecache, oldVersion, newVersion) {
  if (oldVersion === null || newVersion === null) return [];
  if (oldVersion !== newVersion) return [];
  const watched = new Set([...oldPrecache, ...newPrecache]);
  // './' is the directory index, which is index.html; it is never a diff path
  watched.delete('');
  return changed.filter((f) => watched.has(f));
}

function git(args, quiet) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });
}

function main() {
  const base = process.argv[2];
  if (!base || /^0+$/.test(base)) {
    console.log('sw-version: no base ref to compare against, skipping.');
    return 0;
  }
  let oldSw;
  try {
    oldSw = git(['show', `${base}:${APP}sw.js`], true);
  } catch {
    console.log(`sw-version: cannot read ${APP}sw.js at ${base}, skipping.`);
    return 0;
  }
  const newSw = readFileSync(new URL(`../${APP}sw.js`, import.meta.url), 'utf8');
  const changed = git(['diff', '--name-only', base, 'HEAD'])
    .split('\n')
    .filter((f) => f.startsWith(APP))
    .map((f) => f.slice(APP.length));

  const stale = needsBump(
    changed,
    parsePrecache(oldSw), parsePrecache(newSw),
    parseVersion(oldSw), parseVersion(newSw),
  );

  if (!stale.length) {
    console.log(`sw-version: ok (VERSION '${parseVersion(newSw)}').`);
    return 0;
  }
  console.error(
    `sw-version: these precached files changed but sw.js VERSION is still '${parseVersion(newSw)}':\n` +
    stale.map((f) => `  - ${f}`).join('\n') +
    `\n\nThe SHELL digest in the cache name already busts the cache, so nobody is\n` +
    `served a stale shell — but the release label is now wrong, and benchcard-v${
      parseVersion(newSw)} no longer names this build.` +
    `\nBump VERSION in ${APP}sw.js.`,
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
