#!/usr/bin/env node
/* Benchcard smoke harness.

   Every polish iteration was hand-rolling the same four browser checks — no
   horizontal overflow at 390px, the card is still 3.45 × 5in, no console
   errors, every touch target ≥44px — plus `node --test`. This runs all of it
   in one call and prints a pass/fail table. It now also carries the
   accessibility checks and the performance budget (see `budgets.mjs`).

       node scripts/smoke.mjs                  # serve app/, drive Chrome, run tests
       node scripts/smoke.mjs --no-tests       # browser checks only (fast)
       node scripts/smoke.mjs --headful        # watch it happen
       node scripts/smoke.mjs --json           # machine-readable, for CI
       node scripts/smoke.mjs --update-budgets # re-record scripts/budgets.json

   No dependencies, deliberately: this repo has none and adding Playwright to
   get four assertions would be the tail wagging the dog. Chrome is driven over
   the DevTools protocol through node's built-in WebSocket.

   It serves `app/` itself on an ephemeral port, which also sidesteps the trap
   that eats iterations by hand: a stale service worker on :8201 serving code
   you already changed. A fresh port is a virgin origin every run. */

import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, summarize } from './budgets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const args = process.argv.slice(2);
const has = f => args.includes(f);
const JSON_OUT = has('--json');
const WIDTH = 390, HEIGHT = 844;

/* ---------- a static server for app/ ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let path = decodeURIComponent(url.pathname);
    /* The product-event endpoint. In production this is the Worker in
       src/index.js; here it just has to exist, because the app now POSTs to it
       on a cold load and a 404 would surface as a console error -- the harness
       would be red about the absence of a server it was never running. Same
       principle as scripts/redirect-check.mjs: dev behaves like prod, or the
       checks are measuring the wrong thing. */
    if (path === '/e') { res.writeHead(204).end(); return; }
    if (path.endsWith('/')) path += 'index.html';
    const file = join(APP, path);
    if (!file.startsWith(APP)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

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

const fetchJSON = async url => JSON.parse(await (await fetch(url)).text());

async function launch(port) {
  const bin = await findChrome();
  const dir = await mkdtemp(join(tmpdir(), 'benchcard-smoke-'));
  const proc = spawn(bin, [
    ...(has('--headful') ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--mute-audio',
    'about:blank',
  ], { stdio: 'ignore' });

  // Poll the DevTools endpoint rather than parsing stderr; it is the only
  // signal that the browser is actually ready to be attached to.
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
      const list = await fetchJSON(`http://127.0.0.1:${port}/json/list`);
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return { proc, dir, ws: page.webSocketDebuggerUrl };
    } catch { /* not up yet */ }
    if (died) { throw new Error(died); }
    if (Date.now() > deadline) { proc.kill(); throw new Error('Chrome did not expose a DevTools page in 45s'); }
    await new Promise(r => setTimeout(r, 100));
  }
}

