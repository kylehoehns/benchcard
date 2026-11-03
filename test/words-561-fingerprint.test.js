/* #561 wording batch: NO plan changes. A seeded fingerprint of what
 * `computeAll` plans -- the floor of every stint -- for 150 games over all five
 * strategies, both tieBreak values, rules (avoids, pairs, keepOnFloor, min and
 * max minutes, Plays at most, Sits at most, Starts the last period, Closers,
 * Platoon units), 2 and 4 periods, every gran mode (everyN, perPeriod,
 * breaksOnly) and some games with an overtime entry.
 *
 * The hash below was recorded on the UNCHANGED tree, HEAD f22c36a, before any
 * edit of the batch, by running this same test there. It must stay green to the
 * end: a wording ticket that moves it has moved a plan. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PLAN_FINGERPRINT = '8f4698f59286b05da6ffa1f5ecee919e0ebb2e9f04282846c4621d899d273d9d';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

test('the plans of seeded games over every strategy, interval and rule are what they were at f22c36a', async () => {
  const { S, withTeam, player, bareGame } = await import('./state-fixture.js');
  const r = rng(561);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const strategies = ['balanced', 'minutes', 'closers', 'platoon', 'order'];
  const grans = [['everyN', 2], ['everyN', 3], ['everyN', 4], ['everyN', 6], ['perPeriod', 2], ['perPeriod', 3], ['perPeriod', 4], ['breaksOnly', 1]];
  const out = [];
  for (let k = 0; k < 150; k++) {
    const n = int(6, 12);
    const ids = Array.from({ length: n }, (_, i) => `q${i}`);
    const players = ids.map(id => ({ ...player(id), tier: int(1, 5) }));
    const [granMode, granValue] = pick(grans);
    const strategy = strategies[k % strategies.length];
    const g = bareGame({ id: `g${k}`, strategy, periods: pick([2, 4]), periodMinutes: pick([8, 12, 16]), granMode, granValue });
    if (strategy === 'order') { g.order = [...ids]; g.orderBuilt = true; }
    const c = g.constraints;
    const pair = () => { const a = pick(ids), b = pick(ids); return a === b ? null : [a, b]; };
    if (r() < 0.4) c.avoids = [pair()].filter(Boolean);
    if (r() < 0.3) c.pairs = [pair()].filter(Boolean);
    if (r() < 0.2) c.keepOnFloor = [pair()].filter(Boolean);
    if (r() < 0.4) c.minMinutes = { [pick(ids)]: int(2, 14) };
    if (r() < 0.3) c.maxMinutes = { [pick(ids)]: int(4, 20) };
    if (r() < 0.3) c.maxConsecutive = int(1, 3);
    if (r() < 0.3) c.maxBench = int(1, 3);
    if (r() < 0.3) c.lastPeriodFive = ids.slice(0, 5);
    if (strategy === 'closers') c.closing = { stints: 2, players: ids.slice(n - 3) };
    if (strategy === 'platoon') c.units = [ids.slice(0, 5), ids.slice(5, 10).length === 5 ? ids.slice(5, 10) : ids.slice(n - 5)];
    if (k % 5 === 0) g.overtime = [{ minutes: pick([3, 4, 5]), who: pick(['next', 'even']) }];
    const settings = { maxSubs: int(1, 5), tieBreak: pick(['behind', 'levels']) };
    withTeam(players, [g], settings, () => {
      S.computeAll();
      const p = S.plans[0];
      out.push({ s: strategy, ok: p.ok, floors: (p.stints || []).map(x => x.onFloor) });
    });
  }
  assert.ok(out.filter(o => o.ok).length > 60, 'enough plans solved for the fingerprint to mean something');
  assert.ok(out.filter(o => !o.ok).length < 90);
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  assert.equal(sha, PLAN_FINGERPRINT);
});
