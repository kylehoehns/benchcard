/* A PNG's IHDR is fixed-offset: 8 bytes of signature, 8 of chunk header, then
 * width and height as big-endian uint32s. Three places used to parse that by
 * hand -- scripts/og.mjs (to prove a 2x really is twice a 1x, and that a
 * capture came out the size it asked for), test/hero-density.test.js and
 * test/static-pages.test.js (to check a claim about an image's size against
 * the bytes rather than a second hardcoded number) -- so it is one function,
 * imported by all three, not three copies that could drift.
 *
 * Zero dependencies, same as everything under scripts/: this only reads
 * bytes already in memory. */
export function pngSize(buf, label) {
  if (buf.toString('latin1', 1, 4) !== 'PNG') {
    throw new Error(`${label || 'buffer'} is not a PNG (bad signature)`);
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
