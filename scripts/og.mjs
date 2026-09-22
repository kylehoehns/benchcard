#!/usr/bin/env node
/* Regenerate app/og.png — the 2400×1260 image every link preview shows (a
 * 1200×630 composition, captured at deviceScaleFactor 2 for a sharp 2x).
 *
 *   node scripts/og.mjs            # write app/og.png
 *   node scripts/og.mjs --out x.png
 *   node scripts/og.mjs --bench app/bench-sample.png   # also write the bench-mode phone shot
 *   node scripts/og.mjs --card  app/card-sample.png    # also write the About hero, 1x + @2x
 *   node scripts/og.mjs --icons                        # also (re)draw the four icon PNGs + favicon.ico
 *
 * The hero is a real screenshot of the game screen (title, status line,
 * sentence, Timeline), taken out of the running app rather than mocked up:
 * seed a roster, land on the game, capture the phone, then compose it beside
 * the headline. That is the whole reason this is a script and not a Figma
 * export — when the game screen changes, the share image is one command
 * behind it instead of quietly going stale.
 *
 * It used to be the printed card, then bench mode. The card is still what a
 * coach takes to the gym and bench mode is still how they run it, but the
 * game screen is the first thing anyone sees, and a link preview should show
 * the thing you get.
 *
 * The team color is Hardwood, and it comes from the SEED's own
 * `settings.color`, sanitized the same way the app sanitizes any team's
 * (storage.js's `COLORS`) and painted the same way any team's is
 * (`applyTint`, render.js). Nothing here sets `data-tint` by hand, and
 * nothing here types `#D2500A` — the hex is read back off the live page with
 * `getComputedStyle(...).getPropertyValue('--tint')`, because tokens.css is
 * the one place that value lives.
 *
 * Zero dependencies: the same static server and CDP client the smoke harness
 * uses. Composition is HTML rendered by Chrome, not canvas drawing calls, so
 * the type is the app's own Inter at the app's own weights. The four icon
 * PNGs and favicon.ico are drawn the same way, behind `--icons`: the mark's
 * SVG rendered by Chrome at each size, and favicon.ico is that same 48px PNG
 * wrapped in an ICO header, built in node with no dependency.
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { serve } from './serve.mjs';
import { pngSize } from './png-size.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : join(APP, 'og.png');
/* The bench-mode shot the About page uses. Written from the same capture the
   composition is built on, deliberately: two scripts seeding two rosters would
   drift, and the figure on the About page claiming one thing while the link
   preview shows another is exactly the kind of rot nobody notices. */
const benchIdx = args.indexOf('--bench');
const BENCH_OUT = benchIdx >= 0 && args[benchIdx + 1] ? resolve(args[benchIdx + 1]) : null;
/* The About page's hero: the printed card, from the same SEED as everything
   above. It was the last hand-made asset on the site, which is why the page ran
   a third roster nobody had noticed, and why it was a 1x PNG upscaled ~2x on
   every retina phone -- on the one figure whose entire point is that the names
   are legible. Written at both densities from one capture, because two flags
   emitting two files is how a 1x and a 2x drift apart.

   Only paper is photographed. The card is #fff/#000 in both themes by
   construction (see card.css), so a picture of it is theme-safe in a way a
   picture of the app never is. */
const cardIdx = args.indexOf('--card');
const CARD_OUT = cardIdx >= 0 && args[cardIdx + 1] ? resolve(args[cardIdx + 1]) : null;
const CARD_OUT_2X = CARD_OUT ? CARD_OUT.replace(/(\.png)?$/i, '') + '@2x.png' : null;

/* The card the WELCOME SCREEN's "On paper" tab shows, which is a different card
   from the one above and has to be.
 *
   `--card` photographs SEED, which is eleven players, because `about.html`
   spells out the eleven-player arithmetic in prose and its figures have to
   agree with its sentences. The welcome screen states no roster size in prose;
   it shows three tabs of ONE game, and its other two tabs are drawn from
   `sampleRoster(DEMO_N)`. A card of somebody else's eleven sitting between them
   is the drift this script exists to prevent, just pointed at a different page.
 *
   IT IS NOT SEEDED. It drives the app's own `?try=N` landing path, which calls
   `loadSample(n)` -> `startTeam(sampleRoster(n), ...)`. So the cast is the
   welcome screen's cast by construction rather than by a second roster written
   down here and kept in step by hand -- which is the failure mode every comment
   in this file is about. N is read out of `onboarding.js` for the same reason. */
const welIdx = args.indexOf('--welcard');
const WEL_OUT = welIdx >= 0 && args[welIdx + 1] ? resolve(args[welIdx + 1]) : null;
const WEL_OUT_2X = WEL_OUT ? WEL_OUT.replace(/(\.png)?$/i, '') + '@2x.png' : null;

