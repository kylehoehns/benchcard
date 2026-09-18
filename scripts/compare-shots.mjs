#!/usr/bin/env node
/* #86: one committed compare-screenshot harness, so the two capture bugs
 * every ship agent re-introduced in a throwaway script stop coming back.
 *
 *   node scripts/compare-shots.mjs --issue <n> [--states a,b] [--out dir]
 *
 * Writes PNGs and `measurements.json` to
 * `notes/mockups/prototype/compare/<issue>/` (or `--out <dir>`) and exits 0
 * only once every shot is proved trustworthy.
 *
 * THE TWO BUGS THIS EXISTS TO CATCH (docs/specs/86-compare-shots.md):
 *
 *   1. `Page.captureScreenshot` with its `captureBeyondViewport` flag on
 *      resizes the renderer internally, which silently drops a `Page.setFontSizes`
 *      override -- the shot still reports the viewport it asked for. This
 *      harness never passes that flag; it grows the viewport with
 *      `Emulation.setDeviceMetricsOverride` instead, then RE-MEASURES the
 *      root font size after every resize rather than trusting the request.
 *   2. The rich fixture's `ui.theme` is `'light'`, and `applyTheme` in
 *      `app/render.js` only consults `prefers-color-scheme` when that
 *      setting is `'auto'` -- so emulating a dark OS paints nothing. Dark is
 *      reached the way `goRich`'s own override is built for: writing
 *      `ui.theme: 'dark'` into the record, never OS emulation. And painted
 *      color is what is checked, never `data-theme`.
 *
 * `SHOTS`, `shotProblems` and `twinProblems` are pure and exported so
 * `test/compare-shots.test.js` can feed them known-bad readings without
 * launching Chrome. `main()` only runs when this file is executed directly
 * (see the guard at the bottom) -- importing the module launches nothing. */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { launch, cdp } from './smoke/chrome.mjs';
import { serve } from './serve.mjs';
import { parseTokensCss, colorOf } from './tokens-css.mjs';
import { evalIn, step, SETTLE, WIDTH, HEIGHT } from './smoke/dom.mjs';
import { goRich, LONG_NAME, RICH, partPlayed as partPlayedFixture, reloadWithRecord } from './smoke/fixtures.mjs';
import { fixturePass } from './smoke/rich-fixture.mjs';
import { VIEWS } from './smoke/sweep.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './smoke/registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* What each theme must actually have painted: `--bg` from `app/tokens.css`,
 * read back off the page by paint (`getComputedStyle`) and never by the
 * `data-theme` attribute -- that is item 3's whole point.
 *
 * DERIVED, not typed. `scripts/tokens-css.mjs` is already this repo's one
 * answer to "what color does this token resolve to" (`test/contrast.test.js`
 * asks it the same way), so a hand-typed `rgb(...)` pair here would be a
 * second copy of `--bg` that goes stale silently the next time the token is
 * edited -- a compare run would then fail for the wrong reason, blaming the
 * paint when the expectation is what moved. `getComputedStyle` returns
 * `rgb(r, g, b)` for an opaque color, so that is the shape built here.
 *
 * `test/compare-shots.test.js` still TYPES its expected values by hand on
 * purpose; that is the independent second reading, and the two disagreeing
 * is exactly the signal it exists to give. */
const rgbText = c => `rgb(${c.r}, ${c.g}, ${c.b})`;
const TOKENS = parseTokensCss(readFileSync(join(ROOT, 'app', 'tokens.css'), 'utf8'));
export const THEME_BG = Object.freeze({
  light: rgbText(colorOf(TOKENS.light, '--bg')),
  dark: rgbText(colorOf(TOKENS.dark, '--bg')),
});

/* ---------- SHOTS: one frozen table ----------
 *
 * Built from `VIEWS` (sweep.mjs's own five names) plus the five required
 * extras "What would settle it" item 5 names by hand: a long real name, a
 * screen scrolled to its bottom, a full-height capture, 320px at a 32px
 * root, and the empty first-run screen. Light and dark for everything except
 * the large-text cell, which is about layout and runs light only.
 *
 * `twin` names the paired shot for `twinProblems` -- a plain light/dark pair
 * shares the same view and settings and differs only in `theme`, so every
 * light shot's `twin` is its dark counterpart's name and vice versa. The
 * large-text shot never runs dark, so it declares no twin. */
