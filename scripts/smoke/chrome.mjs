/* Chrome launch and the DevTools protocol client. Moved out of `smoke.mjs`
   unchanged; only `launch`'s own `--headful` read moves with it as a
   parameter (`headful`), since arg parsing itself stays in `smoke.mjs`. */
import { spawn } from 'node:child_process';
import { mkdtemp, access, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ---------- Chrome ---------- */

const NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  // GitHub's ubuntu runners ship Chrome, but not always at the same path, so
  // walk PATH too rather than pinning one.
  ...NAMES.flatMap(n => (process.env.PATH || '').split(':').filter(Boolean).map(d => join(d, n))),
].filter(Boolean);

async function findChrome() {
  for (const p of CANDIDATES) {
    try { await access(p); return p; } catch { /* next */ }
  }
  throw new Error('No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.');
}

/* #235: `npm test` is also Cloudflare's build command, and that build machine
   has no Chrome. The `node --test` files that launch real Chrome ask this
   first and skip there instead of failing the production deploy. */
export const hasChrome = () => findChrome().then(() => true, () => false);

const fetchJSON = async url => JSON.parse(await (await fetch(url)).text());

/* #178 review: `onSpawn`, called the instant Chrome is spawned — before the
   DevTools poll below, which can itself take up to 45s. Without it, a caller
   that only learns `proc`/`dir` from this function's return value has nothing
   to close if a time limit or a signal lands during that poll: `smoke.mjs`'s
   watchdog used to find `liveChrome` still null in exactly that window and
   leave the just-spawned Chrome running (`test/smoke-timeout.test.js`'s
   "still booting" case). `onSpawn` hands the caller `{ proc, dir }` early
   enough to close it no matter when the limit fires. */
