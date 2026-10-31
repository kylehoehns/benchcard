/* #459. CI splits smoke into parts: the browser rows across `--shard k/n`
   jobs, the unit suite in a `--shard suite` job, and one `--merge` job that
   judges the whole run. These are the pure halves of that, at their own seam:
   hand-built partials in, the merged run out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShard, inShard, mergePartials, shardPartial } from '../scripts/smoke/shard.mjs';
import { folder, linesOf } from '../scripts/coverage.mjs';
import { ROWS } from '../scripts/smoke/registry.mjs';

test('parseShard reads k/n and suite, and refuses anything else', () => {
  assert.deepEqual(parseShard('2/3'), { k: 2, n: 3 });
  assert.deepEqual(parseShard('suite'), { suite: true });
  for (const bad of ['', '0/3', '4/3', '1/1', '3', 'a/b', '1/3/4', '1.5/3']) {
    assert.throws(() => parseShard(bad), /--shard/, bad);
  }
});

test('inShard deals every rich row to exactly one shard, in registry order', () => {
  const rich = ROWS.filter(r => r.setup === 'rich');
  const parts = [1, 2, 3].map(k => inShard(rich, { k, n: 3 }));
  assert.deepEqual(parts.flat().map(r => r.name).sort(), rich.map(r => r.name).sort());
  for (const p of parts) {
    assert.ok(p.length >= Math.floor(rich.length / 3), 'shards are balanced by count');
    const idx = p.map(r => rich.indexOf(r));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  }
});

const ROWS_FAKE = [
  { id: 'console', name: 'no console errors', setup: null },
  { id: 'overflow', name: 'no horizontal overflow', setup: 'cold' },
  { id: 'a', name: 'row a', setup: 'rich' },
  { id: 'b', name: 'row b', setup: 'rich' },
  { id: 'c', name: 'row c', setup: 'rich' },
  { id: 'nodetest', name: 'node --test', setup: null },
];
const pass = name => ({ name, pass: true, detail: 'ok' });
const part = (k, extra) => shardPartial({ shard: { k, n: 2 }, ...extra });
const suite = { shard: { suite: true }, nodeRow: pass('node --test'), lines: {} };

test('mergePartials puts the rows back in registry order with one console row first', () => {
  const m = mergePartials([
    part(2, { rich: [pass('row b')], consoleErrors: ['boom'] }),
    suite,
    part(1, { cold: [pass('no horizontal overflow')], rich: [pass('row c'), pass('row a')], payload: { bytes: 1 }, thirdParty: ['x'] }),
  ], ROWS_FAKE);
  assert.deepEqual(m.checks.map(c => c.name), ['no console errors', 'no horizontal overflow', 'row a', 'row b', 'row c']);
  assert.equal(m.checks[0].pass, false, 'a console error in any shard fails the console row');
  assert.match(m.checks[0].detail, /boom/);
  assert.deepEqual(m.payload, { bytes: 1 });
  assert.deepEqual(m.nodeRow, pass('node --test'));
});

test('mergePartials refuses a missing shard, a missing suite, a duplicate or a mixed n', () => {
  assert.throws(() => mergePartials([part(1), suite], ROWS_FAKE), /shard 2\/2/);
  assert.throws(() => mergePartials([part(1), part(2)], ROWS_FAKE), /suite/);
  assert.throws(() => mergePartials([part(1), part(1), part(2), suite], ROWS_FAKE), /twice/);
  assert.throws(() => mergePartials([part(1), { ...part(2), shard: { k: 2, n: 3 } }, suite], ROWS_FAKE), /disagree/);
  assert.throws(() => mergePartials([], ROWS_FAKE), /no partials/);
});

test('mergePartials keeps every shard\'s coverage notes and timing', () => {
  const m = mergePartials([
    part(1, { coverageNotes: { dropped: ['d'], unseen: [] }, rowSeconds: [{ name: 'row a', seconds: 2 }],
      tallies: { sleep: { ms: 5, calls: 1 }, settle: { ms: 7, calls: 2, capped: 1 } } }),
    part(2, { coverageNotes: { dropped: [], unseen: ['u'] }, rowSeconds: [{ name: 'row b', seconds: 3 }],
      tallies: { sleep: { ms: 1, calls: 1 }, settle: { ms: 1, calls: 1, capped: 0 } } }),
    suite,
  ], ROWS_FAKE);
  assert.deepEqual(m.coverageNotes, { dropped: ['d'], unseen: ['u'] });
  assert.deepEqual(m.rowSeconds.map(r => r.name), ['row a', 'row b']);
  assert.deepEqual(m.tallies, { sleep: { ms: 6, calls: 2 }, settle: { ms: 8, calls: 3, capped: 1 } });
});

test('coverage lines survive a JSON round trip: a line covered in any part is covered', () => {
  const read = () => 'a();\nb();\nc();\n';
  const one = folder({ appDir: '/app', read });
  one.addLines({ 'x.js': { covered: [1], uncovered: [2, 3] } });
  const two = folder({ appDir: '/app', read });
  two.addLines(JSON.parse(JSON.stringify(linesOf(one.result()))));
  two.addLines({ 'x.js': { covered: [3], uncovered: [1, 2] } });
  const r = two.result().get('x.js');
  assert.deepEqual([...r.covered].sort(), [1, 3]);
  assert.deepEqual([...r.uncovered], [2]);
});
