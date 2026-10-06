#!/usr/bin/env node
/* The one build step (AGENTS.md § Deploy states the rule): copy `app/` to a
 * git-ignored `dist/` with the CSS comments stripped. `wrangler.jsonc` runs
 * this as `build.command` and deploys `dist/`, so the repo keeps every comment
 * and a coach's first load does not wait on them (#339).
 *
 * `scripts/serve.mjs` imports `stripCssComments` from here, so the local
 * server, smoke and the deploy all see the same bytes. No dependencies. */
import { cpSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const isName = ch => ch !== undefined && (/[A-Za-z0-9_-]/.test(ch) || ch > '\x7f');
const isBlank = ch => ch === ' ' || ch === '\t';

/* Remove `/* ... *\/` comments, and nothing but the whitespace around them.
   Quoted strings and unquoted url(...) are copied verbatim, so a `/*` inside
   either survives. Text with no comment comes back byte-identical. */
export function stripCssComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const lineIsBlank = () => /(^|\n)[ \t]*$/.test(out);
  const trimOut = () => { out = out.replace(/[ \t]*$/, ''); };
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if ((ch === 'u' || ch === 'U') && /^url\([ \t\r\n]*[^ \t\r\n"')]/i.test(src.slice(i, i + 40))) {
      const close = src.indexOf(')', i);
      const j = close < 0 ? n : close + 1;
      out += src.slice(i, j);
      i = j;
    } else if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close < 0 ? n : close + 2;
      let k = end;
      while (k < n && isBlank(src[k])) k++;
      const lineEnds = k >= n || src[k] === '\n' || (src[k] === '\r' && src[k + 1] === '\n');
      const ownLine = lineIsBlank() && lineEnds;
      if (lineEnds) {
        // Last thing on its line: the spaces before it go. On its own line the
        // newline goes too; after code the newline stays.
        trimOut();
        i = !ownLine || k >= n ? k : src[k] === '\r' ? k + 2 : k + 1;
      } else if (lineIsBlank()) {
        // Before code on a line: keep the indentation, drop the gap after.
        i = k;
      } else if (isBlank(out[out.length - 1]) || k > end) {
        // Whitespace touches it: the gap collapses to one space.
        trimOut();
        out += ' ';
        i = k;
      } else {
        // Touching code on both sides: /**/ only where joining would fuse names.
        if (isName(out[out.length - 1]) && isName(src[end])) out += '/**/';
        i = end;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/* Copy `appDir` to `outDir` (replacing whatever was there), stripping the
   comments from every .css file. `appDir` is only read. */
export function build(appDir, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(appDir, outDir, { recursive: true });
  for (const e of readdirSync(outDir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.css')) continue;
    const file = join(e.parentPath ?? e.path, e.name);
    writeFileSync(file, stripCssComments(readFileSync(file, 'utf8')));
  }
}

/* Run directly: build `app/` into `dist/` at the repo root. Imported: nothing. */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  build(join(root, 'app'), join(root, 'dist'));
  console.log('benchcard: built dist/ from app/ with CSS comments stripped');
}
