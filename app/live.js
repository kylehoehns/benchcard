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

export function stage(p, live) {
  if (!p || !p.ok) return null;
  if (live?.finished === true) return 'finished';
  const at = live?.at || 0;
  if (at <= 0) return 'not-started';
  return 'part-played';
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
