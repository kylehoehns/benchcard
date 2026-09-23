import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from './state-fixture.js';

/* #101 item 4: the heading Today gives each day it stacks, shared with the
 * game screen's own `#gameSub` lead-in (Design section). "Today" is
 * injectable -- every test below pins the clock to 2026-09-28 (a Monday),
 * the same day `test/season.test.js`'s filing tests pin, so a real calendar
 * (never a hand-picked date that happens to match the prose) decides which
 * label each date gets. `2026-09-29` is the next day (Tuesday, "Tomorrow");
 * `2026-10-03` is a real Saturday, so its weekday label is not asserted by
 * eye but read off the same clock. */
const TODAY = new Date(2026, 8, 28); // 2026-09-28, Monday

test('dayHeading names the pinned today "Today"', () => {
  assert.equal(S.dayHeading({ date: '2026-09-28', name: '' }, TODAY), 'Today');
});

test('dayHeading names the day after today "Tomorrow"', () => {
  assert.equal(S.dayHeading({ date: '2026-09-29', name: '' }, TODAY), 'Tomorrow');
});

test('dayHeading names any other date by the phone\'s short weekday, month and day', () => {
  assert.equal(S.dayHeading({ date: '2026-10-03', name: '' }, TODAY), 'Sat, Oct 3');
});

test('a named day appends " · <name>" to whichever label applies', () => {
  assert.equal(S.dayHeading({ date: '2026-09-28', name: 'Tournament' }, TODAY), 'Today · Tournament');
  assert.equal(S.dayHeading({ date: '2026-10-03', name: 'Tournament' }, TODAY), 'Sat, Oct 3 · Tournament');
});
