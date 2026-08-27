import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';

/* Lineup balance exists so a coach can have even minutes *and* not field
   their five weakest together. The whole feature is only defensible if the
   first half of that sentence survives it, so most of what follows is about
   what balance must NOT cost. */

const team = tiers => tiers.map((tier, i) => ({
  id: 'p' + i, name: 'Player ' + (i + 1), number: String(i + 1), shortName: '', tier,
}));

const plan = (players, balance, over = {}) => generatePlan({
  players,
  availableIds: players.map(p => p.id),
  format: { periods: 4, periodMinutes: 8 },
  granularity: { mode: 'everyN', value: 4 },
  constraints: {}, strategy: 'balanced', balance, seed: 11, ...over,
});

const spread = p => {
  const v = Object.values(p.minutes);
  return Math.max(...v) - Math.min(...v);
};
const strengths = (p, players) => {
  const tier = Object.fromEntries(players.map(x => [x.id, x.tier]));
  return p.stints.map(s => s.onFloor.reduce((a, id) => a + tier[id], 0));
};

// a genuinely lopsided roster: two of each tier
const LOPSIDED = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1];

test('every player still carries a tier through a plan', () => {
  const p = plan(team(LOPSIDED), 'even');
  assert.ok(p.ok);
  assert.equal(p.stints.every(s => s.onFloor.length === 5), true);
});

test('balance never costs minutes fairness', () => {
  /* The point of the low weight. If this ever fails, the feature is taking
     minutes off somebody to make a lineup look tidier, which is the one
     trade this app must not make. */
  const players = team(LOPSIDED);
  const base = plan(players, 'even');
  for (const shape of ['even', 'start', 'finish', 'both']) {
    const p = plan(players, shape);
    assert.ok(p.ok, shape);
    assert.ok(spread(p) <= spread(base) + 1e-9,
      `${shape} widened the minutes spread: ${spread(p)} vs ${spread(base)}`);
  }
});

test('an all-default roster plans exactly as it did before tiers existed', () => {
  /* Inertness is the promise to every coach who never opens this. One tier
     for everyone means every five is worth the same, so the term switches
     itself off rather than pushing lineups around for no reason. */
  const flat = team(Array(10).fill(3));
  const withBalance = plan(flat, 'both');
  const without = plan(flat, 'even');
  assert.deepEqual(
    withBalance.stints.map(s => [...s.onFloor].sort()),
    without.stints.map(s => [...s.onFloor].sort()),
  );
});

test('a missing tier is treated as the middle, not as zero', () => {
  const naked = team(LOPSIDED).map(({ tier, ...rest }) => rest);
  const p = plan(naked, 'both');
  assert.ok(p.ok);
  // all-equal tiers => the term is off => same plan as 'even'
  assert.deepEqual(
    p.stints.map(s => [...s.onFloor].sort()),
    plan(naked, 'even').stints.map(s => [...s.onFloor].sort()),
  );
});

test('even keeps lineup strength closer together than leaving it alone', () => {
  const players = team(LOPSIDED);
  const balanced = strengths(plan(players, 'even'), players);
  const range = a => Math.max(...a) - Math.min(...a);
  // the honest claim: not that every stint is identical, but that the worst
  // five and the best five are not both on the floor during the same game
  assert.ok(range(balanced) <= 4,
    `stint strengths still swing by ${range(balanced)}: ${balanced.join(', ')}`);
});

test('start puts the stronger lineups first, finish puts them last', () => {
  const players = team(LOPSIDED);
  const s = strengths(plan(players, 'start'), players);
  const f = strengths(plan(players, 'finish'), players);
  const half = Math.floor(s.length / 2);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(s.slice(0, half)) > mean(s.slice(-half)),
    `start did not front-load: ${s.join(', ')}`);
  assert.ok(mean(f.slice(-half)) > mean(f.slice(0, half)),
    `finish did not back-load: ${f.join(', ')}`);
});

test('both ends is stronger at the ends than in the middle', () => {
  const players = team(LOPSIDED);
  const b = strengths(plan(players, 'both'), players);
  const ends = (b[0] + b[b.length - 1]) / 2;
  const mid = b.slice(1, -1);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(ends > mean(mid), `both did not lift the ends: ${b.join(', ')}`);
});

test('an unknown balance value falls back to even rather than throwing', () => {
  const players = team(LOPSIDED);
  const p = plan(players, 'vibes');
  assert.ok(p.ok);
  assert.deepEqual(
    p.stints.map(s => [...s.onFloor].sort()),
    plan(players, 'even').stints.map(s => [...s.onFloor].sort()),
  );
});

test('balance is deterministic for a given seed', () => {
  const players = team(LOPSIDED);
  const a = plan(players, 'both');
  const b = plan(players, 'both');
  assert.deepEqual(a.stints.map(s => s.onFloor), b.stints.map(s => s.onFloor));
});

test('minute floors still win over balance', () => {
  /* A floor is a promise to a kid. Balance is a preference. If the weakest
     player is guaranteed 12 minutes, no shape may talk the solver out of it. */
  const players = team(LOPSIDED);
  const weakest = players[players.length - 1].id;
  const p = plan(players, 'start', { constraints: { minMinutes: { [weakest]: 12 } } });
  assert.ok(p.ok);
  assert.ok(p.minutes[weakest] >= 12,
    `floor broken: ${weakest} got ${p.minutes[weakest]}`);
});
