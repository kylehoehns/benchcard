/* #125's own Proof seams 1 and 2.
 *
 * Seam 1 (pure, built with `/tdd`): `planLanding` is a pure function with no
 * CDP call in it, so its rules from the spec's Design section -- an empty
 * `want` resolves to `BASELINE`, what each kind of `record` writes, unknown
 * fields and unsupported versions throw -- are `node --test` assertions
 * directly against its return value, not against a running browser.
 *
 * Seam 2 (source-reading, built under `/new-guard`): only `page-state.mjs`
 * may call the four CDP methods a check used to call by hand, or read
 * `document.fonts.ready`; every other file holds zero, with no allow-list.
 * Comments are not counted. Rule 2a: the walk counts what it found
 * before judging it, so a walk that silently found nothing fails loudly
 * instead of reading as a clean tree. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pageState from '../scripts/smoke/page-state.mjs';
import { lacks } from './prose.js';
import { ROWS } from '../scripts/smoke/registry.mjs';

const { planLanding, BASELINE } = pageState;
import { RICH, SEED } from '../scripts/smoke/fixtures.mjs';

/* ---------- seam 1: planLanding, the pure half ---------- */

test('planLanding: an empty want resolves to BASELINE', () => {
  const { state } = planLanding({});
  assert.deepStrictEqual(state, BASELINE);
});

