/* #557: Order's "Mix the fives", at the engine and the state. Names are made up
 * (Avery, Blake, ...) and expected values are worked out on paper, a five being
 * the window of c places on from the last, counted round the list. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildOrder, mixTieDivisor, BUILD_CAP } from '../app/engine.js';

/* A seeded generator, so a failure repeats. */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stintsOf = (lens, perPeriod) => lens.map((minutes, i) => ({ minutes, period: 1 + Math.floor(i / perPeriod) }));
const NONE = { minMinutes: {}, maxMinutes: {}, avoids: [], pairs: [], keepOnFloor: [], lastPeriodFive: [] };

/* ---- 1a: the default list, byte for byte ----
 * The hash below was recorded on 22855f7, before any #557 change, by running
 * these same calls on that tree. A flat `mix` (every kid one level) must give
 * the same hash on this branch. */
const BUILD_FINGERPRINT = 'f9e4bf08c2c630de57d95edb33530dea0ec311ef9e5c3e861ec7415eaf5b585e';
const BUILD_CASES = 300;
function buildCases() {
  const r = rng(557);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const cases = [];
  for (let k = 0; k < BUILD_CASES; k++) {
    const n = int(2, 15);
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const periods = pick([1, 2, 4]);
    const per = int(1, 5);
    const even = r() < 0.5;
    const stints = stintsOf(Array.from({ length: periods * per }, () => (even ? 4 : int(1, 6))), per);
    const maxSubs = int(1, 5);
    const priority = Object.fromEntries(ids.filter(() => r() < 0.8).map(id => [id, pick([0, 0, 1, 2.5, 3, 7])]));
    const some = () => ids.filter(() => r() < 0.3);
    const pair = () => { const a = pick(ids), b = pick(ids); return a === b ? null : [a, b]; };
    const constraints = { ...NONE };
    if (r() < 0.5) constraints.avoids = [pair()].filter(Boolean);
    if (r() < 0.3) constraints.pairs = [pair()].filter(Boolean);
    if (r() < 0.3) constraints.keepOnFloor = [pair()].filter(Boolean);
    if (r() < 0.4) constraints.minMinutes = { [pick(ids)]: int(1, 12) };
    if (r() < 0.3) constraints.maxMinutes = { [pick(ids)]: int(0, 12) };
    if (r() < 0.3) constraints.lastPeriodFive = some().slice(0, 5);
    cases.push({ ids, stints, maxSubs, priority, constraints, periods });
  }
  return cases;
}
const runBuilds = extra => buildCases().map(c => {
  const { order, short, evals } = buildOrder({ ...c, ...(extra ? extra(c) : {}) });
  return { order, short, evals };
});

test('the default list is byte for byte what it was before Mix (300 seeded builds)', () => {
  assert.equal(sha(runBuilds()), BUILD_FINGERPRINT);
});

test('Mix with every kid at one level builds exactly the default list, evaluation for evaluation', () => {
  const flat = c => ({ mix: Object.fromEntries(c.ids.map(id => [id, 3])) });
  assert.equal(sha(runBuilds(flat)), BUILD_FINGERPRINT);
});

/* ---- 1b: the same through computeAll ---- */
const PLAN_FINGERPRINT = 'e24589f6eaa22c6e39250f8e34c5a593d42655e36af9b6affe369ef21e29bd7e';
test('the plans of games on the app\'s list are byte for byte what they were before Mix (seeded records)', async () => {
  const { S, withTeam, player, bareGame } = await import('./state-fixture.js');
  const r = rng(5570);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const out = [];
  for (let k = 0; k < 60; k++) {
    const n = int(6, 13);
    const ids = Array.from({ length: n }, (_, i) => `q${i}`);
    const players = ids.map(id => ({ ...player(id), tier: int(1, 5) }));
    const g = bareGame({ id: `g${k}`, strategy: 'order', order: [...ids], orderBuilt: true, late: [],
      periods: pick([2, 4]), periodMinutes: pick([8, 12, 16]), granValue: pick([2, 3, 4]) });
    const pair = () => { const a = pick(ids), b = pick(ids); return a === b ? null : [a, b]; };
    if (r() < 0.5) g.constraints.avoids = [pair()].filter(Boolean);
    if (r() < 0.3) g.constraints.pairs = [pair()].filter(Boolean);
    if (r() < 0.4) g.constraints.minMinutes = { [pick(ids)]: int(2, 14) };
    if (r() < 0.3) g.constraints.maxMinutes = { [pick(ids)]: int(4, 20) };
    const settings = { maxSubs: int(1, 5), tieBreak: pick(['behind', 'levels']) };
    withTeam(players, [g], settings, () => {
      S.computeAll();
      const p = S.plans[0];
      out.push({ order: g.order, ok: p.ok, floors: (p.stints || []).map(s => s.onFloor) });
    });
  }
  assert.equal(sha(out), PLAN_FINGERPRINT);
});