const THEMES = ['light', 'dark'];
const otherTheme = t => (t === 'light' ? 'dark' : 'light');

const pair = (name, view, theme, extra = {}) => ({
  name: `${name}-${theme}`, view, theme, width: WIDTH, rootPx: 16,
  full: false, bottom: false, longNames: false, firstRun: false, titleCollapsed: false,
  partPlayed: false,
  twin: `${name}-${otherTheme(theme)}`,
  ...extra,
});

const BASE_SHOTS = VIEWS.flatMap(v => THEMES.map(theme => pair(v.name, v.name, theme)));

const EXTRA_SHOTS = [
  // A long real name in the identity block -- LONG_NAME on the roster.
  ...THEMES.map(theme => pair('long-name', 'team', theme, { longNames: true })),
  // A screen scrolled to its bottom -- the season ledger has the most to
  // scroll past (a day chart, minutes-so-far, three filed games).
  ...THEMES.map(theme => pair('bottom', 'season', theme, { bottom: true })),
  // A full-height capture -- settings is the tallest single screen in RICH.
  ...THEMES.map(theme => pair('full', 'settings', theme, { full: true })),
  // 320px at a 32px root -- bug 1's own repro cell, on Today. Light only: it
  // is about layout, not paint, so it declares no twin.
  { name: 'large-text-320', view: 'today', theme: 'light', width: LARGE_TEXT_WIDTH,
    rootPx: LARGE_TEXT_PX, full: false, bottom: false, longNames: false,
    firstRun: false, twin: null },
  // The empty first-run screen -- a genuinely wiped record, not RICH.
  ...THEMES.map(theme => pair('first-run', null, theme, { firstRun: true })),
  // #33 item 11: `.bar.title-in` (decision 1) -- scrolled just past the large
  // title, not to the bottom (a different, shallower scroll depth than the
  // `bottom` state above, which also uses Season). Season, not Today: RICH's
  // Today screen is only 853px tall against an 844px viewport, 9px of scroll
  // room -- nowhere near enough to carry its large title out of view, a real
  // capture-time failure this file's own `capture()` caught before ever
  // writing a PNG (`.bar` never gained `title-in`). Season's ledger, day
  // chart and filed games give it real room to scroll.
  ...THEMES.map(theme => pair('title-collapsed', 'season', theme, { titleCollapsed: true })),
  // #34 decision 16: the part-played Resume bar on Today -- its own plain
  // pair at 390x844, a full-document-height pair (the honest version of
  // `bottom: true`: RICH's Today is 853px against an 844px viewport, nine
  // pixels of scroll room, so a bottom scroll there would prove nothing),
  // and 320px at a 32px root for the long-name wrap case item 4 requires.
  ...THEMES.map(theme => pair('resume-bar', 'today', theme, { partPlayed: true })),
  ...THEMES.map(theme => pair('resume-bar-full', 'today', theme, { partPlayed: true, full: true })),
  { name: 'resume-bar-320', view: 'today', theme: 'light', width: LARGE_TEXT_WIDTH,
    rootPx: LARGE_TEXT_PX, full: false, bottom: false, longNames: false,
    firstRun: false, titleCollapsed: false, partPlayed: true, twin: null },
];

export const SHOTS = Object.freeze([...BASE_SHOTS, ...EXTRA_SHOTS].map(Object.freeze));

/* ---------- shotProblems: the font-size and paint rule ----------
 *
 * `want` is one `SHOTS` entry (or anything shaped like one); `got` is
 * `{ fontSizePx, bg }`, exactly what `capture` reads from the live page.
 * Pure and synchronous so the test can feed it any reading, real or
 * invented, with no browser involved. Empty array means the shot is
 * trustworthy. */
export function shotProblems(want, got) {
  const problems = [];
  const wantPx = want.rootPx ?? 16;
  if (typeof got.fontSizePx !== 'number' || Number.isNaN(got.fontSizePx)) {
    problems.push(`${want.name}: no root font size was measured`);
  } else if (Math.abs(got.fontSizePx - wantPx) > 0.5) {
    problems.push(`${want.name}: measured root font ${got.fontSizePx}px, requested ${wantPx}px`);
  }
  const wantBg = THEME_BG[want.theme];
  if (!wantBg) {
    problems.push(`${want.name}: unknown theme "${want.theme}"`);
  } else if (got.bg !== wantBg) {
    problems.push(`${want.name}: painted ${got.bg}, want ${wantBg} for theme "${want.theme}"`);
  }
  return problems;
}

