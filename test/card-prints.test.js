import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blobColumn, buildSql, summarize, verdict } from '../scripts/card-prints.mjs';

/* `scripts/card-prints.mjs` reads a counter written by a Worker we cannot run
 * from here, so the one thing that can silently break it is the column layout:
 * `src/index.js` packs `blobs = [event name, country, ...string fields]`, and
 * a new string field ahead of `size` slides `size` out of `blob3` without any
 * error anywhere. The script derives the column instead of typing it; these
 * tests hold that derivation against the real writer.
 */

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('the Worker still opens blobs with the event name and the country', () => {
  // If this line changes shape, blobColumn's +3 offset is wrong.
  assert.match(worker, /const blobs = \[event\.e, country\]/);
  assert.match(worker, /else blobs\.push\(String\(v\)\)/);
  assert.match(worker, /indexes: \[event\.e\]/);
});

test('size resolves to blob3 today, derived rather than assumed', () => {
  assert.equal(blobColumn('card_printed', 'size'), 'blob3');
});

test('an unknown event or field fails loudly instead of querying nothing', () => {
  assert.throws(() => blobColumn('card_burned', 'size'), /unknown event/);
  assert.throws(() => blobColumn('card_printed', 'colour'), /no string field/);
});

test('the SQL filters on the index, weights by sample interval and bounds the window', () => {
  const sql = buildSql(30);
  assert.match(sql, /FROM benchcard_events/);
  assert.match(sql, /index1 = 'card_printed'/);
  assert.match(sql, /SUM\(_sample_interval\)/);
  assert.match(sql, /INTERVAL '30' DAY/);
  assert.match(sql, /GROUP BY blob3/);
});

test('the window is clamped and never interpolates junk into the SQL', () => {
  assert.match(buildSql('90'), /INTERVAL '90' DAY/);
  assert.match(buildSql(0), /INTERVAL '1' DAY/);
  assert.match(buildSql(9999), /INTERVAL '365' DAY/);
  assert.match(buildSql("1' OR '1"), /INTERVAL '30' DAY/); // unparseable falls back, never lands in the SQL
});

test('summarize totals, shares and orders by volume', () => {
  const out = summarize([{ size: 'pocket', prints: '80' }, { size: 'half', prints: '20' }]);
  assert.equal(out.total, 100);
  assert.equal(out.rows[0].size, 'pocket');
  assert.equal(out.rows[1].share, 0.2);
});

test('a missing size is labelled rather than dropped', () => {
  const out = summarize([{ size: '', prints: 3 }]);
  assert.equal(out.rows[0].size, '(unset)');
});

test('the verdict distinguishes no data from a real minority', () => {
  assert.match(verdict(summarize([])), /No prints recorded/);
  assert.match(verdict(summarize([{ size: 'pocket', prints: 5 }])), /too few/);
  assert.match(
    verdict(summarize([{ size: 'pocket', prints: 999 }, { size: 'half', prints: 1 }])),
    /deletion candidate/,
  );
  assert.match(
    verdict(summarize([{ size: 'pocket', prints: 500 }, { size: 'half', prints: 500 }])),
    /earns the two-column fix/,
  );
});
