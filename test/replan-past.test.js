import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #489 #490 #449: a re-plan of a game underway keeps the stints already
   played, and a rule edit moves little. Runs at the `computeAll` seam, on the
   stubs test/played-stints.test.js uses (spec 489, Proof table). Expected
   values are the spec's, not the solver's. */
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

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const emptyC = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [],
  openingFive: [], lastPeriodFive: [], units: [],
});
function game(o) {
  S.state.players.length = 0;
  const names = o.names || Array.from({ length: o.size }, (_, i) => `p${i}`);
  for (const id of names) S.state.players.push({ id, name: id.startsWith('p') ? `Kid${String.fromCharCode(65 + Number(id.slice(1)))}` : id, tier: 3 });
  const g = {
    id: 'g489', label: '', tipoff: '', out: [...(o.out || [])], late: [], seed: o.seed,
    periods: o.periods, periodMinutes: o.periodMinutes, overtime: [], granMode: 'everyN', granValue: o.every,
    strategy: o.strategy || 'balanced', balance: 'even', constraints: { ...emptyC(), ...(o.c || {}) },
    live: { at: 0, overrides: {} }, useCarryover: false, useSeasonTargets: false,
  };
  S.state.day.games = [g];
  S.state.activeGame = 0;
  S.computeAll();
  return g;
}
const fives = (g, n) => S.effectiveStints(g, S.plans[0]).slice(0, n).map(s => [...s.onFloor].sort().join(','));

const { sanitize } = await import('../app/storage.js');
// the record as it is saved and read back, with an empty plan cache (the cache is keyed by game id)
let reloads = 0;
function reloaded(g) {
  const raw = {
    version: 3, players: JSON.parse(JSON.stringify(S.state.players)),
    day: { name: 'Sat', games: [JSON.parse(JSON.stringify(g))] }, activeGame: 0, view: 'games', ui: {},
  };
  const back = sanitize(raw, { emptyConstraints: () => ({ ...emptyC(), targetSlots: {}, lockedTargets: [] }), newGame: () => g }).teams[0].days[0].games[0];
  back.id = `cold${++reloads}`;
  S.state.day.games = [back];
  return back;
}

/* ---------------- #489: By hand ---------------- */

test('#489 By hand: a late arrival keeps stints 0-4 and plays only after, near the hand number', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const g = game({ size: 9, periods: 4, periodMinutes: 8, every: 4, strategy: 'minutes', out: ['p8'], seed });
    g.live.at = 4;
    S.computeAll();
    const past = fives(g, 5);
    S.rotationMoved();
    S.setAvailable(g, 'p8', true);
    S.computeAll();
    assert.deepEqual(fives(g, 5), past, `seed ${seed}: stints 0-4 are the same fives`);
    const eff = S.effectiveStints(g, S.plans[0]);
    assert.ok(!eff.slice(0, 5).some(s => s.onFloor.includes('p8')), `seed ${seed}: p8 is not shown before arriving`);
    assert.ok(eff.slice(5).some(s => s.onFloor.includes('p8')), `seed ${seed}: p8 plays after`);
    assert.deepEqual(S.rotationMoved(), [], `seed ${seed}: no Rotation changed`);
    /* Hand numbers are normalized for the 9 here: 40 min of floor over 8
       kids is 5 each; 9 back in is the game's even 4.44. Each on-time kid
       finishes within one stint (4 min) of the hand number they hold. */
    const m = S.effectiveMinutes(g, S.plans[0]);
    for (const id of S.availIds(g).filter(x => x !== 'p8')) {
      const want = g.constraints.targetSlots[id] * S.plans[0].stints[0].minutes;
      assert.ok(Math.abs(m[id] - want) <= S.plans[0].stints[0].minutes + 1e-9, `seed ${seed}: ${id} ends at ${m[id]}, hand number ${want}`);
    }
  }
});

