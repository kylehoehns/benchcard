/* #628: the one place that says which test file is a Coach scenario. CI, the
   smoke harness and ci-local.sh all ask scripts/suite-files.mjs, so the split
   cannot drift between them.

   The completeness check does not recompute the module's own glob. It builds
   a fixture tree with a file of every shape and asks `node --test` itself
   (the oracle) which files it would run there. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { unitFiles, scenarioFiles } from '../scripts/suite-files.mjs';

const SHAPES = [
  'a.test.js', 'b.test.mjs', 'c.test.cjs', 'd-test.js', 'e_test.js', 'test-f.js', 'test.js',
  'x-scenarios.test.js', 'test/g.js', 'test/sub/h.mjs', 'test/sub/y-scenarios.test.js', 'sub2/i.test.js', 'sub2/test-k.mjs',
];
const IGNORED = ['z.js', 'sub2/j.js', 'notes.md', 'node_modules/x/l.test.js'];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'benchcard-suitefiles-'));
  for (const f of [...SHAPES, ...IGNORED]) {
    mkdirSync(join(root, dirname(f)), { recursive: true });
    writeFileSync(join(root, f), '');
  }
  return root;
}

test('unit and scenario files together are exactly what a bare `node --test` runs', () => {
  const root = fixture();
  try {
    const out = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } }).stdout;
    const ran = [...out.matchAll(/^# Subtest: (.+)$/gm)].map(m => m[1]).sort();
    assert.deepEqual(ran, [...SHAPES].sort(), 'the oracle itself changed: update SHAPES');
    assert.deepEqual([...unitFiles(root), ...scenarioFiles(root)].sort(), ran);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a scenario is a file named -scenarios.test.js at any depth; the rest are units', () => {
  const root = fixture();
  try {
    assert.deepEqual(scenarioFiles(root), ['test/sub/y-scenarios.test.js', 'x-scenarios.test.js']);
    assert.ok(!unitFiles(root).some(f => f.includes('-scenarios')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('both lists are sorted and disjoint', () => {
  const root = fixture();
  try {
    for (const r of [root, undefined]) {
      const units = unitFiles(r), scenarios = scenarioFiles(r);
      assert.deepEqual(units, [...units].sort());
      assert.deepEqual(scenarios, [...scenarios].sort());
      assert.equal(units.filter(f => scenarios.includes(f)).length, 0);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('in this repo the scenarios are plentiful and the Chrome-driver unit tests stay units', () => {
  assert.ok(scenarioFiles().length > 10, 'expected the repo to have many scenario files');
  assert.ok(scenarioFiles().every(f => /^test\/.*-scenarios\.test\.js$/.test(f)));
  const units = unitFiles();
  for (const f of ['coach-download', 'coach-last-toast', 'fade-watch']) {
    assert.ok(units.includes(`test/${f}.test.js`), `${f} should be a unit file`);
  }
});
