import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

/* Everything the service worker serves lives in one directory; these tests
   resolve against it rather than against their own location. */
const ROOT = new URL('../app/', import.meta.url);

const sw = readFileSync(new URL('sw.js', ROOT), 'utf8');
const html = readFileSync(new URL('index.html', ROOT), 'utf8');

/* The stylesheets are external files now, so "what index.html loads" is no
   longer answerable from index.html alone -- the @font-face lives in
   tokens.css. Read the linked sheets and treat the concatenation as the page's
   styles wherever a test used to grep the inline <style> block. */
const sheets = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
const css = sheets.map((f) => readFileSync(new URL(f, ROOT), 'utf8')).join('\n');

/* The precache list is hand-maintained, so these tests are the thing that
   notices when a new module or vendor file lands and nobody added it.

   Scoped to the PRECACHE array literal rather than the whole file: sw.js also
   names a runtime-cached path (LAZY), and a whole-file scan counted that as
   precached, which is the exact opposite of what it is. */
const precache = [...sw.slice(sw.indexOf('const PRECACHE = ['), sw.indexOf('\n];'))
  .matchAll(/'(\.\/[^']*)'/g)]
  .map((m) => m[1])
  .filter((p) => p !== './sw.js');

test('every precached path exists on disk', () => {
  assert.ok(precache.length > 10, 'parsed a precache list');
  for (const p of precache) {
    if (p === './') continue;
    assert.ok(existsSync(new URL(p, ROOT)), `missing precached file: ${p}`);
  }
});

test('precaches the shell entry points', () => {
  for (const p of ['./', './index.html', './app.js', './site.webmanifest']) {
    assert.ok(precache.includes(p), `precache is missing ${p}`);
  }
});

/* Follows side-effect imports too (`import './motion.umd.js'`), and resolves
   relative to the importing file — vendor/motion.mjs pulls in a sibling, and
   missing it meant fx.js threw and the whole app never booted offline. */
test('every local module in the import graph is precached', () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(new URL(file, ROOT), 'utf8');
    const dir = dirname(file);
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*'(\.[^']+\.m?js)'/g)) {
      walk(join(dir, m[1]).replace(/\\/g, '/'));
    }
  };
  walk('app.js');
  assert.ok(seen.has('vendor/motion.umd.js'), 'the walk should reach side-effect imports');
  for (const file of seen) {
    assert.ok(precache.includes(`./${file}`), `precache is missing module ./${file}`);
  }
});

test('every stylesheet index.html links is precached', () => {
  assert.ok(sheets.length >= 1, 'found the <link rel="stylesheet"> tags');
  for (const f of sheets) {
    assert.ok(existsSync(new URL(f, ROOT)), `missing stylesheet: ${f}`);
    assert.ok(precache.includes(`./${f}`), `precache is missing stylesheet ./${f}`);
  }
});

test('every font the stylesheet declares is cached, one way or the other', () => {
  /* Both were precached until the latin-ext face was measured: it covers
     U+0100 and up, which the latin file does not, so precaching it pushed
     74 KB to every install for glyphs most rosters never use. It is runtime-
     cached instead -- fetched only when a name needs it, then kept. Either
     route is fine here; a font in NEITHER is the bug, because that is a face
     the app can never render offline. */
  const fonts = [...css.matchAll(/url\('(\.\/vendor\/fonts\/[^']+)'\)/g)].map((m) => m[1]);
  assert.ok(fonts.length >= 2, 'found the @font-face sources');
  const lazy = sw.match(/const LAZY = '([^']+)'/)?.[1];
  for (const f of fonts) {
    assert.ok(precache.includes(f) || f === lazy,
      `${f} is neither precached nor named as the runtime-cached font`);
  }
});

