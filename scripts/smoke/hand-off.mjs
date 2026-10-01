/* #250's own guard (docs/specs/250-hand-off-link.md, Proof section): the code
   drawn on the Hand off sheet is the link Share hands out, a fresh phone
   opens that link onto the same game, and a damaged link or a missing
   network does not break it. Three rows:

     handOffPass       the sender draws the code; a wiped profile opens the link
     damagedLinkPass   a corrupted link: one toast, nothing written
     handOffLoadPass   the hand-off code and QR library are not fetched until Hand off is picked,
                       and it still draws offline

   What it does not re-check: the payload's contents, size, names and the
   merge into an existing team are `test/handoff.test.js`, at `node --test`.
   Here is only what a browser can answer. The expected matrix comes from the
   vendored encoder run in Node on the URL the page handed to Share -- never
   from reading the page's own module back. */
import { encode as qrEncode } from '../../app/vendor/uqr.mjs';
import { DAMAGED_LINK as DAMAGED } from '../../app/live.js';
import { evalIn, step, WIDTH, HEIGHT, wait, OVERFLOW_PROBE, TODAY_HOME, onScreen } from './dom.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH, TOUCH_FLOOR, TOUCH_MIN } from './sizes.mjs';
import { goRich } from './fixtures.mjs';
import { land } from './page-state.mjs';
import { evalJSON, tap, settle, setGame } from './sheet-drive.mjs';


/* Back to Today and into the first game; the card sheet opens in a second tap,
   once the game screen is up (a dialog cannot open under a hidden ancestor). */
const OPEN_SHEET = `${TODAY_HOME};
  document.querySelector('.today-game').click()`;

async function qrDrawn(c) {
  for (let i = 0; i < 100; i++) {
    if (await evalIn(c, `!!document.querySelector('#handoffQr svg path')`)) return true;
    await wait(50);
  }
  return false;
}

/* Open the sheet, press Share with `navigator.share` stubbed to keep what it
   is given, and read the modules the page drew. */
const PICK_HANDOFF = `document.querySelector('#shareSeg [data-pane=handoff]').click()`;

async function sendFromHere(c) {
  await evalIn(c, `navigator.share = async d => { window.__sharedUrl = d.url; }; window.__sharedUrl = null`);
  await tap(c, OPEN_SHEET);
  await tap(c, `document.getElementById('shareBtn').click()`);
  // The segment paints at 32px and a ::after restores the 48px tap target
  // (app.css, .seg button), so the height is read where a finger lands.
  const door = await evalJSON(c, `(() => {
    const b = document.querySelector('#shareSeg [data-pane=handoff]'), r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, mid = r.top + r.height / 2;
    const hit = dy => document.elementFromPoint(x, mid + dy)?.closest('#shareSeg button') === b;
    return JSON.stringify(hit(-23) && hit(23) ? 48 : r.height);
  })()`);
  await tap(c, PICK_HANDOFF);
  const drawn = await qrDrawn(c);
  if (!drawn) return { drawn, door };
  await tap(c, `document.getElementById('handoffShare').click()`);
  const url = await evalIn(c, 'window.__sharedUrl');
  const grid = await evalJSON(c, `(() => {
    const svg = document.querySelector('#handoffQr svg');
    const n = Number(svg.getAttribute('viewBox').split(' ')[2]);
    const d = svg.querySelector('path').getAttribute('d');
    const dark = [...d.matchAll(/M(\\d+) (\\d+)h1v1h-1z/g)].map(m => [Number(m[1]), Number(m[2])]);
    return JSON.stringify({ n, dark });
  })()`);
  return { drawn, door, url, grid };
}

/* What a coach would see as "the same game": stints, minutes, where it
   stands, the hand swaps and the card's rows (clock and the number of kids, not the 5-letter
   names, which the receiving phone derives from the call names itself). Read through the
   app's own accessors in the page. */
const FINGERPRINT = `(async () => {
  const s = await import('/state.js'), l = await import('/live.js');
  const g = s.game(), p = s.plans[s.state.activeGame];
  return JSON.stringify({
    stints: s.effectiveStints(g, p).map(x => [...x.onFloor].sort()),
    minutes: s.effectiveMinutes(g, p),
    played: l.playedStints(g.live),
    hand: l.handStints(g.live),
    // the card prints every game of the day, the active one first
    card: [...document.querySelectorAll('.card .stint')].slice(0, p.stints.length).map(r => [r.querySelector('.clk').textContent, r.querySelector('.io').textContent.replace(/[^▼ ]/g, '').length, r.querySelectorAll('.five .nm').length]),
    players: s.team().players.length,
  });
})()`;

const hashOf = url => new URL(url).hash;
const toastsExpr = `JSON.stringify([...document.querySelectorAll('.toast:not(.out) .tmsg')].map(t => t.textContent))`;

async function landOnLink(c, origin, hash, want = {}) {
  // A fragment-only navigation would not reload the page, so leave first
  // (to a different path: `land` is the one place that navigates).
  await land(c, origin, { page: '/about.html', record: 'kept', ready: 'document.body' });
  await land(c, origin, { record: 'wiped', query: hash, ...want });
}