/* The icon set (#75 item 2): index.html:274 notes favicon.ico was made by
   hand from icon-192, with no generator. These sizes and paths are that
   generator's whole output, same current sizes and same on-disk paths, so
   the next color change is one command instead of a hand edit. */
const ICONS = args.includes('--icons');
const ICON_TARGETS = [
  { size: 192, out: join(APP, 'icon-192.png') },
  { size: 512, out: join(APP, 'icon-512.png') },
  { size: 180, out: join(APP, 'apple-touch-icon.png') },
  { size: 48, out: null },   // wrapped into favicon.ico, not written on its own
];
const FAVICON_OUT = join(APP, 'favicon.ico');

const OG_W = 1200, OG_H = 630;
const PHONE_W = 390, PHONE_H = 844;
/* Wide enough that index.html keeps the card in an always-open aside rather
   than the phone disclosure (the breakpoint is 1100px). */
const DESK_W = 1440, DESK_H = 1000;

/* Chrome's PNG encoder deflates for speed, and it costs about a quarter of
   every file this script writes. Re-deflating the *same* pixels at zlib's
   maximum settings is lossless by construction -- the scanlines and their
   filter bytes are untouched, only the compression of them changes -- so this
   is not an image-optimisation project, it is not throwing away a byte of what
   the image shows, and it needs nothing that is not already in node.
   Deliberately not a color quantiser, a resampler or an external binary: the
   whole virtue of this script is that it has no dependencies.

   The guard is real and can fail: the rebuilt file is re-parsed and its
   scanlines compared against the original's, and anything that does not match
   exactly -- or any file that does not get smaller -- is discarded in favor of
   what Chrome handed back. */
function chunks(buf) {
  const out = [];
  for (let o = 8; o + 8 <= buf.length;) {
    const len = buf.readUInt32BE(o);
    out.push({ type: buf.toString('latin1', o + 4, o + 8), data: buf.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}
function scanlines(buf) {
  return zlib.inflateSync(Buffer.concat(chunks(buf).filter(c => c.type === 'IDAT').map(c => c.data)));
}
function recompressPng(buf) {
  if (typeof zlib.crc32 !== 'function') return buf;   // node < 20.15
  let out;
  try {
    const raw = scanlines(buf);
    const idat = zlib.deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15 });
    const parts = [buf.subarray(0, 8)];
    for (const c of chunks(buf)) {
      if (c.type === 'IDAT') continue;
      const body = Buffer.concat([Buffer.from(c.type, 'latin1'), c.data]);
      const head = Buffer.alloc(4); head.writeUInt32BE(c.data.length);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
      if (c.type === 'IEND') {
        const ih = Buffer.alloc(4); ih.writeUInt32BE(idat.length);
        const ib = Buffer.concat([Buffer.from('IDAT', 'latin1'), idat]);
        const ic = Buffer.alloc(4); ic.writeUInt32BE(zlib.crc32(ib));
        parts.push(ih, ib, ic);
      }
      parts.push(head, body, crc);
    }
    out = Buffer.concat(parts);
    if (!scanlines(out).equals(raw)) return buf;
  } catch { return buf; }
  return out.length < buf.length ? out : buf;
}

/* Wraps a 48×48 PNG in a one-image ICO container (test/favicon.test.js reads
   this format back): a 6-byte header (reserved=0, type=1 for icon, image
   count), then one 16-byte directory entry (width, height, a 32-bit color
   depth, the PNG's byte length, and its offset — 22, immediately after the
   header and this one entry), then the PNG itself, verbatim. Modern ICO
   readers accept a raw PNG payload in place of a legacy BMP one; that is what
   lets this be built in node with no image-encoding dependency. */
function buildIco(png48) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: 1 = icon
  header.writeUInt16LE(1, 4);   // one image
  const entry = Buffer.alloc(16);
  entry[0] = 48;                // width in pixels (0 would mean 256)
  entry[1] = 48;                // height in pixels
  entry[2] = 0;                 // color count: 0 = not a palette image
  entry[3] = 0;                 // reserved
  entry.writeUInt16LE(1, 4);    // color planes
  entry.writeUInt16LE(32, 6);   // bits per pixel
  entry.writeUInt32LE(png48.length, 8);  // size of the image data
  entry.writeUInt32LE(22, 12);           // offset: 6 header + 16 entry
  return Buffer.concat([header, entry, png48]);
}

