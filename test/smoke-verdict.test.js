/* #358: the recorder a smoke probe writes its checks into, and the one place
 * that turns what it recorded into a row's `{ pass, detail }`. The limit (5),
 * the separator (' | ') and the empty and throw rules live in
 * `scripts/smoke/verdict.mjs` only; these tests state them as literals. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder, verdict, rowResult, scoped, firstLine } from '../scripts/smoke/verdict.mjs';

test('all checks pass: the row passes with the probe\'s success detail', () => {
  const rec = recorder();
  rec.check(true, 'never shown');
  rec.check(1 === 1, 'never shown');
  rec.ok('3 tags, each fine');
  assert.deepEqual(verdict(rec), { pass: true, detail: '3 tags, each fine' });
});

test('one failed check: the row fails and the detail is that message', () => {
  const rec = recorder();
  rec.check(true, 'fine');
  rec.check(false, 'tag 1 has no background');
  rec.ok('success detail');
  assert.deepEqual(verdict(rec), { pass: false, detail: 'tag 1 has no background' });
});

test('seven failures: the first five joined with " | ", then " | …"', () => {
  const rec = recorder();
  for (let i = 1; i <= 7; i++) rec.fail(`m${i}`);
  assert.deepEqual(verdict(rec), { pass: false, detail: 'm1 | m2 | m3 | m4 | m5 | …' });
});

test('exactly five failures are not truncated', () => {
  const rec = recorder();
  for (let i = 1; i <= 5; i++) rec.fail(`m${i}`);
  assert.equal(verdict(rec).detail, 'm1 | m2 | m3 | m4 | m5');
});

test('a throw after two passing checks: fails, and names the throw', () => {
  const rec = recorder();
  rec.check(true, 'a');
  rec.check(true, 'b');
  const v = verdict(rec, new Error('no such node\n    at stack line'));
  assert.deepEqual(v, { pass: false, detail: 'threw: no such node' });
});

test('a throw after recorded failures keeps them and names the throw', () => {
  const rec = recorder();
  rec.check(false, 'first bad');
  rec.fail('second bad');
  const v = verdict(rec, new Error('boom\nmore'));
  assert.deepEqual(v, { pass: false, detail: 'first bad | second bad | threw: boom' });
});

test('nothing recorded: fails and says the probe checked nothing', () => {
  const v = verdict(recorder());
  assert.equal(v.pass, false);
  assert.match(v.detail, /checked nothing/);
});

test('ok() alone is not a check: a probe that only sets a detail fails', () => {
  const rec = recorder();
  rec.ok('all good');
  assert.equal(verdict(rec).pass, false);
  assert.match(verdict(rec).detail, /checked nothing/);
});

test('check returns its condition so a probe can branch on it', () => {
  const rec = recorder();
  assert.equal(rec.check(true, 'x'), true);
  assert.equal(rec.check(false, 'x'), false);
});

test('a passing probe with no ok() still gets a detail', () => {
  const rec = recorder();
  rec.check(true, 'a');
  rec.check(true, 'b');
  assert.deepEqual(verdict(rec), { pass: true, detail: '2 check(s) passed' });
});

/* `rowResult(result, rec)` is what `runCheck` calls on whatever a row returned. */
test('a returned { pass, detail } with nothing recorded stands as it is', () => {
  assert.deepEqual(rowResult({ pass: true, detail: 'own rule' }, recorder()), { pass: true, detail: 'own rule' });
  assert.deepEqual(rowResult({ pass: false, detail: 'own fail' }, recorder()), { pass: false, detail: 'own fail' });
});

test('nothing returned: the row is judged from the recorder', () => {
  const rec = recorder();
  rec.check(false, 'bad');
  assert.deepEqual(rowResult(undefined, rec), { pass: false, detail: 'bad' });
  const empty = recorder();
  assert.equal(rowResult(undefined, empty).pass, false);
});

test('both recorded and returned pass:true: a recorded failure still fails the row', () => {
  const rec = recorder();
  rec.check(false, 'recorded bad');
  assert.deepEqual(rowResult({ pass: true, detail: 'returned fine' }, rec), { pass: false, detail: 'recorded bad' });
});

test('both recorded and returned: returned pass:false fails the row with its detail', () => {
  const rec = recorder();
  rec.check(true, 'fine');
  assert.deepEqual(rowResult({ pass: false, detail: 'returned bad' }, rec), { pass: false, detail: 'returned bad' });
});

test('both recorded and returned, all good: the returned detail is shown', () => {
  const rec = recorder();
  rec.check(true, 'fine');
  assert.deepEqual(rowResult({ pass: true, detail: 'returned fine' }, rec), { pass: true, detail: 'returned fine' });
});

test('scoped prefixes failures, counts on the real recorder, and returns the condition', () => {
  const rec = recorder();
  const dark = scoped(rec, 'dark');
  assert.equal(dark.check(true, 'fine'), true);
  assert.equal(dark.check(false, 'bad'), false);
  dark.fail('worse');
  assert.deepEqual(rec.failures, ['dark: bad', 'dark: worse']);
  assert.equal(rec.checks, 3);
});

test('firstLine keeps one line of an error or a thrown string', () => {
  assert.equal(firstLine(new Error('a\nb')), 'a');
  assert.equal(firstLine('x\ny'), 'x');
});