export async function launch(port, headful, onSpawn) {
  const bin = await findChrome();
  const dir = await mkdtemp(join(tmpdir(), 'benchcard-smoke-'));
  const proc = spawn(bin, [
    ...(headful ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--mute-audio',
    'about:blank',
  ], { stdio: 'ignore', detached: true }); // detached: closeChrome can kill the whole process group
  onSpawn?.(proc, dir);

  // Poll the DevTools endpoint rather than parsing stderr; it is the only
  // signal that the browser is actually ready to be attached to. With port 0
  // Chrome picks a free one and writes it to `DevToolsActivePort` in its
  // profile dir (first line); a fixed port is used as given (#316).
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
      const bound = port || Number((await readFile(join(dir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      const list = await fetchJSON(`http://127.0.0.1:${bound}/json/list`);
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return { proc, dir, ws: page.webSocketDebuggerUrl };
    } catch { /* not up yet */ }
    if (died) { await closeChrome(proc, dir); throw new Error(died); }
    if (Date.now() > deadline) { await closeChrome(proc, dir); throw new Error('Chrome did not expose a DevTools page in 45s'); }
    await new Promise(r => setTimeout(r, 100));
  }
}

/* #178: closes the Chrome this run itself launched — used by the watchdog
   timeout and by the SIGINT/SIGTERM handlers, so a hung or interrupted run
   still leaves nothing behind (the two orphaned Chromes the survey found,
   left over from the old perl wrapper, are what this replaces).

   Killing just the main process, with no process group, was confirmed live on
   macOS, including while Chrome was stuck on an in-flight `Runtime.evaluate`
   that never returns (the exact hang this guards against) — it brought down
   every helper, renderer, GPU, network and crashpad process within about 2s.
   Nothing here confirms the same for Linux (CI's `ubuntu-24.04`), and the
   spec's fallback for that case doesn't need a platform check to be safe on
   the one already confirmed: `launch` spawns Chrome `detached`, so it leads
   its own process group, and `process.kill(-proc.pid, sig)` (the negative pid
   is the POSIX idiom for "the whole group") reaches every helper the same way
   on both. `proc.kill(sig)` is kept as the fallback for the one case
   `process.kill` on a group can miss — Chrome exiting between the `exitCode`
   check above and the kill call, which throws ESRCH. SIGKILL is still the
   escalation if SIGTERM has not finished the job in 5s. */
export async function closeChrome(proc, dir) {
  if (proc.exitCode === null && proc.signalCode === null) {
    const kill = sig => {
      try { process.kill(-proc.pid, sig); } catch { try { proc.kill(sig); } catch { /* already gone */ } }
    };
    kill('SIGTERM');
    const exited = await new Promise(ok => {
      const t = setTimeout(() => ok(false), 5000);
      proc.once('exit', () => { clearTimeout(t); ok(true); });
    });
    if (!exited) kill('SIGKILL');
  }
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/* A minimal CDP client: send(method, params) → result, plus event handlers.

   #259: `startCoverage(onTake)` turns on V8's precise coverage in the page. V8
   drops a page's counts when the page goes away, so they are taken the moment
   before that happens, in this one place: `send` takes them ahead of every
   `Page.navigate` and `Page.reload`, and ahead of a `Runtime.evaluate` whose
   expression navigates the page itself (`location.reload()`, `location.href =`,
   see PAGE_NAVIGATES). A take asked for AFTER a navigation has begun is
   answered by the new document, so an event such as
   `Page.frameRequestedNavigation` is too late -- tried, and the old page's
   counts were gone. Each take's script entries go to `onTake` as they arrive
   (`{ url, functions }`, for `scripts/coverage.mjs`'s `folder`), so nothing is
   held here. `stopCoverage()` takes the last of it and returns what went
   wrong, for the coverage row to name:
     - `unseen`: the main frame navigated and no take had been made ahead of it
       (a click on a link, `location.pathname =`, an alternative the regex
       does not know). That page's counts are gone, so the row fails.
     - `dropped`: a take that got no reply in `takeMs` (default 10 s) and was
       given up on, so one stuck reply cannot hold every later take, and the
       run, behind it. */
const NAVIGATES = new Set(['Page.navigate', 'Page.reload']);
const PAGE_NAVIGATES = /\blocation\s*\.\s*(?:reload|assign|replace)\s*\(|\blocation(?:\s*\.\s*href)?\s*=(?!=)|\bhistory\s*\.\s*(?:back|forward|go)\s*\(/;

export function cdp(url, { takeMs = 10_000 } = {}) {
  const sock = new WebSocket(url);
  const pending = new Map();
  const handlers = new Map();
  let id = 0;
  sock.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
      for (const fn of handlers.get(msg.method) || []) fn(msg.params);
    }
  });
  const rawSend = (method, params = {}) => new Promise((ok, fail) => {
    pending.set(++id, { ok, fail });
    sock.send(JSON.stringify({ id, method, params }));
  });
  const dropped = [];
  const unseen = [];
  let onTake = null;
  let taking = false;
  let armed = 0;      // takes made ahead of a navigation that has not happened yet
  let inFlight = Promise.resolve();
  /* Takes queue one behind another, so `stopCoverage` and `send` wait for any
     take already started. A take that fails (the page is already gone) loses
     nothing that an earlier take did not already have; one that never answers
     is given up on after `takeMs` and named in `dropped`. A late reply to a
     dropped take is ignored. */
  const takeOnce = () => new Promise(done => {
    let gaveUp = false;
    const timer = setTimeout(() => {
      gaveUp = true;
      dropped.push(`Profiler.takePreciseCoverage: no reply in ${takeMs} ms`);
      done();
    }, takeMs);
    rawSend('Profiler.takePreciseCoverage').then(r => { if (!gaveUp) onTake?.(r.result); }, () => {})
      .finally(() => { clearTimeout(timer); done(); });
  });
  const take = () => (inFlight = inFlight.then(takeOnce));
  /* The tripwire: a main-frame navigation that no take was armed for. */
  const navigated = url => { if (!taking) return; if (armed > 0) armed--; else unseen.push(url); };
  sock.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Page.frameNavigated' && !msg.params.frame.parentId) navigated(msg.params.frame.url);
  });
  return {
    ready: new Promise((ok, fail) => {
      sock.addEventListener('open', ok, { once: true });
      sock.addEventListener('error', () => fail(new Error('CDP socket failed')), { once: true });
    }),
    send: async (method, params = {}) => {
      if (taking && (NAVIGATES.has(method)
        || (method === 'Runtime.evaluate' && PAGE_NAVIGATES.test(params.expression || '')))) {
        armed++;
        await take();
      }
      return rawSend(method, params);
    },
    on: (method, fn) => handlers.set(method, [...(handlers.get(method) || []), fn]),
    startCoverage: async fold => {
      onTake = fold;
      await rawSend('Page.enable');
      await rawSend('Profiler.enable');
      await rawSend('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
      taking = true;
    },
    stopCoverage: async () => {
      await take();
      taking = false;
      await rawSend('Profiler.stopPreciseCoverage').catch(() => {});
      return { dropped, unseen };
    },
    close: () => sock.close(),
  };
}
