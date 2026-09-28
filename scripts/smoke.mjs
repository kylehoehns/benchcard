#!/usr/bin/env node
/* Benchcard smoke harness.

   Every polish iteration was hand-rolling the same four browser checks — no
   horizontal overflow at 390px, the card is still 3.45 × 5in, no console
   errors, every touch target ≥48px (guideline I1 owns that number) — plus
   `node --test`. This runs all of it in one call and prints a pass/fail
   table. It now also carries the accessibility checks and the performance
   budget (see `budgets.mjs`).

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
   you already changed. A fresh port is a virgin origin every run.

   The passes this file used to define inline now live one per file under
   `scripts/smoke/`, with the shared helpers (`launch`/`cdp`, the DOM/CDP
   helpers, the rich fixture, the row registry) each defined exactly once and
   imported here and by the passes that need them — see `docs/specs/58-split-
   smoke.md`. This file is the entry point: CLI parsing, the browser session
   that runs every row in order, budgets, and the table.

   #124 moved the run order and the per-row pass wiring into `registry.mjs`
   itself: adding a check now means writing its module and one entry there,
   and this file never imports a check module by name. `ROWS` already carries
   each rich row's own `run`; this file's job is walking that one list and
   running whichever `run` it finds, the same way for the full run and for
   `--only` alike (`runCheck` below). */

import { execFile } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, pinned, summarize } from './budgets.mjs';
import { serve } from './serve.mjs';

import { launch, cdp, closeChrome } from './smoke/chrome.mjs';
import { WIDTH, HEIGHT, evalIn, SETTLE } from './smoke/dom.mjs';
import { SEED, goRich } from './smoke/fixtures.mjs';
import { ROWS, nameOf, FONT_INJECTION_SCRIPT, CLOCK_SCRIPT } from './smoke/registry.mjs';
import { cardAt32Pass } from './smoke/card-at-32.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const args = process.argv.slice(2);
const has = f => args.includes(f);
const JSON_OUT = has('--json');

/* #178: what the watchdog and the signal handlers below need to end a run
   that hangs or is interrupted. `current` names whatever this run is doing
   right now, so a timeout's stderr line says which check it was on rather
   than just "smoke timed out". `liveChrome` is null until `browserChecks`
   below has actually launched Chrome; the watchdog only tries to close it if
   it is not. */
let current = 'launching Chrome';
let liveChrome = null; // { proc, dir, c } once Chrome is up

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

/* ---------- the run ----------
 *
 * One runner for a rich row, used both by the full run's loop below and by
 * `--only`'s rich branch: it calls the row's own `run`, adds the row's name
 * to whatever comes back (a check returns `{ pass, detail }`; the row is what
 * knows its own name), and turns a throw into a FAIL row rather than taking
 * the rest of the run down with it -- a broken pass (a selector that no
 * longer exists, a page that navigated away mid-evaluate) failing its own
 * named row instead of printing no table at all is the one shape
 * `/new-guard` names as a false green by omission, worn here the other way
 * round as a false SILENCE. */
async function runCheck(row, ctx) {
  current = row.name;
  try {
    /* #178: the hang hook. BENCHCARD_SMOKE_HANG names a row; when it matches
       the one about to run, this runs a real hang instead of that row's own
       `run` -- Chrome is alive, the CDP call below never resolves, and only
       the watchdog ends it. It is for test/smoke-timeout.test.js only. */
    const result = process.env.BENCHCARD_SMOKE_HANG === row.name
      ? await ctx.c.send('Runtime.evaluate', { expression: 'new Promise(() => {})', awaitPromise: true })
      : await row.run(ctx);
    return { name: row.name, ...result };
  } catch (e) {
    return { name: row.name, pass: false, detail: `threw before finishing: ${e.message.split('\n')[0]}` };
  }
}

async function browserChecks(origin, only) {
  current = 'launching Chrome';
  const debugPort = 9222 + Math.floor(Math.random() * 500);
  const { proc, dir, ws } = await launch(debugPort, has('--headful'));
  const c = cdp(ws);
  liveChrome = { proc, dir, c };
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
    // #177: CI's own resolved font (`AGENTS.md`'s "Smoke forces CI's font on
    // a Mac too"), forced on every page this harness opens, on a Mac and in CI
    // alike -- see smoke-font.mjs.
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FONT_INJECTION_SCRIPT });
    // #178: the pinned, ticking smoke clock -- every reload, goRich and
    // static page this session opens reads 2026-09-12 12:00 local onward, no
    // matter what the host's real clock reads -- see clock.mjs.
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK_SCRIPT });

    current = 'cold load';
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
      current = 'rich fixture';
      await goRich(c, origin);
      report.checks = [await runCheck(only, { c, origin, source, consoleErrors })];
      return { report, consoleErrors };
    }

    current = 'cold checks';
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
    current = 'card at 32px';
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
    current = 'rich fixture';
    await goRich(c, origin);
    /* Before anything else touches the page: fixturePass below clicks through
       Team/Season and back, which is harmless to the fixture checks but would
       no longer be the untouched cold state item 8 asks for.

       Every rich row runs from here in registry order, one loop: `runCheck`
       is what turns a throw into a FAIL row instead of taking the whole run
       down with it. A row whose `replaces` names a cold verdict (the six
       "swept" rows -- a sheet or view the cold load never actually opened, so
       its cold verdict never measured anything) drops that name out of
       `report.checks` first, so the two never both print; a row with
       `resetAfter` (`teamcolor`, `wakelock`) reloads the rich fixture right
       after, because both leave the page in a state the next row should not
       inherit. */
    for (const row of ROWS.filter(r => r.setup === 'rich')) {
      if (row.replaces) {
        const replaced = Array.isArray(row.replaces) ? row.replaces : [row.replaces];
        report.checks = report.checks.filter(k => !replaced.includes(k.name));
      }
      report.checks.push(await runCheck(row, { c, origin, source, consoleErrors }));
      if (row.resetAfter) await goRich(c, origin);
    }

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
    liveChrome = null;
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

