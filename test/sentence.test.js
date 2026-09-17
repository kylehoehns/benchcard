import { test } from 'node:test';
import assert from 'node:assert/strict';

/* The sentence, and the sheets' pure arithmetic (#27).
 *
 * `sentenceParts`, `intervalWords`, `evensOutLine`, `planSay` and
 * `stepFormat` are the five pure helpers the spec (docs/specs/27-sentence-
 * and-sheets.md) names for state.js. Each is exercised here through the
 * module's own exports, on hand-built games and plans -- never through a
 * rendered DOM, which is `game-setup.js`'s job and the smoke suite's seam.
 *
 * The document/matchMedia stub, `withTeam` and `player` are shared with
 * test/plan-sheet.test.js through test/state-fixture.js -- see that file's
 * own comment for why it lives there and not under test/helpers/. (A
 * near-identical stub lives a third time in test/league-min.test.js, out of
 * scope for the finding this shares against.)
 */

import { S, withTeam, player } from './state-fixture.js';

// The shape every game below starts from -- RICH's own format and interval,
// no rules, no carryover -- with `S.emptyConstraints()` for the constraints
// a test does not care about, same source `newGame` itself seeds from
// (state.js). `extra` overrides top level; a test that needs one constraint
// set spreads `S.emptyConstraints()` itself so the rest stay empty.
const bareGame = (extra) => ({
  periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, strategy: 'balanced',
  out: [], useCarryover: false, label: '', when: '',
  constraints: S.emptyConstraints(),
  ...extra,
});

test('sentenceParts: 1 player, By hand, perPeriod interval, 1 rule', () => {
  const g = bareGame({ periods: 2, periodMinutes: 20, granMode: 'perPeriod', granValue: 3,
    strategy: 'minutes', constraints: { ...S.emptyConstraints(), pairs: [['a', 'b']] } });
  const parts = withTeam([player('a')], [g], {}, () => S.sentenceParts(g, 0));
  assert.equal(parts.players, '1 player');
  assert.equal(parts.format, '2 × 20');
  assert.equal(parts.interval, '3× a period');
  assert.equal(parts.strategy, 'minutes set by hand');
  assert.equal(parts.rules, '1 rule');
  assert.equal(parts.evens, '');
  assert.equal(
    `${parts.players}, ${parts.format}, subbing ${parts.interval} for ${parts.strategy}, with ${parts.rules}.`,
    '1 player, 2 × 20, subbing 3× a period for minutes set by hand, with 1 rule.');
});

test('sentenceParts: breaksOnly interval, Closers reads "a closing group", 3 rules', () => {
  const g = bareGame({ granMode: 'breaksOnly', granValue: 1, strategy: 'closers',
    constraints: { ...S.emptyConstraints(), avoids: [[1, 2], [3, 4], [5, 6]] } });
  const parts = withTeam([player('a')], [g], {}, () => S.sentenceParts(g, 0));
  assert.equal(parts.interval, 'only at breaks');
  assert.equal(parts.strategy, 'a closing group');
  assert.equal(parts.rules, '3 rules');
});

test('sentenceParts: a stored everyN value not in GRAN_CHOICES still gets words', () => {
  const g = bareGame({ granValue: 7 });
  assert.equal(withTeam([player('a')], [g], {}, () => S.intervalWords(g)), 'every 7 min');
});

test('sentenceParts: zero rules reads "no rules"', () => {
  const g = bareGame({});
  assert.equal(withTeam([player('a')], [g], {}, () => S.sentenceParts(g, 0)).rules, 'no rules');
});

test('evensOutLine: one earlier game named by its tip-off', () => {
  const games = [bareGame({ when: '9:00' }), bareGame({ useCarryover: true })];
  assert.equal(withTeam([player('a')], games, {}, () => S.evensOutLine(1)),
    'Evens out the 9:00 game.');
});

