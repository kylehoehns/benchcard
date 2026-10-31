import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';

/* `/e` is a public endpoint on the same origin as the app. Anyone can POST
   anything to it, so these tests are mostly about what it refuses. The rule is
   the same one the browser follows: `payload()` is the only thing that decides
   what an event may contain, and the Worker imports it rather than
   reimplementing it, so the two cannot drift. */

const mkEnv = () => {
  const written = [];
  return {
    written,
    env: {
      AE: { writeDataPoint: d => written.push(d) },
      ASSETS: { fetch: () => new Response('asset', { status: 200 }) },
    },
  };
};
const post = (body, opts = {}) => new Request('https://benchcard.app/e', {
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ...opts,
});

/* THIS IS A STUB, and the rate-limit tests below are tests of `allowed()`'s
   wiring, not of Cloudflare's limiter. The real binding is per-location and
   eventually consistent and only exists inside Cloudflare's runtime; nothing
   here can exercise it. What these tests can pin, and do, is the part that is
   ours: which requests get asked, what key they are asked under, that a refusal
   still answers 204 and writes nothing, and that an absent or broken binding
   never fails a beacon. The numbers live in wrangler.jsonc and are not
   exercised here at all. */
const stubLimiter = (limit) => {
  const seen = new Map();
  const keys = [];
  return {
    keys,
    binding: {
      limit: async ({ key }) => {
        keys.push(key);
        const n = (seen.get(key) || 0) + 1;
        seen.set(key, n);
        return { success: n <= limit };
      },
    },
  };
};
const from = (ip, body) => post(body, { headers: { 'CF-Connecting-IP': ip } });

test('a legal event is recorded', async () => {
  const { env, written } = mkEnv();
  const res = await worker.fetch(post({ e: 'card_printed', size: 'pocket' }), env, {});
  assert.equal(res.status, 204);
  assert.equal(written.length, 1);
  assert.deepEqual(written[0].indexes, ['card_printed']);
  assert.ok(written[0].blobs.includes('pocket'));
});

test('an unknown event is dropped, not stored', async () => {
  const { env, written } = mkEnv();
  const res = await worker.fetch(post({ e: 'roster_uploaded', names: ['Ana'] }), env, {});
  assert.equal(res.status, 204, 'still 204 — the endpoint never says what it rejected');
  assert.equal(written.length, 0);
});

test('a name smuggled into a legal event never reaches the dataset', async () => {
  const { env, written } = mkEnv();
  await worker.fetch(post({ e: 'card_printed', size: 'pocket', player: 'Marcus Webb' }), env, {});
  const flat = JSON.stringify(written[0]);
  assert.ok(!/Marcus/.test(flat), `player name leaked: ${flat}`);
});

test('a name smuggled into a declared field is dropped with the field', async () => {
  const { env, written } = mkEnv();
  await worker.fetch(post({ e: 'card_printed', size: 'Marcus Webb' }), env, {});
  const flat = JSON.stringify(written[0]);
  assert.ok(!/Marcus/.test(flat), `player name leaked through a declared field: ${flat}`);
});

test('an oversized body is refused without being parsed', async () => {
  const { env, written } = mkEnv();
  const res = await worker.fetch(post({ e: 'card_printed', size: 'pocket', pad: 'x'.repeat(2000) }), env, {});
  assert.equal(res.status, 204);
  assert.equal(written.length, 0);
});

test('malformed JSON does not throw', async () => {
  const { env, written } = mkEnv();
  const res = await worker.fetch(post('{not json'), env, {});
  assert.equal(res.status, 204);
  assert.equal(written.length, 0);
});

test('a GET on the endpoint is refused', async () => {
  const { env } = mkEnv();
  const res = await worker.fetch(new Request('https://benchcard.app/e'), env, {});
  assert.equal(res.status, 405);
});