/* ---------- static server (mirrors scripts/smoke.mjs) ---------- */
/* The server is `scripts/serve.mjs`, shared with smoke.mjs and
   redirect-check.mjs. The copy that used to sit here called itself a mirror of
   smoke.mjs's and, like it, 404d on any extensionless path -- so line ~500's
   navigation to `/about` had been fetching a 404 body. Nothing noticed, because
   the next statement replaces documentElement.innerHTML wholesale. */


/* ---------- Chrome over CDP ---------- */
const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
].filter(Boolean);

async function launch(port) {
  let bin = null;
  for (const c of CHROME) { try { await readFile(c); bin = c; break; } catch { /* keep looking */ } }
  if (!bin) throw new Error('No Chrome found. Set CHROME_PATH.');
  const dir = await mkdtemp(join(tmpdir(), 'benchcard-og-'));
  const proc = spawn(bin, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
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
      const list = JSON.parse(await (await fetch(`http://127.0.0.1:${port}/json/list`)).text());
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return { proc, dir, ws: page.webSocketDebuggerUrl };
    } catch { /* not up yet */ }
    if (died) { throw new Error(died); }
    if (Date.now() > deadline) { proc.kill(); throw new Error('Chrome did not expose a DevTools page in 45s'); }
    await new Promise(r => setTimeout(r, 100));
  }
}

function cdp(url) {
  const sock = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  sock.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
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
    close: () => sock.close(),
  };
}

/* ---------- the state the hero is captured from ----------
   Eleven players with real-length names -- the composition has to survive a
   "Noah Castellan", not a roster of three-letter placeholders. The game
   screen shot (og.png, `--card`) is taken with no `live` state at all, before
   the game starts, so the status line reads "Planned" (#92 is explicitly out
   of scope for this change). `--bench` adds `live: { at: 2 }` to a COPY of
   this game, parking it partway through the second period so that shot has
   something to say: minutes already played, a next-sub block, players marked
   just on. Same roster, same rule, same seed number either way, so the same
   rotation (see `withLive` below).

   `settings.color: 'hardwood'` is the one rule change from before: it is not
   read by this script and not typed into the composition. It goes into the
   record the app itself loads, is sanitized by `COLORS` (storage.js) exactly
   as any team's color is, and is painted by `applyTint` (render.js) at boot,
   through index.html's own pre-paint script -- the same pipeline a real
   coach's own color choice goes through. The hex comes back out with
   `getComputedStyle`, once the app has painted it, not from a literal here.

   `constraints.avoids: [['p7', 'p6']]` (Noah, Mia) is the game's one rule --
   the same "Noah / Mia apart" rule about.html's rule-chip mock already shows
   (about.html ~963). It is what turns "with no rules" (which reads as "no
   rules in the game") into "with 1 rule".

   ELEVEN, not ten, and it is the same eleven the About page draws by hand.
   That page's argument is that forty player-slots do not divide by eleven, and
   it used to illustrate it with a photograph of a ten-player game in which
   every player read `/16` -- the one roster size where it does divide. At
   eleven the solver lands seven on sixteen minutes and four on twelve, which
   is the split the drawn timeline claims, so the photographs now agree with
   the drawings instead of quietly contradicting them. Vega and Brennan are
   invented surnames: no drawn artefact gives Mia or Kade a last name, so
   nothing on the page had to be relabelled to make this line up.

   FOUR OF THE ELEVEN WERE RENAMED on 2026-08-26, in place and in the same
   order, so every plan this seed produces is byte-for-byte the rotation it was
   before: Beckett -> Bria, Elias -> Elena, Marcus -> Mia, Silas -> Simone.
   The cast was eleven boys, and this seed is what the printed card, the bench
   shot and the link preview all show. The four-letter short names moved with
   them (BECK -> BRIA, ELIA -> ELEN, MARC -> MIA, SILA -> SIMO) and are still
   eleven distinct forms, which is what keeps the card honest. `about.html`
   draws the same eleven by hand and was renamed in the same change. */
const SEED = {
  version: 3, onboarded: true, tourSeen: true, teamName: 'Ravens',
  players: [
    ['Amari Woods', '4'], ['Bria Hale', '7'], ['Cole Whitaker', '9'], ['Devon Ellis', '12'],
    ['Elena Moreau', '3'], ['Kade Brennan', '6'], ['Mia Vega', '21'], ['Noah Castellan', '5'],
    ['Rafael Ortiz', '8'], ['Simone Aldridge', '11'], ['Ty Nakamura', '15'],
  ].map(([name, number], i) => ({ id: 'p' + i, name, number, shortName: '' })),
  settings: { color: 'hardwood' },
  day: {
    name: 'Saturday',
    games: [{
      id: 'g0', label: 'Hawks', when: 'Sat 9:00', periods: 4, periodMinutes: 8,
      granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 7,
      constraints: { avoids: [['p7', 'p6']] },
    }],
  },
  activeGame: 0, view: 'games',
  ui: {
    copies: 1, showMinutes: true, printScope: 'game', cardId: 'short',
    cardSize: 'pocket', theme: 'light', cardOpen: false,
  },
};

