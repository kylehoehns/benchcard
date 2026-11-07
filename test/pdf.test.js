/* #630: the pure PDF builder. printLayout mirrors how Chrome's window.print()
   lays the cards out on letter paper; letterPdf writes the file. Expected
   numbers are the spec's (docs/specs/630-print-pdf.md, items 1 and 2), read
   off Chrome's own print of the RICH game day, not recomputed here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { printLayout, letterPdf, PT_PER_IN, LETTER, MARGIN, GAP } from '../app/pdf.js';
import { CARD_SIZES } from '../app/card-spec.js';

const pts = k => ({ w: CARD_SIZES[k].w * PT_PER_IN, h: CARD_SIZES[k].h * PT_PER_IN });
const same = (n, k) => Array.from({ length: n }, () => pts(k));
const flat = pages => pages.map(p => p.map(c => [c.x, +(LETTER.h - c.y - c.h).toFixed(3)]));
const near = (a, b) => assert.deepEqual(a.map(p => p.map(c => c.map(v => +v.toFixed(3)))), b);

test('Pocket, one game, 2 copies: one page, two cards side by side', () => {
  near(flat(printLayout(same(2, 'pocket'))), [[[18, 414], [277.2, 414]]]);
});

test('Pocket, whole day, 4 cards: one page, a 2 x 2 grid', () => {
  near(flat(printLayout(same(4, 'pocket'))), [[[18, 414], [277.2, 414], [18, 43.2], [277.2, 43.2]]]);
});

test('Half, one game, 2 copies: one page, stacked', () => {
  near(flat(printLayout(same(2, 'half'))), [[[18, 406.8], [18, 28.8]]]);
});

test('Half, whole day, 4 cards: two pages of two', () => {
  near(flat(printLayout(same(4, 'half'))), [[[18, 406.8], [18, 28.8]], [[18, 406.8], [18, 28.8]]]);
});

test('a game that splits across many cards flows on to as many pages as it needs, in order', () => {
  const pages = printLayout(same(9, 'pocket'));
  assert.deepEqual(pages.map(p => p.length), [4, 4, 1]);
  assert.deepEqual(pages.flat().map(c => c.i), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([pages[2][0].x, pages[2][0].y], [MARGIN, MARGIN]);
});

test('no cards makes no pages', () => {
  assert.deepEqual(printLayout([]), []);
});

/* ---- letterPdf ---- */

const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 0xFF, 0xD9]);
const IMG = { jpeg: JPEG, width: 1035, height: 1500 };
const build = sizes => {
  const pages = printLayout(sizes).map(p => p.map(c => ({ ...c, img: 0 })));
  const bytes = letterPdf(pages, [IMG]);
  return { bytes, text: Buffer.from(bytes).toString('latin1') };
};

test('every page is letter and each card is drawn at its true size at the margin', () => {
  const { text } = build(same(2, 'pocket'));
  assert.equal(text.match(/\/MediaBox \[0 0 612 792\]/g).length, 1);
  assert.match(text, /q 248\.4 0 0 360 18 414 cm \/Im0 Do Q/);
  assert.match(text, /q 248\.4 0 0 360 277\.2 414 cm \/Im0 Do Q/);
  const half = build(same(4, 'half')).text;
  assert.equal(half.match(/\/MediaBox \[0 0 612 792\]/g).length, 2);
  assert.match(half, /q 576 0 0 367\.2 18 406\.8 cm/);
  assert.match(half, /q 576 0 0 367\.2 18 28\.8 cm/);
});

test('the image is an embedded JPEG with its pixel size, drawn once however often it repeats', () => {
  const { text } = build(same(4, 'pocket'));
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /\/Width 1035/);
  assert.match(text, /\/Height 1500/);
  assert.equal(text.match(/\/Subtype \/Image/g).length, 1);
  assert.equal(text.match(/ Do Q/g).length, 4);
  assert.ok(text.includes('\xFF\xD8\xFF\xE0\x01\x02\x03\xFF\xD9'), 'the JPEG bytes are not embedded verbatim');
});

test('every xref offset points at its object and startxref at the table', () => {
  const { text } = build(same(4, 'half'));
  const at = text.lastIndexOf('xref\n0 ');
  assert.ok(at > 0, 'no xref table');
  assert.equal(+text.match(/startxref\n(\d+)\n%%EOF\n?$/)[1], at);
  const lines = text.slice(at).split('\n');
  const count = +lines[1].split(' ')[1];
  assert.ok(count > 4, `only ${count} objects`);
  for (let n = 1; n < count; n++) {
    const [off] = lines[2 + n].split(' ');
    assert.equal(off.length, 10);
    assert.ok(text.startsWith(`${n} 0 obj`, +off), `object ${n} is not at offset ${+off}`);
  }
  assert.match(text, new RegExp(`trailer\\n<< /Size ${count} /Root 1 0 R >>`));
  assert.ok(text.startsWith('%PDF-1.4\n%'));
});

/* ---- guard: pdf.js holds card.css's page geometry in points ---- */

const css = readFileSync(new URL('../app/card.css', import.meta.url), 'utf8');
const inches = s => +s * PT_PER_IN;
const PAPER = { letter: { w: 8.5, h: 11 } };

test('guard: pdf.js page, margin and gap are card.css\'s @page and print .stage gap', () => {
  const page = css.match(/@page\s*\{\s*size:\s*(\w+)\s+portrait;\s*margin:\s*([\d.]+)in;\s*\}/);
  assert.ok(page, 'card.css has no `@page { size: <paper> portrait; margin: <n>in; }` this guard can read; update the guard with it');
  assert.ok(PAPER[page[1]], `card.css prints on ${page[1]}; teach pdf.js and this guard that size`);
  assert.deepEqual(LETTER, { w: inches(PAPER[page[1]].w), h: inches(PAPER[page[1]].h) }, 'LETTER in app/pdf.js differs from @page size in card.css');
  assert.equal(MARGIN, inches(page[2]), 'MARGIN in app/pdf.js differs from @page margin in card.css');
  const stage = css.match(/@media print\s*\{[\s\S]*?\.stage\s*\{[^}]*?gap:\s*([\d.]+)in/);
  assert.ok(stage, 'card.css has no `.stage { ... gap: <n>in }` in @media print this guard can read');
  assert.equal(GAP, inches(stage[1]), 'GAP in app/pdf.js differs from the print .stage gap in card.css');
});
