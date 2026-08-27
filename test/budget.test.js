import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evenSlots, rebalance, normalizeSlots, capacityOf, ON_FLOOR } from '../app/budget.js';

const ids = n => Array.from({ length: n }, (_, i) => `p${i}`);
const sum = (t, k) => k.reduce((a, id) => a + (t[id] || 0), 0);

/* ---------------- even distribution ---------------- */

test('an even split uses every slot', () => {
  const k = ids(10);
  const t = evenSlots(k, capacityOf(8));      // 8 stints x 5 = 40 slots
  assert.equal(sum(t, k), 40);
  assert.ok(k.every(id => t[id] === 4));
});

test('a remainder is spread one slot at a time, never dropped', () => {
  const k = ids(9);
  const t = evenSlots(k, capacityOf(8));      // 40 slots across 9
  assert.equal(sum(t, k), 40);
  const vals = k.map(id => t[id]).sort();
  assert.deepEqual(vals, [4, 4, 4, 4, 4, 5, 5, 5, 5]);   // 5x4 + 4x5 = 40
});

test('capacity below the roster size still balances', () => {
  const k = ids(12);
  const t = evenSlots(k, capacityOf(1));      // 5 slots across 12 players
  assert.equal(sum(t, k), 5);
  assert.ok(k.every(id => t[id] <= 1));
});

/* ---------------- rebalancing ---------------- */

const cfg = (over = {}) => ({ ids: ids(10), capacity: 40, maxPerPlayer: 8, ...over });

test('dragging one player to the full game holds the budget exactly', () => {
  const c = cfg();
  const slots = { ...evenSlots(c.ids, c.capacity), p0: 8 };
  const t = rebalance({ ...c, slots, pinned: 'p0' });
  assert.equal(sum(t, c.ids), 40);
  assert.equal(t.p0, 8, 'the dragged slider keeps its value');
});

test('dragging to zero also holds the budget', () => {
  const c = cfg();
  const slots = { ...evenSlots(c.ids, c.capacity), p0: 0 };
  const t = rebalance({ ...c, slots, pinned: 'p0' });
  assert.equal(sum(t, c.ids), 40);
  assert.equal(t.p0, 0);
});

test('locked players never move', () => {
  const c = cfg();
  const slots = { ...evenSlots(c.ids, c.capacity), p0: 7 };
  const t = rebalance({ ...c, slots, locked: ['p1', 'p2'], pinned: 'p0' });
  assert.equal(sum(t, c.ids), 40);
  assert.equal(t.p1, 4);
  assert.equal(t.p2, 4);
});

test('nobody is pushed below zero or above the stint count', () => {
  const c = cfg();
  const slots = { ...evenSlots(c.ids, c.capacity), p0: 8 };
  const t = rebalance({ ...c, slots, pinned: 'p0' });
  assert.ok(c.ids.every(id => t[id] >= 0 && t[id] <= 8), JSON.stringify(t));
});

test('when everyone else is locked, the dragged slider absorbs it back', () => {
  const c = cfg();
  const locked = c.ids.filter(id => id !== 'p0');
  const slots = { ...evenSlots(c.ids, c.capacity), p0: 8 };
  const t = rebalance({ ...c, slots, locked, pinned: 'p0' });
  assert.equal(sum(t, c.ids), 40, 'budget still balances');
  assert.equal(t.p0, 4, 'the impossible request is clawed back, not silently kept');
});

test('rebalance is idempotent on an already-valid allocation', () => {
  const c = cfg();
  const a = evenSlots(c.ids, c.capacity);
  const b = rebalance({ ...c, slots: a });
  assert.deepEqual(b, a);
});

test('rebalance always terminates even on absurd input', () => {
  const c = cfg();
  const slots = Object.fromEntries(c.ids.map(id => [id, 99]));
  const t = rebalance({ ...c, slots });
  assert.equal(sum(t, c.ids), 40);
});

/* ---------------- normalization after the roster or format changes ---------------- */

test('a fresh allocation is even', () => {
  const k = ids(10);
  const t = normalizeSlots({ prev: {}, ids: k, capacity: 40, maxPerPlayer: 8 });
  assert.equal(sum(t, k), 40);
  assert.ok(k.every(id => t[id] === 4));
});

test('a format change rescales the shape without flattening it', () => {
  const before = { p0: 8, p1: 4, p2: 4, p3: 4, p4: 4, p5: 4, p6: 3, p7: 3, p8: 3, p9: 3 };
  const k = ids(11);
  // prevCapacity differs, so the old numbers get rescaled
  const t = normalizeSlots({ prev: before, ids: k, capacity: 40, maxPerPlayer: 8, prevCapacity: 55 });
  assert.equal(sum(t, k), 40);
  assert.ok(t.p10 != null, 'the new player is allocated');
  assert.ok(t.p0 >= 6, `the heavy player stays heavy, got ${t.p0}`);
});

