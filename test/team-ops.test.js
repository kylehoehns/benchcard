import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeTeam } from '../app/team-ops.js';

/* "The record always holds at least one team" is a rule about the whole
   record, so `removeTeam` takes the record, not a team. No DOM stub and no
   localStorage here: `team-ops.js` has no import-time side effects. */
const t = name => ({ name, players: [] });
const record = (names, activeTeam, onboarded = true) => ({ teams: names.map(t), activeTeam, onboarded });

test('removing the only team leaves one blank team, not onboarded, active 0', () => {
  const r = record(['A'], 0);
  const blank = { name: 'blank', players: [] };
  removeTeam(r, 0, () => blank);
  assert.equal(r.teams.length, 1);
  assert.equal(r.teams[0], blank);
  assert.deepEqual(r.teams[0].players, []);
  assert.equal(r.onboarded, false);
  assert.equal(r.activeTeam, 0);
});

test('removing the active team 1 of 3 leaves two, active 1, onboarded unchanged', () => {
  const r = record(['A', 'B', 'C'], 1);
  removeTeam(r, 1, () => assert.fail('blank must not be called'));
  assert.deepEqual(r.teams.map(x => x.name), ['A', 'C']);
  assert.equal(r.activeTeam, 1);
  assert.equal(r.onboarded, true);
});

test('removing the last of 3 while active clamps activeTeam to 1', () => {
  const r = record(['A', 'B', 'C'], 2);
  removeTeam(r, 2, () => assert.fail('blank must not be called'));
  assert.deepEqual(r.teams.map(x => x.name), ['A', 'B']);
  assert.equal(r.activeTeam, 1);
});

test('blank is not called when other teams remain', () => {
  let calls = 0;
  removeTeam(record(['A', 'B'], 0), 0, () => { calls++; return t('x'); });
  assert.equal(calls, 0);
});
