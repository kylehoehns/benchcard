import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markSvg } from '../scripts/mark.mjs';

/* The card mark (#277): one drawing, defined in scripts/mark.mjs, that every
   other surface gets. The expected values below are the spec's geometry
   (docs/specs/277-card-mark.md), typed out, not recomputed from the code. */

const HUES = ['#C0504D', '#C9762F', '#A8952E', '#5E8A3A', '#2E8A7A'];
const attr = (tag, name) => Number(tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1]);
const rects = svg => [...svg.matchAll(/<rect\b[^>]*>/g)].map(m => m[0]);
const fillOf = tag => tag.match(/fill="([^"]+)"/)?.[1];

test('the mark is a 100-unit square on the orange ground', () => {
  const svg = markSvg(64);
  assert.match(svg, /^<svg\b[^>]*viewBox="0 0 100 100"/);
  assert.match(svg, /width="64"/);
  const ground = rects(svg)[0];
  assert.equal(fillOf(ground), '#D2500A');
  assert.equal(attr(ground, 'width'), 100);
  assert.equal(attr(ground, 'height'), 100);
});

test('the card is light, 50 by 68, and tilted -8 degrees about (50, 52)', () => {
  const svg = markSvg(64);
  const card = rects(svg).find(r => fillOf(r) === '#F4F4F6');
  assert.ok(card, 'no #F4F4F6 card rect');
  assert.deepEqual([attr(card, 'x'), attr(card, 'y'), attr(card, 'width'), attr(card, 'height'), attr(card, 'rx')],
    [25, 17, 50, 68, 6]);
  assert.match(svg, /rotate\(-8 50 52\)/);
});

test('five rows, one hue each in order, with the stints the sketch drew', () => {
  const all = rects(markSvg(64));
  const tracks = all.filter(r => fillOf(r) === '#E4DED7');
  assert.equal(tracks.length, 5);
  tracks.forEach((t, i) => {
    assert.deepEqual([attr(t, 'x'), attr(t, 'y'), attr(t, 'width'), attr(t, 'height'), attr(t, 'rx')],
      [31, 27 + 11 * i, 38, 6, 3], `track ${i}`);
  });
  const stints = all.filter(r => HUES.includes(fillOf(r).toUpperCase()));
  assert.deepEqual(stints.map(fillOf), HUES.flatMap(h => [h, h]));
  const want = [[31, 11.4], [51.9, 10.26], [37.84, 11.4], [57.6, 11.4], [31, 6.84],
    [45.44, 10.64], [42.4, 10.64], [62.16, 6.84], [31, 8.36], [49.24, 10.64]];
  stints.forEach((s, i) => {
    assert.ok(Math.abs(attr(s, 'x') - want[i][0]) < 1e-6, `stint ${i} x ${attr(s, 'x')}, want ${want[i][0]}`);
    assert.ok(Math.abs(attr(s, 'width') - want[i][1]) < 1e-6, `stint ${i} width ${attr(s, 'width')}, want ${want[i][1]}`);
    assert.equal(attr(s, 'y'), 27 + 11 * Math.floor(i / 2), `stint ${i} y`);
  });
});

test('the shadow is opt-in: dy 2, deviation 2.2, black at .28', () => {
  assert.ok(!/filter/i.test(markSvg(64)), 'the default mark carries a shadow filter');
  const svg = markSvg(64, { shadow: true });
  assert.match(svg, /<feDropShadow[^>]*dx="0"[^>]*dy="2"[^>]*stdDeviation="2\.2"[^>]*flood-color="#000"[^>]*flood-opacity="\.28"/);
});

test('the ground is square by default and a rounded square on request, never a circle', () => {
  assert.equal(attr(rects(markSvg(64))[0], 'rx'), NaN);
  const rounded = rects(markSvg(64, { rounded: true }))[0];
  assert.ok(attr(rounded, 'rx') > 0 && attr(rounded, 'rx') < 50, `rx ${attr(rounded, 'rx')}`);
  assert.ok(!/<circle/.test(markSvg(64, { rounded: true })));
});

test('a header logo can be hidden from assistive tech', () => {
  assert.ok(!/aria-hidden/.test(markSvg(26)));
  assert.match(markSvg(26, { ariaHidden: true }), /<svg[^>]* aria-hidden="true"/);
});

test('a ground option recolors the ground only; the card and rows keep their hex', () => {
  const svg = markSvg(26, { ground: 'var(--tint)' });
  assert.equal(fillOf(rects(svg)[0]), 'var(--tint)');
  assert.ok(rects(svg).some(r => fillOf(r) === '#F4F4F6'), 'card lost its fill');
  assert.ok(!svg.includes('#D2500A'), 'the default orange is still in the markup');
});
