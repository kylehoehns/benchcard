#!/usr/bin/env node
/* #180: one committed command that screenshots the app at the widths, text
 * sizes and themes a look check needs, against a local server or any URL (a
 * preview included), and writes the cut-off-text measurements #179's smoke
 * check makes beside every PNG.
 *
 *   node scripts/look.mjs --out <dir> [--url <url>] [--widths 320,390]
 *     [--font 16,32] [--dark] [--view today,settings,about] [--headful]
 *
 * Each shot is `<view-slug>-<width>-<font>-<theme>.png`, plus `-bottom.png`
 * when that state scrolls. `measurements.json` holds one record per PNG.
 * Findings are reported, never a failure: the exit code is non-zero only when
 * a shot could not be proved (font size, painted theme, service worker,
 * about's fade-in) or a state did not open. For a redesign ticket's fixed
 * set against the prototype use `compare-shots.mjs` instead.
 *
 * Everything that sets the page up is reused: `land` (width, text size,
 * emulated media and the record, in the order that makes the font size take),
 * `openState` (the states clip-sweep.mjs walks), `CLIP_PROBE` and
 * `knownIssueFor` (the #179 measurement), `shotProblems`/`postCaptureProblems`
 * (compare-shots.mjs' per-shot proof). This file sends no
 * `Emulation.setDeviceMetricsOverride`, `Page.setFontSizes` or
 * `Emulation.setEmulatedMedia` itself. It never passes `captureBeyondViewport`.
 *
 * The pure parts (`parseArgs`, `cells`, `slug`, `classify`) are exported so
 * `test/look.test.js` runs them with no browser; `main()` runs only on direct
 * invocation, so importing this launches nothing. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { launch, cdp, closeChrome } from './smoke/chrome.mjs';
import { serve } from './serve.mjs';
import { FONT_INJECTION_SCRIPT, CLOCK_SCRIPT } from './smoke/registry.mjs';
import { evalIn, SETTLE, TIMER_TRACKER } from './smoke/dom.mjs';
import { richWith, FOUR, TODAY_LANDING } from './smoke/fixtures.mjs';
import { land } from './smoke/page-state.mjs';
import { VIEWS } from './smoke/sweep.mjs';
import { APP_LARGE_TEXT_STATES } from './smoke/app-large-text.mjs';
import {
  CLIP_PROBE, LONG_AND_SQUEEZE, CONFIRM_STATE, SCROLL_TO_BOTTOM, findingsOf, knownIssueFor, openState,
} from './smoke/clip-sweep.mjs';
import { shotProblems, postCaptureProblems, READ_PAINT } from './compare-shots.mjs';

const APP_STATES = [...APP_LARGE_TEXT_STATES, CONFIRM_STATE];
const ABOUT = 'about';
const VIEW_NAMES = [...APP_STATES.map(s => s.name), ABOUT];

/* The page's own scrolling state: the window plus every scroller's offset, so
 * "did the bottom shot move anything" covers an open sheet's own scroller. */
const SCROLLED = `(() => { let n = Math.round(window.scrollY);
  for (const el of document.querySelectorAll('*')) n += Math.round(el.scrollTop);
  return n; })()`;

/* Item 5: which page this was and whether a service worker held it. */
const WHERE = `JSON.stringify({ host: location.host, swControlled: !!navigator.serviceWorker?.controller })`;

/* The first load registers the app's worker, which activates and claims that
 * one page a moment later (`app/sw.js`). Waiting that out here keeps the claim
 * from landing on a page the run later shoots; every navigation after it is
 * served around the worker by the bypass below. Capped, for a URL with none. */
const SW_SETTLED = `(async () => {
  if (!navigator.serviceWorker) return;
  await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 3000))]);
  for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 50));
})()`;

/* `about` fades each `.reveal` in on scroll; reduced motion forces opacity 1. */
const REVEAL_STATE = `JSON.stringify({
  n: document.querySelectorAll('.reveal').length,
  faded: [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity !== '1').length,
})`;

/* The chart pages are out of scope (decided); `about` is the one static page. */
const ABOUT_READY = `document.querySelector('.reveal')`;

