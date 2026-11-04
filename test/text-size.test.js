/* #611: `scaleEm`, the pure half of app/text-size.js, at the seam the spec's
 * Proof names. An `em` in a media query is the browser's default size, never
 * the root's, so a root grown to 32px leaves `(max-width: 19em)` at 304px.
 * `scaleEm` turns each `<n>em` into px at the root's size. Expected strings
 * are worked by hand: 19 x 16 x 2 = 608, 18 x 17 x 2 = 612. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scaleEm, scaleBreakpoints, mq } from '../app/text-size.js';

test('an integer em becomes px at base x factor', () => {
  assert.equal(scaleEm('(max-width: 19em)', 2, 16), '(max-width: 608px)');
});

test('a decimal em becomes px, and a leading-dot decimal too', () => {
  assert.equal(scaleEm('(max-height: 43.75em)', 2, 16), '(max-height: 1400px)');
  assert.equal(scaleEm('(max-height: .5em)', 2, 16), '(max-height: 16px)');
});

test('every em in one condition is scaled', () => {
  assert.equal(
    scaleEm('(min-width: 10em) and (max-width: 18em)', 2, 16),
    '(min-width: 320px) and (max-width: 576px)');
});

test('the orientation condition keeps its words and scales its em', () => {
  assert.equal(
    scaleEm('(orientation: landscape) and (max-height: 35em)', 2, 16),
    '(orientation: landscape) and (max-height: 1120px)');
});

test('the base is part of the answer: 17px on iOS', () => {
  assert.equal(scaleEm('(max-width: 18em)', 2, 17), '(max-width: 612px)');
});

test('rem, px and other units are left alone', () => {
  assert.equal(scaleEm('(max-width: 19rem)', 2, 16), '(max-width: 19rem)');
  assert.equal(scaleEm('(max-width: 600px) and (min-resolution: 2dppx)', 2, 16),
    '(max-width: 600px) and (min-resolution: 2dppx)');
});

test('a factor of 1 returns the text exactly', () => {
  assert.equal(scaleEm('(max-width: 19em)', 1, 16), '(max-width: 19em)');
  assert.equal(scaleEm('(max-width: 19em)', 1, 17), '(max-width: 19em)');
});

test('a query with no em comes back as it was', () => {
  assert.equal(scaleEm('(prefers-reduced-motion: reduce)', 2, 16), '(prefers-reduced-motion: reduce)');
  assert.equal(scaleEm('', 2, 16), '');
});

/* The page-reading half, against a minimal fake DOM on globalThis. `env`
 * sets what the browser would report: iOS or not, the default size (medium)
 * and the root's size. */
class FakeMediaRule { constructor(text) { this.media = { mediaText: text }; } }
class FakeGroupRule { constructor(rules) { this.cssRules = rules; } }
const text = (rule) => rule.media.mediaText;

function env({ ios, medium = 16, root }) {
  globalThis.CSSMediaRule = FakeMediaRule;
  globalThis.CSS = { supports: () => ios };
  const probe = { style: {}, remove() {} };
  globalThis.document = {
    createElement: () => probe,
    body: { appendChild() {} },
    documentElement: { id: 'root' },
    styleSheets: [],
  };
  globalThis.getComputedStyle = (el) =>
    ({ fontSize: `${el === probe ? medium : root}px` });
  return globalThis.document;
}

test('iOS: a root at the 17px base rewrites nothing; 34px scales 19em to 646px', () => {
  const doc = env({ ios: true, root: 17 });
  const rule = new FakeMediaRule('(max-width: 19em)');
  doc.styleSheets.push({ cssRules: [rule] });
  scaleBreakpoints();
  assert.equal(text(rule), '(max-width: 19em)');
  env({ ios: true, root: 34 }).styleSheets.push({ cssRules: [rule] });
  scaleBreakpoints();
  assert.equal(text(rule), '(max-width: 646px)');
});

test('default: root 32 over medium 16 scales 19em to 608px; root 16 leaves it', () => {
  const rule = new FakeMediaRule('(max-width: 19em)');
  env({ ios: false, root: 32 }).styleSheets.push({ cssRules: [rule] });
  scaleBreakpoints();
  assert.equal(text(rule), '(max-width: 608px)');
  assert.equal(mq('(max-width: 19em)'), '(max-width: 608px)');
  env({ ios: false, root: 16 }).styleSheets.push({ cssRules: [rule] });
  scaleBreakpoints();
  assert.equal(text(rule), '(max-width: 19em)');
  assert.equal(mq('(max-width: 19em)'), '(max-width: 19em)');
});

test('factor 1 assigns no mediaText at all', () => {
  const doc = env({ ios: false, root: 16 });
  let writes = 0;
  const rule = new FakeMediaRule('(max-width: 19em)');
  let value = rule.media.mediaText;
  rule.media = { get mediaText() { return value; }, set mediaText(v) { writes++; value = v; } };
  doc.styleSheets.push({ cssRules: [rule] });
  scaleBreakpoints();
  assert.equal(writes, 0);
});

test('scaling twice does not compound; returning to factor 1 restores the original', () => {
  const rule = new FakeMediaRule('(max-width: 19em)');
  env({ ios: false, root: 32 }).styleSheets.push({ cssRules: [rule] });
  scaleBreakpoints();
  scaleBreakpoints();
  assert.equal(text(rule), '(max-width: 608px)');
  env({ ios: false, root: 16 }).styleSheets.push({ cssRules: [rule] });
  scaleBreakpoints();
  assert.equal(text(rule), '(max-width: 19em)');
});

test('media rules nested in grouping rules are scaled', () => {
  const inner = new FakeMediaRule('(max-width: 19em)');
  const doc = env({ ios: false, root: 32 });
  doc.styleSheets.push({ cssRules: [new FakeGroupRule([new FakeGroupRule([inner])])] });
  scaleBreakpoints();
  assert.equal(text(inner), '(max-width: 608px)');
});

test('a sheet whose cssRules throws is skipped and the rest still scale', () => {
  const rule = new FakeMediaRule('(max-width: 19em)');
  const doc = env({ ios: false, root: 32 });
  doc.styleSheets.push({ get cssRules() { throw new Error('SecurityError'); } },
    { cssRules: [rule] });
  scaleBreakpoints();
  assert.equal(text(rule), '(max-width: 608px)');
});