test('country is recorded but nothing that narrows to a person', async () => {
  const { env, written } = mkEnv();
  const req = post({ e: 'game_mode_opened' });
  Object.defineProperty(req, 'cf', { value: { country: 'US', city: 'Des Moines', asn: 7922 } });
  await worker.fetch(req, env, {});
  const flat = JSON.stringify(written[0]);
  assert.ok(flat.includes('US'));
  assert.ok(!/Des Moines/.test(flat), 'city must not be recorded');
  assert.ok(!/7922/.test(flat), 'network must not be recorded');
});

test('with no dataset bound the endpoint still answers', async () => {
  const res = await worker.fetch(post({ e: 'pwa_installed' }),
    { ASSETS: { fetch: () => new Response('asset') } }, {});
  assert.equal(res.status, 204, 'a missing binding must not fail the beacon');
});

test('a writeDataPoint that throws never fails the request', async () => {
  const env = {
    AE: { writeDataPoint: () => { throw new Error('quota'); } },
    ASSETS: { fetch: () => new Response('asset') },
  };
  const res = await worker.fetch(post({ e: 'pwa_installed' }), env, {});
  assert.equal(res.status, 204);
});

test('a caller under the limit is recorded, and answers 204', async () => {
  const { env, written } = mkEnv();
  const stub = stubLimiter(3);
  env.LIMITER = stub.binding;
  for (let i = 0; i < 3; i++) {
    const res = await worker.fetch(from('203.0.113.7', { e: 'card_printed', size: 'pocket' }), env, {});
    assert.equal(res.status, 204);
  }
  assert.equal(written.length, 3, 'a caller inside the limit must still be recorded');
});

test('a caller over the limit is dropped, and still answers 204', async () => {
  const { env, written } = mkEnv();
  const stub = stubLimiter(3);
  env.LIMITER = stub.binding;
  for (let i = 0; i < 5; i++) {
    const res = await worker.fetch(from('203.0.113.7', { e: 'card_printed', size: 'pocket' }), env, {});
    assert.equal(res.status, 204, 'a limited request never explains itself');
  }
  assert.equal(written.length, 3, 'the two over the limit must not reach the dataset');
});

test('the limit is keyed on the caller, so one flooder does not silence a gym', async () => {
  const { env, written } = mkEnv();
  const stub = stubLimiter(2);
  env.LIMITER = stub.binding;
  for (let i = 0; i < 4; i++) {
    await worker.fetch(from('203.0.113.7', { e: 'game_mode_opened' }), env, {});
  }
  await worker.fetch(from('198.51.100.4', { e: 'game_mode_opened' }), env, {});
  assert.deepEqual(stub.keys.slice(-1), ['198.51.100.4'], 'the key must be the caller address');
  assert.equal(written.length, 3, 'the second address is unaffected by the first one flooding');
});

test('the address used as the limit key is never recorded', async () => {
  const { env, written } = mkEnv();
  env.LIMITER = stubLimiter(10).binding;
  const req = from('203.0.113.7', { e: 'game_mode_opened' });
  Object.defineProperty(req, 'cf', { value: { country: 'US' } });
  await worker.fetch(req, env, {});
  assert.ok(!/203\.0\.113\.7/.test(JSON.stringify(written[0])), 'the caller address leaked into the dataset');
});

test('with no limiter bound the beacon is still accepted and recorded', async () => {
  const { env, written } = mkEnv();
  assert.equal(env.LIMITER, undefined);
  const res = await worker.fetch(from('203.0.113.7', { e: 'pwa_installed' }), env, {});
  assert.equal(res.status, 204, 'a preview deploy without the binding must still answer');
  assert.equal(written.length, 1, 'an absent binding must not become a silent drop');
});

test('a limiter that throws never fails or drops a beacon', async () => {
  const { env, written } = mkEnv();
  env.LIMITER = { limit: () => { throw new Error('unavailable'); } };
  const res = await worker.fetch(from('203.0.113.7', { e: 'pwa_installed' }), env, {});
  assert.equal(res.status, 204);
  assert.equal(written.length, 1, 'a broken limiter must fail open, not shut');
});

