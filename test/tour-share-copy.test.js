import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* #257 (docs/specs/257-hand-off-door.md, item G): the tour's step on
   `#shareBtn` names the hand-off, because that one button now opens the sheet
   that prints the card, shares it as an image, or hands the game to an
   assistant. tour.js touches the DOM at import time, so the step's body is
   read from the source the way `tour-anchors.test.js` reads it. The step is
   found by its anchor, and the test fails if it is not found at all. */
const SRC = readFileSync(new URL('../app/tour.js', import.meta.url), 'utf8');

function bodyOf(anchor) {
  const at = SRC.indexOf(`sel: ['${anchor}']`);
  if (at < 0) return null;
  const m = /body:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(SRC.slice(at));
  return m ? m[2] : null;
}

test('the #shareBtn tour step names the hand-off as well as print and image', () => {
  const body = bodyOf('#shareBtn');
  assert.ok(body, 'no tour step anchored on #shareBtn');
  assert.match(body, /hand/i, `the step reads: ${body}`);
  assert.match(body, /prints the card/i, `the step reads: ${body}`);
  assert.match(body, /image/i, `the step reads: ${body}`);
});
