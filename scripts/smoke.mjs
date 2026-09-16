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
       node scripts/smoke.mjs --only "<check>" # one check, while iterating —
                                                # not proof; see the registry below

   `--only` runs just the setup one named check needs and that check alone; it
   implies `--no-tests` and skips the budgets. It is for the loop between full
   runs, never a substitute for one — `AGENTS.md` § Layout says why.

   No dependencies, deliberately: this repo has none and adding Playwright to
   get four assertions would be the tail wagging the dog. Chrome is driven over
   the DevTools protocol through node's built-in WebSocket.

   It serves `app/` itself on an ephemeral port, which also sidesteps the trap
   that eats iterations by hand: a stale service worker on :8201 serving code
   you already changed. A fresh port is a virgin origin every run. */

import { spawn, execFile } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, summarize } from './budgets.mjs';
import { serve } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const args = process.argv.slice(2);
const has = f => args.includes(f);
const JSON_OUT = has('--json');
const WIDTH = 390, HEIGHT = 844;

/* ---------- a static server for app/ ---------- */

/* `scripts/serve.mjs`, shared with redirect-check.mjs and og.mjs. This file
   used to carry its own copy that served `/about.html` but 404d on `/about`,
   which is the spelling every internal href now uses -- so the harness could
   not open the pages the site links to. It also stubbed `/e` so a cold load's
   product beacon does not surface as a console error and turn this harness red
   about a server it was never running; `serve.mjs` does that instead.

   The rule the deleted copy was breaking, and which this file had stated in
   its own comment while breaking it: DEV BEHAVES LIKE PROD, OR THE CHECKS ARE
   MEASURING THE WRONG THING. */

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

/* Swap in `record` and reload, the way the #23 checks below need to: a
   cache-busted URL first forces a genuinely new navigation, which is what
   actually truncates any forward session-history entries left dangling by a
   previous reload-then-back — `Page.navigate` to the exact URL already
   loaded does not. The plain URL right behind it restores the real address,
   so `location.href` comparisons against it stay honest. Waits for
   `.today-game` rather than `.card` (`goRich` above) because every #23 check
   reloads onto Today, never straight onto a game. */
async function reloadWithRecord(c, origin, record) {
  await evalIn(c, `(() => {
    localStorage.removeItem('benchcard.v3');
    localStorage.removeItem('benchcard.v6.bak');
    localStorage.setItem('benchcard.v6', ${JSON.stringify(JSON.stringify(record))});
  })()`);
  for (const url of [`${origin}/index.html?_smoke=${Date.now()}`, `${origin}/index.html`]) {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url });
    await loaded;
  }
  await evalIn(c, `(async () => { await document.fonts.ready;
    for (let i = 0; i < 60 && !document.querySelector('.today-game'); i++) await new Promise(r => setTimeout(r, 50));
    await ${SETTLE}; })()`);
}

/* A clone of `record` with a second team ("JV Ravens", a copy of the first)
   pushed on -- RICH ships with one, and the #23 checks below need two before
   the team menu's "switch team" and checkmark mean anything. `id` gets a
   fresh value because sanitizeTeam trusts it for dedup. */
function withSecondTeam(record) {
  const withTwo = JSON.parse(JSON.stringify(record));
  const second = JSON.parse(JSON.stringify(withTwo.teams[0]));
  second.id = 't1';
  second.name = 'JV Ravens';
  withTwo.teams.push(second);
  return withTwo;
}

// Is `#id` the screen currently on show? Both #23 checks below ask this of
// more than one screen (Today, and on the keys/undo side, Games too), so it
// is one helper rather than a `!!(document.getElementById(...) && ...)` at
// every call site.
const onScreen = (c, id) => evalIn(c, `!!(document.getElementById('${id}') && !document.getElementById('${id}').hidden)`);

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
    $('#todayTeam').click();
    await ${SETTLE};
    out.resetLevels = [...document.querySelectorAll('#view-team button')]
      .filter(b => /back to the same level/i.test(b.textContent)).length;
    $('#backBtn').click();
    /* Going home from a pushed screen is a REAL \`history.back()\` now (#23
       review, item A) -- an async browser traversal, not a same-tick repaint.
       Clicking the next thing before its own \`popstate\` has landed is
       exactly the "back-then-push in one tick" race that traversal's own
       fix guards against, and the guard's recovery is to reassert history at
       the CURRENT position -- which is safe, but is not "nothing happened",
       and chaining three of these with no yield between them was enough to
       walk the tab's session history back past this reload's own base entry
       and off the app entirely (reproduced: \`npm run smoke -- --no-tests\`
       died with "Inspected target navigated or closed" mid-\`fixturePass\`).
       One settle is the fix, here and at every \`#backBtn\` click below. */
    await ${SETTLE};
    $('.today-game').click();
    await ${SETTLE};
    out.dayRows = document.querySelectorAll('#daytotals .dayrow').length;
    out.dayGames = document.querySelectorAll('#daytotals .legend span').length;
    $('#backBtn').click();
    await ${SETTLE};
    $('#todaySeason').click();
    await ${SETTLE};
    out.filedGames = document.querySelectorAll('#view-season details.sn-game').length;
    $('#backBtn').click();
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
    name: nameOf('fixture'),
    pass: missing.length === 0,
    detail: missing.length
      ? `${missing.length} precondition(s) missing on ${r.host}: ${missing.join('; ')}`
      : `${r.dayRows} players × ${r.dayGames} games today, ${r.filedGames} filed, `
        + `levels set (${r.host})`,
  };
}

/* #23: Today is home. Items 1, 2, 3, 4, 5, 6 and 8 of the spec's "what would
   settle it", on a RICH record reloaded with `view: 'today'` and a second
   team added (RICH ships with one, and the menu's "switch team" and
   checkmark need two to mean anything).
 *
 * Reloads its own fixture rather than reusing whatever `goRich` already left
 * on screen, because the item is explicitly about a FRESH BOOT onto Today,
 * and the history/reload assertions below need one anyway. Ends by putting
 * the ordinary RICH record back (`view: 'games'`, one team) so whatever runs
 * after it inherits the fixture every other 'rich' check expects — the same
 * courtesy `wakeLockPass` pays with its own reload. */
