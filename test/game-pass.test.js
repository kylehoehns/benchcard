import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #26 "Game passes on Today" (docs/specs/26-game-passes.md), the model half:
 * `ruleCount`, `passSummary`, `passBlocks` and `rowGradient` in `state.js`.
 * Same document stub as `league-min.test.js` -- neither file has a DOM
 * harness, and `state.js` only ever touches `document` at module load, for
 * `measureText`.
 */

globalThis.document ??= {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });

const S = await import('../app/state.js');

const withTeam = (players, settings, fn) => {
  const saved = S.state.teams;
  S.state.teams = [{ id: 't', name: 'T', players, day: { name: '', games: [] },
                     season: { games: [] }, activeGame: 0, settings }];
  S.state.activeTeam = 0;
  try { return fn(); } finally { S.state.teams = saved; }
};

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

/* ---------------------------- ruleCount (item 9) ---------------------------- */

test('ruleCount counts each rule once, exactly as the rules list does', () => {
  withTeam(players(5), { minMinutes: 10 }, () => {
    const g = { out: ['p4'], constraints: {
      ...S.emptyConstraints(),
      minMinutes: { p0: 10, p4: 5 },   // p4 is absent -- must not count
      maxMinutes: { p1: 20 },
      pairs: [['p0', 'p1']],
      avoids: [['p2', 'p3']],
      keepOnFloor: [['p0', 'p2']],
      openingFive: ['p0', 'p1', 'p2', 'p3', 'p2'],
      lastPeriodFive: ['p0'],
      maxConsecutive: 3,
    } };
    // 1 (min, p0) + 1 (max, p1) + 1 (pair) + 1 (avoid) + 1 (keepOnFloor)
    // + 1 (starting five) + 1 (last period) + 1 (rest limit) + 1 (league min) = 9
    assert.equal(S.ruleCount(g), 9);
  });
});

test('ruleCount does not count a min or a cap on a player who is not available', () => {
  withTeam(players(3), { minMinutes: 0 }, () => {
    const g = { out: ['p1'], constraints: { ...S.emptyConstraints(), minMinutes: { p1: 10 } } };
    assert.equal(S.ruleCount(g), 0);
  });
});

test('ruleCount is 0 with no rules and no league minimum', () => {
  withTeam(players(3), { minMinutes: 0 }, () => {
    const g = { out: [], constraints: S.emptyConstraints() };
    assert.equal(S.ruleCount(g), 0);
  });
});

test('ruleCount counts a starting five or a last-period five as 1, not its length', () => {
  withTeam(players(5), { minMinutes: 0 }, () => {
    const g = { out: [], constraints: {
      ...S.emptyConstraints(), openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'],
    } };
    assert.equal(S.ruleCount(g), 1);
  });
});

/* --------------------------- passSummary (item 5) --------------------------- */

test('passSummary matches the four passes of the FOUR fixture table', () => {
  withTeam(players(12), { minMinutes: 0 }, () => {
    const g0 = { out: [], strategy: 'balanced', useCarryover: false, constraints: S.emptyConstraints() };
    assert.equal(S.passSummary(g0, 0), '12 players · even minutes');

    const g1 = { out: ['p11'], strategy: 'balanced', useCarryover: true, constraints: {
      ...S.emptyConstraints(), pairs: [['p0', 'p1']], openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'],
    } };
    assert.equal(S.passSummary(g1, 1), '11 players · even minutes · evens out the day · 2 rules');

    const g2 = { out: [], strategy: 'closers', useCarryover: false, constraints: S.emptyConstraints() };
    assert.equal(S.passSummary(g2, 2), '12 players · a closing group');

    const g3 = { out: [], strategy: 'balanced', useCarryover: false, constraints: {
      ...S.emptyConstraints(), minMinutes: { p0: 40 },
    } };
    assert.equal(S.passSummary(g3, 3), '12 players · even minutes · 1 rule');
  });
});

test('passSummary does not say "evens out the day" for game 0, even with useCarryover on', () => {
  withTeam(players(2), { minMinutes: 0 }, () => {
    const g = { out: [], strategy: 'balanced', useCarryover: true, constraints: S.emptyConstraints() };
    assert.equal(S.passSummary(g, 0), '2 players · even minutes');
  });
});

test('passSummary uses every strategy\'s words', () => {
  withTeam(players(3), { minMinutes: 0 }, () => {
    const base = { out: [], useCarryover: false, constraints: S.emptyConstraints() };
    assert.equal(S.passSummary({ ...base, strategy: 'minutes' }, 0), '3 players · minutes set by hand');
    assert.equal(S.passSummary({ ...base, strategy: 'platoon' }, 0), '3 players · fixed fives');
  });
});

test('passSummary uses the singular for one player', () => {
  withTeam(players(3), { minMinutes: 0 }, () => {
    const g = { out: ['p1', 'p2'], strategy: 'balanced', useCarryover: false, constraints: S.emptyConstraints() };
    assert.equal(S.passSummary(g, 0), '1 player · even minutes');
  });
});

