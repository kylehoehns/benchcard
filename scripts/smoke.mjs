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
   you already changed. A fresh port is a virgin origin every run.

   The passes this file used to define inline now live one per file under
   `scripts/smoke/`, with the shared helpers (`launch`/`cdp`, the DOM/CDP
   helpers, the rich fixture, the row registry) each defined exactly once and
   imported here and by the passes that need them — see `docs/specs/58-split-
   smoke.md`. This file is the entry point: CLI parsing, the browser session
   that runs every pass in order, budgets, and the table. */

import { execFile } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, summarize } from './budgets.mjs';
import { serve } from './serve.mjs';

import { launch, cdp } from './smoke/chrome.mjs';
import { WIDTH, HEIGHT, evalIn, SETTLE } from './smoke/dom.mjs';
import { SEED, goRich } from './smoke/fixtures.mjs';
import { ROWS, nameOf } from './smoke/registry.mjs';

import { cardFontPass } from './smoke/card-font.mjs';
import { fixturePass } from './smoke/rich-fixture.mjs';
import { seasonPass } from './smoke/season.mjs';
import { gameRowsFitPass } from './smoke/game-rows-fit.mjs';
import { todayAndBackPass } from './smoke/today-and-back.mjs';
import { todayKeysAndUndoPass } from './smoke/today-keys-and-undo.mjs';
import { gamePassesPass } from './smoke/game-passes.mjs';
import { wakeLockPass } from './smoke/wake-lock.mjs';
import { overlayPass } from './smoke/overlay.mjs';
import { touchPass } from './smoke/touch.mjs';
import { settingsRowPass } from './smoke/settings-rows.mjs';
import { whoRowsPass } from './smoke/who-rows.mjs';
import { planRowsPass } from './smoke/plan-rows.mjs';
import { planControlsPass } from './smoke/plan-controls.mjs';
import { todayGameRowsPass } from './smoke/today-game-rows.mjs';
import { gameTitlePass } from './smoke/game-title.mjs';
import { sentenceSheetsPass } from './smoke/sentence-sheets.mjs';
import { planSheetPass } from './smoke/plan-sheet.mjs';
import { sheetSpacingPass } from './smoke/sheet-spacing.mjs';
import { timelineCardSheetPass } from './smoke/timeline-card-sheet.mjs';
import { teamScreenPass } from './smoke/team-screen.mjs';
import { addGameFlowPass } from './smoke/add-game-flow.mjs';
import { focusClearPass } from './smoke/focus-clear.mjs';
import { floatingControlsPass } from './smoke/floating-controls.mjs';
import { resumeBarPass } from './smoke/resume-bar.mjs';
import { narrowPass } from './smoke/narrow.mjs';
import { sweepPass } from './smoke/sweep.mjs';
import { appLargeTextPass } from './smoke/app-large-text.mjs';
import { typeScalePass } from './smoke/type-scale.mjs';
import { staticPass } from './smoke/static.mjs';
import { cardAt32Pass } from './smoke/card-at-32.mjs';
import { teamColorPass } from './smoke/team-color.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const args = process.argv.slice(2);
const has = f => args.includes(f);
const JSON_OUT = has('--json');

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
 * Each rich row's own pass function, attached to its `ROWS` entry by id.
 * `ROWS` (in `registry.mjs`) carries no pass import, so nothing there can
 * create a load cycle; this is the one place every pass IS imported, so this
 * is where its `run` is attached. `--only` still validates and refuses
 * against the frozen `REGISTRY` below before `serve()` or Chrome ever start —
 * attaching `run` here is a plain object copy, nothing async and nothing that
 * touches the network. */
