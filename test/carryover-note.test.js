import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';

/* #572: the note on a game that evens out the day names the kids who get more
   and the kids who get less. Seam: the CARRYOVER_ACTIVE issue of `generatePlan`
   (engine.js), for a day whose earlier minutes are set here. */

const NAMES = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
const LEAD = 'Minutes are deliberately uneven here to even out the day.';

/* The CARRYOVER_ACTIVE message of a plan for the nine, given earlier minutes. */
function carryoverNote(players, carryover) {
  const plan = generatePlan({
    players, availableIds: players.map(p => p.id),
    format: { periods: 4, periodMinutes: 8 }, granularity: { mode: 'everyN', value: 4 },
    seed: 7, carryover,
  });
  return plan.issues.find(i => i.code === 'CARRYOVER_ACTIVE')?.message;
}

/* `ups` kids are behind (the first is the most behind), `downs` are ahead (the
   first is the most ahead), the rest of the nine are exactly on the average, so
   they are in neither sentence. Earlier minutes are the average plus a
   deviation; the ups' deviations sum to the downs'. */
function note(ups, downs) {
  const players = NAMES.map((name, i) => ({ id: `p${i}`, name }));
  const carryover = {};
  const mid = 30;
  const behind = Array.from({ length: ups }, (_, j) => 0.5 * (ups - j));
  const weights = Array.from({ length: downs }, (_, j) => downs - j);
  const ahead = weights.map(w => (w / weights.reduce((a, b) => a + b, 0)) * behind.reduce((a, b) => a + b, 0));
  players.forEach((p, i) => {
    carryover[p.id] = i < ups ? mid - behind[i]
      : i < ups + downs ? mid + ahead[i - ups]
      : mid;
  });
  return carryoverNote(players, carryover);
}

const CASES = [
  [1, 1, `${LEAD} Avery gets a little more. Blake gets a little less.`],
  [3, 2, `${LEAD} Avery, Blake and Casey get a little more. Drew and Emery get a little less.`],
  [4, 1, `${LEAD} Avery, Blake, Casey and Drew get a little more. Emery gets a little less.`],
  [5, 2, `${LEAD} Avery, Blake, Casey and 2 others get a little more. Finley and Gray get a little less.`],
  [6, 3, `${LEAD} Avery, Blake, Casey and 3 others get a little more. Gray, Harper and Indy get a little less.`],
  [2, 6, `${LEAD} Avery and Blake get a little more. Casey, Drew, Emery and 3 others get a little less.`],
];
for (const [ups, downs, want] of CASES) {
  test(`the catch-up note with ${ups} kid${ups === 1 ? '' : 's'} getting more and ${downs} getting less`, () => {
    assert.equal(note(ups, downs), want);
  });
}

test('the catch-up note leaves the less sentence off when nobody carries a negative credit', () => {
  // Avery is a hair behind, the other eight are on the average to within 1e-9 (a hair is 4.5e-9)
  const players = NAMES.map((name, i) => ({ id: `p${i}`, name }));
  const carryover = Object.fromEntries(players.map((p, i) => [p.id, i === 0 ? 30 - 4.5e-9 : 30]));
  assert.equal(carryoverNote(players, carryover), `${LEAD} Avery gets a little more.`);
});
