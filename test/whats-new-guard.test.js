import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems, coachFacing, hasOptOut } from '../scripts/check-whats-new.mjs';

/* The pure decision behind `scripts/check-whats-new.mjs` (#499): a PR that
 * changes something a coach can see must add a What's new entry, or say in
 * one line why not. No git here; the script's header says why the rest is a
 * CI history step. */

const ENTRY = { date: '2026-11-02', text: 'A new thing a coach can see.' };
const OTHER = { date: '2026-11-01', text: 'An older thing.' };

test('coach-facing is anything under app/ except the plumbing', () => {
  for (const p of ['app/about.html', 'app/app.css', 'app/toast.js', 'app/index.html', 'app/vendor/lib.js',
    'app/6-player-basketball-rotation-chart.html']) {
    assert.equal(coachFacing(p), true, p);
  }
  for (const p of ['app/sw.js', 'app/_headers', 'app/robots.txt', 'app/sitemap.xml', 'app/whats-new.html',
    'app/vendor/fetch.sh', 'app/vendor/README.md',
    'scripts/whats-new.json', 'test/coach.js', 'docs/x.md', 'package.json']) {
    assert.equal(coachFacing(p), false, p);
  }
});

test('no coach-facing path in the diff: nothing to say', () => {
  assert.deepEqual(problems(['app/sw.js', 'test/x.test.js', 'scripts/a.mjs'], [OTHER], [OTHER], []), []);
  assert.deepEqual(problems([], [], [], []), []);
});

test('a coach-facing change with no new entry and no opt-out fails, saying what to do', () => {
  const found = problems(['app/about.html'], [OTHER], [OTHER], []);
  assert.equal(found.length, 1);
  assert.match(found[0], /app\/about\.html/);
  assert.match(found[0], /npm run whats-new/);
  assert.match(found[0], /No coach note: <reason>/);
});

test('a new entry in the head, by text, passes', () => {
  assert.deepEqual(problems(['app/about.html'], [OTHER], [ENTRY, OTHER], []), []);
});

test('an edited entry counts as new text; a reordered or removed one does not', () => {
  assert.deepEqual(problems(['app/about.html'], [OTHER], [{ ...OTHER, text: 'Reworded.' }], []), []);
  assert.equal(problems(['app/about.html'], [ENTRY, OTHER], [OTHER, ENTRY], []).length, 1);
  assert.equal(problems(['app/about.html'], [ENTRY, OTHER], [OTHER], []).length, 1);
});

test('a base without the file counts as empty', () => {
  assert.deepEqual(problems(['app/about.html'], [], [ENTRY], []), []);
  assert.equal(problems(['app/about.html'], [], [], []).length, 1);
});

test('the opt-out is a line starting No coach note: with a reason, in any message', () => {
  assert.equal(hasOptOut('Fixes a thing.\n\nNo coach note: harness only\n'), true);
  assert.equal(hasOptOut('No coach note:harness'), true);
  assert.equal(hasOptOut('Intro\nNo coach note:   internal refactor'), true);
  assert.equal(hasOptOut('No coach note:'), false);
  assert.equal(hasOptOut('No coach note:   \n'), false);
  assert.equal(hasOptOut('We said No coach note: harness in the middle of a line'), false);
  assert.equal(hasOptOut(''), false);
  assert.equal(hasOptOut(undefined), false);
  assert.deepEqual(problems(['app/about.html'], [OTHER], [OTHER], ['x', 'No coach note: copy fix']), []);
  assert.equal(problems(['app/about.html'], [OTHER], [OTHER], ['No coach note:']).length, 1);
});
