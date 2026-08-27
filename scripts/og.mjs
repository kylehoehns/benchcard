#!/usr/bin/env node
/* Regenerate app/og.png — the 1200×630 image every link preview shows.
 *
 *   node scripts/og.mjs            # write app/og.png
 *   node scripts/og.mjs --out x.png
 *   node scripts/og.mjs --bench app/bench-sample.png   # also write the phone shot
 *   node scripts/og.mjs --card  app/card-sample.png    # also write the About hero, 1x + @2x
 *
 * The hero is a real screenshot of bench mode, taken out of the running app
 * rather than mocked up: seed a roster, open the sideline view, capture the
 * phone, then compose it beside the headline at 1200×630. That is the whole
 * reason this is a script and not a Figma export — when bench mode changes,
 * the share image is one command behind it instead of quietly going stale.
 *
 * It used to be the printed card. The card is still what a coach takes to the
 * gym, but the phone is what most people will actually open, and a link
 * preview should show the thing you get.
 *
 * Zero dependencies: the same static server and CDP client the smoke harness
 * uses. Composition is HTML rendered by Chrome, not canvas drawing calls, so
 * the type is the app's own Inter at the app's own weights.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

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

const OG_W = 1200, OG_H = 630;
const PHONE_W = 390, PHONE_H = 844;
/* Wide enough that index.html keeps the card in an always-open aside rather
   than the phone disclosure (the breakpoint is 1100px). */
const DESK_W = 1440, DESK_H = 1000;

/* A PNG's IHDR is fixed-offset: 8 bytes of signature, 8 of chunk header, then
   width and height as big-endian uint32s. Reading the dimensions back out of
   the bytes we just wrote is the only way to *know* the 2× is twice the 1×,
   rather than trusting that Chrome multiplied the way we expected. */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/* Chrome's PNG encoder deflates for speed, and it costs about a quarter of
   every file this script writes. Re-deflating the *same* pixels at zlib's
   maximum settings is lossless by construction -- the scanlines and their
   filter bytes are untouched, only the compression of them changes -- so this
   is not an image-optimisation project, it is not throwing away a byte of what
   the image shows, and it needs nothing that is not already in node.
   Deliberately not a colour quantiser, a resampler or an external binary: the
   whole virtue of this script is that it has no dependencies.

   The guard is real and can fail: the rebuilt file is re-parsed and its
   scanlines compared against the original's, and anything that does not match
   exactly -- or any file that does not get smaller -- is discarded in favour of
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

/* ---------- static server (mirrors scripts/smoke.mjs) ---------- */
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
   "Noah Castellan", not a roster of three-letter placeholders. `live.at: 2`
   parks the game partway through the second period so the shot has something
   to say: minutes already played, a next-sub block, players marked just on.

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
  day: {
    name: 'Saturday',
    games: [{
      id: 'g0', label: 'Panthers', when: 'Sat 9:00', periods: 4, periodMinutes: 8,
      granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 7,
      live: { at: 2, overrides: {} },
    }],
  },
  activeGame: 0, view: 'games',
  ui: {
    copies: 1, showMinutes: true, printScope: 'game', cardId: 'short',
    cardSize: 'pocket', theme: 'light', cardOpen: false,
  },
};

