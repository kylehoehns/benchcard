import { test } from 'node:test';
import assert from 'node:assert/strict';

/* `balance.js` reaches for a document at import time (dom.js keeps a canvas,
   state.js and fx.js bind listeners), so the same stub `season-view.test.js`
   uses stands in. Nothing below renders: `levelFromKey` is pure arithmetic. */
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });
const { levelFromKey } = await import('../app/balance.js');

/* The roster's level meter is five `<button role="radio">` inside a
 * `role="radiogroup"`, and until 2026-08-25 it wore those roles without
 * implementing the contract. Measured in a browser on the rich fixture:
 * focusing the "Star" step on a tier-3 player and pressing Enter left
 * `aria-checked` false, the tier at 3 and the label at "Rotation"; Space did
 * the same; and ArrowRight committed tier 4 while focus stayed on step 5, so a
 * screen reader announced "Star, not selected" over a meter reading
 * "Reliable".
 *
 * This pins the decision half. It deliberately exercises the function rather
 * than grepping `balance.js` for the key names: a source-text guard anchored
 * on a name in this repo has twice been satisfied by a comment that mentions
 * it. The DOM half — roving tabindex, and focus following the selection — is
 * three lines beside this one and is verified in the browser.
 *
 * `focused` is the level of the button the user is standing on, NOT the stored
 * tier. That distinction is the bug: stepping from the stored tier is what let
 * focus and selection drift apart. */

test('Space and Enter select the step the user is focused on', () => {
  for (const key of [' ', 'Enter']) {
    for (const focused of [1, 2, 3, 4, 5]) {
      assert.equal(levelFromKey(key, focused), focused,
        `${JSON.stringify(key)} on step ${focused} must commit that step. `
        + 'Doing nothing is the defect this test exists for.');
    }
  }
});

test('the arrows step away from the focused level, not the stored one', () => {
  assert.equal(levelFromKey('ArrowRight', 2), 3);
  assert.equal(levelFromKey('ArrowUp', 2), 3);
  assert.equal(levelFromKey('ArrowLeft', 4), 3);
  assert.equal(levelFromKey('ArrowDown', 4), 3);
});

test('the arrows clamp at both ends instead of wrapping', () => {
  // wrapping would turn "hold right" into a silent reset to Developing
  assert.equal(levelFromKey('ArrowRight', 5), 5);
  assert.equal(levelFromKey('ArrowUp', 5), 5);
  assert.equal(levelFromKey('ArrowLeft', 1), 1);
  assert.equal(levelFromKey('ArrowDown', 1), 1);
});

test('a key the meter does not own is handed back, not swallowed', () => {
  // null is what stops the handler calling preventDefault: Tab has to keep
  // moving, and `?` still has to open the help sheet from inside the meter.
  for (const key of ['Tab', 'Escape', 'a', '?', 'Home', 'End', 'PageUp']) {
    assert.equal(levelFromKey(key, 3), null,
      `${JSON.stringify(key)} is not this control's key and must fall through.`);
  }
});
