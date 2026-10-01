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

export function clearRest(live) {
  const from = resetFrom(live);
  const kept = Object.fromEntries(Object.entries(live.overrides || {}).filter(([k]) => Number(k) < from));
  const hand = handStints(live).filter(k => k < from);
  live.overrides = kept;
  live.hand = hand;
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
