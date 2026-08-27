import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDateline, humanize, problems } from '../scripts/check-about-date.mjs';

/* The dateline in About's footer, and the guard that keeps it from going
 * stale. See the header of `scripts/check-about-date.mjs` for why the guard
 * itself lives in a script with its own CI job rather than in here: the
 * mistake exists only in the diff between two commits, and the `tests` job
 * checks out at depth 1.
 *
 * What IS testable here, with no git and no network, is the whole decision --
 * `problems()` is pure -- plus the one fact about the shipped page that has to
 * hold: the footer actually carries a dateline this thing can read. */

const html = readFileSync(new URL('../app/about.html', import.meta.url), 'utf8');
const PAGE = 'app/about.html';

test('the shipped about.html carries a readable dateline', () => {
  const line = parseDateline(html);
  assert.ok(line, 'about.html footer must carry a <time datetime="YYYY-MM-DD">');
  assert.match(line.iso, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(line.human, humanize(line.iso),
    'the datetime attribute and the visible prose must denote the same day');
  assert.deepEqual(problems([], null, line, line.iso), []);
});

test('humanize writes the form the footer uses', () => {
  assert.equal(humanize('2026-08-24'), '24 August 2026');
  assert.equal(humanize('2026-01-01'), '1 January 2026');
  assert.equal(humanize('2025-12-09'), '9 December 2025');
});

test('a footer with no time element is unreadable, not silently fine', () => {
  assert.equal(parseDateline('<footer><span>Last updated ages ago</span></footer>'), null);
  const found = problems([PAGE], null, null, '2026-08-24');
  assert.equal(found.length, 1);
  assert.match(found[0], /no parseable dateline/);
});

/* THE GUARD'S REASON FOR EXISTING. Everything else here is scaffolding. */
test('about.html changing without the dateline changing is caught', () => {
  const same = { iso: '2026-08-01', human: '1 August 2026' };
  const found = problems([PAGE, 'app/app.js'], same, same, '2026-08-24');
  assert.equal(found.length, 1);
  assert.match(found[0], /changed but the dateline is still 2026-08-01/);
});

test('about.html changing WITH the dateline changing is fine', () => {
  const found = problems(
    [PAGE],
    { iso: '2026-08-01', human: '1 August 2026' },
    { iso: '2026-08-24', human: '24 August 2026' },
    '2026-08-24',
  );
  assert.deepEqual(found, []);
});

test('a diff that does not touch about.html demands nothing', () => {
  const same = { iso: '2026-08-01', human: '1 August 2026' };
  assert.deepEqual(problems(['app/app.js', 'README.md'], same, same, '2026-08-24'), []);
});

test('the two halves of the line are not allowed to disagree', () => {
  const found = problems([], null, { iso: '2026-08-24', human: '3 April 2026' }, '2026-08-24');
  assert.equal(found.length, 1);
  assert.match(found[0], /disagree/);
});

test('a dateline cannot go backwards', () => {
  const found = problems(
    [PAGE],
    { iso: '2026-08-24', human: '24 August 2026' },
    { iso: '2026-08-01', human: '1 August 2026' },
    '2026-08-24',
  );
  assert.ok(found.some((p) => /went backwards/.test(p)));
});

/* Future-dating is the obvious way to satisfy the guard once and never think
 * about it again -- type next year's date and it never goes stale. */
test('a dateline cannot be later than the commit that carries it', () => {
  const found = problems(
    [PAGE],
    { iso: '2026-08-01', human: '1 August 2026' },
    { iso: '2027-01-01', human: '1 January 2027' },
    '2026-08-24',
  );
  assert.ok(found.some((p) => /later than this commit/.test(p)));
});

/* A20d. A guard that cannot FAIL is not a guard, and one that cannot PASS is
 * just as broken. Editing About twice in one day put the three rules above
 * into a contradiction: the line has to move, it cannot move back, and it
 * cannot move forward past the commit's own day. The fix is that a same-day
 * edit is not stale -- the line already names the day the page was touched. */
test('a second edit on the day the dateline already names demands nothing', () => {
  const same = { iso: '2026-08-24', human: '24 August 2026' };
  assert.deepEqual(problems([PAGE], same, same, '2026-08-24'), []);
});

test('the day after, that same unchanged dateline IS stale', () => {
  const same = { iso: '2026-08-24', human: '24 August 2026' };
  const found = problems([PAGE], same, same, '2026-08-25');
  assert.equal(found.length, 1);
  assert.match(found[0], /still 2026-08-24, and this commit is dated 2026-08-25/);
});

test('with no head date to compare against the strict form still applies', () => {
  const same = { iso: '2026-08-24', human: '24 August 2026' };
  const found = problems([PAGE], same, same, null);
  assert.equal(found.length, 1);
  assert.match(found[0], /changed but the dateline is still 2026-08-24\./);
});

/* THE PROPERTY THAT WAS VIOLATED, stated so it cannot be violated again:
 * whatever the base and whatever the commit date, SOME dateline passes. The
 * honest one always does -- the day of the commit itself. */
test('there is always a legal dateline: the day of the commit', () => {
  const days = ['2026-08-01', '2026-08-24', '2026-08-25', '2026-12-31'];
  for (const headDate of days) {
    for (const oldIso of days.filter((d) => d <= headDate)) {
      for (const changed of [[PAGE], [PAGE, 'app/app.js'], ['app/app.js']]) {
        const found = problems(
          changed,
          { iso: oldIso, human: humanize(oldIso) },
          { iso: headDate, human: humanize(headDate) },
          headDate,
        );
        assert.deepEqual(found, [],
          `no legal dateline for base ${oldIso} at ${headDate}: ${found.join(' ')}`);
      }
    }
  }
});

test('with no base to compare against, only the page itself is judged', () => {
  const line = { iso: '2026-08-24', human: '24 August 2026' };
  assert.deepEqual(problems([PAGE], null, line, '2026-08-24'), []);
});
