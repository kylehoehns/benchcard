/* The git merge driver for app/sw.js -- registered by `npm run setup` as
   `merge.sw-version.driver` and named by `.gitattributes` (#176).

   Two open PRs that each bump VERSION and set a different SHELL used to
   conflict on those two lines on every rebase, even when nothing else in the
   file overlapped. This driver clears exactly that: it swaps both sides'
   VERSION and SHELL for a fixed placeholder before handing the file to
   `git merge-file`, so those two lines can never be the reason a merge
   fails, then puts back VERSION = one past the higher of the two real
   values and SHELL = %A's (`npm run sw:bump` fixes SHELL for real next --
   this driver only has to stop it being a conflict).

   Invoked by git as `node sw-merge.mjs %O %A %B` -- the base, "ours" and
   "theirs" copies, as plain temp file paths. Never runs npm test, never
   reads any other file in the tree. Exit 0 only when git merge-file itself
   was clean; the result (with git's own conflict markers, if any) is
   always written back to %A, because that is the path git resolves the
   merge from. */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVersion } from './check-sw-version.mjs';
import { setConstants, parseShell, isValidVersion } from './sw-shell.mjs';

const PLACEHOLDER = { version: '0', shell: 'placeholder' };

function main() {
  const [oPath, aPath, bPath] = process.argv.slice(2);
  const oSrc = readFileSync(oPath, 'utf8');
  const aSrc = readFileSync(aPath, 'utf8');
  const bSrc = readFileSync(bPath, 'utf8');

  const aVersionStr = parseVersion(aSrc);
  const bVersionStr = parseVersion(bSrc);
  const bad = [];
  if (!isValidVersion(aVersionStr)) bad.push(`upstream: '${aVersionStr}'`);
  if (!isValidVersion(bVersionStr)) bad.push(`yours: '${bVersionStr}'`);
  if (bad.length) {
    console.error(`sw-merge: VERSION is not a non-negative integer (${bad.join(', ')}); leaving %A unwritten`);
    return 1;
  }

  const aVersion = Number(aVersionStr);
  const bVersion = Number(bVersionStr);
  const aShell = parseShell(aSrc);

  const tmp = mkdtempSync(join(tmpdir(), 'sw-merge-'));
  const tmpO = join(tmp, 'O');
  const tmpA = join(tmp, 'A');
  const tmpB = join(tmp, 'B');
  writeFileSync(tmpO, setConstants(oSrc, PLACEHOLDER));
  writeFileSync(tmpA, setConstants(aSrc, PLACEHOLDER));
  writeFileSync(tmpB, setConstants(bSrc, PLACEHOLDER));

  let clean = true;
  try {
    execFileSync(
      'git',
      ['merge-file', '-L', 'upstream', '-L', 'base', '-L', 'yours', tmpA, tmpO, tmpB],
      { stdio: 'ignore' },
    );
  } catch {
    clean = false;
  }

  const merged = readFileSync(tmpA, 'utf8');
  rmSync(tmp, { recursive: true, force: true });

  const newVersion = String(Math.max(aVersion, bVersion) + 1);
  writeFileSync(aPath, setConstants(merged, { version: newVersion, shell: aShell }));

  return clean ? 0 : 1;
}

process.exit(main());
