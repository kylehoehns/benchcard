/* live.js -- #113/#123/#135: the one module that decides where a game
   stands. Two screens disagreeing about whether a game was part-played
   (#113) came from `live.at` being interpreted in five different places --
   `resumeAt`, `openGameMode`, `closeGameMode`, `renderGameMode` and `gmStep`
   each read and clamped it their own way. Every rule about `live.at` lives
   here, once: `stage` decides not-started/part-played/finished, and
   everything else (`resumeAt`, `passStatus`, `openAt`, `stepAt`) is built on
   that one decision rather than re-checking `at` itself.

   #135: "finished" is no longer "reached the last stint" -- it is a saved
   fact, `live.finished === true`, set only by Finish game. `stage` reads
   that flag first; a game on its last stint (or past the end of a plan that
   got shorter) is part-played until the coach says otherwise.

   Pure: no DOM, no state.js, no game object -- a plan and a `live` value
   only, so it stays testable with hand-built plans. Imports only
   `./engine.js`, for `fmtClock`. */
import { fmtClock } from './engine.js';

/* #250: the toast for a hand-off link that cannot be opened. It lives here,
   a module boot already loads, because app.js must be able to show it when
   fetching handoff.js itself fails; handoff.js re-exports it. */
export const DAMAGED_LINK = 'This hand-off link is damaged. Ask for a new one.';

export function stage(p, live) {
  if (!p || !p.ok) return null;
  if (live?.finished === true) return 'finished';
  const at = live?.at || 0;
  if (at <= 0) return 'not-started';
  return 'part-played';
}

/* #247: how many stints of a game underway come before the one on the floor
   -- `live.at`, clamped at zero. No plan needed, for callers (`setAvailable`)
   that have only the game. A finished game keeps its raw `at`; the callers
   that must treat it differently check `live.finished` themselves. */
export function playedStints(live) {
  return Math.max(0, live?.at || 0);
}

/* #247 amendment 12: a finished game has played every stint, so nothing in it
   is left to change. Asked through here because `live.finished` is read in
   this file only (test/live-guard.test.js). */
export const finishedGame = live => live?.finished === true;

/* #247 amendment 10: `live.hand` lists the stint indices the coach set by hand
   (a swap, a Rest of game swap, Sit for the rest); overrides a freeze or a
   re-plan wrote are not in it, and only hand swaps are what the app calls
   "swaps you made". A record from before the list existed has none, and there
   every override was by hand. The one place that reads it. */
export function handStints(live) {
  const ov = live?.overrides || {};
  const keys = Array.isArray(live?.hand) ? live.hand : Object.keys(ov);
  return [...new Set(keys.map(Number))].filter(k => ov[k]).sort((a, b) => a - b);
}

/* The one way a batch of fives -- a swap, or a `resolveRest` answer -- lands
   in `live.overrides`. `byHand` says whether the coach chose them; a write
   that is not by hand takes its stints out of the hand list, since the
   re-plan just replaced whatever the coach had there. */
export function writeOverrides(live, overrides, byHand) {
  const written = Object.keys(overrides).map(Number);
  const hand = handStints(live).filter(k => !written.includes(k));
  Object.assign(live.overrides ||= {}, overrides);
  live.hand = (byHand ? [...hand, ...written] : hand).sort((a, b) => a - b);
}

/* Where "back to the printed plan" starts: everything before tip-off, and
   only the stints after the one on the floor once underway -- what was played
   never goes back. A finished game is reset whole, as it always was. */
export function resetFrom(live) {
  const at = playedStints(live);
  return at > 0 && !finishedGame(live) ? at + 1 : 0;
}

/* #356: the operations below are the only writes to the four fields
   (`at`, `hand`, `overrides`, `finished`) in the app -- storage.js's sanitizer
   builds a whole record and is the one named exception. */

/* The one rule for "hand only lists stints that still have an override": a
   record with a hand list is pruned to it; a record from before the list
   existed has none, stays without one, and there every override is by hand. */
