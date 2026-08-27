import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Google showed a generic globe for benchcard.app because the only icon the
 * markup declared was a `data:` URI, which its favicon crawler cannot fetch,
 * and /favicon.ico 404'd.
 *
 * The fix has two halves that pull against each other, and each half has an
 * obvious-looking "cleanup" that would undo it:
 *   - favicon.ico is referenced by nothing, so it reads as dead weight. It is
 *     not: it is the only thing a crawler can fetch.
 *   - the data URI looks like a candidate for "just point it at the file",
 *     which would cost a request on every cold start. The request budget is
 *     pinned deliberately tight, so that is not free.
 */

const url = p => new URL('../app/' + p, import.meta.url);
const index = readFileSync(url('index.html'), 'utf8');
const about = readFileSync(url('about.html'), 'utf8');

test('a real favicon.ico is shipped at the root, square and a multiple of 48', () => {
  const ico = readFileSync(url('favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0, 'not an ICO: reserved field is not zero');
  assert.equal(ico.readUInt16LE(2), 1, 'not an ICO: type is not 1 (icon)');
  const count = ico.readUInt16LE(4);
  assert.ok(count >= 1, 'the ICO declares no images');
  for (let i = 0; i < count; i++) {
    const d = 6 + i * 16;
    /* 0 means 256 in the ICO directory; nothing here is that big. */
    const w = ico[d] || 256, h = ico[d + 1] || 256;
    assert.equal(w, h, `entry ${i} is ${w}x${h}, not square`);
    assert.equal(w % 48, 0, `entry ${i} is ${w}px; Google asks for a multiple of 48`);
    const size = ico.readUInt32LE(d + 8), off = ico.readUInt32LE(d + 12);
    assert.ok(off + size <= ico.length, `entry ${i} points past the end of the file`);
  }
});

test('the markup icon stays a data URI, so the page still costs no icon request', () => {
  for (const [name, html] of [['index.html', index], ['about.html', about]]) {
    const links = [...html.matchAll(/<link[^>]+rel="icon"[^>]*>/g)].map(m => m[0]);
    assert.equal(links.length, 1, `${name} declares ${links.length} rel="icon" links, not 1`);
    assert.match(links[0], /href="data:image\/svg\+xml,/,
      `${name}'s icon now points at a file — that is a fetch on every cold start`);
  }
});

test('nothing fetches favicon.ico at load, and the crawler is not blocked from it', () => {
  for (const [name, html] of [['index.html', index], ['about.html', about]]) {
    assert.ok(!html.includes('favicon.ico"'), `${name} references favicon.ico and would fetch it`);
  }
  const robots = readFileSync(url('robots.txt'), 'utf8');
  assert.ok(!/^\s*Disallow:\s*\S/m.test(robots), 'robots.txt disallows something and may hide the icon');
  /* Precaching it would put 2.7KB on every install for a file the app never
     asks for. It is deliberately out of the list. */
  assert.ok(!readFileSync(url('sw.js'), 'utf8').includes('favicon.ico'),
    'favicon.ico is precached; nothing at runtime ever requests it');
});
