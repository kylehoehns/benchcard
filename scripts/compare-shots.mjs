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
import { goRich, LONG_NAME, RICH, partPlayed as partPlayedFixture, reloadWithRecord, seeded } from './smoke/fixtures.mjs';
import { fixturePass } from './smoke/rich-fixture.mjs';
import { VIEWS } from './smoke/sweep.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH, SHEET_MIN, WIDE_MIN, LAPTOP, TOUCH_WIDTHS } from './smoke/sizes.mjs';

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

/* #37: the middle width of the touch sweep, read from its own list so this
 * table and the sweep can never name two different "360"s. */
const MID_TOUCH = TOUCH_WIDTHS[1];

/* The shape of a shot with every modifier off, written ONCE: both builders
 * below start from it, so a new modifier is declared here and nowhere else.
 * `mobile` is what that is worth -- it had to be hand-typed into four
 * separate entries the day it arrived, and the entry that missed it would
 * have been captured as whatever `capture()` felt like defaulting to. */
const SHOT = Object.freeze({
  view: null, theme: 'light', width: WIDTH, rootPx: 16,
  full: false, bottom: false, longNames: false, firstRun: false,
  titleCollapsed: false, partPlayed: false,
  /* #36 item 10: which numbered first-run step to land the shot on (0 means
     "just the wiped landing", `firstRun`'s own unchanged meaning above), and
     whether to fill it with a full, real roster instead of the sample fill
     every other numbered step uses -- see `goFirstRun` below. Kept off the
     `firstRun` flag itself so the pre-existing "exactly one landing pair"
     shape of that flag (test/compare-shots.test.js) does not have to widen
     to mean something else. */
  firstRunStep: 0, firstRunLongNames: false,
  /* #35 decision 15: `mobile` joins the shot shape, defaulting to the phone
     every other shot in this table is. It was hardcoded `true` at every
     `Emulation.setDeviceMetricsOverride` call in this file, which is simply
     wrong for a laptop-width shot -- mobile emulation carries touch input and
     mobile viewport handling with it. */
  mobile: true,
  /* #35 decision 15: a dialog to open before the shot is taken -- a selector
     and the click that opens it, or null. Same "prove the modifier happened"
     shape as `bottom` and `titleCollapsed`. */
  sheet: null,
});

const pair = (name, view, theme, extra = {}) => ({
  ...SHOT,
  name: `${name}-${theme}`, view, theme,
  twin: `${name}-${otherTheme(theme)}`,
  ...extra,
});

/* A cell that runs light only -- the large-text ones, which are about layout
 * rather than paint. Its name carries no theme suffix and it declares no
 * twin, which is the whole of the difference from `pair`. */
const solo = (name, view, extra = {}) => ({ ...SHOT, name, view, twin: null, ...extra });

const BASE_SHOTS = VIEWS.flatMap(v => THEMES.map(theme => pair(v.name, v.name, theme)));

/* #37: the click that opens the player sheet and the dialog it must open,
 * shared by the two cells below that both need it -- one unscrolled, one
 * scrolled to the sheet's end. */
