/* #628: the one place that says which test file is a Coach scenario. CI, the
   smoke harness and ci-local.sh all ask this module, so the split cannot
   drift between them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { unitFiles, scenarioFiles } from '../scripts/suite-files.mjs';

const every = readdirSync(new URL('../test/', import.meta.url))
  .filter(f => f.endsWith('.test.js')).map(f => `test/${f}`).sort();

test('scenarioFiles() is the 55 files named -scenarios.test.js', () => {
  const files = scenarioFiles();
  assert.equal(files.length, 55);
  assert.ok(files.every(f => /^test\/[^/]+-scenarios\.test\.js$/.test(f)), files.join('\n'));
  assert.deepEqual(files, [...files].sort());
});

test('the driver tests that import coach.js stay with the unit files', () => {
  const units = unitFiles();
  for (const f of ['coach-download', 'coach-last-toast', 'fade-watch']) {
    assert.ok(units.includes(`test/${f}.test.js`), `${f} should be a unit file`);
  }
});

test('unit and scenario files are disjoint and together are every test/*.test.js', () => {
  const units = unitFiles(), scenarios = scenarioFiles();
  assert.deepEqual(units, [...units].sort());
  assert.equal(units.filter(f => scenarios.includes(f)).length, 0);
  assert.deepEqual([...units, ...scenarios].sort(), every);
});