test('at steady state normalization leaves the coach\'s numbers untouched', () => {
  const k = ids(10);
  // deliberately not adding up — free editing is allowed to be mid-flight
  const lopsided = { p0: 8, p1: 1, p2: 4, p3: 4, p4: 4, p5: 4, p6: 4, p7: 4, p8: 4, p9: 4 };
  const t = normalizeSlots({ prev: lopsided, ids: k, capacity: 40, maxPerPlayer: 8, prevCapacity: 40 });
  assert.deepEqual(t, lopsided, 'a repaint must not quietly rebalance the budget');
  assert.equal(sum(t, k), 41, 'and an unbalanced total is allowed to stand');
});

test('a new player at steady state gets a share without disturbing anyone', () => {
  const before = Object.fromEntries(ids(10).map(id => [id, 4]));
  const k = ids(11);
  const t = normalizeSlots({ prev: before, ids: k, capacity: 40, maxPerPlayer: 8, prevCapacity: 40 });
  for (const id of ids(10)) assert.equal(t[id], 4, `${id} moved`);
  assert.ok(t.p10 > 0, 'the newcomer is allocated something');
});

test('removing a player redistributes their slots', () => {
  const before = Object.fromEntries(ids(10).map(id => [id, 4]));
  const k = ids(9);
  const t = normalizeSlots({ prev: before, ids: k, capacity: 40, maxPerPlayer: 8 });
  assert.equal(sum(t, k), 40);
  assert.ok(!('p9' in t), 'the departed player is gone');
});

test('a format change to more stints rescales to the new capacity', () => {
  const before = Object.fromEntries(ids(10).map(id => [id, 4]));   // 8-stint game
  const k = ids(10);
  const t = normalizeSlots({ prev: before, ids: k, capacity: capacityOf(16), maxPerPlayer: 16 });
  assert.equal(sum(t, k), 80);
});

test('a format change to fewer stints clamps nobody over the limit', () => {
  const before = Object.fromEntries(ids(10).map(id => [id, 8]));   // 8-stint game
  const k = ids(10);
  const t = normalizeSlots({ prev: before, ids: k, capacity: capacityOf(4), maxPerPlayer: 4 });
  assert.equal(sum(t, k), 20);
  assert.ok(k.every(id => t[id] <= 4), JSON.stringify(t));
});

test('locks survive normalization', () => {
  const before = { ...Object.fromEntries(ids(10).map(id => [id, 4])), p0: 8, p1: 0 };
  const k = ids(10);
  const t = normalizeSlots({ prev: before, ids: k, capacity: 40, maxPerPlayer: 8, locked: ['p0'] });
  assert.equal(sum(t, k), 40);
  assert.equal(t.p0, 8, 'a locked player is untouched by normalization');
});

test('an empty roster yields an empty allocation rather than throwing', () => {
  assert.deepEqual(normalizeSlots({ prev: {}, ids: [], capacity: 40, maxPerPlayer: 8 }), {});
  assert.deepEqual(evenSlots([], 40), {});
});

test('allocation is deterministic - same input, same output', () => {
  const c = cfg();
  const slots = { ...evenSlots(c.ids, c.capacity), p3: 7 };
  const a = rebalance({ ...c, slots, pinned: 'p3' });
  const b = rebalance({ ...c, slots, pinned: 'p3' });
  assert.deepEqual(a, b);
});

test('normalization is idempotent, so re-rendering never drifts the allocation', () => {
  const k = ids(10);
  const cfgN = { ids: k, capacity: 40, maxPerPlayer: 8 };
  const once = normalizeSlots({ prev: { ...evenSlots(k, 40), p0: 8, p1: 1 }, ...cfgN });
  const twice = normalizeSlots({ prev: once, ...cfgN });
  assert.deepEqual(twice, once);
  assert.equal(sum(once, k), 40);
});

test('a drag followed by a re-render keeps the dragged value', () => {
  const k = ids(10);
  const cfgN = { ids: k, capacity: 40, maxPerPlayer: 8 };
  const dragged = rebalance({ slots: { ...evenSlots(k, 40), p0: 7 }, ...cfgN, pinned: 'p0' });
  assert.equal(dragged.p0, 7);
  const rerendered = normalizeSlots({ prev: dragged, ...cfgN });
  assert.equal(rerendered.p0, 7, 'the slider must not snap back on re-render');
  assert.equal(sum(rerendered, k), 40);
});

