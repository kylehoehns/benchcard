import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compare, summarize, ceiling, pinned, BYTES_BASELINE, SLACK } from '../scripts/budgets.mjs';

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
  // and it names the route that is actually open, not the one both guards deny
  assert.match(check.detail, /scripts\/budgets\.mjs/);
  assert.match(check.detail, /--update-budgets` is denied/);
});

test('slack is small enough to catch a real regression', () => {
  // a second copy of a 60 KB vendor script must not slip through
  assert.equal(named(compare(base, measure({ bytes: 160_000 })), 'initial payload').pass, false);
  assert.equal(named(compare(base, measure({ requests: 10 + SLACK.requests + 1 })), 'request count').pass, false);
  assert.equal(named(compare(base, measure({ nodes: 1000 + SLACK.nodes + 1 })), 'DOM nodes').pass, false);
});

/* The test above measures the 60 KB rule against a 100 KB fixture, which is a
   twelfth of the app. Slack is a percentage, so clearing that bar says almost
   nothing about clearing it at the app's real size -- which is the number the
   ratchet in budgets.mjs kept moving. This measures it where it counts. */
test('the hand-pinned bytes baseline catches a 60 KB regression at the real size', () => {
  const real = pinned({ ...base, bytes: 1 });
  assert.equal(real.bytes, BYTES_BASELINE, 'pinned() must take bytes from the hand pin, not the caller');

  const room = ceiling('bytes', real.bytes) - real.bytes;
  assert.ok(room < 60_000, `${room} bytes of room lets a second copy of a 60 KB vendor script through`);
  assert.equal(
    named(compare(real, { ...real, lazy: [], bytes: real.bytes + 60_000 }), 'initial payload').pass,
    false,
  );
});

/* #37: DOM nodes went the other way. `budgets.json` records 1519 from a run
   five tickets ago; #30-#36 deleted the folds, the old editors and the bulk-add
   markup, so a cold load is 1367 nodes now. Re-recording the file is denied
   (`--update-budgets` would erase the hand-set `requests` pin, and a hand edit
   to `budgets.json` is denied outright), so the tighter number is pinned in
   `budgets.mjs` beside the bytes one and reaches the check through `pinned()`.
   The number here is the one that branch measured, so a check reading the
   stale 1519 would let 152 nodes of regression through unnoticed. */
const MEASURED_NODES = 1367;

test('the DOM-node baseline is the hand pin, not the stale recorded number', () => {
  assert.ok(recorded.initialPayload.nodes > MEASURED_NODES,
    'budgets.json no longer holds the looser number this pin exists to replace');
  const real = pinned({ ...recorded.initialPayload });
  assert.equal(real.nodes, MEASURED_NODES, 'pinned() must take nodes from the hand pin, not budgets.json');
  assert.equal(
    named(compare(real, { ...real, lazy: [], nodes: MEASURED_NODES + SLACK.nodes + 1 }), 'DOM nodes').pass,
    false,
    'a node count past the pinned baseline plus slack still has to fail',
  );
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
