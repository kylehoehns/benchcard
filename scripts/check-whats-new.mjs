/* Fail when a PR changes something a coach can see and does not say so in
   What's new (#499).

   The What's new page is only worth reading if it keeps up, and nothing
   keeps a list up unless something fails when it falls behind. The rule is
   one line: a changed path under `app/` that a coach can see (everything but
   the plumbing in PLUMBING below) needs ONE of

     - a new entry in `scripts/whats-new.json`, compared by text against the
       base's copy (a base without the file counts as empty), then
       `npm run whats-new` to regenerate the page; or
     - the opt-out: a line starting `No coach note:` followed by a reason, in
       the PR body (env `PR_BODY`, set by CI) or in any commit message in
       `<base>..HEAD`, so a local run before the PR exists can pass too. A
       bare `No coach note:` is not a reason and does not count.

   `.claude/skills/ship-feature/SKILL.md` says when a coach would notice; this
   file only checks that one of the two answers is on the branch.

   The file list is `git diff --name-only --no-renames <base>...HEAD`: three
   dots, so a stale local branch is not charged for files main gained since it
   forked; and no rename detection, so a file moved out of `app/` still shows
   up as a deletion under `app/` instead of hiding as a rename.

   WHY THIS IS A SCRIPT AND NOT A `node --test` TEST. The same reason
   `check-sitemap-lastmod.mjs` is: the mistake only exists in the diff between
   two commits, and the `tests` job checks out at depth 1. The `history` job in
   `.github/workflows/test.yml` fetches full history and runs this on pull
   requests only: a squash-merge to main has no PR body to read. The pure
   decision is unit-tested in `test/whats-new-guard.test.js` with no git.

   Run it as `node scripts/check-whats-new.mjs <base-ref>`. Exits 0 when there
   is nothing to check -- no base, or a base that cannot be read -- because a
   guard that fails on a ref it cannot read teaches people to ignore it. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SOURCE = 'scripts/whats-new.json';

/* Under app/ but not something a coach sees. whats-new.html is generated from
   the source, so the entry is the change; vendor/ is third-party code that
   changes only through fetch.sh. */
const PLUMBING = [
  'app/sw.js', 'app/_headers', 'app/robots.txt', 'app/sitemap.xml',
  'app/whats-new.html', 'app/vendor/fetch.sh', 'app/vendor/README.md',
];

export const coachFacing = (path) => path.startsWith('app/') && !PLUMBING.includes(path);

/* A line that starts `No coach note:` and has a reason after it. */
export const hasOptOut = (text) => /^No coach note:[ \t]*\S/m.test(text || '');

/* The whole decision, pure. `changed` is the repo paths in the diff;
   `oldEntries` and `newEntries` are the base's and the head's whats-new.json
   (arrays of { date, text }); `messages` is every text that may carry the
   opt-out (the PR body, the commit messages). */
export function problems(changed, oldEntries, newEntries, messages) {
  const facing = changed.filter(coachFacing);
  if (!facing.length) return [];
  const known = new Set(oldEntries.map((e) => e.text));
  if (newEntries.some((e) => !known.has(e.text))) return [];
  if (messages.some(hasOptOut)) return [];
  return [
    `${facing.length} coach-facing file${facing.length === 1 ? '' : 's'} changed (${facing.slice(0, 3).join(', ')}`
    + `${facing.length > 3 ? ', ...' : ''}) with no new entry in ${SOURCE} and no opt-out.`
    + `\n  If a coach would notice: add one plain sentence to ${SOURCE}, newest first, and run \`npm run whats-new\`.`
    + '\n  If not: put a line in the PR body (or a commit message) that starts "No coach note: <reason>".',
  ];
}

function git(args, quiet) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });
}

const parse = (text) => { try { return JSON.parse(text); } catch { return []; } };

function main() {
  const base = process.argv[2];
  if (!base || /^0+$/.test(base)) {
    console.log('whats-new: no base ref to compare against, skipping.');
    return 0;
  }
  try { git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], true); } catch {
    console.log(`whats-new: cannot read ${base}, skipping.`);
    return 0;
  }
  let oldEntries = [];
  try { oldEntries = parse(git(['show', `${base}:${SOURCE}`], true)); } catch { /* no file at the base: empty */ }
  const newEntries = parse(readFileSync(new URL(`../${SOURCE}`, import.meta.url), 'utf8'));
  const changed = git(['diff', '--name-only', '--no-renames', `${base}...HEAD`]).split('\n').filter(Boolean);
  const messages = [process.env.PR_BODY || '', git(['log', '--format=%B', `${base}..HEAD`])];

  const found = problems(changed, oldEntries, newEntries, messages);
  if (!found.length) {
    console.log(`whats-new: ok (${changed.filter(coachFacing).length} coach-facing files changed).`);
    return 0;
  }
  console.error(`whats-new: a coach-facing change has no What's new entry:\n  - ${found.join('\n')}`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
