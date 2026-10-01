/* Line coverage for app/, from V8's own coverage objects. Pure. */
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The one URL-to-file function, for both halves: Chrome reports
   `http://host:port/engine.js?x`, node reports `file:///…/app/engine.js`.
   Returns the path under `appDir` ('sub/y.js'), or null for anything that is
   not a script of the app: inline and page URLs, tests, and vendor/. */
export function fileOf(url, appDir) {
  let path;
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') path = relative(appDir, fileURLToPath(u.href.split(/[?#]/)[0]));
    else if (u.protocol === 'http:' || u.protocol === 'https:') path = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    else return null;
  } catch { return null; }
  if (!path.endsWith('.js') || path.startsWith('..')) return null;
  path = path.split(sep).join('/');
  return path.startsWith('vendor/') ? null : path;
}

/* 1-based numbers of the lines that hold code: not blank, not only a comment. */
export function codeLines(source) {
  const out = [];
  let inBlock = false;
  source.split('\n').forEach((raw, i) => {
    let text = raw.trim();
    if (inBlock) {
      const end = text.indexOf('*/');
      if (end === -1) return;
      inBlock = false;
      text = text.slice(end + 2).trim();
    }
    while (text.startsWith('/*')) {
      const end = text.indexOf('*/', 2);
      if (end === -1) { inBlock = true; text = ''; break; }
      text = text.slice(end + 2).trim();
    }
    if (text && !text.startsWith('//')) out.push(i + 1);
  });
  return out;
}

/* Per-file work that does not depend on which take is being folded: the
   offset each line starts at, and which lines hold code. */
function prepare(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return { starts, code: codeLines(source) };
}

/* The characters `\s` matches, as code units. */
const isSpace = c => c <= 32 ? (c === 32 || (c >= 9 && c <= 13))
  : c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029
    || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;

/* One script's V8 ranges to line numbers. Ranges nest, so painting them outer
   first (start ascending, end descending) leaves each character with the count
   of the innermost range around it. A line is covered when any character on
   it that is not whitespace ran, uncovered when none did. */
export function toLines(source, functions, prepared = prepare(source)) {
  const ranges = functions.flatMap(f => f.ranges)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const counts = new Int32Array(source.length);
  for (const r of ranges) counts.fill(r.count, r.startOffset, Math.min(r.endOffset, source.length));
  const { starts, code } = prepared;
  const covered = new Set(), uncovered = new Set();
  for (const n of code) {
    const from = starts[n - 1], to = n < starts.length ? starts[n] : source.length;
    let ran = false;
    for (let i = from; i < to && !ran; i++) ran = counts[i] > 0 && !isSpace(source.charCodeAt(i));
    (ran ? covered : uncovered).add(n);
  }
  return { covered, uncovered };
}

/* Reports are V8 `{ url, functions }` entries, from either half and from any
   number of takes. `add` turns each into lines the moment it arrives and folds
   it into its file, dropping what is not a script of the app, so nothing but
   per-file line sets is held. A line covered in any report is covered.
   `read(file)` gives that file's source. */
export function folder({ appDir, read }) {
  const merged = new Map();
  const prepared = new Map();
  return {
    add(reports) {
      for (const { url, functions } of reports) {
        const file = fileOf(url, appDir);
        if (!file) continue;
        const source = read(file);
        if (source == null) continue;   // not a file app/ ships (served by name only)
        if (!prepared.has(file)) prepared.set(file, prepare(source));
        const { covered, uncovered } = toLines(source, functions, prepared.get(file));
        const into = merged.get(file) || { covered: new Set(), uncovered: new Set() };
        for (const n of covered) into.covered.add(n);
        for (const n of uncovered) into.uncovered.add(n);
        merged.set(file, into);
      }
    },
    result() {
      for (const m of merged.values()) for (const n of m.covered) m.uncovered.delete(n);
      return merged;
    },
  };
}

export function merge(reports, opts) {
  const f = folder(opts);
  f.add(reports);
  return f.result();
}

const pct = (covered, total) => (total ? 100 * covered / total : 0);

/* `sources` is every file the app ships ({ 'engine.js': text }). A file the
   merge never saw is listed at 0%, not left out: that is what an unread file
   is. Lowest first, so the table opens on where the gaps are. */
export function summarize(merged, sources) {
  const files = Object.entries(sources).map(([file, source]) => {
    const m = merged.get(file);
    const total = m ? m.covered.size + m.uncovered.size : codeLines(source).length;
    const covered = m ? m.covered.size : 0;
    return { file, covered, total, pct: pct(covered, total) };
  }).sort((a, b) => a.pct - b.pct || a.file.localeCompare(b.file));
  const covered = files.reduce((n, f) => n + f.covered, 0);
  const total = files.reduce((n, f) => n + f.total, 0);
  return { files, total: { covered, total, pct: pct(covered, total) } };
}

export const SLACK = 0.5;
export const ROW = 'app/ line coverage';
export const RECORDED = 'coverage re-recorded';

/* Same shape as the budget rows: a recorded baseline plus slack. The record is
   one number, `lines`, in scripts/coverage.json. */
export function judge(measured, recorded, slack = SLACK) {
  const name = ROW;
  if (recorded == null) {
    return { name, pass: false, detail: `${measured.toFixed(2)}% measured, nothing recorded: no scripts/coverage.json — record one with \`node scripts/smoke.mjs --update-coverage\`` };
  }
  const pass = measured >= recorded - slack;
  const detail = `${measured.toFixed(2)}% measured, ${recorded.toFixed(2)}% recorded, ${slack} slack`;
  return { name, pass, detail: pass ? detail : `${detail} — fell more than the slack; if the drop is intended, re-record with \`node scripts/smoke.mjs --update-coverage\`` };
}

/* The row `--update-coverage` prints. A run with a failed check is not
   recorded: the number from a run that did not finish is not a floor. */
export function record(measured, failed) {
  if (failed) return { name: RECORDED, pass: false, detail: `not recorded: ${failed} check(s) failed, and a number measured from a run that did not pass is not a floor` };
  return { name: RECORDED, pass: true, detail: `${measured.toFixed(2)}% of app/ lines → scripts/coverage.json` };
}

/* What the browser half has to say about its own takes, added to the row:
   a navigation nothing took coverage ahead of fails it (the counts from that
   page are gone), a take that never answered is counted and named. */
export function annotate(row, { dropped, unseen }) {
  let { pass, detail } = row;
  if (dropped.length) detail += ` — ${dropped.length} take(s) dropped: ${dropped.join('; ')}`;
  if (unseen.length) {
    pass = false;
    detail += ` — ${unseen.length} navigation(s) with no coverage taken first, so that page's counts were lost: ${unseen.join('; ')}`;
  }
  return { ...row, pass, detail };
}