/* ================================================================== *
 * season carryover targets (B3)
 *
 * Not a cost term and not new solver machinery: this turns "how far off
 * their share of the season each player is" into the per-player minute
 * targets `engine.js` has always accepted. It is the half of the feature
 * that has to be arguable to a parent, so it is pinned here rather than
 * only through a solved plan.
 * ================================================================== */
import { carryoverTargets } from '../app/budget.js';

const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} vs ${b}`);
// a 32-minute game, five on the floor, ten available: 160 floor-minutes, 16 each
const GAME = { budget: 160, cap: 8, ceiling: 32 };

test('with nobody off their share every target is the even one', () => {
  const k = ids(10);
  const t = carryoverTargets({ ids: k, deficit: {}, ...GAME });
  assert.ok(k.every(id => t[id] === 16));
  near(sum(t, k), 160, 'the targets have to add up or the solver stops honouring them');
});

test('a player owed minutes opens higher and the rest pay for it evenly', () => {
  const k = ids(10);
  const t = carryoverTargets({ ids: k, deficit: { p0: 6 }, ...GAME });
  near(sum(t, k), 160, 'still adds up');
  near(t.p0, 16 + 6 - 0.6, 'the whole deficit, less its own share of the correction');
  assert.ok(k.slice(1).every(id => Math.abs(t[id] - t.p1) < 1e-9), 'everyone else moves together');
  assert.ok(t.p1 < 16);
});

test('a player already above their share gives minutes back', () => {
  const k = ids(10);
  const t = carryoverTargets({ ids: k, deficit: { p0: -6 }, ...GAME });
  assert.ok(t.p0 < 16, 'ahead on the season means a shorter game');
  assert.ok(t.p1 > 16);
  near(sum(t, k), 160, 'still adds up');
});

test('one game corrects by at most the cap, even after the adjustments are centred', () => {
  /* The bug this pins: clamping the deficits and then subtracting their mean
     so the set sums to the budget shifts everyone by a constant afterwards,
     which let the biggest mover land a few tenths past the cap. The band is a
     bound on the result, not on the input. */
  const k = ids(10);
  const t = carryoverTargets({ ids: k, deficit: { p0: 40, p1: -30 }, ...GAME });
  assert.ok(k.every(id => t[id] <= 16 + 8 + 1e-9 && t[id] >= 16 - 8 - 1e-9),
    'nobody may move more than two stints in one game');
  near(t.p0, 24, 'the deep deficit lands exactly on the cap');
  near(sum(t, k), 160, 'still adds up');
});

test('a floor outranks the catch-up and a cap outranks it too', () => {
  const k = ids(10);
  const t = carryoverTargets({
    ids: k, deficit: { p0: 30, p1: -30 }, ...GAME,
    min: { p1: 14 },        // the coach promised p1 fourteen minutes
    max: { p0: 18 },        // and capped p0 at eighteen
  });
  assert.ok(t.p1 >= 14 - 1e-9, 'a floor is the coach\'s word and carryover does not cross it');
  assert.ok(t.p0 <= 18 + 1e-9, 'nor a cap');
  near(sum(t, k), 160, 'still adds up');
});

test('a floor beats the band when the two disagree', () => {
  // 26 is past the +8 band around a 16-minute share; the promise still wins
  const k = ids(10);
  const t = carryoverTargets({ ids: k, deficit: { p0: -30 }, ...GAME, min: { p0: 26 } });
  near(t.p0, 26, 'the band is this feature\'s own restraint, not a promise to anyone');
  near(sum(t, k), 160, 'still adds up');
});

test('targets that cannot be made to add up are not shipped at all', () => {
  // every player capped at 10 min: ten of them cannot cover 160 floor-minutes
  const k = ids(10);
  const max = Object.fromEntries(k.map(id => [id, 10]));
  assert.equal(carryoverTargets({ ids: k, deficit: { p0: 6 }, ...GAME, max }), null,
    'a set that misses the floor budget is worse than none: the solver stops honouring it');
  assert.equal(carryoverTargets({ ids: [], deficit: {}, ...GAME }), null);
  assert.equal(carryoverTargets({ ids: k, deficit: {}, budget: 0 }), null);
});

test('the ceiling is the game, so nobody is targeted at more than they can play', () => {
  const k = ids(6);                       // 6 available, 160/6 = 26.67 each
  const t = carryoverTargets({ ids: k, deficit: { p0: 20 }, budget: 160, cap: 8, ceiling: 32 });
  assert.ok(k.every(id => t[id] <= 32 + 1e-9));
  near(sum(t, k), 160, 'still adds up');
});
