import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removePlayer, emptyConstraints } from '../app/team-ops.js';

/* A new id-keyed field gets added to the constraints and nobody remembers to
   sweep it in `removePlayer`, and the symptom is not a crash -- it is
   "undefined" rendered next to a "?" avatar, mid-game. `team-ops.js` has no
   import-time side effects, so this runs the sweep rather than reading it. */

const team = () => ({
  players: [{ id: 'p1' }, { id: 'p2' }],
  days: [
    { name: '', date: '2026-09-12', games: [{
      out: ['p1', 'p2'],
      constraints: {
        ...emptyConstraints(),
        minMinutes: { p1: 8, p2: 6 }, maxMinutes: { p1: 20, p2: 18 },
        targetSlots: { p1: 3, p2: 2 }, lockedTargets: ['p1', 'p2'],
        pairs: [['p1', 'p2'], ['p2', 'p3']], avoids: [['p1', 'p3'], ['p2', 'p3']],
        openingFive: ['p1', 'p2', 'p3', 'p4', 'p5'],
        lastPeriodFive: ['p1', 'p2', 'p3', 'p4', 'p5'],
        closing: { stints: 2, players: ['p1', 'p2'] },
        units: [['p1', 'p2', 'p3'], ['p4', 'p5']],
        keepOnFloor: [['p1', 'p2'], ['p2', 'p3']],
      },
      overtime: [{ minutes: 3, five: ['p1', 'p2', 'p3', 'p4', 'p5'] }],
      live: { at: 0, overrides: { 0: ['p1', 'p2', 'p3', 'p4', 'p5'], 2: ['p2', 'p3', 'p4', 'p5', 'p6'] } },
    }] },
    { name: '', date: '2026-09-19', games: [{
      out: ['p1'], constraints: { ...emptyConstraints(), minMinutes: { p1: 4 } },
    }] },
  ],
});

test('removePlayer leaves the id nowhere in the team, and the others\' entries alone', () => {
  const t = team();
  removePlayer(t, 'p1');
  assert.ok(!JSON.stringify(t).includes('"p1"'), `p1 survived: ${JSON.stringify(t)}`);
  const [g] = t.days[0].games;
  assert.deepEqual(t.players, [{ id: 'p2' }]);
  assert.deepEqual(g.out, ['p2']);
  assert.deepEqual(g.constraints.minMinutes, { p2: 6 });
  assert.deepEqual(g.constraints.pairs, [['p2', 'p3']]);
  assert.deepEqual(g.constraints.closing.players, ['p2']);
  assert.deepEqual(g.constraints.keepOnFloor, [['p2', 'p3']]);
  assert.deepEqual(g.constraints.units, [['p2', 'p3'], ['p4', 'p5']]);
  assert.deepEqual(g.overtime[0].five, ['p2', 'p3', 'p4', 'p5']);
  assert.deepEqual(Object.keys(g.live.overrides), ['2'], 'the override naming p2 but not p1 stays');
});

test('every constraint field is classified here as holding ids or not', () => {
  /* The sweep test above is only worth something if it is complete. Read the
     shape by calling `emptyConstraints` and fail when a field appears that
     this test has never heard of -- that is the moment to decide whether it
     holds player ids. */
  const holdsIds = ['minMinutes', 'maxMinutes', 'pairs', 'avoids', 'openingFive',
    'lastPeriodFive', 'targetSlots', 'lockedTargets', 'closing', 'units', 'keepOnFloor'];
  /* A field listed in holdsIds must really hold p1 in the fixture, or the
     sweep test passes vacuously for it. */
  const fixed = team().days[0].games[0].constraints;
  for (const f of holdsIds) {
    assert.ok(JSON.stringify(fixed[f]).includes('"p1"'), `fixture field ${f} does not name p1`);
  }
  const noIds = ['hardPairs', 'maxConsecutive', 'maxBench'];
  const known = new Set([...holdsIds, ...noIds]);
  const surprises = Object.keys(emptyConstraints()).filter(f => !known.has(f));
  assert.deepEqual(surprises, [],
    `new constraint field(s) ${surprises.join(', ')} -- do they hold player ids? If so, sweep them in removePlayer, put one in the fixture above, and list them in holdsIds.`);
});
