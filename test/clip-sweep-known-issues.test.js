/* #179 Task 2: a "known issues" list beside CLIP_SWEEP_ALLOW — filed, real
 * bugs the LONG_AND_SQUEEZE fixture also happens to trip, excused by number
 * so the check can still catch anything new. This file proves the export's
 * shape (one entry per issue, each with a match function and a reason); that
 * an entry actually excuses the exact problem it names, and that a stale
 * entry (never matched) fails the run, are both proven at the other seam,
 * `clipSweepPass` itself (`node scripts/smoke.mjs --only clipsweep`), not
 * here — this file cannot run a browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_SWEEP_KNOWN_ISSUES } from '../scripts/smoke/clip-sweep.mjs';
import { assertReasonWords } from './reason-list.js';

test('CLIP_SWEEP_KNOWN_ISSUES is an array with none of the fixed issues left in it', () => {
  assert.ok(Array.isArray(CLIP_SWEEP_KNOWN_ISSUES),
    `expected an array, found ${typeof CLIP_SWEEP_KNOWN_ISSUES}`);
  const issues = CLIP_SWEEP_KNOWN_ISSUES.map(e => e.issue);
  // Every issue this list was made for is fixed and its entry removed, so
  // the list may be empty. A stale entry fails `clipSweepPass` itself,
  // which is what proves each fix; this only keeps a fixed one from coming
  // back under the same number.
  for (const n of [187, 188, 189, 190, 191, 197, 198, 221]) {
    assert.ok(!issues.includes(n), `#${n} is fixed; its entry should be removed, not present: ${JSON.stringify(issues)}`);
  }
});

test('every entry has an issue number, a match function and a reason of at least a few words', () => {
  for (const entry of CLIP_SWEEP_KNOWN_ISSUES) {
    assert.equal(typeof entry.issue, 'number', `entry ${JSON.stringify(entry)} has no numeric issue`);
    assert.equal(typeof entry.match, 'function', `#${entry.issue} has no match function`);
    assert.equal(typeof entry.reason, 'string', `#${entry.issue} has no string reason`);
    assertReasonWords(entry.reason, `#${entry.issue}`);
  }
});

test('no issue number is listed twice', () => {
  const issues = CLIP_SWEEP_KNOWN_ISSUES.map(e => e.issue);
  assert.equal(new Set(issues).size, issues.length,
    `an issue number appears more than once in CLIP_SWEEP_KNOWN_ISSUES: ${JSON.stringify(issues)}`);
});
