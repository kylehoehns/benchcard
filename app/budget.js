// Minute-budget allocation. Pure, no DOM, no engine dependency.
//
// Allocation is modelled in STINT SLOTS rather than minutes. A player's
// minutes are necessarily a whole number of stints, so integer slots make
// every value the coach can dial in exactly achievable: no rounding, and the
// budget always sums to the whole game.

export const ON_FLOOR = 5;

export const capacityOf = stintCount => stintCount * ON_FLOOR;

/** Spread `capacity` slots across `ids` as evenly as integers allow. */
export function evenSlots(ids, capacity) {
  const out = {};
  if (!ids.length) return out;
  const base = Math.floor(capacity / ids.length);
  const extra = capacity - base * ids.length;
  ids.forEach((id, i) => { out[id] = base + (i < extra ? 1 : 0); });
  return out;
}

/**
 * Move slots one at a time until the total lands exactly on `capacity`.
 * Locked players never move. `pinned` (the slider the coach is dragging) is
 * held too, but absorbs the difference itself if nobody else can.
 */
export function rebalance({ slots, ids, capacity, maxPerPlayer, locked = [], pinned = null }) {
  const t = {};
  // clamp on the way in, so the loop below has a bounded amount of work to do
  // and can never exit early leaving an invalid budget behind
  for (const id of ids) t[id] = Math.max(0, Math.min(maxPerPlayer, Math.round(slots[id] || 0)));

  const held = new Set([...locked, ...(pinned ? [pinned] : [])]);
  const movable = ids.filter(id => !held.has(id));

  let diff = ids.reduce((a, id) => a + t[id], 0) - capacity;
  let guard = ids.length * maxPerPlayer + capacity + 16;

  while (diff !== 0 && guard-- > 0) {
    const pool = diff > 0
      ? movable.filter(id => t[id] > 0).sort((a, b) => t[b] - t[a] || (a < b ? -1 : 1))
      : movable.filter(id => t[id] < maxPerPlayer).sort((a, b) => t[a] - t[b] || (a < b ? -1 : 1));

    if (!pool.length) {
      // Nobody left to absorb it. Claw the remainder back off the slider the
      // coach just moved rather than silently breaking the budget.
      if (pinned) t[pinned] = Math.max(0, Math.min(maxPerPlayer, (t[pinned] || 0) - diff));
      break;
    }
    const step = diff > 0 ? -1 : 1;
    t[pool[0]] += step;
    diff += step;
  }
  return t;
}

/**
 * Season carryover targets (B3), in minutes rather than slots.
 *
 * Turns "how far each player is off their share of the season" into the
 * per-player minute targets the solver already accepts. It is an INPUT: no
 * cost term, no change to the objective, nothing here reaches the optimiser
 * except as `constraints.targetMinutes`.
 *
 *   ids        who is available AND does not already have a target or a lock.
 *              A locked row is never in here -- see below.
 *   deficit    minutes owed (positive) or owed back (negative), per id.
 *   budget     the floor-minutes these ids are entitled to between them.
 *   cap        the most one game may correct, either way.
 *   min / max  the coach's floors and caps, in minutes.
 *
 * Each id opens at its even share of `budget` plus its clamped deficit, with
 * the mean of those adjustments taken back out so the set still adds up. Then
 * anyone outside their own floor or cap is pinned there and the difference is
 * shared among whoever is still free, twelve passes at most.
 *
 * Returns null when the result cannot be made to add up exactly -- everyone
 * pinned at a cap, an empty set, a floorless budget. Targets that do not sum
 * to the floor are the condition under which the solver stops honouring them,
 * so standing down is the honest answer, not shipping a set that misses.
 *
 * Deliberately blind to who the players are: ids and minutes, no roster, no
 * levels, no rotation tiers. Catching a kid up is about the clock and nothing
 * else, and this must never quietly become a second strength system.
 */