export async function handOffPass(c, origin) {
  const problems = [];
  const ck = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
  let detail = '';
  try {
    await goRich(c, origin);
    await evalIn(c, setGame(`const p = s.plans[0];
      s.state.day.games[0].live = { at: 3, overrides: {} };`));
    const sent = await sendFromHere(c);
    if (!ck(sent.drawn, 'Hand off in the share sheet never drew a code')) return { pass: false, detail: problems.join(' | ') };
    if (!ck(typeof sent.url === 'string' && sent.url.includes('#p=1'), `Share was given ${JSON.stringify(sent.url)}, want a #p=1 link`)) {
      return { pass: false, detail: problems.join(' | ') };
    }
    ck(sent.url.length <= 1200, `the link is ${sent.url.length} characters, want at most 1,200`);

    // The code is the link: module for module, what the encoder makes of it.
    const want = qrEncode(sent.url).data;
    const drew = new Set(sent.grid.dark.map(([x, y]) => `${x},${y}`));
    let wrong = 0;
    want.forEach((row, y) => row.forEach((dark, x) => { if (dark !== drew.has(`${x},${y}`)) wrong++; }));
    ck(sent.grid.n === want.length, `the code is ${sent.grid.n} modules wide, the link's own is ${want.length}`);
    ck(wrong === 0, `${wrong} module(s) of the drawn code differ from the link's own code`);
    // The door is a segment button in the share sheet: a full touch target.
    ck(sent.door >= TOUCH_MIN, `the Hand off segment in the share sheet is ${sent.door}px tall, want at least ${TOUCH_FLOOR}px`);
    const names = await evalIn(c, `[...document.querySelectorAll('#handoffNames li')].length`);
    ck(names === 11, `the sheet lists ${names} names, want the roster's 11`);
    const before = JSON.parse(await evalIn(c, FINGERPRINT));
    detail = `${sent.grid.n}×${sent.grid.n} code, ${sent.url.length}-character link`;

    // A fresh phone opens the link.
    const hash = hashOf(sent.url);
    await landOnLink(c, origin, hash);
    const after = JSON.parse(await evalIn(c, FINGERPRINT));
    ck(JSON.stringify(after) === JSON.stringify(before),
      `the fresh phone's game differs from the sender's: ${JSON.stringify(after)} vs ${JSON.stringify(before)}`);
    ck(await onScreen(c, 'view-games'), 'the fresh phone did not land on the game screen');
    const url1 = await evalIn(c, 'location.href');
    ck(!url1.includes('#p='), `the address bar still carries the link: ${url1}`);
    const toasts = JSON.parse(await evalIn(c, toastsExpr));
    ck(toasts.length === 1 && /game added\. Open bench mode to run subs\.$/.test(toasts[0]),
      `toasts after opening: ${JSON.stringify(toasts)}`);

    // A reload does not import it again.
    await land(c, origin, { record: 'kept' });
    const reloaded = JSON.parse(await evalIn(c, FINGERPRINT));
    ck(JSON.stringify(reloaded) === JSON.stringify(before), 'the reload changed the game');
    const teams = await evalIn(c, `JSON.parse(localStorage.getItem('benchcard.v7')).teams.length`);
    ck(teams === 1, `after a reload the phone holds ${teams} teams, want 1`);
    const days = await evalIn(c, `JSON.parse(localStorage.getItem('benchcard.v7')).teams[0].days.flatMap(d => d.games).length`);
    ck(days === 1, `after a reload the phone holds ${days} games, want 1`);

    // Landing: "Start game"/"Resume" is on screen, whole, at both sizes.
    for (const [label, w] of [[`${WIDTH}px`, { width: WIDTH, textPx: 16 }], [`${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, { width: LARGE_TEXT_WIDTH, textPx: LARGE_TEXT_PX }]]) {
      await landOnLink(c, origin, hash, w);
      const r = await evalJSON(c, `(() => {
        const b = document.getElementById('abBench'), bar = document.getElementById('actionbar');
        const rc = b?.getBoundingClientRect();
        const top = rc && document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
        const lab = b?.querySelector('.ab-lab');
        return JSON.stringify({ shown: !!b && !bar.hidden && rc.width > 0, onTop: !!top && b.contains(top),
          inside: !!rc && rc.left >= 0 && rc.right <= document.documentElement.clientWidth && rc.bottom <= innerHeight + 1,
          text: lab?.textContent ?? '', clipped: !!lab && lab.scrollWidth > lab.clientWidth + 1,
          dialog: !!document.querySelector('dialog[open]'), view: !document.getElementById('view-games').hidden });
      })()`);
      const over = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
      ck(r.view && r.shown, `${label}: the game screen's bench button is not on screen`);
      ck(r.onTop, `${label}: something covers the bench button`);
      ck(r.inside, `${label}: the bench button is outside the screen`);
      ck(!r.clipped, `${label}: the bench button's text is cut off`);
      ck(!r.dialog, `${label}: a dialog is open over the game screen`);
      ck(!over.pans && !over.worst, `${label}: the page overflows (${JSON.stringify(over.worst)})`);
    }
  } finally {
    await goRich(c, origin);
  }
  return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 4).join(' | ') : detail + `, a fresh phone opens the same game, the hash clears, a reload does not import again, landing whole at ${WIDTH}px and ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px` };
}