/* A minimal CDP client: send(method, params) → result, plus event handlers. */
function cdp(url) {
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

/* ---------- the roster the harness plans with ---------- */

/* 11 players at 4×8 with subs every 4 minutes: the realistic case the rules
   ask every check to use, not a three-kid toy. Written straight to the storage
   key so the app boots with a plan already on screen — `sanitize` fills in
   every field left out here. */
const PLAYERS = [
  ['Marcus Williams', '4'], ['Devon Ellis', '7'], ['Hana Kim', '9'], ['Eli Tran', '12'],
  ['Ana Reyes', '3'], ['Jordan Bell', '21'], ['Sam Okafor', '5'], ['Riley Novak', '8'],
  ['Casey Lindqvist', '11'], ['Theo Alvarez', '15'], ['Nia Brooks', '2'],
].map(([name, number], i) => ({ id: 'p' + i, name, number, shortName: '' }));

const UI = {
  // cardOpen: below 1100px the card preview is folded behind a disclosure by
  // default, and a folded card measures 0×0 -- the size check would be
  // guarding nothing. Opened here so the check sees a laid-out card, which is
  // the state it exists to police.
  copies: 2, showMinutes: true, printScope: 'game', cardId: 'short',
  cardSize: 'pocket', theme: 'light', cardOpen: true,
};

/* THE LEAN FIXTURE. One team, one game, no filed season, every player on the
   default level. This is the ONLY state the cold load ever sees, and therefore
   the only state the byte/node/request budget is measured against — see the
   split below for why that matters.

   It stays on `benchcard.v3`, deliberately. That key is the returning coach
   with an old record on their phone, `sanitize` is shape-driven so reading it
   is the migration, and moving this to v6 would move the recorded node
   baseline for a reason that has nothing to do with the app. The rich fixture
   below is on v6, so each schema branch is exercised by exactly one fixture
   rather than neither being exercised on purpose. */
const SEED = {
  version: 3, onboarded: true, tourSeen: true, teamName: 'Smoke Test',
  players: PLAYERS,
  day: { name: 'Saturday', games: [{ id: 'g0', label: 'Hawks', when: '9:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 }] },
  activeGame: 0, view: 'games',
  ui: UI,
};

/* ---------- THE RICH FIXTURE ----------
 *
 * WHY THERE ARE TWO. Every horizontal-pan and touch-target defect the UX swarm
 * found lives in a state the lean fixture structurally cannot enter, and the
 * harness printed 18 PASS / 0 FAIL with all of them present. The old comments
 * in this file said the season had no filed games because seeding them "would
 * cost more cold-load nodes than the budget has slack" — which was true, and
 * was the wrong trade, because it was one fixture serving two measurements
 * that want opposite things. The budget wants the LEANEST honest cold load;
 * the a11y, overflow and touch passes want the RICHEST honest screen.
 *
 * So they get one each. `report.payload` is snapshotted before any state is
 * driven (see `browserChecks`), and this record is written and reloaded after
 * that line. The cost to the budget is zero by construction, not by estimate.
 *
 * EVERY FACT SEEDED HERE NAMES THE WRONG ANSWER IT MAKES VISIBLE. A fixture
 * can make a guard unfalsifiable — A27's pinning tests could not fail until
 * the fixture grew a player who was at a game and played none of it — so
 * nothing is in here for realism's sake:
 *
 *   - `tier` 5 on Hana and 1 on Nia. `levelledCount()` goes truthy, so
 *     `roster-view.js` renders "Put everyone back to the same level". That one
 *     button is the whole of the roster's 208px pan at 320px/200% text; with
 *     every player on the default level it does not exist and the pan reads
 *     clean.
 *   - A SECOND GAME in the day. Under two games `renderDayTotals` returns
 *     early with a one-line "Tournament?" prompt; at two it renders a bar per
 *     player, a legend and a second game tab. A day-totals row that overflows
 *     is invisible to a fixture with one game.
 *   - THREE FILED SEASON GAMES. Without them the Season view is an empty
 *     state: no totals rows, no `details.sn-game` folds, nothing to pan. The
 *     measured pan there is 132px, not the 11px an empty ledger reports.
 *   - NIA AT THE THIRD GAME WITH ZERO MINUTES (`p10: 0`). "Played none of it"
 *     and "was not there" are only distinguishable in a record that contains
 *     one of each — that is the fixture hole A27 was shipped through.
 *
 * v6, and the current schema on purpose: `smoke.mjs` seeded v3 while
 * `storage.js` was on v6, so every run exercised the migration branch and
 * nothing exercised the branch a coach on this build actually uses. v6 wins
 * the read order in `loadState`, so the v3 write that still fires on every new
 * document is inert once this is in place. */
const RICH = {
  version: 6, onboarded: true, tourSeen: true, activeTeam: 0, view: 'games',
  ui: UI,
  teams: [{
    id: 't0', name: 'Smoke Test',
    players: PLAYERS.map(p => ({
      ...p,
      tier: p.id === 'p2' ? 5 : p.id === 'p10' ? 1 : 3,
    })),
    day: {
      name: 'Saturday',
      games: [
        { id: 'g0', label: 'Hawks', when: '9:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 },
        { id: 'g1', label: 'Ravens', when: '11:30', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 5678 },
      ],
    },
    activeGame: 0,
    /* Three Saturdays, uneven on purpose: a ledger where everyone has the same
       total sorts arbitrarily and would hide a sort bug (A24a). Nia (`p10`) is
       AT the third game on zero minutes and ABSENT from the second — the two
       cases the CSV and the ledger must not conflate. */
    season: {
      games: [
        { id: 's1', date: '2026-07-11', day: 'Saturday', opponent: 'Comets', periods: 4, periodMinutes: 8,
          minutes: { p0: 16, p1: 14.5, p2: 18, p3: 12, p4: 15, p5: 13.5, p6: 16, p7: 11, p8: 14, p9: 17, p10: 12.5 } },
        { id: 's2', date: '2026-07-18', day: 'Saturday', opponent: 'Falcons', periods: 4, periodMinutes: 8,
          minutes: { p0: 15, p1: 16, p2: 19.5, p3: 13, p4: 12, p5: 17, p6: 14, p7: 15.5, p8: 13 } },
        { id: 's3', date: '2026-08-01', day: 'Saturday', opponent: 'Wolves', periods: 4, periodMinutes: 8,
          minutes: { p0: 14, p1: 15, p2: 20, p3: 11.5, p4: 16, p5: 12, p6: 18, p7: 13, p8: 15, p9: 14.5, p10: 0 } },
      ],
    },
  }],
};

/* Swap the lean fixture for the rich one and reload. Called exactly once, from
   `browserChecks`, immediately after the payload snapshot. The reload is
   required rather than tidy: `loadState` runs at boot and nothing re-reads
   localStorage afterwards. */
async function goRich(c, origin) {
  await evalIn(c, `(() => {
    localStorage.removeItem('benchcard.v3');
    localStorage.removeItem('benchcard.v6.bak');
    localStorage.setItem('benchcard.v6', ${JSON.stringify(JSON.stringify(RICH))});
    return 1;
  })()`);
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Page.navigate', { url: origin + '/index.html' });
  await loaded;
  await evalIn(c, `(async () => { await document.fonts.ready;
    for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
    await ${SETTLE}; })()`);
}

/* A fixture is not a guard until something fails when it does not arrive.
 *
 * Without this check, a renamed storage key, a record `sanitize` rejects or a
 * reload that raced the settle would drop the whole run back onto the lean
 * state — and every pass below would go green while auditing exactly the
 * screens this item exists to stop auditing. That is not a hypothetical: the
 * green run with five live defects in it is what put this item in the queue.
 *
 * So it asserts the three preconditions REACHED THE DOM, one per defect class,
 * by the same route a coach would see them. It does not assert on
 * localStorage: that would prove the write, which was never the doubtful
 * part. */
async function fixturePass(c) {
  const probe = await evalIn(c, `(async () => {
    const $ = s => document.querySelector(s);
    const out = { host: location.host };
    $('#viewnav [data-view="team"]').click();
    await ${SETTLE};
    out.resetLevels = [...document.querySelectorAll('#view-team button')]
      .filter(b => /back to the same level/i.test(b.textContent)).length;
    $('#viewnav [data-view="games"]').click();
    await ${SETTLE};
    out.dayRows = document.querySelectorAll('#daytotals .dayrow').length;
    out.dayGames = document.querySelectorAll('#daytotals .legend span').length;
    $('#viewnav [data-view="season"]').click();
    await ${SETTLE};
    out.filedGames = document.querySelectorAll('#view-season details.sn-game').length;
    $('#viewnav [data-view="games"]').click();
    await ${SETTLE};
    return JSON.stringify(out);
  })()`);
  const r = JSON.parse(probe);
  const missing = [
    r.resetLevels >= 1 ? null : 'no "back to the same level" button — no player is off the default level',
    r.dayGames >= 2 ? null : `day legend names ${r.dayGames} game(s), want ≥ 2`,
    r.dayRows >= 11 ? null : `day totals has ${r.dayRows} row(s), want 11`,
    r.filedGames >= 3 ? null : `${r.filedGames} filed game(s) in the ledger, want 3`,
  ].filter(Boolean);
  return {
    name: 'rich fixture is live',
    pass: missing.length === 0,
    detail: missing.length
      ? `${missing.length} precondition(s) missing on ${r.host}: ${missing.join('; ')}`
      : `${r.dayRows} players × ${r.dayGames} games today, ${r.filedGames} filed, `
        + `levels set (${r.host})`,
  };
}

/* ---------- the states the first pass never sees ----------

   `smoke-checks.js` audits whatever is on screen, and what is on screen when
   the app boots is one screen: 54 controls. Counting the ones inside closed
   dialogs and overlays finds three times that. Help, the shortcuts
   sheet, game mode and the tour were never checked by anything.

   So: open each state, re-run the same file, keep only its accessibility
   verdicts. Written here rather than in `smoke-checks.js` on purpose — that
   file stays one paste-able expression that audits "now", and knowing how to
   drive this particular app is the harness's job.

   `open`/`close` are statements evaluated in the page with `$` in scope, and
   `shows` is the element that proves the state actually arrived: without it a
   renamed button would silently audit the opening screen twelve times and
   still report green. Everything is driven through the real trigger where one
   exists; `forced` marks the states that have no reachable trigger (the
   welcome screen needs a fresh install) and are shown by hand, which covers
   their static markup. */
const STATES = [
  { name: 'team view',
    open: `$('#viewnav [data-view="team"]').click()`, shows: '#view-team',
    close: `$('#viewnav [data-view="games"]').click()` },
  { name: 'team + bulk add',
    open: `$('#viewnav [data-view="team"]').click(); $('#bulktoggle').click()`, shows: '#bulkwrap',
    close: `$('#bulktoggle').click(); $('#viewnav [data-view="games"]').click()` },
  { name: 'games view, every disclosure open',
    open: `for (const d of document.querySelectorAll('details')) d.open = true`, shows: '#squadFold[open]',
    close: `for (const d of document.querySelectorAll('details')) d.open = false` },
  { name: 'season view',
    open: `$('#viewnav [data-view="season"]').click()`, shows: '#view-season',
    close: `$('#viewnav [data-view="games"]').click()` },
  /* No `season view, every game open` state, deliberately: the harness's record
     has a day but no FILED games, so the ledger has no folds to open, and
     seeding four of them would put ~250 nodes on a cold load that is budgeted
     to 40 of slack. The rows inside a game block are the same `.sn-row` markup
     as the totals list above them, which this state does measure. */
  { name: 'settings view',
    open: `$('#settingsBtn').click()`, shows: '#view-settings',
    close: `$('#viewnav [data-view="games"]').click()` },
  { name: 'settings view, paste box open',
    open: `$('#settingsBtn').click(); $('#view-settings .paste-open').click()`,
    shows: '#view-settings .pastebox',
    // not through `.paste-go`: an empty textarea is a rejected restore, which
    // leaves the box open and the state uncloseable
    close: `$('#view-settings .pastebox').hidden = true;
            $('#view-settings .paste-open').hidden = false;
            $('#viewnav [data-view="games"]').click()` },
  /* `?` and the theme toggle left the top bar for Settings, so these three no
     longer reach `#helpBtn` from the opening screen. Clicking a button inside a
     hidden view still fires its handler, so leaving them alone would have kept
     every one of them green while auditing a control no coach could reach --
     a check passing for the wrong reason. The cog comes first now. */
  { name: 'help sheet',
    open: `$('#settingsBtn').click(); $('#helpBtn').click()`, shows: '#help',
    close: `$('#helpClose').click(); $('#viewnav [data-view="games"]').click()` },
  { name: 'shortcuts sheet',
    open: `$('#keysHint').click()`, shows: '#keys', close: `$('#keysClose').click()` },
  /* The tour puts itself on the games view before it points at anything
     (`startTour`), so it closes back onto games without help. */
  { name: 'tour, first step',
    open: `$('#settingsBtn').click(); $('#helpBtn').click(); $('#helpTour').click()`,
    shows: '#tour', close: `$('#tourSkip').click()` },
  { name: 'tour, last step',
    open: `$('#settingsBtn').click(); $('#helpBtn').click(); $('#helpTour').click();
           while (!$('#tourSkip').hidden) $('#tourNext').click()`,
    shows: '#tour', close: `$('#tourNext').click()` },
  { name: 'game mode',
    open: `$('#gmOpen').click()`, shows: '#gamemode', close: `$('#gmClose').click()` },
  { name: 'game mode, swap picker',
    open: `$('#gmOpen').click(); $('#gmFloor .gm-p').click()`, shows: '#gamemode .gm-p.picked',
    close: `$('#gmClose').click()` },
  { name: 'welcome screen', forced: true,
    open: `$('#view-welcome').hidden = false`, shows: '#view-welcome',
    close: `$('#view-welcome').hidden = true` },
];

/* Only the verdicts that are about the DOM in front of you. The card size and
   the payload budget are properties of the app, not of the state it is in.

   The dialog check is here rather than only in the first pass because the
   first pass has no dialog open: it is exactly the check that has to run once
   per overlay, and running it in every state is what makes it cover the
   dialogs nobody has written yet. */
const A11Y = new Set([
  'controls have accessible names',
  'images declare alt text',
  'ids unique, aria references resolve',
  'document lang, title, tab order',
  'last control in an open dialog is reachable',
]);

/* Evaluate in the page and throw the page's own error, rather than letting a
   typo in a selector come back as a silent `undefined`. */
async function evalIn(c, expression) {
  const { result, exceptionDetails } = await c.send('Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  }
  return result.value;
}

/* Wait until nothing is animating. `fx.js` fades controls in from opacity 0
   and `smoke-checks.js` skips anything at opacity 0, so a page measured
   mid-entrance is audited for whichever controls happened to have arrived:
   three runs of the unchanged app counted 54, 57 and 58 of them. The timeline
   skeleton shimmers forever, so infinite animations are excluded — and the
   whole wait is capped, because a harness that hangs is worse than one that
   measures early. */
const SETTLE = `(async () => {
  const running = () => document.getAnimations().filter(a => {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return a.playState === 'running' && t && t.iterations !== Infinity;
  }).length;
  const cap = Date.now() + 3000;
  // two consecutive quiet samples: one is not enough, since fx.js starts the
  // next element's animation on the frame after the last one finished
  for (let quiet = 0; quiet < 2 && Date.now() < cap; ) {
    quiet = running() ? 0 : quiet + 1;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
})()`;

const step = js => `(async () => { const $ = s => document.querySelector(s); ${js};
  await ${SETTLE}; })()`;

async function overlayPass(c, source) {
  const problems = [];
  const visited = [];
  let widest = 0;
  for (const s of STATES) {
    try {
      await evalIn(c, step(s.open));
      const up = await evalIn(c, `(() => { const el = document.querySelector(${JSON.stringify(s.shows)});
        return !!el && !el.hidden && el.getClientRects().length > 0; })()`);
      if (!up) { problems.push(`${s.name}: never opened (${s.shows})`); continue; }
      visited.push(s.name);
      for (const chk of (await evalIn(c, source)).checks) {
        if (!A11Y.has(chk.name)) continue;
        if (!chk.pass) problems.push(`${s.name} — ${chk.name}: ${chk.detail}`);
        const n = chk.name === 'controls have accessible names'
          && (chk.detail.match(/(\d+) controls/) || chk.detail.match(/\/(\d+) unnamed/));
        if (n) widest = Math.max(widest, Number(n[1]));
      }
    } catch (e) {
      problems.push(`${s.name}: ${e.message.split('\n')[0]}`);
    } finally {
      await evalIn(c, step(s.close)).catch(e => problems.push(`${s.name}: did not close — ${e.message.split('\n')[0]}`));
    }
  }
  const forced = STATES.filter(s => s.forced).length;
  return {
    name: 'a11y in overlays and dialogs',
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${visited.length}/${STATES.length} states (${forced} shown by hand), `
        + `${widest} controls at the widest, all named and resolving`,
  };
}

/* ---------- the run ---------- */

/* The chrome has to survive the narrowest phone anyone still carries.
 *
 * This exists because it did not. The top bar had a hard floor of 378px --
 * brand, the Games/Roster nav, two icon buttons and a labelled Print -- so an
 * iPhone SE or a 13 mini at 375px could pan the entire app sideways, and so
 * could a 390px phone the moment its owner raised the system text size. Every
 * check here was green throughout, because the harness only ever renders at
 * 390 and the bar fits at 390.
 *
 * `scrollWidth` is not the question at narrow widths any more -- the root
 * carries `overflow-x: clip` as a backstop, under which `scrollWidth` still
 * reports the content size while scrolling is impossible. So this asks the
 * only thing a coach would notice: can the page actually be panned. It also
 * reports what stuck out, because "cannot pan" with content clipped off the
 * edge would be a different bug wearing the same green tick.
 */
/* 360, not 320. The narrowest phone in real use is a small Android at 360 and
   an iPhone SE 2/3 at 375; 320 is a 2016 SE. Claiming a floor the chrome cannot
   actually hold would mean either a permanently red check or five controls
   squeezed under the 44px touch minimum, and the second is worse than the bug
   this exists to catch. */
const NARROW = 360;
async function narrowPass(c) {
  const before = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__SMOKE_VIEWPORT || [390, 844])', returnByValue: true,
  });
  const [w0, h0] = JSON.parse(before.result.value);
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: NARROW, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));

  const probe = await c.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const vw = document.documentElement.clientWidth;
      const x0 = window.scrollX;
      window.scrollTo(80, window.scrollY);
      const pans = window.scrollX !== x0;
      window.scrollTo(x0, window.scrollY);
      const bar = document.querySelector('.bar');
      const spill = [];
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        /* BOTH edges. scrollWidth and a right-edge test are blind to content
           hanging off the LEFT of the viewport -- measured, the Games tab does
           exactly that -- and a coach cannot reach it in either direction. */
        const over = r.right > vw + 1 ? Math.round(r.right) : r.left < -1 ? Math.round(r.left) : null;
        if (over !== null && !spill.some(s => s.el.contains(el))) spill.push({ el, right: over });
      }
      return JSON.stringify({
        vw, pans,
        barFits: bar ? bar.scrollWidth <= vw + 1 : true,
        barW: bar ? bar.scrollWidth : 0,
        // anything wider than the screen must scroll inside its own box
        stranded: spill
          .filter(s => { let n = s.el; while (n && n !== document.body) { if (n.scrollWidth > n.clientWidth + 1) return false; n = n.parentElement; } return true; })
          .map(s => (s.el.tagName.toLowerCase() + (s.el.id ? '#' + s.el.id : '')) + ' → ' + s.right + 'px')
          .slice(0, 4),
      });
    })()`,
  });
  const r = JSON.parse(probe.result.value);

  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r2 => setTimeout(r2, 300));

  const pass = !r.pans && r.barFits && r.stranded.length === 0;
  return {
    name: `no sideways pan at ${NARROW}px`,
    pass,
    detail: pass
      ? `page cannot pan, top bar fits in ${r.barW}px, nothing stranded`
      : [
          r.pans ? 'page pans sideways' : null,
          r.barFits ? null : `top bar needs ${r.barW}px`,
          r.stranded.length ? `stranded off-screen: ${r.stranded.join(', ')}` : null,
        ].filter(Boolean).join('; '),
  };
}

/* A range, not a point — because a point is how this shipped twice.
 *
 * The bar overflowed at 375px, was fixed, and came back at 305–341px: the
 * narrowing stages left a band between where the bar's intrinsic floor sat and
 * where the last stage started. Both times the harness was green, for the same
 * reason both times — it measured one width somebody had thought to name (390,
 * then 360), and a floor is not a width you can guess. So this sweeps every
 * width in the band a phone can actually be and asserts the only thing that
 * matters at all of them: the document is no wider than the window.
 *
 * Both views, because the Games and Roster chrome differ and only one of them
 * has to be wrong.
 *
 * What it asserts is *not* `documentElement.scrollWidth <= innerWidth`, which
 * is the obvious thing and is worthless here: `overflow-x: clip` on the root
 * clamps that number to the viewport, so it reads green at every width even
 * with Print hanging 21px past the edge — measured, that is exactly what it
 * did against the bug this was written to catch. Clip removes the panning and
 * leaves the content out of reach, which is the same bug with its symptom
 * deleted. So the assertion is the one thing clip cannot hide: no element's
 * right edge past the viewport unless it sits in a box that scrolls sideways
 * on purpose (the game tabs). On failure it names the widths and the element,
 * so the next person gets the number instead of a hunt.
 *
 * SWEEP_FLOOR is the claim: every width from here to SWEEP_HI is clean. It is
 * 300 because that is comfortably under the narrowest phone anyone carries (an
 * iPhone SE 1st gen is 320), not because 300 is where the app gives out —
 * measured with the floor dropped to 240, it is clean from 252px up, and what
 * fails below that is an unlabelled span in the games view, not the chrome.
 * So there is ~48px of headroom under the claim, deliberately: a check pinned
 * to the exact limit goes red on any harmless change and stops being read.
 * Raise SWEEP_FLOOR only against a measured floor that genuinely cannot be
 * crossed without breaking something worse (the 44px touch minimum is the one
 * that has been traded away before) — and write the reason down here. */
const SWEEP_FLOOR = 300, SWEEP_HI = 420;
/* Every view the chrome can be in, and the click that gets there. Settings has
   no nav button -- it is behind the cog -- so the opener is per view rather
   than derived from `data-view`: a list of names alone would have swept three
   views and silently skipped the fourth, which is the shape of the bug this
   whole sweep exists to catch. */
const VIEWS = [
  { name: 'games', open: `document.querySelector('#viewnav button[data-view="games"]').click()` },
  { name: 'team', open: `document.querySelector('#viewnav button[data-view="team"]').click()` },
  { name: 'season', open: `document.querySelector('#viewnav button[data-view="season"]').click()` },
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
];
async function sweepPass(c) {
  const before = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__SMOKE_VIEWPORT || [390, 844])', returnByValue: true,
  });
  const [w0, h0] = JSON.parse(before.result.value);

  /* Two frames at each width: one for the media queries to apply, one for the
     layout they cause. Cheaper than a fixed sleep and stricter than one. The
     whole walk happens in the page, so a sweep is one round trip per width. */
  const measure = async () => {
    const { result } = await c.send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => {
        const vw = document.documentElement.clientWidth; let worst = null;
        for (const el of document.body.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          /* Both edges: see the note in narrowPass. A right-edge-only test
             cannot see the Games tab hanging off the left, and neither can
             scrollWidth, which is why that one went unmeasured in every
             state. "over" is the edge that is out of reach, signed. */
          const over = r.right > vw + 1 ? Math.round(r.right) : r.left < -1 ? Math.round(r.left) : null;
          if (over === null) continue;
          /* An ancestor only excuses the overflow if it actually scrolls --
             overflow-x auto or scroll, i.e. the game tabs. Testing scrollWidth
             alone excuses it whenever the *parent* overflows too, which is
             exactly the case here: the bar is over-wide, so every child of an
             over-wide bar looks innocent and the check reads green. */
          let n = el.parentElement, scrolls = false;
          while (n && n !== document.body) {
            const ov = getComputedStyle(n).overflowX;
            if ((ov === 'auto' || ov === 'scroll') && n.scrollWidth > n.clientWidth + 1) { scrolls = true; break; }
            n = n.parentElement;
          }
          if (scrolls) continue;
          const out = over < 0 ? -over : over - vw;   // how far out of reach
          if (!worst || out > worst.out) worst = { el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')), right: over, out };
        }
        ok(JSON.stringify({ vw, worst }));
      })))`,
    });
    return JSON.parse(result.value);
  };

  const bad = [];
  let cleanFrom = SWEEP_FLOOR;
  for (const v of VIEWS) {
    await evalIn(c, v.open);
    await new Promise(r => setTimeout(r, 500));         // the view transition
    for (let w = SWEEP_FLOOR; w <= SWEEP_HI; w++) {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h0, deviceScaleFactor: 2, mobile: true });
      const m = await measure();
      if (m.worst) {
        bad.push({ view: v.name, w, right: m.worst.right, el: m.worst.el });
        if (w >= cleanFrom) cleanFrom = w + 1;
      }
    }
  }

  await evalIn(c, `document.querySelector('#viewnav button[data-view="games"]').click()`);
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));

  const pass = bad.length === 0;
  const list = bad.slice(0, 6).map(b => `${b.view}@${b.w}px: ${b.el} reaches ${b.right}px`).join(', ');
  return {
    name: `no overflow, ${SWEEP_FLOOR}–${SWEEP_HI}px`,
    pass,
    detail: pass
      ? `${(SWEEP_HI - SWEEP_FLOOR + 1) * VIEWS.length} widths across ${VIEWS.map(v => v.name).join(' + ')}, nothing stranded past the right edge`
      : `${bad.length} width(s) overflow: ${list}${bad.length > 6 ? ' …' : ''}`
        + (cleanFrom <= SWEEP_HI ? `; clean from ${cleanFrom}px up` : ''),
  };
}

/* Touch targets, swept — because measuring one width on one screen missed two
 * controls that were under the rule the whole time.
 *
 * `smoke-checks.js` finds controls structurally already (button, a[href],
 * input, select, textarea, the ARIA widget roles), so the selector was never
 * the problem. What it audits is "whatever is on screen now", and the harness
 * only ever showed it one screen at one width: the games view at 390. It
 * therefore could not see `input.num` (roster only, 38.4px wide at EVERY
 * width — a 44px rule broken everywhere, always) or `.bal-step` (roster only,
 * 41.9px at 320, crossing under 44 at about 365, so a 360px Android was
 * affected). Both were found by hand with a tape measure, which is exactly the
 * work a harness exists to stop.
 *
 * So this is the same widening the overflow check got: the states the app has,
 * across the widths a phone can be, rather than the one width somebody thought
 * to name. It replaces the single-viewport touch verdict rather than adding a
 * second one — one question, one answer.
 *
 * Widths: 320 (iPhone SE 1st gen, the narrowest anyone carries), 360 (the
 * common small Android), 390 (the iPhone the app is designed at). Every view
 * the chrome offers, and the games view again with every `details` open, since
 * a fold is where controls hide from a check like this. Season's own folds are
 * not swept: the harness's record has no filed games, and seeding some would
 * cost more cold-load nodes than the budget has slack.
 *
 * Settings is opened by the cog, not by a tab. A view added to the app and not
 * to this list is a view whose controls nobody measures, which is how
 * `input.num` sat at 38.4px for months. */
const TOUCH_WIDTHS = [320, 360, 390];
const TOUCH_STATES = [
  { name: 'games', open: `document.querySelector('#viewnav button[data-view="games"]').click()` },
  { name: 'team', open: `document.querySelector('#viewnav button[data-view="team"]').click()` },
  { name: 'season', open: `document.querySelector('#viewnav button[data-view="season"]').click()` },
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
  { name: 'games, folds open',
    open: `document.querySelector('#viewnav button[data-view="games"]').click();
           for (const d of document.querySelectorAll('details')) d.open = true` },

];
async function touchPass(c, source) {
  const before = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__SMOKE_VIEWPORT || [390, 844])', returnByValue: true,
  });
  const [w0, h0] = JSON.parse(before.result.value);

  const bad = [];
  let audited = 0, seen = 0;
  for (const st of TOUCH_STATES) {
    await evalIn(c, step(st.open));
    for (const w of TOUCH_WIDTHS) {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h0, deviceScaleFactor: 2, mobile: true });
      await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
      const chk = (await evalIn(c, source)).checks.find(k => k.name === 'touch targets ≥ 44px');
      if (!chk) { bad.push(`${st.name}@${w}px: the touch check is gone from smoke-checks.js`); continue; }
      audited++;
      const n = Number((chk.detail.match(/(\d+) controls/) || chk.detail.match(/\/(\d+) under/) || [])[1] || 0);
      seen = Math.max(seen, n);
      if (!chk.pass) bad.push(`${st.name}@${w}px: ${chk.detail}`);
    }
  }

  await evalIn(c, step(`document.querySelector('#viewnav button[data-view="games"]').click();
    for (const d of document.querySelectorAll('details')) d.open = false`));
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 300));

  return {
    name: `touch targets ≥ 44px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`,
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 44px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${TOUCH_STATES.map(s => s.name).join(' + ')} × `
        + `${TOUCH_WIDTHS.join('/')}px), up to ${seen} controls, all ≥ 44px`,
  };
}

