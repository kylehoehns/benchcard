import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/* #95. A raw 0x00 byte makes `grep` treat a file as binary and silently find
   nothing in it -- `measureBarSideIfHeaderChanged` in app/render.js carried
   two of them as cache-key separators, typed raw instead of as the `\0`
   escape, and every grep for the function's own name came back empty.

   `git ls-files app` is the same mechanism test/spelling.test.js's
   `trackedFiles()` (scripts/spelling.mjs) already uses for a whole-tree scan,
   scoped to app/ so it recurses into app/vendor/ on its own -- no second file
   walker with different rules about what counts. Unlike that helper, this
   list is NOT filtered by "does it already contain a NUL byte": that filter
   would hide the exact bug this test exists to catch. */
const ROOT = new URL('../', import.meta.url);

function trackedAppFiles() {
  const out = execFileSync('git', ['ls-files', 'app'], { encoding: 'utf8' });
  const all = out.split('\n').filter(Boolean);
  if (!all.length) throw new Error('no-nul-bytes: `git ls-files app` returned nothing');
  return all;
}

/* Images and fonts: the binary extensions actually present under app/
   today (`git ls-files app/ | sed 's/.*\\.//' | sort -u`) that are not
   text, the two categories the spec names besides icons. .svg is NOT
   here -- an SVG icon is text XML, not binary, so it belongs in the scan
   like any other text file. This list is not the same as .claude/hooks/
   guard-read.sh's: that one also skips .pdf and .ipynb, neither of which
   appears under app/, and has no reason to track this list's contents.
   Everything else tracked under app/ -- .js, .html, .css, .svg, .xml,
   .webmanifest, .txt, .sh, .mjs, .md and files without an extension like
   app/_headers -- is text and gets scanned. */
const BINARY_EXTENSIONS = ['.png', '.ico', '.woff2', '.woff', '.jpg', '.jpeg', '.gif', '.webp'];
const isText = (f) => !BINARY_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext));

test('trackedAppFiles reads the real app/ tree, not nothing', () => {
  const files = trackedAppFiles();
  assert.ok(files.length > 10, 'a scan that reads no files finds no bugs');
  for (const f of ['app/render.js', 'app/sw.js', 'app/vendor/icons/x.svg']) {
    assert.ok(files.includes(f), `trackedAppFiles() must include ${f}`);
  }
  assert.ok(isText('app/vendor/icons/x.svg'),
    'app/vendor/icons/x.svg is text XML, not a binary icon format -- isText must keep it');
});

test('no tracked text file under app/ contains a 0x00 byte', () => {
  const offenders = [];
  for (const file of trackedAppFiles().filter(isText)) {
    const bytes = readFileSync(new URL(file, ROOT));
    const at = bytes.indexOf(0);
    if (at !== -1) offenders.push(`${file}: 0x00 at byte offset ${at}`);
  }
  assert.deepEqual(offenders, [],
    `NUL byte(s) found -- these files will silently miss every grep:\n${offenders.join('\n')}`);
});
