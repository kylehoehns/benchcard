/* #179 fix 1: a scroll container (overflow-x auto/scroll) is a clip boundary
 * now, except the few boxes built to scroll sideways on purpose — this list
 * excuses those, the same "stale entry fails" shape CLIP_SWEEP_ALLOW already
 * uses. This file proves the export's own shape; that an entry is actually
 * exercised (a stale entry fails the run) is proven at the other seam,
 * `clipSweepPass` itself (`node scripts/smoke.mjs --only clipsweep`), not
 * here — this file cannot run a browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_SWEEP_SIDEWAYS } from '../scripts/smoke/clip-sweep.mjs';
import { assertSelectorReasonShape, assertNoDuplicateSelectors, assertSelectorsInCss } from './reason-list.js';

test('CLIP_SWEEP_SIDEWAYS is a non-empty array', () => {
  assert.ok(Array.isArray(CLIP_SWEEP_SIDEWAYS) && CLIP_SWEEP_SIDEWAYS.length > 0,
    `expected a non-empty array, found ${Array.isArray(CLIP_SWEEP_SIDEWAYS) ? CLIP_SWEEP_SIDEWAYS.length : typeof CLIP_SWEEP_SIDEWAYS}`);
});

test('every entry has a non-empty selector and a reason of at least a few words', () => {
  assertSelectorReasonShape(CLIP_SWEEP_SIDEWAYS);
});

test('no selector is listed twice', () => {
  assertNoDuplicateSelectors(CLIP_SWEEP_SIDEWAYS, 'CLIP_SWEEP_SIDEWAYS');
});

test('every sideways-scroll selector names a box that actually scrolls sideways in app/app.css', () => {
  // Not a re-derivation of the browser check (that reads computed style and
  // an actual run's own overflow) — this only guards against an entry whose
  // selector has no overflow-x: auto/scroll rule backing it at all, e.g. a
  // typo or a rule that moved.
  assertSelectorsInCss(CLIP_SWEEP_SIDEWAYS, 'CLIP_SWEEP_SIDEWAYS');
});