/* The pages no browser check had ever loaded.
 *
 * Everything above this drives `index.html` and only `index.html`. The site is
 * nine pages: the app, `about.html`, `advanced.html`, and the six roster-size chart pages that
 * `scripts/charts.mjs` generates. The other seven were audited by nothing —
 * which is why `images declare alt text` reported "0 image(s)" on every
 * evaluation of a run while the app's only two <img> sat on `about.html`, and
 * why five real defects on these pages were found with a tape measure rather
 * than by CI (a shape mock 640px wide in a 390px viewport, a top-bar button
 * reaching 432px, the chart pages' bar overflowing at large text, a JSON-LD
 * arithmetic error, a missing og:image:alt on seven of eight pages).
 *
 * ALL SIX CHART PAGES, not one representative. Their *structure* cannot drift
 * — `charts.mjs --check` fails the suite the moment a page on disk stops
 * matching the generator. What varies page to page is the card: two names on
 * the change line at 7 players and three at 12, different auto-fit type sizes,
 * and a minutes footer of 7 names or of 12. That is exactly what could make
 * one page overflow and not another, and there is no single worst case to
 * nominate — 12 has the longest lines, 7 has the largest type. Measured, the
 * whole pass costs about four seconds, so the honest option is also the cheap
 * one.
 *
 * TWO WIDTHS, RELOADED AT EACH, not the 300-420 sweep. That sweep exists
 * because the app's top bar has an intrinsic floor that moves between
 * narrowing stages; these pages have no such chrome. And reloaded rather than
 * resized in place: a resize without a reload leaves the layout unreflowed and
 * reports a width that was never rendered.
 *
 * WHAT IT DOES NOT ASSERT, deliberately — each of these is a decision someone
 * will otherwise "fix", so the reason is on the line:
 *   - the card size. The chart pages' card is responsive on screen (293px wide
 *     at a 320px viewport); its printed size comes from `@media print`, which
 *     this harness does not emulate.
 *   - link resolution. These pages link extensionless absolute URLs (`/about`,
 *     `/7-player-...`) which the static server above does not route, so it
 *     would invent 404s. `scripts/redirect-check.mjs` already answers that
 *     question against production-shaped rules.
 *
 * Console errors are covered for free: this runs inside the same CDP session,
 * before the `no console errors` verdict is assembled, so that check now
 * covers seven more pages than it used to. */