async function todayAndBackPass(c, origin) {
  const problems = [];
  /* Every DOM read below is written so a MISSING control is a named problem,
     never a thrown exception -- a check that crashes on a control that does
     not exist yet reports nothing about the controls that DO. `onToday`,
     `text`/`click` and the object literals all guard with `?.` for the same
     reason `/new-guard` names: a check that measures nothing must fail
     loudly, not disappear into an unhandled rejection. The whole body is
     also wrapped in a `try` below, as a last line of defence, not a
     substitute for the guards. */
  const onToday = () => onScreen(c, 'view-today');
  const rich2 = withSecondTeam(RICH);
  rich2.view = 'today';
  // `Page.navigate` to the exact URL already loaded does not truncate the
  // forward session-history entries the way `reloadWithRecord`'s genuinely
  // new navigation does -- verified: a `today` -> `team` push straight after
  // it read as +0, not +1, because a stale forward entry from the PREVIOUS
  // opener's own reload-and-back test absorbed the push instead of growing
  // the list. Every reload below needs that, so every reload below uses it.
  const reloadWith = record => reloadWithRecord(c, origin, record);
  try {

  await reloadWith(rich2);
  const href0 = await evalIn(c, 'location.href');

  // item 1: Today's own contents.
  const today = JSON.parse(await evalIn(c, `JSON.stringify((() => {
    const $ = s => document.querySelector(s);
    const gear = $('#settingsBtn');
    const t = s => $(s)?.textContent.trim() ?? null;
    return {
      teamBtn: t('#teamBtnLabel'),
      gearName: gear && gear.getAttribute('aria-label'),
      heading: t('#view-today h1'),
      games: [...document.querySelectorAll('.today-game')].map(b => ({
        text: b.textContent.trim(), label: b.getAttribute('aria-label') })),
      teamEntry: t('#todayTeam'),
      seasonEntry: t('#todaySeason'),
      hasAddGame: !!$('#todayAddGame'), hasNewDay: !!$('#todayNewDay'),
      keysHintExists: !!$('#keysHint'),
    };
  })())`));
  // `activeTeam: 0` in `rich2` is still "Smoke Test" -- "JV Ravens" is the
  // second team, added so the menu below has something to switch to.
  if (today.teamBtn !== 'Smoke Test') problems.push(`Today's header names "${today.teamBtn}", not the active team`);
  if (today.gearName !== 'Settings') problems.push(`the gear's accessible name is "${today.gearName}", not "Settings"`);
  if (today.heading !== 'Today') problems.push(`Today's heading reads "${today.heading}"`);
  if (today.games.length !== 2) problems.push(`Today lists ${today.games.length} game entries, want 2`);
  if (!today.games.some(g => /Hawks/.test(g.text) && /9:00/.test(g.text))) problems.push('the first game entry does not name "Hawks" and "9:00"');
  if (!today.games.some(g => /Ravens/.test(g.text) && /11:30/.test(g.text))) problems.push('the second game entry does not name "Ravens" and "11:30"');
  if (!/Team/.test(today.teamEntry) || !/Smoke Test/.test(today.teamEntry) || !/11 players/.test(today.teamEntry)) {
    problems.push(`the Team entry reads "${today.teamEntry}", want "Team", the team name and "11 players"`);
  }
  if (!/Season/.test(today.seasonEntry) || !/3 games filed/.test(today.seasonEntry)) {
    problems.push(`the Season entry reads "${today.seasonEntry}", want "Season" and "3 games filed"`);
  }
  if (!today.hasAddGame || !today.hasNewDay) problems.push('Today is missing "Add a game" or "New day"');
  if (!today.keysHintExists) problems.push('#keysHint is gone from Today\'s header');

  /* #23 review, third round: opening a DIFFERENT game from Today has to show
     THAT game, not whichever one the Game screen last painted. `setView`
     only ever toggled visibility and the header title -- the opponent input
     and the card are their own sections, repainted by `render()`, and
     nothing called it here. Opens Hawks first (index 0, the same game the
     fixture already boots on, so this alone cannot tell a real repaint from
     no repaint at all), backs out, opens Ravens (index 1 -- the one a stale
     screen would still be showing Hawks on), then backs out and reopens
     Hawks -- the same staleness the other way, so a fix that only handles
     "index 0 -> 1" cannot pass by accident. */
  const gameScreen = async (label) => {
    const r = JSON.parse(await evalIn(c, `JSON.stringify({
      opp: document.getElementById('label')?.value ?? null,
      card: document.querySelector('.card .opp')?.textContent ?? null,
    })`));
    return { label, ...r };
  };
  await evalIn(c, step(`document.querySelectorAll('.today-game')[0]?.click()`));
  const hawks1 = await gameScreen('Hawks (first open)');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelectorAll('.today-game')[1]?.click()`));
  const ravens = await gameScreen('Ravens');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelectorAll('.today-game')[0]?.click()`));
  const hawks2 = await gameScreen('Hawks (reopened)');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  for (const [want, got] of [[/Hawks/i, hawks1], [/Ravens/i, ravens], [/Hawks/i, hawks2]]) {
    if (!want.test(got.opp || '')) {
      problems.push(`${got.label}: the opponent input reads "${got.opp}", want it to name ${want}`);
    }
    if (!want.test(got.card || '')) {
      problems.push(`${got.label}: the card header reads "${got.card}", want it to name ${want}`);
    }
  }

  // item 2: the team menu -- two teams, current one checked, Add a team offered.
  await evalIn(c, step(`
    $('#teamBtn')?.click();
    window.__menuItems = () => [...document.querySelectorAll('.teammenu-item')];
  `));
  const menu = JSON.parse(await evalIn(c, `JSON.stringify({
    items: window.__menuItems().map(b => ({
      text: b.textContent.trim(), current: b.getAttribute('aria-current'),
    })),
  })`));
  if (menu.items.length !== 3) {
    problems.push(`the team menu lists ${menu.items.length} item(s), want 2 teams + "Add a team"`);
  } else {
    const [t0, t1, add] = menu.items;
    if (t0.current !== 'true' || !/Smoke Test/.test(t0.text) || !/✓/.test(t0.text)) {
      problems.push(`the first menu item is "${JSON.stringify(t0)}", want the current team checked`);
    }
    if (t1.current) problems.push(`the second menu item carries aria-current, and should not — it is not the active team`);
    if (!/Add a team/.test(add.text)) problems.push(`the last menu item reads "${add.text}", not "Add a team"`);
  }

  /* Item 2, C8: "a popover menu anchored to it" -- the button, not a fixed
     point on the screen. Read both rects fresh each time rather than trust
     an earlier measurement: `positionTeamMenu()` runs on the popover's own
     `toggle` event, so a stale position would mean it never ran, not that it
     ran wrong. Checked at the default viewport and again at 320px/32px root
     text -- the one place `APP_LARGE_TEXT_ALLOW` stays empty and a fixed rem
     offset would drift furthest from the button it is supposed to track. */
  const checkMenuAnchored = async (label) => {
    const pos = JSON.parse(await evalIn(c, `JSON.stringify((() => {
      const b = document.getElementById('teamBtn')?.getBoundingClientRect();
      const m = document.getElementById('teamMenu')?.getBoundingClientRect();
      if (!b || !m || (!m.width && !m.height)) return null;
      return { btnBottom: b.bottom, btnLeft: b.left, menuTop: m.top, menuLeft: m.left,
               vw: innerWidth, menuW: m.width };
    })())`));
    if (!pos) { problems.push(`${label}: could not measure an open #teamBtn/#teamMenu pair`); return; }
    const dTop = pos.menuTop - pos.btnBottom;
    if (dTop < -1 || dTop > 16) {
      problems.push(`${label}: the menu's top is ${pos.menuTop.toFixed(1)}px against the button's `
        + `bottom at ${pos.btnBottom.toFixed(1)}px (Δ${dTop.toFixed(1)}px) -- not anchored just below it`);
    }
    const wantLeft = Math.max(8, Math.min(pos.btnLeft, pos.vw - 8 - pos.menuW));
    if (Math.abs(pos.menuLeft - wantLeft) > 1) {
      problems.push(`${label}: the menu's left is ${pos.menuLeft.toFixed(1)}px, want `
        + `${wantLeft.toFixed(1)}px (the button's left edge, clamped on screen)`);
    }
  };
  await checkMenuAnchored(`${WIDTH}px`);

  /* Today's own hierarchy (#23 review, item 2): the PRIMARY label in each
     row -- a game's own name, "Team", "Season" -- has to stay at least as
     large as the secondary text beside it (a tip-off time, a player count),
     at every text size, not just the one the app was eyeballed at. `.btn`
     and `#teamBtnLabel`'s own `.95rem` already scale with the root; the two
     labels checked here were the ones that did not (both inherited the
     body's bare `15px`, an absolute unit a reader's "bigger text" setting
     cannot touch, while their secondary text already used `rem`). */
  const checkLabelHierarchy = async (label) => {
    const sizes = JSON.parse(await evalIn(c, `JSON.stringify((() => {
      const size = s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
      return {
        gameLb: size('.today-game-lb'), gameWhen: size('.today-game-when'),
        entryLab: size('.today-entry-lab'), entrySub: size('.today-entry-sub'),
      };
    })())`));
    if (sizes.gameLb == null || sizes.gameWhen == null) {
      problems.push(`${label}: could not measure .today-game-lb/.today-game-when`);
    } else if (sizes.gameLb < sizes.gameWhen) {
      problems.push(`${label}: .today-game-lb is ${sizes.gameLb}px, smaller than `
        + `.today-game-when's ${sizes.gameWhen}px -- the game's own name reads smaller than its tip-off`);
    }
    if (sizes.entryLab == null || sizes.entrySub == null) {
      problems.push(`${label}: could not measure .today-entry-lab/.today-entry-sub`);
    } else if (sizes.entryLab < sizes.entrySub) {
      problems.push(`${label}: .today-entry-lab is ${sizes.entryLab}px, smaller than `
        + `.today-entry-sub's ${sizes.entrySub}px -- "Team"/"Season" reads smaller than their own subtitle`);
    }
  };
  await checkLabelHierarchy(`${WIDTH}px`);

  await evalIn(c, step(`document.getElementById('teamMenu')?.hidePopover?.()`));
  try {
    await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
    await checkLabelHierarchy(`${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`);
    await evalIn(c, step(`document.getElementById('teamBtn')?.click()`));
    await checkMenuAnchored(`${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`);
    await evalIn(c, step(`document.getElementById('teamMenu')?.hidePopover?.()`));
  } finally {
    // Never leave the emulated viewport/font behind for whatever check runs
    // next, even if a measurement above threw.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
  await evalIn(c, step(`document.getElementById('teamBtn')?.click()`));

  // switching team closes the menu and repaints Today, not the menu mid-tap
  await evalIn(c, step(`window.__menuItems()[1]?.click()`));
  const afterSwitch = await evalIn(c, `document.getElementById('teamBtnLabel')?.textContent.trim() ?? null`);
  if (afterSwitch !== 'JV Ravens') problems.push(`choosing the other team left the header reading "${afterSwitch}"`);
  const menuStillOpen = await evalIn(c, `document.getElementById('teamMenu')?.matches(':popover-open') ?? false`);
  if (menuStillOpen) problems.push('the team menu is still open after choosing a team');

  /* Item 3/4/5/6/8, #23 review third round: the HEADER is part of the first
     frame too, not just the `<main>` the pre-paint rules already swap. Runs
     from inside the page itself, installed via `addScriptToEvaluateOnNewDocument`
     so it is there for the reload's very first `requestAnimationFrame` --
     anything measured by a round trip out to this Node process and back would
     already be looking at a frame `applyView` has long since fixed. Removed
     again straight after each read, same as `firstRun`/`tryLanding` above:
     left registered it would go on recording (uselessly, and not for free)
     for every check that reloads after this one. */
  const FIRST_FRAME_SCRIPT = `(() => {
    window.__firstFrames = [];
    // checkVisibility, not getComputedStyle on the element itself: the fix
    // hides #barToday and leaves #settingsBtn's OWN display untouched, relying
    // on the ancestor to take it out of rendering -- own-display alone would
    // read the gear as shown right through a correct fix.
    const vis = id => { const e = document.getElementById(id);
      return !!e && e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }); };
    const read = () => ({ boot: document.documentElement.getAttribute('data-boot'),
      barToday: vis('barToday'), barBack: vis('barBack'), gear: vis('settingsBtn'), backBtn: vis('backBtn') });
    let n = 0;
    const tick = () => { window.__firstFrames.push(read()); if (++n < 12) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })();`;
  const recordFirstFrames = async (reload) => {
    const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FIRST_FRAME_SCRIPT });
    try {
      await reload();
      return JSON.parse(await evalIn(c, `JSON.stringify(window.__firstFrames || [])`));
    } finally {
      await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  };

  // items 3, 4, 5, 6, 8: each pushed screen, its header, and its way home.
  const openers = [
    ['games', `document.querySelector('.today-game')?.click()`, 'Hawks'],
    ['team', `document.getElementById('todayTeam')?.click()`, 'Team'],
    ['season', `document.getElementById('todaySeason')?.click()`, 'Season'],
    ['settings', `document.getElementById('settingsBtn')?.click()`, 'Settings'],
  ];
  for (const [name, openJs, wantTitle] of openers) {
    /* Fresh boot per opener, or the delta below is measured against whatever
       forward entry the PREVIOUS opener's own reload-then-back left dangling
       -- pushing after a back() truncates a stale forward entry and replaces
       it, which is correct browser history behaviour and exactly why a length
       delta is only a meaningful measurement starting from a known state. */
    await reloadWith(rich2);
    const before = await evalIn(c, 'history.length');
    await evalIn(c, step(openJs));
    const opened = JSON.parse(await evalIn(c, `JSON.stringify((() => {
      const $ = s => document.querySelector(s);
      const back = $('#backBtn');
      const gear = $('#settingsBtn');
      return {
        length: history.length,
        backName: back && back.getAttribute('aria-label'),
        title: $('#barTitle')?.textContent.trim() ?? null,
        gearVisible: !!gear && gear.getClientRects().length > 0 && getComputedStyle(gear).display !== 'none',
        href: location.href,
      };
    })())`));
    if (opened.length !== before + 1) problems.push(`${name}: history.length went ${before} -> ${opened.length}, want +1`);
    if (opened.backName !== 'Back to Today') problems.push(`${name}: the back button's name is "${opened.backName}"`);
    if (name !== 'games' && opened.title !== wantTitle) problems.push(`${name}: the title reads "${opened.title}", want "${wantTitle}"`);
    if (name === 'games' && !/Hawks/.test(opened.title || '')) problems.push(`games: the title reads "${opened.title}", want the game's label`);
    if (opened.gearVisible) problems.push(`${name}: the Settings gear is visible off Today`);
    if (opened.href !== href0) problems.push(`${name}: location.href changed to ${opened.href}`);

    // history.back() lands on Today.
    await evalIn(c, `history.back()`);
    await new Promise(r => setTimeout(r, 200));
    await evalIn(c, SETTLE);
    if (!(await onToday())) problems.push(`${name}: history.back() did not land on Today`);

    // reopen, then use the back BUTTON, which must land on Today too.
    await evalIn(c, step(openJs));
    await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
    if (!(await onToday())) problems.push(`${name}: the back button did not land on Today`);
    const hrefAfter = await evalIn(c, 'location.href');
    if (hrefAfter !== href0) problems.push(`${name}: location.href changed to ${hrefAfter} after the back button`);

    // opening one pushed screen from another replaces, not pushes: the four
    // openers above all start from Today, so this exercises it from `team`
    // specifically, the same "P on Team" case the design calls out — printing
    // is stubbed so it never opens a real dialog.
    if (name === 'team') {
      await evalIn(c, step(openJs));
      const pushedLength = await evalIn(c, 'history.length');
      await evalIn(c, `window.print = () => {}`);
      await evalIn(c, step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))`));
      const replacedLength = await evalIn(c, 'history.length');
      if (replacedLength !== pushedLength) {
        problems.push(`P from Team changed history.length ${pushedLength} -> ${replacedLength}, want no change (replace, not push)`);
      }
      await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
    }

    /* Reloading a pushed screen resets the module's in-memory `shown`/`pushed`
       to null/false, but not the tab's session history -- boot has to read
       `history.state` to tell "this entry already IS the pushed screen" from
       a fresh tab, or it stacks a dead Today entry under the reopened one
       every time. Reloading TWICE and then backing out TWICE catches what
       reloading once and backing out once can't: after a single reload the
       first `history.back()` lands on Today either way, because there is at
       most one dead entry to absorb it; a second reload adds a second dead
       entry, so a fix that only relabels instead of also pushing shows up as
       `history.length` growing between the two reloads, and as the second
       `history.back()` landing on yet another Today instead of actually
       leaving. */
    await evalIn(c, step(openJs));
    const reloadOnce = async () => {
      const reloaded = new Promise(ok => c.on('Page.loadEventFired', ok));
      await evalIn(c, `location.reload()`);
      await reloaded;
      await evalIn(c, `(async () => { await document.fonts.ready;
        for (let i = 0; i < 60 && !document.querySelector('.today-game, #barBack'); i++) await new Promise(r => setTimeout(r, 50));
        await ${SETTLE}; })()`);
      return evalIn(c, 'history.length');
    };
    const firstFrames = await recordFirstFrames(reloadOnce);
    /* The pre-paint stamp names the screen (`data-boot="games"` etc.) until
       `applyView` removes it a moment later -- exactly the window a coach's
       eyes, not just a round trip out to this process, would catch #barToday
       or the gear sitting over the wrong screen. A frame recorded AFTER that
       attribute is gone is a frame `applyView` has already fixed, and is not
       evidence of anything. */
    const pushedFrames = firstFrames.filter(f => f.boot && f.boot !== 'welcome' && f.boot !== 'today');
    const todayShowing = pushedFrames.find(f => f.barToday);
    if (todayShowing) {
      problems.push(`${name}: a first frame over data-boot="${todayShowing.boot}" still shows `
        + `#barToday (${JSON.stringify(todayShowing)})`);
    }
    const gearShowing = pushedFrames.find(f => f.gear);
    if (gearShowing) {
      problems.push(`${name}: a first frame over data-boot="${gearShowing.boot}" still shows `
        + `the Settings gear (${JSON.stringify(gearShowing)})`);
    }
    if (!firstFrames.length) {
      problems.push(`${name}: no first frames were recorded across the reload`);
    } else if (!firstFrames[0].backBtn) {
      problems.push(`${name}: the first recorded frame does not show #backBtn (${JSON.stringify(firstFrames[0])})`);
    }
    const lenAfterReload1 = await evalIn(c, 'history.length');
    const lenAfterReload2 = await reloadOnce();
    if (lenAfterReload2 !== lenAfterReload1) {
      problems.push(`${name}: a second reload on the pushed screen grew history.length `
        + `${lenAfterReload1} -> ${lenAfterReload2}, want no growth`);
    }
    const hrefAfterReloads = await evalIn(c, 'location.href');

    // one `history.back()` from the twice-reloaded pushed screen lands on
    // Today -- still the same document, a same-page pushState/replaceState
    // entry, not a navigation.
    await evalIn(c, `history.back()`);
    await new Promise(r => setTimeout(r, 200));
    await evalIn(c, SETTLE);
    if (!(await onToday())) {
      problems.push(`${name}: two reloads then one history.back() did not land on Today `
        + `(history.length was ${lenAfterReload1} -> ${lenAfterReload2})`);
    }

    // a SECOND `history.back()` has to leave for good: the entry before the
    // one boot ever created for this document, a real navigation to a
    // different document (`location.href` changes), not another Today.
    await evalIn(c, `history.back()`);
    let hrefAfterSecondBack = hrefAfterReloads;
    for (let i = 0; i < 40 && hrefAfterSecondBack === hrefAfterReloads; i++) {
      await new Promise(r => setTimeout(r, 50));
      hrefAfterSecondBack = await evalIn(c, 'location.href').catch(() => hrefAfterSecondBack);
    }
    if (hrefAfterSecondBack === hrefAfterReloads) {
      problems.push(`${name}: a second history.back() after Today stayed on `
        + `${hrefAfterSecondBack} instead of leaving for the previous document`);
    }
  }

  await reloadWith(RICH);
  } catch (e) {
    problems.push(`threw before finishing: ${e.message.split('\n')[0]}`);
  }
  return {
    name: nameOf('todayback'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}`
      : `Today's contents, the team menu (switch, checkmark, Add a team), the gear off Today, `
        + `and history.back()/#backBtn/a reload all landing on Today across games/team/season/settings, `
        + `location.href unchanged throughout`,
  };
}

