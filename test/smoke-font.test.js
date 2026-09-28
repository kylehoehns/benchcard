/* #177: the pure half of `scripts/smoke/smoke-font.mjs` -- the script
 * builder that turns two already-base64'd font faces into the text
 * `Page.addScriptToEvaluateOnNewDocument` runs on every new document. The
 * two real `.ttf` files it reads at import time are binary assets, not
 * behavior, so this test drives the pure function directly with throwaway
 * bytes rather than the real fonts, and PROVES the string it returns by
 * actually running it -- through Node's `vm` module, against stand-in
 * `FontFace`/`CSSStyleSheet`/`document` globals -- not by reading the
 * string as text (`/tdd`'s own anti-pattern: a check that regex-reads
 * generated source is the weakest kind of guard here).
 *
 * The behavior asked for by the spec's Design section: two `FontFace`s
 * under ONE family name (weight 400 and weight 700, no range), both handed
 * to `document.fonts.add`, plus one constructed stylesheet in
 * `document.adoptedStyleSheets` that overrides `--font`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildFontInjectionScript } from '../scripts/smoke/smoke-font.mjs';

// Real base64 is irrelevant to this function's own logic -- it never reads
// the bytes, only threads them through `atob` -- so short throwaway payloads
// ('book' / 'bold', base64-encoded) prove decoding without touching the real
// 700KB fonts.
const BOOK_B64 = Buffer.from('book').toString('base64');
const BOLD_B64 = Buffer.from('bold').toString('base64');
const FAMILY = 'DejaVu Sans';

// Pure function, same three inputs in every test below (the fourth test's own
// stand-in sandbox is what varies, not the script) -- built once rather than
// re-derived per test.
const SCRIPT = buildFontInjectionScript({ bookBase64: BOOK_B64, boldBase64: BOLD_B64, family: FAMILY });

function run(script) {
  const created = [];
  const added = [];
  const sheets = [];
  class FontFace {
    constructor(family, source, descriptors) {
      this.family = family;
      this.source = source;
      this.descriptors = descriptors;
      created.push(this);
    }
  }
  class CSSStyleSheet {
    replaceSync(css) { this.css = css; sheets.push(this); }
  }
  const document = { fonts: { add: f => added.push(f) }, adoptedStyleSheets: [] };
  const atob = s => Buffer.from(s, 'base64').toString('binary');
  const sandbox = { FontFace, CSSStyleSheet, document, atob, Uint8Array };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { created, added, sheets, document };
}

test('builds two FontFace weights under one family name, both added to document.fonts', () => {
  const { created, added } = run(SCRIPT);

  assert.equal(created.length, 2, 'expected exactly two FontFace constructions');
  assert.ok(created.every(f => f.family === FAMILY), 'every FontFace must share one family name');
  assert.deepEqual(created.map(f => f.descriptors.weight).sort(), ['400', '700'],
    'want weight 400 and weight 700, no range');
  assert.deepEqual(added, created, 'every constructed FontFace must be added to document.fonts, in order');
});

test('decodes each face\'s own bytes -- not the base64 text -- into the FontFace source', () => {
  const { created } = run(SCRIPT);

  const byWeight = Object.fromEntries(created.map(f => [f.descriptors.weight, f.source]));
  for (const [weight, want] of [['400', 'book'], ['700', 'bold']]) {
    const source = byWeight[weight];
    assert.ok(source instanceof ArrayBuffer, `weight ${weight}'s source should be an ArrayBuffer, not base64 text`);
    assert.equal(Buffer.from(source).toString(), want,
      `weight ${weight}'s decoded bytes should read "${want}"`);
  }
});

test('overrides --font with one constructed stylesheet, appended to document.adoptedStyleSheets', () => {
  const { sheets, document } = run(SCRIPT);

  assert.equal(sheets.length, 1, 'expected exactly one CSSStyleSheet constructed');
  assert.match(sheets[0].css, /--font:\s*"DejaVu Sans"\s*!important/,
    `the sheet's own CSS should force --font to the smoke family: got ${JSON.stringify(sheets[0].css)}`);
  // Element-wise, not a whole-array deepEqual: the array literal in
  // `document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]`
  // is built inside the vm context, so it carries that context's own Array
  // prototype -- a different object from this file's Array.prototype even
  // though the two are otherwise identical. deepStrictEqual treats that as a
  // mismatch; comparing length and the one element (itself constructed by
  // the outer-realm CSSStyleSheet class, so its own identity survives) does
  // not.
  assert.equal(document.adoptedStyleSheets.length, 1, 'adoptedStyleSheets should have exactly one entry');
  assert.equal(document.adoptedStyleSheets[0], sheets[0],
    'the constructed sheet must be appended to document.adoptedStyleSheets');
});

test('appends to an existing adoptedStyleSheets list rather than replacing it', () => {
  const already = { already: true };
  const sandbox = {
    FontFace: class { constructor() {} },
    CSSStyleSheet: class { replaceSync() {} },
    document: { fonts: { add: () => {} }, adoptedStyleSheets: [already] },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Uint8Array,
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  assert.equal(sandbox.document.adoptedStyleSheets.length, 2, 'the prior sheet must survive the push');
  assert.equal(sandbox.document.adoptedStyleSheets[0], already);
});