const STATIC_PAGES = ['/about.html', '/advanced.html', ...[7, 8, 9, 10, 11, 12].map(n => `/${n}-player-basketball-rotation-chart.html`)];
const STATIC_WIDTHS = [390, 320];

/* ---- the large-text pass ----
 *
 * WHY IT EXISTS. The six chart pages overflowed 22px at 320px with the
 * browser's default font size at 32px — a reader on 200% text, which is a
 * supported OS setting, not an exotic one — and this check was green through
 * all of it, because it never emulated a font size. `about.html` carried the
 * one-line fix (`footer a { overflow-wrap: anywhere }` under `19em`) and the
 * generator did not; the pages measured 342 in a 320px viewport with the
 * footer's mail address as the worst element. Found with a tape measure, which
 * is the second defect on these pages found that way. A check that only ever
 * asks at 16px is not measuring the case that broke.
 *
 * ONE CELL, NOT A MATRIX. 320px at a 32px root, and nothing else. Measured
 * across all seven pages × 390/320 × 16/32px, every failure in the whole grid
 * sits in that one cell: 390 is clean at both font sizes and 320 is clean at
 * 16px, because `19em` is 304px at a 16px root and 608px at a 32px one — the
 * narrow-and-large corner is the only place the large-text rules are live and
 * the column is still short. So the pass costs seven navigations, not
 * twenty-eight, and it is the cell with all the information in it.
 *
 * THE ALLOWANCE, and it is the part to read before changing it. `about.html`
 * has a RECORDED, ACCEPTED 7px overflow in exactly this cell: a `span.nm` in a
 * drawn mock reaching 327px. It predates this check, it is accepted residue
 * rather than something to chase, and a pass added without an
 * allowance would go red on day one and be switched off by the next person —
 * which is how a check stops being read. So the residue is named at PAGE
 * granularity with the smallest number that covers it, rather than as a
 * blanket tolerance: every other page is pinned at zero, so the 22px defect
 * this pass was built for fails on any of the six, and would fail on
 * `about.html` too. Do NOT raise a number here to make a new failure go away —
 * a new overflow is a bug on a crawlable landing page. Fix the page, or accept
 * the residue deliberately and write the reason here, next to the number.
 *
 * The existing 390/320 pass at the default font size is untouched: this is an
 * addition, not a relaxation. */
