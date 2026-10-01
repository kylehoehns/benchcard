/* #259. The converter from V8 coverage objects to line coverage, at its own
   seam: hand-built objects in, line numbers and a verdict out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLines, merge, fileOf, summarize, judge } from '../scripts/coverage.mjs';

/* A V8 function entry: `ranges` are [start, end, count] character offsets, the
   first one the whole function, the rest nested blocks. */
const fn = (...ranges) => ({
  functionName: '', isBlockCoverage: true,
  ranges: ranges.map(([startOffset, endOffset, count]) => ({ startOffset, endOffset, count })),
});

const SRC = [
  'function f(x) {',      // 1
  '  if (x) {',           // 2
  '    return 1;',        // 3
  '  }',                  // 4
  '  return 2;',          // 5
  '}',                    // 6
].join('\n');
const at = (src, text) => src.indexOf(text);

test('a count-0 block inside a called function marks just its own lines uncovered', () => {
  const blockStart = at(SRC, '{\n    return 1');
  const blockEnd = at(SRC, '  return 2');
  const { covered, uncovered } = toLines(SRC, [
    fn([0, SRC.length, 1], [blockStart, blockEnd, 0]),
  ]);
  assert.deepEqual([...covered].sort((a, b) => a - b), [1, 2, 5, 6]);
  assert.deepEqual([...uncovered].sort((a, b) => a - b), [3, 4]);
});

test('blank lines and comment-only lines are not counted', () => {
  const src = [
    '// header',                 // 1
    '/* block',                  // 2
    '   still a comment */',     // 3
    '',                          // 4
    'const a = 1; // trailing',  // 5
    '   ',                       // 6
    '/** doc */',                // 7
    'const b = 2;',              // 8
  ].join('\n');
  const { covered, uncovered } = toLines(src, [fn([0, src.length, 1])]);
  assert.deepEqual([...covered].sort((a, b) => a - b), [5, 8]);
  assert.deepEqual([...uncovered], []);
});

const APP = '/repo/app';
const sources = { 'x.js': 'const a = 1;\nconst b = 2;\n' };
const read = file => sources[file];
const script = (url, ...ranges) => ({ url, functions: [fn(...ranges)] });
const LEN = sources['x.js'].length;
const FIRST = [0, 12, 1], SECOND = [13, LEN, 1];   // the two lines' character spans

test('two reports for one file merge: a line covered in either is covered', () => {
  const merged = merge([
    script('http://127.0.0.1:5000/x.js', [0, LEN, 0], FIRST),
    script('file:///repo/app/x.js', [0, LEN, 0], SECOND),
  ], { appDir: APP, read });
  const x = merged.get('x.js');
  assert.deepEqual([...x.covered].sort(), [1, 2]);
  assert.deepEqual([...x.uncovered].sort(), []);
});

test('a query string is stripped before merging', () => {
  const merged = merge([
    script('http://127.0.0.1:5000/x.js?retry=2', [0, LEN, 0], FIRST),
    script('http://127.0.0.1:5000/x.js', [0, LEN, 0], SECOND),
  ], { appDir: APP, read });
  assert.deepEqual([...merged.keys()], ['x.js']);
  assert.deepEqual([...merged.get('x.js').covered].sort(), [1, 2]);
});

test('only app/ scripts count: vendor, tests, inline and page URLs are dropped', () => {
  for (const url of [
    'http://127.0.0.1:5000/vendor/chart.js', 'file:///repo/app/vendor/chart.js',
    'file:///repo/test/x.test.js', 'file:///repo/scripts/smoke.mjs',
    '', 'http://127.0.0.1:5000/', 'http://127.0.0.1:5000/index.html',
  ]) assert.equal(fileOf(url, APP), null, url);
  assert.equal(fileOf('http://127.0.0.1:5000/sub/y.js?v=3#h', APP), 'sub/y.js');
  assert.equal(fileOf('file:///repo/app/sub/y.js', APP), 'sub/y.js');
});

test('summarize: a file nothing ran is listed at 0%, and the table is lowest first', () => {
  const merged = new Map([
    ['x.js', { covered: new Set([1]), uncovered: new Set([2]) }],
    ['ok.js', { covered: new Set([1, 2, 3, 4]), uncovered: new Set() }],
  ]);
  const { files, total } = summarize(merged, {
    'x.js': 'a;\nb;\n',
    'ok.js': 'a;\nb;\nc;\nd;\n',
    'never.js': '// nothing ran\n\na;\nb;\nc;\n',
  });
  assert.deepEqual(files.map(f => [f.file, f.covered, f.total, f.pct]), [
    ['never.js', 0, 3, 0],
    ['x.js', 1, 2, 50],
    ['ok.js', 4, 4, 100],
  ]);
  assert.deepEqual(total, { covered: 5, total: 9, pct: 100 * 5 / 9 });
});

test('judge: within the slack passes and shows measured, recorded and slack', () => {
  const row = judge(81.6, 82);
  assert.equal(row.pass, true);
  for (const part of ['81.60%', '82.00%', '0.5']) assert.ok(row.detail.includes(part), `${part} in "${row.detail}"`);
});

test('judge: more than the slack below the record fails and names --update-coverage', () => {
  const row = judge(81.4, 82);
  assert.equal(row.pass, false);
  assert.ok(row.detail.includes('--update-coverage'), row.detail);
  assert.ok(row.detail.includes('81.40%') && row.detail.includes('82.00%'), row.detail);
});

test('judge: exactly the slack below passes; above the record passes', () => {
  assert.equal(judge(81.5, 82).pass, true);
  assert.equal(judge(90, 82).pass, true);
});

test('judge: with no record it fails and says how to record one', () => {
  const row = judge(81.4, null);
  assert.equal(row.pass, false);
  assert.ok(row.detail.includes('scripts/coverage.json') && row.detail.includes('--update-coverage'), row.detail);
});

test('a script whose file app/ does not have is ignored, not an error', () => {
  const merged = merge([
    script('http://127.0.0.1:5000/gone.js', [0, LEN, 1]),
    script('http://127.0.0.1:5000/x.js', [0, LEN, 1]),
  ], { appDir: APP, read });
  assert.deepEqual([...merged.keys()], ['x.js']);
});
