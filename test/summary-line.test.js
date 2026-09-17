import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-stub.js';
const { summaryLine } = await import('../app/state.js');

/* Decision 6: `{lo}–{hi} min each · {n} changes` (en dash), `{hi} min each`
   when every player has the same minutes, `1 change` singular, minutes
   through `fmtMinutes` (so 23.333... reads as 23.3, not raw). `n` is the
   subs count the caller already computed from `effectiveStints`. */

test('summaryLine: a range of minutes reads {lo}–{hi} min each', () => {
  const line = summaryLine({ a: 16, b: 20, c: 18 }, 21);
  assert.equal(line, '16–20 min each · 21 changes');
});

test('summaryLine: equal minutes reads one number, not a range', () => {
  const line = summaryLine({ a: 24, b: 24, c: 24 }, 6);
  assert.equal(line, '24 min each · 6 changes');
});

test('summaryLine: one change is singular', () => {
  const line = summaryLine({ a: 24, b: 24 }, 1);
  assert.equal(line, '24 min each · 1 change');
});

test('summaryLine: fractional minutes format through fmtMinutes', () => {
  const line = summaryLine({ a: 23 + 1 / 3, b: 10 }, 2);
  assert.equal(line, '10–23.3 min each · 2 changes');
});

test('summaryLine: zero changes is plural (no changes made yet)', () => {
  const line = summaryLine({ a: 24, b: 24 }, 0);
  assert.equal(line, '24 min each · 0 changes');
});