const PLAYER_SHEET = {
  selector: 'dialog#sheetPlayer[open]',
  open: `document.querySelector('#rosterlist .rrow').click()`,
};

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
  solo('large-text-320', 'today', { width: LARGE_TEXT_WIDTH, rootPx: LARGE_TEXT_PX }),
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
  solo('resume-bar-320', 'today',
    { width: LARGE_TEXT_WIDTH, rootPx: LARGE_TEXT_PX, partPlayed: true }),
  /* AND THAT CELL SCROLLED TO ITS END. `bottom: true` is worthless on Today
     at 390px (nine pixels of scroll room, as the entry above says), but at
     320px with a 32px root the bar wraps to five lines, Today grows well past
     one screen, and the end of the scroll is exactly where a bar taller than
     `.wrap`'s clearance strands content -- measured at 84px of `#todaySeason`
     left under a 310px bar before the clearance learned to read `--ab-h`.
     `resume-bar-full` cannot show this: a full-document capture has no last
     screenful to be stranded in. Light only, like every other large-text
     cell, so it declares no twin. */
  solo('resume-bar-bottom-320', 'today',
    { width: LARGE_TEXT_WIDTH, rootPx: LARGE_TEXT_PX, partPlayed: true, bottom: true }),
  /* #35 Proof 5: the wide layout, which no shot above can show -- every one
     of them is 390px or narrower, where this ticket changes nothing at all.
     A laptop, so `mobile: false` (decision 15).
       wide-today  -- Today as the 360px rail with the open game beside it,
                      the arrangement the ticket is named after;
       wide-game   -- the game screen as the current view, rail still there;
       wide-bottom -- Season scrolled to its end in the right pane, with the
                      rail (its own scroller) beside it: the clipping case
                      the look check exists for;
       wide-840    -- the breakpoint itself, where the right pane is at its
                      narrowest (840 - 360 = 480px) and anything that does
                      not fit shows first. */
  ...THEMES.map(theme => pair('wide-today', 'today', theme, { width: LAPTOP, mobile: false })),
  ...THEMES.map(theme => pair('wide-game', 'games', theme, { width: LAPTOP, mobile: false })),
  ...THEMES.map(theme => pair('wide-bottom', 'season', theme, { width: LAPTOP, mobile: false, bottom: true })),
  ...THEMES.map(theme => pair('wide-840', 'today', theme, { width: WIDE_MIN, mobile: false })),
  /* #35 Proof 5's last state: the middle band, where the layout is still one
     column but a bottom sheet has become a centered dialog. The card sheet is
     the one reachable from the game screen's own chrome (#shareBtn), which is
     why this pair opens on the game. The click and the dialog it must open
     are both declared, so a capture that clicked and got nothing fails
     instead of writing a picture of the game screen. */
  ...THEMES.map(theme => pair('mid-sheet', 'games', theme, {
    width: SHEET_MIN,
    sheet: { selector: 'dialog.bsheet[open]', open: `document.getElementById('shareBtn').click()` },
  })),
  /* #37 item 1: the player sheet, the only surface that draws `.bal-step` --
     the level meter's five steps, raised from 44px to 48px here and paid for
     by tightening `.prow-level .bal-steps` to a .25rem gap so the row keeps
     its height. Every other cell in this table is a screen or the card sheet,
     so that change had no picture and the look check could not see it.
     Opened the way the touch sweep opens it (scripts/smoke/touch.mjs): the
     Team screen, then the first roster row. */
  ...THEMES.map(theme => pair('player-sheet', 'team', theme, { sheet: PLAYER_SHEET })),
  /* ...and that sheet scrolled to its own end, which is where the level meter
     actually sits -- it is below the fold on an unscrolled sheet, so the pair
     above cannot show it. `bottom` on a sheet cell scrolls the sheet's own
     scroller (capture() below), because the window does not move while a
     sheet is open. */
  ...THEMES.map(theme => pair('player-sheet-bottom', 'team', theme, {
    sheet: PLAYER_SHEET, bottom: true,
  })),
  /* #36 item 10: the three numbered first-run steps themselves, each light
     and dark -- the empty step 1 (matching the add-game step 1 mockup this
     markup shares), step 2's format steppers at their real defaults, and
     step 3's actual committed card. Reached with #welStart and step 1's own
     "Fill with a sample team" button (Reuse), never a hand-typed roster. */
  ...THEMES.map(theme => pair('first-run-1', null, theme, { firstRunStep: 1 })),
  ...THEMES.map(theme => pair('first-run-2', null, theme, { firstRunStep: 2 })),
  ...THEMES.map(theme => pair('first-run-3', null, theme, { firstRunStep: 3 })),
  /* #36 item 10: a roster of full real names -- SAMPLE_LINES in full (Reuse:
     sampleRosterText, never a second roster typed by hand), scrolled to the
     bottom of #frBody, the one look-check state that proves a long, real
     roster does not clip or hide inside the box. */
  ...THEMES.map(theme => pair('first-run-long-names', null, theme,
    { firstRunStep: 1, firstRunLongNames: true })),
  /* #36 item 10: 320px at a 32px root, step 1 -- the same repro cell
     `large-text-320` runs on Today, applied to the first-run flow. Light
     only, like every other large-text cell: it is about layout, not paint. */
  solo('first-run-320', null,
    { firstRunStep: 1, width: LARGE_TEXT_WIDTH, rootPx: LARGE_TEXT_PX }),
  /* #36 item 10: the 840px and 1280px wide layouts -- decision 14's own cap
     (.flow-bar-row/.flow-prog/.flow-body/.flow-foot clamped to 34rem and
     centered at 840px+). Step 2, light and dark: the steppers and
     GRAN_CHOICES rows are exactly the content that cap constrains. */
  ...THEMES.map(theme => pair('first-run-wide-1280', null, theme,
    { firstRunStep: 2, width: LAPTOP, mobile: false })),
  ...THEMES.map(theme => pair('first-run-wide-840', null, theme,
    { firstRunStep: 2, width: WIDE_MIN, mobile: false })),
  /* #37 Proof 9: 360px, the common small Android and the middle of
     `TOUCH_WIDTHS` (Reuse: the same three widths the touch sweep measures at,
     never a second list). Every shot above is 320, 390 or wider, so the width
     where a 48px control is widest before it wraps, and where a roster name
     sits closest to its row's edge, was the one no picture ever showed. Team
     for the roster rows criterion 2 measures, settings for the rows criterion
     1 raised to 48px; plain pairs, so no `full`/`bottom` modifier claims a
     state another cell already owns. */
  ...THEMES.map(theme => pair('touch-360-team', 'team', theme, { width: MID_TOUCH })),
  ...THEMES.map(theme => pair('touch-360-settings', 'settings', theme, { width: MID_TOUCH })),
];

