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

test('CLIP_SWEEP_KNOWN_ISSUES is a non-empty array covering #188', () => {
  assert.ok(Array.isArray(CLIP_SWEEP_KNOWN_ISSUES) && CLIP_SWEEP_KNOWN_ISSUES.length > 0,
    `expected a non-empty array, found ${Array.isArray(CLIP_SWEEP_KNOWN_ISSUES) ? CLIP_SWEEP_KNOWN_ISSUES.length : typeof CLIP_SWEEP_KNOWN_ISSUES}`);
  const issues = CLIP_SWEEP_KNOWN_ISSUES.map(e => e.issue);
  // #187 is fixed (docs/specs/187-today-card-title.md) and its entry
  // removed, not renamed here to another number -- gone, not renumbered.
  for (const n of [188]) {
    assert.ok(issues.includes(n), `expected #${n} among ${JSON.stringify(issues)}`);
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
