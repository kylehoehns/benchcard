/* #563 folds the two even-out switches into one "Make up minutes from" choice,
 * and #581 stops By hand claiming to even out the day. Saved games are loaded
 * through `sanitizeTeam`, which now maps every game's two flags onto one of
 * three choices. Plans for saved games must not move, except where the spec
 * knowingly maps a combination to a different choice: "season only" (day
 * switch off, season switch on) becomes The season so far, which is both on.
 *
 * So the records below are seeded with all four flag combinations, every
 * strategy, a filed season on most teams (none on the rest) and both values of
 * the old team `seasonDefault`, loaded through `sanitizeTeam` and planned with
 * `computeAll`. Before loading, the test applies that one known mapping itself
 * (`known`), so the hash says: the plans are what the unchanged tree planned,
 * reading "season only" as both on.
 *
 * The hash below was recorded on the UNCHANGED tree, HEAD 82c9ba3, before any
 * edit for #563 or #581, by running this same test there. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PLAN_FINGERPRINT = '6d7e56c4c1c0e4e50bd044939c96db41e8e5f16946430a763303e48e6fc37b64';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

// The one mapping the spec decides changes a choice: season only -> both on.
const known = g => (g.useSeasonTargets && !g.useCarryover ? { ...g, useCarryover: true } : g);

test('saved games plan as they did at 82c9ba3 once loaded, with season only read as both on', async () => {
  const { S } = await import('./state-fixture.js');
  const { sanitizeTeam } = await import('../app/storage.js');
  const r = rng(563);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const strategies = ['balanced', 'minutes', 'closers', 'platoon', 'order'];
  const combos = [[false, false], [true, false], [false, true], [true, true]];
  const out = [];
  const saved = S.state.teams, savedOnboarded = S.state.onboarded;
  S.state.onboarded = true;
  try {
    for (let k = 0; k < 80; k++) {
      const n = int(7, 11);
      const ids = Array.from({ length: n }, (_, i) => `q${i}`);
      const players = ids.map((id, i) => ({ id, name: id, tier: int(1, 5), hue: i }));
      const periods = pick([2, 4]);
      const games = Array.from({ length: int(2, 3) }, (_, i) => {
        const strategy = strategies[(k + i) % strategies.length];
        const [useCarryover, useSeasonTargets] = combos[(k * 3 + i) % 4];
        const g = {
          id: `g${k}-${i}`, label: '', tipoff: `1${i}:00`, strategy, periods, periodMinutes: pick([8, 12]),
          granMode: 'everyN', granValue: pick([2, 4]), out: r() < 0.3 ? [pick(ids)] : [], late: [],
          useCarryover, useSeasonTargets, balance: pick(['even', 'start', 'finish', 'both']), seed: 100 + k * 3 + i,
          live: { at: 0, overrides: {} }, constraints: S.emptyConstraints(),
        };
        if (strategy === 'order') { g.order = [...ids]; g.orderBuilt = true; }
        if (strategy === 'closers') g.constraints.closing = { stints: 2, players: ids.slice(n - 3) };
        if (strategy === 'platoon') g.constraints.units = [ids.slice(0, 5), ids.slice(n - 5)];
        if (r() < 0.3) g.constraints.minMinutes = { [pick(ids)]: int(4, 12) };
        return known(g);
      });
      const filed = r() < 0.75;
      const raw = {
        id: 't', name: 'T', players, activeDay: 0, activeGame: 0,
        days: [{ name: '', date: '2026-09-22', games }],
        season: { games: filed ? Array.from({ length: 2 }, (_, s) => ({
          id: `sg${k}-${s}`, date: `2026-09-0${s + 1}`, day: '', opponent: 'X', periods: 4, periodMinutes: 8,
          minutes: Object.fromEntries(ids.map((id, i) => [id, 16 + ((i * 3 + s + k) % 7) - 3])),
        })) : [] },
        settings: { maxSubs: int(1, 5), tieBreak: pick(['behind', 'levels']), seasonDefault: r() < 0.5 },
      };
      const team = sanitizeTeam(raw, { emptyConstraints: S.emptyConstraints, newGame: S.newGame, today: new Date(2026, 8, 22) });
      S.state.teams = [team];
      S.state.activeTeam = 0;
      S.computeAll();
      team.days[0].games.forEach((g, i) => {
        const p = S.plans[i];
        out.push({ s: g.strategy, ok: !!p?.ok, floors: (p?.stints || []).map(x => x.onFloor) });
      });
    }
  } finally { S.state.teams = saved; S.state.onboarded = savedOnboarded; }
  assert.ok(out.filter(o => o.ok).length > 150, `enough plans solved for the fingerprint to mean something (${out.filter(o => o.ok).length})`);
  for (const s of strategies) assert.ok(out.some(o => o.s === s && o.ok), `a ${s} plan solved`);
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  assert.equal(sha, PLAN_FINGERPRINT);
});
