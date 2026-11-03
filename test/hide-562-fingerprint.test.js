/* #562 hides Plan sheet switches a strategy ignores: NO plan changes. A seeded
 * fingerprint of what `computeAll` plans -- the floor of every stint of every
 * game -- for 60 days of two or three games each, over all five strategies,
 * with the switches it hides set at random underneath (Even out earlier
 * games, Even out the season so far, Lineup balance), a filed season to even
 * out against, and the team settings its skip line names (Players changing at
 * once, the league minimum in all four units, Everyone plays in).
 *
 * The hash below was recorded on the UNCHANGED tree, HEAD 775b29f, before any
 * edit for #562, by running this same test there. A display-only change that
 * moves it has moved a plan. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PLAN_FINGERPRINT = '2775a607bc34fefddb686ca92a4e89b62f27afa137a312b0cab90c97a5e9b41a';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

test('the plans of seeded days with hidden switches set underneath are what they were at 775b29f', async () => {
  const { S, withDays, player, bareGame } = await import('./state-fixture.js');
  const r = rng(562);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const strategies = ['balanced', 'minutes', 'closers', 'platoon', 'order'];
  const shapes = ['even', 'start', 'finish', 'both'];
  const out = [];
  for (let k = 0; k < 60; k++) {
    const n = int(7, 11);
    const ids = Array.from({ length: n }, (_, i) => `q${i}`);
    const players = ids.map(id => ({ ...player(id), tier: int(1, 5) }));
    const periods = pick([2, 4]);
    const games = Array.from({ length: int(2, 3) }, (_, i) => {
      const strategy = strategies[(k + i) % strategies.length];
      const g = bareGame({
        id: `g${k}-${i}`, strategy, periods, periodMinutes: pick([8, 12]), granMode: 'everyN', granValue: pick([2, 4]),
        out: r() < 0.3 ? [pick(ids)] : [], useCarryover: r() < 0.6, useSeasonTargets: r() < 0.5,
        balance: pick(shapes), seed: 100 + k * 3 + i,
      });
      if (strategy === 'order') { g.order = [...ids]; g.orderBuilt = true; }
      if (strategy === 'closers') g.constraints.closing = { stints: 2, players: ids.slice(n - 3) };
      if (strategy === 'platoon') g.constraints.units = [ids.slice(0, 5), ids.slice(n - 5)];
      if (r() < 0.3) g.constraints.minMinutes = { [pick(ids)]: int(4, 12) };
      return g;
    });
    const minUnit = pick(['min', 'pct', 'periods', 'full']);
    const settings = {
      maxSubs: int(1, 5), tieBreak: pick(['behind', 'levels']),
      minMinutes: r() < 0.5 ? 0 : { min: int(4, 10), pct: int(20, 40), periods: 1, full: 1 }[minUnit],
      minUnit, playsIn: pick(['off', 'halves', 'periods']),
    };
    const days = [{ name: '', date: '2026-09-22', games }];
    withDays(players, days, settings, () => {
      S.state.teams[0].season = { games: Array.from({ length: 2 }, (_, s) => ({
        id: `sg${k}-${s}`, date: `2026-09-0${s + 1}`, day: '', opponent: 'X', periods: 4, periodMinutes: 8,
        minutes: Object.fromEntries(ids.map((id, i) => [id, 16 + ((i + s + k) % 5) - 2])),
      })) };
      S.computeAll();
      games.forEach((g, i) => {
        const p = S.plans[i];
        out.push({ s: g.strategy, ok: !!p?.ok, floors: (p?.stints || []).map(x => x.onFloor) });
      });
    });
  }
  assert.ok(out.filter(o => o.ok).length > 60, `enough plans solved for the fingerprint to mean something (${out.filter(o => o.ok).length})`);
  for (const s of strategies) assert.ok(out.some(o => o.s === s && o.ok), `a ${s} plan solved`);
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  assert.equal(sha, PLAN_FINGERPRINT);
});
