import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, buildStints } from '../app/engine.js';

/* A seeded generator, so any failure is reproducible from its scenario number. */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

const FIRST = ['Marcus','Eli','Devon','Kade','Aaron','Jack','Jackson','Owen','Silas','Theo',
               'Nate','Cole','Bo','Jack','Ty','Amari','Zeke','Rhys'];

function scenario(n) {
  const r = rng(n * 2654435761);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

  const size = int(5, 14);
  /* Tiers: usually a flat roster, because that is what most coaches will have,
     but often enough a lopsided one -- and sometimes the field is missing
     entirely, which is what every record written before tiers existed looks
     like. All three have to plan. */
  const tierMode = r();
  const tierOf = () => (tierMode < 0.5 ? 3 : tierMode < 0.85 ? int(1, 5) : undefined);
  const players = Array.from({ length: size }, (_, i) => ({
    id: `p${i}`, name: `${pick(FIRST)} L${i}`,
    ...(tierOf() === undefined ? {} : { tier: tierOf() }),
    // sometimes blank or single-word, to keep short-name derivation honest
    ...(r() < 0.08 ? { name: '' } : r() < 0.12 ? { name: pick(FIRST) } : {}),
  }));
  const all = players.map(p => p.id);
  const available = all.filter(() => r() > 0.12);

  const format = { periods: int(1, 4), periodMinutes: int(4, 12) };
  const granularity = pick([
    { mode: 'everyN', value: int(2, 6) },
    { mode: 'perPeriod', value: int(1, 3) },
    { mode: 'breaksOnly' },
  ]);
  const stints = buildStints(format, granularity);
  const gameMinutes = stints.reduce((a, s) => a + s.minutes, 0);

  const c = { minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], openingFive: [], lastPeriodFive: [] };
  const some = () => available.length ? pick(available) : null;

  if (r() < 0.35 && some()) c.maxMinutes[some()] = int(0, gameMinutes);
  if (r() < 0.30 && some()) c.minMinutes[some()] = int(0, gameMinutes);
  if (r() < 0.30) { const a = some(), b = some(); if (a && b && a !== b) c.pairs.push([a, b]); }
  if (r() < 0.30) { const a = some(), b = some(); if (a && b && a !== b) c.avoids.push([a, b]); }
  if (r() < 0.25) c.openingFive = available.slice(0, int(1, 5));
  if (r() < 0.20) c.lastPeriodFive = available.slice(-int(1, 5));
  if (r() < 0.25) c.maxConsecutive = int(1, 4);
  if (r() < 0.20) c.closing = { stints: int(1, 3), players: available.slice(0, Math.min(5, available.length)) };
  if (r() < 0.20) {
    const t = {};
    for (const id of available) if (r() < 0.4) t[id] = int(0, gameMinutes);
    c.targetMinutes = t;
  }

  const carryover = r() < 0.25
    ? Object.fromEntries(all.map(id => [id, int(0, 40)])) : null;

  if (r() < 0.25) c.hardPairs = true;

  /* Until now every one of these scenarios ran the default strategy, so
     closers, platoon and hand-set minutes had never been fuzzed at all -- the
     three knobs most likely to interact badly with a change to the solver.
     They are picked here, and platoon gets real units, because a platoon with
     no units silently falls back to the ordinary search and tests nothing. */
  const strategy = pick(['balanced', 'balanced', 'minutes', 'closers', 'platoon']);
  if (strategy === 'platoon' && available.length >= 5) {
    const pool = [...available];
    const units = [];
    while (pool.length >= 5 && units.length < 3) units.push(pool.splice(0, 5));
    c.units = units;
  }
  if (strategy !== 'closers') c.closing = null;
  if (strategy !== 'platoon') c.units = [];

  const balance = pick(['even', 'even', 'start', 'finish', 'both']);

  return { players, availableIds: available, format, granularity, constraints: c,
           strategy, balance,
           carryover, seed: int(1, 1e6), stints, gameMinutes };
}

