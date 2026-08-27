import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePrecache, parseVersion, needsBump } from '../scripts/check-sw-version.mjs';

const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');

test('parses the real sw.js', () => {
  const list = parsePrecache(sw);
  assert.ok(list.includes('app.js'));
  assert.ok(list.includes('index.html'));
  assert.ok(list.includes('vendor/motion.mjs'));
  assert.ok(!list.includes('sw.js'), 'sw.js is not in PRECACHE and must not be watched via the list');
  assert.match(parseVersion(sw), /^\d+$/);
});

test('parses only the PRECACHE array, not every quoted path in the file', () => {
  const list = parsePrecache(sw);
  // the fetch handler mentions ./index.html too; the list must not gain dupes
  assert.equal(new Set(list).size, list.length);
});

test('a changed precached file with no bump is caught', () => {
  const stale = needsBump(['app.js', 'README.md'], ['app.js'], ['app.js'], '4', '4');
  assert.deepEqual(stale, ['app.js']);
});

test('a changed precached file with a bump is fine', () => {
  assert.deepEqual(needsBump(['app.js'], ['app.js'], ['app.js'], '4', '5'), []);
});

test('changes outside the precache list are ignored', () => {
  assert.deepEqual(needsBump(['README.md', 'ROADMAP.md', 'engine.test.js'], ['app.js'], ['app.js'], '4', '4'), []);
});

test('a file newly added to PRECACHE needs the bump', () => {
  assert.deepEqual(needsBump(['analytics.js'], ['app.js'], ['app.js', 'analytics.js'], '4', '4'), ['analytics.js']);
});

test('a file dropped from PRECACHE needs the bump too', () => {
  // the old shell would keep serving it from the old cache otherwise
  assert.deepEqual(needsBump(['old.js'], ['app.js', 'old.js'], ['app.js'], '4', '4'), ['old.js']);
});

test('an unreadable version on either side skips rather than fails', () => {
  assert.deepEqual(needsBump(['app.js'], ['app.js'], ['app.js'], null, '4'), []);
  assert.deepEqual(needsBump(['app.js'], ['app.js'], ['app.js'], '4', null), []);
});

test('the guard would have caught this session\'s own change', () => {
  // analytics.js landed in PRECACHE this iteration; with VERSION left at 4 the
  // guard must fire on it, which is the exact mistake it exists to catch
  const before = parsePrecache(sw).filter((f) => f !== 'analytics.js');
  assert.deepEqual(needsBump(['analytics.js', 'app.js'], before, parsePrecache(sw), '4', '4'), ['analytics.js', 'app.js']);
});