function pruneHand(live) {
  const ov = live.overrides || {};
  if (Array.isArray(live.hand)) live.hand = live.hand.filter(k => ov[k]);
}

/* "Back to the printed plan" for the stints from `keep` on: overrides and hand
   entries below `keep` stay. The one trim -- `clearRest` and Shuffle both
   land here. */
export function keepThrough(live, keep) {
  live.overrides = Object.fromEntries(Object.entries(live.overrides || {}).filter(([k]) => Number(k) < keep));
  pruneHand(live);
}

/* `pins` is a set of fives (stint index -> ids) that go back on the record
   after the trim and are not by hand: the overtime stints whose five the coach
   chose (#369), which "back to the printed plan" restores rather than clears. */
export function clearRest(live, pins = {}) {
  keepThrough(live, resetFrom(live));
  if (Object.keys(pins).length) Object.assign(live.overrides ||= {}, pins);
}

/* A five with `id` in it is no longer a lineup: delete it from stint `from`
   on, and take its stint out of the hand list. */
export function dropPlayer(live, id, from = 0) {
  const ov = live?.overrides;
  if (!ov) return;
  for (const k of Object.keys(ov)) if (Number(k) >= from && ov[k].includes(id)) delete ov[k];
  pruneHand(live);
}

/* Put exactly these fives on the record. `hand` is the new hand list; left
   out, the hand list stays as it was (a record with none stays without).
   Either way it ends listing only stints that have an override. */
export function replaceOverrides(live, overrides, hand) {
  live.overrides = overrides;
  if (hand) live.hand = hand;
  pruneHand(live);
}

/* A record's fives and hand list as they stand, and putting them back exactly
   -- a field that was absent is absent again. The writes above replace the
   objects rather than edit them, so the snapshot holds the originals. */
export function snapshotFives(live) {
  return { overrides: live.overrides, hand: live.hand };
}

export function restoreFives(live, snap) {
  for (const f of ['overrides', 'hand']) {
    if (snap[f] === undefined) delete live[f];
    else live[f] = snap[f];
  }
}

/* The game stands on the stint `openAt` names: a finished game starts over,
   an unfinished one resumes, clamped to a plan that got shorter. */
export function openGame(p, live) {
  live.at = openAt(p, live);
}

/* Move `d` stints, clamped to the plan. True when the stint on the floor
   changed -- a step at either end moves nothing. */
export function step(p, live, d) {
  const was = stintIndex(p, live);
  live.at = stepAt(p, live, d);
  return live.at !== was;
}

export function finish(live) {
  live.finished = true;
}

// `stintIndex` and `stepAt` both land on "the requested stint, clamped to
// the plan's range" -- named once here rather than each repeating the clamp.
const clampToPlan = (p, at) => Math.max(0, Math.min(p.stints.length - 1, at));

export function stintIndex(p, live) {
  return clampToPlan(p, live?.at || 0);
}

export function resumeAt(p, live) {
  if (stage(p, live) !== 'part-played') return null;
  const at = stintIndex(p, live);
  const row = p.stints[at];
  return { at, where: `${row.periodName || 'Q' + row.period} ${fmtClock(row.startSec)}` };
}

export function passStatus(p, live) {
  const s = stage(p, live);
  if (s === 'finished') return { word: 'Finished', cls: 'done' };
  if (s === 'part-played') return { word: 'Underway', cls: 'now' };
  if (p && p.ok) return { word: 'Planned', cls: 'ok' };
  return { word: 'Needs a fix', cls: 'warn' };
}

export function openAt(p, live) {
  return stage(p, live) === 'finished' ? 0 : stintIndex(p, live);
}

export function stepAt(p, live, d) {
  return clampToPlan(p, (live?.at || 0) + d);
}

export function resumeBarAt(days, dayPlans) {
  for (let d = days.length - 1; d >= 0; d--) {
    const gs = days[d].games;
    const dp = dayPlans[d] || [];
    for (let i = gs.length - 1; i >= 0; i--) {
      const r = resumeAt(dp[i] ?? null, gs[i]?.live);
      if (r) return { d, i, ...r };
    }
  }
  return null;
}
