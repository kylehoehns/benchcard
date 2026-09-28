/* #204 "What would settle it" item 6: the new "text paints past its own box"
 * floor check gets its own allow list, scoped to that one finding kind (the
 * `h2.flow-q` headings in Add a game run into the side margin but stay
 * readable and whole) — the same "selector + reason, one entry, stale entry
 * fails" shape `CLIP_SWEEP_ALLOW` and `CLIP_SWEEP_SIDEWAYS` already use. This
 * file proves the export's own shape; that an entry is actually exercised (a
 * stale entry fails the run) is proven at the other seam, `clipSweepPass`
 * itself (`node scripts/smoke.mjs --only "no cut-off text at 320px/32px
 * text"`), not here — this file cannot run a browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_SWEEP_FLOOR_ALLOW } from '../scripts/smoke/clip-sweep.mjs';
import { assertSelectorReasonShape, assertNoDuplicateSelectors } from './reason-list.js';

test('CLIP_SWEEP_FLOOR_ALLOW is a non-empty array', () => {
  assert.ok(Array.isArray(CLIP_SWEEP_FLOOR_ALLOW) && CLIP_SWEEP_FLOOR_ALLOW.length > 0,
    `expected a non-empty array, found ${Array.isArray(CLIP_SWEEP_FLOOR_ALLOW) ? CLIP_SWEEP_FLOOR_ALLOW.length : typeof CLIP_SWEEP_FLOOR_ALLOW}`);
});

test('every entry has a non-empty selector and a reason of at least a few words', () => {
  assertSelectorReasonShape(CLIP_SWEEP_FLOOR_ALLOW);
});

test('no selector is listed twice', () => {
  assertNoDuplicateSelectors(CLIP_SWEEP_FLOOR_ALLOW, 'CLIP_SWEEP_FLOOR_ALLOW');
});
