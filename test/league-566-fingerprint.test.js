/* #566 moves the two "in a row" rules (Plays at most, Sits at most) into a
 * team-wide League rules group in Settings. Each saved game keeps its own
 * value, and loading a team now also works out a team value (the strictest
 * across its games). Nothing a saved game plans may move.
 *
 * So the records below are seeded with games that have neither rule, one, or
 * both, at every value the old picker allowed, across two days, 2- and
 * 4-period games, Breaks only and every-N subs, every strategy, some overtime,
 * and every league minimum unit and plays-in choice. They are loaded through
 * `sanitizeTeam` and planned with `computeAll`, one day at a time.
 *
 * The hash below was recorded on the UNCHANGED tree, HEAD 6e3db04, before any
 * edit for #566, by running this same test there. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PLAN_FINGERPRINT = '977cff93d232c07b2015305e41aa21473390e85c38438893dc4edbab24c2044a';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

test('saved games with and without the in-a-row rules plan as they did at 6e3db04 once loaded', async () => {
  const { S } = await import('./state-fixture.js');
  const { sanitizeTeam } = await import('../app/storage.js');
  const r = rng(566);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const strategies = ['balanced', 'minutes', 'closers', 'platoon', 'order'];
  const units = [['min', 12], ['pct', 50], ['periods', 2], ['full', 1], ['min', 0]];
  const out = [];
  const saved = S.state.teams, savedOnboarded = S.state.onboarded;
  S.state.onboarded = true;
  try {
    for (let k = 0; k < 60; k++) {
      const n = int(7, 11);
      const ids = Array.from({ length: n }, (_, i) => `q${i}`);
      const players = ids.map((id, i) => ({ id, name: id, tier: int(1, 5), hue: i }));
      const periods = pick([2, 4]);
      const day = d => Array.from({ length: int(1, 2) }, (_, i) => {
        const strategy = strategies[(k + d * 2 + i) % strategies.length];
        const breaks = r() < 0.3;
        const g = {
          id: `g${k}-${d}-${i}`, label: '', tipoff: `1${i}:00`, strategy, periods, periodMinutes: pick([8, 12]),
          granMode: breaks ? 'breaksOnly' : 'everyN', granValue: pick([2, 4]), out: r() < 0.3 ? [pick(ids)] : [], late: [],
          useCarryover: i > 0, useSeasonTargets: false, balance: pick(['even', 'start', 'finish', 'both']), seed: 300 + k * 5 + d * 2 + i,
          live: { at: 0, overrides: {} }, constraints: S.emptyConstraints(),
        };
        if (strategy === 'order') { g.order = [...ids]; g.orderBuilt = true; }
        if (strategy === 'closers') g.constraints.closing = { stints: 2, players: ids.slice(n - 3) };
        if (strategy === 'platoon') g.constraints.units = [ids.slice(0, 5), ids.slice(n - 5)];
        const shape = (k + d + i) % 4; // neither, plays at most, sits at most, both
        if (shape & 1) g.constraints.maxConsecutive = int(1, 4);
        if (shape & 2) g.constraints.maxBench = int(1, 4);
        if (r() < 0.3) g.overtime = [{ minutes: pick([3, 4]), who: pick(['next', 'even', 'strongest']) }];
        return g;
      });
      const [minUnit, minMinutes] = units[k % units.length];
      const raw = {
        id: 't', name: 'T', players, activeDay: 0, activeGame: 0,
        days: [{ name: '', date: '2026-09-15', games: day(0) }, { name: '', date: '2026-09-22', games: day(1) }],
        season: { games: [] },
        settings: { maxSubs: int(1, 5), tieBreak: pick(['behind', 'levels']), minUnit, minMinutes,
          playsIn: pick(['off', 'halves', 'periods']), periods, periodMinutes: 8 },
      };
      const team = sanitizeTeam(raw, { emptyConstraints: S.emptyConstraints, newGame: S.newGame, today: new Date(2026, 8, 22) });
      S.state.teams = [team];
      S.state.activeTeam = 0;
      for (let d = 0; d < team.days.length; d++) {
        team.activeDay = d;
        S.computeAll();
        team.days[d].games.forEach((g, i) => {
          const p = S.plans[i];
          out.push({ s: g.strategy, c: [g.constraints.maxConsecutive, g.constraints.maxBench], ok: !!p?.ok, floors: (p?.stints || []).map(x => x.onFloor) });
        });
      }
    }
  } finally { S.state.teams = saved; S.state.onboarded = savedOnboarded; }
  assert.ok(out.filter(o => o.ok).length > 100, `enough plans solved for the fingerprint to mean something (${out.filter(o => o.ok).length})`);
  for (const s of strategies) assert.ok(out.some(o => o.s === s && o.ok), `a ${s} plan solved`);
  assert.ok(out.some(o => o.ok && o.c[0] && o.c[1]), 'a plan with both rules solved');
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  assert.equal(sha, PLAN_FINGERPRINT);
});
