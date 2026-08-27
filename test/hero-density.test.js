import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/* The About page's hero card, at both densities.
 *
 * The hero is the first thing on the page and the only figure whose entire
 * point is that the names are legible. It was hand-made and 1x until C3, which
 * is how it drifted into being a THIRD demo roster nobody noticed and how it
 * ended up upscaled ~2x on every retina phone. It now comes out of
 * `node scripts/og.mjs --card`, which writes both densities from one capture.
 *
 * A srcset can rot in ways nothing else here would catch, and the wrong
 * instance is more dangerous than the missing one: regenerate one density and
 * not the other and the page still loads, still validates, and quietly serves a
 * retina reader an image at the wrong scale or the wrong aspect. So the check
 * is on the PIXELS -- the IHDR of both files -- not on the markup alone.
 *
 * `test/sw.test.js` already asserts every precached file exists; this asserts
 * the reverse for these two, because a hero the service worker does not carry
 * is a hero that disappears in the gym. */

const ROOT = new URL('../app/', import.meta.url);
const about = readFileSync(new URL('about.html', ROOT), 'utf8');
const sw = readFileSync(new URL('sw.js', ROOT), 'utf8');

/* PNG: 8 bytes of signature, 8 of chunk header, then width and height as
   big-endian uint32s. Nothing else in the file needs parsing to know the
   dimensions, and the dimensions are the whole claim a srcset makes. */
function pngSize(file) {
  const b = readFileSync(new URL(file, ROOT));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

const hero = about.match(/<img[^>]*srcset=[^>]*>/);

test('the About hero declares both densities', () => {
  assert.ok(hero, 'about.html has no image with a srcset');
  assert.match(hero[0], /srcset="\.\/card-sample\.png 1x, \.\/card-sample@2x\.png 2x"/);
  /* src stays, and stays the 1x: a browser that ignores srcset must still get
     the smaller file, not the bigger one. */
  assert.match(hero[0], /src="\.\/card-sample\.png"/);
});

test('both densities exist and the 2x is exactly twice the 1x', () => {
  for (const f of ['card-sample.png', 'card-sample@2x.png'])
    assert.ok(existsSync(new URL(f, ROOT)), `missing hero asset: ${f}`);
  const one = pngSize('card-sample.png');
  const two = pngSize('card-sample@2x.png');
  assert.equal(two.w, one.w * 2, `2x width is ${two.w}, expected ${one.w * 2}`);
  assert.equal(two.h, one.h * 2, `2x height is ${two.h}, expected ${one.h * 2}`);
});

test('the markup and the CSS cap agree with the 1x native size', () => {
  const one = pngSize('card-sample.png');
  assert.match(hero[0], new RegExp(`width="${one.w}"`), `hero width attribute is not ${one.w}`);
  assert.match(hero[0], new RegExp(`height="${one.h}"`), `hero height attribute is not ${one.h}`);
  /* `.shot img` caps at the native width on purpose -- upscaling a photograph
     of print is the one thing that makes it look worse than it is. */
  const cap = about.match(/\.shot img \{[^}]*max-width:\s*(\d+)px/);
  assert.ok(cap, '.shot img no longer declares a max-width');
  assert.equal(Number(cap[1]), one.w, `.shot img caps at ${cap[1]}px, native is ${one.w}px`);
});

test('the service worker precaches both densities', () => {
  const precache = sw.slice(sw.indexOf('const PRECACHE = ['), sw.indexOf('\n];'));
  for (const f of ['./card-sample.png', './card-sample@2x.png'])
    assert.ok(precache.includes(`'${f}'`), `not precached: ${f}`);
});