const LARGE_TEXT_PX = 32;       // a 200% reader, via CDP `Page.setFontSizes`
const LARGE_TEXT_WIDTH = 320;   // the narrowest phone anyone carries
/* EMPTY, and it should stay that way. It held `{'/about.html': 8}` for one
   week: five 16px names in a narrow column inside that page's drawn card mock.
   Slice 2 declined to copy the 8 onto `advanced.html` and fixed the same
   overflow ON that page instead (`.paper .five` wraps inside the `19em` cell);
   A20 slice 3 then moved the mock off `about.html` altogether, so the last
   recorded residue on the site went with it -- re-measured at 0 rather than
   assumed. A number here is an accepted defect on a crawlable page; add one
   only with the finding and the reason for accepting it written here. */
const LARGE_TEXT_ALLOW = {};
/* The same assertion `sweepPass` makes, and for the same reason: `scrollWidth`
   is clamped by `overflow-x: clip` on a shrink-to-fit container, so the thing
   clip cannot hide is an element's own edge. `pans` is the other half —
   content out of reach with the scrollbar removed is the same bug with its
   symptom deleted.
   `vw` is `documentElement.clientWidth`, never `window.innerWidth`: Chrome's
   mobile emulation WIDENS `innerWidth` to contain the overflow, so a probe
   written against it reports a 331px window in a 320px viewport and calls the
   overflow that caused it clean.
   BOTH EDGES. A right-edge test is blind to content off the LEFT, and so is
   `scrollWidth`; the Games tab hangs off it and no pass could see it. */