/* #23: Today's keyboard shortcuts and its undo-backed actions. Items 9 and
   11. Runs against the standard RICH record (`view: 'games'`, one team --
   whatever the previous check left the fixture as), so it starts by
   returning to Today itself rather than assuming it is already there. */
async function todayKeysAndUndoPass(c, origin) {
  const problems = [];
  // Guarded the same way `todayAndBackPass` is: a missing control is a named
  // problem below, never a thrown exception.
  const key = k => step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}' }))`);
  const onToday = () => onScreen(c, 'view-today');
  const onGames = () => onScreen(c, 'view-games');
  try {

  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  if (!(await onToday())) problems.push('could not reach Today to start the check');

  // V on Today opens Team; V on Team returns to Today.
  await evalIn(c, key('v'));
  const onTeam = await evalIn(c, `!!(document.getElementById('view-team') && !document.getElementById('view-team').hidden)`);
  if (!onTeam) problems.push('V on Today did not open Team');
  await evalIn(c, key('v'));
  if (!(await onToday())) problems.push('V on Team did not return to Today');

  // P from Today opens the game and "prints" it (stubbed).
  await evalIn(c, `window.__printed = 0; window.print = () => { window.__printed++; }`);
  await evalIn(c, key('p'));
  const printedFromToday = await evalIn(c, 'window.__printed');
  const onGamesAfterP = await onGames();
  if (!onGamesAfterP) problems.push('P from Today did not open the game');
  if (printedFromToday !== 1) problems.push(`P from Today called window.print() ${printedFromToday} time(s), want 1`);

  // S and B are inert off the Game screen; back to Today to prove it there.
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, key('s'));
  const gmOpenAfterS = await evalIn(c, `!!(document.getElementById('gamemode') && !document.getElementById('gamemode').hidden)`);
  await evalIn(c, key('b'));
  const gmOpenAfterB = await evalIn(c, `!!(document.getElementById('gamemode') && !document.getElementById('gamemode').hidden)`);
  if (gmOpenAfterS || gmOpenAfterB) problems.push('S or B did something off the Game screen, where neither is wired');
  if (!(await onToday())) problems.push('S/B moved the screen off Today');

  // New day + Undo on Today.
  const gamesBefore = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  await evalIn(c, step(`document.getElementById('todayNewDay')?.click()`));
  const gamesAfterNewDay = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  const stillTodayAfterNewDay = await onToday();
  const undoShown = await evalIn(c, `!!document.querySelector('#toasts .toast[data-undo]')`);
  if (!undoShown) problems.push('New day did not show an Undo toast');
  if (!stillTodayAfterNewDay) problems.push('New day left Today');
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const gamesAfterUndo = await evalIn(c, `document.querySelectorAll('.today-game').length`);
  if (gamesAfterUndo !== gamesBefore) {
    problems.push(`New day + Undo left ${gamesAfterUndo} game(s), started with ${gamesBefore}`);
  }
  if (!(await onToday())) problems.push('undoing New day left Today');

  // Add a game opens the new game's own screen.
  await evalIn(c, step(`document.getElementById('todayAddGame')?.click()`));
  const onGamesAfterAdd = await onGames();
  if (!onGamesAfterAdd) problems.push('Add a game did not open the new game\'s screen');
  const titleAfterAdd = await evalIn(c, `document.getElementById('barTitle')?.textContent.trim()`);
  if (!/Game \d/.test(titleAfterAdd) && !/Hawks|Ravens/.test(titleAfterAdd)) {
    problems.push(`the new game's title reads "${titleAfterAdd}"`);
  }

  // Remove this game -> Today -> Undo -> that game's screen again.
  /* #23 review, item A: the click and the FIRST read happen in one
     `evalIn` call, with nothing awaited in between -- so this measures
     what is true the instant the synchronous click handler returns, before
     the page has had a chance to paint a frame or run a microtask. Before
     the fix, `setView('today')` returned immediately on `history.back()`
     and left the actual screen change to the async `popstate` that
     followed, so `#view-games` was still visible and `state.view` (and the
     saved record) still said 'games' right here -- a real, reachable,
     reload-durable mid-transition state, not a rendering nicety. */
  const immediate = JSON.parse(await evalIn(c, `(async () => {
    document.getElementById('removeGame')?.click();
    const hiddenNow = document.getElementById('view-games')?.hidden;
    const { state } = await import('${origin}/state.js');
    const viewNow = state.view;
    let savedView = null;
    try { savedView = JSON.parse(localStorage.getItem('benchcard.v6')).view; } catch {}
    return JSON.stringify({ hiddenNow, viewNow, savedView });
  })()`));
  if (immediate.hiddenNow !== true) {
    problems.push(`Remove this game: #view-games.hidden is ${immediate.hiddenNow} immediately after the click, want true`);
  }
  if (immediate.viewNow !== 'today') {
    problems.push(`Remove this game: state.view is "${immediate.viewNow}" immediately after the click, want "today"`);
  }
  if (immediate.savedView !== 'today') {
    problems.push(`Remove this game: the saved record's view is "${immediate.savedView}" immediately after the click, want "today"`);
  }
  await evalIn(c, SETTLE);
  const onTodayAfterRemove = await onToday();
  const undoShown2 = await evalIn(c, `!!document.querySelector('#toasts .toast[data-undo]')`);
  if (!onTodayAfterRemove) problems.push('Remove this game did not return to Today');
  if (!undoShown2) problems.push('Remove this game did not show an Undo toast');
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const onGamesAfterUndoRemove = await onGames();
  const titleAfterUndoRemove = await evalIn(c, `document.getElementById('barTitle')?.textContent.trim()`);
  if (!onGamesAfterUndoRemove) problems.push('undoing Remove this game did not reopen that game\'s screen');
  if (titleAfterUndoRemove !== titleAfterAdd) {
    problems.push(`undoing Remove this game reopened "${titleAfterUndoRemove}", not "${titleAfterAdd}"`);
  }
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Remove team + Undo -> Settings. A SECOND team first: RICH ships with
  // one, and removing the LAST team is a different, welcome-bound case
  // (item 11's own parenthetical) that this check is not about.
  await reloadWithRecord(c, origin, withSecondTeam(RICH));

  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  await evalIn(c, step(`document.getElementById('removeTeam')?.click()`));
  await evalIn(c, step(`document.getElementById('confirmYes')?.click()`));
  const onTodayAfterRemoveTeam = await onToday();
  if (!onTodayAfterRemoveTeam) problems.push('removing the team did not return to Today');
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const onSettingsAfterUndo = await evalIn(c, `!!(document.getElementById('view-settings') && !document.getElementById('view-settings').hidden)`);
  if (!onSettingsAfterUndo) problems.push('undoing the team removal did not return to Settings');
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  /* #23 review, item B: removing the LAST team on a single-team record
     (RICH ships with one), so this is the welcome-bound case the two-team
     test above deliberately is not. Going to welcome touches no history at
     all, so the `Settings` entry the coach was standing on stays live in
     the session history -- and the physical back button (simulated with a
     real `history.back()`, not `setView`) must still be able to land on
     it. Before the fix, `popstate` applied whatever `e.state` named with no
     onboarding check, painting a stale Settings (or Today) over an app that
     no longer has a team. */
  await reloadWithRecord(c, origin, RICH);
  await evalIn(c, step(`document.getElementById('settingsBtn')?.click()`));
  await evalIn(c, step(`document.getElementById('removeTeam')?.click()`));
  await evalIn(c, step(`document.getElementById('confirmYes')?.click()`));
  const onWelcomeAfterLastRemove = await evalIn(c,
    `!!(document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden)`);
  if (!onWelcomeAfterLastRemove) problems.push('removing the last team did not show the welcome screen');

  await evalIn(c, `history.back()`);
  await evalIn(c, SETTLE);
  const stillWelcomeAfterBack = await evalIn(c,
    `!!(document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden)`);
  const todayHiddenAfterBack = await evalIn(c, `document.getElementById('view-today')?.hidden`);
  if (!stillWelcomeAfterBack) problems.push('history.back() after removing the last team left welcome for a stale screen');
  if (todayHiddenAfterBack !== true) {
    problems.push(`#view-today.hidden is ${todayHiddenAfterBack} after history.back() with no team left, want true`);
  }

  // Undo from welcome restores Settings, on the SAME [Today, Settings] pair
  // -- not a third entry stacked on top of the one the coach was already
  // standing on.
  const beforeUndoLen = await evalIn(c, `history.length`);
  await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
  const onSettingsAfterLastUndo = await evalIn(c,
    `!!(document.getElementById('view-settings') && !document.getElementById('view-settings').hidden)`);
  const afterUndoLen = await evalIn(c, `history.length`);
  if (!onSettingsAfterLastUndo) problems.push('undoing the removal of the last team did not restore Settings');
  if (afterUndoLen !== beforeUndoLen) {
    problems.push(`undoing the removal of the last team changed history.length ${beforeUndoLen} -> `
      + `${afterUndoLen}, want no change (the same [Today, Settings] pair, not a third entry)`);
  }
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  /* #23 review, third round: two more paths that change `state.activeGame`
     (or which game a fresh Games screen has to show) and then show a screen
     without a render of their own -- `addGame` and `printCard`. A fresh
     reload of RICH (two games, Hawks and Ravens) rather than trusting
     whatever the checks above left behind, since both need a KNOWN
     activeGame to start from. */
  await reloadWithRecord(c, origin, RICH);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Add a game opens the new game's own, still-empty opponent input -- not
  // whichever game (Hawks, activeGame 0) the Games screen last painted.
  await evalIn(c, step(`document.getElementById('todayAddGame')?.click()`));
  const addedOpp = await evalIn(c, `document.getElementById('label')?.value ?? null`);
  if (addedOpp !== '') problems.push(`Add a game: the opponent input reads "${addedOpp}", want it empty (the new game's own)`);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // P from Today, with activeGame already moved to the second game (Ravens)
  // by a Today entry, prints the card THAT entry would open, not whichever
  // one is still on screen from before. Its own fresh reload, not whatever
  // the Add-a-game step above left the Games screen painted with -- the
  // point is that the CARD reads Ravens, and starting from Hawks (the
  // fixture's own boot screen) says that unambiguously.
  await reloadWithRecord(c, origin, RICH);
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, step(`document.querySelectorAll('.today-game')[1]?.click()`));
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));
  await evalIn(c, `window.__printed = 0; window.print = () => { window.__printed++; }`);
  await evalIn(c, key('p'));
  const printedCard = await evalIn(c, `document.querySelector('.card .opp')?.textContent ?? null`);
  if (!/Ravens/i.test(printedCard || '')) {
    problems.push(`P from Today with the second game active printed a card reading "${printedCard}", want it to name Ravens`);
  }
  await evalIn(c, step(`document.getElementById('backBtn')?.click()`));

  // Same courtesy `todayAndBackPass` pays: leave RICH (one team, `view:
  // 'games'`) the way every other 'rich' check expects to find it.
  await reloadWithRecord(c, origin, RICH);

  } catch (e) {
    problems.push(`threw before finishing: ${e.message.split('\n')[0]}`);
  }
  return {
    name: nameOf('todaykeys'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}`
      : 'V both ways, P from Today (window.print stubbed), S/B inert off Games, New day + Undo, '
        + 'Add a game, Remove this game -> Today -> Undo -> that game, remove team + Undo -> Settings',
  };
}

/* #21 item 8: the UI no longer uses Inter, so nothing else on the page starts
   loading InterVar, and the coach's card must never stay sized for the
   fallback face app.js waited past. `app.js` loads `CARD_FONT` explicitly and
   re-fits once that settles (`AGENTS.md` § Traps names the general shape of
   this trap).

   THE CHECK: read `.five`'s on-screen font-size, then call the page's own
   `renderCards()` again -- dynamic-imported from `${origin}/card.js` (an
   absolute specifier, because a relative one would resolve against this
   Runtime.evaluate call's own base rather than the page and 404) so it is the
   SAME module instance operating on the SAME live state, not a
   reimplementation of the fit. By settle time `document.fonts.check(...)` is
   true either way (`.card`'s own CSS names InterVar, which starts the fetch
   with or without app.js's explicit call), so that alone proves nothing; the
   SIZE is the tell. If the size on screen already matches what a fresh fit
   produces now that the font is loaded, nothing was ever wrong; if it does
   not, the rendered card is still sized for a font it did not measure.

   WHAT THIS CATCHES, VERIFIED: deleting the whole `document.fonts...then(()
   => render('cards'))` block (so nothing ever re-fits) turns this row red --
   `.five` stays at its boot-time size while a fresh fit reports a different
   one. `node scripts/smoke.mjs --only "card font loads before the card is
   fitted"` printed FAIL with both numbers named; restoring the block turned
   it back to PASS.

   WHAT THIS DOES NOT CATCH, ALSO VERIFIED: swapping the explicit
   `document.fonts.load(...)` for a bare `document.fonts.ready` -- the exact
   wording of item 8's own mutation list -- stays GREEN here, including under
   `Network.emulateNetworkConditions` latency and `Network.setCacheDisabled`
   during a fresh reload. The reason: `card.js`'s own canvas `measureText`
   call, which runs synchronously during the very first `renderCards()` at
   boot (before either promise is even read), already asks Chromium to load
   InterVar -- canvas text measurement triggers font loading same as CSS does.
   By the time app.js's own `document.fonts.ready` is evaluated, that load is
   already pending, so `.ready` wants the same thing `.load(CARD_FONT)` wants
   and resolves at the same real moment. Chromium is the only engine this
   harness can drive (`/browser-verify` says so), and the CSS Font Loading
   spec leaves exactly how eagerly a font starts loading up to the engine, so
   this may be a real, narrower race in Safari/WebKit that this check cannot
   see. Reported rather than hidden behind a check that would only ever be
   green. */
async function cardFontPass(c, origin) {
  const probe = await evalIn(c, `(async () => {
    const five = document.querySelector('.card .five');
    if (!five) return JSON.stringify({ error: 'no .card .five in the DOM' });
    const before = getComputedStyle(five).fontSize;
    const loaded = document.fonts.check('800 16px InterVar');
    const mod = await import(${JSON.stringify(origin)} + '/card.js');
    mod.renderCards();
    const again = document.querySelector('.card .five');
    const after = again ? getComputedStyle(again).fontSize : null;
    return JSON.stringify({ loaded, before, after });
  })()`);
  const r = JSON.parse(probe);
  const problems = [];
  if (r.error) problems.push(r.error);
  else {
    if (!r.loaded) problems.push('document.fonts.check(\'800 16px InterVar\') is false after settle');
    if (r.after === null) problems.push('no .card .five left in the DOM after re-rendering');
    else if (r.before !== r.after) {
      problems.push(`.five was fitted at ${r.before} but the loaded font fits it at ${r.after} — `
        + 'the card was sized before InterVar arrived and never re-fit');
    }
  }
  return {
    name: nameOf('cardfont'),
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `InterVar loaded, .five stays at ${r.before} once it has`,
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
  /* Today is home (#23): every state below opens from it and every `close`
     returns to it (`#backBtn`), which is the same "one baseline" contract the
     old states kept with the games view. */
  { name: 'team view',
    open: `$('#todayTeam').click()`, shows: '#view-team',
    close: `$('#backBtn').click()` },
  { name: 'team + bulk add',
    open: `$('#todayTeam').click(); $('#bulktoggle').click()`, shows: '#bulkwrap',
    close: `$('#bulktoggle').click(); $('#backBtn').click()` },
  { name: 'games view, every disclosure open',
    open: `$('.today-game').click(); for (const d of document.querySelectorAll('details')) d.open = true`,
    shows: '#squadFold[open]',
    close: `for (const d of document.querySelectorAll('details')) d.open = false; $('#backBtn').click()` },
  { name: 'season view',
    open: `$('#todaySeason').click()`, shows: '#view-season',
    close: `$('#backBtn').click()` },
  /* No `season view, every game open` state, deliberately: the harness's record
     has a day but no FILED games, so the ledger has no folds to open, and
     seeding four of them would put ~250 nodes on a cold load that is budgeted
     to 40 of slack. The rows inside a game block are the same `.sn-row` markup
     as the totals list above them, which this state does measure. */
  { name: 'settings view',
    open: `$('#settingsBtn').click()`, shows: '#view-settings',
    close: `$('#backBtn').click()` },
  { name: 'settings view, paste box open',
    open: `$('#settingsBtn').click(); $('#view-settings .paste-open').click()`,
    shows: '#view-settings .pastebox',
    // not through `.paste-go`: an empty textarea is a rejected restore, which
    // leaves the box open and the state uncloseable
    close: `$('#view-settings .pastebox').hidden = true;
            $('#view-settings .paste-open').hidden = false;
            $('#backBtn').click()` },
  /* `?` and the theme toggle left the top bar for Settings, so these three no
     longer reach `#helpBtn` from the opening screen. Clicking a button inside a
     hidden view still fires its handler, so leaving them alone would have kept
     every one of them green while auditing a control no coach could reach --
     a check passing for the wrong reason. The cog comes first now. */
  { name: 'help sheet',
    open: `$('#settingsBtn').click(); $('#helpBtn').click()`, shows: '#help',
    close: `$('#helpClose').click(); $('#backBtn').click()` },
  { name: 'shortcuts sheet',
    open: `$('#keysHint').click()`, shows: '#keys', close: `$('#keysClose').click()` },
  /* The tour puts itself on the games view before it points at anything
     (`startTour`), so it lands there regardless of where it was opened from;
     `#backBtn` is what returns to Today afterwards now that Today, not games,
     is the baseline every other state assumes. */
  { name: 'tour, first step',
    open: `$('#settingsBtn').click(); $('#helpBtn').click(); $('#helpTour').click()`,
    shows: '#tour', close: `$('#tourSkip').click(); $('#backBtn').click()` },
  { name: 'tour, last step',
    open: `$('#settingsBtn').click(); $('#helpBtn').click(); $('#helpTour').click();
           while (!$('#tourSkip').hidden) $('#tourNext').click()`,
    shows: '#tour', close: `$('#tourNext').click(); $('#backBtn').click()` },
  /* `#gmOpen` lives inside the games view, but clicking a control inside a
     hidden view still fires its handler (same rule `#print`'s own note
     relies on), so this opens bench mode straight from Today without first
     navigating to a game. */
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
    name: nameOf('overlay'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${visited.length}/${STATES.length} states (${forced} shown by hand), `
        + `${widest} controls at the widest, all named and resolving`,
  };
}

/* #20: hold a screen wake lock while bench mode is on screen, release it the
   moment it is not. `navigator.wakeLock` is replaced in-page with a fake that
   counts `request('screen')` calls and hands back sentinels whose `release()`
   flips `released` -- real `WakeLockSentinel`s do the same. Seven scenarios,
   each its own assertion so a failure names the numbers instead of "it broke
   somewhere". Runs on the RICH fixture, after `fixturePass`, and reloads it
   (`goRich`) on the way out so nothing downstream inherits the stub. */
async function wakeLockPass(c, origin, consoleErrors) {
  const problems = [];
  const nums = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  /* `mode`: 'immediate' resolves the request on the spot, 'deferred' parks it
     in `window.__wl.pending` until `resolveOne()` is called, 'reject' turns
     every request into a rejected NotAllowedError -- the one real rejection
     reason a coach's browser gives for this API.

     Headless Chrome ships its own `navigator.wakeLock` (a [SameObject]
     readonly accessor on `Navigator.prototype`), so a plain
     `navigator.wakeLock = {...}` is a silent no-op in sloppy-mode script --
     the assignment has no setter to run and CDP's top-level eval is not
     strict. `Object.defineProperty` on the `navigator` instance shadows it
     with an own property instead, which works regardless. */
  const install = mode => evalIn(c, `(() => {
    window.__wlAllTypes = window.__wlAllTypes || [];
    window.__wl = { requests: 0, granted: [], pending: [], mode: ${JSON.stringify(mode)} };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
      request(type) {
        window.__wl.requests++;
        window.__wlAllTypes.push(type);
        if (window.__wl.mode === 'reject') {
          return Promise.reject(new DOMException('denied by the test stub', 'NotAllowedError'));
        }
        const s = { released: false, release() {
          if (window.__wl.mode === 'reject-release') {
            return Promise.reject(new DOMException('release failed by the test stub', 'AbortError'));
          }
          this.released = true;
          return Promise.resolve();
        } };
        window.__wl.granted.push(s);
        if (window.__wl.mode === 'deferred') {
          return new Promise(resolve => window.__wl.pending.push({ resolve: () => resolve(s) }));
        }
        return Promise.resolve(s);
      },
    } });
    return 1;
  })()`);

  // Resolves the oldest still-pending request, then yields a turn so the
  // page's own `.then` runs before we read state back out.
  const resolveOne = () => evalIn(c, `(async () => {
    const p = window.__wl.pending.shift();
    if (!p) return false;
    p.resolve();
    await new Promise(r => setTimeout(r, 0));
    return true;
  })()`);

  const wl = () => evalIn(c, `JSON.stringify({
    requests: window.__wl.requests,
    granted: window.__wl.granted.length,
    unreleased: window.__wl.granted.filter(x => !x.released).length,
  })`).then(JSON.parse);

  // The browser drops the lock silently on hide; there is no event for it
  // beyond `visibilitychange` itself, so the fake mimics the drop by hand and
  // this shadows `document.visibilityState` to drive the listener both ways.
  const setVisibility = v => evalIn(c, `(() => {
    Object.defineProperty(document, 'visibilityState',
      { configurable: true, get: () => ${JSON.stringify(v)} });
    document.dispatchEvent(new Event('visibilitychange'));
    return 1;
  })()`);

  // The three controls every scenario below drives, plus the one bit of DOM
  // state ("is bench mode still open") more than one of them reads back.
  const click = sel => evalIn(c, step(`$('${sel}').click()`));
  const openGM = () => click('#gmOpen');
  const closeGM = () => click('#gmClose');
  const nextGM = () => click('#gmNext2');
  const gmHidden = () => evalIn(c, `document.querySelector('#gamemode').hidden`);

  // 1. open -> one request, sentinel held; close -> that sentinel released.
  await install('immediate');
  await openGM();
  let s = await wl();
  need(s.requests === 1, `open: expected 1 request, got ${s.requests}`);
  need(s.unreleased === 1, `open: expected the sentinel held, ${s.unreleased} unreleased of ${s.granted}`);
  const openLine = `open → ${s.requests} request, ${s.unreleased} unreleased`;
  await closeGM();
  s = await wl();
  need(s.unreleased === 0, `close: expected the sentinel released, ${s.unreleased} unreleased of ${s.granted}`);
  nums.push(`${openLine}; close → ${s.unreleased} unreleased of ${s.granted}`);

  // 2. Escape closes too, and also releases.
  await openGM();
  await evalIn(c, step(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`));
  const gmHiddenAfterEsc = await gmHidden();
  s = await wl();
  need(gmHiddenAfterEsc === true, `Escape: expected #gamemode hidden, hidden=${gmHiddenAfterEsc}`);
  need(s.unreleased === 0, `Escape: expected released, ${s.unreleased} unreleased of ${s.granted}`);
  nums.push(`Escape → hidden=${gmHiddenAfterEsc}, ${s.unreleased} unreleased of ${s.granted}`);

  // 3. background then foreground: the browser drops the lock on hide (marked
  // by hand here, as it would be), 'hidden' asks for nothing, 'visible' asks
  // once more -> 2 requests total; after close, 'visible' asks for nothing.
  await install('immediate');
  await openGM();
  const dropped = await evalIn(c, `(() => {
    const s = window.__wl.granted.at(-1);
    if (!s) return false;
    s.released = true;
    return true;
  })()`);
  need(dropped, 'hide→visible: no sentinel granted to drop');
  await setVisibility('hidden');
  s = await wl();
  need(s.requests === 1, `visibilitychange hidden: expected still 1 request, got ${s.requests}`);
  await setVisibility('visible');
  s = await wl();
  need(s.requests === 2, `visibilitychange visible: expected 2 requests total, got ${s.requests}`);
  need(s.unreleased === 1, `visibilitychange visible: expected a held sentinel, ${s.unreleased} unreleased of ${s.granted}`);
  await closeGM();
  await setVisibility('visible');
  s = await wl();
  need(s.requests === 2, `visible after close: expected still 2 requests, got ${s.requests}`);
  nums.push(`hide→visible → ${s.requests} requests total, still ${s.requests} after a post-close visible`);

  // 4. a late grant is not kept: request resolves after close -> released.
  await install('deferred');
  await openGM();
  await closeGM();
  await resolveOne();
  s = await wl();
  need(s.granted === 1 && s.unreleased === 0,
    `late grant: expected the late sentinel released, ${s.unreleased} unreleased of ${s.granted}`);
  nums.push(`late grant → ${s.unreleased} unreleased of ${s.granted} after resolving post-close`);

  // 5. close-then-reopen race: two deferred requests in flight at once, both
  // resolved while reopened. Not written explicitly in the spec's "What would
  // settle it" -- included because `keepAwake` decides whether to keep a
  // grant from the DOM's current hidden state, not from which open asked for
  // it, so a grant from the first open can overwrite the reference to a grant
  // from the first open that a second open already replaced.
  await install('deferred');
  await openGM();
  await closeGM();
  await openGM();
  await resolveOne();
  await resolveOne();
  s = await wl();
  const whileOpenUnreleased = s.unreleased;
  need(s.unreleased <= 1, `reopen race, while open: ${s.unreleased} unreleased of ${s.granted}, want ≤ 1`);
  await closeGM();
  s = await wl();
  need(s.unreleased === 0, `reopen race, after final close: ${s.unreleased} unreleased of ${s.granted}, want 0`);
  nums.push(`reopen race → ${s.granted} granted, ${whileOpenUnreleased} unreleased while open, `
    + `${s.unreleased} unreleased after final close`);

  // 6. silent where unsupported: no wake lock, and separately a rejecting
  // request. Open, Next, close all still work; #gamemode ends hidden; no
  // console error or exception either way.
  const errBefore6a = consoleErrors.length;
  // Shadow with an explicit `undefined` rather than `delete`: deleting our
  // own shadow property would just uncover the real accessor underneath
  // (headless Chrome ships a real navigator.wakeLock), not remove the API.
  await evalIn(c, `(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    return 1;
  })()`);
  await openGM();
  await nextGM();
  await closeGM();
  const hidden6a = await gmHidden();
  need(hidden6a === true, `undefined wakeLock: expected #gamemode hidden after close, hidden=${hidden6a}`);
  need(consoleErrors.length === errBefore6a,
    `undefined wakeLock: ${consoleErrors.length - errBefore6a} console error(s)/exception(s)`);

  await install('reject');
  const errBefore6b = consoleErrors.length;
  await openGM();
  await nextGM();
  await closeGM();
  const hidden6b = await gmHidden();
  s = await wl();
  need(hidden6b === true, `rejecting stub: expected #gamemode hidden after close, hidden=${hidden6b}`);
  need(consoleErrors.length === errBefore6b,
    `rejecting stub: ${consoleErrors.length - errBefore6b} console error(s)/exception(s)`);
  nums.push(`unsupported (deleted) then rejecting (${s.requests} request attempted) → `
    + `open/Next/close fine, 0 new console errors either way`);

  // 7. release() rejecting: releaseQuietly's own catch must swallow it, the
  // same way the rejecting-request stub above exercises the request catch. A
  // missing catch here would surface as an unhandled rejection.
  await install('reject-release');
  const errBefore7 = consoleErrors.length;
  await openGM();
  await closeGM();
  const hidden7 = await gmHidden();
  need(hidden7 === true, `rejecting release: expected #gamemode hidden after close, hidden=${hidden7}`);
  need(consoleErrors.length === errBefore7,
    `rejecting release: ${consoleErrors.length - errBefore7} console error(s)/exception(s)`);
  nums.push(`rejecting release → open/close fine, 0 new console errors`);

  // Every request across every scenario above asked for the 'screen' lock,
  // never anything else -- request(type) is recorded, not ignored.
  const types = await evalIn(c, `JSON.stringify(window.__wlAllTypes || [])`).then(JSON.parse);
  need(types.length > 0 && types.every(t => t === 'screen'),
    `request type: expected every request to ask for 'screen', got ${JSON.stringify(types)}`);
  nums.push(`${types.length} request(s) across all scenarios, all type 'screen'`);

  return {
    name: nameOf('wakelock'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.join(' | ')}`
      : nums.join(' | '),
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
    name: nameOf('narrow'),
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
/* Every screen the chrome can be in, and the click that gets there (#23):
   Today is home, so it opens with nothing (or a back tap, if a previous
   state in the sweep left a pushed screen showing); the other four open from
   Today's own entries, since there is no tab bar to derive them from any
   more -- a list of names alone would have swept some and silently skipped
   the rest, which is the shape of the bug this whole sweep exists to catch. */
const TODAY_HOME = `document.querySelector('#barBack').hidden || document.querySelector('#backBtn').click()`;
const VIEWS = [
  { name: 'today', open: TODAY_HOME },
  { name: 'games', open: `document.querySelector('.today-game').click()` },
  { name: 'team', open: `document.querySelector('#todayTeam').click()` },
  { name: 'season', open: `document.querySelector('#todaySeason').click()` },
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

  await evalIn(c, TODAY_HOME);
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));

  const pass = bad.length === 0;
  const list = bad.slice(0, 6).map(b => `${b.view}@${b.w}px: ${b.el} reaches ${b.right}px`).join(', ');
  return {
    name: nameOf('sweep'),
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
 * Settings is opened by the cog, not by a tab. A screen added to the app and
 * not to this list is a screen whose controls nobody measures, which is how
 * `input.num` sat at 38.4px for months. Today joins the sweep in #23: it is
 * a new screen with its own controls (the team button, the game entries, the
 * Team/Season entries), and the same rule applies to it. */
const TOUCH_WIDTHS = [320, 360, 390];
const TOUCH_STATES = [
  { name: 'today', open: TODAY_HOME },
  { name: 'games', open: `document.querySelector('.today-game').click()` },
  { name: 'team', open: `document.querySelector('#todayTeam').click()` },
  { name: 'season', open: `document.querySelector('#todaySeason').click()` },
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
  { name: 'games, folds open',
    open: `document.querySelector('.today-game').click();
           for (const d of document.querySelectorAll('details')) d.open = true` },

];

/* The sweep both `touchPass` and `settingsRowPass` are built from: read the
   harness's own viewport, drive one or more named states, sweep
   `TOUCH_WIDTHS` at each, and at every width pull ONE named check back out of
   `smoke-checks.js`'s own verdict -- a floor set in CSS has to be proven by
   measuring the rendered box, not by reading the stylesheet. Extracted rather
   than duplicated a second time: they were the same read-loop-reset shape
   with only the state list, the check name and the count regex differing, and
   #22 was about to add a third copy of it. `close` is run once, after the
   sweep, before the viewport is put back -- `touchPass` also closes the folds
   it opened; `settingsRowPass` has nothing else to undo. Returns the raw
   `{ bad, audited, seen }` a caller assembles its own `detail` string from --
   `touchPass`'s wording and `settingsRowPass`'s wording differ, and neither
   is this function's to decide. */
async function widthSweep(c, source, { states, checkName, countRe, label, missing, close }) {
  const before = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__SMOKE_VIEWPORT || [390, 844])', returnByValue: true,
  });
  const [w0, h0] = JSON.parse(before.result.value);

  const bad = [];
  let audited = 0, seen = 0;
  for (const st of states) {
    await evalIn(c, step(st.open));
    for (const w of TOUCH_WIDTHS) {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h0, deviceScaleFactor: 2, mobile: true });
      await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
      const chk = (await evalIn(c, source)).checks.find(k => k.name === checkName);
      const where = label(st, w);
      if (!chk) { bad.push(`${where}: ${missing}`); continue; }
      audited++;
      const n = Number((countRe.map(re => chk.detail.match(re)).find(Boolean) || [])[1] || 0);
      seen = Math.max(seen, n);
      if (!chk.pass) bad.push(`${where}: ${chk.detail}`);
    }
  }

  await evalIn(c, step(close));
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 300));

  return { bad, audited, seen };
}

async function touchPass(c, source) {
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: TOUCH_STATES,
    checkName: 'touch targets ≥ 44px',
    countRe: [/(\d+) controls/, /\/(\d+) under/],
    label: (st, w) => `${st.name}@${w}px`,
    missing: 'the touch check is gone from smoke-checks.js',
    close: `${TODAY_HOME};
      for (const d of document.querySelectorAll('details')) d.open = false`,
  });

  return {
    name: nameOf('touch'),
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 44px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${TOUCH_STATES.map(s => s.name).join(' + ')} × `
        + `${TOUCH_WIDTHS.join('/')}px), up to ${seen} controls, all ≥ 44px`,
  };
}