test('#489 By hand: no played stint changes over 80 mixed games', () => {
  let changed = [], n = 0;
  for (let k = 1; k <= 80; k++) {
    const r = rng(k * 7919); const int = (a, b) => a + Math.floor(r() * (b - a + 1));
    const size = int(7, 12), periods = [2, 4][int(0, 1)], periodMinutes = int(6, 10), every = int(3, 5);
    const arrival = r() < 0.5;
    const g = game({ size, periods, periodMinutes, every, strategy: 'minutes', out: arrival ? [`p${size - 1}`] : [], seed: k });
    if (!S.plans[0]?.ok) continue;
    const at = int(1, S.plans[0].stints.length - 1);
    g.live.at = at;
    S.computeAll();
    const before = fives(g, at);
    S.setAvailable(g, arrival ? `p${size - 1}` : `p${int(0, size - 2)}`, arrival);
    S.computeAll();
    if (!S.plans[0]?.ok) continue;
    n++;
    if (fives(g, at).join('|') !== before.join('|')) changed.push(k);
  }
  assert.ok(n >= 60, `only ${n} games planned`);
  assert.deepEqual(changed, [], 'games whose played stints changed');
});

test('#489 By hand: a locked hand number is still held after a late arrival, seeds 1-8', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const g = game({ size: 9, periods: 4, periodMinutes: 8, every: 4, strategy: 'minutes', out: ['p8'], seed });
    // 4-minute stints: 6 slots is 24 minutes, 3 slots is 12
    g.constraints.targetSlots = { p0: 6, p1: 3, p2: 5, p3: 5, p4: 5, p5: 5, p6: 5, p7: 6 };
    g.constraints.lockedTargets = ['p0', 'p1'];
    S.computeAll();
    g.live.at = 4;
    S.computeAll();
    S.setAvailable(g, 'p8', true);
    S.computeAll();
    const m = S.effectiveMinutes(g, S.plans[0]);
    assert.equal(m.p0, 24, `seed ${seed}: p0 is locked at 6 slots`);
    assert.equal(m.p1, 12, `seed ${seed}: p1 is locked at 3 slots`);
  }
});

/* ---------------- #490: spent caps ---------------- */

test('#490 a departure whose caps cannot cover the floor keeps the past and warns once', () => {
  const g = game({ size: 7, periods: 2, periodMinutes: 7, every: 3, seed: 1, c: { maxMinutes: { p0: 7, p1: 7 } } });
  g.live.at = 2;
  S.computeAll();
  const past = fives(g, 3);
  S.rotationMoved();
  S.setAvailable(g, 'p2', false);
  S.computeAll();
  const p = S.plans[0];
  assert.ok(p.ok, 'the plan solves');
  assert.deepEqual(fives(g, 3), past, 'stints 0-2 are the same fives');
  assert.deepEqual(S.rotationMoved(), [], 'no Rotation changed');
  const eff = S.effectiveStints(g, p);
  assert.ok(eff.slice(3).every(s => s.onFloor.length === 5), 'every later stint has five');
  const warns = p.issues.filter(i => i.code === 'CAP_RELAXED');
  assert.equal(warns.length, 1, 'one CAP_RELAXED warning');
  const m = S.effectiveMinutes(g, p);
  const over = ['p0', 'p1'].filter(id => m[id] > 7 + 1e-9);
  assert.ok(over.length > 0, 'the fixture really overruns a cap');
  assert.deepEqual([...warns[0].playerIds].sort(), over);
  assert.equal(warns[0].severity, 'warn');
  assert.ok(warns[0].message.includes('KidB'), warns[0].message);
  assert.ok(!warns[0].message.includes('KidA'), 'a kid still under the cap is not named');
  assert.ok(/^This game puts KidB over Plays at most 7\.$/.test(warns[0].message), `names the cap: ${warns[0].message}`);
  assert.ok(!/Kid[D-G]/.test(warns[0].message), 'a kid with no cap is not named');
});

