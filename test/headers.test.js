import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* `app/_headers` is Cloudflare Pages configuration, not an asset — nothing
   fetches it, no test served it, and until now nothing read it either. That
   makes it the one file in the repo where a change can be silently inert:
   a header written into a comment, or written at column 0 where Cloudflare
   reads it as a PATH rather than as a header, looks exactly as correct in a
   diff as one that works. So this parses the file the way Pages does — blank
   and `#` lines dropped, an unindented line opens a rule, an indented
   `Name: value` attaches to the rule above it — and then judges the result.

   Everything here pins the `/*` block added for A14. The Cache-Control rules
   are older and have their own reasons written beside them; this asserts they
   survive rather than re-deriving them. */

const ROOT = new URL('../app/', import.meta.url);
const text = readFileSync(new URL('_headers', ROOT), 'utf8');

function parse(src) {
  const rules = new Map();
  let current = null;
  for (const line of src.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) {
      // Indented: a header, but only if some rule has been opened above it.
      if (!current) continue;
      const at = line.indexOf(':');
      if (at < 0) continue;
      current.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    } else {
      current = [];
      rules.set(line.trim(), current);
    }
  }
  return rules;
}

const rules = parse(text);
const headers = new Map([...rules].map(([path, hs]) => [path, new Map(hs)]));

const CSP = "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; "
  + "object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const EXPECTED = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()',
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000',
};

test('every rule key is a path, so no header landed at column 0', () => {
  /* The wrong instance this catches: a header line that lost its indentation.
     Pages would read `X-Content-Type-Options: nosniff` as a path pattern and
     the header would simply never be sent — from the diff it is invisible. */
  for (const path of rules.keys()) {
    assert.ok(path.startsWith('/'),
      `"${path}" is a rule key but does not start with "/" — an unindented header?`);
  }
});

test('the security headers are on /*, not on one page', () => {
  const all = headers.get('/*');
  assert.ok(all, '_headers has no /* rule; the security headers cover nothing');
  for (const [name, value] of Object.entries(EXPECTED)) {
    assert.equal(all.get(name), value, `/* has the wrong ${name}`);
  }
  /* Set equality, not containment: a header added to /* without a note beside
     it in the file is as much a surprise as one removed. */
  assert.deepEqual([...all.keys()].sort(), Object.keys(EXPECTED).sort(),
    'the /* rule carries a different set of headers than this test names');
});

test('/* sets no Cache-Control, which would fight the no-cache rules', () => {
  /* Pages applies every matching rule. A Cache-Control on /* would collide
     with `/sw.js: no-cache` on exactly the file whose staleness is permanent. */
  assert.equal(headers.get('/*').has('Cache-Control'), false);
});

test('the shell and the updater are still no-cache', () => {
  for (const path of ['/', '/index.html', '/about.html', '/sw.js']) {
    assert.equal(headers.get(path)?.get('Cache-Control'), 'no-cache',
      `${path} lost its no-cache`);
  }
  assert.equal(headers.get('/vendor/fonts/*')?.get('Cache-Control'), 'public, max-age=604800');
});

/* --- the CSP, directive by directive ----------------------------------- */

/* Parsed off the FILE, not off the constant above: the constant is what the
   exact-value test pins, and a directive test that read it too could only ever
   agree with itself. */
const directives = new Map((headers.get('/*')?.get('Content-Security-Policy') || '').split(';').map((d) => {
  const [name, ...src] = d.trim().split(/\s+/);
  return [name, src];
}));

test("script-src names exactly one external origin, and it is the beacon's", () => {
  assert.deepEqual(directives.get('script-src').slice().sort(),
    ["'self'", "'unsafe-inline'", 'https://static.cloudflareinsights.com'].sort(),
    'script-src changed — an origin added here is an origin allowed to run code');
});

test('the escalation directives are all none', () => {
  for (const name of ['object-src', 'base-uri', 'frame-ancestors']) {
    assert.deepEqual(directives.get(name), ["'none'"], `${name} is not 'none'`);
  }
});

test('there is no default-src, deliberately', () => {
  /* Adding one would silently govern img-src, font-src, connect-src and
     manifest-src too. That can break the card offline in a gym and buys
     nothing script-src has not already bought. If a later item wants one, it
     has to delete this test and say why. */
  assert.equal(directives.has('default-src'), false);
});

/* --- the premises the policy rests on ---------------------------------- */

const htmlFiles = readdirSync(new URL('.', ROOT)).filter((f) => f.endsWith('.html'));
const html = htmlFiles.map((f) => readFileSync(new URL(f, ROOT), 'utf8')).join('\n');
const js = readdirSync(new URL('.', ROOT)).filter((f) => f.endsWith('.js'))
  .concat(['vendor/motion.mjs', 'vendor/motion.umd.js'])
  .map((f) => readFileSync(new URL(f, ROOT), 'utf8')).join('\n');

test('nothing in app/ needs what the CSP forbids', () => {
  /* Each of these is free only while it is unused. The day one is wanted, the
     policy is what breaks, and this is the line that says so. */
  for (const tag of ['<iframe', '<object', '<embed', '<base ']) {
    assert.equal(html.includes(tag), false,
      `${tag} appeared in app/ — object-src/base-uri/frame-ancestors now cost something`);
  }
});

test('the CSP allowlists every external script origin the app actually loads', () => {
  const allowed = directives.get('script-src').filter((s) => s.startsWith('https://'));
  const found = new Set([
    ...html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"/g),
    ...js.matchAll(/\.src\s*=\s*'(https?:\/\/[^']+)'/g),
  ].map((m) => new URL(m[1]).origin));
  assert.ok(found.has('https://static.cloudflareinsights.com'),
    'the beacon origin was not found — this test stopped looking where the code is');
  for (const origin of found) {
    assert.ok(allowed.includes(origin),
      `${origin} is loaded as a script but the CSP does not allow it`);
  }
});
