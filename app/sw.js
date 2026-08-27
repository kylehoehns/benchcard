/* Benchcard service worker.

   The premise of the app is a gym with no signal, so the shell has to boot
   without the network — not just the data. Everything below is precached on
   install and served cache-first; the cache name carries BOTH constants below,
   and it is SHELL — the digest of the precached bytes — that does the
   cache-busting.

   Near-omission: no runtime caching of anything not in PRECACHE, with exactly
   one named exception (LAZY, below). A cache that grows on its own is a cache
   nobody can reason about later; a cache that is PRECACHE plus one file you
   can name is still one you can reason about.

   sw.test.js checks the list against what index.html actually loads. */

/* The human-readable label, and ONLY that. It names a release in commit
   messages, in an agent brief and in the cache name a person reads out of
   devtools; it no longer carries the cache-bust on its own. Still bump it
   whenever a precached file changes -- `npm test` names it in the SHELL
   failure and `scripts/check-sw-version.mjs` enforces it across commits --
   but a forgotten bump is now a stale LABEL, not a stale SHELL. */
const VERSION = '257';

/* Fingerprint of every file PRECACHE names, and the half of the cache name
   that actually busts it. `test/sw.test.js` recomputes it from the bytes on
   disk, so a wrong value fails `npm test`; `npm test` is what Cloudflare runs
   before publishing, so a shipped SHELL is always right; a right SHELL in the
   cache name means any precached byte changing produces a NEW cache, and
   `activate` below deletes the old one. It lives HERE rather than in the test
   so that the edit updating it lands on the line below VERSION. Deleting it
   fails the suite too. */
const SHELL = 'b61d2e2dfc81';

const CACHE = `benchcard-v${VERSION}-${SHELL}`;

const PRECACHE = [
  './',
  './index.html',
  './about.html',
  './advanced.html',

  /* Render-blocking, so a cold offline boot needs all three or the shell
     paints unstyled. Order matters at load, not here. */
  './tokens.css',
  './app.css',
  './card.css',

  './app.js',
  './engine.js',
  './budget.js',
  './storage.js',
  './roster.js',
  './dom.js',
  './trap.js',
  './state.js',
  './card.js',
  './gamemode.js',
  './timeline.js',
  './pills.js',
  './rules.js',
  './strategy.js',
  './balance.js',
  './roster-view.js',
  './tour.js',
  './onboarding.js',
  './plan-view.js',
  './game-setup.js',
  './toast.js',
  './teams-view.js',
  './season-view.js',
  './render.js',
  './shortcuts.js',
  './share.js',
  './backup.js',
  './analytics.js',
  './fx.js',
  './icons.js',
  './vendor/motion.mjs',
  './vendor/motion.umd.js', // motion.mjs imports this; without it fx.js throws and app.js never runs

  './vendor/fonts/inter-latin-wght-normal.woff2',
  './site.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './card-sample.png',
  './card-sample@2x.png', // the hero's 2x density -- only a 2x device fetches it
  './wel-card.png',       // the welcome screen's "On paper" tab: the SAMPLE team's
  './wel-card@2x.png',    // card, where card-sample is about.html's eleven
  './bench-sample.png',   // the About page's bench-mode figure
];

/* The one file cached at runtime instead of on install.
 *
 * `tokens.css` splits Inter by `unicode-range`, and the latin file already
 * covers U+0000-00FF -- every Spanish, French, German and Portuguese accent a
 * roster is likely to carry. This face covers U+0100 and up: a c-with-caron,
 * an l-with-stroke, a t-with-cedilla. The browser only asks for it when a name
 * on the roster actually contains one, so precaching it pushed 74 KB to every
 * install for coverage most teams never touch.
 *
 * Not caching it at all would be worse than the bytes, though: the premise of
 * this app is a gym with no signal, and network-only would mean a roster that
 * does need these glyphs never gets them offline. So it is fetched on demand
 * and kept. After a VERSION bump the copy goes with the old cache and is
 * re-fetched next time online; until then those characters fall back to the
 * system font, per glyph, which `font-display: swap` is already doing anyway. */
const LAZY = './vendor/fonts/inter-latin-ext-wght-normal.woff2';

/* Not `cache.addAll`, and this is load-bearing.
 *
 * Cloudflare serves this app with `html_handling: "auto-trailing-slash"`, so
 * `/index.html` 307s to `/` and `/about.html` 307s to `/about`. `addAll`
 * follows redirects and stores what it lands on, flagged `redirected: true` --
 * and the spec forbids serving one of those for a *navigation*. Safari words
 * the rejection "Response served by service worker has redirections".
 *
 * That is invisible in development, because `python3 -m http.server` returns
 * exactly the path you ask for and never redirects. In production it broke the
 * About link, and it broke the offline fallback below, which hands back the
 * cached `./index.html` -- so the one thing this worker exists for, booting in
 * a gym with no signal, had been failing since launch.
 *
 * Re-wrapping the response drops the flag: `redirected` is not one of the
 * fields the Response constructor copies. Still one Promise.all, so a missing
 * file fails the install exactly as `addAll` did rather than leaving a cache
 * with a hole in it. `scripts/redirect-check.mjs` reproduces the whole thing
 * against a server that redirects the way Cloudflare does. */
async function precache(cache) {
  await Promise.all(PRECACHE.map(async (path) => {
    const res = await fetch(new Request(path, { cache: 'reload' }));
    if (!res.ok) throw new Error(`precache failed: ${path} ${res.status}`);
    await cache.put(path, res.redirected ? new Response(res.body, res) : res);
  }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(precache));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (n !== CACHE && n.startsWith('benchcard-') ? caches.delete(n) : null)));
    await self.clients.claim();
  })());
});

/* A waiting worker only takes over once every tab is gone. That is the safe
   default mid-game — but if the page asks (it does, after a reload with no
   unsaved edit in flight), hand over immediately. */
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    /* THIS GENERATION'S CACHE, never `caches.match()` on the global. That
       searches EVERY cache in the origin, and during a deploy there are two:
       the new worker installs and fills `benchcard-v<new>` while the old one
       is still activated and still controlling every open tab. A page could
       then be handed index.html from one generation and its modules from the
       other, which is an app whose markup and script disagree -- new buttons
       wired to handlers that no longer exist. Reproduced deliberately by
       serving A52's markup with A51's modules: "I'll type my roster" did
       nothing and "Start with a sample team" jumped straight to the games
       view. THIS IS A HAZARD FOUND WHILE INVESTIGATING A BUG, NOT THAT BUG'S
       CAUSE -- a blank screen was reported from a private tab, where there is
       no worker and no cache at all, so this cannot have been it. Fixed on its
       own merits.
       `activate` deletes the other caches, but activation is the thing that
       has not happened yet in the window this closes. Opening the named cache
       makes a generation self-consistent by construction. */
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    // Belt and braces: `precache` above keeps redirected responses out of the
    // cache in the first place, but anything that ever gets in here would brick
    // navigation again, and the cost of checking is a boolean.
    if (cached) return cached.redirected ? new Response(cached.body, cached) : cached;
    try {
      const res = await fetch(req);
      if (res.ok && url.pathname.endsWith(LAZY.slice(1))) await cache.put(req, res.clone());
      return res;
    } catch (err) {
      /* Offline and not precached. A navigation still gets the shell — the
         app renders from localStorage, so it is genuinely usable. */
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell.redirected ? new Response(shell.body, shell) : shell;
      }
      throw err;
    }
  })());
});
