/* #480: which tests failed, read from node's spec reporter. A failing run ends
   with a `✖ failing tests:` block; each entry is `test at <file>:<l>:<c>`, then
   `✖ <name> (<duration>)`, then the error indented two spaces, then its stack.
   Anything that is not that (TAP, a crash, a passing run) gives []. */

const ERROR_LINES = 3;
const PRINT_CAP = 20;

export function failuresOf(stdout) {
  if (typeof stdout !== 'string') return [];
  const at = stdout.indexOf('✖ failing tests:');
  if (at < 0) return [];
  const out = [];
  let cur = null, inStack = false;
  for (const line of stdout.slice(at).split('\n').slice(1)) {
    const file = /^test at (.+)$/.exec(line);
    if (file) { cur = { name: null, file: file[1], error: [] }; inStack = false; continue; }
    if (!cur) continue;
    if (cur.name === null) {
      const name = /^✖ (.*) \([^()]*\)$/.exec(line);
      if (!name) continue;
      cur.name = name[1];
      out.push(cur);
      continue;
    }
    const text = line.trim();
    if (!text || inStack) continue;
    if (text.startsWith('at ')) { inStack = true; continue; }
    if (cur.error.length < ERROR_LINES) cur.error.push(text);
  }
  return out;
}

/* The lines printed under the row: name column is 8 wide (`  FAIL  `). */
export function failureLines(failures) {
  const list = failures ?? [];
  const lines = list.slice(0, PRINT_CAP).flatMap(f => [
    `        ✖ ${f.name}  ${f.file}`,
    ...f.error.map(e => `            ${e}`),
  ]);
  if (list.length > PRINT_CAP) lines.push(`        … and ${list.length - PRINT_CAP} more`);
  return lines;
}
