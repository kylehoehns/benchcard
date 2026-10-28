/* #363: the tail every `widthSweep` caller shares -- one rec.fail per
 * undersized measurement, one per missing check, and a failure when nothing
 * was measured. Pure: it needs no browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder, verdict } from '../scripts/smoke/verdict.mjs';
import { recordSweep } from '../scripts/smoke/width-sweep.mjs';

const opts = { what: 'plan row', floor: 48 };

test('recordSweep: a clean sweep records one passing check', () => {
  const rec = recorder();
  recordSweep(rec, { bad: [], gone: [], audited: 3 }, opts);
  rec.ok('fine');
  assert.deepEqual(verdict(rec), { pass: true, detail: 'fine' });
});

test('recordSweep: an undersized entry reads "measurement under 48px: <entry>"', () => {
  const rec = recorder();
  recordSweep(rec, { bad: ['sheet@320px: 2 under'], gone: [], audited: 3 }, opts);
  assert.deepEqual(verdict(rec), { pass: false, detail: 'measurement under 48px: sheet@320px: 2 under' });
});

test('recordSweep: a missing-check entry is not labelled a measurement', () => {
  const rec = recorder();
  recordSweep(rec, { bad: [], gone: ['x@320px: the check is gone'], audited: 1 }, opts);
  assert.deepEqual(verdict(rec), { pass: false, detail: 'x@320px: the check is gone' });
});

test('recordSweep: nothing measured fails, naming what was not measured', () => {
  const rec = recorder();
  recordSweep(rec, { bad: [], gone: [], audited: 0 }, opts);
  assert.deepEqual(verdict(rec), { pass: false, detail: 'no plan row was measured' });
});
