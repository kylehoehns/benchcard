import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';
import { writeOverrides } from '../app/live.js';

/* #533: Sit for the rest and the This stint swap take the same cap retry a
   change of plan does, and a pinned overtime five names a broken cap once.
   Seam: state.js (`resolveRestRelaxing`, the one helper `replanRest`,
   `applySwap` and `sitRest` go through). Fixture and expectations are the
   spec's (docs/specs/533-*.md, "What would settle it"). */

const IDS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
const capped = () => ({ ...S.emptyConstraints(), maxMinutes: { p0: 16, p1: 16 } });
const mk = (extra = {}) => bareGame({
  id: 'g0', seed: 1234, granValue: 4, live: { at: 0, overrides: {} }, constraints: capped(), ...extra,
});
const team = fn => withTeam(IDS.map(id => player(id)), [mk()], {}, () => {
  const g = S.state.day.games[0];
  S.computeAll();
  g.live.at = 1;
  S.computeAll();
  return fn(g, S.plans[0]);
});
const codes = p => (p.issues || []).map(i => i.code);

test('Sit for the rest of an uncapped kid, with two capped kids left, still plans the rest and says who goes over', () => {
  team((g, p) => {
    const sitter = S.effectiveStints(g, p)[1].onFloor.find(id => !['p0', 'p1'].includes(id));
    const r = S.resolveRestRelaxing(g, p, 1, [sitter]);
    assert.equal(r.ok, true, `refused: ${r.reason} ${JSON.stringify((r.issues || []).map(i => i.code))}`);
    for (let k = 1; k < p.stints.length; k++) {
      assert.equal((r.overrides[k] || p.stints[k].onFloor).includes(sitter), false, `${sitter} on at stint ${k}`);
    }
    writeOverrides(g.live, r.overrides, true);
    S.computeAll();
    assert.ok(codes(S.plans[0]).includes('CAP_RELAXED'), codes(S.plans[0]).join());
  });
});

test('This stint swap of the capped kid who is off, for one on the floor, re-plans the rest', () => {
  team((g, p) => {
    const floor = S.effectiveStints(g, p)[1].onFloor;
    const off = ['p0', 'p1'].find(id => !floor.includes(id));
    const out = floor.find(id => !['p0', 'p1'].includes(id));
    assert.ok(off && out, 'the premise: a capped kid is off, an uncapped one on');
    writeOverrides(g.live, { 1: floor.map(id => (id === out ? off : id)) }, true);
    const r = S.resolveRestRelaxing(g, p, 2);
    assert.equal(r.ok, true, `refused: ${r.reason}`);
    assert.ok(Object.keys(r.overrides).some(k => r.overrides[k].join() !== p.stints[k].onFloor.join()), 'later stints did not change');
  });
});

test('a change of plan in the same spot still ends with a plan that says who goes over', () => {
  const ids = [...IDS, 'p6'];
  const g = mk({ periods: 2, periodMinutes: 7, granValue: 3, seed: 1, constraints: { ...S.emptyConstraints(), maxMinutes: { p0: 7, p1: 7 } } });
  withTeam(ids.map(id => player(id)), [g], {}, () => {
    S.computeAll();
    g.live.at = 2;
    S.computeAll();
    S.setAvailable(g, 'p2', false);
    S.computeAll();
    const p = S.plans[0];
    assert.equal(p.ok, true, JSON.stringify(p.issues));
    assert.ok(codes(p).includes('CAP_RELAXED'), codes(p).join());
  });
});

test('with no Plays at most anywhere the retry changes nothing, over seeds 1-20 and four shapes', () => {
  let checked = 0;
  for (const [periods, periodMinutes, granValue] of [[2, 7, 3], [4, 6, 3], [4, 8, 4], [2, 10, 5]]) {
    for (let seed = 1; seed <= 20; seed++) {
      const g = bareGame({ id: 'g0', seed, periods, periodMinutes, granValue, live: { at: 0, overrides: {} }, constraints: S.emptyConstraints() });
      withTeam(IDS.map(id => player(id)), [g], {}, () => {
        S.computeAll();
        const p = S.plans[0];
        if (!p.ok) return;
        for (const k of [1, 2]) {
          for (const sit of [[], ['p2']]) {
            assert.deepEqual(S.resolveRestRelaxing(g, p, k, sit), S.resolveRest(g, p, k, sit), `shape ${periods}x${periodMinutes}/${granValue} seed ${seed} from ${k} sit ${sit}`);
            checked++;
          }
        }
      });
    }
  }
  assert.ok(checked >= 300, `only ${checked} compared`);
});

test('a pinned overtime five that breaks a cap names it once, not twice', () => {
  const tiers = [3, 5, 5, 1, 1, 4, 4, 4, 2, 2];
  const roster = tiers.map((tier, i) => ({ ...player(`p${i}`), tier }));
  const constraints = { ...S.emptyConstraints(), avoids: [['p1', 'p2']], keepOnFloor: [['p3', 'p4']], maxMinutes: { p1: 16 } };
  const g0 = bareGame({ id: 'g0', periods: 4, periodMinutes: 8, granValue: 4, seed: 1, constraints, live: { at: 0, overrides: {} } });
  withTeam(roster, [g0], {}, () => {
    const g = S.state.day.games[0];
    S.computeAll();
    g.live.at = 7;
    S.computeAll();
    S.addOvertime(g, 4, 'strongest');
    S.computeAll();
    const p = S.plans[0];
    const naming = p.issues.filter(i => /PIN_BREAKS_RULE|CAP_RELAXED/.test(i.code) && i.playerIds.includes('p1') && /Plays at most/.test(i.message));
    assert.deepEqual(naming.map(i => i.code), ['PIN_BREAKS_RULE'], naming.map(i => i.message).join(' | '));
  });
});
