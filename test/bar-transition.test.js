import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The Games/Roster swap must not use a View Transition.
 *
 * This file used to pin the workaround. The history is why it now pins the
 * absence: "the bar disappears for a bit" was reported from a phone FOUR
 * times, three different mechanisms were found and correctly fixed, and it
 * still did not look right. The fourth and real one is WebKit's paint order --
 * `::view-transition-group(root)` is painted on top of every named group, so
 * the bar's own snapshot is buried under the page image for the whole 260ms.
 * Working around that took a `clip-path` fed by a `getBoundingClientRect` on
 * every tap, and it could not be generalised to `#actionbar`, which had the
 * identical bug.
 *
 * The API bought exactly one thing: the outgoing view cross-fading out. The
 * incoming view's own `viewIn` animation was never part of it and is what the
 * swap looks like now. Nothing here is a screenshot check, because the bug it
 * guards against was invisible in Chrome and only ever showed on WebKit.
 */

const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');

/* Both files carry a long comment explaining why none of this is here any
   more, and those comments name every construct the tests below ban. Strip
   comments first so the explanation cannot fail its own test. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const cssCode = decomment(css);
const jsCode = decomment(js);

test('setView does not start a View Transition', () => {
  assert.ok(!/startViewTransition/.test(jsCode),
    'render.js is back on the View Transition API -- that is the bug, not a fix for it');
});

test('nothing is named out of a root snapshot any more', () => {
  assert.ok(!/^[^\n{}]*\{[^{}]*view-transition-name/m.test(cssCode),
    'a view-transition-name is declared again; there is no transition for it to take part in');
  assert.ok(!/::view-transition/.test(cssCode),
    'a ::view-transition pseudo-element is styled again');
});

test('the clip-path workaround and its measurement are gone', () => {
  assert.ok(!/--vt-bar/.test(cssCode) && !/--vt-bar/.test(jsCode),
    '--vt-bar is back: layout is being measured on a tap to feed a workaround for a transition we no longer run');
  assert.ok(!/data-vt/.test(cssCode) && !/dataset\.vt|data-vt/.test(jsCode),
    'the data-vt attribute is back on <html>');
});

test('the bar keeps its glass, unconditionally', () => {
  /* The old fix flattened the bar to an opaque `var(--bg)` for the duration of
     the transition, because a translucent element leaning on backdrop-filter
     is what no engine could snapshot correctly. Nothing snapshots it now, so
     the glass is never switched off -- and no rule may switch it off. */
  assert.match(css, /\.bar\s*\{[\s\S]*?backdrop-filter:\s*saturate\(180%\) blur\(24px\)/,
    'the resting bar lost its blur');
  assert.ok(!/\.bar\s*\{[^}]*backdrop-filter:\s*none/.test(cssCode),
    'something still turns the bar\'s backdrop-filter off');
});

test('the incoming view is still the whole transition', () => {
  /* Losing the outgoing cross-fade is the point. Losing this too would make
     the swap a hard cut. */
  assert.match(css, /\.view\s*\{\s*animation:\s*viewIn\b/,
    'the incoming view no longer animates -- the swap is a hard cut');
  assert.match(css, /@keyframes viewIn\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY/,
    'viewIn no longer fades and rises');
});

test('a view switch goes back to the top, instantly', () => {
  /* Games and Roster are two unrelated pages. Preserving scroll across them
     can land a coach who was down at the timeline past the end of a shorter
     view. Instant, not smooth: a smooth scroll racing the fade is a new thing
     to debug, and instant is also the correct reduced-motion behaviour. */
  assert.match(js, /window\.scrollTo\(0,\s*0\)/,
    'a view switch no longer scrolls to the top');
  assert.ok(!/scrollTo\(\{[^)]*behavior:\s*['"]smooth/.test(jsCode),
    'the view switch scrolls smoothly, which races the incoming view\'s fade');
  const fn = js.slice(js.indexOf('export function setView'), js.indexOf('function applyView'));
  assert.match(fn, /if\s*\(!instant\s*&&\s*from\s*&&\s*from\s*!==\s*v\)\s*window\.scrollTo\(0,\s*0\)/,
    'the scroll is not gated on an actual view change made with motion -- boot and print must not scroll');
});