/* ---------- --only and --timeout: a shared flag reader ----------
 *
 * Both take `--flag <value>` or `--flag=value`, and both must be validated
 * BEFORE `serve()` and before Chrome ever launches: a bad value has to exit
 * fast enough that a node test can spawn this file and read the result back,
 * not wait out a browser boot to be told it was wrong.
 *
 * `readFlag` tells "the flag was given at all" (`has`) apart from "the value
 * that followed it" (`raw`, `null` when the flag was never given, `''` when
 * it was the last argument or was followed by another `--flag` rather than a
 * value) — so a bare `--only` or `--timeout` is refused exactly like an
 * invalid value instead of silently becoming a full run, which is what
 * `args[i + 1]` reading a flag as the value used to do. `=` is checked
 * separately since `args.indexOf(flag)` never matches that spelling. */
function readFlag(flag) {
  const eq = args.find(a => a.startsWith(`${flag}=`));
  const idx = args.indexOf(flag);
  const has = eq !== undefined || idx !== -1;
  const raw = eq !== undefined ? eq.slice(flag.length + 1)
    : idx === -1 ? null
    : (args[idx + 1] === undefined || args[idx + 1].startsWith('--')) ? ''
    : args[idx + 1];
  return { has, raw };
}

/* ---------- --only ---------- */
const { has: HAS_ONLY, raw: ONLY_NAME } = readFlag('--only');

if (HAS_ONLY && has('--update-budgets')) {
  console.error('--only and --update-budgets cannot be combined: --only proves one check on the '
    + 'rich fixture, --update-budgets re-records the lean cold load. Run them separately.');
  process.exit(1);
}

const VALID_ONLY = ROWS.filter(r => r.selectable);
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

/* ---------- --timeout ----------
 *
 * Decimals are allowed (the timeout test itself uses 0.5), so this is a
 * finite, positive number check, not an integer one. */
const { has: HAS_TIMEOUT, raw: TIMEOUT_RAW } = readFlag('--timeout');

// #178 decision 3: 60 minutes, not the issue's 30 — see the spec's Decisions.
let TIMEOUT_MIN = 60;
if (HAS_TIMEOUT) {
  const n = Number(TIMEOUT_RAW);
  if (TIMEOUT_RAW === '' || !Number.isFinite(n) || n <= 0) {
    console.error(`--timeout requires a positive number of minutes, got ${JSON.stringify(TIMEOUT_RAW)}.`);
    process.exit(1);
  }
  TIMEOUT_MIN = n;
}

/* ---------- the watchdog and the signal handlers ----------
 *
 * #178. One `shutdown`, used by all three ways a run can end early (the time
 * limit, Ctrl-C, `kill`), so "close Chrome, close the server, exit" is
 * written once. Started before `serve()`, per the spec's Design section, so
 * even a `serve()` that hangs is still caught by the limit. */
let server = null;
let watchdogTimer = null;

async function shutdown(code) {
  clearTimeout(watchdogTimer);
  try { liveChrome?.c?.close(); } catch { /* already closed */ }
  if (liveChrome) await closeChrome(liveChrome.proc, liveChrome.dir);
  try { server?.close(); } catch { /* already closed */ }
  process.exit(code);
}

process.on('SIGINT', () => { shutdown(130); });
process.on('SIGTERM', () => { shutdown(143); });

watchdogTimer = setTimeout(() => {
  console.error(`smoke: timed out after ${TIMEOUT_MIN} min while running "${current}"`);
  shutdown(1);
}, TIMEOUT_MIN * 60_000);

server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
let result;
try {
  result = await browserChecks(origin, ONLY);
} finally {
  clearTimeout(watchdogTimer);
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
    console.log(`\nbenchcard smoke — ${report.viewport[0]}×${report.viewport[1]}, 1 of ${ROWS.length} checks (--only)\n`);
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
  /* `pinned`, not `baseline`: budgets.json's `bytes` is a stale recording that
     no supported route can rewrite, so the bytes baseline is hand-pinned in
     budgets.mjs. `requests` and `nodes` still come from the file. */
  report.checks.push(...compare(pinned(baseline), report.payload));
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
  const expected = ROWS.filter(r => !(has('--no-tests') && r.id === 'nodetest')).map(r => r.name);
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
