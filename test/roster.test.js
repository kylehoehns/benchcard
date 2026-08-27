import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRosterLine, parseRoster, dropIndex, callNames, duplicateNumbers, repeatIndexes,
  focusAfterRemoval } from '../app/roster.js';

const p = s => parseRosterLine(s);

test('a bare name has no number', () => {
  assert.deepEqual(p('Marcus Webb'), { number: '', name: 'Marcus Webb' });
});

test('a leading number is picked up in its common forms', () => {
  for (const s of ['12 Marcus Webb', '12. Marcus Webb', '12) Marcus Webb', '#12 Marcus Webb', '12 - Marcus Webb', '12, Marcus Webb']) {
    assert.deepEqual(p(s), { number: '12', name: 'Marcus Webb' }, s);
  }
});

test('a trailing number is picked up in its common forms', () => {
  for (const s of ['Marcus Webb 12', 'Marcus Webb #12', 'Marcus Webb - 12', 'Marcus Webb, 12']) {
    assert.deepEqual(p(s), { number: '12', name: 'Marcus Webb' }, s);
  }
});

test('single-digit and zero-padded numbers normalise', () => {
  assert.deepEqual(p('4 Eli Tran'), { number: '4', name: 'Eli Tran' });
  assert.deepEqual(p('04 Eli Tran'), { number: '4', name: 'Eli Tran' });
});

test('a name that is only a number is kept as a name, not eaten', () => {
  assert.deepEqual(p('23'), { number: '', name: '23' });
});

test('blank and whitespace-only lines are dropped', () => {
  assert.equal(p(''), null);
  assert.equal(p('    '), null);
  assert.equal(p('\t'), null);
});

test('extra whitespace collapses', () => {
  assert.deepEqual(p('  12   Marcus    Webb  '), { number: '12', name: 'Marcus Webb' });
});

test('names with suffixes and hyphens survive', () => {
  assert.deepEqual(p('Marcus Webb Jr'), { number: '', name: 'Marcus Webb Jr' });
  assert.deepEqual(p('7 Jean-Luc Picard'), { number: '7', name: 'Jean-Luc Picard' });
  assert.deepEqual(p("Shaquille O'Neal 34"), { number: '34', name: "Shaquille O'Neal" });
});

test('three-digit numbers are not treated as jersey numbers', () => {
  assert.deepEqual(p('123 Marcus Webb'), { number: '', name: '123 Marcus Webb' });
});

test('a block parses line by line, skipping blanks', () => {
  const r = parseRoster('12 Marcus Webb\n\n  \n4 Eli Tran\nDevon Ellis\n');
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { number: '12', name: 'Marcus Webb' });
  assert.deepEqual(r[1], { number: '4', name: 'Eli Tran' });
  assert.deepEqual(r[2], { number: '', name: 'Devon Ellis' });
});

test('carriage returns from a pasted spreadsheet are handled', () => {
  assert.equal(parseRoster('12 Marcus Webb\r\n4 Eli Tran').length, 2);
});

test('a drag that has not passed half a row keeps its index', () => {
  assert.equal(dropIndex(3, 0, 60, 11), 3);
  assert.equal(dropIndex(3, 29, 60, 11), 3);
  assert.equal(dropIndex(3, -29, 60, 11), 3);
});

test('a drag lands on the row it has passed the middle of', () => {
  assert.equal(dropIndex(3, 30, 60, 11), 4);
  assert.equal(dropIndex(3, -31, 60, 11), 2);   // Math.round(-0.5) is -0, so exactly half a row up still holds
  assert.equal(dropIndex(0, 245, 60, 11), 4);
});

test('a drag past either end clamps to the list', () => {
  assert.equal(dropIndex(10, 5000, 60, 11), 10);
  assert.equal(dropIndex(1, -5000, 60, 11), 0);
});

test('a degenerate list or row height leaves the index alone', () => {
  assert.equal(dropIndex(2, 300, 0, 11), 2);
  assert.equal(dropIndex(2, 300, 60, 0), 2);
});

/* call names: what game mode shouts, as opposed to what the card prints */

const cn = names => callNames(names.map((name, i) => ({ id: 'p' + i, name })));

test('a unique first name is called by its first name alone', () => {
  assert.deepEqual(cn(['Priya Raghunathan', 'Marcus Webb']), { p0: 'Priya', p1: 'Marcus' });
});

test('a shared first name pushes the whole group to a last initial', () => {
  assert.deepEqual(cn(['Jack Torres', 'Jack Ruiz', 'Eli Tran']),
    { p0: 'Jack T.', p1: 'Jack R.', p2: 'Eli' });
});

test('a shared first name and last initial falls back to the full name', () => {
  assert.deepEqual(cn(['Jack Torres', 'Jack Tran']), { p0: 'Jack Torres', p1: 'Jack Tran' });
});

