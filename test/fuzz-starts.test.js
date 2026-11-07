import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';
import { halfGameSitters } from './long-sit.js';
import { rng, scenario } from './fuzz-gen.js';

test('property: every stint total strength matches who is actually on the floor', () => {
  // guards the arithmetic the shapes are built on: total strength across a
  // game is fixed by the minutes, so no shape can conjure any
  for (let n = 1; n <= 200; n++) {
    const sc = scenario(n);
    const p = generatePlan(sc);
    if (!p.ok) continue;
    const tier = Object.fromEntries(sc.players.map(x => [x.id, x.tier == null ? 3 : x.tier]));
    const fromFloor = p.stints.reduce((a, r) => a + r.onFloor.reduce((b, id) => b + tier[id], 0), 0);
    const fromCounts = sc.availableIds.reduce((a, id) => {
      const played = p.stints.filter(r => r.onFloor.includes(id)).length;
      return a + tier[id] * played;
    }, 0);
    assert.equal(fromFloor, fromCounts, `scenario ${n}: strength accounting disagrees`);
  }
});

test('property: a starting five the coach named is the five that starts', () => {
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const five = (sc.constraints.openingFive || []).filter(id => sc.availableIds.includes(id));
    if (!five.length || sc.strategy === 'platoon') continue;
    const p = generatePlan(sc);
    if (!p.ok || !p.stints.length) continue;
    checked++;
    const on = p.stints[0].onFloor;
    const missing = five.filter(id => !on.includes(id));
    assert.deepEqual(missing, [], `scenario ${n}: ${missing.join(', ')} named to start but did not`);
  }
  assert.ok(checked > 20, `only ${checked} scenarios named a starting five`);
});

test('property: the five a Starts the last period rule names is on the floor for the last period\'s first stint', () => {
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const five = (sc.constraints.lastPeriodFive || []).filter(id => sc.availableIds.includes(id));
    if (!five.length || sc.strategy === 'platoon') continue;
    const p = generatePlan(sc);
    if (!p.ok || !p.stints.length) continue;
    // the first stint of the last regulation period, whatever overtime follows it
    const last = sc.format.periods;
    const row = p.stints.find(r => r.period === last);
    if (!row) continue;
    checked++;
    const missing = five.filter(id => !row.onFloor.includes(id));
    assert.deepEqual(missing, [], `scenario ${n}: ${missing.join(', ')} named for the last period but not on its first stint`);
  }
  assert.ok(checked > 20, `only ${checked} scenarios named a Starts the last period rule`);
});

test('property: with nothing else asked for, bench time is shared evenly', () => {
  /* The complaint this app was built for: one kid sitting two stints running
     while another never comes off. The checkable form is that sit counts
     differ by at most one.

     The preconditions are the point. This is only a promise when the coach
     has asked for nothing else -- Closers exists precisely to keep a group on
     at the end, hand-set minutes are the coach overriding fairness on purpose,
     carryover deliberately skews one game to level the day, and a cap or a
     floor is an instruction. My first version of this test asserted the
     promise unconditionally and "failed" on a Closers plan doing exactly what
     Closers is for. */
  /* Scanned wider than the other properties on purpose: requiring every knob
     to be untouched at once is a narrow filter, and 400 scenarios only yielded
     ten. Widening the search beats weakening the guard -- a coverage floor
     that is met by rounding down is not a floor. */
  let checked = 0;
  for (let n = 1; n <= 1600; n++) {
    const sc = scenario(n);
    const c = sc.constraints;
    if (sc.strategy !== 'balanced') continue;
    if (sc.carryover) continue;
    if (c.targetMinutes && Object.keys(c.targetMinutes).length) continue;
    if (Object.keys(c.maxMinutes).length || Object.keys(c.minMinutes).length) continue;
    if (c.avoids.length || c.pairs.length || c.maxConsecutive) continue;
    if (c.openingFive.length || c.lastPeriodFive.length) continue;
    const p = generatePlan(sc);
    if (!p.ok || p.stints.length < 2 || sc.availableIds.length <= 5) continue;
    checked++;
    const sits = sc.availableIds.map(id => p.stints.filter(r => !r.onFloor.includes(id)).length);
    const gap = Math.max(...sits) - Math.min(...sits);
    assert.ok(gap <= 1,
      `scenario ${n}: bench time ranged ${Math.min(...sits)}-${Math.max(...sits)} stints`);
  }
  assert.ok(checked > 20, `only ${checked} unconstrained scenarios found`);
});