/* ---------- postCaptureProblems: bug 1's runtime guard ----------
 *
 * `shotProblems` runs against a *pre-capture* reading -- taken before
 * `Page.captureScreenshot` is ever sent. Bug 1 is precisely a capture call
 * that resizes the renderer internally and drops the `Page.setFontSizes`
 * override *after* that reading was already banked, so a pre-capture check
 * alone goes green over a PNG that is wrong. `pre` and `post` are both
 * `{ fontSizePx, bg }`, read the same way `capture` reads them, before and
 * after `Page.captureScreenshot` returns. Pure and synchronous, same shape
 * as `shotProblems`: empty array means the two readings agree and the shot
 * is trustworthy. A mismatch is reported as a post-capture drift, naming
 * both readings, so the next person knows the capture call itself changed
 * the rendering rather than the setup being wrong. */
export function postCaptureProblems(want, pre, post) {
  const problems = [];
  if (typeof post.fontSizePx !== 'number' || Number.isNaN(post.fontSizePx)) {
    problems.push(`${want.name}: no post-capture root font size was measured`);
  } else if (typeof pre.fontSizePx === 'number' && !Number.isNaN(pre.fontSizePx)
      && Math.abs(post.fontSizePx - pre.fontSizePx) > 0.5) {
    problems.push(`${want.name}: post-capture drift -- root font measured ${post.fontSizePx}px after Page.captureScreenshot, but ${pre.fontSizePx}px before it`);
  }
  if (typeof post.bg !== 'string' || !post.bg) {
    problems.push(`${want.name}: no post-capture background paint was measured`);
  } else if (typeof pre.bg === 'string' && pre.bg && post.bg !== pre.bg) {
    problems.push(`${want.name}: post-capture drift -- painted ${post.bg} after Page.captureScreenshot, but ${pre.bg} before it`);
  }
  return problems;
}

/* ---------- twinProblems: the light/dark-are-never-identical rule ----------
 *
 * `records` is the array `capture` built for every shot actually taken:
 * `{ name, twin, digest, ... }`. Two twins with the same digest fail the
 * run, naming both files. A set in which nothing declares a twin fails too
 * -- rule 2a of /new-guard, a check that measured nothing FAILS -- rather
 * than passing having compared zero pairs. */
export function twinProblems(records) {
  const named = records.filter(r => r.twin);
  if (named.length === 0) {
    return ['no shot in this run declares a twin -- nothing was compared for a light/dark difference'];
  }
  const byName = new Map(records.map(r => [r.name, r]));
  const problems = [];
  const done = new Set();
  for (const r of named) {
    if (done.has(r.name)) continue;
    const twin = byName.get(r.twin);
    if (!twin) {
      problems.push(`${r.name}: declares twin "${r.twin}", but no shot with that name was captured this run`);
      done.add(r.name);
      continue;
    }
    done.add(r.name);
    done.add(twin.name);
    if (r.digest === twin.digest) {
      problems.push(`${r.name} and ${twin.name} are byte-identical (digest ${r.digest}) -- dark painted light, or vice versa`);
    }
  }
  return problems;
}

/* ---------- the empty first-run screen ----------
 *
 * A genuinely wiped record, not a RICH override: `landOnNine`, `firstRun`
 * and `tryLanding` in `app-large-text.mjs` already show why -- the app
 * re-seeds a record on every navigation and only a wipe registered as its
 * own on-new-document script survives a reload. `onboarded` defaults false
 * on a fresh record, which is what actually produces the welcome screen; no
 * fixture override reaches that, so this is the one shot in the table that
 * cannot go through `goRich`.
 *
 * The theme is set directly on `state.ui` after boot and repainted with the
 * app's own `applyTheme`, never by emulating `prefers-color-scheme` -- the
 * same rule item 3 states for every other shot, applied to the one state
 * `goRich`'s override cannot reach. */
