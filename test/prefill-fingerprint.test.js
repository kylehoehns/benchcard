/* #569: Platoon and Closers now start filled in for the coach, and "Unit" is
   "Group" in what the engine says. A game whose groups or closers the coach
   already filled must still plan exactly as before. This fingerprint was taken
   on main (2ebc070) before the change: the plan's fives, minutes and the code,
   severity and players of every issue, over seeded games with filled groups
   and filled closers. Messages are left out on purpose: their wording is the
   one thing #569 changes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generatePlan } from '../app/engine.js';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

function game(n) {
  const r = rng(n * 2246822519 + 7);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const size = int(5, 14);
  const players = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, name: `Kid${i} L${i}`, tier: int(1, 5) }));
  const avail = players.map(p => p.id).filter(() => r() > 0.1);
  for (let i = avail.length - 1; i > 0; i--) { const j = int(0, i); [avail[i], avail[j]] = [avail[j], avail[i]]; }
  const format = { periods: [2, 4][int(0, 1)], periodMinutes: int(6, 16) };
  const granularity = { mode: 'everyN', value: int(2, 6) };
  const c = { minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [], openingFive: [], lastPeriodFive: [] };
  if (r() < 0.3 && avail.length > 1) c.avoids.push([avail[0], avail[avail.length - 1]]);
  if (r() < 0.3 && avail.length > 2) c.pairs.push([avail[1], avail[2]]);
  if (r() < 0.2) c.maxConsecutive = int(1, 3);
  const strategy = n % 2 ? 'platoon' : 'closers';
  if (strategy === 'platoon') {
    const pool = [...avail], units = [];
    while (pool.length >= 5 && units.length < 3) units.push(pool.splice(0, 5));
    // now and then a group the coach left short, which blocks the plan
    if (r() < 0.1 && units.length) units[units.length - 1] = units[units.length - 1].slice(0, 4);
    c.units = units; c.closing = null;
  } else {
    c.closing = { stints: int(1, 4), players: avail.slice(0, int(1, Math.min(5, avail.length))) };
    c.units = [];
  }
  return { players, availableIds: avail, format, granularity, constraints: c, strategy,
           balance: ['even', 'start', 'finish', 'both'][int(0, 3)], seed: int(1, 1e6), iterations: 600 };
}

const print = p => JSON.stringify([p.ok, (p.stints || []).map(s => s.onFloor), p.minutes,
  p.issues.map(i => [i.code, i.severity, i.playerIds])]);

test('games with groups or closers already filled plan exactly as they did on main', () => {
  const h = createHash('sha256');
  for (let n = 1; n <= 120; n++) h.update(print(generatePlan(game(n))));
  assert.equal(h.digest('hex'), '4da0476fffc44f2969b8d77fa3552e2c23da9dcb69b5113779f76e0518025974');
});