test('the runtime-cached font is a real file, and the fetch handler stores it', () => {
  const lazy = sw.match(/const LAZY = '([^']+)'/)?.[1];
  assert.ok(lazy, 'sw.js names exactly one runtime-cached path');
  assert.ok(existsSync(new URL(lazy, ROOT)), `LAZY points at nothing: ${lazy}`);
  assert.ok(!precache.includes(lazy), 'the runtime-cached font is also precached, so it saves nothing');
  /* The exception has to stay one path wide. A `cache.put` that is not
     gated on LAZY is a cache that grows on its own again. */
  const put = sw.slice(sw.indexOf('addEventListener(\'fetch\''));
  assert.match(put, /endsWith\(LAZY[\s\S]{0,120}cache\.put/,
    'the runtime cache.put is not gated on LAZY');
});

test('nothing under vendor/ is precached that is not actually loaded', () => {
  /* Replaced the OCR-laziness test when the photo scanner was removed. The
     shape of the mistake it guarded against is still possible: a big vendored
     asset landing in PRECACHE and being pushed to every visitor on install. */
  const vendored = precache.filter((p) => p.includes('/vendor/'));
  for (const v of vendored) {
    const path = v.replace('./', '');
    assert.ok(html.includes(path) || css.includes(path) || sw.includes(v),
      `${v} is precached but nothing loads it`);
  }
});

test('the cache name carries a version constant', () => {
  assert.match(sw, /const VERSION = '[^']+'/);
  assert.match(sw, /benchcard-v\$\{VERSION\}/);
});

/* The cache name is what busts the cache, and VERSION is a hand-typed label
   that CI can only ask about across two commits. SHELL is recomputed from the
   precached bytes by the test below, on one commit, with no history — so the
   name has to carry SHELL for a forgotten VERSION bump to stop mattering.
   Dropping SHELL from the name would put the whole cache-bust back on the
   label, silently, and every other test here would still pass. */
test('the cache name carries the SHELL digest, not just the label', () => {
  assert.match(sw, /const CACHE = `benchcard-v\$\{VERSION\}-\$\{SHELL\}`/,
    'the cache name must interpolate SHELL, or a forgotten VERSION bump serves a stale shell again');
  assert.ok(sw.indexOf('const SHELL') < sw.indexOf('const CACHE'),
    'SHELL is in the temporal dead zone unless it is declared above CACHE');
});

/* ------------------------------------------------------------------ *
 * The forgotten VERSION bump, catchable in one commit
 *
 * A precached file changing without a VERSION bump is the worst failure this
 * project has: every returning coach keeps the old shell, offline, with no
 * way to notice. `scripts/check-sw-version.mjs` catches it by diffing two
 * commits — but it needs git history, and the mistake needs to fail BEFORE a
 * deploy, not beside one. `npm test` is the only thing Cloudflare runs before
 * publishing; the sw-version job runs in Actions, in parallel, afterwards, and
 * the `tests` job there checks out at depth 1 so anything wanting history is
 * worthless in it.
 *
 * So the cross-commit question is asked as a single-commit one. `SHELL` in
 * `sw.js` fingerprints the bytes of every file PRECACHE names; change one and
 * this test goes red, on a fresh clone, with no history at all. It does not
 * *force* the bump — someone could paste the new digest and leave VERSION
 * alone — which is why the Actions job stays as the second net. What it does
 * is put the mistake in front of the person while they are looking at the
 * VERSION line, hours earlier than the old net could.
 *
 * `./` is skipped: it is the directory index, the same bytes as `index.html`,
 * which is listed separately. `./sw.js` is not in PRECACHE at all; the filter
 * above is belt-and-braces, and a self-referential digest could not settle.
 * ------------------------------------------------------------------ */

const shellDigest = () => {
  const files = precache.filter((p) => p !== './').sort();
  const h = createHash('sha256');
  for (const p of files) {
    h.update(p);
    h.update('\0');
    h.update(readFileSync(new URL(p, ROOT)));
    h.update('\0');
  }
  return { digest: h.digest('hex').slice(0, 12), count: files.length };
};

