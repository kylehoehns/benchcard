/* #565 drops Add a game's third step, so a new game always takes the strategy
 * the team used last. Plans must not move: this seeds teams with each strategy
 * as the last game (groups and closers set on some, empty on others), adds a
 * game through `newGame` + `addGame` (the path the flow ends in), plans every
 * game with `computeAll` and hashes the floors.
 *
 * The hash below was recorded on the UNCHANGED tree, HEAD 6e3db04, before any
 * edit for #565, by running this same test there. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PLAN_FINGERPRINT = 'c9f4988d29a4d952c9c2f30ac1fd34ff72f147c4b0bea9d96f8e3eb33856448b';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

test('a game added after each strategy plans as it did at 6e3db04', async () => {
  const { S } = await import('./state-fixture.js');
  const r = rng(565);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const strategies = ['balanced', 'minutes', 'closers', 'platoon', 'order'];
  const out = [];
  const saved = S.state.teams, savedOnboarded = S.state.onboarded;
  S.state.onboarded = true;
  try {
    for (let k = 0; k < 60; k++) {
      const n = int(8, 11);
      const ids = Array.from({ length: n }, (_, i) => `q${i}`);
      const players = ids.map((id, i) => ({ id, name: id, tier: int(1, 5), hue: i }));
      const strategy = strategies[k % strategies.length];
      const set = Math.floor(k / strategies.length) % 2 === 0;
      const g = {
        id: `g${k}`, label: '', tipoff: '10:00', strategy, periods: 4, periodMinutes: 8,
        granMode: 'everyN', granValue: 4, out: r() < 0.3 ? [ids[int(0, n - 1)]] : [], late: [],
        useCarryover: false, useSeasonTargets: false, balance: 'even', seed: 100 + k,
        overtime: [], live: { at: 0, overrides: {} }, constraints: S.emptyConstraints(),
      };
      if (strategy === 'order') { g.order = [...ids]; g.orderBuilt = true; }
      if (strategy === 'closers' && set) g.constraints.closing = { stints: 2, players: ids.slice(n - 3) };
      if (strategy === 'platoon' && set) g.constraints.units = [ids.slice(0, 5), ids.slice(n - 5)];
      const team = {
        id: 't', name: 'T', players, activeDay: 0, activeGame: 0,
        days: [{ name: '', date: '2026-09-22', games: [g] }],
        season: { games: [] }, settings: {},
      };
      S.state.teams = [team];
      S.state.activeTeam = 0;
      const day = team.days[0];
      const ng = S.newGame(day.games.length, day.games[day.games.length - 1], team.settings);
      ng.seed = 900 + k;
      ng.tipoff = '11:30';
      S.addGame(ng, day.date);
      S.computeAll();
      day.games.forEach((x, i) => {
        const p = S.plans[i];
        out.push({ s: x.strategy, ok: !!p?.ok, floors: (p?.stints || []).map(y => y.onFloor) });
      });
    }
  } finally { S.state.teams = saved; S.state.onboarded = savedOnboarded; }
  assert.ok(out.filter(o => o.ok).length > 60, `enough plans solved (${out.filter(o => o.ok).length})`);
  for (const s of strategies) assert.ok(out.some(o => o.s === s && o.ok), `a ${s} plan solved`);
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  assert.equal(sha, PLAN_FINGERPRINT);
});
