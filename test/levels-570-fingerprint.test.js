/* #570 changes what the player sheet, Settings and Order SAY about levels, and
 * hides Settings' Best players choice while every level is equal: NO plan
 * changes. A seeded fingerprint of what `computeAll` plans -- the floor of
 * every stint -- for 120 games over all five strategies, both ways of giving
 * out the extra minutes, Order built both ways (extra sub, Mix the fives),
 * some overtime, and rosters where every level is equal next to rosters where
 * levels differ, since equal levels are the state the change keys on.
 *
 * The hash below was recorded on the UNCHANGED tree, HEAD 82c9ba3, before any
 * edit for #570, by running this same test there. A display-only change that
 * moves it has moved a plan. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PLAN_FINGERPRINT = '59d35eb975f3c3d48774181b7a6f1c4d77b40a2848c08110bf246bdbd4fa1479';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

test('the plans of seeded games with equal and differing levels are what they were at 82c9ba3', async () => {
  const { S, withTeam, player, bareGame } = await import('./state-fixture.js');
  const r = rng(570);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const strategies = ['balanced', 'minutes', 'closers', 'platoon', 'order'];
  const out = [];
  for (let k = 0; k < 120; k++) {
    const n = int(6, 12);
    const ids = Array.from({ length: n }, (_, i) => `q${i}`);
    const equal = k % 2 === 0;
    const players = ids.map(id => ({ ...player(id), tier: equal ? 3 : int(1, 5) }));
    const strategy = strategies[k % strategies.length];
    const g = bareGame({ id: `g${k}`, strategy, periods: pick([2, 4]), periodMinutes: pick([8, 12, 16]),
      granMode: 'everyN', granValue: pick([2, 3, 4]), balance: pick(['even', 'start', 'finish', 'both']), seed: 700 + k });
    if (strategy === 'order') { g.order = [...ids]; g.orderBuilt = true; if (r() < 0.5) g.orderMix = true; }
    if (strategy === 'closers') g.constraints.closing = { stints: 2, players: ids.slice(n - 3) };
    if (strategy === 'platoon') g.constraints.units = [ids.slice(0, 5), ids.slice(n - 5)];
    if (k % 4 === 0) g.overtime = [{ minutes: pick([3, 4, 5]), who: pick(['next', 'even', 'strongest']) }];
    const settings = { maxSubs: int(1, 5), tieBreak: pick(['behind', 'levels']) };
    withTeam(players, [g], settings, () => {
      S.computeAll();
      const p = S.plans[0];
      out.push({ s: strategy, ok: !!p?.ok, floors: (p?.stints || []).map(x => x.onFloor) });
    });
  }
  assert.ok(out.filter(o => o.ok).length > 60, `enough plans solved for the fingerprint to mean something (${out.filter(o => o.ok).length})`);
  for (const s of strategies) assert.ok(out.some(o => o.s === s && o.ok), `a ${s} plan solved`);
  const sha = createHash('sha256').update(JSON.stringify(out)).digest('hex');
  assert.equal(sha, PLAN_FINGERPRINT);
});
