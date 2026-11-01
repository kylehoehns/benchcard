import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';

/* #441: Sits at most N in a row (`maxBench`) counts across a re-plan, the way
   the Plays at most rule does (#442). Seam: `state.js` (`resolveRest`), as
   rest-limit-replan.test.js drives it. */

const LIMIT = 2;
const players = Array.from({ length: 12 }, (_, i) => player(`p${i}`));
const IDS = players.map(p => p.id);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/* A sit run that crosses the cut and is over the limit must be answered with
   a BENCH_EXCEEDED naming the player. A run wholly inside the played stints
   is not the re-plan's to answer for. */
function overBreaks(played, replanned, issues) {
  const named = new Set(issues.filter(i => i.code === 'BENCH_EXCEEDED').flatMap(i => i.playerIds));
  const bad = [];
  for (const id of IDS) {
    let run = 0;
    [...played, ...replanned].forEach((lu, j) => {
      if (lu.includes(id)) run = 0; else run++;
      if (j >= played.length && run > LIMIT && !named.has(id)) bad.push(`${id}@${j}`);
    });
  }
  return bad;
}

test('a re-plan from any stint keeps Sits at most across the cut, or names who broke it', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const game = bareGame({
      id: 'g0', seed, live: { at: 0, overrides: {} },
      constraints: { ...S.emptyConstraints(), maxBench: LIMIT },
    });
    withTeam(players, [game], {}, () => {
      const g = S.state.day.games[0];
      S.computeAll();
      const p = S.plans[0];
      assert.equal(p.ok, true);
      for (let k = 1; k < p.stints.length; k++) {
        const r = S.resolveRest(g, p, k);
        assert.equal(r.ok, true, `seed ${seed} k ${k}: ${r.reason}`);
        const played = S.effectiveStints(g, p).slice(0, k).map(s => s.onFloor);
        const after = p.stints.slice(k).map((s, i) => r.overrides[k + i] || s.onFloor);
        assert.deepEqual(overBreaks(played, after, r.issues), [], `seed ${seed} re-plan from ${k}: over the limit with no note`);
        checked++;
      }
    });
  }
  assert.equal(checked, 8 * 7);
});