export const SHOTS = Object.freeze([...BASE_SHOTS, ...EXTRA_SHOTS].map(Object.freeze));

/* ---------- deviceMetrics: what Chrome is actually asked for ----------
 *
 * The one place the `Emulation.setDeviceMetricsOverride` payload for a shot
 * is built, so the `mobile` flag has exactly one reader. Pure and exported
 * for the same reason `shotProblems` is: `test/compare-shots.test.js` can
 * check the rule without launching a browser. `height` is a parameter
 * because a `full: true` shot overrides a second time with the document's
 * own height. */
export const deviceMetrics = (want, height) => ({
  width: want.width, height, deviceScaleFactor: 2, mobile: want.mobile !== false,
});

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
async function goFirstRun(c, origin, theme, opts = {}) {
  await seeded(c, `try { localStorage.clear(); } catch {}`, async () => {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !(document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden); i++)
        await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
  });
  await evalIn(c, step(`(async () => {
    const s = await import('/state.js');
    s.state.ui.theme = ${JSON.stringify(theme)};
    const rr = await import('/render.js');
    rr.applyTheme();
  })()`));

  const atStep = opts.step || 0;
  if (atStep === 0) return; // the plain landing -- unchanged from before #36

  // #welStart, never #welTry: a numbered-step shot needs a draft this file
  // controls the exact contents of. "Fill with a sample team" inside step 1
  // (Reuse: `#frFill`, wired to the same `fillSample`) is used below instead,
  // so first-run-1 stays genuinely empty, matching the add-game step 1
  // mockup this markup shares.
  await evalIn(c, step(`document.getElementById('welStart').click()`));

  if (opts.longNames) {
    // "a roster of full real names" -- SAMPLE_LINES itself (roster.js), in
    // full (12 lines, not DEMO_N's 9) so the box has enough content to
    // actually need scrolling at 390x844. Reuse: sampleRosterText, never a
    // second roster typed out by hand here.
    await evalIn(c, step(`(async () => {
      const r = await import('/roster.js');
      const t = document.getElementById('frRoster');
      t.value = r.sampleRosterText(12);
      t.dispatchEvent(new Event('input', { bubbles: true }));
    })()`));
    // `#frRoster` is the thing that actually overflows -- a plain
    // `<textarea>` (`min-height: 8rem`) scrolls its own content, not
    // `.flow-body` around it, so it is the textarea's own `scrollTop` that
    // has to move. Proved, not assumed -- the same "modifier actually
    // happened" rule `titleCollapsed`/`bottom` already follow.
    await evalIn(c, step(`(() => {
      const t = document.getElementById('frRoster');
      t.scrollTop = t.scrollHeight;
    })()`));
    const scrolled = await evalIn(c, `Math.round(document.getElementById('frRoster').scrollTop)`);
    if (!scrolled) {
      throw new Error('first-run-long-names: #frRoster never scrolled (scrollTop 0), so this shot '
        + 'would look identical to an unscrolled step 1 and prove nothing about a long roster');
    }
  } else if (atStep >= 2) {
    // Steps 2 and 3 both need 5+ players just to get there.
    await evalIn(c, step(`document.getElementById('frFill').click()`));
  }

  if (atStep >= 2) await evalIn(c, step(`document.getElementById('frNext').click()`));
  if (atStep >= 3) await evalIn(c, step(`document.getElementById('frNext').click()`)); // commits, decision 4
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
  await c.send('Emulation.setDeviceMetricsOverride', deviceMetrics(want, HEIGHT));

  if (want.firstRun || want.firstRunStep) {
    await goFirstRun(c, origin, want.theme, { step: want.firstRunStep || 0, longNames: want.firstRunLongNames });
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

  /* #35 decision 15: the `sheet` modifier -- the click that opens a dialog,
     then the dialog itself, asserted open before a PNG is written. Outside
     the branches above for the same reason the `bottom` block below is: a
     modifier that only works on one kind of shot is a modifier that silently
     does nothing on the rest. A click that opened no dialog (a renamed
     button, a view that never got there) would write a picture of the screen
     behind the sheet and look like every other shot of that screen. */
  if (want.sheet) {
    await evalIn(c, step(want.sheet.open));
    const opened = await evalIn(c, `!!document.querySelector(${JSON.stringify(want.sheet.selector)})`);
    if (!opened) {
      throw new Error(`${want.name}: nothing matched ${want.sheet.selector} after the sheet click, `
        + 'so this shot would be of the screen behind the sheet and would prove nothing about it');
    }
  }

  /* OUTSIDE the branches above, not inside the `goRich` one. This used to sit
     in the `else`, so a `firstRun` or `partPlayed` shot asking for `bottom`
     was silently never scrolled -- #34's own part-played bottom cell came out
     BYTE-IDENTICAL to the unscrolled `resume-bar-320` (same sha256 in
     `measurements.json`) and every check downstream passed, because
     `twinProblems` only ever compares a light/dark PAIR and the large-text
     cells declare no twin.
     So the scroll is asserted before a PNG is written, exactly the way
     `titleCollapsed` above asserts its own: a `bottom` shot that did not
     move is a picture of a state nobody asked for. */
  if (want.bottom) {
    /* #37: a bottom sheet scrolls INSIDE itself. `window` does not move at
       all while one is open, so `bottom` on a sheet cell was exactly the
       silent no-op the paragraph above is about -- it would have written a
       second copy of the unscrolled sheet. When a sheet is open, scroll the
       sheet's own scroller instead, and assert that one moved. */
    const sel = want.sheet && JSON.stringify(want.sheet.selector);
    await evalIn(c, step(want.sheet
      ? `const d = $(${sel});
         const sc = [...d.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 1);
         if (sc) sc.scrollTop = sc.scrollHeight`
      : `window.scrollTo(0, document.body.scrollHeight)`));
    const scrolled = await evalIn(c, want.sheet
      ? `(() => {
           const d = document.querySelector(${sel});
           const sc = [...d.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 1);
           return Math.round(sc ? sc.scrollTop : 0);
         })()`
      : `Math.round(window.scrollY)`);
    if (!scrolled) {
      throw new Error(`${want.name}: ${want.sheet ? 'the sheet' : 'the page'} never scrolled (scrollTop 0), `
        + 'so this shot would be identical to the unscrolled one and would prove nothing about the bottom of it');
    }
  }

  if (want.full) {
    const contentHeight = await evalIn(c, `Math.ceil(document.documentElement.scrollHeight)`);
    // Grow the viewport explicitly (bug 1's fix), then re-apply the font
    // size and re-measure -- a re-apply that does not take is a failure, not
    // a retry loop.
    await c.send('Emulation.setDeviceMetricsOverride', deviceMetrics(want, contentHeight));
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
    firstRunStep: want.firstRunStep, firstRunLongNames: want.firstRunLongNames,
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