test('everything that is not /e is handed back to the asset layer', async () => {
  const { env } = mkEnv();
  for (const path of ['/', '/about', '/app.js', '/nope']) {
    const res = await worker.fetch(new Request('https://benchcard.app' + path), env, {});
    assert.equal(await res.text(), 'asset', `${path} did not reach the assets binding`);
  }
});

/* --- #424: www.benchcard.app redirects to the apex ------------------------ */

const countingEnv = () => {
  const calls = [];
  return { calls, env: { ASSETS: { fetch: (r) => { calls.push(r.url); return new Response('asset'); } } } };
};

test('www.benchcard.app answers 301 to the same path and query on the apex, never touching assets', async () => {
  const { env, calls } = countingEnv();
  for (const [from, to] of [
    ['https://www.benchcard.app/', 'https://benchcard.app/'],
    ['https://www.benchcard.app/about', 'https://benchcard.app/about'],
    ['https://www.benchcard.app./about?x=1', 'https://benchcard.app/about?x=1'], // a fully qualified name with the trailing dot
    ['https://www.benchcard.app/?try=7', 'https://benchcard.app/?try=7'],
    ['https://www.benchcard.app/7-player-basketball-rotation-chart?x=1&y=2', 'https://benchcard.app/7-player-basketball-rotation-chart?x=1&y=2'],
  ]) {
    const res = await worker.fetch(new Request(from), env, {});
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('location'), to, from);
  }
  assert.deepEqual(calls, [], 'the redirect reached the asset layer');
});

test('www redirects before the beacon too: a POST to www /e is not recorded', async () => {
  const { env, written } = mkEnv();
  const res = await worker.fetch(new Request('https://www.benchcard.app/e', {
    method: 'POST', body: JSON.stringify({ e: 'card_printed', size: 'pocket' }),
  }), env, {});
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://benchcard.app/e');
  assert.equal(written.length, 0);
});

test('the apex and a workers.dev preview are not redirected', async () => {
  const { env, calls } = countingEnv();
  for (const host of ['benchcard.app', 'benchcard.example.workers.dev']) {
    const res = await worker.fetch(new Request(`https://${host}/about?x=1`), env, {});
    assert.equal(res.status, 200, host);
    assert.equal(await res.text(), 'asset', host);
  }
  assert.equal(calls.length, 2);
});

/* --- #424: wrangler.jsonc must send every request through the Worker ------ */

/* A GUARD (/new-guard), reading the tree. Two facts nothing else would notice
   until a deploy: without `run_worker_first` the asset layer answers www pages
   itself, so the redirect above never runs for them and www serves a second
   copy of the site; and wrangler REPLACES the Worker's custom domains with
   `routes`, so dropping the apex from the list detaches benchcard.app. */
const wranglerConfig = () => JSON.parse(readFileSync(
  fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, ''));

test('wrangler.jsonc runs the Worker first and lists both custom domains, and only those', () => {
  const cfg = wranglerConfig();
  assert.ok(cfg.assets && typeof cfg.assets === 'object', 'wrangler.jsonc parsed to no assets block');
  assert.equal(cfg.assets.run_worker_first, true,
    'assets.run_worker_first must be true: patterns are paths, not hosts, so true is the only way www is redirected');
  assert.ok(Array.isArray(cfg.routes), 'no top-level routes');
  assert.deepEqual(cfg.routes, [
    { pattern: 'benchcard.app', custom_domain: true },
    { pattern: 'www.benchcard.app', custom_domain: true },
  ], 'routes replaces the Worker\'s domains on deploy: list the apex as well as www, and nothing else');
});

/* wrangler 4.151 defaults `workers_dev` to `routes.length === 0` and falls
   `preview_urls` back to it, so adding `routes` alone turns both off on the
   next deploy. */
test('wrangler.jsonc keeps *.workers.dev and per-branch preview URLs on', () => {
  const cfg = wranglerConfig();
  assert.equal(cfg.workers_dev, true, 'workers_dev must be explicit: routes makes wrangler default it to false');
  assert.equal(cfg.preview_urls, true, 'preview_urls must be explicit: it follows workers_dev, which routes turns off');
});
