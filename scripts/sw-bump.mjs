/* `npm run sw:bump` -- the one command a rebase needs after the merge
   driver clears the VERSION/SHELL conflict on app/sw.js (#176). It sets
   VERSION to one past `main`'s (default `origin/main`, or an explicit ref
   given as the first argument) and SHELL to the digest of whatever is on
   disk right now, computed the same way `test/sw.test.js` checks it -- from
   `scripts/sw-shell.mjs`, not re-derived here.

   It never runs `npm test` to learn the digest: that is the whole point,
   since the ticket this exists for is "prove it in seconds, not the full
   suite". */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { parseVersion } from './check-sw-version.mjs';
import { shellDigest, setConstants, parseShell, isValidVersion } from './sw-shell.mjs';

const APP_SW = 'app/sw.js';

function main() {
  const ref = process.argv[2] || 'origin/main';
  const swPath = join(process.cwd(), APP_SW);

  let current;
  try {
    current = readFileSync(swPath, 'utf8');
  } catch {
    console.error(`sw-bump: cannot read ${APP_SW} in ${process.cwd()}`);
    return 1;
  }

  let baseSw;
  try {
    baseSw = execFileSync('git', ['show', `${ref}:${APP_SW}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    console.error(`sw-bump: cannot read ${APP_SW} at ${ref}`);
    return 1;
  }

  const baseVersion = parseVersion(baseSw);
  if (baseVersion === null) {
    console.error(`sw-bump: ${APP_SW} at ${ref} has no VERSION constant`);
    return 1;
  }
  if (!isValidVersion(baseVersion)) {
    console.error(`sw-bump: ${APP_SW} at ${ref} has a non-numeric VERSION: '${baseVersion}'`);
    return 1;
  }

  const oldVersion = parseVersion(current);
  const oldShell = parseShell(current);

  const newVersion = String(Number(baseVersion) + 1);
  const appDirUrl = pathToFileURL(join(process.cwd(), 'app') + '/');
  const { digest: newShell } = shellDigest(appDirUrl, current);

  writeFileSync(swPath, setConstants(current, { version: newVersion, shell: newShell }));

  console.log(`VERSION: '${oldVersion}' -> '${newVersion}' (base ${ref} is '${baseVersion}')`);
  console.log(`SHELL:   '${oldShell}' -> '${newShell}'`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