test('one-word and messy names survive', () => {
  assert.deepEqual(cn(['Ilinca', '  Sam   Ortiz  ', '']), { p0: 'Ilinca', p1: 'Sam', p2: '' });
});

test('the match is case-insensitive so JACK and Jack still disambiguate', () => {
  assert.deepEqual(cn(['JACK Torres', 'Jack Ruiz']), { p0: 'JACK T.', p1: 'Jack R.' });
});

/* duplicate jersey numbers: always a typo or a double-paste */

const dn = rows => duplicateNumbers(rows.map(([number, name], i) => ({ id: 'p' + i, number, name })));

test('a roster with distinct numbers has no duplicates', () => {
  assert.deepEqual(dn([['7', 'Devon'], ['12', 'Marcus'], ['', 'Ilinca']]), []);
});

test('two players on one number are reported with both ids', () => {
  assert.deepEqual(dn([['7', 'Devon'], ['12', 'Marcus'], ['7', 'Zed']]),
    [{ number: '7', ids: ['p0', 'p2'] }]);
});

test('three on one number come back as one group', () => {
  assert.deepEqual(dn([['7', 'A'], ['7', 'B'], ['7', 'C']]),
    [{ number: '7', ids: ['p0', 'p1', 'p2'] }]);
});

test('every colliding number is reported, in first-appearance order', () => {
  assert.deepEqual(dn([['12', 'A'], ['7', 'B'], ['12', 'C'], ['7', 'D']]),
    [{ number: '12', ids: ['p0', 'p2'] }, { number: '7', ids: ['p1', 'p3'] }]);
});

test('blank numbers are not duplicates -- most of a roster may have none', () => {
  assert.deepEqual(dn([['', 'A'], ['', 'B'], ['  ', 'C']]), []);
});

test('a pasted 07 and a typed 7 are one number, normalised the way the parser does', () => {
  assert.deepEqual(dn([['07', 'Zed'], ['7', 'Devon']]), [{ number: '7', ids: ['p0', 'p1'] }]);
});

test('a missing or empty roster is handled', () => {
  assert.deepEqual(duplicateNumbers([]), []);
  assert.deepEqual(duplicateNumbers(undefined), []);
});

/* a second paste of the same list: report it, never dedupe it away */

const ri = (had, add) => repeatIndexes(had.map((name, i) => ({ id: 'p' + i, name })), add.map(name => ({ name })));

test('a fresh list has no repeats', () => {
  assert.deepEqual(ri(['Marcus Webb'], ['Eli Tran', 'Devon Ellis']), []);
});

test('pasting the same list twice reports every line', () => {
  assert.deepEqual(ri(['Marcus Webb', 'Eli Tran'], ['Marcus Webb', 'Eli Tran']), [0, 1]);
});

test('only the lines already on the roster are reported', () => {
  assert.deepEqual(ri(['Marcus Webb'], ['Eli Tran', 'Marcus Webb', 'Zed']), [1]);
});

test('the match ignores case, edge space and runs of spaces', () => {
  assert.deepEqual(ri(['Marcus Webb'], ['  marcus   WEBB ']), [0]);
});

test('twins on one pasted list are not repeats of each other', () => {
  assert.deepEqual(ri([], ['Marcus Webb', 'Marcus Webb']), []);
});

test('a blank name is never a repeat', () => {
  assert.deepEqual(ri([''], ['', '   ']), []);
});

test('an empty roster and empty input are handled', () => {
  assert.deepEqual(repeatIndexes([], []), []);
  assert.deepEqual(repeatIndexes(undefined, undefined), []);
});

/* ---- where focus goes when a player is removed ---------------------------
 *
 * Measured in a browser on the rich fixture, 2026-08-25: pressing the ✕ on a
 * roster row left `document.activeElement` on `<body>`. `undoable` rebuilds
 * the list, so the button that was pressed is gone, and `withFocus` cannot
 * carry it -- that restores by `data-fk`, and the removed row's key no longer
 * exists. A keyboard coach was dropped at the top of the document mid-edit,
 * with the toast's Undo a page of tabbing away.
 *
 * These pin the three branches of the decision rather than the fact that the
 * view calls something: `roster-view.js` looks the row up by this index and
 * falls back to "Add player" on -1. */

test('removing a row in the middle focuses the row that took its place', () => {
  assert.equal(focusAfterRemoval(3, 10), 3);
  assert.equal(focusAfterRemoval(0, 10), 0);
});

test('removing the last row focuses the new last row, not a gap past the end', () => {
  assert.equal(focusAfterRemoval(10, 10), 9);
  assert.equal(focusAfterRemoval(1, 1), 0);
});

test('removing the only row leaves nothing in the list to focus', () => {
  assert.equal(focusAfterRemoval(0, 0), -1);
});