/* ---- The issue's nine: 2 periods of 16, a sub every 4 (8 stints), 4 changing ---- */
const NINE = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
const EIGHT = stintsOf(Array(8).fill(4), 4);
const buildNine = (over = {}) => buildOrder({
  ids: NINE, stints: EIGHT, maxSubs: 4, priority: {}, periods: 2,
  ...over, constraints: { ...NONE, ...(over.constraints || {}) },
});
const levelsOf = (high, hi, lo) => Object.fromEntries(NINE.map(id => [id, high.includes(id) ? hi : lo]));
/* The paper way: stint j puts on the five places from j*c, counted round the list. */
const fiveAt = (order, c, j) => Array.from({ length: 5 }, (_, t) => order[(j * c + t) % order.length]);
const fives = (order, c = 4) => EIGHT.map((_, j) => fiveAt(order, c, j));
const shared = (order, a, b) => fives(order).reduce((s, five, j) => s + (five.includes(a) && five.includes(b) ? EIGHT[j].minutes : 0), 0);
const minutesOf = (order, id) => fives(order).reduce((s, five, j) => s + (five.includes(id) ? EIGHT[j].minutes : 0), 0);
/* Four kids a level above the rest, placed first, last, every other, and not first four. */
const TOP_FOUR = {
  first: ['Avery', 'Blake', 'Casey', 'Drew'],
  last: ['Finley', 'Gray', 'Harper', 'Indy'],
  spread: ['Blake', 'Drew', 'Finley', 'Harper'],
  middle: ['Casey', 'Drew', 'Gray', 'Harper'],
};
const LEVEL_PAIRS = [[5, 3], [4, 2], [5, 1], [4, 3]];

test('the issue\'s nine under Mix: every one of the 8 fives holds at least 2 of the four higher-level kids', () => {
  for (const [where, top] of Object.entries(TOP_FOUR)) {
    for (const [hi, lo] of LEVEL_PAIRS) {
      const { order, short } = buildNine({ mix: levelsOf(top, hi, lo) });
      assert.deepEqual([...order].sort(), [...NINE].sort());
      assert.deepEqual(short, []);
      fives(order).forEach((five, j) => {
        const n = five.filter(id => top.includes(id)).length;
        assert.ok(n >= 2, `top four ${where}, levels ${hi}/${lo}: five ${j + 1} (${five.join(', ')}) holds ${n}`);
      });
    }
  }
});

test('the issue\'s nine with Mix off: the four higher-level kids take list spots 2 to 5 (today\'s list)', () => {
  const top = TOP_FOUR.middle;
  const priority = Object.fromEntries(NINE.map(id => [id, top.includes(id) ? 3000 : 1000]));
  const { order } = buildNine({ priority });
  assert.deepEqual(order, ['Avery', 'Casey', 'Drew', 'Gray', 'Harper', 'Blake', 'Emery', 'Finley', 'Indy']);
});

test('Mix with every kid at one level is the same list as Mix off, on the nine', () => {
  const off = buildNine();
  assert.deepEqual(buildNine({ mix: levelsOf([], 3, 3) }), off);
  assert.deepEqual(buildNine({ mix: levelsOf(NINE, 4, 4) }), off);
});

test('rules beat the mix: an Apart pair is kept apart, and the list still differs from the default', () => {
  const top = TOP_FOUR.middle;                     // Casey, Drew, Gray, Harper
  const mix = levelsOf(top, 5, 3);
  const off = buildNine({ priority: Object.fromEntries(NINE.map(id => [id, top.includes(id) ? 3000 : 1000])), constraints: { avoids: [['Casey', 'Drew']] } });
  const { order, short } = buildNine({ mix, constraints: { avoids: [['Casey', 'Drew']] } });
  assert.equal(shared(order, 'Casey', 'Drew'), 0);
  assert.deepEqual(short, []);
  assert.notDeepEqual(order, off.order, 'Mix changed the list');
  assert.notDeepEqual(order, buildNine({ constraints: { avoids: [['Casey', 'Drew']] } }).order, 'Mix changed the list');
});

