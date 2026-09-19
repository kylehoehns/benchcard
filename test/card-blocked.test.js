import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { functionBody } from './js-comments.js';

/* card.js reaches through a live DOM the way timeline.js does (fitPreview,
   canvas measurement) -- test/timeline-name-button.test.js's own comment
   explains why building a stub deep enough to import either is not a seam
   this repo has. So this reads the source the same way: a named guard, not
   a behavior test, falsified by mutating the source back to what it read
   before the fix and watching the assertion catch it. */
const src = readFileSync(new URL('../app/card.js', import.meta.url), 'utf8');

// #29 fix pass finding 7: the card sheet's own blocked preview shares
// state.js's one BLOCKED_TITLE rather than carrying its own copy of the
// literal. #36 moved the body this pins into `cardPreviewInto` --
// `refreshCardSheetPreview` is a thin wrapper now (`cardPreviewInto($('#sheetCardPreview'))`)
// so #36's step 3 (`#frStage`) can share the same blocked branch instead of a
// second copy of it.
test('cardPreviewInto reads BLOCKED_TITLE, not its own copy of the literal', () => {
  const body = functionBody(src, 'cardPreviewInto');
  assert.match(body, /\bBLOCKED_TITLE\b/,
    'cardPreviewInto must read BLOCKED_TITLE (state.js), not a wording fixed here');
  assert.doesNotMatch(body, /This plan can't be built/,
    'the literal must not still be typed out in cardPreviewInto');
});

test('BLOCKED_TITLE is imported from state.js', () => {
  assert.match(src, /import\s*\{[^}]*\bBLOCKED_TITLE\b[^}]*\}\s*from\s*['"]\.\/state\.js['"]/,
    'card.js must import BLOCKED_TITLE from state.js alongside blockedFix');
});

// #29 fix pass finding 6: renderCards's blocked branch used to re-derive the
// first error by hand instead of reusing blockedFix, four lines from where
// refreshCardSheetPreview already calls it.
test("renderCards's blocked branch reuses blockedFix instead of re-deriving the first error", () => {
  const body = functionBody(src, 'renderCards');
  assert.doesNotMatch(body, /issues\.find\(\s*i\s*=>\s*i\.severity\s*===\s*['"]error['"]\s*\)/,
    'renderCards must not re-derive the first error by hand -- call blockedFix instead');
  assert.match(body, /\bblockedFix\(/,
    'renderCards\'s blocked branch must call blockedFix, matching refreshCardSheetPreview');
});