test('evensOutLine: two earlier games, joined "a and b"', () => {
  const games = [bareGame({ when: '9:00' }), bareGame({ when: '11:30' }),
    bareGame({ useCarryover: true })];
  assert.equal(withTeam([player('a')], games, {}, () => S.evensOutLine(2)),
    'Evens out the 9:00 and 11:30 games.');
});

test('evensOutLine: an earlier game with no tip-off falls back to its opponent', () => {
  const games = [bareGame({ when: '9:00' }), bareGame({ when: '', label: 'Owls' }),
    bareGame({ useCarryover: true })];
  assert.equal(withTeam([player('a')], games, {}, () => S.evensOutLine(2)),
    'Evens out the 9:00 and Owls games.');
});

test('evensOutLine: an earlier game with neither names none of them', () => {
  const games = [bareGame({ when: '', label: '' }), bareGame({ useCarryover: true })];
  assert.equal(withTeam([player('a')], games, {}, () => S.evensOutLine(1)),
    'Evens out the earlier game.');
});

test('evensOutLine: no line for game 0, and no line when useCarryover is off', () => {
  const games0 = [bareGame({ useCarryover: true })];
  assert.equal(withTeam([player('a')], games0, {}, () => S.evensOutLine(0)), '');
  const games1 = [bareGame({ when: '9:00' }), bareGame({ useCarryover: false })];
  assert.equal(withTeam([player('a')], games1, {}, () => S.evensOutLine(1)), '');
});

test('planSay: a range of minutes, plural changes', () => {
  const g = bareGame({});
  const p = { ok: true, minutes: { a: 10, b: 14 },
    stints: [{ in: [] }, { in: ['a'] }, { in: ['b'] }, { in: ['a'] }, { in: ['b'] }] };
  assert.equal(S.planSay(g, p), '10 to 14 minutes each, 4 changes');
});

test('planSay: an even plan reads "{m} minutes each", one change is singular', () => {
  const g = bareGame({});
  const p = { ok: true, minutes: { a: 12, b: 12 }, stints: [{ in: [] }, { in: ['a'] }] };
  assert.equal(S.planSay(g, p), '12 minutes each, 1 change');
});

test('planSay: a blocked plan names the first error', () => {
  const g = bareGame({});
  const p = { ok: false, issues: [
    { severity: 'warn', message: 'A warning nobody needs to act on.' },
    { severity: 'error', message: 'Not enough players for five on the floor.' },
  ] };
  assert.equal(S.planSay(g, p), 'Plan blocked: Not enough players for five on the floor.');
});

test('stepFormat: clamps toward range, and a step from a stray high value lands on the max', () => {
  assert.equal(S.stepFormat(30, -1, 4, 20), 20);
  assert.equal(S.stepFormat(4, -1, 4, 20), 4);
  assert.equal(S.stepFormat(8, 1, 4, 20), 9);
  assert.equal(S.stepFormat(20, 1, 4, 20), 20);
});

test('GRAN_CHOICES: each entry carries the sentence phrase, label kept for first run', () => {
  const byPhrase = S.GRAN_CHOICES.map(c => c.phrase);
  assert.deepEqual(byPhrase, [
    'every 2 min', 'every 3 min', 'every 4 min', 'every 5 min', 'every 6 min',
    '2× a period', '3× a period', 'only at breaks',
  ]);
  assert.ok(S.GRAN_CHOICES.every(c => typeof c.label === 'string' && c.label.length),
    'label must stay -- first run (onboarding.js) still draws its chips from it');
});

test('STRATEGY_WORDS: Closers reads "a closing group", the other three are unchanged', () => {
  assert.equal(S.STRATEGY_WORDS.closers, 'a closing group');
  assert.equal(S.STRATEGY_WORDS.balanced, 'even minutes');
  assert.equal(S.STRATEGY_WORDS.minutes, 'minutes set by hand');
  assert.equal(S.STRATEGY_WORDS.platoon, 'fixed fives');
});
