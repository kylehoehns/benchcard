/* Share the card as an image.

   The card is the artefact a coach hands to another coach, and "text me your
   rotation" is how that actually happens. Printing needs a printer; a PNG
   needs a thumb.

   How it works: the card already exists in the DOM, laid out at true print
   size, so rather than re-deriving the layout this paints what the browser
   already measured. It clones the card into an offscreen host (outside
   `#sheet`, so `--cardzoom` is unset and `zoom` resolves to 1 and every rect
   is in real 96dpi print pixels), walks it, and draws each leaf's text and
   each horizontal rule onto a canvas at 3x. No library, no `foreignObject`
   (which cannot see the vendored font without inlining the whole woff2), and
   nothing to keep in sync with the card CSS beyond "borders are horizontal
   and text lives in leaves" -- both of which the card has always been.

   Everything up to the share call is synchronous on purpose. `navigator.share`
   needs transient activation, and an `await` between the tap and the call
   loses it on iOS -- which is the platform where sharing is the whole point.
   That is why this uses `toDataURL` and converts by hand rather than the
   nicer `toBlob`. */

const SCALE = 3;          // 96dpi CSS px -> 288dpi image
const PAD = 14;           // page margin around the cards, in CSS px
const GAP = 14;           // between cards when a game needs two
const PAGE = '#eceae6';   // paper-ish ground so a white card has an edge
const EDGE = '#d6d2cc';

/* The shared image is the one thing that reaches a parent's group chat, and
   the in-card mark is 7px -- about five device pixels once a phone has scaled
   the picture to fit a message bubble. So the bottom margin is grown and the
   domain repeated in it, at a size that survives that trip. It costs the card
   nothing: the band is outside the card rect, the in-card mark is untouched,
   and it is a URL and nothing else -- no wordmark, no strapline, no claim. */
const FOOT = 30;          // bottom margin, in place of PAD, in CSS px
const MARK = 'benchcard.app';
const MARK_PX = 10;
const MARK_INK = '#777';  // matches `.card-hd .card-mark`

/* Cards are cloned rather than measured in place: `#sheet` sets `--cardzoom`
   to fit the preview to the phone, and a zoomed rect is not a print rect. */
function offscreen(cards) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;';
  for (const c of cards) {
    const clone = c.cloneNode(true);
    clone.classList.remove('card-copy');
    host.append(clone);
  }
  document.body.append(host);
  return host;
}

const px = v => parseFloat(v) || 0;

/* Only horizontal rules exist on the card (the header underline, the period
   divider, the minutes strip), so this draws top and bottom borders and skips
   the sides rather than pretending to be a general box painter. */
function drawBorders(ctx, cs, x, y, w, h) {
  for (const [side, top] of [['Top', true], ['Bottom', false]]) {
    const width = px(cs[`border${side}Width`]);
    if (!width || cs[`border${side}Style`] === 'none') continue;
    ctx.fillStyle = cs[`border${side}Color`];
    ctx.fillRect(x, top ? y : y + h - width, w, width);
  }
}

/* One leaf wraps: on a 12-player roster the minutes strip runs to a second
   line. `fillText` does not, so the strip was painted as one long line that
   ran off the card edge and lost its second line entirely -- a shared image
   that silently dropped four players' minutes. The breaks are not re-derived
   here: a Range over the leaf reports one rect per line box, and walking it a
   character at a time says which line each character landed on, so the canvas
   gets the browser's own line breaking -- the bargain this whole file makes. */
function lineBoxes(n, x, y, h) {
  const text = n.textContent, node = n.firstChild;
  if (n.childNodes.length !== 1 || node.nodeType !== 3) return [{ text, x, y, h }];
  const range = document.createRange();
  range.selectNodeContents(n);
  const rows = [...range.getClientRects()].filter(r => r.width);
  if (rows.length < 2) return [{ text, x, y, h }];
  const parts = rows.map(() => '');
  let k = 0;
  for (let i = 0; i < text.length; i++) {
    range.setStart(node, i); range.setEnd(node, i + 1);
    const top = range.getBoundingClientRect().top;
    // A space eaten by the break has no rect of its own; it belongs to the
    // line it ended, and is trimmed off below anyway.
    const at = rows.findIndex(r => Math.abs(r.top - top) < 1);
    if (at >= 0) k = at;
    parts[k] += text[i];
  }
  const box = n.getBoundingClientRect();
  return rows.map((r, i) =>
    ({ text: parts[i], x: x + r.left - box.left, y: y + r.top - box.top, h: r.height }));
}