test('property: the tie-break never outranks a floor, a cap or a lock', () => {
  /* The tie-break is a nudge on the minute targets, which is the same currency
     a floor, a cap and a locked target are settled in. It is sized to lose
     every argument it is ever in -- this is that promise, run against the
     player the tie-break most wants to give minutes to and the one it most
     wants to take them from. */
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    if (sc.strategy !== 'balanced' || sc.availableIds.length < 7) continue;
    const c = sc.constraints;
    if (Object.keys(c.minMinutes).length || Object.keys(c.maxMinutes).length) continue;
    if (c.avoids.length || c.maxConsecutive || c.openingFive.length || c.lastPeriodFive.length) continue;
    const [top, bottom] = [sc.availableIds[0], sc.availableIds[1]];
    const stint = sc.stints[0].minutes;
    if (!sc.stints.every(s => Math.abs(s.minutes - stint) < 1e-9)) continue;
    const priority = Object.fromEntries(sc.availableIds.map(id => [id, 0]));
    priority[top] = 99; priority[bottom] = -99;
    const p = generatePlan({
      ...sc, priority,
      // the tie-break wants `top` heavy and `bottom` light; the coach says the
      // opposite, in the two currencies that are promises rather than
      // preferences
      constraints: { ...c, maxMinutes: { [top]: stint }, minMinutes: { [bottom]: sc.gameMinutes } },
    });
    if (!p.ok) continue;
    checked++;
    // minutes are reported rounded to a hundredth, so a 1.666-minute stint
    // prints as 1.67 -- compare against the number a coach would actually read
    assert.ok(p.minutes[top] <= stint + 0.011,
      `scenario ${n}: the tie-break talked the solver past a cap (${p.minutes[top]} > ${stint})`);
    assert.ok(p.minutes[bottom] >= sc.gameMinutes - 0.011,
      `scenario ${n}: the tie-break talked the solver under a floor (${p.minutes[bottom]})`);
  }
  assert.ok(checked > 10, `only ${checked} scenarios exercised the clash`);
});

test('property #438: a hard pair is never less even than a soft plan that already keeps the pair together', () => {
  const fmts = [[4, 8, 4], [2, 20, 5], [4, 6, 3], [4, 8, 2], [2, 16, 4], [4, 10, 5], [2, 12, 3], [4, 10, 2]];
  let checked = 0;
  for (let k = 0; k < 48; k++) {
    const [periods, periodMinutes, every] = fmts[k % fmts.length];
    const n = 6 + (k % 9);
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const a = `p${k % n}`;
    const b = `p${(k + 1 + (k % (n - 1))) % n}`;
    const base = { players, availableIds: players.map(p => p.id), format: { periods, periodMinutes },
      granularity: { mode: 'everyN', value: every }, seed: k + 1 };
    const soft = generatePlan({ ...base, constraints: { pairs: [[a, b]] } });
    const together = soft.stints.every(s => s.onFloor.includes(a) === s.onFloor.includes(b));
    if (!together || soft.issues.some(i => i.severity !== 'info')) continue;
    checked++;
    const hard = generatePlan({ ...base, constraints: { pairs: [[a, b, true]] } });
    assert.ok(hard.spread <= soft.spread + 1e-9,
      `input ${k} (${periods}x${periodMinutes} every ${every}, ${n} players): hard ${hard.spread} vs soft ${soft.spread}`);
  }
  assert.ok(checked >= 12, `only ${checked} inputs were comparable`);
});

/* #437: a live attendance change never rewrites a stint already played, whatever
   the pins. Through `state.js` (`computeAll` + `setAvailable`), which needs the
   browser's `localStorage` and a canvas stub before it loads. Games the
   freeze re-plans: Platoon rewrites the past on an arrival by design (spec 247
   E), so it is not generated; By hand freezes since #489. */
const liveStore = new Map();
globalThis.localStorage = {
  getItem: k => (liveStore.has(k) ? liveStore.get(k) : null),
  setItem: (k, v) => liveStore.set(k, String(v)),
  removeItem: k => liveStore.delete(k),
};
globalThis.document = {
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }), font: '' }) }),
  querySelector: () => null,
  querySelectorAll: () => [],
};
const S = await import('../app/state.js');