test('planLanding: a v7 record writes v7 and removes v3 and .bak', () => {
  const { script } = planLanding({ record: RICH });
  assert.match(script, /localStorage\.removeItem\('benchcard\.v3'\)/);
  assert.match(script, /localStorage\.removeItem\('benchcard\.v7\.bak'\)/);
  assert.match(script, /localStorage\.setItem\('benchcard\.v7', /);
});

test('planLanding: a v3 record writes v3 and removes both v7 keys', () => {
  const { script } = planLanding({ record: SEED });
  assert.match(script, /localStorage\.removeItem\('benchcard\.v7'\)/);
  assert.match(script, /localStorage\.removeItem\('benchcard\.v7\.bak'\)/);
  assert.match(script, /localStorage\.setItem\('benchcard\.v3', /);
});

test("planLanding: 'wiped' clears storage", () => {
  const { script } = planLanding({ record: 'wiped' });
  assert.equal(script, pageState.LOCALSTORAGE_WIPE);
  // behavior: run on a store holding a record, the script empties it
  const store = { benchcard_v7: 'x' };
  const localStorage = { clear: () => { for (const k of Object.keys(store)) delete store[k]; } };
  new Function('localStorage', script)(localStorage);
  assert.deepEqual(store, {});
});

test("planLanding: 'kept' has no seeding script", () => {
  const { script } = planLanding({ record: 'kept' });
  assert.equal(script, null);
});

test('planLanding: an unknown field throws', () => {
  assert.throws(() => planLanding({ bogus: true }));
});

test('planLanding: a record with another version throws', () => {
  assert.throws(() => planLanding({ record: { version: 99 } }));
});

/* ---------- land: the emulated device kind ---------- */

async function metricsLandedFor(want) {
  const sent = [];
  const c = {
    on: (_ev, cb) => setTimeout(cb, 0),
    off: () => {},
    send: async (method, params) => {
      sent.push([method, params]);
      return method === 'Runtime.evaluate' ? { result: { value: true } } : {};
    },
  };
  await pageState.land(c, 'http://x', want);
  return sent.filter(([m]) => m === 'Emulation.setDeviceMetricsOverride').map(([, p]) => p);
}

test('land: mobile emulation is the default, and mobile: false reaches the metrics override', async () => {
  assert.deepEqual((await metricsLandedFor({ width: 390 })).map(p => p.mobile), [true]);
  assert.deepEqual((await metricsLandedFor({ width: 1280, mobile: false })).map(p => p.mobile), [false]);
});

/* ---------- describeBootTimeout: what a failed boot wait says (#400) ---------- */

const FACTS = {
  path: '/index.html', readyState: 'complete', views: ['view-today'],
  booted: true, controlled: true, cardNote: '', key: 'benchcard.v7', days: 1, view: 'games',
};
const OLD_PREFIX = 'boot wait timed out: document.querySelector(\'.card\') on /index.html ' +
  '(page showed /index.html?x=1, complete, visible views: view-today';

test('describeBootTimeout: keeps the old message prefix byte for byte and adds the facts', () => {
  const msg = pageState.describeBootTimeout("document.querySelector('.card')", '/index.html',
    { ...FACTS, path: '/index.html?x=1', views: ['view-today'] });
  assert.ok(msg.startsWith(OLD_PREFIX), msg);
  for (const part of ['booted: yes', 'sw: controlled', 'card note: none', 'record: benchcard.v7, 1 day(s), view games']) {
    assert.ok(msg.includes(part), `${part} missing from: ${msg}`);
  }
  const two = pageState.describeBootTimeout('r', 'w', { ...FACTS, views: ['view-today', 'view-games'] });
  assert.ok(two.includes('visible views: view-today,view-games'), two);
});

test('describeBootTimeout: not booted, not controlled, no record', () => {
  const msg = pageState.describeBootTimeout('r', 'w',
    { ...FACTS, booted: false, controlled: false, days: null, view: null, record: 'none' });
  for (const part of ['booted: no', 'sw: not', 'record: none']) {
    assert.ok(msg.includes(part), `${part} missing from: ${msg}`);
  }
});

test('describeBootTimeout: an unreadable record, and a card note, are named', () => {
  const msg = pageState.describeBootTimeout('r', 'w',
    { ...FACTS, record: 'unreadable', cardNote: 'Plan blocked' });
  assert.ok(msg.includes('record: unreadable'), msg);
  assert.ok(msg.includes('card note: "Plan blocked"'), msg);
});

/* ---------- bootWait, land and describeDocument on a failed boot (#400) ---------- */

const TIMED_OUT = { timedOut: true, ...FACTS, key: 'benchcard.v7', days: 2, view: 'games' };
const PREFIX = "boot wait timed out: document.querySelector('.card') on /index.html (page showed /index.html, complete, visible views: view-today";

/* A fake CDP client. `evaluate` is what Runtime.evaluate's value is; `nav` is
   what Page.navigate returns (or a function of the navigation's number, from
   1); `frame` is the getFrameTree handler. `during(n, emit)` runs inside the
   nth Page.navigate, before it returns, to fire CDP events with `emit`
   (#400: `Network.requestWillBeSent`, `Network.loadingFailed`). Only the load
   event fires by itself on `on`; every other listener waits for `emit`. */
function fakeClient({ evaluate, nav = { loaderId: 'L1' }, frame, calls = [], during }) {
  const handlers = new Map();
  let navs = 0;
  const emit = (ev, params) => { for (const cb of [...(handlers.get(ev) || [])]) cb(params); };
  return {
    calls,
    on: (ev, cb) => {
      calls.push(['on', ev]);
      if (ev === 'Page.loadEventFired') return setTimeout(cb, 0);
      handlers.set(ev, [...(handlers.get(ev) || []), cb]);
    },
    off: (ev, cb) => {
      calls.push(['off', ev]);
      handlers.set(ev, (handlers.get(ev) || []).filter(h => h !== cb));
    },
    listeners: ev => (handlers.get(ev) || []).length,
    send: async (method) => {
      calls.push([method]);
      if (method === 'Runtime.evaluate') return { result: { value: evaluate } };
      if (method === 'Page.navigate') {
        navs++;
        if (during) during(navs, emit);
        return typeof nav === 'function' ? nav(navs) : nav;
      }
      if (method === 'Page.getFrameTree') return frame ? frame() : { frameTree: { frame: { loaderId: 'L1' } } };
      return {};
    },
  };
}
const LAND_READY = "document.querySelector('.card')";

test('bootWait: a timed-out evaluate throws the old prefix plus the page facts', async () => {
  const c = fakeClient({ evaluate: TIMED_OUT });
  await assert.rejects(pageState.bootWait(c, LAND_READY, '/index.html'), e => {
    assert.ok(e.message.startsWith(PREFIX), e.message);
    assert.ok(e.message.includes('record: benchcard.v7, 2 day(s), view games'), e.message);
    return true;
  });
});

test('bootWait: resolves when the evaluate returns nothing', async () => {
  await pageState.bootWait(fakeClient({ evaluate: undefined }), LAND_READY);
});

test('land: a navigate errorText does not throw; a timeout then names it and the document', async () => {
  const c = fakeClient({ evaluate: TIMED_OUT, nav: { loaderId: 'L1', errorText: 'net::ERR_ABORTED' },
    frame: () => ({ frameTree: { frame: { loaderId: 'L2' } } }) });
  await assert.rejects(pageState.land(c, 'http://x', {}), e => {
    assert.ok(e.message.startsWith(PREFIX), e.message);
    assert.ok(e.message.endsWith(', navigate error: net::ERR_ABORTED, document: NOT the one navigated to (loader L1 vs L2)'), e.message);
    return true;
  });
  // and with no timeout the same errorText is ignored, as before
  await pageState.land(fakeClient({ evaluate: undefined, nav: { errorText: 'net::ERR_ABORTED' } }), 'http://x', {});
});

test('land: a timeout with no navigate error says only the document verdict', async () => {
  await assert.rejects(pageState.land(fakeClient({ evaluate: TIMED_OUT }), 'http://x', {}), e => {
    assert.ok(e.message.endsWith(', document: the one navigated to'), e.message);
    assert.ok(lacks(e.message, 'navigate error'), e.message);
    return true;
  });
});

test('land: an error that is not a boot-wait timeout is rethrown untouched', async () => {
  const c = fakeClient({ evaluate: undefined });
  const boom = new Error('socket closed');
  const send = c.send;
  c.send = async (m, p) => { if (m === 'Runtime.evaluate') throw boom; return send(m, p); };
  await assert.rejects(pageState.land(c, 'http://x', {}), e => e === boom && e.message === 'socket closed');
});

test('land: removes its loadEventFired listener once per navigate', async () => {
  const calls = [];
  await pageState.land(fakeClient({ evaluate: undefined, calls }), 'http://x', {});
  assert.equal(calls.filter(([m, ev]) => m === 'off' && ev === 'Page.loadEventFired').length, 1);
  const fresh = [];
  await pageState.land(fakeClient({ evaluate: undefined, calls: fresh }), 'http://x', { freshHistory: true });
  assert.equal(fresh.filter(([m, ev]) => m === 'off' && ev === 'Page.loadEventFired').length, 2);
});

/* #400: Chrome itself, under load, aborts a few module requests of a fresh
   document; the app never boots. `land` recognizes that one signature. */
const script = (loaderId, requestId, file) => ['Network.requestWillBeSent',
  { requestId, loaderId, type: 'Script', request: { url: `http://x/app/${file}` } }];
const failed = (requestId, errorText = 'net::ERR_ABORTED', canceled = true) =>
  ['Network.loadingFailed', { requestId, errorText, canceled }];

async function landWatching({ during, evaluate, want = {} }) {
  const c = fakeClient({ evaluate, nav: n => ({ loaderId: `L${n}` }), during,
    frame: () => ({ frameTree: { frame: { loaderId: 'L2' } } }) });
  const lines = [];
  const write = process.stderr.write;
  process.stderr.write = s => { lines.push(String(s)); return true; };
  let error;
  try { await pageState.land(c, 'http://x', want); } catch (e) { error = e; } finally { process.stderr.write = write; }
  return { c, lines, error, navs: c.calls.filter(([m]) => m === 'Page.navigate').length };
}

test('land: scripts of the navigated document that Chrome aborted: lands once more and says so', async () => {
  const { navs, lines, error } = await landWatching({ evaluate: undefined, want: { query: '?try=9' },
    during: (n, emit) => { if (n === 1) {
      emit(...script('L1', 'a', 'storage.js')); emit(...script('L1', 'b', 'engine.js')); emit(...script('L1', 'c', 'ok.js'));
      emit(...failed('a')); emit(...failed('b'));
    } } });
  assert.equal(error, undefined);
  assert.equal(navs, 2);
  assert.deepEqual(lines, ['land: Chrome aborted storage.js, engine.js on /index.html?try=9; landed again (#400)\n']);
});

test('land: no second landing for no failure, a failure without canceled, or another loader', async () => {
  const none = await landWatching({ evaluate: undefined, during: (n, emit) => emit(...script('L1', 'a', 'storage.js')) });
  assert.equal(none.navs, 1);
  const hard = await landWatching({ evaluate: undefined, during: (n, emit) => {
    emit(...script('L1', 'a', 'storage.js')); emit(...failed('a', 'net::ERR_FAILED', false)); } });
  assert.equal(hard.navs, 1);
  assert.deepEqual(hard.lines, []);
  // freshHistory: the abort belongs to the first of its two navigations
  const other = await landWatching({ evaluate: undefined, want: { freshHistory: true }, during: (n, emit) => {
    if (n === 1) { emit(...script('L1', 'a', 'storage.js')); emit(...failed('a')); } } });
  assert.equal(other.navs, 2);
  assert.deepEqual(other.lines, []);
});

test('land: a canceled request that is not a Script (Fetch, Image) does not trigger a second landing', async () => {
  const { navs, lines } = await landWatching({ evaluate: undefined, during: (n, emit) => {
    emit('Network.requestWillBeSent', { requestId: 'f', loaderId: 'L1', type: 'Fetch', request: { url: 'http://x/app/data.json' } });
    emit('Network.requestWillBeSent', { requestId: 'i', loaderId: 'L1', type: 'Image', request: { url: 'http://x/app/icon.png' } });
    emit(...failed('f')); emit(...failed('i'));
  } });
  assert.equal(navs, 1);
  assert.deepEqual(lines, []);
});

test('land: a second abort is not retried again; the timeout names the failed scripts', async () => {
  const { navs, lines, error } = await landWatching({ evaluate: TIMED_OUT, during: (n, emit) => {
    emit(...script(`L${n}`, `r${n}`, 'trap.js')); emit(...failed(`r${n}`));
    if (n === 2) { emit(...script('L2', 'z', 'shortcuts.js')); emit(...failed('z', 'net::ERR_FAILED', false)); }
  } });
  assert.equal(navs, 2);
  assert.equal(lines.length, 1);
  assert.ok(error.message.startsWith(PREFIX), error.message);
  assert.ok(error.message.includes(', document: the one navigated to'), error.message);
  assert.ok(error.message.includes(', failed scripts: trap.js net::ERR_ABORTED canceled, shortcuts.js net::ERR_FAILED'), error.message);
});

test('land: a timeout with no failed script adds nothing to the message', async () => {
  const { error } = await landWatching({ evaluate: TIMED_OUT, during: (n, emit) => emit(...script('L1', 'a', 'storage.js')) });
  assert.ok(lacks(error.message, 'failed scripts'), error.message);
});

test('land: removes its Network listeners whatever happens', async () => {
  const ok = fakeClient({ evaluate: undefined });
  await pageState.land(ok, 'http://x', {});
  const bad = fakeClient({ evaluate: TIMED_OUT });
  await assert.rejects(pageState.land(bad, 'http://x', {}));
  for (const c of [ok, bad]) {
    assert.equal(c.listeners('Network.requestWillBeSent'), 0);
    assert.equal(c.listeners('Network.loadingFailed'), 0);
  }
});

test('describeDocument: same, different, missing loaderId, rejecting and hanging frame tree', async () => {
  const d = (nav, frame) => pageState.describeDocument(fakeClient({ evaluate: 0, frame }), nav);
  assert.equal(await d({ loaderId: 'L1' }), 'the one navigated to');
  assert.equal(await d({ loaderId: 'L0' }), 'NOT the one navigated to (loader L0 vs L1)');
  assert.equal(await d({}), 'unknown');
  assert.equal(await d({ loaderId: 'L1' }, () => { throw new Error('closed'); }), 'unknown');
  assert.equal(await d({ loaderId: 'L1' }, () => new Promise(() => {})), 'unknown');
});

test('readRecordFacts: resolves the saved record the way the app does', () => {
  const store = o => ({ length: Object.keys(o).length, key: i => Object.keys(o)[i], getItem: k => o[k] ?? null });
  const rf = o => pageState.readRecordFacts(store(o));
  assert.deepEqual(rf({}), { record: 'none' });
  assert.deepEqual(rf({ 'benchcard.v7': '{bad' }), { record: 'unreadable', key: 'benchcard.v7' });
  assert.deepEqual(rf({ 'benchcard.v3': JSON.stringify({ day: {} }), other: 'x' }),
    { record: 'ok', key: 'benchcard.v3', days: 1, view: undefined });
  const two = { view: 'games', activeTeam: 1, teams: [{ days: [{}] }, { days: [{}, {}, {}] }] };
  assert.deepEqual(rf({ 'benchcard.v7': JSON.stringify(two) }),
    { record: 'ok', key: 'benchcard.v7', days: 3, view: 'games' });
  assert.equal(rf({ 'benchcard.v7': JSON.stringify({ ...two, activeTeam: 9 }) }).days, 3, 'clamped into range');
  assert.equal(rf({ 'benchcard.v7': JSON.stringify({ days: [{}, {}] }) }).days, 2, 'no teams: the record is the team');
  assert.equal(rf({ 'benchcard.v3': '{"days":[]}', 'benchcard.v7': '{"days":[{}]}', 'benchcard.v7.bak': '{}' }).key, 'benchcard.v7', 'highest version, not a .bak');
});

test('describeBootTimeout: the record key is named, and a card note stays on one line', () => {
  const msg = pageState.describeBootTimeout('r', 'w', { ...FACTS, key: 'benchcard.v3', cardNote: 'a\n  b\t c ' });
  assert.ok(msg.includes('record: benchcard.v3, 1 day(s), view games'), msg);
  assert.ok(msg.includes('card note: "a b c"') && !msg.includes('\n'), msg);
});

/* ---------- the start fingerprint's verdict (pure half) ---------- */

const FP = {
  url: '/index.html', screen: 'view-games', width: 390, height: 844, rootPx: '16px',
  dark: false, forced: false, recordLength: 4120, recordHash: 'a1b2c3',
};

test('compareFingerprints: identical fingerprints differ in nothing', () => {
  assert.equal(pageState.compareFingerprints(FP, { ...FP }), null);
});

test('compareFingerprints: names the first field that changed, was and want', () => {
  assert.equal(
    pageState.compareFingerprints(FP, { ...FP, screen: 'view-today' }),
    'start state differs from baseline: screen was "view-today", want "view-games"');
});

test('compareFingerprints: a changed record hash is caught even at the same length', () => {
  assert.match(
    pageState.compareFingerprints(FP, { ...FP, recordHash: 'ffffff' }),
    /^start state differs from baseline: recordHash was "ffffff", want "a1b2c3"$/);
});

test('compareFingerprints: / and /index.html are one address, other paths still differ', () => {
  // The tour row's start sometimes reads "/index.html" for the same page,
  // and failed the row on the address alone.
  assert.equal(pageState.compareFingerprints({ ...FP, url: '/' }, { ...FP, url: '/index.html' }), null);
  assert.equal(pageState.compareFingerprints({ ...FP, url: '/?x=1' }, { ...FP, url: '/index.html?x=1' }), null);
  assert.match(pageState.compareFingerprints({ ...FP, url: '/' }, { ...FP, url: '/about.html' }), /url was "\/about.html", want "\/"/);
});

test('compareFingerprints: dark or forced colors leaking in are caught', () => {
  assert.match(pageState.compareFingerprints(FP, { ...FP, dark: true }), /dark was true, want false/);
  assert.match(pageState.compareFingerprints(FP, { ...FP, forced: true }), /forced was true, want false/);
});

test('compareFingerprints: with two fields changed, the first in FINGERPRINT_FIELDS order is named', () => {
  assert.equal(
    pageState.compareFingerprints(FP, { ...FP, recordHash: 'ffffff', width: 320, url: '/about.html' }),
    'start state differs from baseline: url was "/about.html", want "/index.html"');
  assert.match(
    pageState.compareFingerprints(FP, { ...FP, recordHash: 'ffffff', width: 320 }),
    /^start state differs from baseline: width was 320, want 390$/);
});

test('compareFingerprints: a fingerprint missing any field is reported, never equal', () => {
  assert.deepEqual(pageState.FINGERPRINT_FIELDS,
    ['url', 'screen', 'width', 'height', 'rootPx', 'dark', 'forced', 'recordLength', 'recordHash']);
  for (const field of pageState.FINGERPRINT_FIELDS) {
    const { [field]: _gone, ...without } = FP;
    const problem = pageState.compareFingerprints(FP, without);
    assert.ok(problem && problem.includes(field),
      `a fingerprint with no ${field} must be reported naming it, got ${JSON.stringify(problem)}`);
    // and a baseline that lost the field is just as wrong: undefined === undefined must not pass
    const both = pageState.compareFingerprints(without, { ...without });
    assert.ok(both && both.includes(field),
      `two fingerprints both missing ${field} must not compare equal, got ${JSON.stringify(both)}`);
  }
});

/* ---------- setMedia: live emulation inside one page load ---------- */

test('setMedia pins the CDP call shape: one Emulation.setEmulatedMedia per call, features passed through unchanged', async () => {
  const sent = [];
  const c = { send: async (method, params) => { sent.push([method, params]); return {}; } };
  const dark = [{ name: 'prefers-color-scheme', value: 'dark' }];
  await pageState.setMedia(c, dark);
  await pageState.setMedia(c, []);
  assert.deepEqual(sent, [
    ['Emulation.setEmulatedMedia', { features: dark }],
    ['Emulation.setEmulatedMedia', { features: [] }],
  ]);
});

/* ---------- the registry: the harness owns the reset ---------- */

test('no registry row carries resetAfter: the next row\'s reset is what restores', () => {
  assert.ok(ROWS.length >= 70, `expected the registry's rows, found ${ROWS.length}`);
  assert.deepEqual(ROWS.filter(r => 'resetAfter' in r).map(r => r.name), []);
});

/* ---------- seam 2: the guard half ---------- */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SMOKE_DIR = join(ROOT, 'scripts', 'smoke');

const PATTERNS = {
  navigate: /send\(\s*['"]Page\.navigate['"]/g,
  metrics: /send\(\s*['"]Emulation\.setDeviceMetricsOverride['"]/g,
  fontsizes: /send\(\s*['"]Page\.setFontSizes['"]/g,
  media: /send\(\s*['"]Emulation\.setEmulatedMedia['"]/g,
  fontsready: /document\.fonts\.ready/g,
};

function countsFor(source) {
  const counts = {};
  for (const [key, re] of Object.entries(PATTERNS)) counts[key] = (source.match(re) || []).length;
  return counts;
}

function smokeFiles() {
  const files = [join(ROOT, 'scripts', 'smoke.mjs')];
  for (const name of readdirSync(SMOKE_DIR)) {
    if (name.endsWith('.mjs')) files.push(join(SMOKE_DIR, name));
  }
  return files;
}

const ZERO = { navigate: 0, metrics: 0, fontsizes: 0, media: 0, fontsready: 0 };

/* Comments are dropped before counting: a doc comment may name the method it
 * is explaining without being a call of it. Only what starts a line is
 * dropped -- a `//` line, or a `/*` at the start of a line through its first
 * closing `*` + `/`. A `/*` met mid-line (inside a string, a regex, a template)
 * is never taken for a comment opener, so it cannot swallow the code after it:
 * a trailing comment that names a call is counted, and the guard fails
 * loudly instead of going quiet. */
const stripComments = src => src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* The walk itself: `read(file)` supplies each file's text, so a test can hand
 * it a tree with a call planted in a real file. */
function walk(read) {
  const files = smokeFiles();
  let measured = 0;
  const bad = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const counts = countsFor(stripComments(read(file)));
    measured += Object.values(counts).reduce((a, b) => a + b, 0);

    if (rel === 'scripts/smoke/page-state.mjs') {
      for (const key of Object.keys(PATTERNS)) {
        if (counts[key] < 1) bad.push(`page-state.mjs has ${counts[key]} ${key}, want at least 1`);
      }
      continue;
    }
    for (const key of Object.keys(PATTERNS)) {
      if (counts[key] !== ZERO[key]) bad.push(`${rel}: ${key} is ${counts[key]}, want 0`);
    }
  }
  return { files, measured, bad };
}

test('only page-state.mjs sends these CDP methods or reads fonts.ready', () => {
  const { files, measured, bad } = walk(f => readFileSync(f, 'utf8'));
  assert.ok(files.length >= 30,
    `expected at least 30 files across scripts/smoke.mjs and scripts/smoke/, found ${files.length} -- ` +
    'a guard that measured nothing must fail, not pass');
  assert.ok(measured > 0, 'the guard scanned every file and matched nothing it tracks -- a check that measured nothing must fail, not pass');
  assert.deepEqual(bad, []);
});

test('the guard above can fail: a call planted in a real check file is caught by the walk', () => {
  const planted = join(SMOKE_DIR, 'gm-open.mjs');
  const { bad } = walk(f => readFileSync(f, 'utf8') + (f === planted ? `\nawait c.send('Page.setFontSizes', {});\n` : ''));
  assert.deepEqual(bad, ['scripts/smoke/gm-open.mjs: fontsizes is 1, want 0']);
});

test('stripComments drops comment mentions but never swallows code after a /* inside a string', () => {
  const mention = stripComments(`/* a doc comment naming send('Page.setFontSizes' */\n// document.fonts.ready\n`);
  assert.deepEqual(countsFor(mention), ZERO, 'a call named only in a comment is not a call');
  const afterString = `const g = '/*';\nawait c.send('Page.setFontSizes', {});\nconst h = '*/';\n`;
  assert.equal(countsFor(stripComments(afterString)).fontsizes, 1,
    'a /* inside a string must not hide the call between it and the next */');
});

test('the old navigation helpers are gone from fixtures.mjs and dom.mjs', async () => {
  const fixtures = await import('../scripts/smoke/fixtures.mjs');
  const dom = await import('../scripts/smoke/dom.mjs');
  const gone = ['goRich', 'goSeed', 'reloadWithRecord', 'seeded'].filter(n => n in fixtures)
    .concat(['landWiped', 'navigateAndWaitForCard', 'setWidth', 'ambient', 'landKeepingAmbient'].filter(n => n in dom));
  assert.deepEqual(gone, []);
});

/* A check no longer puts RICH back itself: the harness's `reset` runs before
 * the next rich row (#125 D1), so a restore on the way out -- `goRich(c,
 * origin)` or `reloadWithRecord(c, origin, RICH...)` as the LAST statement of
 * a pass or of a `finally`, with or without a trailing `.catch` -- is dead
 * weight and a second owner of the reset. A `goRich` in the middle of a pass
 * sets up that pass's own start state and is not matched: the call must be
 * followed by nothing but comments and blank lines before the closing brace
 * or the `return`. Rule 2a: the pattern is proved able to match each form
 * first. */
const RESTORE = new RegExp(
  String.raw`(?:await\s+)?(?:goRich\(c, origin\)|reloadWithRecord\(c, origin, RICH\b[^\n]*?\))` +
  String.raw`(?:\.catch\([^\n]*\))?;?[^\n]*\n(?:[ \t]*(?:\/\/[^\n]*)?\n)*[ \t]*(?:\}|return\b)`, 'g');

test('no check module restores RICH itself', () => {
  const forms = {
    catch: `  await goRich(c, origin).catch(() => {});\n  return {`,
    finallyTail: `  } finally {\n    await goRich(c, origin);\n  }\n`,
    commentedTail: `  } finally {\n    // put it back\n    await goRich(c, origin);\n  }\n`,
    reloadTail: `  } finally {\n    await reloadWithRecord(c, origin, RICH, GAMES_VIEW_READY);\n  }\n`,
    reloadPlain: `  reloadWithRecord(c, origin, RICH).catch(() => {});\n}\n`,
    beforeReturn: `  await goRich(c, origin);\n\n  return {\n`,
  };
  for (const [name, text] of Object.entries(forms)) {
    assert.equal(text.match(RESTORE)?.length, 1,
      `the restore pattern must match the ${name} form, or a clean tree proves nothing`);
  }
  const startState = `    await goRich(c, origin);\n    await evalIn(c, step(X));\n  }\n`;
  assert.equal(startState.match(RESTORE), null,
    'a goRich that sets up the pass\'s own start state, with work after it, is not a restore');
  const files = smokeFiles();
  assert.ok(files.length >= 30, `expected at least 30 smoke files, found ${files.length}`);
  const bad = files.filter(f => (readFileSync(f, 'utf8').match(RESTORE) || []).length > 0)
    .map(f => relative(ROOT, f).split(sep).join('/'));
  assert.deepEqual(bad, []);
});

/* #527: the app reloads itself once when its module fails to load. Inside the
   harness that reload would be a main-frame navigation nothing armed a
   coverage take for, so `land` registers a script, FIRST, that spends the
   app's one reload before any page script runs. */
async function sourcesLandedFor(want) {
  const calls = [];
  const c = fakeClient({ evaluate: undefined, calls });
  const send = c.send;
  const sources = [];
  c.send = async (m, p) => { if (m === 'Page.addScriptToEvaluateOnNewDocument') sources.push(p.source); return send(m, p); };
  await pageState.land(c, 'http://x', want);
  return sources;
}
const runSpend = source => {
  const store = new Map();
  const sessionStorage = { setItem: (k, v) => store.set(k, String(v)), getItem: k => store.get(k) ?? null };
  const localStorage = { setItem() {}, removeItem() {}, clear() {}, getItem: () => null };
  new Function('sessionStorage', 'localStorage', source)(sessionStorage, localStorage);
  return store;
};

test("land: the first on-new-document script spends the app's one reload, whatever the record", async () => {
  for (const want of [{}, { record: 'kept' }, { record: 'wiped' }, { scripts: ['1;'] }]) {
    const [first] = await sourcesLandedFor(want);
    assert.ok(first, `no script registered for ${JSON.stringify(want)}`);
    assert.equal(runSpend(first).get('benchcard.reloaded'), '1', `first script for ${JSON.stringify(want)} does not spend the reload`);
  }
});

test('land: a sessionStorage that throws does not break the spend script', async () => {
  const [first] = await sourcesLandedFor({ record: 'kept' });
  assert.doesNotThrow(() => new Function('sessionStorage', first)({ setItem() { throw new Error('denied'); } }));
});

test("the reload flag's key is the one index.html's boot guard reads", async () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.ok(pageState.RELOAD_FLAG, 'page-state.mjs does not export RELOAD_FLAG');
  assert.ok(html.includes(`'${pageState.RELOAD_FLAG}'`), `index.html does not use the key ${pageState.RELOAD_FLAG}`);
  assert.equal(pageState.RELOAD_FLAG, 'benchcard.reloaded');
});
