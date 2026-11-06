import { evalIn } from './dom.mjs';
import { evalJSON } from './sheet-drive.mjs';
import { SCALE, PAD, GAP, FOOT } from '../../app/share.js';
import { GROUND } from '../mark.mjs';

/* The mark's ground as [r, g, b], from scripts/mark.mjs, not retyped here. */
const GROUND_RGB = [1, 3, 5].map(i => parseInt(GROUND.slice(i, i + 2), 16));

/* #263: what a coach hands to someone else leaves the page three ways -- an
   `<a download>` click, `navigator.share`, `navigator.clipboard.write` -- and
   a headless Chrome must never actually open a download or a share sheet. So
   the checks that drive those paths put a recorder in the page first: the
   download click is swallowed and written down (its name, the Blob's type and
   bytes), the two `navigator` doors are replaced by stubs that say what they
   were handed, and every toast that appears is kept, even one the next
   replaces. `capRestore` puts every original back, so the row can move on.

   The recorder lives in the page, not here, because the thing worth reading
   is a Blob and a Blob cannot cross the DevTools wire. What comes back is
   plain data: `capRead`. */

const PAGE_SIDE = `(() => {
  if (window.__cap) return;
  const A = HTMLAnchorElement.prototype, U = URL, N = navigator;
  const orig = {
    click: A.click, create: U.createObjectURL,
    ctx: HTMLCanvasElement.prototype.getContext,
  };
  const blobs = new Map();
  const cap = window.__cap = { clicks: [], shares: [], clips: [], toasts: [], texts: [], opts: {} };
  // every string painted onto a canvas, with the width it was painted at
  const C2D = CanvasRenderingContext2D.prototype, fillText = C2D.fillText;
  C2D.fillText = function (text, ...rest) { cap.texts.push({ text, width: this.measureText(text).width }); return fillText.call(this, text, ...rest); };
  U.createObjectURL = function (b) { const u = orig.create.call(U, b); blobs.set(u, b); return u; };
  A.click = function () {
    if (!this.hasAttribute('download')) return orig.click.call(this);
    cap.clicks.push({ download: this.download, href: this.href, blob: blobs.get(this.href) });
  };
  // A toast mounted in a fresh sheet host arrives twice (the host, then the
  // toast in it, batched into one callback), so each element counts once.
  const counted = new WeakSet();
  const seen = new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      for (const t of n.matches('.toast') ? [n] : n.querySelectorAll('.toast')) {
        const msg = t.querySelector('.tmsg');
        if (msg && !counted.has(t)) { counted.add(t); cap.toasts.push(msg.textContent); }
      }
    }
  });
  seen.observe(document.body, { childList: true, subtree: true });
  const own = (k, v) => Object.defineProperty(N, k, { configurable: true, value: v });
  cap.use = o => {
    cap.opts = o;
    // Chrome on a Mac answers canShare({files}) true, so every branch is forced.
    own('canShare', o.canShare ? () => true : () => false);
    own('share', o.share ? async d => {
      cap.shares.push({ files: d.files.map(f => ({ name: f.name, type: f.type, size: f.size })), title: d.title });
      if (o.share === 'abort') throw new DOMException('dismissed', 'AbortError');
      if (o.share === 'error') throw new Error('boom');
    } : undefined);
    own('clipboard', o.clip ? { write: async items => {
      cap.clips.push(items.map(i => ({ ctor: i.constructor.name, types: [...i.types] })));
      if (o.clip === 'reject') throw new Error('denied');
    } } : undefined);
    HTMLCanvasElement.prototype.getContext = o.noContext ? () => null : orig.ctx;
  };
  cap.reset = () => { cap.texts = []; cap.clicks = []; cap.shares = []; cap.clips = []; cap.toasts = []; };
  cap.restore = () => {
    A.click = orig.click; U.createObjectURL = orig.create;
    HTMLCanvasElement.prototype.getContext = orig.ctx;
    for (const k of ['canShare', 'share', 'clipboard']) delete N[k];
    C2D.fillText = fillText;
    seen.disconnect(); delete window.__cap;
  };
  /* The brand orange in the band under the cards, counted off the decoded
     PNG: the card mark's ground (#277) is the only #D2500A down there. */
  const bandOrange = async (blob, band) => {
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = band;
    const g = orig.ctx.call(cv, '2d');
    g.drawImage(bmp, 0, bmp.height - band, bmp.width, band, 0, 0, bmp.width, band);
    const d = g.getImageData(0, 0, cv.width, band).data;
    let n = 0;
    const [gr, gg, gb] = ${JSON.stringify(GROUND_RGB)};
    for (let i = 0; i < d.length; i += 4)
      if (Math.abs(d[i] - gr) <= 2 && Math.abs(d[i + 1] - gg) <= 2 && Math.abs(d[i + 2] - gb) <= 2) n++;
    return n;
  };
  /* Where the card's black boxes, a tag and a tick box landed in the decoded PNG,
     measured on a throwaway unzoomed clone (the same host share.js paints from)
     and sampled at 3x: a filled box is dark with some white text in it, a
     tag's edge is dark and its inside is not, a tick box is a ring. */
  const boxes = async blob => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;';
    const card = document.querySelector('#sheet .card:not(.card-copy)').cloneNode(true);
    host.append(card); document.body.append(host);
    const cr = card.getBoundingClientRect();
    const rel = sel => { const r = card.querySelector(sel).getBoundingClientRect(); return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }; };
    const want = { chip: rel('.cchip'), tag: rel('.ctag'), tick: rel('.tick') };
    const first = card.querySelector('.cchip'), rg = document.createRange(); rg.selectNodeContents(first);
    const laid = rg.getBoundingClientRect().width;
    const chipInk = (cap.texts.find(t => t.text === first.textContent.trim().replace(/\\s+/g, ' '))?.width ?? 0) / laid;
    host.remove();
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const g = orig.ctx.call(cv, '2d'); g.drawImage(bmp, 0, 0);
    const at = (b, fx, fy) => { const d = g.getImageData(Math.round((${PAD} + b.x + b.w * fx) * ${SCALE}), Math.round((${PAD} + b.y + b.h * fy) * ${SCALE}), 1, 1).data; return (d[0] + d[1] + d[2]) / 3; };
    const frac = (b, test) => { let n = 0, t = 0; for (let i = 0; i < 20; i++) for (let j = 0; j < 8; j++) { t++; if (test(at(b, (i + .5) / 20, (j + .5) / 8))) n++; } return Math.round(n / t * 100) / 100; };
    return {
      chipDark: frac(want.chip, v => v < 60), chipWhite: frac(want.chip, v => v > 200),
      // how wide the first name was drawn, over how wide the card laid it out: 1 when it is the same size
      chipInk,
      tagTop: frac({ ...want.tag, x: want.tag.x + 4, w: want.tag.w - 8, h: 1 }, v => v < 140), tagInside: frac({ x: want.tag.x + 3, y: want.tag.y + 3, w: want.tag.w - 6, h: 1 }, v => v > 200),
      tickLeft: frac({ ...want.tick, w: 1 }, v => v < 60), tickInside: at(want.tick, .5, .5),
    };
  };
  cap.read = async () => {
    const clicks = [];
    for (const k of cap.clicks) {
      const bytes = new Uint8Array(await k.blob.arrayBuffer());
      const dv = new DataView(bytes.buffer);
      const png = bytes.length > 24 && [...bytes.slice(0, 8)].join() === '137,80,78,71,13,10,26,10';
      clicks.push({
        download: k.download, type: k.blob.type, size: bytes.length, png,
        w: png ? dv.getUint32(16) : null, h: png ? dv.getUint32(20) : null,
        boxes: png ? await boxes(k.blob) : null,
        bandOrange: png ? await bandOrange(k.blob, ${FOOT * SCALE}) : null,
        text: png ? null : new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
      });
    }
    return {
      clicks, shares: cap.shares, clips: cap.clips, toasts: cap.toasts,
      // the share image paints in a host outside #sheet and must remove it
      hosts: document.querySelectorAll('body > div[aria-hidden="true"][style*="-10000px"]').length,
    };
  };
})()`;

