// Guard: browsers skip backgrounds when printing unless the rule opts in, so a
// dark background on the card prints white (the black send-in boxes vanish).
// Every card.css rule with a dark background must declare both spellings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../app/card.css', import.meta.url), 'utf8');

function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function rgbOf(value) {
  if (/var\(|gradient/i.test(value)) return null;
  const m = value.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)|\bblack\b/i);
  if (!m) return null;
  if (m[2]) return [+m[2], +m[3], +m[4]];
  if (m[1]) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  return [0, 0, 0];
}
// Plain CSS: rules inside @media count too, because an @media prelude never
// matches (its body holds braces) and the inner rules do.
export function darkRules(css) {
  const out = [];
  for (const [, sel, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = body.split(';').map((d) => d.trim()).filter(Boolean);
    const bg = decls.find((d) => /^background(-color)?\s*:/i.test(d));
    const rgb = bg && rgbOf(bg.replace(/^[^:]+:/, ''));
    if (rgb && lum(rgb) < 0.5) {
      const has = (p) => decls.some((d) => d.replace(/\s+/g, '') === `${p}:exact`);
      out.push({ sel: sel.trim(), ok: has('print-color-adjust') && has('-webkit-print-color-adjust') });
    }
  }
  return out;
}

test('every dark background in card.css opts in to printing', () => {
  const dark = darkRules(CSS);
  assert.ok(dark.length > 0, 'found no dark-background rule in card.css: the parser measured nothing');
  const bad = dark.filter((r) => !r.ok).map((r) => r.sel);
  assert.deepEqual(bad, [], `${bad.join(', ')} lacks print-color-adjust: exact. Add "-webkit-print-color-adjust: exact; print-color-adjust: exact;" to the rule, or desktop prints drop the black boxes.`);
});

test('the parser finds dark rules, inside @media, and skips light ones', () => {
  assert.equal(darkRules('.a { background: #fff } .b { background: var(--x) } .c { background: linear-gradient(#000,#111) }').length, 0);
  const r = darkRules('@media print { .z { background: #111 } }');
  assert.deepEqual(r, [{ sel: '.z', ok: false }]);
});
