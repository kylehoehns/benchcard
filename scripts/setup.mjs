/* `npm run setup` -- one-time per clone. Registers the merge driver that
   `.gitattributes` names for app/sw.js, so a rebase across two PRs that each
   bump VERSION/SHELL resolves itself instead of hand-editing a conflict
   (#176). Worktrees share the clone's config, so once per clone is enough.

   Local config only -- this repo's .git/config, nothing global, nothing
   outside it. Without it, git falls back to its normal text merge on
   app/sw.js, which is today's behavior, so skipping this step breaks
   nothing; it just leaves the old conflict in place. Safe to run again:
   both values are simply re-set. */

import { execFileSync } from 'node:child_process';

function main() {
  execFileSync('git', ['config', 'merge.sw-version.name', 'benchcard sw.js VERSION/SHELL bump merge driver']);
  execFileSync('git', ['config', 'merge.sw-version.driver', 'node scripts/sw-merge.mjs %O %A %B']);
  console.log('Registered the sw-version merge driver for this clone (see .gitattributes).');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
