/* The digest of everything app/sw.js precaches, and the two-literal rewrite
   of VERSION and SHELL. One definition, shared by test/sw.test.js (which
   proves the pinned SHELL matches this tree) and scripts/sw-bump.mjs (which
   computes the next one) -- see #176.

   The algorithm here is byte-for-byte what used to live inline in
   test/sw.test.js: paths keep their './' prefix, './' itself and './sw.js'
   are skipped, the list is sorted, and each entry contributes
   `path \0 bytes \0` to the hash. Changing any of that changes every pinned
   SHELL in the repo, so don't. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/* Scoped to the PRECACHE array literal rather than the whole file, the same
   way test/sw.test.js's own top-level parse is -- sw.js also names a
   runtime-cached path (LAZY) outside that array. */
export function parsePrecache(swSource) {
  return [...swSource.slice(swSource.indexOf('const PRECACHE = ['), swSource.indexOf('\n];'))
    .matchAll(/'(\.\/[^']*)'/g)]
    .map((m) => m[1])
    .filter((p) => p !== './sw.js');
}

export function parseShell(swSource) {
  return swSource.match(/const SHELL = '([^']*)'/)?.[1] ?? null;
}

/* A VERSION worth writing: a non-negative integer, as a string. Guards
   sw-bump.mjs and sw-merge.mjs against `Number(parseVersion(...))` turning a
   missing or non-numeric VERSION on either side into 'NaN' on disk (#176). */
export function isValidVersion(v) {
  return typeof v === 'string' && /^\d+$/.test(v);
}

export function shellDigest(appDirUrl, swSource) {
  const files = parsePrecache(swSource).filter((p) => p !== './').sort();
  const h = createHash('sha256');
  for (const p of files) {
    h.update(p);
    h.update('\0');
    h.update(readFileSync(new URL(p, appDirUrl)));
    h.update('\0');
  }
  return { digest: h.digest('hex').slice(0, 12), count: files.length };
}

/* Rewrites only the two string literals -- everything else in swSource
   passes through untouched. Throws if either constant is missing, so a
   caller never silently writes a file with a stale one still in it. */
export function setConstants(swSource, { version, shell }) {
  if (!/const VERSION = '[^']*'/.test(swSource)) {
    throw new Error('setConstants: no VERSION constant found');
  }
  if (!/const SHELL = '[^']*'/.test(swSource)) {
    throw new Error('setConstants: no SHELL constant found');
  }
  return swSource
    .replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`)
    .replace(/const SHELL = '[^']*'/, `const SHELL = '${shell}'`);
}