const OVERFLOW_PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const x0 = window.scrollX;
  window.scrollTo(80, window.scrollY);
  const pans = window.scrollX !== x0;
  window.scrollTo(x0, window.scrollY);
  let worst = null;
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const over = r.right > vw + 1 ? Math.round(r.right) : r.left < -1 ? Math.round(r.left) : null;
    if (over === null) continue;
    let n = el.parentElement, scrolls = false;
    while (n && n !== document.body) {
      const ov = getComputedStyle(n).overflowX;
      if ((ov === 'auto' || ov === 'scroll') && n.scrollWidth > n.clientWidth + 1) { scrolls = true; break; }
      n = n.parentElement;
    }
    if (scrolls) continue;
    const out = over < 0 ? -over : over - vw;
    if (!worst || out > worst.out) worst = { el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')), right: over, out };
  }
  return JSON.stringify({ vw, pans, worst });
})()`;

async function staticPass(c, source, origin) {
  const problems = [];
  const visited = [];
  let images = 0;
  for (const page of STATIC_PAGES) {
    for (const w of STATIC_WIDTHS) {
      const where = `${page}@${w}px`;
      try {
        await c.send('Emulation.setDeviceMetricsOverride',
          { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
        const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
        await c.send('Page.navigate', { url: origin + page });
        await loaded;
        // These pages have no app to boot; fonts are what moves the layout.
        await evalIn(c, `document.fonts.ready`);
        await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);

        const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
        if (o.pans) problems.push(`${where}: page pans sideways`);
        if (o.worst) problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`);

        // The static verdicts do not change with width; ask them once, wide.
        if (w !== STATIC_WIDTHS[0]) continue;
        visited.push(page);
        const report = await evalIn(c, source);
        const alt = report.checks.find(k => k.name === 'images declare alt text');
        if (alt?.pass) images += Number((alt.detail.match(/(\d+) image/) || [])[1] || 0);
        for (const chk of report.checks) {
          if (!STATIC_A11Y.has(chk.name) || chk.pass) continue;
          problems.push(`${page} — ${chk.name}: ${chk.detail}`);
        }
      } catch (e) {
        problems.push(`${where}: ${e.message.split('\n')[0]}`);
      }
    }
  }

  /* The large-text cell. See LARGE_TEXT_* above for why it is one cell and why
     `about.html` has an allowance. Reloaded at each page like the pass above:
     a font-size change without a reload leaves the layout unreflowed and
     reports a width that was never rendered. */
  let allowed = 0;
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    for (const page of STATIC_PAGES) {
      const where = `${page}@${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
      try {
        await c.send('Emulation.setDeviceMetricsOverride',
          { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
        const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
        await c.send('Page.navigate', { url: origin + page });
        await loaded;
        await evalIn(c, `document.fonts.ready`);
        await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);

        const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
        const slack = LARGE_TEXT_ALLOW[page] || 0;
        if (o.pans) problems.push(`${where}: page pans sideways`);
        if (o.worst && o.worst.out > slack) {
          problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`
            + (slack ? ` (${slack}px allowed)` : ''));
        } else if (o.worst) allowed++;
      } catch (e) {
        problems.push(`${where}: ${e.message.split('\n')[0]}`);
      }
    }
  } finally {
    // Never leave the emulated font size on: every check after this one runs
    // in the same CDP session and would silently measure a 200% reader.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
  }

  return {
    name: 'static pages: 2 guides + 6 charts',
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${visited.length} pages × ${STATIC_WIDTHS.join('/')}px + ${LARGE_TEXT_WIDTH}px@${LARGE_TEXT_PX}px text, `
        + `${images} image(s) with alt, no overflow`
        + (allowed ? ` (${allowed} recorded residue)` : '')
        + ', ids and lang clean, touch targets ≥ 44px',
  };
}

/* ---- the same large-text cell, on the app shell ----
 *
 * WHY IT EXISTS, and it is the uncomfortable part. The pass above covers seven
 * STATIC pages. `index.html` — the app, the page a coach actually uses — was
 * never checked at a large root at all: `sweepPass` walks 300–420px at the
 * DEFAULT font size, and the large-text cell only ever visited `DEAD_STATIC`.
 * So the app's own views were held to a lower standard than its marketing
 * pages, and a **228px** sideways pan on the games view was shippable the
 * whole time — `table.grid` measuring 675px in a 320px column at a 32px root.
 * Nothing was wrong with either existing check; the cell simply had no owner.
 *
 * SAME ONE CELL, for the same reason: 320px at a 32px root is where the app's
 * `19em` large-text block is live and the column is still short. All four
 * views, because the four chromes differ and only one of them has to be wrong
 * — that is the lesson `sweepPass` already wrote down about deriving a view
 * list instead of enumerating one.
 *
 * ONE NAVIGATION, then the views are switched in the page. A font size cannot
 * be changed without a reload — `Page.setFontSizes` on a laid-out document
 * leaves it unreflowed and reports a width that was never rendered — but a
 * view switch reflows on its own, so the reload is paid once, not four times.
 *
 * FOLDS ARE LEFT AS THEY BOOT, unlike `touchPass`. Measured both ways when
 * this shipped: all four views report identically with every `<details>`
 * forced open, because the app's folds hide their content with CSS rather than
 * by removing the box, so a closed fold's children still have rects and are
 * still swept. Opening them would cost four more settles for nothing.
 *
 * THE ALLOWANCES ARE PER VIEW, never blanket, and each number is the smallest
 * that covers a residue accepted deliberately, with its reason on the key.
 * A blanket tolerance
 * is what would have let the 228px through. Tighten one by 1px and it must go
 * red; if it does not, the number is decoration. Do NOT raise one to silence a
 * new failure — that is a bug on the screen the coach stands in front of. */
const APP_LARGE_TEXT_ALLOW = {
  /* EMPTY, and that is the finding, not an omission. All four views measured
     clean in this cell once the three defects behind the 2026-08-24 report
     were fixed, so there is no residue to name and every view is pinned at
     zero. Add a key here only for a residue accepted deliberately, with the
     reason on the line and the smallest number that covers it — and tighten it
     by 1px first to prove the number is load-bearing. */
};
/* The four views, plus BENCH MODE — which is the state this pass could not see
   and the one a coach is standing in when it matters most.
 *
 * `VIEWS` is the nav, and game mode is not on the nav: it is a full-screen
 * overlay behind `#gmOpen`. Nothing in this harness had ever enumerated it at
 * a large root, and the measured consequence was `#gmNext2` — "Next stint",
 * the primary action of the screen a coach uses with the clock running —
 * sitting at left 349 in a 320px viewport with no pan available. Wholly off
 * screen, unreachable, and green in every check.
 *
 * The swap picker is here too because picking a player changes the layout of
 * the bench list underneath it, so it is a different measurement, not the same
 * screen with a class on it. Both close themselves so the pass leaves the app
 * on the games view for whatever runs next. */
const APP_LARGE_TEXT_STATES = [
  ...VIEWS,
  { name: 'bench mode', open: `document.querySelector('#gmOpen').click()`,
    close: `document.querySelector('#gmClose').click()` },
  /* AND A TOAST, which this pass could not see either, for a different reason:
     the other states are static and a toast expires. It joins anyway because
     it is drivable — "Sit, rebalance" is two clicks from `#gmOpen`, its copy
     was the longest the app ever put in a toast until A35's sample flash (58
     characters against 86; the state at the foot of this list covers that one)
     and it is the only toast with a button squeezing the message — and because
     `UNDO_MS` is far longer than the settle, so it is still up when the probe
     runs.

     ITS OWN FAILURE IS VERTICAL, which is why `STRANDED_ABOVE` exists below:
     the toast box is anchored to the BOTTOM of the screen and grows upward, so
     a message squeezed to seven pixels wide by the buttons beside it made a
     568px box at y -160 and every horizontal probe in this harness called it
     clean.

     `close` takes the Undo rather than the dismiss, so the pass hands the next
     one an unmodified plan — and the undo path is exercised for free. */
  { name: 'bench mode, undo toast',
    open: `document.querySelector('#gmOpen').click();
           await new Promise(r => setTimeout(r, 400));
           document.querySelector('#gmFloor .gm-p').click();
           await new Promise(r => setTimeout(r, 400));
           [...document.querySelectorAll('#gamemode button')]
             .find(b => b.textContent.trim() === 'Sit, rebalance').click()`,
    close: `document.querySelector('.toast .tundo')?.click();
            await new Promise(r => setTimeout(r, 400));
            document.querySelector('#gmClose').click()` },
  { name: 'bench mode, swap picker',
    open: `document.querySelector('#gmOpen').click();
           document.querySelector('#gmFloor .gm-p').click()`,
    close: `document.querySelector('#gmClose').click()` },
  /* AND THE FIFTH CHROME: the welcome screen, the first thing a coach ever
     sees, and the one screen in the app this cell had never visited.
     `overlayPass` has audited it since it was written; this pass enumerated
     "all four views" and the welcome screen is not one of them — it is the
     view you get INSTEAD of the four, with `.bar`, `.foot`, `#teamtabs` and
     `#actionbar` all taken off the screen by `applyView`. A different chrome
     is exactly the argument this list already makes for game mode.

     It is reached by a REAL FIRST RUN — clear the record, reload — not by
     unhiding `#view-welcome` the way `overlayPass` forces it. Forcing leaves
     the games view laid out underneath and `OVERFLOW_PROBE` reports only the
     WORST element on the page, so a forced welcome screen would measure the
     games view and say "welcome screen" over it. That is the whole reason
     this entry costs a navigation.

     MUST STAY LAST, with the two states below it: it destroys the rich fixture.
     Nothing after it in this array would find `#gmOpen`, and `staticPass` (the
     only pass after this one) navigates away from `index.html` for good. */
  { name: 'welcome screen, first run', firstRun: true },
  /* AND THE FORM WITH THE SAMPLE IN IT (A49). A46 hid the roster form behind an
     "Enter my team" disclosure and this pass had to open it as its own state;
     A49 deleted the disclosure, so the state above sweeps the empty form for
     free again and what is worth a second state is the form FULL -- ten names
     in a textarea, the count line grown to "10 players. Ready.", and at 320px
     on 200% text that is the tallest this screen ever gets.

     A51 MOVED THE BUTTON, not the behaviour: `#welTry` in the hero now opens
     the app (`loadSample`, which is what `?try=N` has always called) and the
     fill lives on `#welFill` inside the roster box, for the coach who is
     already typing. A52 then put the whole form behind `#welType`, so this
     state opens it first and the two clicks are the coach's real path: ask for
     the form, then fill it. The assertion is on the VALUES, because a state
     that quietly stops measuring something is the same shape as a guard that
     cannot fail -- if the fill silently stopped working this would go on
     sweeping an empty form and report clean.

     WHAT THIS REPLACED, DELIBERATELY AND NOT SILENTLY: a state that raised the
     sample flash, the longest copy the app puts in a toast (84 characters
     against the rebalance message's 58). That sentence survives only on the
     `?try=N` path now, which creates a team and lands on the games view, so it
     is out of reach of a states loop that does not navigate — which is what
     the state BELOW navigates for. `bench mode, undo toast` above measures a
     toast with a button in it; this one has none. */
  { name: 'welcome screen, sample filled',
    open: `document.querySelector('#welType').click();
           await new Promise(r => setTimeout(r, 200));
           document.querySelector('#welFill').click();
           await new Promise(r => setTimeout(r, 300));
           if (document.querySelector('#welRoster').value.split('\\n').filter(Boolean).length < 5
               || !document.querySelector('#welTeam').value.trim())
             throw new Error('the sample never filled the form -- this state measured an empty one')`,
    close: `document.querySelector('#welRoster').value = '';
            document.querySelector('#welTeam').value = '';
            document.querySelector('#welBack').click()` },
  /* AND THE SENTENCE THE STATE ABOVE STOPPED MEASURING (A50). The sample flash
     is the longest copy the app puts in a toast, and its whole job is telling a
     first-run coach how to undo the thing they just did — so 320px at 200% text
     is exactly where it has to be looked at, and after A49 nothing looked.

     IT IS A NAVIGATION, not a click, for two reasons. `?try=N` is the only path
     that still raises it (the six chart pages link in with their own roster
     size), and `initOnboarding` reads the parameter only while
     `state.onboarded` is false — so the record has to be wiped first, exactly
     as `firstRun` above wipes it and for the same on-new-document reason.

     THE FLASH'S OWN BOX IS ASSERTED, and that is the point of `tryLanding`
     rather than an `open` string. `OVERFLOW_PROBE` reports the WORST element on
     the page, so a state where the toast never appeared would sweep the games
     view underneath it and report clean — the same trap the forced welcome
     screen has above, and the reason a new state is worth less than no state
     when it can quietly measure nothing. So the arrival is checked with
     `checkVisibility`, the text is checked so it is THIS toast and not another,
     and its four edges are checked against the viewport before the generic
     probes run over the page around it.

     IT RACES A TIMER, deliberately and loudly. `flash()` has no button, so it
     dwells `UNDO_MS / 2` — 4.5s — and the boot plus settle ahead of the probe
     is well under a second. If that ever inverts, the visibility assertion
     fails and says so, which is the failure to want; the alternative is a state
     that measures a dismissed toast and calls it clean.

     LAST, with the two states above it: all three destroy the rich fixture, and
     this one leaves a sample team in the record. `staticPass` is the only pass
     after it and it navigates away from `index.html` for good. */
  { name: 'sample flash, ?try= landing', tryLink: 12 },
];
/* THE OTHER EDGE, and the one no probe in this file had. `OVERFLOW_PROBE`
 * answers "can the coach reach it sideways"; nothing answered "is it above the
 * top of the screen", and for a VIEWPORT-ANCHORED overlay that question has no
 * scrollbar to rescue it — content off the top of a fixed box is simply gone.
 *
 * That is exactly how a 275x568 toast at y -160 stayed green: `scrollWidth`,
 * `pans` and both horizontal edges were clean the whole time, and a coach at
 * 200% text was reading the rebalance message from its middle.
 *
 * SCOPED TO FIXED SUBTREES, not the whole page, because everywhere else a
 * negative `top` is just the page being scrolled. The toast itself is a static
 * child of a `position: fixed` container, so the walk has to go down from each
 * fixed root rather than test `position` on the element that overflows.
 *
 * Scrollable ancestors are skipped for the same reason `OVERFLOW_PROBE` skips
 * them: a scroller's content above its own top is one flick away. */
const STRANDED_ABOVE = `(() => {
  const roots = [...document.body.querySelectorAll('*')]
    .filter(el => getComputedStyle(el).position === 'fixed');
  let worst = null;
  const vis = el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if ((!r.width && !r.height) || r.top >= -1 || !vis(el)) continue;
      let n = el.parentElement, scrolls = false;
      while (n && n !== document.body) {
        const ov = getComputedStyle(n).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && n.scrollHeight > n.clientHeight + 1) { scrolls = true; break; }
        n = n.parentElement;
      }
      if (scrolls) continue;
      if (!worst || r.top < worst.top) worst = {
        el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
          + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')),
        top: Math.round(r.top),
      };
    }
  }
  return JSON.stringify({ host: location.host, worst });
})()`;

/* Wipe the record and reload, so the app puts up the welcome screen by its own
 * route (`setView` forces `welcome` while `state.onboarded` is false) instead
 * of the harness unhiding a `<main>`.
 *
 * A FIXTURE IS NOT A GUARD UNTIL SOMETHING FAILS WHEN IT DOES NOT ARRIVE —
 * same rule `fixturePass` is written under, and it bites harder here: if the
 * wipe or the reload silently did nothing, this state would measure the games
 * view a second time, report clean, and the cell it exists to cover would go
 * on being uncovered while reading green. So it asserts the screen arrived AND
 * that the app's chrome really came off, and it names both buttons — `#welTry`
 * is the one A35 added and the reason this cell was worth closing. */
async function firstRun(c, origin) {
  /* CLEARING THE RECORD IN THE CURRENT DOCUMENT IS NOT ENOUGH, and the first
     draft of this that did so failed with all three keys back — which is why
     the precondition below exists. `browserChecks` registers an
     `addScriptToEvaluateOnNewDocument` that re-seeds `benchcard.v3` on EVERY
     document, so a wiped record is refilled before the app's first line runs
     and the reload lands on the games view. (`goRich`'s comment already says
     that write "still fires on every new document"; it is inert only because
     v6 wins the read order — with v6 gone it is the record.)

     So the wipe rides in a SECOND on-new-document script, added later and
     therefore run later, and it is removed again straight afterwards: leaving
     it registered would empty the record under `staticPass` too. The seed
     script is left alone, because `smoke-checks.js` reads
     `window.__SMOKE_VIEWPORT` out of it and `staticPass` still runs. */
  const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument',
    { source: `try { localStorage.clear(); } catch {}` });
  try {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && document.querySelector('#view-welcome')?.hidden !== false; i++)
        await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
  } finally {
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  const r = JSON.parse(await evalIn(c, `JSON.stringify({
    host: location.host,
    shown: document.querySelector('#view-welcome')?.hidden === false,
    bar: getComputedStyle(document.querySelector('.bar')).display,
    buttons: ['#welGo', '#welTry'].filter(s => document.querySelector(s)).length,
    seeded: Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('Smoke Test')),
  })`));
  const wrong = [
    r.shown ? null : '#view-welcome is still hidden',
    r.bar === 'none' ? null : `.bar is display: ${r.bar}, so the app chrome is still up`,
    r.buttons === 2 ? null : `${r.buttons} of the 2 welcome buttons are in the DOM`,
    r.seeded ? 'a seeded team survived the wipe' : null,
  ].filter(Boolean);
  if (wrong.length) throw new Error(`first run did not arrive on ${r.host}: ${wrong.join('; ')}`);
}