export const capInstall = c => evalIn(c, PAGE_SIDE);
export const capUse = (c, opts) => evalIn(c, `window.__cap.use(${JSON.stringify(opts)}); window.__cap.reset();`);
export const capRead = c => evalJSON(c, `window.__cap.read().then(r => JSON.stringify(r))`);
export const capReset = c => evalIn(c, `window.__cap.reset()`);
export const capRestore = c => evalIn(c, `window.__cap?.restore()`);

/* The PNG's size, worked out from the cards' own rects the way the spec states
   it, with share.js's own SCALE, PAD, GAP and FOOT. Rects come from a throwaway host built
   like the one `share.js` paints from, so they are print pixels, not the
   zoomed ones `#sheet` shows. */
export async function expectedPngSize(c) {
  const rects = await evalJSON(c, `(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;';
    for (const k of document.querySelectorAll('#sheet .card:not(.card-copy)')) host.append(k.cloneNode(true));
    document.body.append(host);
    const out = [...host.children].map(n => { const r = n.getBoundingClientRect(); return [r.width, r.height]; });
    host.remove();
    return JSON.stringify(out);
  })()`);
  const wide = rects.reduce((a, r) => a + r[0], 0) + GAP * (rects.length - 1) + PAD * 2;
  const tall = Math.max(...rects.map(r => r[1]));
  return { cards: rects.length, w: Math.round(wide * SCALE), h: Math.round((tall + PAD + FOOT) * SCALE) };
}
