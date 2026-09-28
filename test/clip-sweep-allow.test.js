/* #179 "What would settle it" item 3: the allow list is a named export, one
 * entry per selector, each with a reason of at least a few words — this is
 * the shape half of that item; whether an entry is actually needed (a stale
 * entry fails the check) is proven at the other seam, `clipSweepPass` itself
 * (`node scripts/smoke.mjs --only clipsweep`), not here — this file cannot
 * run a browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_SWEEP_ALLOW } from '../scripts/smoke/clip-sweep.mjs';
import { assertSelectorReasonShape, assertNoDuplicateSelectors } from './reason-list.js';

test('CLIP_SWEEP_ALLOW is a non-empty array of the harness\'s real allow-list entries', () => {
  // Rule 2a: a check that measured nothing must fail, not pass vacuously —
  // the survey behind #179 found about 15 such rules in app.css, so a count
  // near zero means the export moved or emptied out, not that nothing needs
  // an entry.
  assert.ok(Array.isArray(CLIP_SWEEP_ALLOW) && CLIP_SWEEP_ALLOW.length >= 5,
    `expected at least 5 entries in CLIP_SWEEP_ALLOW, found ` +
    `${Array.isArray(CLIP_SWEEP_ALLOW) ? CLIP_SWEEP_ALLOW.length : typeof CLIP_SWEEP_ALLOW}`);
});

test('every entry has a non-empty selector and a reason of at least a few words', () => {
  assertSelectorReasonShape(CLIP_SWEEP_ALLOW);
});

test('no selector is listed twice', () => {
  assertNoDuplicateSelectors(CLIP_SWEEP_ALLOW, 'CLIP_SWEEP_ALLOW');
});
