import { test } from 'node:test';
import assert from 'node:assert/strict';

/* The Plan sheet's pure helpers (#28), the seam docs/specs/28-plan-sheet.md's
 * Proof section names for `state.js`: `ruleItems`, `removeRule` and
 * `ruleComplete`. Exercised on hand-built games, never through a rendered
 * DOM -- that is rules.js's job and the smoke suite's seam.
 *
 * Same document/matchMedia stub as test/sentence.test.js: state.js reaches
 * for `document` and `matchMedia` at import time even though nothing here
 * touches either.
 */

globalThis.document ??= {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });

const S = await import('../app/state.js');

const withTeam = (players, games, settings, fn) => {
  const saved = S.state.teams;
  S.state.teams = [{
    id: 't', name: 'T', players,
    day: { name: '', games }, season: { games: [] }, activeGame: 0,
    settings: settings || {},
  }];
  S.state.activeTeam = 0;
  try { return fn(); } finally { S.state.teams = saved; }
};

const player = (id, name) => ({ id, name: name || id });

// Same shape test/sentence.test.js's bareGame builds from -- RICH's own
// format and interval, no rules, no carryover.
const bareGame = (extra) => ({
  periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, strategy: 'balanced',
  out: [], useCarryover: false, label: '', when: '',
  constraints: S.emptyConstraints(),
  ...extra,
});

/* ---------------- ruleComplete ---------------- */

test('ruleComplete: minimum needs a player and a whole number 1-40', () => {
  assert.equal(S.ruleComplete('minimum', { id: 'p0', minutes: 0 }), false);
  assert.equal(S.ruleComplete('minimum', { id: 'p0', minutes: 41 }), false);
  assert.equal(S.ruleComplete('minimum', { id: 'p0', minutes: 12.5 }), false);
  assert.equal(S.ruleComplete('minimum', { id: 'p0', minutes: 1 }), true);
  assert.equal(S.ruleComplete('minimum', { id: 'p0', minutes: 40 }), true);
  assert.equal(S.ruleComplete('minimum', { minutes: 12 }), false, 'no player chosen');
  assert.equal(S.ruleComplete('minimum', {}), false, 'empty draft');
});

test('ruleComplete: cap needs a player and a whole number 0-40', () => {
  assert.equal(S.ruleComplete('cap', { id: 'p0', minutes: 0 }), true);
  assert.equal(S.ruleComplete('cap', { id: 'p0', minutes: 40 }), true);
  assert.equal(S.ruleComplete('cap', { id: 'p0', minutes: 41 }), false);
  assert.equal(S.ruleComplete('cap', { id: 'p0', minutes: 12.5 }), false);
  assert.equal(S.ruleComplete('cap', {}), false, 'empty draft');
});

test('ruleComplete: together, apart and one-of-two-on need two different players', () => {
  for (const kind of ['together', 'apart', 'keepon']) {
    assert.equal(S.ruleComplete(kind, { a: 'p0', b: 'p0' }), false, `${kind}: same player twice`);
    assert.equal(S.ruleComplete(kind, { a: 'p0' }), false, `${kind}: only one player`);
    assert.equal(S.ruleComplete(kind, {}), false, `${kind}: empty draft`);
    assert.equal(S.ruleComplete(kind, { a: 'p0', b: 'p1' }), true, `${kind}: two different players`);
  }
});

