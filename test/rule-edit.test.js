import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #148's pure store-side helper, the seam docs/specs/148-edit-rule.md's Proof
 * section names: "Helper, per kind, half-done, duplicate (1 to 5 store
 * side) | node --test, new file in test/". `replaceRule(c, item, draft)`
 * applies a draft in Add a rule's own shape to an existing rule in place,
 * reusing `ruleComplete` (never re-checking completeness a second way) and
 * `emptyConstraints()` for the constraint shape a test does not care about --
 * the same fixtures test/plan-sheet.test.js already established for
 * `removeRule`/`ruleComplete` on hand-built `c` objects, no rendered DOM. */

import { S } from './state-fixture.js';

/* ---------------- minimum / cap: re-key on store side ---------------- */

test('replaceRule: cap moves minutes to a new player and drops the old key', () => {
  const c = { ...S.emptyConstraints(), maxMinutes: { p3: 20 } };
  const item = { kind: 'cap', id: 'p3' };
  const result = S.replaceRule(c, item, { id: 'p4', minutes: 20 });
  assert.equal('p3' in c.maxMinutes, false);
  assert.deepEqual(c.maxMinutes, { p4: 20 });
  assert.deepEqual(result, { kind: 'cap', id: 'p4' });
});

/* ---------------- half-done: decision 3, a no-op ---------------- */

test('replaceRule: a half-done draft is a no-op and returns false', () => {
  const c = { ...S.emptyConstraints(), maxMinutes: { p3: 20 } };
  const item = { kind: 'cap', id: 'p3' };
  const result = S.replaceRule(c, item, {});
  assert.equal(result, false);
  assert.deepEqual(c.maxMinutes, { p3: 20 });
});

/* ---------------- pairs: replace at the item's own index ---------------- */

test('replaceRule: together replaces the pair at its own index, other pairs untouched', () => {
  const c = { ...S.emptyConstraints(), pairs: [['p1', 'p2'], ['p5', 'p6']] };
  const item = { kind: 'together', pair: ['p1', 'p2'] };
  const result = S.replaceRule(c, item, { a: 'p1', b: 'p4' });
  assert.deepEqual(c.pairs, [['p1', 'p4'], ['p5', 'p6']]);
  assert.deepEqual(result, { kind: 'together', pair: ['p1', 'p4'] });
});

test('replaceRule: a pair matching another entry in the same list is a no-op', () => {
  const c = { ...S.emptyConstraints(), pairs: [['p1', 'p2'], ['p5', 'p6']] };
  const item = { kind: 'together', pair: ['p1', 'p2'] };
  const result = S.replaceRule(c, item, { a: 'p5', b: 'p6' });
  assert.equal(result, false);
  assert.deepEqual(c.pairs, [['p1', 'p2'], ['p5', 'p6']]);
});

/* ---------------- fives ---------------- */

test('replaceRule: starts replaces the whole list', () => {
  const c = { ...S.emptyConstraints(), openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'] };
  const item = { kind: 'starts' };
  const result = S.replaceRule(c, item, { ids: ['p0', 'p1', 'p2', 'p3'] });
  assert.deepEqual(c.openingFive, ['p0', 'p1', 'p2', 'p3']);
  assert.deepEqual(result, { kind: 'starts' });
});

/* ---------------- rest ---------------- */

test('replaceRule: rest sets maxConsecutive', () => {
  const c = { ...S.emptyConstraints(), maxConsecutive: 2 };
  const item = { kind: 'rest' };
  const result = S.replaceRule(c, item, { n: 3 });
  assert.equal(c.maxConsecutive, 3);
  assert.deepEqual(result, { kind: 'rest' });
});

/* ---------------- toast sentences: decision 6 ---------------- */

test('changedRuleToast: "Changed: " plus the rule\'s own ruleItems text', () => {
  assert.equal(S.changedRuleToast({ text: 'Eli plays at most 24 min' }), 'Changed: Eli plays at most 24 min');
});

test('removedRuleToast: "Removed: " plus the rule\'s own ruleItems text', () => {
  assert.equal(S.removedRuleToast({ text: 'Eli plays at most 20 min' }), 'Removed: Eli plays at most 20 min');
});