/* #22, spec "What would settle it" item 7: every row in #view-settings --
   each setting row, each link row and the backup row -- at least 48px, at
   the same three widths `touchPass` sweeps (`TOUCH_WIDTHS` -- both checks are
   "phone widths a coach actually carries", so this reads that list rather
   than keeping a second copy of the same three numbers). Settings has no tab
   of its own (it is behind the cog), so the one state here is opening it and
   nothing else. */
const SETTINGS_STATES = [
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
];
async function settingsRowPass(c, source) {
  const { bad, audited, seen } = await widthSweep(c, source, {
    states: SETTINGS_STATES,
    checkName: 'settings rows ≥ 48px',
    countRe: [/(\d+) rows/],
    label: (st, w) => `${w}px`,
    missing: 'the settings-row check is gone from smoke-checks.js',
    close: TODAY_HOME,
  });

  return {
    name: nameOf('settingsrows'),
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) under 48px: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (${TOUCH_WIDTHS.join('/')}px), up to ${seen} rows, all ≥ 48px`,
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
/* The URLs A READER GETS, not the files on disk. These were the `.html`
   spellings until September 2026, which meant the eight checks below measured
   eight addresses nothing on the site links to -- and would have kept passing
   while the real ones broke. `scripts/serve.mjs` 307s `.html` to these, the
   same as Cloudflare. */
const STATIC_PAGES = ['/about', '/advanced', ...[7, 8, 9, 10, 11, 12].map(n => `/${n}-player-basketball-rotation-chart`)];
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
    name: nameOf('static'),
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
 * `19em` large-text block is live and the column is still short. Every screen
 * `VIEWS` names, because the five chromes differ and only one of them has to
 * be wrong — that is the lesson `sweepPass` already wrote down about deriving
 * a view list instead of enumerating one.
 *
 * ONE NAVIGATION, then the views are switched in the page. A font size cannot
 * be changed without a reload — `Page.setFontSizes` on a laid-out document
 * leaves it unreflowed and reports a width that was never rendered — but a
 * view switch reflows on its own, so the reload is paid once, not four times.
 *
 * FOLDS ARE LEFT AS THEY BOOT, unlike `touchPass`. Measured both ways when
 * this shipped: every screen reports identically with every `<details>`
 * forced open, because the app's folds hide their content with CSS rather than
 * by removing the box, so a closed fold's children still have rects and are
 * still swept. Opening them would cost a settle per screen for nothing.
 *
 * THE ALLOWANCES ARE PER VIEW, never blanket, and each number is the smallest
 * that covers a residue accepted deliberately, with its reason on the key.
 * A blanket tolerance
 * is what would have let the 228px through. Tighten one by 1px and it must go
 * red; if it does not, the number is decoration. Do NOT raise one to silence a
 * new failure — that is a bug on the screen the coach stands in front of. */
const APP_LARGE_TEXT_ALLOW = {
  /* EMPTY, and that is the finding, not an omission. Every screen measured
     clean in this cell once the three defects behind the 2026-08-24 report
     were fixed, so there is no residue to name and every one is pinned at
     zero. Add a key here only for a residue accepted deliberately, with the
     reason on the line and the smallest number that covers it — and tighten it
     by 1px first to prove the number is load-bearing. */
};
/* Every screen `VIEWS` names (Today plus the four it opens), plus BENCH
   MODE — which is the state this pass could not see and the one a coach is
   standing in when it matters most.
 *
 * `VIEWS` is `sweepPass`'s own list (#23), read here rather than kept a
 * second time, and game mode is not on it: it is a full-screen overlay
 * behind `#gmOpen`. Nothing in this harness had ever enumerated it at a
 * large root, and the measured consequence was `#gmNext2` — "Next stint",
 * the primary action of the screen a coach uses with the clock running —
 * sitting at left 349 in a 320px viewport with no pan available. Wholly off
 * screen, unreachable, and green in every check.
 *
 * The swap picker is here too because picking a player changes the layout of
 * the bench list underneath it, so it is a different measurement, not the same
 * screen with a class on it. Both close themselves so the pass leaves the app
 * on the games screen for whatever runs next. */
const APP_LARGE_TEXT_STATES = [
  ...VIEWS,
  /* AND THE TEAM MENU OPEN, on Today: a native popover is its own box in the
     top layer, sized independently of the screen behind it, and none of the
     five `VIEWS` states above ever opens one. Reported from a real browser
     (#23 review): `.teammenu`'s `min-width: 14rem` beat its own `max-width`
     at a 32px root -- 448px against a 265.6px ceiling in a 320px viewport --
     and the menu overflowed on both axes, invisible to every other state
     here because closing a popover before moving to the next screen is what
     every other click in this file already does. */
  { name: 'team menu open', open: `${TODAY_HOME}; document.querySelector('#teamBtn')?.click()`,
    close: `document.querySelector('#teamMenu')?.hidePopover?.()` },
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
  /* #24 item 4: the help sheet, the keyboard shortcuts dialog and the first
     tour step, none of which any state above this one opens. Reused from
     `STATES` by reference rather than retyped, so the open/close scripts
     cannot drift between the two passes that drive them. */
  ...['help sheet', 'shortcuts sheet', 'tour, first step']
    .map(n => STATES.find(s => s.name === n)),
  /* AND THE SIXTH CHROME: the welcome screen, the first thing a coach ever
     sees, and the one screen in the app this cell had never visited.
     `overlayPass` has audited it since it was written; this pass enumerates
     every screen `VIEWS` names and the welcome screen is not one of them —
     it is the screen you get INSTEAD of those five, with `.bar`, `.foot` and
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
    name: nameOf('applargetext'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${APP_LARGE_TEXT_STATES.length} states (${APP_LARGE_TEXT_STATES.map(v => v.name).join(' + ')}), nothing stranded past either side edge or above a fixed overlay`
        + (flash ? `, sample flash ${flash}` : '')
        + (allowed ? ` (${allowed} recorded residue)` : ''),
  };
}

/* #24 item 3: the scale's runtime proof. Item 3's "What would settle it" is
   computed rem values, so this reads the SAME seven-size/four-weight set the
   spec's own table lists (T2/T3), never the tokens.css values recomputed —
   the tautology `/tdd` bans. `meta[name="text-scale"]` is asserted once, not
   per state: it is document-level, not something a state can change. */
const TYPESCALE_SIZES_PX = new Set([13, 14, 16, 17, 22, 25, 34]);
const TYPESCALE_WEIGHTS = new Set([400, 500, 600, 700]);
/* Every element with its own text, structurally, the same way
   `smoke-checks.js`'s touch-target scan finds controls rather than guessing a
   selector list: a direct non-whitespace text node, or a form control whose
   value is its "text". `.card` is print output at a fixed size and out of
   scope (#24's item 5 covers it separately). */
const TYPESCALE_PROBE = `(() => {
  const seen = [];
  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const isFormEl = el => el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.card')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    if (!hasOwnText(el) && !isFormEl(el)) continue;
    const cs = getComputedStyle(el);
    const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join(''));
    seen.push({ sel: label, size: Math.round(parseFloat(cs.fontSize)), weight: Number(cs.fontWeight) });
  }
  return JSON.stringify(seen);
})()`;

async function typeScalePass(c, origin) {
  const problems = [];
  let elements = 0;
  await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
  await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await goRich(c, origin);

  const meta = await evalIn(c, `document.querySelector('meta[name="text-scale"]')?.getAttribute('content') ?? null`);
  if (meta !== 'scale') problems.push(`meta[name="text-scale"] is ${JSON.stringify(meta)}, not "scale"`);

  for (const v of APP_LARGE_TEXT_STATES) {
    try {
      if (v.firstRun) await firstRun(c, origin);
      else if (v.tryLink) await tryLanding(c, origin, v.tryLink);
      else await evalIn(c, step(v.open));
      const seen = JSON.parse(await evalIn(c, TYPESCALE_PROBE));
      elements += seen.length;
      if (seen.length === 0) problems.push(`${v.name}: measured no elements at all`);
      for (const el of seen) {
        if (!TYPESCALE_SIZES_PX.has(el.size)) problems.push(`${v.name} — ${el.sel}: ${el.size}px is off the scale`);
        if (!TYPESCALE_WEIGHTS.has(el.weight)) problems.push(`${v.name} — ${el.sel}: weight ${el.weight} is off the scale`);
      }
    } catch (e) {
      problems.push(`${v.name}: ${e.message.split('\n')[0]}`);
    } finally {
      if (v.close) await evalIn(c, step(v.close))
        .catch(e => problems.push(`${v.name}: did not close — ${e.message.split('\n')[0]}`));
    }
  }
  return {
    name: nameOf('typescale'),
    pass: problems.length === 0 && elements > 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : elements === 0
        ? 'measured no elements across any state'
        : `${APP_LARGE_TEXT_STATES.length} states, ${elements} elements, every font-size in `
          + `{${[...TYPESCALE_SIZES_PX].join(',')}}px and every weight in {${[...TYPESCALE_WEIGHTS].join(',')}}`,
  };
}

/* #24 item 5: the card does not scale. Extends the `cardsize` row rather than
   adding a new one — same seam, same name, so `--only "card is 3.45 × 5in"`
   proves this too. Reuses the existing `Page.setFontSizes` idiom (see
   `appLargeTextPass`) for the 32px root. `card.css` and `card.js`'s fitting
   are untouched by #24, so this MEASURES that stays true rather than
   implementing anything: the card's own font stack is set from canvas
   `measureText`, independent of the root rem this ticket changes. */
async function measureCard(c) {
  return JSON.parse(await evalIn(c, `(() => {
    const card = document.querySelector('.card:not(.card-copy)');
    if (!card) return JSON.stringify(null);
    const z = card.currentCSSZoom || 1;
    const r = card.getBoundingClientRect();
    const five = card.querySelector('.five');
    const chg = card.querySelector('.chg');
    return JSON.stringify({
      w: Math.round(r.width / z * 100) / 100,
      h: Math.round(r.height / z * 100) / 100,
      five: five ? getComputedStyle(five).fontSize : null,
      chg: chg ? getComputedStyle(chg).fontSize : null,
    });
  })()`));
}

// Shared by the two reloads `cardAt32Pass` below does (into the 32px
// measurement, then back out of it): `Page.navigate` alone does not await
// paint, so every caller in this file pairs it with the load event.
async function reloadIndex(c, origin) {
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Page.navigate', { url: origin + '/index.html' });
  await loaded;
}

async function cardAt32Pass(c, origin, report) {
  const check = report.checks.find(k => k.name === nameOf('cardsize'));
  if (!check) return; // the base check is gone -- nothing here to extend

  const at16 = await measureCard(c);
  const problems = [];
  if (!at16) {
    check.pass = false;
    check.detail += ' | no .card at a 16px root to compare against';
    return;
  }

  await c.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
  let at32;
  try {
    await reloadIndex(c, origin);
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
    at32 = await measureCard(c);
  } finally {
    // Never leave the emulated font size on, and leave the app reloaded at
    // 16px so whatever runs next (goRich, in the full run) starts clean.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await reloadIndex(c, origin);
  }

  if (!at32) {
    problems.push('no .card at a 32px root');
  } else {
    if (Math.abs(at32.w - at16.w) > 1 || Math.abs(at32.h - at16.h) > 1) {
      problems.push(`card measures ${at32.w}×${at32.h}px at a 32px root, ${at16.w}×${at16.h}px at 16px`);
    }
    if (at16.five !== at32.five) problems.push(`.five is ${at32.five} at a 32px root, ${at16.five} at 16px`);
    if (at16.chg !== at32.chg) problems.push(`.chg is ${at32.chg} at a 32px root, ${at16.chg} at 16px`);
  }

  check.pass = check.pass && problems.length === 0;
  check.detail += problems.length
    ? ` | 32px root: ${problems.join('; ')}`
    : ` | 32px root: unchanged (${at32.w}×${at32.h}px, .five ${at32.five}, .chg ${at32.chg})`;
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

/* ---------- the check registry ----------
 *
 * ONE LIST NAMES EVERY ROW A FULL RUN PRINTS, in the order it prints them, so
 * `--only` has one place to validate a name against and the header's "21" is
 * counted rather than typed. It is built from the same constants the passes
 * above already use (`NARROW`, `SWEEP_FLOOR`, `SWEEP_HI`, `TOUCH_WIDTHS`,
 * `LARGE_TEXT_WIDTH`, `LARGE_TEXT_PX`) rather than a second copy of their
 * template strings — `nameOf` below is how a pass gets its name back out, so
 * the template lives here exactly once.
 *
 * `selectable: false` marks the four rows `--only` may never choose: `no
 * console errors` covers passes it did not run, and the three budget rows plus
 * `node --test` measure the WHOLE run, not one check — see AGENTS.md § Layout.
 *
 * `setup` is what a partial run has to do before the row's own pass can run:
 * `cold` is the SEED load and the `smoke-checks.js` evaluate, everything a
 * full run has on screen before the fixture split; `rich` is that plus one
 * `goRich` — every row after the split, because `goRich` is a fresh reload of
 * the same fixture and so reproduces the arrival state whether it is the first
 * call or, as two rows below get it in a full run, the second. `run` is the
 * pass itself, called with the session a partial run has open.
 *
 * The eight `cold` rows' names (`overflow` through `fcp`) are hand-pinned
 * copies of the `add(...)` calls in `scripts/smoke-checks.js`, for the same
 * reason the three budget names below are hand-pinned copies of
 * `budgets.mjs`'s: that file is evaluated as page text, not imported, so
 * there is nothing here a rename would fail to compile. The drift check after
 * the full run's table is what actually catches a rename — it is the guard,
 * not the comment. */
const REGISTRY = Object.freeze([
  { id: 'console', name: 'no console errors', selectable: false, setup: null },
  { id: 'overflow', name: 'no horizontal overflow', selectable: true, setup: 'cold' },
  { id: 'cardsize', name: 'card is 3.45 × 5in', selectable: true, setup: 'cold' },
  { id: 'dialog', name: 'last control in an open dialog is reachable', selectable: true, setup: 'cold' },
  { id: 'names', name: 'controls have accessible names', selectable: true, setup: 'cold' },
  { id: 'alt', name: 'images declare alt text', selectable: true, setup: 'cold' },
  { id: 'ids', name: 'ids unique, aria references resolve', selectable: true, setup: 'cold' },
  { id: 'doc', name: 'document lang, title, tab order', selectable: true, setup: 'cold' },
  { id: 'fcp', name: 'first contentful paint (informational)', selectable: true, setup: 'cold' },
  { id: 'cardfont', name: 'card font loads before the card is fitted', selectable: true, setup: 'rich',
    run: ctx => cardFontPass(ctx.c, ctx.origin) },
  { id: 'fixture', name: 'rich fixture is live', selectable: true, setup: 'rich',
    run: ctx => fixturePass(ctx.c) },
  { id: 'todayback', name: 'today and back', selectable: true, setup: 'rich',
    run: ctx => todayAndBackPass(ctx.c, ctx.origin) },
  { id: 'todaykeys', name: 'today keys and undo', selectable: true, setup: 'rich',
    run: ctx => todayKeysAndUndoPass(ctx.c, ctx.origin) },
  { id: 'wakelock', name: 'bench mode wake lock', selectable: true, setup: 'rich',
    run: ctx => wakeLockPass(ctx.c, ctx.origin, ctx.consoleErrors) },
  { id: 'overlay', name: 'a11y in overlays and dialogs', selectable: true, setup: 'rich',
    run: ctx => overlayPass(ctx.c, ctx.source) },
  { id: 'touch', name: `touch targets ≥ 44px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich',
    run: ctx => touchPass(ctx.c, ctx.source) },
  { id: 'settingsrows', name: `settings rows ≥ 48px, ${TOUCH_WIDTHS[0]}–${TOUCH_WIDTHS.at(-1)}px`, selectable: true, setup: 'rich',
    run: ctx => settingsRowPass(ctx.c, ctx.source) },
  { id: 'narrow', name: `no sideways pan at ${NARROW}px`, selectable: true, setup: 'rich',
    run: ctx => narrowPass(ctx.c) },
  { id: 'sweep', name: `no overflow, ${SWEEP_FLOOR}–${SWEEP_HI}px`, selectable: true, setup: 'rich',
    run: ctx => sweepPass(ctx.c) },
  { id: 'applargetext', name: `app shell at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, selectable: true, setup: 'rich',
    run: ctx => appLargeTextPass(ctx.c, ctx.origin) },
  { id: 'typescale', name: 'type scale: 7 sizes, 4 weights', selectable: true, setup: 'rich',
    run: ctx => typeScalePass(ctx.c, ctx.origin) },
  { id: 'static', name: 'static pages: 2 guides + 6 charts', selectable: true, setup: 'rich',
    run: ctx => staticPass(ctx.c, ctx.source, ctx.origin) },
  // These three names are `budgets.mjs`'s, verbatim — that file is untouched by
  // this change, so the names are pinned here by hand rather than imported.
  { id: 'budgetbytes', name: 'initial payload ≤ budget', selectable: false, setup: null },
  { id: 'budgetrequests', name: 'request count ≤ budget', selectable: false, setup: null },
  { id: 'budgetnodes', name: 'DOM nodes ≤ budget', selectable: false, setup: null },
  { id: 'nodetest', name: 'node --test', selectable: false, setup: null },
]);
const nameOf = id => REGISTRY.find(r => r.id === id).name;

/* A check that throws fails ITS OWN row, named, rather than the whole run:
 * without this, one broken pass (a selector that no longer exists, a page
 * that navigated away mid-evaluate) took the entire table down with it and
 * printed nothing at all -- a guard reporting nothing, the one shape
 * `/new-guard` names as a false green by omission, here worn the other way
 * round as a false SILENCE. `--only` already gets this for free (its own
 * `run` call is awaited straight from `main`, which prints the thrown error
 * and exits non-zero); this is the full-run path, where every check after
 * the one that throws would otherwise never run at all. */
async function safeCheck(id, fn) {
  try {
    return await fn();
  } catch (e) {
    return { name: nameOf(id), pass: false, detail: `threw before finishing: ${e.message.split('\n')[0]}` };
  }
}

async function browserChecks(origin, only) {
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

    /* THE PARTIAL PATH, `rich` branch. A `rich` row's own pass never reads
       what `smoke-checks.js` returns, so running it here would be a
       Runtime.evaluate whose result is thrown away. Skip it, and build only
       the report skeleton the partial output needs (`viewport`, for the
       header) instead of re-deriving it from the evaluate. A `cold` row DOES
       need that evaluate — its selected row IS one of its verdicts — so it
       still runs below. */
    if (only && only.setup === 'rich') {
      const report = { viewport: [WIDTH, HEIGHT], checks: [] };
      await goRich(c, origin);
      report.checks = [await only.run({ c, origin, source, consoleErrors })];
      return { report, consoleErrors };
    }

    const { result, exceptionDetails } = await c.send('Runtime.evaluate', { expression: source, returnByValue: true });
    if (exceptionDetails) throw new Error('checks threw: ' + (exceptionDetails.exception?.description || exceptionDetails.text));

    const report = result.value;

    // Snapshotted here, before `cardAt32Pass` below reloads the page for its
    // own 32px measurement: the budget is a SINGLE cold load, and one more
    // navigation in `requests` — even a same-URL one — would inflate the
    // request-count pin (AGENTS.md § Layout) that a coach never actually pays.
    report.payload = { ...summarize([...requests.values()], origin), nodes: report.nodes };

    /* #24 item 5: extends the cardsize row's own check object in place, so it
       is covered whether this is a full run or `--only "card is 3.45 × 5in"`
       (the `cold` partial path below just keeps whichever checks match by
       name, this one now carrying the 32px comparison too). */
    await cardAt32Pass(c, origin, report);

    /* THE PARTIAL PATH, `cold` branch. It reuses the setup above rather than
       reimplementing it: the cold load and this same evaluate already ran, so
       a `cold` row just keeps its one entry out of what came back. No
       budgets, no `node --test`. */
    if (only) {
      report.checks = report.checks.filter(k => k.name === only.name);
      return { report, consoleErrors };
    }

    /* THE FIXTURE SPLIT HAPPENS HERE, and the order of these three lines is
       the whole design: the budget above is measured on the lean cold load,
       everything below is measured on the rich one. Moving `goRich` earlier
       folds a season, a second game and two levelled players into a number
       that is supposed to describe a first visit. */
    await goRich(c, origin);
    /* Before anything else touches the page: fixturePass below clicks through
       Team/Season and back, which is harmless to the fixture checks but would
       no longer be the untouched cold state item 8 asks for.
       Every row from here on is wrapped in `safeCheck` -- a check that
       throws (a page that navigated away mid-evaluate, a selector that no
       longer exists) fails its own named row instead of taking down every
       check after it and printing no table at all. */
    report.checks.push(await safeCheck('cardfont', () => cardFontPass(c, origin)));
    report.checks.push(await safeCheck('fixture', () => fixturePass(c)));
    /* Both of these reload their own fixture and put RICH back the way they
       found it (`view: 'games'`, one team), same courtesy the wake-lock
       reload below pays. */
    report.checks.push(await safeCheck('todayback', () => todayAndBackPass(c, origin)));
    report.checks.push(await safeCheck('todaykeys', () => todayKeysAndUndoPass(c, origin)));

    report.checks.push(await safeCheck('wakelock', () => wakeLockPass(c, origin, consoleErrors)));
    // The wake lock check stubs navigator.wakeLock, shadows
    // document.visibilityState and leaves bench mode wherever its last
    // scenario left it -- reload the rich fixture so every pass after this
    // one sees the real API and the real boot state, as goRich left it above.
    await goRich(c, origin);

    report.checks.push(await safeCheck('overlay', () => overlayPass(c, source)));
    /* The swept touch pass replaces the first pass's single-viewport verdict
       rather than sitting beside it: two checks answering the same question
       with different coverage is how the weaker one gets believed. */
    report.checks = report.checks.filter(k => k.name !== 'touch targets ≥ 44px');
    report.checks.push(await safeCheck('touch', () => touchPass(c, source)));
    /* Same reshuffle as touch, one line up: the single-viewport verdict
       `smoke-checks.js` already contributed to the cold array (Settings
       closed, so it read "not open") is replaced with the swept one. */
    report.checks = report.checks.filter(k => k.name !== 'settings rows ≥ 48px');
    report.checks.push(await safeCheck('settingsrows', () => settingsRowPass(c, source)));
    report.checks.push(await safeCheck('narrow', () => narrowPass(c)));
    report.checks.push(await safeCheck('sweep', () => sweepPass(c)));
    /* After the sweep, because it reloads the app at a 32px root and the sweep
       assumes the boot-time layout; before `staticPass`, which navigates away
       from `index.html` for good. */
    report.checks.push(await safeCheck('applargetext', () => appLargeTextPass(c, origin)));
    /* #24: the scale at its default size, across the same states. Its own
       `goRich` puts the RICH fixture back after `applargetext`'s destructive
       tail (the welcome/sample states), so it does not inherit that pass's
       last state. Before `staticPass`, same reason as the row above. */
    report.checks.push(await safeCheck('typescale', () => typeScalePass(c, origin)));
    /* Last of the browser passes, because it navigates away from the app and
       nothing after it may assume `index.html` is still loaded. Still ahead of
       the console verdict below, so the seven pages it visits are covered by
       that too. */
    report.checks.push(await safeCheck('static', () => staticPass(c, source, origin)));

    /* Last, so it covers the overlay pass too: an exception thrown by opening
       game mode is exactly the kind of thing the opening screen cannot show
       you. */
    report.checks.unshift({
      name: nameOf('console'),
      pass: consoleErrors.length === 0,
      detail: consoleErrors.length
        ? consoleErrors.slice(0, 4).join(' | ')
        : `clean${thirdParty.length ? ` (${thirdParty.length} third-party, ignored)` : ''}`,
    });
    return { report, consoleErrors };
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
        name: nameOf('nodetest'),
        pass: !err,
        detail: total ? `${pass}/${total} passing` : (err ? 'suite failed to run' : 'passed'),
      });
    });
  });
}