const RUN = {
  cardfont: ctx => cardFontPass(ctx.c, ctx.origin),
  fixture: ctx => fixturePass(ctx.c),
  season: ctx => seasonPass(ctx.c, ctx.origin),
  gamerowsfit: ctx => gameRowsFitPass(ctx.c, ctx.origin),
  todayback: ctx => todayAndBackPass(ctx.c, ctx.origin),
  todaykeys: ctx => todayKeysAndUndoPass(ctx.c, ctx.origin),
  gamepasses: ctx => gamePassesPass(ctx.c, ctx.origin),
  teamcolor: ctx => teamColorPass(ctx.c, ctx.origin),
  wakelock: ctx => wakeLockPass(ctx.c, ctx.origin, ctx.consoleErrors),
  overlay: ctx => overlayPass(ctx.c, ctx.source),
  touch: ctx => touchPass(ctx.c, ctx.origin, ctx.source),
  settingsrows: ctx => settingsRowPass(ctx.c, ctx.source),
  whorows: ctx => whoRowsPass(ctx.c, ctx.source),
  planrows: ctx => planRowsPass(ctx.c, ctx.source),
  planctrls: ctx => planControlsPass(ctx.c, ctx.source),
  todaygamerows: ctx => todayGameRowsPass(ctx.c, ctx.source),
  gametitle: ctx => gameTitlePass(ctx.c, ctx.origin),
  sentencesheets: ctx => sentenceSheetsPass(ctx.c, ctx.origin),
  plansheet: ctx => planSheetPass(ctx.c, ctx.origin),
  sheetspacing: ctx => sheetSpacingPass(ctx.c, ctx.origin),
  timelinecardsheet: ctx => timelineCardSheetPass(ctx.c, ctx.origin),
  teamscreen: ctx => teamScreenPass(ctx.c, ctx.origin),
  addgameflow: ctx => addGameFlowPass(ctx.c, ctx.origin),
  focusclear: ctx => focusClearPass(ctx.c),
  floatingcontrols: ctx => floatingControlsPass(ctx.c, ctx.origin),
  resumebar: ctx => resumeBarPass(ctx.c, ctx.origin),
  narrow: ctx => narrowPass(ctx.c),
  sweep: ctx => sweepPass(ctx.c),
  applargetext: ctx => appLargeTextPass(ctx.c, ctx.origin),
  typescale: ctx => typeScalePass(ctx.c, ctx.origin),
  static: ctx => staticPass(ctx.c, ctx.source, ctx.origin),
};
const REGISTRY = Object.freeze(ROWS.map(r => (RUN[r.id] ? { ...r, run: RUN[r.id] } : r)));

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
  const { proc, dir, ws } = await launch(debugPort, has('--headful'));
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
    /* #30's own guard, right after the fixture check it depends on:
       `fixturePass` above already leaves Today as its own baseline. */
    report.checks.push(await safeCheck('season', () => seasonPass(c, origin)));
    /* #72: its own `?try=9` landing, in light and dark -- reloads onto a
       freshly wiped nine-player sample rather than reading the rich fixture,
       and restores RICH itself before returning (see game-rows-fit.mjs), so
       everything below still finds the fixture `goRich` left above. */
    report.checks.push(await safeCheck('gamerowsfit', () => gameRowsFitPass(c, origin)));
    /* Both of these reload their own fixture and put RICH back the way they
       found it (`view: 'games'`, one team), same courtesy the wake-lock
       reload below pays. */
    report.checks.push(await safeCheck('todayback', () => todayAndBackPass(c, origin)));
    report.checks.push(await safeCheck('todaykeys', () => todayKeysAndUndoPass(c, origin)));
    /* #26. Reloads onto its own `FOUR` fixture and puts RICH back before
       returning, same courtesy as the two rows above. */
    report.checks.push(await safeCheck('gamepasses', () => gamePassesPass(c, origin)));
    /* #69 decision 5, item 8: the title block, against RICH's own game 0 --
       `gamepasses` above already put RICH back before returning. */
    report.checks.push(await safeCheck('gametitle', () => gameTitlePass(c, origin)));
    /* #25. It reloads with a two-team record (Royal, then Graphite) and
       switches team, so RICH is put back before the wake lock pass, which
       expects the fixture as goRich left it. */
    report.checks.push(await safeCheck('teamcolor', () => teamColorPass(c, origin)));
    await goRich(c, origin);

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
    report.checks.push(await safeCheck('touch', () => touchPass(c, origin, source)));
    /* Same reshuffle as touch, one line up: the single-viewport verdict
       `smoke-checks.js` already contributed to the cold array (Settings
       closed, so it read "not open") is replaced with the swept one. */
    report.checks = report.checks.filter(k => k.name !== 'settings rows ≥ 48px');
    report.checks.push(await safeCheck('settingsrows', () => settingsRowPass(c, source)));
    /* Same reshuffle again, one line further: the cold array's single-viewport
       verdict for the Who's here sheet (which never opened it, so it always
       read "not open") is replaced with the swept one. */
    report.checks = report.checks.filter(k => k.name !== "who's here rows ≥ 48px");
    report.checks.push(await safeCheck('whorows', () => whoRowsPass(c, source)));
    /* Same reshuffle again, one line further: the cold array's single-viewport
       verdict for the Plan sheet's rows (which never opened it, so it always
       read "not open") is replaced with the swept one. */
    report.checks = report.checks.filter(k => !k.name.startsWith('plan rows'));
    report.checks.push(await safeCheck('planrows', () => planRowsPass(c, source)));
    /* Same reshuffle again: the cold array's single-viewport verdict for the
       Plan sheet's other controls (never open at cold load, so it always
       read "not open") is replaced with the two-state one. */
    report.checks = report.checks.filter(k => k.name !== 'plan sheet controls ≥ 48px');
    report.checks.push(await safeCheck('planctrls', () => planControlsPass(c, source)));
    /* Same reshuffle again: the cold array's single-viewport verdict for
       item 4's control list (Today only, no game open) is replaced with the
       swept one. */
    report.checks = report.checks.filter(k => k.name !== 'today and game controls ≥ 48px');
    report.checks.push(await safeCheck('todaygamerows', () => todayGameRowsPass(c, source)));
    report.checks.push(await safeCheck('sentencesheets', () => sentenceSheetsPass(c, origin)));
    report.checks.push(await safeCheck('plansheet', () => planSheetPass(c, origin)));
    report.checks.push(await safeCheck('sheetspacing', () => sheetSpacingPass(c, origin)));
    report.checks.push(await safeCheck('timelinecardsheet', () => timelineCardSheetPass(c, origin)));
    /* #31. Its last item empties the roster through the app's own remove path
       to reach the first-run state, so it reloads RICH before returning --
       every pass below assumes the eleven players are back. */
    report.checks.push(await safeCheck('teamscreen', () => teamScreenPass(c, origin)));
    /* #32. It pushes games into the day through the flow's own buttons, so --
       like `teamscreen` above -- it reloads RICH before returning and every
       pass below finds the two-game Saturday it expects. */
    report.checks.push(await safeCheck('addgameflow', () => addGameFlowPass(c, origin)));
    // #33 decision 15: right after the game screen is back to a known state
    // (addgameflow above already reloads RICH, which lands on it).
    report.checks.push(await safeCheck('focusclear', () => focusClearPass(c)));
    // #33 items 1-6 and 10: same place, same reason -- it ends back on Today.
    report.checks.push(await safeCheck('floatingcontrols', () => floatingControlsPass(c, origin)));
    // #34's own guard: it reloads through several fixtures of its own
    // (including a wipe, for the first-run case) and restores RICH before
    // returning, exactly as `teamscreen` and `addgameflow` above do.
    report.checks.push(await safeCheck('resumebar', () => resumeBarPass(c, origin)));
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
