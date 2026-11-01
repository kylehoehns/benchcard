/*
 * team-ops.js -- the operations that change the record, in a module with no
 * import-time side effects and no DOM (it imports only live.js), so a plain
 * test can run them. `state.js` loads the saved record the moment it is
 * imported; these cannot live there and be tested. `state.js` binds them to
 * the active team.
 */
import { playedStints, finishedGame, dropPlayer } from './live.js';

/* Players carry generated ids. Every constraint, every availability flag and
   all carryover keys off that id, so renaming, reordering or deleting a player
   can never silently reattach Kade's cap to Aaron. */
export const emptyConstraints = () => ({
  // `keepOnFloor` is the third pair relation: never BOTH off. Absent is empty,
  // which is what every record written before it says -- so no version bump.
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [],
  openingFive: [], lastPeriodFive: [], hardPairs: false,
  maxConsecutive: 0, maxBench: 0,
  targetSlots: {}, lockedTargets: [],
  closing: { stints: 2, players: [] },
  units: [],
});

/* Every reference to a player id, in one place, because a missed one does not
   fail loudly -- it renders. A live override left holding a removed id put five
   rows reading "undefined" with "?" avatars on the bench-mode screen, mid-game,
   which is the worst possible place for it. `sanitize` drops overrides whose
   ids no longer resolve, so a reload cleaned it up and it looked intermittent.
   Slots, locks, the closing group and platoon units were unswept too, and so
   was the five an overtime period is pinned to (#382). */
export function removePlayer(team, id) {
  team.players = team.players.filter(p => p.id !== id);
  for (const g of team.days.flatMap(d => d.games)) {
    g.out = g.out.filter(x => x !== id);
    g.late = (g.late || []).filter(x => x !== id);
    const c = g.constraints;
    delete c.minMinutes[id]; delete c.maxMinutes[id];
    delete c.targetSlots?.[id];
    c.lockedTargets = (c.lockedTargets || []).filter(x => x !== id);
    c.pairs = c.pairs.filter(p => !p.includes(id));
    c.avoids = c.avoids.filter(p => !p.includes(id));
    c.keepOnFloor = (c.keepOnFloor || []).filter(p => !p.includes(id));
    c.openingFive = c.openingFive.filter(x => x !== id);
    c.lastPeriodFive = c.lastPeriodFive.filter(x => x !== id);
    if (c.closing) c.closing.players = (c.closing.players || []).filter(x => x !== id);
    c.units = (c.units || []).map(u => u.filter(x => x !== id));
    if (g.overtime) g.overtime = g.overtime.map(o => Array.isArray(o.five) ? { ...o, five: o.five.filter(x => x !== id) } : o);

    /* An override is a whole five the coach chose by hand. With one player
       gone it is no longer a lineup, and there is nothing honest to put in the
       gap -- so drop it and fall back to the planned stint, which is what the
       rest of the game is already using. */
    dropPlayer(g.live, id);
  }
}


/* Sitting a player out is the other half of the sweep above, and it was
   missed. A no-show or a foul-out does not remove anyone from the roster, so
   `removePlayer` never runs -- but an override naming them is just as wrong:
   it is a hand-picked five with someone in it who is not in the gym. It
   survived into bench mode (the absent player shown on the floor, the player
   who should be there shown on the bench) and, worse, onto the *printed
   card*, which is the artefact the coach coaches from. `sanitize` did not
   catch it either, because the ids all still resolve to real players.
   Same answer as removing: drop the five and fall back to the plan. */
export function setAvailable(g, id, available) {
  const wasOut = g.out.includes(id);
  g.out = available ? g.out.filter(x => x !== id) : [...g.out, id];
  // #504: Running late is the part of out that is expected, so it never outlives it
  if (available) g.late = (g.late || []).filter(x => x !== id);
  const live = g.live;
  const at = playedStints(live);
  if (available) {
    /* #247: a kid who walks in to a game underway owes, and is owed, nothing
       for the stints before `at`; `resolveRest` reads this to know that. */
    if (live && wasOut && at > 0 && !finishedGame(live)) live.arrived = { ...live.arrived, [id]: at };
    return;
  }
  // #247: what already happened stays. Only a five still to come is a lineup
  // with an absent kid in it. The raw `at` (a finished game has played them
  // all, so it drops nothing).
  if (!finishedGame(live)) dropPlayer(live, id, at);
}

/* #504: Running late, as opposed to Out (not coming). Only a kid who is out
   can be late; the plan reads `out` alone, so this changes nothing about it. */
export function setLate(g, id, late) {
  if (!g.out.includes(id)) return;
  const rest = (g.late || []).filter(x => x !== id);
  g.late = late ? [...rest, id] : rest;
}

/* The record always holds at least one team: an empty app is expressed as "not
   onboarded", which is the state the welcome screen reads. `blank` returns a
   new empty team (`newTeam('')` in state.js -- the one way a team is built). */
export function removeTeam(record, index, blank) {
  record.teams.splice(index, 1);
  // Removing a team before the active one shifts the active one down a slot;
  // decrement so the same team stays active.
  if (index < record.activeTeam) record.activeTeam -= 1;
  if (!record.teams.length) {
    record.teams.push(blank());
    record.onboarded = false;
  }
  record.activeTeam = Math.max(0, Math.min(record.activeTeam, record.teams.length - 1));
}