/* The exact sentence `onboarding.js` flashes on the `?try=N` landing. Pinned
   here as a PREFIX rather than the whole string: `test/sample-team.test.js`
   owns the wording (it fails if the sentence names a destination the nav does
   not offer), and a second copy of the full sentence in this file would make
   every copy edit a two-file edit for no extra coverage. What this needs to
   know is that the toast on screen is the sample flash and not some other
   toast that happened to be up. */
const FLASH_LEAD = 'Sample team loaded.';

/* The `?try=N` landing, which is the only path left that raises that flash.
 *
 * Wiped and navigated like `firstRun` above, for a reason that is one step
 * further on: `initOnboarding` reads the parameter only while
 * `state.onboarded` is false, and `browserChecks`'s on-new-document script
 * re-seeds `benchcard.v3` on every document — so without the wipe this would
 * land on the games view of a seeded team with no toast at all, and the state
 * would measure the games view a second time. Same removal afterwards, for the
 * same reason: left registered it would empty the record under `staticPass`.
 *
 * Returns the flash's measured box for the pass detail, and throws with what
 * it found if the flash is not on screen carrying its own sentence. */
async function tryLanding(c, origin, n) {
  const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument',
    { source: `try { localStorage.clear(); } catch {}` });
  try {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: `${origin}/index.html?try=${n}` });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('#toasts .toast .tmsg'); i++)
        await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
  } finally {
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  const r = JSON.parse(await evalIn(c, `(() => {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const msg = document.querySelector('#toasts .toast .tmsg');
    const box = msg && msg.getBoundingClientRect();
    return JSON.stringify({
      host: location.host, vw, vh,
      games: document.querySelector('#view-games')?.hidden === false,
      /* The [data-id] filter is load-bearing: index.html paints a .tl-skel of
         bare .tl-row divs before the app boots, so a count without it is
         satisfied by the skeleton of a team that was never built. (No
         backticks in here: this whole probe is a template literal, and one
         closed it early -- ReferenceError: data is not defined.) */
      players: document.querySelectorAll('#timeline .tl-row[data-id]').length,
      text: msg && msg.textContent,
      /* NOT getClientRects().length — a box with rects can still be
         opacity: 0 or inside a content-visibility subtree. */
      seen: !!msg && msg.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      box: box && { l: Math.round(box.left), r: Math.round(box.right),
                    t: Math.round(box.top), b: Math.round(box.bottom),
                    w: Math.round(box.width), h: Math.round(box.height) },
    });
  })()`));
  const b = r.box;
  const wrong = [
    r.games ? null : 'the games view is not on screen, so the deep link never built the team',
    r.players === n ? null : `the plan holds ${r.players} players, not the ${n} the link asked for`,
    r.text ? null : 'there is no toast on screen — the flash never appeared, or it expired first',
    r.text && r.text.startsWith(FLASH_LEAD) ? null : r.text ? `the toast on screen is "${r.text}", not the sample flash` : null,
    !r.text || r.seen ? null : 'the flash is in the DOM but not visible',
    !b || (b.w > 0 && b.h > 0) ? null : 'the flash measures 0px',
    /* Its OWN edges, not the page's worst element: see the state's comment. */
    !b || b.l >= -1 ? null : `the flash starts at x ${b.l}, off the left edge`,
    !b || b.r <= r.vw + 1 ? null : `the flash reaches ${b.r}px in a ${r.vw}px viewport`,
    !b || b.t >= -1 ? null : `the flash starts at y ${b.t}, above the top of the screen`,
    !b || b.b <= r.vh + 1 ? null : `the flash ends at y ${b.b} in a ${r.vh}px viewport`,
  ].filter(Boolean);
  if (wrong.length) throw new Error(`?try=${n} on ${r.host}: ${wrong.join('; ')}`);
  return `${b.w}×${b.h} at y ${b.t}`;
}

