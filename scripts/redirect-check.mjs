#!/usr/bin/env node
/* Does the service worker still work behind Cloudflare's URL rewriting?
 *
 *   node scripts/redirect-check.mjs
 *
 * `python3 -m http.server` serves exactly the paths you ask for. Cloudflare
 * Workers static assets, with `html_handling: "auto-trailing-slash"`, does not:
 * it 307s `/about.html` to `/about` and `/index.html` to `/`. So a worker that
 * is perfect in development can be broken in production, and nothing in the
 * local toolchain would ever say so.
 *
 * It bit us. `cache.addAll` follows redirects, so precaching `./about.html`
 * stored a response flagged `redirected: true`, and the spec forbids serving
 * one of those for a navigation. Safari's wording is "Response served by
 * service worker has redirections". The About link died, and — much worse —
 * so did the offline fallback, because it hands back the cached `./index.html`
 * and that was redirected too. The whole premise of the app is a gym with no
 * signal, and it had been broken there since launch.
 *
 * This server is the production one's redirect behaviour, so the failure is
 * reproducible on a laptop. Four assertions now: the first three all failed before the fix and
 * pass after it, and the fourth is the same question asked of `advanced.html`
 * (A20 slice 2), which is precached the same way and can fail the same way.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const JSON_OUT = process.argv.includes('--json');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

/* Cloudflare's `auto-trailing-slash`, as far as this app exercises it:
   - `/index.html` → 307 `/`
   - `/<name>.html` → 307 `/<name>`
   - `/<name>`      → serves `<name>.html`
   Everything else is served as asked. */
function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    // the product-event endpoint; see the note in scripts/smoke.mjs
    if (path === '/e') { res.writeHead(204).end(); return; }

    if (path === '/index.html') { res.writeHead(307, { location: '/' }).end(); return; }
    if (path.endsWith('.html')) {
      res.writeHead(307, { location: path.slice(0, -'.html'.length) }).end();
      return;
    }

    let file = path === '/' ? '/index.html' : path;
    if (!extname(file)) file += '.html';       // /about → about.html
    const abs = join(APP, file);
    if (!abs.startsWith(APP)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(abs);
      res.writeHead(200, { 'content-type': TYPES[extname(abs)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); }
  });
  /* Keep-alive sockets outlive `server.close()`, and a half-open connection is
     not the same as no network -- the offline check below needs the real
     thing, so hold them and destroy them by hand. */
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.stopHard = () => { for (const s of sockets) s.destroy(); server.close(); };
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
].filter(Boolean);

async function launch(port) {
  let bin = null;
  for (const c of CHROME) { try { await readFile(c); bin = c; break; } catch { /* next */ } }
  if (!bin) throw new Error('No Chrome found. Set CHROME_PATH.');
  const dir = await mkdtemp(join(tmpdir(), 'benchcard-redir-'));
  const proc = spawn(bin, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  /* 45s, not 20. A cold GitHub runner has taken longer than 20s to hand back a
     DevTools page, and the redirect check went red on it with nothing wrong --
     which is the worst kind of failure, because a suite that cries wolf stops
     being read. `died` separates "Chrome is slow" from "Chrome is not running",
     so a real launch failure still reports as one rather than as a timeout. */
  const deadline = Date.now() + 45_000;
  let died = null;
  proc.on('exit', (code, sig) => { died = `Chrome exited early (code ${code}, signal ${sig})`; });
  for (;;) {
    try {
      const list = JSON.parse(await (await fetch(`http://127.0.0.1:${port}/json/list`)).text());
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return { proc, dir, ws: page.webSocketDebuggerUrl };
    } catch { /* not up */ }
    if (died) { throw new Error(died); }
    if (Date.now() > deadline) { proc.kill(); throw new Error('Chrome did not expose a DevTools page in 45s'); }
    await new Promise(r => setTimeout(r, 100));
  }
}

function cdp(url) {
  const sock = new WebSocket(url);
  const pending = new Map();
  const handlers = new Map();
  let id = 0;
  sock.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { ok, fail } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? fail(new Error(m.error.message)) : ok(m.result);
    } else if (m.method) for (const fn of handlers.get(m.method) || []) fn(m.params);
  });
  return {
    ready: new Promise((ok, fail) => {
      sock.addEventListener('open', ok, { once: true });
      sock.addEventListener('error', () => fail(new Error('CDP socket failed')), { once: true });
    }),
    send: (method, params = {}) => new Promise((ok, fail) => {
      pending.set(++id, { ok, fail });
      sock.send(JSON.stringify({ id, method, params }));
    }),
    on: (method, fn) => handlers.set(method, [...(handlers.get(method) || []), fn]),
    close: () => sock.close(),
  };
}

