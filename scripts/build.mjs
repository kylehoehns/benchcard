#!/usr/bin/env node
/* Strips CSS comments into `dist/` (AGENTS.md § Deploy). `wrangler.jsonc` runs
 * this as `build.command` (#339).
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
  const parts = [];
  let blankLine = true; // only spaces/tabs since the last newline (or the start)
  const push = text => {
    if (!text) return;
    parts.push(text);
    const nl = text.lastIndexOf('\n');
    const tail = nl < 0 ? text : text.slice(nl + 1);
    let blank = true;
    for (let t = 0; t < tail.length && blank; t++) blank = isBlank(tail[t]);
    blankLine = nl < 0 ? blankLine && blank : blank;
  };
  const lastChar = () => {
    const p = parts[parts.length - 1];
    return p === undefined ? undefined : p[p.length - 1];
  };
  const trimOut = () => {
    while (parts.length) {
      let p = parts[parts.length - 1];
      let e = p.length;
      while (e > 0 && isBlank(p[e - 1])) e--;
      if (e === p.length) return;
      if (e === 0) parts.pop();
      else { parts[parts.length - 1] = p.slice(0, e); return; }
    }
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
      push(src.slice(i, j + 1));
      i = j + 1;
    } else if ((ch === 'u' || ch === 'U') && (src[i + 1] === 'r' || src[i + 1] === 'R') && (src[i + 2] === 'l' || src[i + 2] === 'L') && src[i + 3] === '(' && /^url\([ \t\r\n]*[^ \t\r\n"')]/i.test(src.slice(i, i + 40))) {
      const close = src.indexOf(')', i);
      const j = close < 0 ? n : close + 1;
      push(src.slice(i, j));
      i = j;
    } else if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close < 0 ? n : close + 2;
      let k = end;
      while (k < n && isBlank(src[k])) k++;
      const lineEnds = k >= n || src[k] === '\n' || (src[k] === '\r' && src[k + 1] === '\n');
      const ownLine = blankLine && lineEnds;
      if (lineEnds) {
        // Last thing on its line: the spaces before it go. On its own line the
        // newline goes too; after code the newline stays.
        trimOut();
        i = !ownLine || k >= n ? k : src[k] === '\r' ? k + 2 : k + 1;
      } else if (blankLine) {
        // Before code on a line: keep the indentation, drop the gap after.
        i = k;
      } else if (isBlank(lastChar()) || k > end) {
        // Whitespace touches it: the gap collapses to one space.
        trimOut();
        push(' ');
        i = k;
      } else {
        // Touching code on both sides: /**/ only where joining would fuse names.
        if (isName(lastChar()) && isName(src[end])) push('/**/');
        i = end;
      }
    } else {
      push(ch);
      i++;
    }
  }
  return parts.join('');
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