const BUDGETS = join(ROOT, 'scripts', 'budgets.json');

const printRow = (pad, chk) =>
  console.log(`  ${chk.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${chk.name.padEnd(pad)}  ${chk.detail}`);

/* ---------- --only ----------
 *
 * Validated BEFORE `serve()` and before Chrome ever launches: `--only "nope"`
 * has to exit fast enough that a node test can spawn this file and read the
 * code back, not wait out a browser boot to be told the name was wrong.
 *
 * Two spellings are accepted: `--only <name>` and `--only=<name>`, checked
 * for separately since `args.indexOf('--only')` never matches the `=` form.
 * `HAS_ONLY` ("the flag was given at all") is kept apart from `ONLY_NAME`
 * (the name that follows it, or `''` when there isn't one) so a bare `--only`
 * — the last argument, or followed by another `--flag` rather than a name —
 * is refused exactly like an unknown name instead of silently becoming a
 * full run, which is what `args[i + 1]` reading a flag as the name used to
 * do. */
const ONLY_EQ = args.find(a => a.startsWith('--only='));
const ONLY_IDX = args.indexOf('--only');
const HAS_ONLY = ONLY_EQ !== undefined || ONLY_IDX !== -1;
const ONLY_NAME = ONLY_EQ !== undefined ? ONLY_EQ.slice('--only='.length)
  : ONLY_IDX === -1 ? null
  : (args[ONLY_IDX + 1] === undefined || args[ONLY_IDX + 1].startsWith('--')) ? ''
  : args[ONLY_IDX + 1];

