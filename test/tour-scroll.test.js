import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* tour.js reaches for the DOM at import time, so this reads the source, the
   way gamemode-open.test.js does. What is pinned is a bug hit on a
   phone on the very first screen of the app. */
const src = readFileSync(new URL('../app/tour.js', import.meta.url), 'utf8');

test('the tour never scrolls the page sideways', () => {
  /* Reported from a phone on step 1 ("Who is here tonight") and step 2 ("How
     the minutes get shared"): the section labels rendered as QUAD, PL, LIN, RO
     and the leftmost player chips were sliced. The spotlight ring was fine --
     `placeTour` clamps it to the viewport and both edges were visible. What had
     moved was the page underneath, 25-35px to the left.

     The cause was `n.scrollIntoView({ block: 'center' })`. `inline` defaults to
     'nearest', which scrolls the *horizontal* axis whenever the anchor does not
     fit across -- proven in Chrome at 390px: with the document 61px wider than
     the viewport, scrollIntoView on the step 1 and step 2 anchors (`#squadFold`,
     `#avail`, `#stratseg`) left `window.scrollX` at 11 while the step 3 anchor
     (`#timeline`, which fits) left it at 0. That is exactly the reported
     signature: steps 1 and 2, never step 3.

     The other suspect -- `.tour-box` overflowing the right edge -- was
     eliminated positively: with the box parked at `left: 900px` inside the
     fixed `.tour`, `documentElement.scrollWidth` stayed 390 and `scrollTo(999)`
     left `scrollX` at 0. A fixed-position overlay cannot make the document
     scroll, so it never could have been this.

     So: the tour scrolls Y by hand and nothing else. Anything reintroducing an
     API that can touch X puts the first-run experience back where it was. */
  assert.doesNotMatch(src, /\.scrollIntoView\(/,
    'scrollIntoView scrolls X as well as Y; the tour must scroll Y by hand');
  assert.doesNotMatch(src, /scrollTo\(\s*[^{]/,
    'the two-argument scrollTo(x, y) can move X too -- pass an options object');
  assert.doesNotMatch(src, /scroll(Left|To)\s*\(\s*\{[^}]*\bleft\b/,
    'no scroll call in the tour may name a horizontal target');
  const calls = src.match(/scrollTo\(\{[^}]*\}\)/g) || [];
  assert.equal(calls.length, 1, 'one scroll, in tourGo');
  assert.match(calls[0], /^scrollTo\(\{ top: /, 'and it is top-only');
});

test('placing the tour stays cheap', () => {
  /* The design note at the top of `placeTour` says it runs on every scroll and
     resize while the tour is up and must stay cheap. Folding the two scroll
     branches into one took the file from three `getBoundingClientRect` calls to
     two: one to place the ring, one to decide where to scroll. Keep it there. */
  const n = (src.match(/\.getBoundingClientRect\(/g) || []).length;
  assert.equal(n, 2, 'two rect reads in the whole file -- one to place, one to scroll');
});