const REDUCED_MOTION = [{ name: 'prefers-reduced-motion', value: 'reduce' }];

/* A wiped-record state has no `ui.theme` to seed (it follows the OS, which
 * may be dark), so the theme is set through the app's own state and
 * `applyTheme`, as compare-shots.mjs' first-run shot does; the paint check
 * below still decides whether it took. */
const applyTheme = theme => `(async () => {
  const s = await import('/state.js');
  s.state.ui.theme = ${JSON.stringify(theme)};
  (await import('/render.js')).applyTheme();
})()`;

export const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const USAGE = 'usage: node scripts/look.mjs --out <dir> [--url <url>] [--widths 320,390] [--font 16,32] [--dark] [--view a,b] [--headful]';

function positiveInts(flag, text) {
  return text.split(',').map(raw => {
    const t = raw.trim();
    if (!/^[1-9]\d*$/.test(t)) throw new Error(`${flag}: "${t}" is not a positive integer`);
    return Number(t);
  });
}

/* A state name can itself hold ", " ("add a game, step 1"), so the comma list
 * is read longest-known-name first rather than split blindly. */
function viewNames(text) {
  const tokens = text.split(',').map(t => t.trim());
  const known = new Set(VIEW_NAMES);
  const found = [], unknown = [];
  for (let i = 0; i < tokens.length;) {
    let j = tokens.length;
    while (j > i && !known.has(tokens.slice(i, j).join(', '))) j--;
    if (j > i) { found.push(tokens.slice(i, j).join(', ')); i = j; } else unknown.push(tokens[i++]);
  }
  if (unknown.length) {
    throw new Error(`unknown --view name(s): ${unknown.join(', ')}\nknown views: ${VIEW_NAMES.join(' | ')}`);
  }
  return found;
}

export function parseArgs(argv) {
  const flag = name => { const i = argv.indexOf(name); return i === -1 ? null : (argv[i + 1] ?? ''); };
  const out = flag('--out');
  if (!out) throw new Error(`--out <dir> is required\n${USAGE}`);
  const url = flag('--url');
  const widths = flag('--widths'), fonts = flag('--font'), views = flag('--view');
  return {
    out,
    url: url ? url.replace(/\/+$/, '') : null,
    widths: widths === null ? [320, 390] : positiveInts('--widths', widths),
    fonts: fonts === null ? [16, 32] : positiveInts('--font', fonts),
    dark: argv.includes('--dark'),
    views: views === null ? VIEWS.map(v => v.name) : viewNames(views),
    headful: argv.includes('--headful'),
  };
}

export function cells({ views, widths, fonts, dark }) {
  const themes = dark ? ['light', 'dark'] : ['light'];
  return views.flatMap(view => widths.flatMap(width => fonts.flatMap(font => themes.map(theme =>
    ({ view, width, font, theme, stem: `${slug(view)}-${width}-${font}-${theme}` })))));
}

/* One shot's findings, each with the issue that excuses it (or null). */
export const classify = findings => findings.map(f => ({ ...f, excused: knownIssueFor(f) }));

/* One cell: land, open the state, settle, then the top shot, and the bottom
 * shot when scrolling moved something. Throws the moment a shot is not proved. */
