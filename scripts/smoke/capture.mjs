import { evalIn } from './dom.mjs';
import { evalJSON } from './sheet-drive.mjs';

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
  const cap = window.__cap = { clicks: [], shares: [], clips: [], toasts: [], opts: {} };
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
  cap.reset = () => { cap.clicks = []; cap.shares = []; cap.clips = []; cap.toasts = []; };
  cap.restore = () => {
    A.click = orig.click; U.createObjectURL = orig.create;
    HTMLCanvasElement.prototype.getContext = orig.ctx;
    for (const k of ['canShare', 'share', 'clipboard']) delete N[k];
    seen.disconnect(); delete window.__cap;
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
   it: SCALE 3, PAD 14, GAP 14, FOOT 30. Rects come from a throwaway host built
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
  const wide = rects.reduce((a, r) => a + r[0], 0) + 14 * (rects.length - 1) + 28;
  const tall = Math.max(...rects.map(r => r[1]));
  return { cards: rects.length, w: Math.round(wide * 3), h: Math.round((tall + 14 + 30) * 3) };
}