if (HAS_ONLY && has('--update-budgets')) {
  console.error('--only and --update-budgets cannot be combined: --only proves one check on the '
    + 'rich fixture, --update-budgets re-records the lean cold load. Run them separately.');
  process.exit(1);
}

const VALID_ONLY = REGISTRY.filter(r => r.selectable);
let ONLY = null;
if (HAS_ONLY) {
  ONLY = VALID_ONLY.find(r => r.name === ONLY_NAME) || null;
  if (!ONLY) {
    if (ONLY_NAME === '') {
      console.error('--only requires a check name. Valid names:');
    } else {
      console.error(`--only "${ONLY_NAME}" is not a check --only can run. Valid names:`);
    }
    for (const r of VALID_ONLY) console.error(r.name);
    process.exit(1);
  }
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
let result;
try {
  result = await browserChecks(origin, ONLY);
} finally {
  server.close();
}
const { report, consoleErrors } = result;

if (ONLY) {
  /* THE PARTIAL-RUN DRIFT CHECK. Both partial setups above filter or select
     rows by the registry name with nothing that requires exactly one to come
     back — `[].every()` is vacuously true on zero rows, and the full-run
     drift check further down never runs on a partial path. So a name that no
     longer matches the registry would print an empty table and exit 0 rather
     than fail. */
  if (report.checks.length !== 1 || report.checks[0].name !== ONLY.name) {
    const names = report.checks.map(c => c.name).join(', ') || '(none)';
    console.error(`--only "${ONLY.name}" produced ${report.checks.length} row(s) named ${names} `
      + 'instead of one — registry drift, see the registry comment.');
    process.exit(1);
  }

  /* No budgets, no `node --test`: `--only` proves one check, not the suite —
     AGENTS.md § Layout says a partial run proves nothing beyond the row it
     printed. Console errors get a note instead of a row, because they are a
     property of the whole session `--only` still opened, not of the one pass
     it ran. */
  if (JSON_OUT) {
    console.log(JSON.stringify({ ...report, consoleErrors }, null, 2));
  } else {
    const pad = Math.max(...report.checks.map(c => c.name.length));
    console.log(`\nbenchcard smoke — ${report.viewport[0]}×${report.viewport[1]}, 1 of ${REGISTRY.length} checks (--only)\n`);
    for (const c of report.checks) printRow(pad, c);
    console.log('');
    console.log('skipped: node --test (--only implies --no-tests), 3 budget checks (--only)');
    if (consoleErrors.length) {
      console.log(`console errors during this run: ${consoleErrors.length} — ${consoleErrors.slice(0, 4).join(' | ')}`);
    }
    console.log('');
  }
  process.exit(report.checks.every(c => c.pass) && consoleErrors.length === 0 ? 0 : 1);
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
  for (const c of report.checks) printRow(pad, c);
  console.log('');
}

/* THE DRIFT CHECK. A full run's printed names have to be exactly the
   registry's, IN ORDER — not a superset, not a subset, not a reshuffle — or
   the registry stops being something `--only` can trust. Compared as ORDERED
   ARRAYS, not sets: a set comparison is blind to a row printed twice (still
   one set member) and to two rows swapping places (still the same set).
   Skipped under `--update-budgets`: that run's budget row is `budgets
   re-recorded`, not the three comparison rows, by design. `node --test` is
   excluded under `--no-tests`, which drops that row on purpose rather than by
   drift. Printed to STDERR, not stdout, so `--json`'s stdout stays valid
   JSON even when the drift check is what fails the run. */
if (!has('--update-budgets')) {
  const expected = REGISTRY.filter(r => !(has('--no-tests') && r.id === 'nodetest')).map(r => r.name);
  const printed = report.checks.map(c => c.name);
  const inOrder = expected.length === printed.length && expected.every((n, i) => n === printed[i]);
  if (!inOrder) {
    const countOf = list => list.reduce((m, n) => m.set(n, (m.get(n) || 0) + 1), new Map());
    const expectedCount = countOf(expected), printedCount = countOf(printed);
    const extra = [...printedCount.keys()].filter(n => !expectedCount.has(n));
    const missing = [...expectedCount.keys()].filter(n => !printedCount.has(n));
    const duplicated = [...printedCount.entries()]
      .filter(([n, count]) => count > 1 && expectedCount.has(n)).map(([n]) => n);
    console.error('registry drift:');
    if (extra.length) console.error(`  printed, but not in the registry: ${extra.join(', ')}`);
    if (missing.length) console.error(`  in the registry, but not printed: ${missing.join(', ')}`);
    if (duplicated.length) console.error(`  printed more than once: ${duplicated.join(', ')}`);
    if (!extra.length && !missing.length && !duplicated.length) {
      console.error(`  same names, different order — expected ${JSON.stringify(expected)}`);
      console.error(`                                       got ${JSON.stringify(printed)}`);
    }
    process.exit(1);
  }
}

process.exit(report.checks.every(c => c.pass) ? 0 : 1);