/* ---------- the composition ----------
   Rendered in the app's own origin so the relative @font-face URLs resolve.

   THREE PIECES OF TEXT, and that is the whole design: the brand, the claim,
   and who it is for. There used to be a subhead restating the headline and a
   row of three chips, and both were cut on 2026-08-26. The chips were the
   clearer mistake -- 19px type, which is about 8px once a feed scales a
   1200x630 card down to the 400-600px it actually gets drawn at, so they were
   unreadable exactly where the image is seen and clutter everywhere else.

   THE PHONE RUNS OFF THE BOTTOM EDGE, and getting that to look deliberate is
   the only fiddly part of this file. Two numbers do it, and they are not the
   same number:

     `cut`  where the FRAME should end. The bench rows share borders and have
            no gap between them at all, so the one piece of real whitespace in
            this layout is the ~19px band between the NEXT SUB card and the
            BENCH label. The frame edge has to land inside it or it slices a
            name in half, which reads as a screenshot that overflowed rather
            than an edge somebody chose.
     the image  the FULL 390x844 capture, never trimmed to `cut`. Trimming it
            was the bug: the device then ended exactly at the frame bottom, so
            its bezel and a strip of dead screen were both visible, and a
            tilted phone showed its own squared-off bottom corner sitting in
            the middle of the picture. Left full, the screen simply carries on
            past the page and the only thing the edge cuts is app content.

   The tilt is -1.4deg, not the -2.6 this carried before. A rotated bottom edge
   travels (deviceWidth / 2) * tan(angle): 4.8px here, 9px at -2.6. The gap is
   19 css px, so half of it is the budget, and -2.6 spent more than it had --
   which is why every render before this one clipped a row on one side. */
