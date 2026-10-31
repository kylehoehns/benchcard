#!/usr/bin/env node
/* The one local server. `node scripts/serve.mjs [port]`, or `npm run serve`.
 *
 * WHY THIS FILE EXISTS. There were four ways to serve `app/` locally and only
 * one of them behaved like production:
 *
 *   Cloudflare              /about.html -> 307 /about    /about -> 200
 *   python3 -m http.server  /about.html -> 200           /about -> 404
 *   scripts/smoke.mjs       /about.html -> 200           /about -> 404
 *   scripts/og.mjs          /about.html -> 200           /about -> 404
 *   scripts/redirect-check  /about.html -> 307 /about    /about -> 200
 *
 * Three of the four disagreed with the site they were serving, and the
 * disagreement was invisible: `og.mjs` had been asking its own server for
 * `/about` and getting a 404 for months, which nothing noticed because the
 * next line replaced the document wholesale. `AGENTS.md`, `README.md` and
 * `docs/operations.md` each documented the python one, at two different ports.
 *
 * So this is the redirect-aware server, lifted out of `redirect-check.mjs`
 * where it was already correct, and it is now the only one. `smoke.mjs:58`
 * states the rule it exists for: dev behaves like prod, or the checks are
 * measuring the wrong thing.
 *
 * Cloudflare's `html_handling: "auto-trailing-slash"`, as far as this app
 * exercises it:
 *   - `/index.html` -> 307 `/`
 *   - `/<name>.html` -> 307 `/<name>`
 *   - `/<name>`      -> serves `<name>.html`
 * Everything else is served as asked, and a path with no file answers 404 with
 * `404.html`, as `not_found_handling: "404-page"` does.
 *
 * One difference from the files on disk, on purpose: `.css` is served with its
 * comments stripped by `scripts/build.mjs`'s `stripCssComments`, the same
 * function the deploy build uses (#339), so smoke runs against what ships.
 * `/sw.js` is the other: its SHELL is stamped the way the build stamps it
 * (AGENTS.md § Deploy), so a local run matches a deploy. */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCssComments, precachedFiles, shellDigest, stampShell } from './build.mjs';

const APP = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'app');

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

/* The bytes the server sends for `file` ('/x' form): CSS stripped, the rest as
   on disk. */
async function served(file, appDir = APP) {
  const body = await readFile(join(appDir, file));
  return extname(file) === '.css' ? stripCssComments(body.toString('utf8')) : body;
}

/* sw.js as a deploy would ship it: SHELL stamped from the files this server
   would send, computed per request so an edit shows on the next fetch. */
async function stampedSw(appDir) {
  const source = await readFile(join(appDir, 'sw.js'), 'utf8');
  const paths = precachedFiles(source);
  const bodies = await Promise.all(paths.map(p => served(p.slice(1), appDir)));
  const files = new Map(paths.map((p, i) => [p, bodies[i]]));
  return stampShell(source, shellDigest(p => files.get(p), source));
}

/* `port` defaults to 0 -- an ephemeral port, which is what the three harnesses
   want so parallel runs cannot collide. Pass one for a human. `appDir` is for
   tests that serve a doctored copy of `app/`. */
export function serve(port = 0, appDir = APP) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    /* The product-event endpoint. In production this is the Worker in
       src/index.js; here it just has to exist, because the app POSTs to it on
       a cold load and a 404 would surface as a console error -- a harness
       going red about the absence of a server it was never running. */
    if (path === '/e') { res.writeHead(204).end(); return; }

    /* The Cloudflare beacon's report, which analytics.js points at this
       origin. Cloudflare answers it at the edge (204); locally a 404 here
       would be a console error about a server nobody was running. */
    if (path === '/cdn-cgi/rum') { res.writeHead(204).end(); return; }

    if (path === '/index.html') { res.writeHead(307, { location: '/' }).end(); return; }
    if (path.endsWith('.html')) {
      res.writeHead(307, { location: path.slice(0, -'.html'.length) }).end();
      return;
    }

    let file = path === '/' ? '/index.html' : path;
    if (!extname(file)) file += '.html';       // /about -> about.html
    const abs = join(appDir, file);
    if (!abs.startsWith(appDir)) { res.writeHead(403).end(); return; }
    try {
      if (file === '/sw.js') {
        let sw;
        try { sw = await stampedSw(appDir); } catch (err) {
          console.error(err);
          res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err.message));
          return;
        }
        res.writeHead(200, { 'content-type': TYPES['.js'] }).end(sw);
        return;
      }
      /* Cloudflare's file names are case-sensitive; a Mac's disk is not, and
         `/ABOUT` would find about.html here and 200 where production 404s. */
      if (!(await readdir(dirname(abs))).includes(basename(abs))) throw new Error('no such file');
      const body = await served(file, appDir);
      res.writeHead(200, { 'content-type': TYPES[extname(abs)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      /* A miss is Cloudflare's `not_found_handling: "404-page"`: the nearest
         404.html, with status 404. Plain text only when this copy of app/ has
         none (a doctored test copy). */
      try {
        const page = await served('/404.html', appDir);
        res.writeHead(404, { 'content-type': TYPES['.html'] }).end(page);
      } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); }
    }
  });
  /* Keep-alive sockets outlive `server.close()`, and a half-open connection is
     not the same as no network -- redirect-check's offline arms need the real
     thing, so hold them and destroy them by hand. */
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.stopHard = () => { for (const s of sockets) s.destroy(); server.close(); };
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

/* Run directly: serve on 8201 and say so. Imported: just the function. */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.argv[2]) || 8201;
  const server = await serve(port);
  const { port: actual } = server.address();
  console.log(`benchcard: serving app/ on http://localhost:${actual}`);
  console.log('redirects like Cloudflare does — /about.html 307s to /about');
}