const longestRun = (rows, id) => {
  let run = 0, best = 0;
  for (const r of rows) { if (r.onFloor.includes(id)) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
};

test('fuzz: no scenario throws, and every plan is structurally legal', () => {
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const ctx = `scenario ${n}`;
    let p;
    try { p = generatePlan(sc); }
    catch (e) { assert.fail(`${ctx} threw: ${e.stack}`); }

    assert.ok(Array.isArray(p.issues), ctx);

    if (!p.ok) {
      const errs = p.issues.filter(i => i.severity === 'error');
      assert.ok(errs.length, `${ctx}: refused a plan without saying why`);
      assert.ok(errs.every(e => e.code && e.message && e.message.length > 10),
        `${ctx}: an error carried no usable message`);
      continue;
    }

    const availSet = new Set(sc.availableIds);
    for (const r of p.stints) {
      assert.equal(r.onFloor.length, 5, `${ctx} stint ${r.index}: wrong count`);
      assert.equal(new Set(r.onFloor).size, 5, `${ctx} stint ${r.index}: duplicate player`);
      for (const id of r.onFloor) {
        assert.ok(availSet.has(id), `${ctx} stint ${r.index}: ${id} is not available`);
      }
      assert.equal(r.onFloor.length + r.sitting.length, sc.availableIds.length,
        `${ctx} stint ${r.index}: floor + bench should account for everyone available`);
    }

    // stint lengths can be fractional (a 10-min period split three ways), so
    // reconcile within a rounding tolerance rather than exactly
    const total = Object.values(p.minutes).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - sc.gameMinutes * 5) < 0.05,
      `${ctx}: minutes do not reconcile (${total} vs ${sc.gameMinutes * 5})`);

    for (const m of Object.values(p.minutes)) {
      assert.ok(String(m).replace('-', '').replace('.', '').length <= 6,
        `${ctx}: unformatted float leaked into minutes (${m})`);
    }
  }
});

test('fuzz: a hard constraint is either honoured or reported, never silently dropped', () => {
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const p = generatePlan(sc);
    if (!p.ok) continue;
    const ctx = `scenario ${n}`;
    const c = sc.constraints;
    const said = code => p.issues.some(i => i.code === code);

    /* Avoid pairs are enforced outright, with one declared exception: a
       platoon unit is used exactly as the coach wrote it, so a pair inside a
       unit is honoured as written *and* reported as UNIT_AVOID. Silence is
       still a failure; being overruled loudly is not. */
    for (const [a, b] of c.avoids) {
      if (!sc.availableIds.includes(a) || !sc.availableIds.includes(b)) continue;
      const inSameUnit = (c.units || []).some(u => u.includes(a) && u.includes(b));
      for (const r of p.stints) {
        if (!(r.onFloor.includes(a) && r.onFloor.includes(b))) continue;
        assert.ok(inSameUnit && said('UNIT_AVOID'),
          `${ctx}: avoid ${a}/${b} broken at stint ${r.index} with no warning`);
      }
    }

    for (const [id, cap] of Object.entries(c.maxMinutes)) {
      if (!sc.availableIds.includes(id)) continue;
      if (p.minutes[id] > cap + 1e-9) {
        assert.ok(said('CAP_EXCEEDED'), `${ctx}: ${id} blew a ${cap} cap with no warning`);
      }
    }
    for (const [id, need] of Object.entries(c.minMinutes)) {
      if (!sc.availableIds.includes(id)) continue;
      if (p.minutes[id] < need - 1e-9) {
        assert.ok(said('MIN_MISSED'), `${ctx}: ${id} missed a ${need} minimum with no warning`);
      }
    }
    if (c.maxConsecutive) {
      for (const id of sc.availableIds) {
        if (longestRun(p.stints, id) > c.maxConsecutive) {
          assert.ok(said('CONSEC_EXCEEDED'), `${ctx}: ${id} ran past the limit with no warning`);
        }
      }
    }
  }
});

test('fuzz: identical input produces an identical plan', () => {
  for (let n = 1; n <= 120; n++) {
    const sc = scenario(n);
    const a = generatePlan(sc), b = generatePlan(sc);
    assert.equal(a.ok, b.ok, `scenario ${n}`);
    if (a.ok) {
      assert.deepEqual(a.stints.map(r => r.onFloor), b.stints.map(r => r.onFloor), `scenario ${n}`);
      assert.deepEqual(a.minutes, b.minutes, `scenario ${n}`);
    }
  }
});