/* --------------------------- passBlocks (item 6) ---------------------------- */

test('passBlocks merges consecutive stints on the floor in the same period', () => {
  withTeam(players(3), { minMinutes: 0 }, () => {
    const g = { out: [], live: { overrides: {} } };
    const p = { ok: true, stints: [
      { period: 1, minutes: 5, onFloor: ['p0', 'p1'] },
      { period: 1, minutes: 5, onFloor: ['p0', 'p2'] },
    ] };
    assert.deepEqual(S.passBlocks(g, p), [
      { id: 'p0', blocks: [{ period: 1, from: 0, to: 10 }] },
      { id: 'p1', blocks: [{ period: 1, from: 0, to: 5 }] },
      { id: 'p2', blocks: [{ period: 1, from: 5, to: 10 }] },
    ]);
  });
});

test('passBlocks never merges a run across a period, even if nobody left the floor', () => {
  withTeam(players(1), { minMinutes: 0 }, () => {
    const g = { out: [], live: { overrides: {} } };
    const p = { ok: true, stints: [
      { period: 1, minutes: 8, onFloor: ['p0'] },
      { period: 2, minutes: 8, onFloor: ['p0'] },
    ] };
    assert.deepEqual(S.passBlocks(g, p), [
      { id: 'p0', blocks: [{ period: 1, from: 0, to: 8 }, { period: 2, from: 0, to: 8 }] },
    ]);
  });
});

test('passBlocks leaves out a player who is not available', () => {
  withTeam(players(3), { minMinutes: 0 }, () => {
    const g = { out: ['p2'], live: { overrides: {} } };
    const p = { ok: true, stints: [{ period: 1, minutes: 8, onFloor: ['p0', 'p2'] }] };
    const ids = S.passBlocks(g, p).map(b => b.id);
    assert.deepEqual(ids, ['p0', 'p1']);
  });
});

test('passBlocks follows a bench-mode override, not the plan\'s own onFloor', () => {
  withTeam(players(2), { minMinutes: 0 }, () => {
    const g = { out: [], live: { overrides: { 0: ['p1'] } } };
    const p = { ok: true, stints: [{ period: 1, minutes: 8, onFloor: ['p0'] }] };
    assert.deepEqual(S.passBlocks(g, p), [
      { id: 'p0', blocks: [] },
      { id: 'p1', blocks: [{ period: 1, from: 0, to: 8 }] },
    ]);
  });
});

test('passBlocks returns [] for a blocked plan', () => {
  withTeam(players(2), { minMinutes: 0 }, () => {
    const g = { out: [], live: { overrides: {} } };
    const p = { ok: false, stints: [{ period: 1, minutes: 8, onFloor: ['p0'] }] };
    assert.deepEqual(S.passBlocks(g, p), []);
  });
});

/* --------------------------- rowGradient (decision 10) ---------------------- */

function parseStops(gradient) {
  const m = /^linear-gradient\(to right, (.*)\)$/.exec(gradient);
  assert.ok(m, `not a linear-gradient(to right, …): ${gradient}`);
  return m[1].split(', ').map(tok => {
    const at = tok.lastIndexOf(' ');
    return { color: tok.slice(0, at), pos: tok.slice(at + 1) };
  });
}

test('rowGradient puts color exactly on a block\'s span and transparent across the period gap', () => {
  const g = { periods: 2, periodMinutes: 10 };
  const blocks = [{ period: 1, from: 0, to: 10 }, { period: 2, from: 0, to: 5 }];
  const gradient = S.rowGradient(blocks, g, 'oklch(1 2 3)');
  assert.equal(gradient, 'linear-gradient(to right, oklch(1 2 3) 0%, oklch(1 2 3) 49.5%, '
    + 'transparent 49.5%, transparent 50.5%, oklch(1 2 3) 50.5%, oklch(1 2 3) 75.25%, '
    + 'transparent 75.25%, transparent 100%)');
});

test('rowGradient is nothing but transparent when a player has no blocks', () => {
  const g = { periods: 4, periodMinutes: 8 };
  const stops = parseStops(S.rowGradient([], g, 'oklch(1 2 3)'));
  assert.ok(stops.every(s => s.color === 'transparent'), 'a row with no blocks used a player color');
  assert.equal(stops[0].pos, '0%');
  assert.equal(stops[stops.length - 1].pos, '100%');
});

test('rowGradient never widens the gap or the track for a wider period count', () => {
  // 4 periods of 8 minutes, one block covering the whole of period 3 (index 2).
  const g = { periods: 4, periodMinutes: 8 };
  const blocks = [{ period: 3, from: 0, to: 8 }];
  const stops = parseStops(S.rowGradient(blocks, g, 'oklch(1 2 3)'));
  const colored = stops.filter(s => s.color !== 'transparent').map(s => s.pos);
  // track = (100 - 3*1)/4 = 24.25; period index 2 starts at 2*24.25 + 2*1 = 50.5
  assert.deepEqual(colored, ['50.5%', '74.75%']);
});
