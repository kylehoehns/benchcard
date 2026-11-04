/* #611: `scaleEm`, the pure half of app/text-size.js, at the seam the spec's
 * Proof names. An `em` in a media query is the browser's default size, never
 * the root's, so a root grown to 32px leaves `(max-width: 19em)` at 304px.
 * `scaleEm` turns each `<n>em` into px at the root's size. Expected strings
 * are worked by hand: 19 x 16 x 2 = 608, 18 x 17 x 2 = 612. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scaleEm } from '../app/text-size.js';

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
