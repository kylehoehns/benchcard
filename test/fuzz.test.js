import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, buildStints, analyzeFeasibility, isOvertimeStint } from '../app/engine.js';

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
  let granularity = pick([
    { mode: 'everyN', value: int(2, 6) },
    { mode: 'perPeriod', value: int(1, 4) },
    { mode: 'breaksOnly' },
  ]);
  let stints = buildStints(format, granularity);
  let gameMinutes = stints.reduce((a, s) => a + s.minutes, 0);

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

  /* #378: overtime periods, and stint lengths that do not divide the period
     (a short last stint). Drawn last so the draws above stay what they were.
     The stints are rebuilt, so the earlier constraint numbers keep their
     meaning as plain minutes and only the clock under them changes. */
  if (r() < 0.25) {
    format.overtime = Array.from({ length: int(1, 2) }, () => int(3, 5));
  }
  if (r() < 0.25) {
    const n = int(3, 7);
    if (format.periodMinutes % n !== 0) granularity = { mode: 'everyN', value: n };
  }
  /* a starting five whose caps cover the opening stint, for the property that
     says such a five is never blocked */
  stints = buildStints(format, granularity);
  gameMinutes = stints.reduce((a, s) => a + s.minutes, 0);
  if (c.openingFive.length && r() < 0.4) {
    for (const id of c.openingFive) c.maxMinutes[id] = Math.ceil(stints[0].minutes) + int(0, 3); // a coach types whole minutes
  }

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
          const upFront = p.issues.some(i => i.code === 'CONSEC_TOO_FEW' || i.code === 'CONSEC_IMPOSSIBLE'
            || (i.code === 'CONSEC_MIN_CONFLICT' && i.playerIds.includes(id)));
          assert.ok(said('CONSEC_EXCEEDED') || upFront, `${ctx}: ${id} ran past the limit with no warning`);
        }
      }
      /* The DP says a minimum is out of reach under the limit; the engine must
         never have delivered it, or the up-front line claimed the impossible. */
      for (const w of p.issues.filter(i => i.code === 'CONSEC_MIN_CONFLICT')) {
        for (const id of w.playerIds) {
          const both = p.minutes[id] >= c.minMinutes[id] - 1e-9 && longestRun(p.stints, id) <= c.maxConsecutive;
          assert.ok(!both, `${ctx}: ${id} met the minimum within the limit yet CONSEC_MIN_CONFLICT named them`);
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

test('fuzz #378: the generator makes overtime and uneven-stint games, and no warning prints a raw float', () => {
  let overtime = 0, uneven = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    if (sc.format.overtime?.length) overtime++;
    const reg = sc.stints.filter(s => !isOvertimeStint(s));
    if (reg.some(s => Math.abs(s.minutes - reg[0].minutes) > 1e-9)) uneven++;
    for (const i of generatePlan(sc).issues) {
      assert.doesNotMatch(i.message, /\d\.\d{3,}/, `scenario ${n} ${i.code}: ${i.message}`);
    }
  }
  assert.ok(overtime > 0, 'no scenario had overtime');
  assert.ok(uneven > 0, 'no scenario had uneven stints');
});

test('property #378: a starting five whose caps cover the opening stint is never blocked by FORCED_OVER_CAP', () => {
  let exercised = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const five = sc.constraints.openingFive.filter(id => sc.availableIds.includes(id));
    const covered = five.length && five.every(id => {
      const cap = sc.constraints.maxMinutes[id];
      return cap == null || cap >= sc.stints[0].minutes;
    });
    if (!covered) continue;
    if (five.some(id => sc.constraints.maxMinutes[id] != null)) exercised++;
    const issues = analyzeFeasibility({ players: sc.players, availableIds: sc.availableIds,
      constraints: sc.constraints, stints: sc.stints, strategy: sc.strategy, periods: sc.format.periods });
    // players also pinned to the last period may fail that stint's check instead
    const onlyOpening = five.filter(id => !sc.constraints.lastPeriodFive.includes(id));
    assert.deepEqual(issues.filter(i => i.code === 'FORCED_OVER_CAP' && i.playerIds.some(id => onlyOpening.includes(id))), [],
      `scenario ${n}`);
  }
  assert.ok(exercised > 0, 'no scenario had a capped starting five that covers the stint');
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
    const hard = generatePlan({ ...base, constraints: { pairs: [[a, b]], hardPairs: true } });
    assert.ok(hard.spread <= soft.spread + 1e-9,
      `input ${k} (${periods}x${periodMinutes} every ${every}, ${n} players): hard ${hard.spread} vs soft ${soft.spread}`);
  }
  assert.ok(checked >= 12, `only ${checked} inputs were comparable`);
});

/* #437: a live attendance change never rewrites a stint already played, whatever
   the pins. Through `state.js` (`computeAll` + `setAvailable`), which needs the
   browser's `localStorage` and a canvas stub before it loads. Games the
   freeze re-plans: By hand and Platoon rewrite the past on an arrival by design
   (spec 247 E), so they are not generated. */
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
  const CASES = 60;
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
    const strategy = r() < 0.5 ? 'balanced' : 'closers';
    const out = r() < 0.5 ? [ids[int(0, size - 1)]] : [];
    const here = ids.filter(id => !out.includes(id));
    const pickHere = () => here[int(0, here.length - 1)];
    const c = { minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: [], units: [] };
    if (r() < 0.7) c.lastPeriodFive = [...new Set(Array.from({ length: int(1, 3) }, pickHere))];
    if (strategy === 'closers') c.closing = { stints: int(1, 2), players: [...new Set(Array.from({ length: int(1, 3) }, pickHere))] };
    if (r() < 0.3) { const a = pickHere(), b = pickHere(); if (a !== b) c.pairs.push([a, b]); }
    if (r() < 0.3) { const a = pickHere(), b = pickHere(); if (a !== b) c.avoids.push([a, b]); }
    /* Caps go on the kids a pin names (the case this change is about), at most two, and only with 7+
       players. Excluded class, found by this property: a cap on a kid who played every stint so far,
       with 5-6 left, leaves the rest of the game with too few minutes to keep five on the floor
       (CAPS_UNSATISFIABLE after a departure). A cap does that without any pin, and it is a different
       bug (filed as #490). Repro: 7 players, 2 x 7 min, sub every 3, Plays at most 7 on p0 and p1, p2 leaves at live.at 2. */
    const pinned = [...new Set([...c.lastPeriodFive, ...(c.closing?.players || [])])];
    if (size >= 7) for (const id of pinned.slice(0, 2)) if (r() < 0.8) c.maxMinutes[id] = int(1, 2) * periodMinutes;
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
