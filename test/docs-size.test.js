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
 *
 * #600's second test: `docs/design-decisions.md` lists every side file
 * `docs/design-decisions-*.md` under `## Side files`, so a reader finds the
 * topic file instead of growing the big one. The side files are READ from
 * docs/, not listed here; the parsing is `checkSideFileIndex`, tested on
 * in-memory strings first, then run on the real tree.
 *
 * STATES THIS WAS RUN AGAINST (second test, induced by hand and reverted):
 *   - before the index existed -> failed on "has no `## Side files` heading";
 *   - one index line deleted from the real file -> failed on "add a line for
 *     docs/design-decisions-<name>.md under ## Side files ...";
 *   - the pure function on four in-memory states (a file left out, a line
 *     naming a missing file, no heading, a new unlisted file) -> each named
 *     its fix. The finished tree passes.
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

const INDEX_FILE = 'docs/design-decisions.md';

// Pure: the index text and the side-file names (e.g. 'design-decisions-x.md')
// in, what is missing / extra and whether the heading was found out.
export function checkSideFileIndex(text, sideFiles) {
  const m = text.match(/^## Side files[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return { headingFound: false, listed: [], missing: [...sideFiles], extra: [] };
  const listed = [...m[1].matchAll(/^- \[([^\]]+)\]\(([^)]+)\)/gm)].map((x) => x[2]);
  return {
    headingFound: true,
    listed,
    missing: sideFiles.filter((f) => !listed.includes(f)),
    extra: listed.filter((f) => !sideFiles.includes(f)),
  };
}

function problems(r) {
  const out = [];
  if (!r.headingFound) out.push(`${INDEX_FILE} has no \`## Side files\` heading: add one after the intro, with a line per side file`);
  for (const f of r.missing) out.push(`add a line for docs/${f} under ## Side files in ${INDEX_FILE}`);
  for (const f of r.extra) out.push(`remove or fix the line for docs/${f} under ## Side files in ${INDEX_FILE}: that file does not exist`);
  return out;
}

const idx = (lines) => `# Design decisions\n\nIntro for Avery.\n\n## Side files\n\nThe topics.\n\n${lines.join('\n')}\n\n## When rules disagree\n`;
const line = (n) => `- [${n}](${n}): Blake's topic`;

test('checkSideFileIndex names what is wrong', () => {
  const a = 'design-decisions-avery.md', b = 'design-decisions-casey.md';
  const ok = checkSideFileIndex(idx([line(a), line(b)]), [a, b]);
  assert.deepEqual(problems(ok), []);
  assert.equal(ok.listed.length, 2, 'parsed two lines (rule 2a)');
  assert.deepEqual(checkSideFileIndex(idx([line(a)]), [a, b]).missing, [b]);
  assert.deepEqual(checkSideFileIndex(idx([line(a), line('design-decisions-drew.md')]), [a]).extra, ['design-decisions-drew.md']);
  const none = checkSideFileIndex('# Design decisions\n\n## When rules disagree\n', [a]);
  assert.equal(none.headingFound, false);
  assert.match(problems(none)[0], /no `## Side files` heading/);
  const added = checkSideFileIndex(idx([line(a)]), [a, 'design-decisions-emery.md']);
  assert.match(problems(added)[0], /add a line for docs\/design-decisions-emery\.md under ## Side files in docs\/design-decisions\.md/);
});

test('docs/design-decisions.md lists every design-decisions-*.md side file', () => {
  const sideFiles = readdirSync(DOCS_DIR)
    .filter((n) => /^design-decisions-.+\.md$/.test(n)).sort();
  assert.ok(sideFiles.length > 0, 'found 0 side files under docs/: the scan or the names moved');
  const r = checkSideFileIndex(readFileSync(join(DOCS_DIR, 'design-decisions.md'), 'utf8'), sideFiles);
  assert.deepEqual(problems(r), []);
});