const TILT = -1.4;
const PHONE_IN = 374;            // screen width in the composition
const composition = (shot, cut) => {
  const scale = PHONE_IN / PHONE_W;
  const top = Math.round(OG_H - 11 - cut * scale);
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
    background: linear-gradient(133deg, #FDFCFB 0%, #F7F5F1 52%, #EDEAE3 100%);
    color: #17150F; position: relative;
  }
  .brand { position: absolute; left: 76px; top: 66px; display: flex; align-items: center; gap: 14px; }
  .brand span { font-size: 29px; font-weight: 680; letter-spacing: -.022em; }

  /* Set against the middle of the frame rather than under the brand: the
     headline and the phone are the two objects here and they should sit at the
     same height. */
  .say { position: absolute; left: 76px; top: 236px; width: 600px; }
  .eyebrow { font-size: 17px; font-weight: 640; letter-spacing: .13em; text-transform: uppercase;
    color: #C33F08; margin-bottom: 20px; }
  h1 { font-size: 66px; line-height: 1.02; font-weight: 730; letter-spacing: -.04em; }
  h1 em { font-style: normal; color: #C33F08; }

  .phone { position: absolute; right: 60px; top: ${top}px; width: ${PHONE_IN + 22}px;
    background: #14120E; border-radius: ${radius}px; padding: 11px 11px 0;
    transform: rotate(${TILT}deg);
    box-shadow: 0 44px 84px -20px rgba(40,30,14,.34), 0 8px 22px rgba(40,30,14,.16); }
  /* Tall enough to leave the page under its own steam. The body's own
     overflow:hidden is what ends the picture, not this element. */
  .phone .win { width: ${PHONE_IN}px; height: ${Math.round(PHONE_H * scale)}px; overflow: hidden;
    border-radius: ${Math.round(PHONE_IN * 0.115)}px ${Math.round(PHONE_IN * 0.115)}px 0 0; }
  .phone img { display: block; width: ${PHONE_IN}px; }
</style>
<div class="brand">
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10.5" fill="#C33F08"/>
    <g stroke="#FFF3EC" stroke-width="1.35" fill="none" opacity=".55">
      <path d="M12 1.5v21M1.5 8.5h21M1.5 15.5h21"/>
      <path d="M4.6 3.7c3.5 3.8 3.5 12.8 0 16.6M19.4 3.7c-3.5 3.8-3.5 12.8 0 16.6"/>
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

  // 1. capture bench mode at phone size, 2× so it stays sharp scaled down
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: PHONE_W, height: PHONE_H, deviceScaleFactor: 2, mobile: true });
  await c.send('Page.navigate', { url: origin + '/' });
  await new Promise(r => setTimeout(r, 1200));
  /* CLEAR FIRST, and do not remove this line. The navigation above boots the
     app as a fresh install, and a fresh install WRITES `benchcard.v6` with
     `onboarded: false` before this runs. `loadState` reads v6 ahead of v3 and
     honours a complete record that says "not onboarded" -- that is deliberate,
     it is the coach who removed their last team -- so the seed below was read
     by nothing and every shot this script took was of the welcome screen.
     Found 2026-08-26; `#gmOpen` cannot open a plan that does not exist, which
     is how it surfaced ("could not open bench mode: still hidden").
     `scripts/smoke.mjs` never had the bug because it seeds through
     `Page.addScriptToEvaluateOnNewDocument`, which runs before the app does. */
  await evalJS(`localStorage.clear(); localStorage.setItem('benchcard.v3', ${JSON.stringify(JSON.stringify(SEED))}); 1`);
  await c.send('Page.navigate', { url: origin + '/' });
  await new Promise(r => setTimeout(r, 2200));
  const open = await evalJS(`(() => { const b = document.querySelector('#gmOpen'); if (!b) return 'no button'; b.click(); return document.querySelector('#gamemode').hidden ? 'still hidden' : 'open'; })()`);
  if (open !== 'open') throw new Error(`could not open bench mode: ${open}`);
  await evalJS('document.fonts.ready.then(() => 1)');
  await new Promise(r => setTimeout(r, 700));
  /* Where the composition's bottom edge should fall -- see `composition`. Read
     off the live layout rather than hard-coded, because the thing it has to
     land inside is 19px wide and moves whenever bench mode's spacing does. A
     literal here would rot silently: the image would still render, it would
     just go back to cutting a name in half. */
  const cut = await evalJS(`(() => {
    const n = document.querySelector('#gmNext');
    const lab = document.querySelector('#gmBenchLab');
    if (!n || !lab) return 0;
    return Math.round((n.getBoundingClientRect().bottom + lab.getBoundingClientRect().top) / 2 + scrollY);
  })()`);
  if (!cut) throw new Error('could not measure the crop point: #gmNext or #gmBenchLab missing');
  const phone = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
  if (BENCH_OUT) {
    const b = recompressPng(Buffer.from(phone, 'base64'));
    await writeFile(BENCH_OUT, b);
    console.log(`bench: ${BENCH_OUT} — ${PHONE_W * 2}×${PHONE_H * 2}, ${(b.length / 1024).toFixed(1)} KB`);
  }

  /* 1b. the printed card, from the state the phone was just photographed in.
     Captured on a desktop viewport because index.html only keeps the card in
     an always-open aside above 1100px, then lifted out of `#sheet` onto a bare
     white body: `#sheet` sets `--cardzoom` to fit the column, and the card has
     to be at true print size. Cloning rather than measuring in place is the
     same trick share.js uses, and for the same reason. */
  if (CARD_OUT) {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: DESK_W, height: DESK_H, deviceScaleFactor: 2, mobile: false });
    await c.send('Page.navigate', { url: origin + '/' });
    await new Promise(r => setTimeout(r, 2400));
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
      const names = [...document.querySelectorAll('#rosterlist .rrow')].length;
      const html = card.outerHTML;
      document.body.className = '';
      document.body.setAttribute('style', 'margin:0;background:#fff');
      document.body.innerHTML = '<div style="position:absolute;left:0;top:0">' + html + '</div>';
      const el = document.querySelector('.card');
      el.style.boxShadow = 'none';
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), names,
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

  // 2. compose, at 1200×630 and 1× — an og image is displayed at its own size
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: OG_W, height: OG_H, deviceScaleFactor: 1, mobile: false });
  await c.send('Page.navigate', { url: origin + '/about' });
  await new Promise(r => setTimeout(r, 900));
  await evalJS(`document.documentElement.innerHTML = ${JSON.stringify(`<head></head><body>${composition('data:image/png;base64,' + phone, cut)}</body>`)}; 1`);
  await evalJS('document.fonts.ready.then(() => 1)');
  await new Promise(r => setTimeout(r, 900));
  const og = (await c.send('Page.captureScreenshot', { format: 'png' })).data;

  const bytes = recompressPng(Buffer.from(og, 'base64'));
  await writeFile(OUT, bytes);
  console.log(`og: ${OUT} — ${OG_W}×${OG_H}, ${(bytes.length / 1024).toFixed(1)} KB`);
} finally {
  c.close();
  proc.kill();
  server.close();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
