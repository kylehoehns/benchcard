/* The seeded scenario generator and helpers the test/fuzz-*.test.js files
   share. It holds no tests; node runs a file's tests one after another, so the
   fuzz tests are spread over several files to run side by side. */
import { buildStints } from '../app/engine.js';

/* A seeded generator, so any failure is reproducible from its scenario number. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

export const FIRST = ['Marcus','Eli','Devon','Kade','Aaron','Jack','Jackson','Owen','Silas','Theo',
               'Nate','Cole','Bo','Jack','Ty','Amari','Zeke','Rhys'];

export function scenario(n) {
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

  if (r() < 0.25) c.pairs = c.pairs.map(([a, b]) => [a, b, true]);

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

export const longestRun = (rows, id) => {
  let run = 0, best = 0;
  for (const r of rows) { if (r.onFloor.includes(id)) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
};

export const minutesSpread = p => {
  const v = Object.values(p.minutes);
  return v.length ? Math.max(...v) - Math.min(...v) : 0;
};
