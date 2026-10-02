import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

/* The install icons are maskable, so a phone may crop them to a circle. The
   safe zone is the centered circle of radius 0.4 x size (#277 item 3): the
   card and its shadow must sit inside it, and outside it there is only the
   ground color. app/icon-512.png is decoded here and every pixel checked. */

function decode(buf) {
  let o = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (kind === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  assert.equal(depth, 8, 'expected 8-bit samples');
  const bpp = { 2: 3, 6: 4 }[type];
  assert.ok(bpp, `unsupported PNG color type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0;
      const b = y ? px[row - stride + i] : 0;
      const c = y && i >= bpp ? px[row - stride + i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = [0, a, b, (a + b) >> 1, paeth][f];
      px[row + i] = (raw[src + i] + add) & 255;
    }
  }
  return { w, h, bpp, px };
}

const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const near = (p, want, tol) => p.every((v, i) => Math.abs(v - want[i]) <= tol);

test('icon-512: the card and its shadow stay inside the safe circle', () => {
  const { w, h, bpp, px } = decode(readFileSync(new URL('../app/icon-512.png', import.meta.url)));
  assert.equal(w, 512); assert.equal(h, 512);
  const ground = hex('#D2500A');
  let outside = 0, inside = 0, bad = 0, worst = null;
  const hues = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = [...px.subarray((y * w + x) * bpp, (y * w + x) * bpp + 3)];
    const d = Math.hypot(x + .5 - 256, y + .5 - 256);
    if (d > 0.4 * 512) {
      outside++;
      if (!near(p, ground, 2)) { bad++; worst ??= { x, y, p }; }
    } else {
      inside++;
      for (const c of ['#C0504D', '#C9762F', '#A8952E', '#5E8A3A', '#2E8A7A']) if (near(p, hex(c), 2)) hues.add(c);
    }
  }
  // the check measured something: there was ground to look at, and the mark is drawn
  assert.ok(outside > 50000, `only ${outside} pixels outside the circle`);
  assert.equal(hues.size, 5, `only ${hues.size} of the 5 player hues are drawn inside the circle`);
  assert.equal(bad, 0, `${bad} pixels outside the safe circle are not #D2500A, first at ${JSON.stringify(worst)}`);
});