test('fuzz: short names are always unique and printable', () => {
  for (let n = 1; n <= 200; n++) {
    const sc = scenario(n);
    const p = generatePlan(sc);
    const names = Object.values(p.shortNames || {});
    if (!names.length) continue;
    assert.equal(new Set(names).size, names.length,
      `scenario ${n}: duplicate short names ${JSON.stringify(p.shortNames)}`);
    assert.ok(names.every(v => typeof v === 'string' && v.length >= 1 && v.length <= 5),
      `scenario ${n}: unprintable short name ${JSON.stringify(names)}`);
  }
});

/* ------------------------------------------------------------------ *
 * the promises, over the whole knob space
 *
 * The tests above ask "is the output structurally legal". These ask the
 * different and more important question: does adding a knob quietly cost
 * a coach something they were already relying on? Every one of these
 * runs the same scenario twice -- once with the knob, once without --
 * and compares, so they keep meaning something as the solver is tuned.
 * ------------------------------------------------------------------ */

const minutesSpread = p => {
  const v = Object.values(p.minutes);
  return v.length ? Math.max(...v) - Math.min(...v) : 0;
};

test('property: lineup balance never widens the minutes spread', () => {
  /* The one trade this app must not make. Balance is allowed to rearrange
     who shares the floor; it is not allowed to buy that with anyone's
     minutes. Compared against the identical scenario with the shape off. */
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    if (sc.balance === 'even' || sc.strategy === 'platoon') continue;
    const shaped = generatePlan(sc);
    const flat = generatePlan({ ...sc, balance: 'even' });
    if (!shaped.ok || !flat.ok) continue;
    checked++;
    assert.ok(minutesSpread(shaped) <= minutesSpread(flat) + 1e-9,
      `scenario ${n} (${sc.balance}): spread went ${minutesSpread(flat)} -> ${minutesSpread(shaped)}`);
  }
  assert.ok(checked > 40, `only ${checked} scenarios exercised a shape`);
});

test('property: a flat roster plans identically whatever the shape', () => {
  /* Inertness. A coach who never opens the tier control must not be able to
     tell the feature shipped, no matter which shape happens to be stored. */
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    if (sc.strategy === 'platoon') continue;
    const flatRoster = sc.players.map(p => ({ ...p, tier: 3 }));
    const base = generatePlan({ ...sc, players: flatRoster, balance: 'even' });
    if (!base.ok) continue;
    for (const shape of ['start', 'finish', 'both']) {
      const p = generatePlan({ ...sc, players: flatRoster, balance: shape });
      assert.deepEqual(p.stints.map(r => r.onFloor), base.stints.map(r => r.onFloor),
        `scenario ${n}: ${shape} moved a flat roster`);
    }
    checked++;
  }
  assert.ok(checked > 100, `only ${checked} scenarios compared`);
});

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
    assert.ok(!missing.length || p.issues.length,
      `scenario ${n}: ${missing.join(', ')} named to start but did not, silently`);
  }
  assert.ok(checked > 20, `only ${checked} scenarios named a starting five`);
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

test('property: a rotation level never moves anyone\'s minutes', () => {
  /* The guard on the tie-break, and the strongest form the claim has: hold
     every other input still, change only the levels, and every player's TOTAL
     comes back byte-identical.

     It is structural, not lucky. The search runs twice -- once with the balance
     term switched off, which is what fixes the totals, and once with it on but
     restricted to exchanges between equal-length stints, which cannot move a
     total. Before that split the minutes term was exactly flat across who plays
     the odd stint and the tiers were left holding the casting vote, so marking
     a child developing quietly cost them four minutes a game.

     Three rosters, because "flat vs lopsided" alone would pass on a solver that
     merely ignored the SHAPE of the tiers rather than the tiers themselves. */
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const dress = f => sc.players.map((p, i) => ({ ...p, tier: f(i) }));
    const base = generatePlan({ ...sc, players: dress(() => 3) });
    if (!base.ok) continue;
    checked++;
    for (const [name, f] of [['lopsided', i => (i % 5) + 1], ['reversed', i => 5 - (i % 5)]]) {
      const p = generatePlan({ ...sc, players: dress(f) });
      assert.ok(p.ok, `scenario ${n}: ${name} roster failed to plan`);
      assert.deepEqual(p.minutes, base.minutes,
        `scenario ${n} (${sc.balance}, ${sc.strategy}): the ${name} roster moved somebody's minutes`);
    }
  }
  assert.ok(checked > 100, `only ${checked} scenarios compared`);
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
