import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';
import { S, bareGame, withTeam, player } from './state-fixture.js';

/* #442: the Rest limit ("Plays at most N in a row") counts across a re-plan
   and into overtime. Seams: `generatePlan` (the new `streakBefore` input) and
   `state.js` (`resolveRest`, `addOvertime`), as resolve-rest.test.js and
   overtime-grow.test.js drive them. */

const LIMIT = 2;
const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
const IDS = players.map(p => p.id);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/* A run that crosses the cut and is over the limit must be answered with a
   CONSEC_EXCEEDED naming the player. A run wholly inside the played stints
   is not the re-plan's to answer for. */
function overBreaks(played, replanned, issues) {
  const named = new Set(issues.filter(i => i.code === 'CONSEC_EXCEEDED').flatMap(i => i.playerIds));
  const bad = [];
  for (const id of IDS) {
    const whole = [...played, ...replanned];
    let run = 0;
    whole.forEach((lu, j) => {
      if (lu.includes(id)) run++; else run = 0;
      if (j >= played.length && run > LIMIT && !named.has(id)) bad.push(`${id}@${j}`);
    });
  }
  return bad;
}

const mk = (seed, extra = {}) => bareGame({
  id: 'g0', seed, live: { at: 0, overrides: {} },
  constraints: { ...S.emptyConstraints(), maxConsecutive: LIMIT }, ...extra,
});

test('a re-plan from any stint keeps the Rest limit across the cut, or names who broke it', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    withTeam(players, [mk(seed)], {}, () => {
      const g = S.state.day.games[0];
      S.computeAll();
      const p = S.plans[0];
      assert.equal(p.ok, true);
      for (let k = 1; k < p.stints.length; k++) {
        const r = S.resolveRest(g, p, k);
        assert.equal(r.ok, true, `seed ${seed} k ${k}: ${r.reason}`);
        const played = S.effectiveStints(g, p).slice(0, k).map(s => s.onFloor);
        const after = p.stints.slice(k).map((s, i) => r.overrides[k + i] || s.onFloor);
        const bad = overBreaks(played, after, r.issues);
        assert.deepEqual(bad, [], `seed ${seed} re-plan from ${k}: over the limit with no note`);
        checked++;
      }
    });
  }
  assert.equal(checked, 8 * 7);
});

test('overtime (Next rotation and Even out) keeps the Rest limit across regulation, or names who broke it', () => {
  for (const who of ['next', 'even']) {
    for (const seed of SEEDS) {
      withTeam(players, [mk(seed)], {}, () => {
        const g = S.state.day.games[0];
        S.computeAll();
        const REG = S.plans[0].stints.length;
        g.live.at = 7;
        S.computeAll();
        assert.ok(S.addOvertime(g, 4, who), `${who} seed ${seed}: overtime not added`);
        const p = S.plans[0];
        const all = S.effectiveStints(g, p).map(s => s.onFloor);
        assert.ok(all.length > REG);
        const bad = overBreaks(all.slice(0, REG), all.slice(REG), p.issues || []);
        assert.deepEqual(bad, [], `${who} seed ${seed}: over the limit with no note`);
      });
    }
  }
});

const input = (extra = {}) => ({
  players, availableIds: IDS,
  stints: Array.from({ length: 6 }, () => ({ period: 1, minutes: 4 })),
  format: { periods: 1, periodMinutes: 24 },
  granularity: { mode: 'everyN', value: 4 },
  constraints: { maxConsecutive: LIMIT },
  strategy: 'balanced', maxSubs: 3,
  ...extra,
});

test('streakBefore: a player already at the limit is not on the first stint', () => {
  for (const seed of SEEDS) {
    const r = generatePlan(input({ seed, streakBefore: { p0: LIMIT } }));
    assert.equal(r.ok, true, `seed ${seed}`);
    assert.ok(!r.stints[0].onFloor.includes('p0'), `seed ${seed}: p0 opens on after ${LIMIT} in a row`);
  }
});

test('streakBefore {} or absent gives identical plans', () => {
  for (const seed of SEEDS) {
    const a = generatePlan(input({ seed }));
    const b = generatePlan(input({ seed, streakBefore: {} }));
    assert.deepEqual(b, a);
  }
});