async function appLargeTextPass(c, origin) {
  const problems = [];
  let allowed = 0;
  let flash = '';
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);

    for (const v of APP_LARGE_TEXT_STATES) {
      const where = `${v.name}@${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
      try {
        /* `SETTLE`, not `sweepPass`'s flat 500ms: the sweep pays that once per
           view and then measures 121 widths behind it, so the sleep is 0.4% of
           its cost; here it would be half the pass. Waiting on the animations
           themselves is both cheaper and stricter. */
        if (v.firstRun) await firstRun(c, origin);
        else if (v.tryLink) flash = await tryLanding(c, origin, v.tryLink);
        else await evalIn(c, step(v.open));
        const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
        const slack = APP_LARGE_TEXT_ALLOW[v.name] || 0;
        if (o.pans) problems.push(`${where}: page pans sideways`);
        if (o.worst && o.worst.out > slack) {
          problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`
            + (slack ? ` (${slack}px allowed)` : ''));
        } else if (o.worst) allowed++;
        const up = JSON.parse(await evalIn(c, STRANDED_ABOVE));
        if (up.worst) problems.push(`${where}: ${up.worst.el} starts at y ${up.worst.top}, above the top of a fixed overlay`);
      } catch (e) {
        problems.push(`${where}: ${e.message.split('\n')[0]}`);
      } finally {
        if (v.close) await evalIn(c, step(v.close))
          .catch(e => problems.push(`${where}: did not close — ${e.message.split('\n')[0]}`));
      }
    }
  } finally {
    // Same rule as the pass above: never leave the emulated font size on.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
  return {
    name: `app shell at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`,
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${APP_LARGE_TEXT_STATES.length} states (${APP_LARGE_TEXT_STATES.map(v => v.name).join(' + ')}), nothing stranded past either side edge or above a fixed overlay`
        + (flash ? `, sample flash ${flash}` : '')
        + (allowed ? ` (${allowed} recorded residue)` : ''),
  };
}

/* Not `A11Y`: that set carries the dialog check, which has no dialogs to find
   here, and it is scoped to the app's overlay states. These are the verdicts
   that mean something on a page of prose.

   `touch targets` was excluded when this pass shipped, because all seven pages
   failed it: a 118x27 wordmark linking home and 24px footer links, on chrome
   that is tapped on a phone exactly like the app's is. That was a real defect
   on the pages, not a rule that did not apply to them, so the pages were fixed
   (a `min-height` on `.mark` and on `footer a`, in about.html's own stylesheet
   and in charts.mjs) and the check joined the set. The one remaining flag was
   the FAQ's inline link inside a `<dd>`, which was the app rule's prose
   exemption being one selector short — `dd` is now in it. */
const STATIC_A11Y = new Set([
  'controls have accessible names',
  'images declare alt text',
  'ids unique, aria references resolve',
  'document lang, title, tab order',
  'touch targets ≥ 44px',
]);

async function browserChecks(origin) {
  const debugPort = 9222 + Math.floor(Math.random() * 500);
  const { proc, dir, ws } = await launch(debugPort);
  const c = cdp(ws);
  const consoleErrors = [];
  const thirdParty = [];
  /* The Cloudflare beacon fires from localhost too and its CORS preflight
     always fails there (its ACAO is the production host). That is one guaranteed
     console error on every run, and counting it would train everyone to ignore
     this check. Third-party noise is recorded separately, never as a failure —
     anything served from our own origin still counts. */
  const isOurs = t => !/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(t);
  const record = text => (isOurs(text) ? consoleErrors : thirdParty).push(text);
  try {
    await c.ready;
    c.on('Runtime.consoleAPICalled', p => {
      if (p.type === 'error') record(p.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    });
    c.on('Runtime.exceptionThrown', p => {
      const d = p.exceptionDetails;
      record(d.exception?.description || d.text);
    });
    c.on('Log.entryAdded', p => {
      // Network 4xx/5xx surface here and nowhere else — a missing precached
      // file looks fine on screen and fatal offline.
      if (p.entry.level === 'error') record(`${p.entry.source}: ${p.entry.text} ${p.entry.url || ''}`.trim());
    });

    /* Every request the page makes on a cold load, for the payload budget.
       `encodedDataLength` is what actually crossed the wire (compressed), so
       it is the number a coach on gym wifi pays. Service-worker fetches are a
       different CDP target and do not appear here, which is right: precaching
       happens after the app is already on screen. */
    const requests = new Map();
    c.on('Network.requestWillBeSent', p => requests.set(p.requestId, { url: p.request.url, type: p.type || 'Other', bytes: 0 }));
    c.on('Network.responseReceived', p => { const r = requests.get(p.requestId); if (r) r.type = p.type || r.type; });
    c.on('Network.loadingFinished', p => { const r = requests.get(p.requestId); if (r) r.bytes = p.encodedDataLength || 0; });
    c.on('Network.loadingFailed', p => requests.delete(p.requestId));

    await c.send('Runtime.enable');
    await c.send('Log.enable');
    await c.send('Network.enable');
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true,
    });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await c.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__SMOKE_VIEWPORT = [${WIDTH}, ${HEIGHT}];\n`
        + `try { localStorage.setItem('benchcard.v3', ${JSON.stringify(JSON.stringify(SEED))}); } catch {}`,
    });

    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    // Fonts settle before the card auto-fits, and the fit is what the size
    // check is measuring. Wait for the app rather than a fixed sleep, then for
    // the entrance animations — see SETTLE.
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);

    const source = await readFile(join(ROOT, 'scripts', 'smoke-checks.js'), 'utf8');
    const { result, exceptionDetails } = await c.send('Runtime.evaluate', { expression: source, returnByValue: true });
    if (exceptionDetails) throw new Error('checks threw: ' + (exceptionDetails.exception?.description || exceptionDetails.text));

    const report = result.value;
    // Before the overlay pass: the budget is a cold load, and walking the UI
    // after it would fold whatever the overlays fetch into the number.
    report.payload = { ...summarize([...requests.values()], origin), nodes: report.nodes };

    /* THE FIXTURE SPLIT HAPPENS HERE, and the order of these three lines is
       the whole design: the budget above is measured on the lean cold load,
       everything below is measured on the rich one. Moving `goRich` earlier
       folds a season, a second game and two levelled players into a number
       that is supposed to describe a first visit. */
    await goRich(c, origin);
    report.checks.push(await fixturePass(c));

    report.checks.push(await overlayPass(c, source));
    /* The swept touch pass replaces the first pass's single-viewport verdict
       rather than sitting beside it: two checks answering the same question
       with different coverage is how the weaker one gets believed. */
    report.checks = report.checks.filter(k => k.name !== 'touch targets ≥ 44px');
    report.checks.push(await touchPass(c, source));
    report.checks.push(await narrowPass(c));
    report.checks.push(await sweepPass(c));
    /* After the sweep, because it reloads the app at a 32px root and the sweep
       assumes the boot-time layout; before `staticPass`, which navigates away
       from `index.html` for good. */
    report.checks.push(await appLargeTextPass(c, origin));
    /* Last of the browser passes, because it navigates away from the app and
       nothing after it may assume `index.html` is still loaded. Still ahead of
       the console verdict below, so the seven pages it visits are covered by
       that too. */
    report.checks.push(await staticPass(c, source, origin));

    /* Last, so it covers the overlay pass too: an exception thrown by opening
       game mode is exactly the kind of thing the opening screen cannot show
       you. */
    report.checks.unshift({
      name: 'no console errors',
      pass: consoleErrors.length === 0,
      detail: consoleErrors.length
        ? consoleErrors.slice(0, 4).join(' | ')
        : `clean${thirdParty.length ? ` (${thirdParty.length} third-party, ignored)` : ''}`,
    });
    return report;
  } finally {
    c.close();
    proc.kill();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runTests() {
  return new Promise(ok => {
    execFile(process.execPath, ['--test'], { cwd: ROOT }, (err, stdout) => {
      // node --test prints `ℹ tests 157` (spec reporter) or `# tests 157` (tap)
      const count = key => (stdout.match(new RegExp(`^[ℹ#] ${key} (\\d+)`, 'm')) || [])[1];
      const pass = count('pass'), total = count('tests');
      ok({
        name: 'node --test',
        pass: !err,
        detail: total ? `${pass}/${total} passing` : (err ? 'suite failed to run' : 'passed'),
      });
    });
  });
}

const BUDGETS = join(ROOT, 'scripts', 'budgets.json');

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
let report;
try {
  report = await browserChecks(origin);
} finally {
  server.close();
}

/* Budgets. `--update-budgets` re-records today's numbers instead of judging
   them — the only way the recorded baseline ever moves, so it moves as a
   reviewable diff. */
const baseline = await readFile(BUDGETS, 'utf8').then(t => JSON.parse(t).initialPayload, () => null);
if (has('--update-budgets')) {
  const { bytes, requests, nodes, byType } = report.payload;
  const recorded = {
    recorded: new Date().toISOString().slice(0, 10),
    note: 'Cold load of index.html at 390×844, measured by scripts/smoke.mjs. Bytes are '
      + 'uncompressed — the harness serves app/ without gzip, so this tracks growth rather '
      + 'than what production ships. Re-record with `node scripts/smoke.mjs --update-budgets`; '
      + 'scripts/budgets.mjs holds the slack.',
    initialPayload: { bytes, requests, nodes, byType },
  };
  await writeFile(BUDGETS, JSON.stringify(recorded, null, 2) + '\n');
  report.checks.push({ name: 'budgets re-recorded', pass: true, detail: `${(bytes / 1024).toFixed(1)} KB, ${requests} requests, ${nodes} nodes → scripts/budgets.json` });
} else {
  report.checks.push(...compare(baseline, report.payload));
}

if (!has('--no-tests')) report.checks.push(await runTests());

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pad = Math.max(...report.checks.map(c => c.name.length));
  console.log(`\nbenchcard smoke — ${report.viewport[0]}×${report.viewport[1]}, ${report.checks.length} checks\n`);
  for (const c of report.checks) {
    console.log(`  ${c.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${c.name.padEnd(pad)}  ${c.detail}`);
  }
  console.log('');
}

process.exit(report.checks.every(c => c.pass) ? 0 : 1);
