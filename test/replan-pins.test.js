import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #437: a re-plan that refuses over a pin (a kid's Plays at most is spent and
   they are fixed to a stint) keeps the stints already played. Through the
   `state.js` seam (spec 437, "What would settle it"). The game is the spec's:
   9 players p0-p8, 4 x 8, sub every 4 (8 stints), Even, Plays at most p0 8,
   Starts the last period [p0]. */
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
globalThis.document = {
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }), font: '' }) }),
  querySelector: () => null,
  querySelectorAll: () => [],
};

const S = await import('../app/state.js');

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function setup(seed, opts = {}) {
  S.state.players.length = 0;
  for (let i = 0; i < 9; i++) S.state.players.push({ id: `p${i}`, name: `Player ${i}`, tier: 3 });
  const g = {
    id: `g437-${seed}`, label: '', tipoff: '', out: opts.out || [], late: [], seed,
    periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
    strategy: opts.strategy ?? 'balanced', balance: 'even',
    constraints: {
      minMinutes: {}, maxMinutes: { p0: 8 }, pairs: [], avoids: [], keepOnFloor: [],
      openingFive: [], lastPeriodFive: ['p0'], units: [], ...(opts.constraints || {}),
    },
    live: { at: 0, overrides: {} },
    useCarryover: false, useSeasonTargets: false,
  };
  S.state.day.games = [g];
  S.state.activeGame = 0;
  S.computeAll();
  return g;
}
const fives = (g, n) => S.effectiveStints(g, S.plans[0]).slice(0, n).map(s => s.onFloor.join(','));

/* Tip off at stint `at` with `opts.out` missing, then change attendance. */
function change(seed, at, opts, who, here) {
  const g = setup(seed, opts);
  g.live.at = at;
  S.computeAll();
  const before = fives(g, at);
  S.rotationMoved();
  S.setAvailable(g, who, here);
  S.computeAll();
  return { g, before };
}

for (const at of [6, 4]) {
  test(`1: p8 arriving at stint ${at} leaves stints 0-${at - 1} as played (seeds 1-8)`, () => {
    for (const seed of SEEDS) {
      const { g, before } = change(seed, at, { out: ['p8'] }, 'p8', true);
      assert.deepEqual(fives(g, at), before, `seed ${seed}`);
    }
  });
}

for (const at of [7, 6]) {
  test(`2: a kid on the floor marked out at stint ${at} leaves stints 0-${at - 1} as played (seeds 1-8)`, () => {
    for (const seed of SEEDS) {
      const g0 = setup(seed);
      g0.live.at = at;
      S.computeAll();
      const who = S.effectiveStints(g0, S.plans[0])[at].onFloor.find(id => id !== 'p0');
      const { g, before } = change(seed, at, {}, who, false);
      assert.deepEqual(fives(g, at), before, `seed ${seed}, ${who} out`);
    }
  });
}

const warnFor = (r, code) => (r.issues || []).filter(i => i.code === code);

/* #444: stint 6 is the last period's first stint, so from stint 7 Starts the last
   period is done: p0 is not held, so a spent Plays at most has nothing to drop. */
test('3: resolveRest from stint 7 no longer holds p0 to Starts the last period, so there is nothing to warn about', () => {
  const g = setup(1);
  const r = S.resolveRest(g, S.plans[0], 7);
  assert.equal(r.ok, true, 'the rest is planned');
  assert.deepEqual(warnFor(r, 'PIN_CAP_USED'), []);
  assert.deepEqual(r.pinsDropped, []);
  assert.deepEqual(Object.keys(r.overrides).map(Number), [7], 'fives for stint 7 only');
  assert.ok(!r.overrides[7].includes('p0'), 'p0 has no minutes left');
});

test('3: resolveRest drops a capped closer whose cap is spent, and warns', () => {
  const g = setup(1, {
    strategy: 'closers',
    constraints: { lastPeriodFive: [], closing: { players: ['p0', 'p1'], stints: 1 } },
  });
  /* p0 played stints 0 and 1 by hand: 8 minutes, the whole cap. */
  g.live.overrides = { 0: ['p0', 'p1', 'p2', 'p3', 'p4'], 1: ['p0', 'p5', 'p6', 'p7', 'p8'] };
  const r = S.resolveRest(g, S.plans[0], 7);
  assert.equal(r.ok, true, 'the rest is planned');
  const w = warnFor(r, 'PIN_CAP_USED');
  assert.deepEqual(w.map(i => i.playerIds), [['p0']]);
  assert.match(w[0].message, /Player 0/);
  assert.deepEqual(r.pinsDropped, ['p0']);
});

/* Dropping p0 (cap spent) still leaves 6 kids pinned to stint 7: Starts the
   last period [p0 p1 p2] and the closing window [p3 p4 p5 p6] both land on the
   one remaining stint. p0 played stints 0 and 1 by hand (8 minutes, the cap). */
const crowded = () => ({
  out: ['p8'], strategy: 'closers',
  constraints: { lastPeriodFive: ['p0', 'p1', 'p2'], closing: { players: ['p3', 'p4', 'p5', 'p6'], stints: 1 } },
});
const playedByHand = g => {
  g.live.overrides = { 0: ['p0', 'p1', 'p2', 'p3', 'p4'], 1: ['p0', 'p5', 'p6', 'p7', 'p1'] };
};

/* #444: the same crowded game, but Starts the last period [p0 p1 p2] began at
   stint 6, so stint 7 holds only the four closers and the re-plan goes through.
   (Before #444 the five was pinned to stint 7 again, seven kids on one stint,
   and both refused; no longer reachable, since a pin is infeasible only when it
   crowds a stint, and the same constraints crowd the printed plan too.) */
test('4: from the last stint, a re-plan keeps the closers and no longer holds the Last-period five', () => {
  const g = setup(1, crowded());
  playedByHand(g);
  const r = S.resolveRest(g, S.plans[0], 7);
  assert.equal(r.ok, true);
  for (const id of ['p3', 'p4', 'p5', 'p6']) assert.ok(r.overrides[7].includes(id), `${id} closes`);
});

test('4: replanRest keeps the past and says nothing about fixed kids once the last period has started', () => {
  const g = setup(1, crowded());
  playedByHand(g);
  g.live.at = 6;
  S.computeAll();
  const before = fives(g, 6);
  S.rotationMoved();
  S.pinsNotice(g.id); // drains whatever an earlier computeAll left, so the read below is this arrival's
  S.setAvailable(g, 'p8', true);
  S.computeAll();
  assert.deepEqual(fives(g, 6), before, 'stints 0-5 are as played');
  assert.deepEqual(S.rotationMoved(), [], 'no #134 whole-game rewrite');
  assert.equal(S.pinsNotice(g.id), '');
});

test('5: a cap-spent drop is told once, in the toast sentence', () => {
  /* #444: the last period's first stint (6) is still ahead of a re-plan from
     stint 6, which is where p0's spent cap is met. */
  const g = setup(1, { out: ['p8'] });
  g.live.overrides = { 0: ['p0', 'p1', 'p2', 'p3', 'p4'], 1: ['p0', 'p5', 'p6', 'p7', 'p1'] };   // p0: 8 minutes, the cap
  g.live.at = 5;
  S.computeAll();
  S.pinsNotice(g.id); // drains whatever an earlier computeAll left, so the read below is this arrival's
  S.setAvailable(g, 'p8', true);
  S.computeAll();
  assert.equal(S.pinsNotice(g.id), ' Not enough minutes left to keep Player 0. fixed to a stint.');
  assert.equal(S.pinsNotice(g.id), '', 'read once');
});
