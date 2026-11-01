/* Chrome launch and the DevTools protocol client. Moved out of `smoke.mjs`;
   `launch`'s own `--headful` read became a parameter (`headful`), since arg
   parsing stays in `smoke.mjs`, and #510 added `reapOrphans`. */
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, access, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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

const DIR_RE = /^benchcard-smoke-(\d+)-[A-Za-z0-9]+$/;
const pidAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

function psList() {
  return new Promise((ok, fail) => {
    execFile('ps', ['-A', '-ww', '-o', 'pid=,ppid=,pgid=,command='], { maxBuffer: 64 << 20 }, (err, out) => {
      if (err) return fail(err);
      ok(String(out).split('\n').map(l => l.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
        .map(m => ({ pid: +m[1], ppid: +m[2], pgid: +m[3], command: m[4] })));
    });
  });
}

/* True if `command` carries the token `--user-data-dir=<dir>` followed by
   whitespace or the end, so `...-abc123` never matches `...-abc1234`, and a
   process that merely mentions the path (`ls <dir>`, `tail -f <dir>/x`) is not
   taken for the dir's Chrome. */
function owns(command, dir) {
  const token = `--user-data-dir=${dir}`;
  for (let i = command.indexOf(token); i !== -1; i = command.indexOf(token, i + 1)) {
    if (/\s|^$/.test(command[i + token.length] ?? '')) return true;
  }
  return false;
}

/* Walk the ppid chain (in one ps snapshot) from `p` looking for `ownerPid`.
   Capped, so a cycle or a very long chain cannot hang the sweep. */
function descendsFrom(p, ownerPid, byPid) {
  for (let n = 0, cur = p; cur && n < 64; n++, cur = byPid.get(cur.ppid)) {
    if (cur.ppid === ownerPid) return true;
  }
  return false;
}

/* #510: a Chrome whose owner node process was SIGKILLed has no handler to
   close it (closeChrome only runs from code in the owner), so the next
   `launch()` reaps it. The owner's PID is in the profile dir's name
   (`benchcard-smoke-<ownerPid>-XXXXXX`, made atomically by mkdtemp), rather
   than in a PID file written after spawn, which an owner killed in between
   would never write. Chromes are found by command line (every process of one
   carries the token `--user-data-dir=<dir>`), so a reused PID that names nothing is never
   killed. "Owner alive" is judged by parentage, not by kill(pid, 0) alone: while
   the owner lives it is an ancestor of the Chrome (its parent, or further up
   when a launcher forks instead of exec'ing); once it dies Chrome is
   reparented, so an owner PID reused by something unrelated protects nothing.
   #514: the dir's last writer can outlive the 2s wait above (a dying Chrome under
   load), so the rm retries ENOTEMPTY/EBUSY (up to ~5.5s of backoff) instead of
   leaving the dir behind; the wait itself is not raised. A dir that stays stuck
   costs launch() that ~5.5s once, which beats a dir left behind silently.
   Never throws: a failed sweep must not fail a launch. Returns
   `{ reaped, kept }` (dir paths) for the tests. */
export async function reapOrphans(root) {
  const result = { reaped: [], kept: [] };
  try {
    const found = (await readdir(root)).map(n => DIR_RE.exec(n)).filter(Boolean);
    if (!found.length) return result;
    const procs = await psList();
    const byPid = new Map(procs.map(p => [p.pid, p]));
    const ownGroup = byPid.get(process.pid)?.pgid;
    for (const [name, owner] of found) {
      try {
        const dir = join(root, name);
        const ownerPid = Number(owner);
        const mine = procs.filter(p => owns(p.command, dir));
        if (mine.some(p => descendsFrom(p, ownerPid, byPid)) || (!mine.length && pidAlive(ownerPid))) {
          result.kept.push(dir);
          continue;
        }
        for (const g of new Set(mine.map(p => p.pgid))) {
          if (g > 1 && g !== ownGroup) { try { process.kill(-g, 'SIGKILL'); } catch { /* gone */ } }
        }
        for (const end = Date.now() + 2000; Date.now() < end && mine.some(p => pidAlive(p.pid)); ) await sleep(50);
        await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        result.reaped.push(dir);
      } catch { /* leave this one; try the rest */ }
    }
  } catch { /* never fail a launch */ }
  return result;
}

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
  await reapOrphans(tmpdir());
  const dir = await mkdtemp(join(tmpdir(), `benchcard-smoke-${process.pid}-`));
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
    off: (method, fn) => handlers.set(method, (handlers.get(method) || []).filter(h => h !== fn)),
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