/* The `--bench` capture, and only that capture, needs the game already
   partway played. A copy rather than a mutation, so nothing above can ever
   read a SEED that quietly grew a `live` block depending on import order. */
const withLive = () => {
  const s = JSON.parse(JSON.stringify(SEED));
  s.day.games[0].live = { at: 2, overrides: {} };
  return s;
};

/* ---------- the composition ----------
   Rendered in the app's own origin so the relative @font-face URLs resolve.

   THREE PIECES OF TEXT, and that is the whole design: the brand, the claim,
   and who it is for. There used to be a subhead restating the headline and a
   row of three chips, and both were cut on 2026-08-26. The chips were the
   clearer mistake -- 19px type, which is about 8px once a feed scales a
   1200x630 card down to the 400-600px it actually gets drawn at, so they were
   unreadable exactly where the image is seen and clutter everywhere else.

   THE PHONE RUNS OFF THE BOTTOM EDGE, on purpose: the frame is fixed at
   `PHONE_LEFT`/`PHONE_TOP`, the same coordinates the human approved (a
   scratch render, `og-B-hardwood-2x.png`), and the image inside it is the
   FULL 390×844 capture at its natural scale, never trimmed. The body's own
   `overflow: hidden` is what ends the picture, not the image or the frame --
   so what shows is whatever the top `PHONE_H - (OG_H - PHONE_TOP) / scale`
   pixels of the live screenshot are. For the no-`live` game screen that is
   the title, the status line, the sentence and into the Timeline, which is
   the point: a fixed frame over a live screenshot means a taller sentence or
   an extra rule still crops in the same honest place, it just shows less of
   the Timeline, rather than a hard-coded crop height silently drifting away
   from what the frame can actually show.

   This replaced a `cut` computed from the Timeline's own row rects -- built
   for BENCH MODE's tightly-stacked rows, where the one gap worth landing an
   edge in is the ~19px band below the last row. Pointed at the game screen
   instead, `cut` walked to the LAST row that fits the full 844px phone
   height, which sits far down the capture, and the frame's top followed it
   there: the title scrolled off above the frame and "Start game" -- the
   button below the Timeline -- showed at the bottom instead. `checkCrop`
   below is what replaced it: not a geometry input any more, a live
   assertion that the fixed frame's crop line still falls inside the
   Timeline and short of that button, so a layout change that would silently
   reopen the same bug fails the build instead.

   The tilt is -1.4deg, not the -2.6 this carried before. A rotated bottom edge
   travels (deviceWidth / 2) * tan(angle): 4.8px here, 9px at -2.6. The gap is
   19 css px, so half of it is the budget, and -2.6 spent more than it had --
   which is why every render before this one clipped a row on one side. */
/* The mark's seam lines, on the 24-unit grid every drawing of it shares
   (the composition's brand mark below, the icon mark further down, and the
   inline favicon SVG in index.html/about.html/advanced.html). One constant
   so the two places that draw it in this file cannot quietly diverge. */
const SEAMS = '<path d="M12 1.5v21M1.5 8.5h21M1.5 15.5h21"/>'
  + '<path d="M4.6 3.7c3.5 3.8 3.5 12.8 0 16.6M19.4 3.7c-3.5 3.8-3.5 12.8 0 16.6"/>';

/* Layout B, as approved: flat ground, ink text, a near-black bezel -- none of
   this is the team color, so unlike `tint` it is a literal here rather than a
   `getComputedStyle` read. `GROUND`/`INK` are the same values About and
   Advanced already paint with in light mode (tokens.css); og.png is one
   image for both themes (#75 Decisions), so it is pinned to the light pair
   rather than reading either page's computed style. */
const GROUND = '#F4F4F6';
const INK = '#1C1C1E';
const BEZEL = '#111';