function drawText(ctx, n, cs, x, y, h) {
  if (!n.textContent.trim()) return;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  // Chrome and Safari both honour this; where they do not, the fallback is
  // slightly tighter text, not wrong text.
  ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  ctx.fillStyle = cs.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const ln of lineBoxes(n, x, y, h)) {
    // The DOM collapses runs of whitespace and the canvas does not: the
    // minutes strip's three-space separators measured 12% wider here than on
    // the card this is a picture of.
    const text = ln.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const m = ctx.measureText(text);
    const asc = m.fontBoundingBoxAscent || px(cs.fontSize) * 0.8;
    const desc = m.fontBoundingBoxDescent || px(cs.fontSize) * 0.2;
    const base = ln.y + (ln.h - (asc + desc)) / 2 + asc;
    ctx.fillText(text, ln.x, base);
    if (cs.textDecorationLine.includes('underline')) {
      const thick = px(cs.textDecorationThickness) || Math.max(1, px(cs.fontSize) * 0.06);
      const off = px(cs.textUnderlineOffset) || thick;
      ctx.fillRect(ln.x, base + off + thick, m.width, thick);
    }
  }
}

function paint(ctx, root, ox, oy) {
  const base = root.getBoundingClientRect();
  const walk = n => {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = n.getBoundingClientRect();
    const x = r.left - base.left + ox, y = r.top - base.top + oy;
    drawBorders(ctx, cs, x, y, r.width, r.height);
    if (!n.firstElementChild) drawText(ctx, n, cs, x, y, r.height);
    else for (const c of n.children) walk(c);
  };
  for (const c of root.children) walk(c);
}

/** Paint one or more `.card` elements onto a canvas. Synchronous. */
function drawCards(cards) {
  const host = offscreen(cards);
  try {
    const nodes = [...host.children];
    const rects = nodes.map(n => n.getBoundingClientRect());
    const w = rects.reduce((a, r) => a + r.width, 0) + GAP * (rects.length - 1) + PAD * 2;
    const tall = Math.max(...rects.map(r => r.height));
    const h = tall + PAD + FOOT;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * SCALE);
    canvas.height = Math.round(h * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = PAGE;
    ctx.fillRect(0, 0, w, h);
    let x = PAD;
    for (let i = 0; i < nodes.length; i++) {
      const r = rects[i];
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath(); ctx.roundRect(x, PAD, r.width, r.height, 5); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillRect(x, PAD, r.width, r.height);
        ctx.strokeRect(x + .5, PAD + .5, r.width - 1, r.height - 1);
      }
      paint(ctx, nodes[i], x, PAD);
      x += r.width + GAP;
    }
    /* Painted straight onto the context rather than through `paint`'s walker:
       the band is not part of the card, so there is no node to walk, and
       inventing one to be walked would be more code than these five calls.
       `letterSpacing` and `textAlign` are reset explicitly because `drawText`
       leaves both set on the context from the last leaf it painted. */
    ctx.font = `${MARK_PX}px ${getComputedStyle(nodes[0]).fontFamily}`;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = MARK_INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(MARK, w / 2, tall + PAD + FOOT / 2);
    return canvas;
  } finally {
    host.remove();
  }
}

/* `toDataURL` then a hand-rolled decode, rather than `toBlob`, so the whole
   path from tap to `navigator.share` stays inside the activation window. */
function pngBlob(canvas) {
  const b64 = canvas.toDataURL('image/png').split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

/**
 * Share the given cards as a PNG. Resolves to what actually happened:
 * 'shared' (the system sheet), 'copied' (clipboard), 'saved' (a download),
 * or 'cancelled' if the coach dismissed the sheet.
 */
export function shareCards(cards, { filename = 'benchcard.png', title = 'Benchcard' } = {}) {
  const blob = pngBlob(drawCards(cards));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file], title })
      .then(() => 'shared')
      // A dismissed share sheet rejects with AbortError; that is a coach
      // changing their mind, not a failure to report.
      .catch(e => { if (e?.name === 'AbortError') return 'cancelled'; throw e; });
  }
  if (navigator.clipboard?.write && window.ClipboardItem) {
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => 'copied')
      .catch(() => save(blob, filename));
  }
  return Promise.resolve(save(blob, filename));
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}
