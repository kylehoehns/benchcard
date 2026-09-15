/* Shared with settings.test.js and view-before-settings.test.js -- not a
   *.test.js file itself, so `node --test`'s default discovery leaves it
   alone (see test/js-strings.js's own note, proven the same way).

   Two small readers used by source-reading guards: `stripComments` drops
   `//` and `/* *\/` from a module so a guard never scores prose instead of
   code (a developer comment can carry the very word or call a check is
   looking for), and `functionBody` slices out one top-level function's own
   body, brace-matched rather than sliced to the next function's name, so a
   mutation that nests a second function INSIDE it is still read as part of
   the same body. Moved out of settings.test.js rather than copied, because a
   second hand-rolled version of either is the "one answer lives in one
   place" defect AGENTS.md's front matter names as the costliest one here. */
import assert from 'node:assert/strict';

// string- and template-literal-aware, so a `//` inside a quoted URL
// (toast.js's TIP_URL) is never mistaken for a line comment and does not eat
// the rest of the line, and a `// on('#helpTourSettings', ...)` really is
// gone rather than still matching the very call the comment turned off.
export function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); if (e < 0) { i = n; } else { out += '\n'; i = e + 1; } continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const seg = e < 0 ? src.slice(i) : src.slice(i, e + 2); out += seg.replace(/[^\n]/g, ' '); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j += 2; else j++; }
      j = Math.min(j + 1, n);
      out += src.slice(i, j); i = j; continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== '`') { if (src[j] === '\\') j += 2; else j++; }
      j = Math.min(j + 1, n);
      out += src.slice(i, j); i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

// The body of a top-level `function name(...) { ... }`, brace-matched rather
// than sliced to the next function's name -- so a mutation that nests a
// second function INSIDE it (U8b: the [data-tip-link] loop moved into a
// `wireTips()` that initToast never calls) is still read as part of the same
// body, and a check that wants the loop to run in the function's OWN scope
// can tell the two apart.
export function functionBody(src, name) {
  const sig = `function ${name}(`;
  const start = src.indexOf(sig);
  assert.ok(start > -1, `${name} not found; this guard is reading nothing`);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(braceStart + 1, i - 1);
}