export function carryoverTargets({ ids, deficit = {}, budget, cap = Infinity, min = {}, max = {}, ceiling = Infinity }) {
  const n = ids.length;
  if (!n || !(budget > 0)) return null;
  const even = budget / n;

  /* Three bounds, resolved in order of how much of a promise each one is. A
     floor is the coach's word and wins outright; a cap is next; the ±cap band
     around the even share is only this feature's own restraint, so it gives
     way to both. Folding the band in here rather than clamping the deficit
     alone is what makes "at most two stints" exactly true: centring the
     adjustments so they sum to zero shifts everyone by a constant afterwards,
     which on its own let the biggest mover drift a few tenths past the cap. */
  const floorOf = id => Math.max(0, Number(min[id]) || 0);
  const capOf = id => Math.min(ceiling, max[id] == null ? Infinity : Number(max[id]));
  const lo = id => Math.max(floorOf(id), Math.min(even - cap, capOf(id)));
  const hi = id => Math.max(lo(id), Math.min(capOf(id), even + cap));

  const adj = ids.map(id => Math.max(-cap, Math.min(cap, Number(deficit[id]) || 0)));
  const mean = adj.reduce((a, v) => a + v, 0) / n;
  const t = {};
  ids.forEach((id, i) => { t[id] = even + adj[i] - mean; });

  let free = ids.slice();
  for (let pass = 0; pass < 12 && free.length; pass++) {
    const outside = free.filter(id => t[id] < lo(id) - 1e-9 || t[id] > hi(id) + 1e-9);
    if (!outside.length) break;
    for (const id of outside) t[id] = t[id] < lo(id) ? lo(id) : hi(id);
    free = free.filter(id => !outside.includes(id));
    if (!free.length) break;
    const gap = budget - ids.reduce((a, id) => a + t[id], 0);
    for (const id of free) t[id] += gap / free.length;
  }
  if (Math.abs(ids.reduce((a, id) => a + t[id], 0) - budget) > 1e-6) return null;
  return t;
}

/**
 * Bring a stored allocation back to a valid state after the roster,
 * availability or game format changed.
 */
export function normalizeSlots({ prev = {}, ids, capacity, maxPerPlayer, locked = [], prevCapacity = null }) {
  if (!ids.length) return {};

  const known = ids.filter(id => prev[id] != null);
  if (!known.length) return evenSlots(ids, capacity);

  const clamp = v => Math.max(0, Math.min(maxPerPlayer, Math.round(v)));

  // Steady state: keep exactly what the coach dialled in. Only fill in players
  // who have no value yet. Forcing the total back to capacity here would
  // silently undo their edits on the next repaint.
  if (prevCapacity === capacity) {
    const t = {};
    const share = Math.round(capacity / ids.length);
    for (const id of ids) t[id] = clamp(prev[id] == null ? share : prev[id]);
    return t;
  }

  // The game format changed, so the old numbers mean something different.
  // Rescale to the new capacity with Hamilton apportionment: scale, floor,
  // then hand leftovers to the largest fractional parts. Preserves the shape
  // instead of shaving the difference off whoever happens to be biggest.
  const lockedHere = locked.filter(id => ids.includes(id));
  const t = {};
  for (const id of lockedHere) t[id] = clamp(prev[id] ?? 0);

  const free = ids.filter(id => !lockedHere.includes(id));
  const freeCapacity = Math.max(0, capacity - lockedHere.reduce((a, id) => a + t[id], 0));
  if (!free.length) return t;

  const share = capacity / ids.length;
  const raw = free.map(id => ({ id, v: Math.max(0, prev[id] == null ? share : prev[id]) }));
  const totalRaw = raw.reduce((a, r) => a + r.v, 0);

  if (totalRaw <= 0) {
    Object.assign(t, evenSlots(free, freeCapacity));
    return rebalance({ slots: t, ids, capacity, maxPerPlayer, locked: lockedHere });
  }

  const scaled = raw.map(r => ({ id: r.id, v: (r.v * freeCapacity) / totalRaw }));
  let used = 0;
  for (const sc of scaled) { t[sc.id] = Math.min(maxPerPlayer, Math.floor(sc.v)); used += t[sc.id]; }
  let left = freeCapacity - used;
  const byRemainder = [...scaled].sort((a, b) =>
    (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || (a.id < b.id ? -1 : 1));
  for (const sc of byRemainder) {
    if (left <= 0) break;
    if (t[sc.id] < maxPerPlayer) { t[sc.id] += 1; left -= 1; }
  }
  return rebalance({ slots: t, ids, capacity, maxPerPlayer, locked: lockedHere });
}
