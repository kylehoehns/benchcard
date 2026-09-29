/* #181's own guard (Decisions, Q2): the split that made `docs/architecture.md`
 * a short index and moved its body into `docs/architecture/` is only worth
 * anything if nothing under `docs/` grows back past the size that makes
 * `guard-read.sh` force a partial read. The limit is READ from
 * `.claude/hooks/guard-read.sh`'s own `MAX_BYTES=` line, not restated as a
 * literal 60000 here -- one answer, not two -- so a future change to that
 * hook's limit changes this test's ceiling for free.
 *
 * Rule 2a: a walk that silently found zero `.md` files (a renamed directory,
 * a broken glob) fails loudly rather than passing vacuously.
 *
 * STATES THIS WAS RUN AGAINST (per /new-guard step 2, induced by hand and
 * reverted):
 *   - a file over the limit (temporarily padded `docs/architecture/interface.md`
 *     past 60,000 bytes with a comment) -> failed on "... is N bytes, over the
 *     60000-byte limit";
 *   - the scan finding nothing (pointed DOCS_DIR at a real, empty directory)
 *     -> failed on "found 0 .md files under docs/".
 *   The finished tree passes both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOCS_DIR = join(ROOT, 'docs');
const GUARD_READ = join(ROOT, '.claude', 'hooks', 'guard-read.sh');

const guardReadSrc = readFileSync(GUARD_READ, 'utf8');
const match = guardReadSrc.match(/^MAX_BYTES=(\d+)/m);
assert.ok(match, `could not find a MAX_BYTES= line in ${GUARD_READ} — the test has nothing to read the limit from`);
const MAX_BYTES = Number(match[1]);

function walkMd(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = walkMd(DOCS_DIR);
// Rule 2a: a scan that found nothing is a broken guard, not a clean result.
assert.ok(files.length > 0, `found 0 .md files under docs/ — the walk or the directory moved`);

test('no .md file under docs/ is over guard-read.sh\'s MAX_BYTES', () => {
  for (const f of files) {
    const bytes = statSync(f).size;
    assert.ok(bytes <= MAX_BYTES,
      `${relative(ROOT, f)} is ${bytes} bytes, over the ${MAX_BYTES}-byte limit read from ${relative(ROOT, GUARD_READ)}`);
  }
});