test('rules beat the mix: a minimum is met, though the kid would otherwise sit in a short spot', () => {
  const top = TOP_FOUR.middle;
  const mix = levelsOf(top, 5, 3);
  const constraints = { minMinutes: { Indy: 20 } };    // only spots 2 to 5 play 20
  const { order, short } = buildNine({ mix, constraints });
  assert.equal(minutesOf(order, 'Indy') >= 20, true);
  assert.deepEqual(short, []);
  assert.notDeepEqual(order, buildNine({ constraints }).order, 'Mix changed the list');
});

test('the same input under Mix gives the same list, and never works out more scores than the cap', () => {
  const mix = levelsOf(TOP_FOUR.spread, 5, 2);
  const a = buildNine({ mix }), b = buildNine({ mix });
  assert.deepEqual(a, b);
  assert.ok(a.evals > 0 && a.evals <= BUILD_CAP, `${a.evals} scores against a cap of ${BUILD_CAP}`);
  assert.notDeepEqual(a.order, buildNine().order, 'Mix changed the list');
  const ids = Array.from({ length: 15 }, (_, i) => `p${i}`);
  const big = { ids, stints: stintsOf(Array(16).fill(2), 4), maxSubs: 2, periods: 4, priority: {},
    constraints: { ...NONE, avoids: [['p0', 'p1']], minMinutes: { p8: 12 } },
    mix: Object.fromEntries(ids.map((id, i) => [id, 1 + (i % 5)])) };
  const x = buildOrder(big), y = buildOrder(big);
  assert.deepEqual(x, y);
  assert.ok(x.evals <= BUILD_CAP, `${x.evals} scores`);
  assert.deepEqual([...x.order].sort(), [...ids].sort());
});

/* ---- state: the choice is kept, copied, and used ---- */
test('orderMix survives a save and load only when it is exactly true', async () => {
  const { sanitize } = await import('../app/storage.js');
  const emptyConstraints = () => ({ minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], openingFive: [],
    lastPeriodFive: [], hardPairs: false, maxConsecutive: 0, targetSlots: {}, lockedTargets: [],
    closing: { stints: 2, players: [] }, units: [] });
  const newGame = () => ({ id: 'gnew', label: '', tipoff: '', periods: 4, periodMinutes: 8, granMode: 'everyN',
    granValue: 4, out: [], useCarryover: false, strategy: 'balanced', balance: 'even',
    live: { at: 0, overrides: {} }, seed: 1, constraints: emptyConstraints() });
  const H = { emptyConstraints, newGame, migrateLegacy: () => null };
  const loadedGame = extra => sanitize({ version: 4, onboarded: true, teams: [{ id: 't', name: 'T',
    players: NINE.slice(0, 6).map(id => ({ id, name: id })),
    days: [{ name: '', date: '2026-09-26', games: [{ id: 'g1', strategy: 'order', order: NINE.slice(0, 6), orderBuilt: true, ...extra }] }] }] }, H)
    .teams[0].days[0].games[0];
  assert.equal(loadedGame({ orderMix: true }).orderMix, true);
  assert.equal('orderMix' in loadedGame({ orderMix: 'yes' }), false);
  assert.equal('orderMix' in loadedGame({ orderMix: false }), false);
  assert.equal('orderMix' in loadedGame({}), false);
});

test('copying how a game plans carries Mix, or clears it; a new game from another keeps it', async () => {
  const { S, bareGame } = await import('./state-fixture.js');
  const plan = { rules: false, plan: true, format: false, here: false };
  const mixed = bareGame({ strategy: 'order', order: ['b', 'a'], orderBuilt: true, orderMix: true });
  const plain = bareGame({ strategy: 'order', order: ['a', 'b'], orderBuilt: true });

  const a = bareGame({});
  S.copySetup(a, mixed, plan);
  assert.equal(a.orderMix, true);

  const b = bareGame({ orderMix: true });
  S.copySetup(b, plain, plan);
  assert.equal('orderMix' in b, false, 'copying a game on Best players clears Mix');

  const c = bareGame({ orderMix: true });
  S.copySetup(c, plain, { rules: true, plan: false, format: true, here: true });
  assert.equal(c.orderMix, true, 'the plan switch off leaves the target\'s own choice alone');

  const coachs = bareGame({ strategy: 'order', order: ['b', 'a'], orderMix: true });
  const d = bareGame({});
  S.copySetup(d, coachs, plan);
  assert.equal('orderMix' in d, false, 'a list the coach set is not the app\'s, so there is no Mix to copy');

  assert.equal(S.newGame(1, mixed).orderMix, true);
  assert.equal('orderMix' in S.newGame(1, plain), false);
});

