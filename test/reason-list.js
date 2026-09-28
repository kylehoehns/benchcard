/* Shared shape checks for #179's "selector + reason, backed by a real
 * app.css rule" lists — CLIP_SWEEP_ALLOW and CLIP_SWEEP_SIDEWAYS have the
 * exact same shape, keyed off a different CSS rule each (ellipsis vs.
 * sideways scroll) — plus the reason-word-count check CLIP_SWEEP_KNOWN_ISSUES
 * also needs for its own, differently-shaped entries.
 *
 * A plain file straight in test/, not test/helpers/: node --test's default
 * glob runs every .js file under a directory named test regardless of
 * subdirectory, so a module that only exports has to live at this level —
 * `test/state-fixture.js` and `test/dom-stub.js` already use this
 * convention. */
import assert from 'node:assert/strict';

export const assertReasonWords = (reason, label) => {
  const words = reason.trim().split(/\s+/).filter(Boolean);
  assert.ok(words.length >= 3, `${label}'s reason ("${reason}") is only ${words.length} word(s) — want at least a few`);
};

export const assertSelectorReasonShape = list => {
  for (const entry of list) {
    assert.equal(typeof entry.selector, 'string', `entry ${JSON.stringify(entry)} has no string selector`);
    assert.ok(entry.selector.trim().length > 0, `entry ${JSON.stringify(entry)} has a blank selector`);
    assert.equal(typeof entry.reason, 'string', `entry ${JSON.stringify(entry)} has no string reason`);
    assertReasonWords(entry.reason, `"${entry.selector}"`);
  }
};

export const assertNoDuplicateSelectors = (list, listName) => {
  const selectors = list.map(a => a.selector);
  assert.equal(new Set(selectors).size, selectors.length,
    `a selector appears more than once in ${listName}: ${JSON.stringify(selectors)}`);
};
