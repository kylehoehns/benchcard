/* #568 replaces the game-wide Force Together switch (`hardPairs`) with a
 * strength on each Together rule. Loading a saved game copies the old switch
 * onto every one of its Together rules. Nothing a saved game plans may move.
 *
 * So the records below are saved in the OLD shape -- `pairs` as two ids each
 * and a game-wide `hardPairs` -- with zero to three Together rules, the switch
 * on or off, some Apart rules (a third of them the chain that refuses a plan
 * under Force Together), some kids out, across two days, 2- and 4-period
 * games, every strategy and some overtime. They are loaded through
 * `sanitizeTeam` and planned with `computeAll`, one day at a time. The hash
 * covers each plan's fives and its sorted note codes (not the note wording,
 * which this change rewrites), so a refusal that moved would show.
 *
 * The hash below was recorded on the UNCHANGED tree, HEAD b7b3e5a, before any
 * edit for #568, by running this same test there. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PLAN_FINGERPRINT = 'e4f9f19db5e112dfc5277c6e20aae163a7cde471e25a42296e82db029eb84ac5';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

test('saved games with Together rules and the old Force Together switch plan as they did at b7b3e5a once loaded', async () => {
  const { S } = await import('./state-fixture.js');
  const { sanitizeTeam } = await import('../app/storage.js');
  const r = rng(568);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const strategies = ['balanced', 'minutes', 'closers', 'platoon', 'order'];
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
        const g = {
          id: `g${k}-${d}-${i}`, label: '', tipoff: `1${i}:00`, strategy, periods, periodMinutes: pick([8, 12]),
          granMode: r() < 0.3 ? 'breaksOnly' : 'everyN', granValue: pick([2, 4]), out: r() < 0.3 ? [pick(ids)] : [], late: [],
          useCarryover: i > 0, useSeasonTargets: false, balance: pick(['even', 'start', 'finish', 'both']), seed: 500 + k * 5 + d * 2 + i,
          live: { at: 0, overrides: {} }, constraints: { ...S.emptyConstraints() },
        };
        if (strategy === 'order') { g.order = [...ids]; g.orderBuilt = true; }
        if (strategy === 'closers') g.constraints.closing = { stints: 2, players: ids.slice(n - 3) };
        if (strategy === 'platoon') g.constraints.units = [ids.slice(0, 5), ids.slice(n - 5)];
        const c = g.constraints;
        // a fresh shuffle of the roster gives distinct players for each rule below
        const deck = [...ids];
        for (let j = deck.length - 1; j > 0; j--) { const x = int(0, j); [deck[j], deck[x]] = [deck[x], deck[j]]; }
        const shape = (k + d + i) % 4; // no pair, one pair, two pairs sharing a player, three pairs
        if (shape === 1) c.pairs = [[deck[0], deck[1]]];
        if (shape === 2) c.pairs = [[deck[0], deck[1]], [deck[0], deck[2]]];
        if (shape === 3) c.pairs = [[deck[0], deck[1]], [deck[2], deck[3]], [deck[4], deck[5]]];
        // the chain: pairs A-B and A-C with B and C set Apart (refused under Force Together only)
        if (shape === 2 && r() < 0.5) c.avoids = [[deck[1], deck[2]]];
        else if (r() < 0.3) c.avoids = [[deck[6], deck[n - 1]]];
        if (r() < 0.2) c.maxMinutes = { [deck[0]]: pick([8, 12]) };
        c.hardPairs = r() < 0.5;
        if (r() < 0.3) g.overtime = [{ minutes: pick([3, 4]), who: pick(['next', 'even', 'strongest']) }];
        return g;
      });
      const raw = {
        id: 't', name: 'T', players, activeDay: 0, activeGame: 0,
        days: [{ name: '', date: '2026-09-15', games: day(0) }, { name: '', date: '2026-09-22', games: day(1) }],
        season: { games: [] },
        settings: { maxSubs: int(1, 5), tieBreak: pick(['behind', 'levels']), periods, periodMinutes: 8 },
      };
      const team = sanitizeTeam(raw, { emptyConstraints: S.emptyConstraints, newGame: S.newGame, today: new Date(2026, 8, 22) });
      S.state.teams = [team];
      S.state.activeTeam = 0;
      for (let d = 0; d < team.days.length; d++) {
        team.activeDay = d;
        S.computeAll();
        team.days[d].games.forEach((g, i) => {
          const p = S.plans[i];
          out.push({
            s: g.strategy, pairs: raw.days[d].games[i].constraints.pairs.length, hard: raw.days[d].games[i].constraints.hardPairs,
            ok: !!p?.ok, codes: (p?.issues || []).map(x => x.code).sort(), floors: (p?.stints || []).map(x => x.onFloor),
          });
        });
      }
    }
  } finally { S.state.teams = saved; S.state.onboarded = savedOnboarded; }
  assert.ok(out.filter(o => o.ok).length > 100, `enough plans solved for the fingerprint to mean something (${out.filter(o => o.ok).length})`);
  for (const s of strategies) assert.ok(out.some(o => o.s === s && o.ok), `a ${s} plan solved`);
  assert.ok(out.some(o => o.ok && o.pairs && o.hard), 'a plan with Force Together on solved');
  assert.ok(out.some(o => o.ok && o.pairs && !o.hard), 'a plan with Force Together off solved');
  assert.ok(out.some(o => o.codes.includes('PAIR_CHAIN_APART')), 'a plan was refused with PAIR_CHAIN_APART');
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  assert.equal(sha, PLAN_FINGERPRINT);
});