const results = [];
const add = (name, pass, detail) => results.push({ name, pass, detail });

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const port = 9800 + Math.floor(Math.random() * 400);
const { proc, dir, ws } = await launch(port);
const c = cdp(ws);
try {
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  const evalJS = async expression =>
    (await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

  // install and let precaching finish
  await c.send('Page.navigate', { url: origin + '/' });
  await evalJS(`(async () => { await navigator.serviceWorker.ready; })()`);
  await new Promise(r => setTimeout(r, 2500));

  /* 1. Nothing redirected may sit in the cache being served as-is. This is the
        root cause; the other two are the symptoms a coach would notice. */
  const cacheState = JSON.parse(await evalJS(`(async () => {
    const names = await caches.keys();
    const out = [];
    for (const n of names) {
      const cache = await caches.open(n);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        if (res && res.redirected) out.push(new URL(req.url).pathname);
      }
    }
    return JSON.stringify(out);
  })()`));
  add('no redirected response is cached', cacheState.length === 0,
    cacheState.length ? `redirected in cache: ${cacheState.join(', ')}` : 'every precached entry is a direct 200');

  /* A real navigation, not a `fetch`. `mode: 'navigate'` cannot be constructed
     from a page at all, and this bug lives *only* in the navigation path -- a
     redirected response is perfectly legal for a subresource. Going through
     Page.navigate is the only way to reproduce what the phone did. */
  const navigate = async url => {
    const errors = [];
    const off = c.on('Page.loadEventFired', () => {});
    await c.send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 1400));
    const probe = await evalJS(`JSON.stringify({
      url: location.pathname,
      title: document.title,
      hasApp: !!document.querySelector('#view-games'),
      hasAbout: !!document.querySelector('h1'),
      text: (document.body.textContent || '').trim().slice(0, 120),
    })`);
    return probe ? JSON.parse(probe) : { failed: true, errors };
  };

  /* 2. The About link -- the failure that was reported from a phone. A
        navigation handed a redirected response is rejected outright, and the
        page that arrives is the browser's error page, not ours. */
  /* The href in the footer, verbatim. Navigating to `/about` instead would
     pass even while broken -- that path is not a cache key, so it misses the
     cache and goes to the network. The bug is reachable only through the
     precached spelling, which is exactly the one the link uses. */
  const a = await navigate(origin + '/about.html');
  const aboutOk = !a.failed && /Benchcard/.test(a.title || '');
  add('the About link loads through the worker', aboutOk,
    a.failed ? 'navigation produced no document' : `title "${a.title}"`);

  /* 3. The same question for `advanced.html`, added with the page in A20
        slice 2. It is NOT redundant with the About check: each precached HTML
        document is stored by its own `cache.addAll` entry, so `redirected:
        true` can be set on one and not the other -- and the whole point of the
        new page is that it is linkable from anywhere, which means it is the
        one a coach reaches from a search result rather than from the app.
        Navigated by its `.html` spelling for the reason above: `/advanced` is
        not a cache key, so it would go to the network and pass while broken. */
  const adv = await navigate(origin + '/advanced.html');
  const advOk = !adv.failed && /Benchcard/.test(adv.title || '');
  add('the reference page loads through the worker', advOk,
    adv.failed ? 'navigation produced no document' : `title "${adv.title}"`);

  /* 4. The offline fallback -- the actual promise of the app. A navigation to
        something never precached, with no network, must still get the shell.

        The server is killed rather than CDP's `emulateNetworkConditions`,
        which did not apply to a service-worker-intercepted navigation here:
        the request was still served, the check went green on a 404 body, and
        it was proving nothing. A dead socket is unambiguous. */
  server.stopHard();
  await new Promise(r => setTimeout(r, 300));
  const o = await navigate(origin + '/some/deep/link');
  add('offline navigation still gets the shell', !o.failed && o.hasApp === true,
    o.failed ? 'navigation produced no document' : `shell present: ${o.hasApp}, title "${o.title}"`);
} finally {
  c.close();
  proc.kill();
  try { server.stopHard(); } catch { /* already down */ }
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter(r => !r.pass);
if (JSON_OUT) {
  console.log(JSON.stringify({ checks: results, failed: failed.length }, null, 2));
} else {
  const g = s => `\x1b[32m${s}\x1b[0m`, r = s => `\x1b[31m${s}\x1b[0m`;
  console.log(`\nbenchcard redirect check — Cloudflare html_handling, ${results.length} checks\n`);
  for (const c2 of results) {
    console.log(`  ${c2.pass ? g('PASS') : r('FAIL')}  ${c2.name.padEnd(38)} ${c2.detail}`);
  }
  console.log('');
}
process.exit(failed.length ? 1 : 0);