test('SHELL matches the bytes of everything precached', () => {
  const pinned = sw.match(/const SHELL = '([^']*)'/)?.[1];
  assert.ok(pinned, 'sw.js has no SHELL constant — the single-commit bump guard is gone');
  const { digest, count } = shellDigest();
  assert.ok(count > 10, `only ${count} precached files were hashed; the parse is wrong`);
  assert.equal(pinned, digest,
    `a precached file changed. In app/sw.js: bump VERSION (now '${
      sw.match(/const VERSION = '([^']*)'/)?.[1]}') and set SHELL to '${digest}'. `
    + 'Both, in the same edit — the digest alone busts nothing.');
});

test('index.html registers the service worker', () => {
  assert.match(html, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
});

/* ------------------------------------------------------------------ *
 * Staying current on an installed app
 *
 * The handshake above is not the problem and these do not touch it: `sw.js`
 * takes over as soon as it installs, and this page keeps the modules it
 * already loaded so nothing swaps under a coach mid-substitution. The problem
 * is that an installed iOS app resumes from a snapshot instead of navigating,
 * so nothing ever *asks* whether there is a new worker -- an installed app was
 * found still showing a feature removed weeks earlier.
 * ------------------------------------------------------------------ */
const toast = readFileSync(new URL('toast.js', ROOT), 'utf8');

test('a resume checks for a new worker, since a resume is not a navigation', () => {
  const reg = html.slice(html.indexOf("navigator.serviceWorker.register('./sw.js')"));
  assert.match(reg, /reg\.update\(\)/, 'nothing would ever check on an installed app');
  assert.match(reg, /addEventListener\('visibilitychange'/,
    'coming back to the foreground is the only moment an installed app gives us');
  assert.match(reg, /addEventListener\('pageshow'[\s\S]{0,80}persisted/,
    'the back-forward cache is the same resume by another name');
  assert.match(reg, /visibilityState !== 'visible'/, 'do not check on the way out');
});

test('the update is offered, never taken', () => {
  const fn = toast.slice(toast.indexOf('function offerReload'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /offer\(/, 'a toast the coach can ignore');
  assert.match(body, /location\.reload\(\)/);
  assert.doesNotMatch(html, /controllerchange[\s\S]{0,200}location\.reload\(\)/,
    'a page that reloads itself is exactly what the conservative handover prevents');
});

test('never over a live game, and never on a first visit', () => {
  const fn = toast.slice(toast.indexOf('function offerReload'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /gamemode'\)\?\.hidden === false/,
    'bench mode on screen suppresses it -- and the polarity is the bug worth pinning: '
    + 'read the other way round this never fires at all');
  const listener = toast.slice(toast.indexOf("addEventListener('controllerchange'"));
  assert.match(listener.slice(0, 300), /wasControlled/,
    'the first worker claiming an uncontrolled page is not an update to offer');
});

/* A52. A page must never be served two generations of the app at once.
 *
 * `caches.match(req)` on the GLOBAL searches every cache in the origin, and a
 * deploy always has two: the new worker installs and fills its own cache while
 * the old one is still activated and still controlling every open tab. A page
 * could be handed `index.html` from one generation and its modules from the
 * other -- markup and script that disagree, which on a phone looked like
 * buttons that did nothing. `activate` deletes the losers, but activation is
 * precisely what has not happened yet inside that window.
 *
 * Reproduced before it was fixed, by serving A52's markup with A51's modules.
 * The fix is one word: open the named cache and match against that. This is
 * the guard, and it is a text check on purpose -- there is no way to stand up
 * two live worker generations in `node --test`, and a check that cannot run is
 * worse than one that reads the source it is about.
 */
test('the fetch handler reads only this generation of the cache', () => {
  const src = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  const at = src.indexOf("self.addEventListener('fetch'");
  assert.ok(at > 0, 'sw.js has no fetch handler');
  const handler = src.slice(at)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
  assert.ok(!/\bcaches\.match\s*\(/.test(handler),
    'the fetch handler calls caches.match() on the global, which searches EVERY cache in the '
    + 'origin -- during a deploy that can serve one generation of markup with another of modules');
  assert.match(handler, /caches\.open\(CACHE\)/,
    'the fetch handler no longer opens this generation of the cache by name');
  assert.match(handler, /cache\.match\(/,
    'nothing reads the named cache, so every request goes to the network');
});