async function goFirstRun(c, origin, theme) {
  const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.clear(); } catch {}`,
  });
  try {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !(document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden); i++)
        await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
  } finally {
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  await evalIn(c, step(`(async () => {
    const s = await import('/state.js');
    s.state.ui.theme = ${JSON.stringify(theme)};
    const rr = await import('/render.js');
    rr.applyTheme();
  })()`));
}

/* Mutates the roster in place, through the app's own state module -- never a
 * second player list. Reused player id (p5, "Jordan Bell") team-screen.mjs
 * and sheet-spacing.mjs already use for the same purpose. */
const setLongName = step(`(async () => {
  const s = await import('/state.js');
  const p = s.team().players.find(p => p.id === 'p5');
  if (p) p.name = ${JSON.stringify(LONG_NAME)};
  const rr = await import('/render.js');
  rr.renderAll();
})()`);

/* The two readings every shot is judged on, written once. `capture` evaluates
 * this twice -- before `Page.captureScreenshot` and again after it returns --
 * and bug 1's whole point is that the two can disagree, so the expression has
 * to be the SAME one both times or the comparison is between two different
 * questions. Paint, never `data-theme` (item 3). */
const READ_PAINT = `JSON.stringify({
  fontSizePx: parseFloat(getComputedStyle(document.documentElement).fontSize),
  bg: getComputedStyle(document.body).backgroundColor,
})`;

/* ---------- capture: drives one shot ----------
 *
 * Never turns on `captureBeyondViewport` (bug 1). The viewport is grown
 * explicitly with `Emulation.setDeviceMetricsOverride` for a full-height
 * shot, and the font size is re-applied and re-measured after that resize --
 * `Page.setFontSizes` on an already-laid-out document leaves it unreflowed,
 * the same trap `app-large-text.mjs` already documents. Throws on a
 * non-empty `shotProblems` result rather than writing a PNG that looks right
 * and is not. */
async function capture(c, origin, want, outDir) {
  await c.send('Page.setFontSizes', { fontSizes: { standard: want.rootPx, fixed: want.rootPx } });
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: want.width, height: HEIGHT, deviceScaleFactor: 2, mobile: true });

  if (want.firstRun) {
    await goFirstRun(c, origin, want.theme);
  } else if (want.partPlayed) {
    /* #34 decision 16: the part-played Resume bar, over `reloadWithRecord`
       rather than `goRich` -- `partPlayed()` needs `view: 'today'` baked
       into the record itself so the reload lands there directly, the same
       way `FOUR` (fixtures.mjs) sets it for its own Today-first checks. */
    const themed = { ...RICH, view: 'today', ui: { ...RICH.ui, theme: want.theme } };
    await reloadWithRecord(c, origin, partPlayedFixture(themed));
  } else {
    await goRich(c, origin, { theme: want.theme });
    if (want.longNames) await evalIn(c, setLongName);
    /* `RICH.view` is `'games'`, not `'today'` -- `goRich` lands the session on
       a game, where `.today-game` was never populated (`teams-view.js` only
       fills `#todayGames` when `state.view === 'today'`). Land on Today first
       via `VIEWS`' own 'today' entry, the same stop every view but Today
       already needs in `sweepPass`'s walk, so `.today-game` exists before a
       view's `open` script goes looking for it. */
    const today = VIEWS.find(v => v.name === 'today');
    if (want.view && want.view !== 'today' && today) await evalIn(c, step(today.open));
    const view = VIEWS.find(v => v.name === want.view);
    if (view) await evalIn(c, step(view.open));
    if (want.bottom) await evalIn(c, step(`window.scrollTo(0, document.body.scrollHeight)`));
    if (want.titleCollapsed) {
      /* #33 item 11: `.bar.title-in` (decision 1), not the `bottom` state
         above -- a shallow scroll, just past the large title, not to the
         screen's own bottom. Verified before writing the PNG: a scroll that
         did not actually clear `[data-large-title]` (a shorter title, a
         taller viewport) would otherwise write a shot that looks like every
         other plain one and silently prove nothing about the collapse. */
      await evalIn(c, step(`window.scrollTo(0, 240)`));
      const collapsed = await evalIn(c, `document.querySelector('.bar').classList.contains('title-in')`);
      if (!collapsed) {
        throw new Error(`${want.name}: .bar never gained title-in after scrolling -- this shot would not show the collapsed state`);
      }
    }
  }

  if (want.full) {
    const contentHeight = await evalIn(c, `Math.ceil(document.documentElement.scrollHeight)`);
    // Grow the viewport explicitly (bug 1's fix), then re-apply the font
    // size and re-measure -- a re-apply that does not take is a failure, not
    // a retry loop.
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: want.width, height: contentHeight, deviceScaleFactor: 2, mobile: true });
    await c.send('Page.setFontSizes', { fontSizes: { standard: want.rootPx, fixed: want.rootPx } });
    await evalIn(c, `(async () => { await ${SETTLE}; })()`);
  }

  const measured = JSON.parse(await evalIn(c, READ_PAINT));

  const problems = shotProblems(want, measured);
  if (problems.length) throw new Error(problems.join('; '));

  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });

  // Bug 1's runtime guard: the reading above was banked *before*
  // `Page.captureScreenshot` was ever sent, and bug 1 is precisely a capture
  // call that resizes the renderer internally and drops the font-size
  // override after that. Re-read the same two values now that the capture
  // has actually returned and compare them with the pre-capture reading --
  // do not delete the pre-capture check above, this is in addition to it.
  const postMeasured = JSON.parse(await evalIn(c, READ_PAINT));
  const postProblems = postCaptureProblems(want, measured, postMeasured);
  if (postProblems.length) throw new Error(postProblems.join('; '));

  const buf = Buffer.from(data, 'base64');
  const file = `${want.name}.png`;
  await writeFile(join(outDir, file), buf);

  return {
    name: want.name, file, view: want.view, theme: want.theme, width: want.width,
    rootPx: want.rootPx, full: want.full, bottom: want.bottom, longNames: want.longNames,
    firstRun: want.firstRun, titleCollapsed: want.titleCollapsed, partPlayed: want.partPlayed,
    twin: want.twin, measured,
    digest: createHash('sha256').update(buf).digest('hex'),
  };
}

