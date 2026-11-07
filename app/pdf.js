/* A US Letter PDF of the printed card, for the iOS Home Screen app (#630).

   `window.print()` does nothing there, and a shared PNG is scaled by iOS to
   fill the page, so the card never prints at its real size. This builds the
   page `window.print()` would: each card at its true size, laid out the way
   print lays them out. Pure: no DOM, no imports. share.js paints the cards and
   calls it.

   The numbers below are card.css's, in points: `@page { size: letter
   portrait; margin: .25in }` and print's `.stage { gap: .15in }`.
   test/pdf.test.js reads card.css and fails if either drifts. */

export const PT_PER_IN = 72;
export const LETTER = { w: 8.5 * PT_PER_IN, h: 11 * PT_PER_IN };
export const MARGIN = .25 * PT_PER_IN;
export const GAP = .15 * PT_PER_IN;

// Rounding noise from inch-to-point products must not push a card that fits
// (18 + 576 = 594, exactly the right edge) onto the next row.
const EPS = 1e-6;

/** Lay `sizes` ({ w, h } in points, print order) on letter pages the way print
    does: rows fill left to right while they fit, a row is as tall as its
    tallest card, and a row that would pass the bottom margin starts a page.
    Returns pages of `{ i, x, y, w, h }`, x/y from the page's top-left. */
export function printLayout(sizes) {
  const rows = [];
  let row = null, x = MARGIN;
  sizes.forEach((s, i) => {
    if (row && x + s.w <= LETTER.w - MARGIN + EPS) { row.push({ i, ...s }); }
    else { row = [{ i, ...s }]; rows.push(row); x = MARGIN; }
    x += s.w + GAP;
  });
  const pages = [];
  let page = null, y = MARGIN;
  for (const r of rows) {
    const tall = Math.max(...r.map(c => c.h));
    if (!page || y + tall > LETTER.h - MARGIN + EPS) { page = []; pages.push(page); y = MARGIN; }
    let cx = MARGIN;
    for (const c of r) { page.push({ i: c.i, x: cx, y, w: c.w, h: c.h }); cx += c.w + GAP; }
    y += tall + GAP;
  }
  return pages;
}

// At most 3 decimals, no trailing zeros: 248.4, 360, 277.2.
const num = n => String(+n.toFixed(3));

/** Write the PDF. `pages` is `printLayout`'s, each placement also carrying
    `img`, an index into `images` (`{ jpeg: Uint8Array, width, height }`, in
    pixels). A repeated card is the same XObject drawn again, not embedded
    again. Returns the file's bytes. */
export function letterPdf(pages, images) {
  const enc = s => Uint8Array.from(s, ch => ch.charCodeAt(0));
  const objs = [];   // objs[n - 1] is a list of byte chunks, without "n 0 obj"
  const add = (...chunks) => objs.push(chunks.map(c => typeof c === 'string' ? enc(c) : c));
  const imageId = k => 3 + k;
  const names = images.map((_, k) => `/Im${k} ${imageId(k)} 0 R`).join(' ');
  const pageId = p => 3 + images.length + 2 * p;   // its content stream is the next id
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${pages.map((_, p) => `${pageId(p)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  for (const im of images) {
    add(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`,
      im.jpeg, '\nendstream');
  }
  pages.forEach((page, p) => {
    const body = page.map(c =>
      `q ${num(c.w)} 0 0 ${num(c.h)} ${num(c.x)} ${num(LETTER.h - c.y - c.h)} cm /Im${c.img} Do Q\n`).join('');
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LETTER.w} ${LETTER.h}] /Resources << /XObject << ${names} >> >> /Contents ${pageId(p) + 1} 0 R >>`);
    add(`<< /Length ${body.length} >>\nstream\n${body}endstream`);
  });

  const out = [enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  let at = out[0].length;
  const offsets = [];
  objs.forEach((chunks, n) => {
    offsets.push(at);
    for (const c of [enc(`${n + 1} 0 obj\n`), ...chunks, enc('\nendobj\n')]) { out.push(c); at += c.length; }
  });
  const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ',
    ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n `)].join('\n');
  out.push(enc(`${xref}\ntrailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));
  const bytes = new Uint8Array(out.reduce((n, c) => n + c.length, 0));
  let k = 0;
  for (const c of out) { bytes.set(c, k); k += c.length; }
  return bytes;
}