test('#490 the warning is rebuilt after a reload, and gone once the caps are lifted', () => {
  const g = game({ size: 7, periods: 2, periodMinutes: 7, every: 3, seed: 1, c: { maxMinutes: { p0: 7, p1: 7 } } });
  g.live.at = 2;
  S.computeAll();
  S.setAvailable(g, 'p2', false);
  S.computeAll();
  const named = S.plans[0].issues.find(i => i.code === 'CAP_RELAXED')?.playerIds;
  assert.ok(named?.length, 'the departure names who ends over a cap');
  const back = reloaded(g);
  S.computeAll();
  const again = S.plans[0].issues.filter(i => i.code === 'CAP_RELAXED');
  assert.equal(again.length, 1, 'still one warning after a reload');
  assert.deepEqual([...again[0].playerIds].sort(), [...named].sort());
  back.constraints.maxMinutes = {};
  S.computeAll();
  assert.ok(!S.plans[0].issues.some(i => i.code === 'CAP_RELAXED'), 'no cap, no warning');
});

test('#490 with a hand-pinned stint in the rest, a kid inside their cap is still not named', () => {
  const g = game({ size: 7, periods: 2, periodMinutes: 7, every: 3, seed: 1, c: { maxMinutes: { p0: 7, p1: 7 } } });
  g.live.at = 2;
  S.computeAll();
  // the coach puts p3 on in the last stint, in place of the first kid there
  const last = S.plans[0].stints.length - 1;
  const five = [...S.effectiveStints(g, S.plans[0])[last].onFloor];
  if (!five.includes('p3')) five[0] = 'p3';
  g.live.overrides[last] = five;
  S.setAvailable(g, 'p2', false);
  S.computeAll();
  const p = S.plans[0];
  const m = S.effectiveMinutes(g, p);
  const warn = p.issues.find(i => i.code === 'CAP_RELAXED');
  const over = ['p0', 'p1'].filter(id => m[id] > 7 + 1e-9);
  assert.deepEqual(warn ? [...warn.playerIds].sort() : [], over);
});

test('#490 no played stint changes over 88 capped games', () => {
  const changed = [];
  let n = 0;
  for (let k = 1; k <= 120; k++) {
    const r = rng(k * 104729); const int = (a, b) => a + Math.floor(r() * (b - a + 1));
    const size = int(6, 9), periods = [2, 4][int(0, 1)], periodMinutes = int(6, 10), every = int(3, 5);
    const c = { maxMinutes: {} };
    for (let j = 0; j < int(1, 3); j++) c.maxMinutes[`p${int(0, size - 1)}`] = int(1, 2) * periodMinutes;
    const strategy = ['balanced', 'closers', 'minutes'][int(0, 2)];
    if (strategy === 'closers') c.closing = { stints: 1, players: [`p${int(0, size - 1)}`] };
    const g = game({ size, periods, periodMinutes, every, seed: k, c, strategy });
    if (!S.plans[0]?.ok) continue;
    const at = int(1, S.plans[0].stints.length - 1);
    g.live.at = at;
    S.computeAll();
    const before = fives(g, at);
    S.setAvailable(g, `p${int(0, size - 1)}`, false);
    S.computeAll();
    if (!S.plans[0]?.ok) continue;
    n++;
    if (fives(g, at).join('|') !== before.join('|')) changed.push(k);
  }
  assert.ok(n >= 70, `only ${n} games planned`);
  assert.deepEqual(changed, [], 'games whose played stints changed');
});

/* ---------------- #449: a rule edit moves little ---------------- */

const TEN = 'ABCDEFGHIJ'.split('');
const base449 = () => ({
  ...emptyC(), openingFive: ['A', 'B', 'C', 'D', 'E'], avoids: [['F', 'G']], keepOnFloor: [['A', 'F']], maxConsecutive: 2,
});
const game449 = seed => game({ names: TEN, periods: 4, periodMinutes: 8, every: 4, seed, c: base449() });
const lineups = () => S.plans[0].stints.map(s => [...s.onFloor].sort());
const seatsMoved = (before, after) => {
  let m = 0;
  for (let i = 1; i < before.length; i++) m += before[i].filter(id => !after[i].includes(id)).length;
  return m;
};
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const EDITS = {
  'Plays at least 8 for A': c => { c.minMinutes.A = 8; },
  'cap 28 for J': c => { c.maxMinutes.J = 28; },
  'Apart I-J': c => { c.avoids.push(['I', 'J']); },
  'soft Together H-I': c => { c.pairs.push(['H', 'I']); },
};
const movedBy = (edit) => {
  const out = [];
  for (let seed = 1; seed <= 10; seed++) {
    const g = game449(seed);
    const before = lineups();
    if (edit) edit(g.constraints); else g.seed = seed + 1000;
    S.computeAll();
    out.push(seatsMoved(before, lineups()));
  }
  return out;
};

