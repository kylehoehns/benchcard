/* #414: the wording of the note that describes the minutes the timeline
 * shows (`minutesNote`, state.js). Pure: a minutes map in roster order and a
 * name lookup in, one info issue out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-stub.js';
const { minutesNote } = await import('../app/state.js');

const names = id => ({ a: 'Ana Reyes', b: 'Eli Tran', c: 'Nia Brooks', d: 'Theo Alvarez', e: 'Sam Okafor', f: 'Hana Kim', g: 'Riley Novak', h: 'Devon Ellis' })[id];
const mins = vals => vals;

test('an even split says every player gets that many minutes', () => {
  const n = minutesNote(mins({ a: 16, b: 16, c: 16 }), names);
  assert.equal(n.message, 'Minutes divide evenly: every player gets 16.');
  assert.equal(n.severity, 'info');
  assert.equal(n.code, 'SPREAD_SHOWN');
});

test('two values name the low end, in roster order, and the playerIds are the low end', () => {
  const n = minutesNote(mins({ a: 12, b: 16, c: 12, d: 12, e: 16, f: 12 }), names);
  assert.equal(n.message, 'Ana Reyes, Nia Brooks, Theo Alvarez and Hana Kim play 12, everyone else 16.');
  assert.deepEqual(n.playerIds, ['a', 'c', 'd', 'f']);
});

test('one name at the low end plays, not play', () => {
  const n = minutesNote(mins({ a: 16, b: 12, c: 16 }), names);
  assert.equal(n.message, 'Eli Tran plays 12, everyone else 16.');
  assert.deepEqual(n.playerIds, ['b']);
});

test('more than six at the low end gives a count instead of names', () => {
  const n = minutesNote(mins({ a: 12, b: 12, c: 12, d: 12, e: 12, f: 12, g: 12, h: 16, i: 16, j: 16, k: 16 }), names);
  assert.equal(n.message, '7 players play 12, the other 4 play 16.');
  assert.equal(n.playerIds.length, 7);
});

test('exactly six at the low end are still named', () => {
  const n = minutesNote(mins({ a: 12, b: 12, c: 12, d: 12, e: 12, f: 12, g: 16 }), names);
  assert.equal(n.message, 'Ana Reyes, Eli Tran, Nia Brooks, Theo Alvarez, Sam Okafor and Hana Kim play 12, everyone else 16.');
});

test('three or more values name the low end and then the most', () => {
  const n = minutesNote(mins({ a: 8, b: 16, c: 12, d: 24 }), names);
  assert.equal(n.message, 'Ana Reyes plays 8, the fewest. The most is 24.');
  const m = minutesNote(mins({ a: 8, b: 8, c: 12, d: 24 }), names);
  assert.equal(m.message, 'Ana Reyes and Eli Tran play 8, the fewest. The most is 24.');
});

test('minutes are formatted, never printed raw', () => {
  const n = minutesNote(mins({ a: 10 / 3, b: 20 / 3 }), names);
  assert.equal(n.message, 'Ana Reyes plays 3.3, everyone else 6.7.');
});
