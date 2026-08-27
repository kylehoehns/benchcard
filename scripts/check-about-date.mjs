/* Fail when `app/about.html` changed but its "last updated" dateline did not.

   About is the page a coach reads to decide whether to trust a free tool with
   their season, so a visible date is a real signal — but it is hand-typed on a
   page that changes most weeks, and a hand-typed date on a page like that goes
   stale and quietly becomes a false claim. That is the exact defect class this
   project has spent the week deleting. The date is therefore only allowed to
   exist because this turns the promise to maintain it into a CI fact.

   WHY THIS IS A SCRIPT AND NOT A `node --test` TEST. The same reason
   `check-sw-version.mjs` is: the mistake only exists in the diff between two
   commits, and the `tests` job checks out at the default depth of 1, so
   `node --test` sees exactly one commit and cannot ask what a file used to
   say. The `about-date` job in `.github/workflows/test.yml` fetches full
   history for this, the way `sw-version` already does. The pure decision below
   is unit-tested in `test/about-date.test.js` with no git and no network.

   Run it as `node scripts/check-about-date.mjs <base-ref>` (CI passes the
   push's before-sha or the PR base). Locally,
   `node scripts/check-about-date.mjs origin/main` answers "have I forgotten
   the date on this branch". Exits 0 when there is nothing to check — a first
   push, a shallow clone, a missing base — because a guard that fails on a ref
   it cannot read teaches people to ignore it. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PAGE = 'app/about.html';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* The one line, in both of its forms. They are written out separately in the
   markup -- `datetime` for machines, the prose for the reader -- so they can
   disagree, which is its own small way for the page to start lying. */
export function parseDateline(html) {
  const m = html.match(/<time datetime="(\d{4})-(\d{2})-(\d{2})">([^<]*)<\/time>/);
  if (!m) return null;
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, human: m[4].trim() };
}

/* `24 August 2026` -- no leading zero, month spelled out, the form the footer
   uses. Kept here rather than in the markup's head so the two cannot drift. */
export const humanize = (iso) => {
  const [y, mo, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
};

/* The whole decision, pure so it can be tested without a repo.
   `changed` is the list of repo paths in the diff; `oldLine` is null on the
   commit that first adds the dateline, and on any base that predates it.

   THE STALENESS RULE IS ABOUT THE DAY, NOT ABOUT THE DIFF, and getting that
   wrong made this guard unsatisfiable for a whole day. The first version asked
   only "did the dateline change", which collides head-on with the two rules
   below it: edit About twice in one day and the second commit is required to
   move the line (it did not change) to a date that is neither earlier (it
   would go backwards) nor later (it would be ahead of the commit) than the one
   it already has. Zero legal values -- verified by enumerating them against
   base f88b3a4, not reasoned about. What the line actually promises a coach is
   "this is the day the page was last touched", so it is stale only when the
   page was touched on a LATER day than it names. A same-day edit is already
   honest and needs nothing. Keep the strict form when there is no head date to
   compare against: without one the future rule cannot fire either, so a bump
   is still legal and the guard stays satisfiable. */
export function problems(changed, oldLine, newLine, headDate) {
  const out = [];
  if (!newLine) {
    return [`${PAGE} has no parseable dateline: expected a`
      + ' <time datetime="YYYY-MM-DD">D Month YYYY</time> in the footer.'];
  }
  const expected = humanize(newLine.iso);
  if (newLine.human !== expected) {
    out.push(`the dateline's two halves disagree: datetime="${newLine.iso}"`
      + ` reads as "${expected}" but the page says "${newLine.human}".`);
  }
  if (oldLine) {
    const stale = !headDate || newLine.iso < headDate;
    if (changed.includes(PAGE) && oldLine.iso === newLine.iso && stale) {
      out.push(`${PAGE} changed but the dateline is still ${newLine.iso}`
        + `${headDate ? `, and this commit is dated ${headDate}` : ''}.`);
    }
    if (newLine.iso < oldLine.iso) {
      out.push(`the dateline went backwards: ${oldLine.iso} -> ${newLine.iso}.`);
    }
  }
  if (headDate && newLine.iso > headDate) {
    out.push(`the dateline ${newLine.iso} is later than this commit (${headDate}).`);
  }
  return out;
}

function git(args, quiet) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });
}

function main() {
  const base = process.argv[2];
  const newHtml = readFileSync(new URL(`../${PAGE}`, import.meta.url), 'utf8');
  const newLine = parseDateline(newHtml);

  if (!base || /^0+$/.test(base)) {
    console.log('about-date: no base ref to compare against, skipping.');
    return 0;
  }
  let oldLine = null;
  try {
    oldLine = parseDateline(git(['show', `${base}:${PAGE}`], true));
  } catch {
    console.log(`about-date: cannot read ${PAGE} at ${base}, skipping.`);
    return 0;
  }

  const changed = git(['diff', '--name-only', base, 'HEAD']).split('\n').filter(Boolean);
  let headDate = null;
  try { headDate = git(['log', '-1', '--format=%cs', 'HEAD'], true).trim(); } catch {}

  const found = problems(changed, oldLine, newLine, headDate);
  if (!found.length) {
    console.log(`about-date: ok (${newLine ? newLine.iso : 'no dateline'}).`);
    return 0;
  }
  console.error(
    'about-date: the "last updated" line in the About footer is not honest:\n'
    + found.map((p) => `  - ${p}`).join('\n')
    + `\n\nThat line is what tells a coach the page is maintained, and a stale`
    + ' date is worse than no date.\nUpdate BOTH halves of the <time> element'
    + ` in ${PAGE}'s footer.`,
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