const TILT = -1.4;
const PHONE_IN = 374;            // screen width in the composition
const PHONE_LEFT = 734;
const PHONE_TOP = 64;
const composition = (shot, tint) => {
  const scale = PHONE_IN / PHONE_W;
  const radius = Math.round(PHONE_IN * 0.145);
  return `
<style>
  @font-face {
    font-family: 'InterVar'; font-style: normal; font-weight: 100 900; font-display: block;
    src: url('/vendor/fonts/inter-latin-wght-normal.woff2') format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${OG_W}px; height: ${OG_H}px; overflow: hidden; }
  body {
    font-family: 'InterVar', -apple-system, sans-serif;
    background: ${GROUND};
    color: ${INK}; position: relative;
  }
  .brand { position: absolute; left: 76px; top: 66px; display: flex; align-items: center; gap: 14px; }
  .brand span { font-size: 29px; font-weight: 680; letter-spacing: -.022em; }

  /* Set against the middle of the frame rather than under the brand: the
     headline and the phone are the two objects here and they should sit at the
     same height. */
  .say { position: absolute; left: 76px; top: 236px; width: 600px; }
  .eyebrow { font-size: 17px; font-weight: 640; letter-spacing: .13em; text-transform: uppercase;
    color: ${tint}; margin-bottom: 20px; }
  h1 { font-size: 66px; line-height: 1.02; font-weight: 730; letter-spacing: -.04em; }
  h1 em { font-style: normal; color: ${tint}; }

  .phone { position: absolute; left: ${PHONE_LEFT}px; top: ${PHONE_TOP}px; width: ${PHONE_IN + 22}px;
    background: ${BEZEL}; border-radius: ${radius}px; padding: 11px;
    transform: rotate(${TILT}deg);
    box-shadow: 0 44px 84px -20px rgba(0,0,0,.35), 0 8px 22px rgba(0,0,0,.16); }
  /* Tall enough to leave the page under its own steam. The body's own
     overflow:hidden is what ends the picture, not this element. */
  .phone .win { width: ${PHONE_IN}px; height: ${Math.round(PHONE_H * scale)}px; overflow: hidden;
    border-radius: ${Math.round(PHONE_IN * 0.115)}px ${Math.round(PHONE_IN * 0.115)}px 0 0; }
  .phone img { display: block; width: ${PHONE_IN}px; }
</style>
<div class="brand">
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10.5" fill="${tint}"/>
    <g stroke="#F4F4F6" stroke-width="1.35" fill="none" opacity=".55">
      ${SEAMS}
    </g>
  </svg>
  <span>Benchcard</span>
</div>
<div class="say">
  <div class="eyebrow">Youth basketball</div>
  <h1>Even minutes,<br><em>worked out</em> before<br>the game.</h1>
</div>
<div class="phone"><div class="win"><img src="${shot}" alt=""></div></div>
`;
};

/* ---------- the icon mark (#75 item 2) ----------
   Same 24-unit design grid and the same seam paths as the brand mark drawn
   above and in the favicon data URI (index.html, about.html, advanced.html),
   scaled to whatever pixel size Chrome is asked to render at -- an SVG
   `viewBox` does that scaling for free, stroke width included, so one markup
   string is every icon. The layout is the one the shipped icons already had
   (measured off main's icon-512.png): a solid square of the team color, and
   on it the ball drawn in outline -- circle and seams, solid light strokes
   with round ends -- about 60% of the width, which keeps it inside a
   maskable icon's safe zone. Only the colors change. The widened viewBox is
   what does the padding: 37 units across puts the 21-unit ball at 57% plus
   its stroke. */
const markSvg = (size, fill) => `<svg width="${size}" height="${size}" viewBox="-6.5 -6.5 37 37" xmlns="http://www.w3.org/2000/svg">
  <rect x="-6.5" y="-6.5" width="37" height="37" fill="${fill}"/>
  <g stroke="#F4F4F6" stroke-width="1.05" stroke-linecap="round" fill="none">
    <circle cx="12" cy="12" r="10.5"/>
    ${SEAMS}
  </g>
</svg>`;

/* The welcome screen's roster size, read from the module that owns it. A
   literal here would be a second answer to a question `onboarding.js` already
   answers, and the two would part company the first time one of them moved. */
async function welcomeRosterSize() {
  const src = await readFile(join(APP, 'onboarding.js'), 'utf8');
  const m = src.match(/const DEMO_N\s*=\s*(\d+)/);
  if (!m) throw new Error('could not read DEMO_N out of app/onboarding.js');
  return Number(m[1]);
}