{
  const TOP = ['Casey', 'Drew', 'Gray', 'Harper'];
  const solve = async (gameExtra, tieBreak) => {
    const { S, withTeam, bareGame } = await import('./state-fixture.js');
    const players = NINE.map(id => ({ id, name: id, tier: TOP.includes(id) ? 4 : 2 }));
    const g = bareGame({ id: `gm-${tieBreak}-${Object.keys(gameExtra).join('')}`, strategy: 'order', order: [...NINE],
      periods: 2, periodMinutes: 16, granValue: 4, late: [], ...gameExtra });
    return withTeam(players, [g], { maxSubs: 4, tieBreak }, () => {
      S.computeAll();
      return { order: [...g.order], floors: S.plans[0].stints.map(s => s.onFloor) };
    });
  };
  const topIn = floors => floors.map(f => f.filter(id => TOP.includes(id)).length);

  for (const tieBreak of ['behind', 'levels']) {
    test(`the plan builds the app's list with Mix from the kids' levels (odd minutes: ${tieBreak})`, async () => {
      const { floors } = await solve({ orderBuilt: true, orderMix: true }, tieBreak);
      assert.equal(floors.length, 8);
      assert.ok(topIn(floors).every(n => n >= 2), `higher-level kids in each five: ${topIn(floors)}`);
    });
  }
  test('a coach\'s own list is not rebuilt, whatever the choice says', async () => {
    const { order } = await solve({ orderMix: true }, 'behind');
    assert.deepEqual(order, NINE);
  });
  test('without the choice the app\'s list is the default: higher-level kids stacked in spots 2 to 5 under levels', async () => {
    const { floors } = await solve({ orderBuilt: true }, 'levels');
    assert.ok(topIn(floors).some(n => n < 2), `stacked: ${topIn(floors)}`);
  });
}

/* ---- the tie-break must stay behind evenness for any stint lengths ----
 * The preference is divided down so that its whole range is smaller than the
 * smallest nonzero step in V. Whole-minute stints make that step 1/M; a
 * period split three ways (16 minutes -> 5.333) makes it smaller. Here V is
 * worked out from the spec's formula over many seeded level lists on the
 * fractional game (a 16-minute half split three ways, then two
 * short extra stints), the smallest gap between two different Vs is taken, and
 * the most the preference can reach (5 seats x (n - 1) weight x M minutes)
 * divided by the divisor must stay under it. */
test('the preference stays smaller than any step in evenness, with unequal fractional stints (six of 5.333 and two of 2.5)', () => {
  const lens = [...Array(6).fill(16 / 3), 2.5, 2.5], n = 7, c = 2, M = lens.reduce((a, b) => a + b, 0);
  const r = rng(5573);
  const vs = new Set();
  for (let t = 0; t < 4000; t++) {
    const level = Array.from({ length: n }, () => 1 + Math.floor(r() * 5));
    const strength = lens.map((_, j) => Array.from({ length: 5 }, (_, k) => level[(j * c + k) % n]).reduce((a, b) => a + b, 0));
    const mean = strength.reduce((a, v, j) => a + v * lens[j], 0) / M;
    vs.add(Math.round(strength.reduce((a, v, j) => a + lens[j] * (v - mean) ** 2, 0) * 1e9));
  }
  const sorted = [...vs].sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < sorted.length; i++) gap = Math.min(gap, (sorted[i] - sorted[i - 1]) / 1e9);
  assert.ok(gap > 0 && gap < Infinity);
  const prefRange = 5 * (n - 1) * M;
  assert.ok(prefRange / mixTieDivisor(n, lens) < gap, `pref reach ${prefRange / mixTieDivisor(n, lens)} vs smallest step ${gap}`);
});

test('a game with no minutes is not mixed: the same list and evaluations as Mix off, and no NaN', () => {
  const ids = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray'];
  const stints = stintsOf([0, 0, 0, 0], 2);
  const mix = Object.fromEntries(ids.map((id, i) => [id, 1 + (i % 3)]));
  const priority = Object.fromEntries(ids.map((id, i) => [id, i]));
  const base = { ids, stints, maxSubs: 2, priority, constraints: NONE, periods: 2 };
  assert.deepEqual(buildOrder({ ...base, mix }), buildOrder(base));
});