test('ruleComplete: starting five and last-period five need 1-5 players', () => {
  for (const kind of ['starts', 'lastq']) {
    assert.equal(S.ruleComplete(kind, { ids: [] }), false, `${kind}: none chosen`);
    assert.equal(S.ruleComplete(kind, {}), false, `${kind}: empty draft`);
    assert.equal(S.ruleComplete(kind, { ids: ['p0'] }), true, `${kind}: one`);
    assert.equal(S.ruleComplete(kind, { ids: ['p0', 'p1', 'p2', 'p3', 'p4'] }), true, `${kind}: five`);
    assert.equal(S.ruleComplete(kind, { ids: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'] }), false, `${kind}: six is too many`);
  }
});

test('ruleComplete: rest limit needs a choice of 1-4', () => {
  assert.equal(S.ruleComplete('rest', { n: 0 }), false);
  assert.equal(S.ruleComplete('rest', {}), false);
  assert.equal(S.ruleComplete('rest', { n: 1 }), true);
  assert.equal(S.ruleComplete('rest', { n: 4 }), true);
  assert.equal(S.ruleComplete('rest', { n: 5 }), false);
});

test('ruleComplete: no kind chosen is never complete', () => {
  assert.equal(S.ruleComplete(null, {}), false);
  assert.equal(S.ruleComplete(undefined, { id: 'p0', minutes: 10 }), false);
});

/* ---------------- ruleItems ---------------- */

test('ruleItems: decision 5 sentences, in order, for a game with one of each rule', () => {
  const g = bareGame({
    constraints: {
      ...S.emptyConstraints(),
      minMinutes: { p0: 16 },
      maxMinutes: { p1: 20 },
      pairs: [['p2', 'p3']],
      avoids: [['p4', 'p5']],
      keepOnFloor: [['p6', 'p7']],
      openingFive: ['p0'],
      lastPeriodFive: ['p0', 'p1', 'p2'],
      maxConsecutive: 1,
    },
  });
  const players = [
    player('p0', 'Marcus Williams'), player('p1', 'Devon Ellis'), player('p2', 'Hana Kim'),
    player('p3', 'Eli Tran'), player('p4', 'A Four'), player('p5', 'A Five'),
    player('p6', 'A Six'), player('p7', 'A Seven'),
  ];
  const items = withTeam(players, [g], { minMinutes: 10 }, () => S.ruleItems(g));
  const texts = items.map(i => i.text);
  assert.deepEqual(texts, [
    'Everyone plays at least 10 min',
    'Marcus plays at least 16 min',
    'Devon plays at most 20 min',
    'Hana and Eli play together',
    'A Four and A Five never play together',
    'A Six or A Seven is always on the floor',
    'Marcus starts the game',
    'Marcus, Devon and Hana start the last period',
    'Nobody plays more than 1 stint in a row',
  ]);
});

test('ruleItems: the league minimum is not removable, every other rule is', () => {
  const g = bareGame({ constraints: { ...S.emptyConstraints(), minMinutes: { p0: 16 } } });
  const items = withTeam([player('p0', 'Marcus Williams')], [g], { minMinutes: 10 },
    () => S.ruleItems(g));
  assert.equal(items[0].removable, false, 'the league minimum');
  assert.equal(items[1].removable, true, 'a per-player minimum');
});

test('ruleItems: skips a minimum for a player who is not available', () => {
  const g = bareGame({ out: ['p1'], constraints: { ...S.emptyConstraints(), minMinutes: { p0: 16, p1: 12 } } });
  const players = [player('p0', 'Marcus Williams'), player('p1', 'Devon Ellis')];
  const items = withTeam(players, [g], {}, () => S.ruleItems(g));
  assert.deepEqual(items.map(i => i.text), ['Marcus plays at least 16 min']);
});

test('ruleItems: a rest limit above one reads the plural', () => {
  const g = bareGame({ constraints: { ...S.emptyConstraints(), maxConsecutive: 3 } });
  const items = withTeam([player('p0')], [g], {}, () => S.ruleItems(g));
  assert.deepEqual(items.map(i => i.text), ['Nobody plays more than 3 stints in a row']);
});

test('ruleItems: length always equals ruleCount(g)', () => {
  const g = bareGame({
    constraints: {
      ...S.emptyConstraints(),
      minMinutes: { p0: 16 }, maxMinutes: { p1: 20 },
      pairs: [['p2', 'p3']], avoids: [['p4', 'p5']], keepOnFloor: [['p6', 'p7']],
      openingFive: ['p0'], lastPeriodFive: ['p0'], maxConsecutive: 2,
    },
  });
  const players = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map(id => player(id));
  withTeam(players, [g], { minMinutes: 8 }, () => {
    assert.equal(S.ruleItems(g).length, S.ruleCount(g));
  });
});

test('ruleItems: no rules at all is an empty list', () => {
  const g = bareGame({});
  const items = withTeam([player('p0')], [g], {}, () => S.ruleItems(g));
  assert.deepEqual(items, []);
});

/* ---------------- removeRule ---------------- */

test('removeRule: deletes exactly the named minimum', () => {
  const c = { ...S.emptyConstraints(), minMinutes: { p0: 16, p1: 12 } };
  S.removeRule(c, { kind: 'minimum', id: 'p0' });
  assert.deepEqual(c.minMinutes, { p1: 12 });
});

test('removeRule: deletes exactly the named pair, out of several', () => {
  const c = { ...S.emptyConstraints(), pairs: [['p0', 'p1'], ['p2', 'p3']] };
  S.removeRule(c, { kind: 'together', pair: ['p2', 'p3'] });
  assert.deepEqual(c.pairs, [['p0', 'p1']]);
});

test('removeRule: clears the starting five', () => {
  const c = { ...S.emptyConstraints(), openingFive: ['p0', 'p1'] };
  S.removeRule(c, { kind: 'starts' });
  assert.deepEqual(c.openingFive, []);
});

test('removeRule: clears the rest limit', () => {
  const c = { ...S.emptyConstraints(), maxConsecutive: 3 };
  S.removeRule(c, { kind: 'rest' });
  assert.equal(c.maxConsecutive, 0);
});
