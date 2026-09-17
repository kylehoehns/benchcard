import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { functionBody } from './js-comments.js';

/* #72: the row itself stopped being the control -- a player's name is now a
   real `<button type="button" class="tl-name">`, so Enter/Space/click all
   come from native button semantics instead of a hand-rolled onkeydown, and
   a screen reader announces a button rather than a generic group. The row
   keeps `.pin` and the hover dimming, nothing else.

   `renderTimeline` reaches through `card.js`, `game-setup.js`, `fx.js` and
   `icons.js` to a live DOM (FLIP animation, canvas measurement, popovers);
   building a stub deep enough to import it, the way `test/timeline-
   names.test.js` already found for this exact module, is not a seam this
   ticket can stand up. So this reads the source the same way that file does
   -- a named guard, not a behavior test -- and is falsified the same way:
   the row-building loop and the per-render write loop are read out of
   `renderTimeline`'s own body with `functionBody`, which is brace-matched
   rather than string-sliced, so a mutation that moves code between the two
   loops is still caught reading the loop it actually landed in. */
const src = readFileSync(new URL('../app/timeline.js', import.meta.url), 'utf8');
const body = functionBody(src, 'renderTimeline');

test('the row itself carries no role, tabindex or click handler', () => {
  assert.doesNotMatch(body, /\brow\.setAttribute\(\s*['"]role['"]/,
    'the row must not be given role="button" -- the name button is the control now');
  assert.doesNotMatch(body, /\brow\.tabIndex/,
    'the row must not be made focusable -- tab lands on the name button instead');
  assert.doesNotMatch(body, /\brow\.onclick/,
    'the row must not carry a click handler -- tapping pins through the name button');
  assert.doesNotMatch(body, /\brow\.onkeydown/,
    'the row must not carry a keydown handler -- a native button gets Enter/Space for free');
});

test('a real button.tl-name is built with the row, and carries aria-expanded', () => {
  assert.match(body, /el\(\s*['"]button['"]\s*,\s*['"]tl-name['"]/,
    'the label must be built as `el(\'button\', \'tl-name\')`, once with the row');
  assert.match(body, /\.setAttribute\(\s*['"]aria-expanded['"]/,
    'something in renderTimeline must set aria-expanded on the per-render write loop');
  // it must be the NAME button carrying it, not the row -- row.setAttribute
  // is asserted absent above, so any aria-expanded write left standing here
  // has nowhere else to land.
});

// #29 decision 7: the blocked branch no longer carries its own fixed wording
// ("No rotation yet. Resolve the errors below.") -- it reads the reason from
// the engine's own first error through `blockedFix` (state.js), so the one
// heading pinned here is the only text this branch still owns; the message
// itself is `blocked-fix.test.js`'s seam, not this one's.
test('the blocked heading reads "This plan can\'t be built" and reads the reason from blockedFix', () => {
  const empty = functionBody(src, 'timelineEmpty');
  assert.match(empty, /This plan can't be built/,
    'the blocked heading must read "This plan can\'t be built"');
  assert.match(empty, /\bblockedFix\(/,
    'the reason must come from blockedFix, not a wording fixed here');
  assert.doesNotMatch(empty, /No rotation yet\. Resolve the errors (above|below)\./,
    'the old fixed wording must not still be present');
});