/* ---------- run ---------- */
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const port = 9500 + Math.floor(Math.random() * 400);
const { proc, dir, ws } = await launch(port);
const c = cdp(ws);
try {
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  const evalJS = async expression =>
    (await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

  /* Boot a fresh install, then reload with STATE seeded into localStorage --
     the sequence every capture below starts from, only the state and the
     settle time after the second navigation differ.

     CLEAR FIRST, and do not remove that half of the one-liner below. The
     first navigation boots the app as a fresh install, and a fresh install
     WRITES `benchcard.v6` with `onboarded: false` before this runs.
     `loadState` reads v6 ahead of v3 and honours a complete record that says
     "not onboarded" -- that is deliberate, it is the coach who removed their
     last team -- so a seed written without clearing first is read by nothing
     and every shot this script takes is of the welcome screen instead. Found
     2026-08-26; `#gmOpen` cannot open a plan that does not exist, which is
     how it surfaced ("could not open bench mode: still hidden").
     `scripts/smoke.mjs` never had the bug because it seeds through
     `Page.addScriptToEvaluateOnNewDocument`, which runs before the app does. */
  const seedAndLoad = async (state, settleMs) => {
    await c.send('Page.navigate', { url: origin + '/' });
    await new Promise(r => setTimeout(r, 1200));
    await evalJS(`localStorage.clear(); localStorage.setItem('benchcard.v3', ${JSON.stringify(JSON.stringify(state))}); 1`);
    await c.send('Page.navigate', { url: origin + '/' });
    await new Promise(r => setTimeout(r, settleMs));
  };

  // 1. capture the game screen at phone size, 3× so it stays sharp once it is
  //    embedded in the composition and that is captured again at 2×.
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: PHONE_W, height: PHONE_H, deviceScaleFactor: 3, mobile: true });
  await seedAndLoad(SEED, 2200);
  /* SEED's own `view: 'games'` and `activeGame: 0` land here with no click:
     this is the game screen already, the way a coach who last had a game open
     would see it too. */
  const landed = await evalJS(`document.querySelector('#gameTitle') && !document.querySelector('#view-games').hidden ? 'ok' : 'not on the game screen'`);
  if (landed !== 'ok') throw new Error(`could not reach the game screen: ${landed}`);
  await evalJS('document.fonts.ready.then(() => 1)');
  await new Promise(r => setTimeout(r, 700));
  /* Hardwood has to have actually painted, not just been requested -- a typo
     in `settings.color` or a sanitizer that silently fell back to graphite
     would otherwise ship an ember-less but also Hardwood-less image and
     nothing here would catch it. */
  const tintOn = await evalJS(`document.documentElement.getAttribute('data-tint')`);
  if (tintOn !== 'hardwood') throw new Error(`Hardwood did not paint: data-tint is ${JSON.stringify(tintOn)}`);
  const tint = (await evalJS(`getComputedStyle(document.documentElement).getPropertyValue('--tint').trim()`) || '').toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(tint)) throw new Error(`--tint did not read back as a hex color: ${JSON.stringify(tint)}`);
  /* `composition`'s frame is fixed (`PHONE_LEFT`/`PHONE_TOP`), so the native
     pixel the body's overflow:hidden crops the screenshot at is a known
     number: `(OG_H - PHONE_TOP) / scale`. Read the live layout to check that
     line still falls inside the Timeline and short of "Start game" (below
     840px that is `#abBench`, in the fixed `#actionbar`, not the wider
     screen's `#gmOpen`) -- the bug this check exists to catch showed the
     button instead of the title, because the frame that used to be
     positioned FROM a measurement of the Timeline's rows put both in the
     wrong place at once. A literal pixel budget here would pass today and
     rot silently the moment the sentence wraps a line or the Timeline's row
     height changes. */
  const scale = PHONE_IN / PHONE_W;
  const visibleNative = (OG_H - PHONE_TOP) / scale;
  const crop = await evalJS(`(() => {
    const title = document.querySelector('#gameTitle');
    const rows = [...document.querySelectorAll('#timeline .tl-row')];
    const btn = document.querySelector('#abBench');
    if (!title || !rows.length || !btn) return null;
    return {
      titleTop: title.getBoundingClientRect().top,
      firstRowTop: rows[0].getBoundingClientRect().top,
      btnTop: btn.getBoundingClientRect().top,
    };
  })()`);
  if (!crop) throw new Error('could not measure the crop: #gameTitle, #timeline .tl-row or #abBench missing');
  if (crop.titleTop >= visibleNative)
    throw new Error(`the fixed phone frame crops above the title: title top ${crop.titleTop}, frame shows to ${visibleNative}`);
  if (crop.firstRowTop >= visibleNative)
    throw new Error(`the fixed phone frame does not reach the Timeline: first row top ${crop.firstRowTop}, frame shows to ${visibleNative}`);
  if (crop.btnTop < visibleNative)
    throw new Error(`the fixed phone frame reaches "Start game": button top ${crop.btnTop}, frame shows to ${visibleNative}`);
  const phone = (await c.send('Page.captureScreenshot', { format: 'png' })).data;

  /* 1a. bench mode, with the game live — bench-sample.png keeps showing a
     game in progress, which is the point of bench mode. Same roster, same
     rule, same seed number as the og shot, so the same rotation; only `live`
     differs. */
  if (BENCH_OUT) {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: PHONE_W, height: PHONE_H, deviceScaleFactor: 2, mobile: true });
    await seedAndLoad(withLive(), 2200);
    const open = await evalJS(`(() => { const b = document.querySelector('#gmOpen'); if (!b) return 'no button'; b.click(); return document.querySelector('#gamemode').hidden ? 'still hidden' : 'open'; })()`);
    if (open !== 'open') throw new Error(`could not open bench mode: ${open}`);
    await evalJS('document.fonts.ready.then(() => 1)');
    await new Promise(r => setTimeout(r, 700));
    const bench = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
    const b = recompressPng(Buffer.from(bench, 'base64'));
    await writeFile(BENCH_OUT, b);
    console.log(`bench: ${BENCH_OUT} — ${PHONE_W * 2}×${PHONE_H * 2}, ${(b.length / 1024).toFixed(1)} KB`);
  }

  /* 1b. the printed card, from the same no-`live` seed the game screen was
     photographed in — reseeded explicitly, since 1a (when it runs) leaves
     `withLive()`'s copy in storage instead.
     Captured on a desktop viewport because index.html only keeps the card in
     an always-open aside above 1100px, then lifted out of `#sheet` onto a bare
     white body: `#sheet` sets `--cardzoom` to fit the column, and the card has
     to be at true print size. Cloning rather than measuring in place is the
     same trick share.js uses, and for the same reason. */
  if (CARD_OUT) {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: DESK_W, height: DESK_H, deviceScaleFactor: 2, mobile: false });
    await seedAndLoad(SEED, 2400);
    const box = await evalJS(`(() => {
      const card = document.querySelector('#sheet .card');
      if (!card) return 'no card';
      const html = card.outerHTML;
      document.body.className = '';
      document.body.setAttribute('style', 'margin:0;background:#fff');
      document.body.innerHTML = '<div style="position:absolute;left:0;top:0">' + html + '</div>';
      const el = document.querySelector('.card');
      el.style.boxShadow = 'none';
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), names: el.querySelectorAll('.five .nm').length };
    })()`);
    if (typeof box === 'string' || !box) throw new Error(`could not reach the card: ${box}`);
    await evalJS('document.fonts.ready.then(() => 1)');
    await new Promise(r => setTimeout(r, 500));
    const shoot = async scale => {
      const data = (await c.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: box.w, height: box.h, scale },
      })).data;
      return recompressPng(Buffer.from(data, 'base64'));
    };
    /* Chrome applies `clip.scale` on top of the emulated deviceScaleFactor, so
       the 1× density needs a half-scale clip. Read back rather than assumed —
       `pngSize` parses the IHDR — and the pair is asserted to be exactly 2×,
       because a srcset whose 2× is not twice the 1× is worse than no srcset. */
    const one = await shoot(0.5), two = await shoot(1);
    const s1 = pngSize(one), s2 = pngSize(two);
    if (s2.w !== s1.w * 2 || s2.h !== s1.h * 2)
      throw new Error(`card densities are not 1:2 — ${s1.w}×${s1.h} vs ${s2.w}×${s2.h}`);
    await writeFile(CARD_OUT, one);
    await writeFile(CARD_OUT_2X, two);
    console.log(`card: ${CARD_OUT} — ${s1.w}×${s1.h}, ${(one.length / 1024).toFixed(1)} KB (${box.names} name cells)`);
    console.log(`card: ${CARD_OUT_2X} — ${s2.w}×${s2.h}, ${(two.length / 1024).toFixed(1)} KB`);
  }

  /* 1c. the welcome screen's own card, from the app's own sample team.
     `?try=N` only fires when there is no team, so storage is cleared first --
     the seed written for the shots above would otherwise make the app skip
     onboarding and the landing path would never run. */
  if (WEL_OUT) {
    const N = await welcomeRosterSize();
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: DESK_W, height: DESK_H, deviceScaleFactor: 2, mobile: false });
    await c.send('Page.navigate', { url: origin + '/' });
    await new Promise(r => setTimeout(r, 1200));
    await evalJS('localStorage.clear(); 1');
    await c.send('Page.navigate', { url: `${origin}/?try=${N}` });
    await new Promise(r => setTimeout(r, 2600));
    const box = await evalJS(`(() => {
      const card = document.querySelector('#sheet .card');
      if (!card) return 'no card';
      const html = card.outerHTML;
      document.body.className = '';
      document.body.setAttribute('style', 'margin:0;background:#fff');
      document.body.innerHTML = '<div style="position:absolute;left:0;top:0">' + html + '</div>';
      const el = document.querySelector('.card');
      el.style.boxShadow = 'none';
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               five: el.querySelectorAll('.five .nm').length };
    })()`);
    if (typeof box === 'string' || !box) throw new Error(`could not reach the welcome card: ${box}`);
    await evalJS('document.fonts.ready.then(() => 1)');
    await new Promise(r => setTimeout(r, 500));
    const shoot = async scale => recompressPng(Buffer.from((await c.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: box.w, height: box.h, scale },
    })).data, 'base64'));
    const one = await shoot(0.5), two = await shoot(1);
    const s1 = pngSize(one), s2 = pngSize(two);
    if (s2.w !== s1.w * 2 || s2.h !== s1.h * 2)
      throw new Error(`welcome card densities are not 1:2 — ${s1.w}×${s1.h} vs ${s2.w}×${s2.h}`);
    await writeFile(WEL_OUT, one);
    await writeFile(WEL_OUT_2X, two);
    console.log(`welcome card: ${WEL_OUT} — ${s1.w}×${s1.h}, ${(one.length / 1024).toFixed(1)} KB (${N} players)`);
    console.log(`welcome card: ${WEL_OUT_2X} — ${s2.w}×${s2.h}, ${(two.length / 1024).toFixed(1)} KB`);
  }

  /* 1c. the four icon PNGs + favicon.ico, drawn from the same mark SVG at
     each size (#75 item 2: "the icons have no generator today"). Each file
     is checked against its own previous size, not a fixed budget, because
     the budget is "did this redraw bloat it", not an absolute number. */
  if (ICONS) {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: 512, height: 512, deviceScaleFactor: 1, mobile: false });
    await c.send('Page.navigate', { url: origin + '/about' });
    await new Promise(r => setTimeout(r, 300));
    let png48 = null;
    for (const { size, out } of ICON_TARGETS) {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: size, height: size, deviceScaleFactor: 1, mobile: false });
      await evalJS(`document.documentElement.innerHTML = ${JSON.stringify(`<head></head><body style="margin:0">${markSvg(size, tint)}</body>`)}; 1`);
      await evalJS('document.fonts.ready.then(() => 1)');
      await new Promise(r => setTimeout(r, 200));
      const data = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
      const buf = recompressPng(Buffer.from(data, 'base64'));
      const dims = pngSize(buf);
      if (dims.w !== size || dims.h !== size)
        throw new Error(`icon at size ${size} came out ${dims.w}×${dims.h}`);
      if (size === 48) { png48 = buf; continue; }
      const target = out;
      let before = 0;
      try { before = (await stat(target)).size; } catch { /* first draw */ }
      if (before && buf.length > before * 1.5)
        throw new Error(`${target} grew from ${before} to ${buf.length} bytes, more than +50%`);
      await writeFile(target, buf);
      console.log(`icon: ${target} — ${size}×${size}, ${(buf.length / 1024).toFixed(1)} KB`);
    }
    const ico = buildIco(png48);
    let beforeIco = 0;
    try { beforeIco = (await stat(FAVICON_OUT)).size; } catch { /* first draw */ }
    if (beforeIco && ico.length > beforeIco * 1.5)
      throw new Error(`${FAVICON_OUT} grew from ${beforeIco} to ${ico.length} bytes, more than +50%`);
    await writeFile(FAVICON_OUT, ico);
    console.log(`icon: ${FAVICON_OUT} — 48×48, ${(ico.length / 1024).toFixed(1)} KB`);
  }

  // 2. compose, at 1200×630 captured at deviceScaleFactor 2 — 2400×1260 out
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: OG_W, height: OG_H, deviceScaleFactor: 2, mobile: false });
  await c.send('Page.navigate', { url: origin + '/about' });
  await new Promise(r => setTimeout(r, 900));
  await evalJS(`document.documentElement.innerHTML = ${JSON.stringify(`<head></head><body>${composition('data:image/png;base64,' + phone, tint)}</body>`)}; 1`);
  await evalJS('document.fonts.ready.then(() => 1)');
  await new Promise(r => setTimeout(r, 900));
  const og = (await c.send('Page.captureScreenshot', { format: 'png' })).data;

  const bytes = recompressPng(Buffer.from(og, 'base64'));
  const ogDims = pngSize(bytes);
  if (ogDims.w !== OG_W * 2 || ogDims.h !== OG_H * 2)
    throw new Error(`og.png came out ${ogDims.w}×${ogDims.h}, expected ${OG_W * 2}×${OG_H * 2}`);
  await writeFile(OUT, bytes);
  console.log(`og: ${OUT} — ${ogDims.w}×${ogDims.h}, ${(bytes.length / 1024).toFixed(1)} KB`);
} finally {
  c.close();
  proc.kill();
  server.close();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
