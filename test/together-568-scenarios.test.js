/* #568: Add a rule sorts its kinds under three headings and says what the
 * picked kind does, and each Together rule has its own strength (As much as
 * possible or Always) in place of the old game-wide Force Together switch.
 * Driven through test/coach.js; each test asserts only what a coach sees or
 * what is kept after a reopen. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const NAMES = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
const KIND_LINES = {
  'Plays at least': 'The fewest minutes one player gets.',
  'Plays at most': 'The most minutes one player gets.',
  'Together': 'Two players who play well as a pair are on the floor together.',
  'Apart': 'Two players are never on the floor at the same time.',
  'One of two on': 'One of two players is always on the floor, like your two ball handlers.',
  'Starting five': 'Who is on the floor at tip-off. Minutes stay even.',
};
const GROUPS = [
  ['One player', ['Plays at least', 'Plays at most']],
  ['Two players', ['Together', 'Apart', 'One of two on']],
  ['Who starts and finishes', ['Starting five', 'Starts the last period']],
];

describe('Add a rule groups its kinds and each Together rule has its own strength', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const openRules = async () => coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
  const openPlan = async () => {
    await coach.tap('Hawks, 9:00 AM, planned');
    await openRules();
  };
  const onGame = (edits = {}) => coach.onGameDayWith(edits, undefined, { names: NAMES, alone: true });
  const addTogether = async (strength) => {
    await coach.tap('Add a rule');
    await coach.tap('Together');
    await coach.tap('Avery');
    await coach.tap('Blake');
    if (strength) await coach.tap(strength);
    await coach.tap('Add rule');
  };

  test('the seven kinds sit under three headings, each chip row named for its heading', async () => {
    await onGame();
    await openPlan();
    await coach.tap('Add a rule');
    const shown = await coach.addRuleKinds();
    assert.deepEqual(shown.map(s => [s.heading, s.name, s.kinds.map(k => k.label)]),
      GROUPS.map(([heading, kinds]) => [heading, heading, kinds]));
  });

  test('under Order there is no Starting five to add: six kinds, one chip under the third heading', async () => {
    await onGame({ strategy: 'order', order: NAMES.map((_, i) => `p${i}`), orderBuilt: true });
    await openPlan();
    await coach.tap('Add a rule');
    const shown = await coach.addRuleKinds();
    assert.deepEqual(shown.map(s => [s.heading, s.kinds.map(k => k.label)]), [
      ['One player', ['Plays at least', 'Plays at most']],
      ['Two players', ['Together', 'Apart', 'One of two on']],
      ['Who starts and finishes', ['Starts the last period']],
    ]);
  });

  test('picking a kind shows what it does, in the words the spec gives', async () => {
    await onGame();
    await openPlan();
    await coach.tap('Add a rule');
    for (const [kind, line] of Object.entries(KIND_LINES)) {
      await coach.tap(kind);
      assert.equal(await coach.kindLine(), line, kind);
    }
    await coach.tap('Starts the last period');
    assert.equal(await coach.kindLine(), 'Who is on the floor when the last quarter starts.');
    for (const s of await coach.addRuleKinds()) for (const k of s.kinds) {
      assert.doesNotMatch(k.label, /\bN\b|stint/i);
    }
  });

  test('the last-period line says half in a 2-period game', async () => {
    await coach.onGameDayWithRoster(NAMES);
    await openPlan();
    await coach.tap('Add a rule');
    await coach.tap('Starts the last period');
    assert.equal(await coach.kindLine(), 'Who is on the floor when the last half starts.');
  });

  test('adding Together offers As much as possible checked; Always is kept and worded in the rule', async () => {
    await onGame();
    await openPlan();
    await coach.tap('Add a rule');
    await coach.tap('Together');
    assert.deepEqual(await coach.strengthRows(), {
      heading: 'Keep them on together',
      rows: [{ label: 'As much as possible', on: true }, { label: 'Always', on: false }],
      footnote: 'Always can make minutes less even.',
    });
    await coach.tap('Avery');
    await coach.tap('Blake');
    await coach.tap('Always');
    assert.deepEqual((await coach.strengthRows()).rows.map(r => r.on), [false, true]);
    await coach.tap('Add rule');
    assert.ok(await coach.sees('Avery and Blake always together'), 'the rules list says Always');
    assert.ok(!(await coach.sees('Force Together keeps each pair on the floor at the same time')), 'the old switch is gone');

    await coach.tap('Close');
    await coach.comeBackDaysLater(0);
    await openRules();
    assert.ok(await coach.sees('Avery and Blake always together'), 'kept after a reopen');
    await coach.tap('Avery and Blake always together');
    assert.deepEqual((await coach.strengthRows()).rows, [{ label: 'As much as possible', on: false }, { label: 'Always', on: true }]);
  });

  test('a Together rule added as As much as possible keeps its plain sentence and no switch shows', async () => {
    await onGame();
    await openPlan();
    await addTogether();
    assert.ok(await coach.sees('Avery and Blake together'));
    assert.ok(!(await coach.sees('Force Together keeps each pair on the floor at the same time')));
  });

  test('switching a rule to As much as possible changes its sentence and toast, and Undo brings Always back', async () => {
    await onGame({ constraints: { pairs: [['p0', 'p1', true]], avoids: [], minMinutes: {}, maxMinutes: {}, keepOnFloor: [], openingFive: [], lastPeriodFive: [], maxConsecutive: 0, maxBench: 0, targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [] } });
    await openPlan();
    await coach.tap('Avery and Blake always together');
    assert.deepEqual((await coach.strengthRows()).rows.map(r => r.on), [false, true]);
    await coach.tap('As much as possible');
    assert.equal(await coach.text('.plan-rule-sentence'), 'Avery and Blake together');
    assert.equal(await coach.toast(), 'Changed: Avery and Blake together');
    await coach.tap('Undo');
    assert.equal(await coach.text('.plan-rule-sentence'), 'Avery and Blake always together');
    assert.deepEqual((await coach.strengthRows()).rows.map(r => r.on), [false, true]);
  });

  test('no strength group on Apart or One of two on', async () => {
    await onGame();
    await openPlan();
    await coach.tap('Add a rule');
    await coach.tap('Apart');
    assert.equal(await coach.strengthRows(), null);
    await coach.tap('One of two on');
    assert.equal(await coach.strengthRows(), null);
  });

  const pairRules = { pairs: [['p0', 'p1'], ['p2', 'p3', true]], avoids: [], minMinutes: {}, maxMinutes: {}, keepOnFloor: [], openingFive: [], lastPeriodFive: [], maxConsecutive: 0, maxBench: 0, targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [] };
  const together = async () => (await coach.controls()).filter(n => / together$/.test(n));

  test('adding Together Always for a pair that is As much as possible makes that rule Always, in place', async () => {
    await onGame({ constraints: pairRules });
    await openPlan();
    await addTogether('Always');
    assert.deepEqual(await together(), ['Avery and Blake always together', 'Casey and Drew always together']);
  });

  test('adding Together As much as possible for a pair that is Always makes that rule As much as possible, in place', async () => {
    await onGame({ constraints: pairRules });
    await openPlan();
    await coach.tap('Add a rule');
    await coach.tap('Together');
    await coach.tap('Casey');
    await coach.tap('Drew');
    await coach.tap('Add rule');
    assert.deepEqual(await together(), ['Avery and Blake together', 'Casey and Drew together']);
  });
});
