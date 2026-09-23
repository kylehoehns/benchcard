import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flat, lacks, wrapSafe } from './prose.js';

/* #14. This repo hard-wraps prose at about 78 columns, so a phrase can split
   across two lines. `flat` collapses any run of whitespace -- a line wrap
   included -- to a single space, and `lacks` is the "must not contain" check
   built on top of it: a false `lacks` here is a guard that stayed green over
   a phrase that is still in the tree, just wrapped. */

test('lacks is false when the phrase is present, wrapped across a line break', () => {
  assert.equal(lacks('nothing ever leaves\n   your device', 'leaves your device'), false);
});

test('lacks is true when the phrase is genuinely absent', () => {
  assert.equal(lacks('nothing ever leaves your device', 'stays on your phone'), true);
});

test('a RegExp phrase with a literal space matches across a newline', () => {
  assert.equal(lacks('everything stays on\nyour device', /stays on your device/), false);
});

test('a single-line string behaves like !includes', () => {
  assert.equal(lacks('@media (max-width: 900px) { .x { display: none } }', '@media (max-width: 900px)'), false);
  assert.equal(lacks('@media (max-width: 640px) { .x { display: none } }', '@media (max-width: 900px)'), true);
});

/* #14 review: the space -> \s+ regex-source rewrite was written twice --
   here (via lacks) and in analytics.test.js's own claim(). wrapSafe is the
   one place it lives now; both call it. */
test('wrapSafe turns each literal space in a regex source into \\s+', () => {
  assert.equal(wrapSafe('stays on your device'), 'stays\\s+on\\s+your\\s+device');
});