test('#449 adding Plays at least 8 for A moves under 5 of 35 seats on average', () => {
  const moved = movedBy(EDITS['Plays at least 8 for A']);
  assert.ok(mean(moved) < 5, `mean ${mean(moved).toFixed(1)} per seed: ${moved.join(' ')}`);
});

test('#449 a cap that changes nothing still moves nothing, and Shuffle still reshuffles', () => {
  assert.deepEqual(movedBy(EDITS['cap 28 for J']), Array(10).fill(0));
  const shuffled = movedBy(null);
  assert.ok(mean(shuffled) >= 14, `Shuffle mean ${mean(shuffled).toFixed(1)}: ${shuffled.join(' ')}`);
});

test('#449 report: the new means for Apart I-J and soft Together H-I', () => {
  for (const name of ['Apart I-J', 'soft Together H-I']) {
    const moved = movedBy(EDITS[name]);
    console.log(`#449 ${name}: mean ${mean(moved).toFixed(1)} (${moved.join(' ')})`);
    assert.ok(mean(moved) < 16.2, `${name} should move fewer seats than a cold solve did`);
  }
});

test('#449 a cold reload solves the plan the warm solve showed', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = game449(seed);
    g.constraints.minMinutes.J = 28;
    S.computeAll();
    const warm = lineups();
    reloaded(g);
    S.computeAll();
    assert.deepEqual(lineups(), warm, `seed ${seed}`);
  }
});

test('#449 renaming a kid after a rule edit moves no seat', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = game449(seed);
    g.constraints.minMinutes.J = 28;
    S.computeAll();
    const before = lineups();
    S.state.players[3].shortName = 'Dee';
    S.computeAll();
    assert.equal(seatsMoved(before, lineups()), 0, `seed ${seed}`);
  }
});

test('#449 undoing the edit gives back the exact plan before it', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = game449(seed);
    const original = lineups();
    const snap = JSON.parse(JSON.stringify(S.state));     // what `undoable` takes before the edit
    g.constraints.minMinutes.J = 28;
    S.computeAll();
    assert.notDeepEqual(lineups(), original, `seed ${seed}: the edit moved something`);
    S.replaceState(snap);
    S.computeAll();
    assert.deepEqual(lineups(), original, `seed ${seed}`);
  }
});

test('#449 undoing the second of two edits gives back the plan the first one made', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = game449(seed);
    g.constraints.minMinutes.J = 28;
    S.computeAll();
    const afterFirst = lineups();
    const snap = JSON.parse(JSON.stringify(S.state));
    g.constraints.maxMinutes.A = 8;
    S.computeAll();
    assert.notDeepEqual(lineups(), afterFirst, `seed ${seed}: the second edit moved something`);
    S.replaceState(snap);
    S.computeAll();
    assert.deepEqual(lineups(), afterFirst, `seed ${seed}`);
  }
});

test('#449 undoing the second edit still works when the app was reloaded between the two', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = game449(seed);
    g.constraints.minMinutes.J = 28;
    S.computeAll();
    const afterFirst = lineups();
    const back = reloaded(g);
    S.computeAll();
    const snap = JSON.parse(JSON.stringify(S.state));
    back.constraints.maxMinutes.A = 8;
    S.computeAll();
    assert.notDeepEqual(lineups(), afterFirst, `seed ${seed}: the second edit moved something`);
    S.replaceState(snap);
    S.computeAll();
    assert.deepEqual(lineups(), afterFirst, `seed ${seed}`);
  }
});