/* ---------- CLI ---------- */

function parseArgs(argv) {
  const flag = name => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  return {
    issue: flag('--issue'),
    states: flag('--states'),
    out: flag('--out'),
  };
}

export async function main() {
  const { issue, states, out } = parseArgs(process.argv.slice(2));
  if (!issue) {
    console.error('usage: node scripts/compare-shots.mjs --issue <n> [--states a,b] [--out dir]');
    process.exit(1);
    return;
  }

  // An unknown state name is refused by name, before Chrome ever launches.
  let selected = SHOTS;
  if (states) {
    const names = states.split(',').map(s => s.trim()).filter(Boolean);
    const known = new Set(SHOTS.map(s => s.name));
    const unknown = names.filter(n => !known.has(n));
    if (unknown.length) {
      console.error(`unknown --states name(s): ${unknown.join(', ')}`);
      console.error(`known names: ${SHOTS.map(s => s.name).join(', ')}`);
      process.exit(1);
      return;
    }
    selected = SHOTS.filter(s => names.includes(s.name));
  }

  const outDir = out ? resolve(out) : join(ROOT, 'notes', 'mockups', 'prototype', 'compare', String(issue));
  await mkdir(outDir, { recursive: true });

  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const debugPort = 9333 + Math.floor(Math.random() * 500);
  const { proc, dir, ws } = await launch(debugPort, process.argv.includes('--headful'));
  const c = cdp(ws);
  try {
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });

    // `goRich` writes to `localStorage` on whatever page is currently
    // loaded, and a session starts on `about:blank`, where that write throws
    // ("Access is denied for this document"). One real navigation first puts
    // the session on the app's own origin, the way every `goRich` caller in
    // `smoke.mjs` already has one behind it by the time it calls in.
    const firstLoad = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await firstLoad;

    // The fixture is a guard: run it once and stop the run if it fails. A
    // compare set taken against a fixture that did not arrive proves
    // nothing -- the whole subject of this ticket.
    await goRich(c, origin);
    const fp = await fixturePass(c);
    if (!fp.pass) throw new Error(`rich fixture did not arrive, stopping: ${fp.detail}`);

    const records = [];
    for (const want of selected) {
      records.push(await capture(c, origin, want, outDir));
    }

    const problems = twinProblems(records);
    if (problems.length) throw new Error(problems.join('; '));

    await writeFile(join(outDir, 'measurements.json'), JSON.stringify(records, null, 2) + '\n');
    console.log(`compare-shots: wrote ${records.length} PNG(s) and measurements.json to ${outDir}`);
  } finally {
    // Restore the overrides, the way `appLargeTextPass` does in its own
    // `finally`: font size back to 16, metrics back to 390x844.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } }).catch(() => {});
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true }).catch(() => {});
    c.close();
    proc.kill();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    server.close();
  }
}

// Runs only on direct invocation, so importing this module (the test does)
// launches nothing.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
