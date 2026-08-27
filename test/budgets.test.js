import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compare, summarize, ceiling, SLACK } from '../scripts/budgets.mjs';

const ORIGIN = 'http://127.0.0.1:4321';
const recorded = JSON.parse(readFileSync(new URL('../scripts/budgets.json', import.meta.url), 'utf8'));
const base = { bytes: 100_000, requests: 10, nodes: 1000 };
const measure = over => ({ ...base, lazy: [], ...over });
const named = (checks, name) => checks.find(c => c.name.startsWith(name));

test('the recorded baseline is a usable shape', () => {
  const p = recorded.initialPayload;
  for (const key of ['bytes', 'requests', 'nodes']) {
    assert.equal(typeof p[key], 'number', `budgets.json is missing ${key}`);
    assert.ok(p[key] > 0);
  }
  assert.ok(p.bytes < 2_000_000, 'initial payload baseline is suspiciously large');
});

test('the real baseline passes against itself', () => {
  const checks = compare(recorded.initialPayload, { ...recorded.initialPayload, lazy: [] });
  assert.deepEqual(checks.filter(c => !c.pass), []);
});

test('growth inside the slack passes; past it fails and says how to re-record', () => {
  const under = compare(base, measure({ bytes: ceiling('bytes', base.bytes) }));
  assert.equal(named(under, 'initial payload').pass, true);

  const over = compare(base, measure({ bytes: ceiling('bytes', base.bytes) + 1 }));
  const check = named(over, 'initial payload');
  assert.equal(check.pass, false);
  assert.match(check.detail, /--update-budgets/);
});

test('slack is small enough to catch a real regression', () => {
  // a second copy of a 60 KB vendor script must not slip through
  assert.equal(named(compare(base, measure({ bytes: 160_000 })), 'initial payload').pass, false);
  assert.equal(named(compare(base, measure({ requests: 10 + SLACK.requests + 1 })), 'request count').pass, false);
  assert.equal(named(compare(base, measure({ nodes: 1000 + SLACK.nodes + 1 })), 'DOM nodes').pass, false);
});

test('a shrinking payload is never a failure', () => {
  const checks = compare(base, measure({ bytes: 1, requests: 1, nodes: 1 }));
  assert.deepEqual(checks.filter(c => !c.pass), []);
});

test('a missing budgets.json fails loudly rather than passing silently', () => {
  const checks = compare(null, measure());
  assert.equal(named(checks, 'initial payload').pass, false);
});

test('summarize counts our origin only', () => {
  const s = summarize([
    { url: ORIGIN + '/index.html', type: 'Document', bytes: 100 },
    { url: ORIGIN + '/app.js', type: 'Script', bytes: 200 },
    { url: 'https://static.cloudflareinsights.com/beacon.js', type: 'Script', bytes: 7000 },
  ], ORIGIN);
  assert.equal(s.requests, 2, 'third-party requests are not ours to budget');
  assert.equal(s.bytes, 300, 'and their bytes are not ours either');
  assert.deepEqual(s.byType, { Document: 100, Script: 200 });
});
