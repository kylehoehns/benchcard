import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markSvg } from '../scripts/mark.mjs';

/* The card mark (#284, was #277): one drawing, defined in scripts/mark.mjs, that every
   other surface gets. The expected values below are the spec's geometry
   (docs/specs/284-three-bar-mark.md), typed out, not recomputed from the code. */

const HUES = ['#C0504D', '#C9762F', '#2E8A7A'];
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

test('the card is light, 66 by 80, and tilted -8 degrees about (50, 50)', () => {
  const svg = markSvg(64);
  const card = rects(svg).find(r => fillOf(r) === '#F4F4F6');
  assert.ok(card, 'no #F4F4F6 card rect');
  assert.deepEqual([attr(card, 'x'), attr(card, 'y'), attr(card, 'width'), attr(card, 'height'), attr(card, 'rx')],
    [17, 10, 66, 80, 9]);
  assert.match(svg, /rotate\(-8 50 50\)/);
});

test('three bars, one hue each in order, four stints, and no row tracks (#284)', () => {
  const all = rects(markSvg(64));
  assert.ok(!all.some(r => fillOf(r).toUpperCase() === '#E4DED7'), 'a #E4DED7 track is still drawn');
  const stints = all.filter(r => HUES.includes(fillOf(r).toUpperCase()));
  assert.deepEqual(stints.map(fillOf), [HUES[0], HUES[1], HUES[2], HUES[2]]);
  assert.equal(all.length, 2 + 4, 'ground, card and four stints, nothing else');
  const want = [[26, 33.6, 24], [40.4, 33.6, 44], [26, 21.6, 64], [59.6, 14.4, 64]];
  stints.forEach((s, i) => {
    assert.ok(Math.abs(attr(s, 'x') - want[i][0]) < 1e-6, `stint ${i} x ${attr(s, 'x')}, want ${want[i][0]}`);
    assert.ok(Math.abs(attr(s, 'width') - want[i][1]) < 1e-6, `stint ${i} width ${attr(s, 'width')}, want ${want[i][1]}`);
    assert.equal(attr(s, 'y'), want[i][2], `stint ${i} y`);
    assert.equal(attr(s, 'height'), 11, `stint ${i} height`);
    assert.equal(attr(s, 'rx'), 5.5, `stint ${i} rx`);
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
