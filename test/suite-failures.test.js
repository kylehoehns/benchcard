import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failuresOf, failureLines } from '../scripts/smoke/suite-failures.mjs';

const PASSING = `✔ ok one (0.388ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ duration_ms 56.67
`;

const FAILING = `✔ ok one (0.388ms)
ℹ tests 4
ℹ pass 1
ℹ fail 2

✖ failing tests:

test at test/a.test.js:3:1
✖ breaks on purpose (0.497791ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  2 !== 3
  
      at TestContext.<anonymous> (file:///…/test/a.test.js:3:42)
      at Test.runInAsyncScope (node:async_hooks:227:14)

test at test/a.test.js:4:36
✖ inner fails (0.070042ms)
  Error: boom
  second line
      at TestContext.<anonymous> (file:///…/test/a.test.js:4:70)
`;

test('passing spec output has no failures', () => {
  assert.deepEqual(failuresOf(PASSING), []);
});

test('failing spec output gives name, file and the error up to the stack', () => {
  assert.deepEqual(failuresOf(FAILING), [
    { name: 'breaks on purpose', file: 'test/a.test.js:3:1',
      error: ['AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', '2 !== 3'] },
    { name: 'inner fails', file: 'test/a.test.js:4:36', error: ['Error: boom', 'second line'] },
  ]);
});

test('the error is cut at three lines', () => {
  const out = `✖ failing tests:\n\ntest at t.js:1:1\n✖ long (1ms)\n  a\n  b\n  c\n  d\n`;
  assert.deepEqual(failuresOf(out)[0].error, ['a', 'b', 'c']);
});

test('output that is not spec output gives [], never a throw', () => {
  for (const s of ['', undefined, null, 'TAP version 13\nnot ok 1 - x\n# fail 1\n', 'Error: crash\n    at x']) {
    assert.deepEqual(failuresOf(s), []);
  }
});

test('lines print under the row, aligned to the name column', () => {
  const [one] = failuresOf(FAILING);
  assert.deepEqual(failureLines([one]), [
    '        ✖ breaks on purpose  test/a.test.js:3:1',
    '            AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:',
    '            2 !== 3',
  ]);
});

test('no failures print no lines', () => {
  assert.deepEqual(failureLines([]), []);
  assert.deepEqual(failureLines(undefined), []);
});

test('the log prints the first 20 failures then how many more', () => {
  const many = Array.from({ length: 23 }, (_, i) => ({ name: `t${i}`, file: 'f:1:1', error: [] }));
  const lines = failureLines(many);
  assert.equal(lines.length, 21);
  assert.equal(lines[19], '        ✖ t19  f:1:1');
  assert.equal(lines[20], '        … and 3 more');
});

test('an error line that starts "at " but is not a stack frame stays in the error', () => {
  const out = `✖ failing tests:\n\ntest at t.js:1:1\n✖ rows (1ms)\n  AssertionError: x\n  at least 2 rows expected\n      at TestContext.<anonymous> (file:///a.js:1:1)\n`;
  assert.deepEqual(failuresOf(out)[0].error, ['AssertionError: x', 'at least 2 rows expected']);
});

test('real stack frames end the error, including async and bare-location frames', () => {
  for (const frame of [
    'at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {',
    'at Test.run (node:internal/test_runner/test:1306:25)',
    'at file:///a.js:1:1',
  ]) {
    const out = `✖ failing tests:\n\ntest at t.js:1:1\n✖ s (1ms)\n  Error: e\n      ${frame}\n  after\n`;
    assert.deepEqual(failuresOf(out)[0].error, ['Error: e'], frame);
  }
});

test('a test name with parentheses keeps them', () => {
  const out = `✖ failing tests:\n\ntest at t.js:1:1\n✖ sums (with carry) (1.2ms)\n  Error: e\n`;
  assert.equal(failuresOf(out)[0].name, 'sums (with carry)');
});

test('a failure with no error lines gives an empty error', () => {
  const out = `✖ failing tests:\n\ntest at t.js:1:1\n✖ bare (1.2ms)\n`;
  assert.deepEqual(failuresOf(out), [{ name: 'bare', file: 't.js:1:1', error: [] }]);
});