export async function damagedLinkPass(c, origin) {
  const problems = [];
  const ck = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
  try {
    await goRich(c, origin);
    const sent = await sendFromHere(c);
    if (!ck(sent.drawn && sent.url, 'no link to damage')) return { pass: false, detail: problems.join(' | ') };
    const hash = hashOf(sent.url);
    // A boot with no team makes a placeholder with a random id and seed; mask
    // the random parts so two boots of the same empty profile compare equal.
    const snap = `JSON.stringify(Object.keys(localStorage).sort().map(k => [k,
      localStorage.getItem(k).replace(/"(id|seed)":("[^"]*"|\\d+)/g, '"$1":0')]))`;

    // The control: a fresh phone with no link at all.
    await landOnLink(c, origin, '', { ready: `document.body` });
    await settle(c);
    const control = await evalIn(c, snap);

    const mid = Math.floor(hash.length / 2);
    const damages = {
      truncated: hash.slice(0, hash.length - 40),
      corrupted: hash.slice(0, mid) + 'AAAA' + hash.slice(mid + 4),
      'not a link': '#p=1!!!',
      'unknown version': '#p=9' + hash.slice(4),
    };
    for (const [how, bad] of Object.entries(damages)) {
      await landOnLink(c, origin, bad, { ready: `document.body` });
      await settle(c);
      const toasts = JSON.parse(await evalIn(c, toastsExpr));
      ck(toasts.length === 1 && toasts[0] === DAMAGED, `${how}: toasts are ${JSON.stringify(toasts)}`);
      const stored = await evalIn(c, snap);
      ck(stored === control, `${how}: storage differs from a phone opened with no link (${stored.slice(0, 120)} vs ${control.slice(0, 120)})`);
      ck(!(await evalIn(c, 'location.href')).includes('#p='), `${how}: the link is still in the address bar`);
    }
  } finally {
    await goRich(c, origin);
  }
  return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 4).join(' | ') : 'truncated, corrupted, nonsense and unknown-version links: one toast each, storage as if no link' };
}

export async function handOffLoadPass(c, origin) {
  const problems = [];
  const ck = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
  const uqr = [];   // the hand-off modules and the QR library, whichever is asked for
  let listening = true;   // the CDP client has no `off`
  const onReq = p => { if (listening && /uqr|handoff/.test(p.request.url)) uqr.push(p.request.url); };
  c.on('Network.requestWillBeSent', onReq);
  let detail = '';
  try {
    await goRich(c, origin);
    await evalIn(c, step(`${TODAY_HOME}; document.querySelector('.today-game').click()`));
    await settle(c);
    ck(uqr.length === 0, `hand-off code was requested before Hand off was picked: ${uqr.join(', ')}`);
    await tap(c, `document.getElementById('shareBtn').click()`);
    ck(uqr.length === 0, 'hand-off code was requested by opening the share sheet on Print card');
    await tap(c, PICK_HANDOFF);
    ck(await qrDrawn(c), 'online: Hand off never drew a code');
    ck(uqr.filter(u => /\/uqr\.mjs/.test(u)).length === 1, `picking Hand off requested ${JSON.stringify(uqr)}, want uqr.mjs exactly once`);
    detail = 'hand-off code and the QR library are not requested until Hand off is picked';

    // Offline: the service worker holds it. Wait for the precache, cut the
    // network and the HTTP cache, and open the sheet again.
    const cached = await evalIn(c, `(async () => {
      const reg = await navigator.serviceWorker?.ready;
      if (!reg) return false;
      for (let i = 0; i < 150; i++) {
        if (await caches.match('./vendor/uqr.mjs')) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    })()`);
    if (ck(cached, 'the service worker never cached vendor/uqr.mjs')) {
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      try {
        // A fresh page load, so the module graph does not already hold the encoder.
        // The page's own analytics beacon would log a failed request offline.
        await land(c, origin, { record: 'kept', scripts: [`navigator.sendBeacon = () => true`] });
        const shared = await evalIn(c, `Boolean(navigator.serviceWorker.controller)`);
        ck(shared, 'offline: no service worker controls the page');
        // the reload keeps the games view, so the share sheet's door is already there
        await tap(c, `document.getElementById('shareBtn').click()`);
        await tap(c, PICK_HANDOFF);
        ck(await qrDrawn(c), 'offline: Hand off did not draw a code');
        detail += ', and Hand off draws a code offline';
      } finally {
        await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await c.send('Network.setCacheDisabled', { cacheDisabled: false });
      }
    }
  } finally {
    listening = false;
    await goRich(c, origin);
  }
  return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 4).join(' | ') : detail };
}