async function shoot(c, origin, cell, outDir) {
  const record = richWith({ theme: cell.theme }, LONG_AND_SQUEEZE);
  /* page '/', not '/index.html': the local server's 307 from the latter drops
   * a query string (`?try=`), and with the service worker bypassed nothing
   * else would answer it. */
  const want = { width: cell.width, textPx: cell.font, media: REDUCED_MOTION, page: '/' };
  const records = [];

  if (cell.view === ABOUT) {
    await land(c, origin, { record, ...want, page: '/about', ready: ABOUT_READY });
  } else {
    const state = APP_STATES.find(s => s.name === cell.view);
    /* The states are written to be walked in order, from Today; each cell
     * starts from Today on its own, with the same long names loaded. */
    await land(c, origin, { record: { ...record, view: 'today' }, ...want, ...TODAY_LANDING });
    await openState(c, origin, state, state.four ? { ...want, record: richWith({ theme: cell.theme }, FOUR) } : want);
    if (state.firstRun || state.tryLink || state.firstRunTypedRoster) await evalIn(c, applyTheme(cell.theme));
  }
  await evalIn(c, SETTLE);

  if (cell.view === ABOUT) {
    const r = JSON.parse(await evalIn(c, REVEAL_STATE));
    if (r.n === 0) throw new Error(`${cell.stem}: about has no .reveal elements, so the fade-in check measured nothing`);
    if (r.faded) throw new Error(`${cell.stem}: ${r.faded} of ${r.n} .reveal elements are not at opacity 1`);
  }

  const take = async pos => {
    const file = `${cell.stem}${pos === 'bottom' ? '-bottom' : ''}.png`;
    const proof = { name: file, rootPx: cell.font, theme: cell.theme };
    const measured = JSON.parse(await evalIn(c, READ_PAINT));
    const where = JSON.parse(await evalIn(c, WHERE));
    const problems = shotProblems(proof, measured);
    if (where.swControlled) problems.push(`${file}: a service worker controlled the page on ${where.host}`);
    if (problems.length) throw new Error(problems.join('; '));

    const res = JSON.parse(await evalIn(c, CLIP_PROBE));
    if (!res.scanned) throw new Error(`${file}: the clip probe scanned no elements on ${where.host}`);

    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    const post = postCaptureProblems(proof, measured, JSON.parse(await evalIn(c, READ_PAINT)));
    if (post.length) throw new Error(post.join('; '));

    const buf = Buffer.from(data, 'base64');
    await writeFile(resolve(outDir, file), buf);
    records.push({
      file, view: cell.view, width: cell.width, font: cell.font, theme: cell.theme, pos,
      origin: where.host, swControlled: where.swControlled, measured,
      digest: createHash('sha256').update(buf).digest('hex'),
      findings: classify(findingsOf(res, cell.view, pos)),
    });
  };

  await take('top');
  const before = await evalIn(c, SCROLLED);
  await evalIn(c, SCROLL_TO_BOTTOM);
  await evalIn(c, SETTLE);
  if (await evalIn(c, SCROLLED) !== before) await take('bottom');
  return records;
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); } catch (e) { console.error(e.message); return 1; }

  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });
  const server = args.url ? null : await serve();
  const origin = args.url ?? `http://127.0.0.1:${server.address().port}`;
  const { proc, dir, ws } = await launch(9333 + Math.floor(Math.random() * 500), args.headful);
  const c = cdp(ws);
  const records = [];
  try {
    await c.ready;
    for (const m of ['Runtime.enable', 'Page.enable', 'Network.enable']) await c.send(m);
    // A fresh profile has no worker; this keeps one from ever answering.
    await c.send('Network.setBypassServiceWorker', { bypass: true });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const source of [FONT_INJECTION_SCRIPT, CLOCK_SCRIPT, TIMER_TRACKER]) {
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source });
    }
    // One real navigation first, so storage writes are on the app's origin.
    const first = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: `${origin}/index.html` });
    await first;
    await evalIn(c, SW_SETTLED);

    for (const cell of cells(args)) records.push(...await shoot(c, origin, cell, outDir));
    if (!records.length) throw new Error('no shot was taken, so there is nothing to write');

    await writeFile(resolve(outDir, 'measurements.json'), JSON.stringify(records, null, 2) + '\n');
    for (const r of records) {
      const open = r.findings.filter(f => f.excused === null);
      if (open.length) console.log(`look: ${r.file}: ${open.length} unexcused finding(s): ${open.map(f => `${f.kind} ${f.el}`).join('; ')}`);
    }
    console.log(`look: wrote ${records.length} PNG(s) and measurements.json to ${outDir} (origin ${[...new Set(records.map(r => r.origin))].join(', ')})`);
    return 0;
  } catch (e) {
    console.error(`look: ${e.message}`);
    return 1;
  } finally {
    // The browser is killed with its fresh profile, so the page overrides
    // `land` set die with it; nothing is left to restore.
    c.close();
    await closeChrome(proc, dir);
    server?.close();
  }
}

// Runs only on direct invocation, so importing this module launches nothing.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(code => process.exit(code), e => { console.error(e.message); process.exit(1); });
}
