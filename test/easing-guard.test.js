import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* #151 item 5: this app has exactly one easing curve. It lives twice on
 * purpose -- once as the CSS custom property `--ease` in tokens.css, once as
 * the JS export `EASE` in fx.js, which `timeline.js` and `gamemode.js` import
 * rather than retyping. Every other place in app CSS or JS that used to spell
 * out a curve (`--spring`, `BLK_EASE`, `SNAP`, a hand-rolled ease-out, a bare
 * `ease-out` string) is gone. This guard is a source scan, not a behavior
 * test -- /new-guard applies -- and it exists so a future edit cannot bring
 * a second curve back in without this failing.
 *
 * `app/vendor/` is excluded: it is the vendored Motion library, hand-edits to
 * it are denied by guard-edit.sh, and its bundle is full of `spring` and
 * `ease-out` in its own right as a general-purpose animation library. This
 * guard is about the curves THIS app authors, not the ones its dependency
 * ships. Generated chart pages and the marketing pages (about.html,
 * advanced.html) are `.html`, not `.css`/`.js`, and are out of this guard's
 * scope for the same reason the spec names "app CSS or JS".
 */
const APP = fileURLToPath(new URL('../app/', import.meta.url));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(css|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/* Block comments are legitimate prose about the old --spring/SPRING (this
 * guard's own file, tokens.css and fx.js all narrate the removal), so they
 * are stripped before scanning. The line-comment strip skips a `//` that
 * follows a `:` so a `https://` URL in a JS comment or string is not cut. */
function stripComments(src, isCss) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  if (!isCss) s = s.replace(/(?<!:)\/\/.*$/gm, '');
  return s;
}

const ALLOW = {
  'tokens.css': /^\s*--ease:\s*cubic-bezier\([^)]*\);\s*$/m,
  'fx.js': /^export const EASE = '[^']*';\s*$/m,
};

function scan() {
  const files = walk(APP);
  const bad = [];
  for (const file of files) {
    const rel = path.relative(APP, file).replace(/\\/g, '/');
    const isCss = file.endsWith('.css');
    let src = readFileSync(file, 'utf8');
    const allow = ALLOW[rel];
    if (allow) src = src.replace(allow, '');
    const stripped = stripComments(src, isCss);
    if (stripped.includes('cubic-bezier(')) bad.push(`${rel}: a cubic-bezier( outside tokens.css's --ease and fx.js's EASE export`);
    if (/\bease-in-out\b|\bease-out\b|\bease-in\b/.test(stripped)) bad.push(`${rel}: a bare ease-out/ease-in/ease-in-out easing`);
    if (/\btype\s*:\s*['"]spring['"]|\bstiffness\s*:|\bdamping\s*:/.test(stripped)) bad.push(`${rel}: a spring config`);
  }
  return { files, bad };
}

test('app CSS and JS read the one easing curve from tokens.css\'s --ease and fx.js\'s EASE, nowhere else', () => {
  const { files, bad } = scan();
  // 2a: a scan that walked no files would pass on an empty tree
  assert.ok(files.length > 20, `expected to scan more than 20 app CSS/JS files, found ${files.length}`);
  assert.deepEqual(bad, [], `\n  ${bad.join('\n  ')}\n(fix: read the curve from tokens.css's --ease or fx.js's EASE export instead)`);
});