test('property #437: after a live arrival or departure, every stint before live.at is unchanged', () => {
  const CASES = 250;
  let reached = 0, letGo = 0;
  for (let n = 1; n <= CASES; n++) {
    const r = rng(n * 2246822519);
    const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    const size = int(5, 11);
    const ids = Array.from({ length: size }, (_, i) => `p${i}`);
    S.state.players.length = 0;
    for (const id of ids) S.state.players.push({ id, name: `Kid ${id}`, tier: 3 });
    const periods = int(2, 4);
    const periodMinutes = int(6, 10);
    const strategy = ['balanced', 'closers', 'minutes'][int(0, 2)];
    const out = r() < 0.5 ? [ids[int(0, size - 1)]] : [];
    const here = ids.filter(id => !out.includes(id));
    const pickHere = () => here[int(0, here.length - 1)];
    const c = { minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: [], units: [] };
    if (r() < 0.7) c.lastPeriodFive = [...new Set(Array.from({ length: int(1, 3) }, pickHere))];
    if (strategy === 'closers') c.closing = { stints: int(1, 2), players: [...new Set(Array.from({ length: int(1, 3) }, pickHere))] };
    if (r() < 0.3) { const a = pickHere(), b = pickHere(); if (a !== b) c.pairs.push([a, b]); }
    if (r() < 0.3) { const a = pickHere(), b = pickHere(); if (a !== b) c.avoids.push([a, b]); }
    /* Caps go on the kids a pin names and on one more kid, at most three, from 5 players up. A cap on
       a kid who played every stint so far can leave the rest of the game too few minutes for five
       on the floor; #490 relaxes it and warns, so this class is generated. */
    const pinned = [...new Set([...c.lastPeriodFive, ...(c.closing?.players || [])])];
    for (const id of [...new Set([...pinned.slice(0, 2), pickHere()])]) if (r() < 0.8) c.maxMinutes[id] = int(1, 2) * periodMinutes;
    const g = {
      id: `fz${n}`, label: '', tipoff: '', out: [...out], late: [], seed: n,
      periods, periodMinutes, granMode: 'everyN', granValue: int(3, 5),
      strategy, balance: 'even', constraints: c,
      live: { at: 0, overrides: {} }, useCarryover: false, useSeasonTargets: false,
    };
    S.state.day.games = [g];
    S.state.activeGame = 0;
    S.computeAll();
    if (!S.plans[0]?.ok) continue;             // a game that never planned is not a live game
    const count = S.plans[0].stints.length;
    const at = int(1, count - 1);
    g.live.at = at;
    S.computeAll();
    const fives = () => S.effectiveStints(g, S.plans[0]).slice(0, at).map(s => s.onFloor.join(','));
    const before = fives();
    const arrival = out.length && r() < 0.5;
    const who = arrival ? out[0] : pickHere();
    S.pinsNotice(g.id);                        // drain what earlier computeAll calls left
    S.setAvailable(g, who, !!arrival);
    S.computeAll();
    if (!S.plans[0]?.ok) continue;
    reached++;
    if (S.pinsNotice(g.id) !== '') letGo++;    // the #437 drop branch ran
    assert.deepEqual(fives(), before,
      `scenario ${n}: ${arrival ? 'arrival' : 'departure'} of ${who} at stint ${at}; ${JSON.stringify({ strategy, c, periods, periodMinutes })}`);
  }
  assert.ok(reached >= 30, `only ${reached} cases reached the assertion`);
  assert.ok(letGo >= 1, 'no case exercised the pin-drop path');
});

/* #443: a Starting five must not cost a kid half the game on the bench when the
   same game without it has no such sit. Even-stint games only: an uneven last
   stint is outside the claim (docs/specs/443-long-sit-cost.md, Out of scope). */
test('property #443: a Starting five adds no half-game sit the no-rule plan avoids', () => {
  const FIVE = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const r = rng(443);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const sitters = halfGameSitters;
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const periods = [2, 4][int(0, 1)];
    const periodMinutes = int(6, 20);
    const divisors = [];
    for (let d = 2; d <= periodMinutes; d++) if (periodMinutes % d === 0) divisors.push(d);
    const every = divisors[int(0, divisors.length - 1)];
    const size = int(7, 12);
    const players = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, name: `Kid${String.fromCharCode(65 + i)} L${i}` }));
    const game = { players, availableIds: players.map(p => p.id), format: { periods, periodMinutes },
      granularity: { mode: 'everyN', value: every }, maxSubs: 3, seed: int(1, 1000) };
    const free = generatePlan(game);
    const five = generatePlan({ ...game, constraints: { openingFive: FIVE } });
    if (!free.ok || !five.ok) continue;
    const half = periods * periodMinutes / 2;
    if (sitters(free, half).length) continue;
    checked++;
    assert.deepEqual(sitters(five, half), [],
      `game ${n}: ${JSON.stringify({ size, periods, periodMinutes, every, seed: game.seed })}`);
  }
  assert.ok(checked >= 200, `only ${checked} games were checked`);
});
