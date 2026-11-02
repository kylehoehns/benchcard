/* #443: the longest-sit counts the engine and fuzz tests share. app/state.js
   has `longestSit`, which needs the browser stubs to import; the engine tests
   read the same thing from a plan's stints here without them. */

/* the longest unbroken bench run of `id`, in minutes */
export function longestBench(p, id) {
  let run = 0, best = 0;
  for (const r of p.stints) {
    if (r.onFloor.includes(id)) run = 0;
    else { run += r.minutes; best = Math.max(best, run); }
  }
  return best;
}

/* players with 2+ stints on the floor who sit `min` minutes or more in a row */
export function halfGameSitters(p, min) {
  return Object.keys(p.minutes).filter(id =>
    p.stints.filter(r => r.onFloor.includes(id)).length >= 2 && longestBench(p, id) >= min);
}
