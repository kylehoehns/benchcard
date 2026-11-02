import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';
import { setAvailable } from '../app/team-ops.js';
import './dom-stub.js';
globalThis.window = globalThis;
const { longestSit } = await import('../app/plan-view.js');

/* #537 #541: one count of sitting. Seam: state.js exports, over the fixtures of
   docs/specs/537-one-count-of-sitting.md. Nine players, 4 x 8 minutes, a change
   every 4 (two stints a quarter, 8 in all). */

const IDS = Array.from({ length: 9 }, (_, i) => `p${i}`);
const mk = (seed, extra = {}) => bareGame({
  id: 'g0', seed, periods: 4, periodMinutes: 8, granValue: 4, live: { at: 0, overrides: {} },
  constraints: S.emptyConstraints(), ...extra,
});
const room = (g, fn, settings = {}) => withTeam(IDS.map(id => player(id)), [g], settings, () => {
  S.computeAll();
  return fn(g, S.plans[0]);
});

/* ---------------- #537: a late kid is not sitting before they arrive ---------------- */

/* p8 is out, the game is underway to stint 4 (four stints played), p8 walks in */
function late(fn, extra) {
  const g = mk(1, { out: ['p8'], ...extra });
  return room(g, (gg, p) => {
    gg.live.at = 4;
    S.computeAll();
    setAvailable(gg, 'p8', true);
    S.computeAll();
    assert.deepEqual(gg.live.arrived, { p8: 4 }, 'the premise: p8 arrived at stint 4');
    return fn(gg, S.plans[0]);
  });
}

test('a late kid is not on the bench at or before the stint they walked in during', () => {
  late((g, p) => {
    const bench = S.benchStints(g, p);
    for (let k = 0; k <= 4; k++) assert.ok(!bench[k].sitting.includes('p8'), `p8 is shown sitting at stint ${k + 1}`);
  });
});

test('nobody late: benchStints is effectiveStints, same array', () => {
  room(mk(1), (g, p) => {
    assert.equal(S.benchStints(g, p), S.effectiveStints(g, p));
    g.live.overrides = { 1: p.stints[1].onFloor };
    assert.deepEqual(S.benchStints(g, p), S.effectiveStints(g, p), 'the same answer, not a rebuilt one');
  });
});

test('the premise: effectiveStints alone lists the late kid on the bench before they arrived', () => {
  late((g, p) => {
    assert.equal(S.effectiveStints(g, p).map(s => (s.sitting.includes('p8') ? 'B' : 'F')).join('').slice(0, 5), 'BBBBB');
  });
});

test('the Longest sit for a late kid counts only the stints after they walked in', () => {
  late((g, p) => {
    const sit = longestSit(S.sitStints(g, p), ['p8']);
    assert.ok(sit.minutes <= 3 * 4, `p8 is shown sitting ${sit.minutes} minutes in a row; only 3 stints (12 minutes) come after stint 5`);
  });
});

test('a late kid with Sits at most 2 who sits stints 6 and 7 is told so, and not for the stints before they came', () => {
  late((g, p) => {
    g.constraints.maxBench = 2;
    // hand-set the fives after the arrival: p8 off for stints 6, 7 and 8 -> 3 in a row, over the limit of 2
    const ov = {};
    for (const k of [5, 6, 7]) {
      const floor = p.stints[k].onFloor;
      const sub = IDS.find(id => id !== 'p8' && !floor.includes(id));
      ov[k] = floor.map(id => (id === 'p8' ? sub : id));
    }
    g.live.overrides = ov;
    const notes = S.benchNotes(g, p, [], id => id).filter(n => n.playerIds[0] === 'p8');
    assert.equal(notes.length, 1);
    assert.match(notes[0].message, /^p8 sits 3 stints in a row against a limit of 2/);
  });
});

/* ---------------- #541: overtime does not count toward Sits at most ---------------- */

for (const seed of [1, 2, 3]) {
  test(`seed ${seed}: a kid who sits at the end of regulation and again in overtime is not warned about the overtime`, () => {
    const g = mk(seed, { constraints: { ...S.emptyConstraints(), maxBench: 1 } });
    room(g, (gg, p) => {
      gg.live.at = 7;
      S.computeAll();
      assert.equal(S.addOvertime(gg, 4, 'keep'), true);
      const q = S.plans[0];
      const reg = S.effectiveStints(gg, q).slice(0, 8).map(s => s.onFloor);
      const runOf = id => { let r = 0, b = 0; for (const f of reg) { r = f.includes(id) ? 0 : r + 1; b = Math.max(b, r); } return b; };
      const warned = S.benchNotes(gg, q, [], id => id).map(n => n.playerIds[0]);
      for (const id of warned) assert.ok(runOf(id) > 1, `${id} is warned but sat at most ${runOf(id)} in a row over regulation`);
    });
  });
}
