import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildStints, fmtClock, deriveShortNames, analyzeFeasibility,
  generatePlan, minPossibleSpread, ON_FLOOR, stintsBeforeHalftime,
} from '../app/engine.js';

const QUARTERS = { periods: 4, periodMinutes: 8 };
const EVERY_4 = { mode: 'everyN', value: 4 };

const roster = (n) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, name: `Player${String.fromCharCode(65 + i)} Last${i}`,
}));
const ids = (n) => roster(n).map(p => p.id);

const plan = (n, over = {}) => generatePlan({
  players: roster(n), availableIds: ids(n),
  format: QUARTERS, granularity: EVERY_4, seed: 7, ...over,
});

/* ---------------- stint construction ---------------- */

test('4x8 subbing every 4 gives 8 equal stints with count-down clocks', () => {
  const s = buildStints(QUARTERS, EVERY_4);
  assert.equal(s.length, 8);
  assert.ok(s.every(x => x.minutes === 4));
  assert.equal(fmtClock(s[0].startSec), '8:00');
  assert.equal(fmtClock(s[0].endSec), '4:00');
  assert.equal(s[2].period, 2);
  assert.equal(fmtClock(s[2].startSec), '8:00');
});

test('uneven interval leaves a short trailing stint', () => {
  const s = buildStints({ periods: 1, periodMinutes: 8 }, { mode: 'everyN', value: 3 });
  assert.deepEqual(s.map(x => x.minutes), [3, 3, 2]);
});

test('a trailing sliver is folded into the previous stint', () => {
  const s = buildStints({ periods: 1, periodMinutes: 8 }, { mode: 'everyN', value: 7 });
  assert.deepEqual(s.map(x => x.minutes), [8]);
});

test('twice per period and period-breaks-only', () => {
  assert.deepEqual(
    buildStints({ periods: 2, periodMinutes: 9 }, { mode: 'perPeriod', value: 2 }).map(x => x.minutes),
    [4.5, 4.5, 4.5, 4.5]);
  assert.deepEqual(
    buildStints(QUARTERS, { mode: 'breaksOnly' }).map(x => x.minutes),
    [8, 8, 8, 8]);
});

test('half clocks render as mm:ss', () => {
  const s = buildStints({ periods: 1, periodMinutes: 9 }, { mode: 'perPeriod', value: 2 });
  assert.equal(fmtClock(s[0].endSec), '4:30');
});

/* ---------------- short names ---------------- */

test('short names collide-resolve to first-three plus last initial', () => {
  const s = deriveShortNames([
    { id: 'a', name: 'Jack Morrison' },
    { id: 'b', name: 'Jackson Reed' },
    { id: 'c', name: 'Devon Ellis' },
  ]);
  assert.equal(s.c, 'DEVO');
  assert.notEqual(s.a, s.b);
  assert.ok(s.a.length <= 5 && s.b.length <= 5);
});

/* ---------------- fairness ---------------- */

test('10 players over 40 slots is a dead-even 16 minutes each', () => {
  const p = plan(10);
  assert.ok(p.ok);
  assert.equal(p.spread, 0);
  for (const id of ids(10)) assert.equal(p.minutes[id], 16);
});

test('9 players cannot beat a one-stint spread, and we hit that floor', () => {
  const p = plan(9);
  assert.ok(p.ok);
  assert.equal(minPossibleSpread(buildStints(QUARTERS, EVERY_4), 9).minutes, 4);
  assert.equal(p.spread, 4);
});

test('every stint fields exactly five and totals reconcile', () => {
  for (const n of [8, 9, 10, 11, 12]) {
    const p = plan(n);
    assert.ok(p.ok, `n=${n}`);
    for (const row of p.stints) assert.equal(row.onFloor.length, ON_FLOOR, `n=${n}`);
    const total = Object.values(p.minutes).reduce((a, b) => a + b, 0);
    assert.equal(total, 32 * ON_FLOOR, `n=${n}`);
  }
});

/* ---------------- rotation quality ---------------- */

test('nobody sits twice running while someone else sits zero', () => {
  for (const n of [8, 9, 10, 11, 12]) {
    const p = plan(n);
    const sits = Object.fromEntries(ids(n).map(id => [id, 0]));
    const streak = Object.fromEntries(ids(n).map(id => [id, 0]));
    let doubled = new Set();
    for (const row of p.stints) {
      for (const id of ids(n)) {
        if (row.onFloor.includes(id)) streak[id] = 0;
        else { sits[id]++; streak[id]++; if (streak[id] >= 2) doubled.add(id); }
      }
    }
    const zero = ids(n).filter(id => sits[id] === 0);
    assert.ok(!(doubled.size && zero.length),
      `n=${n}: ${[...doubled]} sat back-to-back while ${zero} never sat`);
  }
});

test('substitutions stay inside the 1-3 window, never a wholesale five', () => {
  for (const n of [8, 10, 12]) {
    const p = plan(n);
    for (let i = 1; i < p.stints.length; i++) {
      const subs = p.stints[i].in.length;
      assert.ok(subs >= 1 && subs <= 3, `n=${n} stint ${i} subbed ${subs}`);
      assert.equal(p.stints[i].in.length, p.stints[i].out.length);
    }
  }
});

/* ---------------- constraints ---------------- */

test('a cap is respected', () => {
  const p = plan(10, { constraints: { maxMinutes: { p3: 8 } } });
  assert.ok(p.ok);
  assert.ok(p.minutes.p3 <= 8, `got ${p.minutes.p3}`);
});

test('a minimum is met', () => {
  const p = plan(10, { constraints: { minMinutes: { p3: 24 } } });
  assert.ok(p.ok);
  assert.ok(p.minutes.p3 >= 24, `got ${p.minutes.p3}`);
});

test('avoid pairs never share the floor', () => {
  const p = plan(10, { constraints: { avoids: [['p0', 'p1']] } });
  assert.ok(p.ok);
  for (const row of p.stints) {
    assert.ok(!(row.onFloor.includes('p0') && row.onFloor.includes('p1')), `stint ${row.index}`);
  }
});

test('the opening five is honored', () => {
  const p = plan(10, { constraints: { openingFive: ['p0', 'p1', 'p2'] } });
  assert.ok(p.ok);
  for (const id of ['p0', 'p1', 'p2']) assert.ok(p.stints[0].onFloor.includes(id));
});

test('players pinned to the last period are on the floor to start it', () => {
  const p = plan(10, { constraints: { lastPeriodFive: ['p7', 'p8'] } });
  assert.ok(p.ok);
  const first4th = p.stints.find(r => r.period === 4);
  for (const id of ['p7', 'p8']) assert.ok(first4th.onFloor.includes(id));
});

test('a soft pair shares the floor most of the game and reports its actual time', () => {
  const p = plan(10, { constraints: { pairs: [['p0', 'p1']] } });
  assert.ok(p.ok);
  const rep = p.pairs[0];
  // both play 16 of 32 minutes, so 16 together is the ceiling -- not 32
  assert.equal(rep.of, 16);
  assert.ok(rep.together >= 12, `only ${rep.together} of ${rep.of} min together`);
});

/* ---------------- never both off the court ----------------
 * The third pair relation, and the one that constrains the BENCH rather than
 * the floor. The standard it has to meet is the competitor's: a chosen pair
 * benched together in a quarter of all stints goes to none of them.
 * -------------------------------------------------------------------- */

const bothOff = (p, a, b) => p.stints.filter(r => !r.onFloor.includes(a) && !r.onFloor.includes(b)).length;

test('a keepOnFloor pair is never both on the bench', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const on = plan(10, { seed, constraints: { keepOnFloor: [['p2', 'p5']] } });
    assert.ok(on.ok);
    assert.equal(bothOff(on, 'p2', 'p5'), 0, `seed ${seed} left them both sitting`);
  }
});

test('without the rule the same pair does sit together', () => {
  // the "before" half of the measurement, pinned so a regression in the term
  // cannot be mistaken for the pair never having sat together anyway
  let sat = 0;
  for (const seed of [1, 2, 3, 4, 5]) sat += bothOff(plan(10, { seed }), 'p2', 'p5');
  assert.ok(sat > 0, 'baseline never benched them together, so the test proves nothing');
});

test('keepOnFloor is not the inverse of avoids, and the two together mean exactly one', () => {
  const p = plan(10, { constraints: { avoids: [['p0', 'p1']], keepOnFloor: [['p0', 'p1']] } });
  assert.ok(p.ok, 'never both on plus never both off is satisfiable, not a conflict');
  assert.ok(!p.issues.some(i => i.code === 'PAIR_AVOID_CONFLICT'));
  for (const row of p.stints) {
    const n = (row.onFloor.includes('p0') ? 1 : 0) + (row.onFloor.includes('p1') ? 1 : 0);
    assert.equal(n, 1, `stint ${row.index} had ${n} of them on`);
  }
});

test('a keepOnFloor pair with one player away is dropped, not turned into "the other plays every minute"', () => {
  const p = generatePlan({
    players: roster(10), availableIds: ids(10).filter(id => id !== 'p5'),
    format: QUARTERS, granularity: EVERY_4, seed: 7, constraints: { keepOnFloor: [['p2', 'p5']] },
  });
  assert.ok(p.ok);
  assert.ok(p.issues.some(i => i.code === 'KEEPON_DROPPED'));
  assert.ok(p.minutes.p2 < 32, `p2 played ${p.minutes.p2} of 32`);
});

test('a plan with no keepOnFloor rule is byte-identical to one that has never heard of it', () => {
  for (const seed of [1, 2, 3]) {
    const a = JSON.stringify(plan(11, { seed }));
    const b = JSON.stringify(plan(11, { seed, constraints: { keepOnFloor: [] } }));
    assert.equal(a, b);
  }
});

/* ---------------- infeasibility is named, not swallowed ---------------- */

const errs = p => p.issues.filter(i => i.severity === 'error');

test('caps that cannot cover the game between them refuse a keepOnFloor pair', () => {
  const p = plan(10, { constraints: { keepOnFloor: [['p2', 'p5']], maxMinutes: { p2: 8, p5: 8 } } });
  assert.equal(p.ok, false);
  const e = errs(p).find(x => x.code === 'KEEPON_UNSATISFIABLE');
  assert.ok(e);
  assert.match(e.message, /16 of the game's 32 minutes/);
});

test('a pinned five with neither of them in it is refused', () => {
  for (const key of ['openingFive', 'lastPeriodFive']) {
    const p = plan(10, { constraints: { keepOnFloor: [['p2', 'p5']], [key]: ['p0', 'p1', 'p3', 'p4', 'p6'] } });
    assert.equal(p.ok, false, key);
    assert.ok(errs(p).some(x => x.code === 'FORCED_GROUP_KEEPON'), key);
  }
  const p = plan(10, { constraints: { keepOnFloor: [['p2', 'p5']], closing: { stints: 2, players: ['p0', 'p1', 'p3', 'p4', 'p6'] } } });
  assert.equal(p.ok, false);
  assert.ok(errs(p).some(x => x.code === 'FORCED_GROUP_KEEPON'));
});

test('a platoon unit with neither of them is a warning, and the unit wins', () => {
  const p = plan(10, {
    strategy: 'platoon',
    constraints: { keepOnFloor: [['p2', 'p5']], units: [['p0', 'p1', 'p3', 'p4', 'p6'], ['p2', 'p5', 'p7', 'p8', 'p9']] },
  });
  assert.ok(p.ok);
  const w = p.issues.find(i => i.code === 'UNIT_KEEPON');
  assert.ok(w);
  assert.equal(w.severity, 'warn');
  // and the fixed fives are still used verbatim, so KEEPON_PARTIAL stays quiet
  assert.ok(!p.issues.some(i => i.code === 'KEEPON_PARTIAL'));
});

test('minimums that exceed the floor-minutes name the offenders', () => {
  const p = plan(10, { constraints: { minMinutes: { p0: 32, p1: 32, p2: 32, p3: 32, p4: 32, p5: 32 } } });
  assert.equal(p.ok, false);
  const e = errs(p).find(x => x.code === 'MINS_UNSATISFIABLE');
  assert.ok(e);
  assert.match(e.message, /192 minutes/);
  assert.match(e.message, /160 floor-minutes/);
});

test('caps too tight to field five is its own error', () => {
  const caps = Object.fromEntries(ids(10).map(id => [id, 8]));
  const p = plan(10, { constraints: { maxMinutes: caps } });
  assert.equal(p.ok, false);
  assert.ok(errs(p).some(x => x.code === 'CAPS_UNSATISFIABLE'));
});

test('an avoid graph with no legal five is caught before searching', () => {
  const avoids = [];
  const g = ids(6);
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) avoids.push([g[i], g[j]]);
  const p = generatePlan({
    players: roster(6), availableIds: ids(6),
    format: QUARTERS, granularity: EVERY_4, seed: 1, constraints: { avoids },
  });
  assert.equal(p.ok, false);
  assert.ok(errs(p).some(x => x.code === 'AVOID_IMPOSSIBLE'));
});

test('pair and avoid on the same two players is a contradiction', () => {
  const p = plan(10, { constraints: { pairs: [['p0', 'p1']], avoids: [['p0', 'p1']] } });
  assert.equal(p.ok, false);
  assert.ok(errs(p).some(x => x.code === 'PAIR_AVOID_CONFLICT'));
});

test('fewer than five available is refused up front', () => {
  const p = generatePlan({
    players: roster(10), availableIds: ids(4),
    format: QUARTERS, granularity: EVERY_4, seed: 1,
  });
  assert.equal(p.ok, false);
  assert.ok(errs(p).some(x => x.code === 'NOT_ENOUGH_PLAYERS'));
});

test('a min above a cap for the same player is called out', () => {
  const p = plan(10, { constraints: { minMinutes: { p2: 20 }, maxMinutes: { p2: 10 } } });
  assert.equal(p.ok, false);
  assert.ok(errs(p).some(x => x.code === 'MIN_ABOVE_CAP'));
});

test('constraints naming an unavailable player warn instead of failing', () => {
  const p = generatePlan({
    players: roster(10), availableIds: ids(10).filter(id => id !== 'p9'),
    format: QUARTERS, granularity: EVERY_4, seed: 3,
    constraints: { pairs: [['p0', 'p9']] },
  });
  assert.ok(p.ok);
  assert.ok(p.issues.some(i => i.code === 'PAIR_DROPPED'));
});

/* ---------------- tournament carryover ---------------- */

test('a player light in game one plays heavier in game two', () => {
  /* Nine players over forty slots means four play 20 and five play 16, so
     "everyone light in game one is heavy in game two" is arithmetically
     impossible -- there are five light players and only four long ends to hand
     out. The checkable half is the other side of the trade, and it is the
     stronger claim anyway: EVERY player who took the long end in game one
     gives it up in game two. Asserting it of one arbitrarily chosen light
     player, as this used to, was really asserting that the tie among the five
     of them broke a particular way. */
  const g1 = plan(9);
  const longEnd = m => Math.max(...ids(9).map(id => m[id]));
  const heavies = ids(9).filter(id => g1.minutes[id] === longEnd(g1.minutes));
  assert.ok(heavies.length && heavies.length < 9, 'game one was already even');

  const g2 = plan(9, { carryover: g1.minutes, seed: 11 });
  assert.ok(g2.ok);
  for (const id of heavies) {
    assert.ok(g2.minutes[id] < longEnd(g2.minutes),
      `${id} took the long end in both games: ${g1.minutes[id]} then ${g2.minutes[id]}`);
  }

  const dayTotals = ids(9).map(id => g1.minutes[id] + g2.minutes[id]);
  const daySpread = Math.max(...dayTotals) - Math.min(...dayTotals);
  assert.ok(daySpread <= g1.spread, `day spread ${daySpread} vs single-game ${g1.spread}`);
});

/* ---------------- determinism ---------------- */

test('same seed produces the identical card; a different seed does not', () => {
  const a = plan(11);
  const b = plan(11);
  assert.deepEqual(a.stints.map(r => r.onFloor), b.stints.map(r => r.onFloor));
  const c = plan(11, { seed: 99 });
  assert.notDeepEqual(a.stints.map(r => r.onFloor), c.stints.map(r => r.onFloor));
});

test('carryover games do not claim their minutes are even', () => {
  const g1 = plan(9);
  const g2 = plan(9, { carryover: g1.minutes, seed: 11 });
  const codes = g2.issues.map(i => i.code);
  assert.ok(codes.includes('CARRYOVER_ACTIVE'));
  assert.ok(!codes.includes('SPREAD_EVEN'));
  const even = plan(10);
  assert.ok(even.issues.some(i => i.code === 'SPREAD_EVEN'));
  assert.equal(even.spread, 0);
});

test('an explicit short name overrides the derived one', () => {
  const s = deriveShortNames([
    { id: 'a', name: 'Jack Morrison', shortName: 'JACK' },
    { id: 'b', name: 'Jackson Reed' },
    { id: 'c', name: 'Devon Ellis' },
  ]);
  assert.equal(s.a, 'JACK');
  assert.equal(s.c, 'DEVO');
  assert.notEqual(s.b, s.a);
});

test('stable ids survive roster reordering', () => {
  const a = [{ id: 'x9', name: 'Marcus Webb' }, { id: 'k2', name: 'Eli Tran' }];
  const b = [{ id: 'k2', name: 'Eli Tran' }, { id: 'x9', name: 'Marcus Webb' }];
  const sa = deriveShortNames(a), sb = deriveShortNames(b);
  assert.equal(sa.x9, sb.x9);
  assert.equal(sa.k2, sb.k2);
});

/* ---------------- minute targets ---------------- */

test('a minute target is honoured and the rest water-fill around it', () => {
  const p = plan(10, { constraints: { targetMinutes: { p0: 24, p1: 8 } } });
  assert.ok(p.ok);
  assert.equal(p.minutes.p0, 24);
  assert.equal(p.minutes.p1, 8);
  const rest = ids(10).filter(id => id !== 'p0' && id !== 'p1').map(id => p.minutes[id]);
  assert.equal(rest.reduce((a, b) => a + b, 0), 160 - 32);
  assert.ok(Math.max(...rest) - Math.min(...rest) <= 4);
});

test('targets over the budget still plan, but say so by name', () => {
  const t = Object.fromEntries(ids(10).map(id => [id, 24]));
  const p = plan(10, { constraints: { targetMinutes: t } });
  assert.ok(p.ok, 'a mismatch is guidance, not a blocker');
  const e = p.issues.find(i => i.code === 'TARGETS_OVER_BUDGET');
  assert.ok(e);
  assert.match(e.message, /240/);
  assert.equal(e.severity, 'warn');
  assert.equal(Object.values(p.minutes).reduce((a, b) => a + b, 0), 160);
});

test('targets that under-fill still plan, and the spare minutes go somewhere', () => {
  const t = Object.fromEntries(ids(10).map(id => [id, 12]));
  const p = plan(10, { constraints: { targetMinutes: t } });
  assert.ok(p.ok);
  const e = p.issues.find(i => i.code === 'TARGETS_UNDER_BUDGET');
  assert.ok(e);
  assert.equal(e.severity, 'warn');
  assert.equal(Object.values(p.minutes).reduce((a, b) => a + b, 0), 160,
    'the floor is still filled for every stint');
});

test('spare minutes are shared in proportion, so a small ask stays small', () => {
  /* The reproduction a coach hit, and the behaviour that replaced it. Ten
     available, one player dialled to 4 minutes and the rest left at 16: the
     asks total 148 of 160, and the missing 12 have to be played by somebody.

     They used to land on the smallest ask, because the target cost is flat
     across every way of placing a surplus -- so the spread term broke the tie
     and pushed the 4 up. Sharing the surplus in proportion to the asks keeps a
     small ask small, and brings the targets back to summing to the floor,
     which is the condition under which they are honoured at all. */
  const targets = { p0: 4 };
  for (let i = 1; i < 10; i++) targets['p' + i] = 16;
  const p = plan(10, { constraints: { targetMinutes: targets } });
  assert.ok(p.ok);
  assert.equal(p.minutes.p0, 4, 'the small ask is honoured');
  assert.equal(Object.values(p.minutes).reduce((a, b) => a + b, 0), 160);
});

test('a lock outranks the rule against sitting somebody for ages', () => {
  /* Six available, one asked for 4 minutes. Honouring that means they sit
     seven stints in a row, and "nobody sits forever" is worth roughly 180
     against the 240 for missing the target -- close enough that the solver
     split the difference and played them 8.

     A locked row settles it: a minute off a locked target costs the same as
     breaking a floor or a cap, because that is what a lock is. Unlocked, the
     sit penalty still wins, which is the right default on a thin bench. */
  const targets = { p0: 4, p1: 28, p2: 28, p3: 28, p4: 24, p5: 24 };
  const loose = plan(6, { constraints: { targetMinutes: targets } });
  const pinned = plan(6, { constraints: { targetMinutes: targets, lockedTargets: ['p0'] } });
  assert.ok(loose.ok && pinned.ok);
  assert.ok(loose.minutes.p0 > 4, 'unlocked, a thin bench still overrides the ask');
  assert.equal(pinned.minutes.p0, 4, 'locked, the number holds');
  assert.equal(Object.values(pinned.minutes).reduce((a, b) => a + b, 0), 160);
});

test('a lock cannot be smuggled in for a player who is not available', () => {
  const targets = { p0: 4 }; for (let i = 1; i < 10; i++) targets['p' + i] = 16;
  const p = plan(10, { constraints: { targetMinutes: targets, lockedTargets: ['ghost', 'p0'] } });
  assert.ok(p.ok);
  assert.equal(p.minutes.p0, 4);
});

test('the same target is met exactly once the targets add up to the whole floor', () => {
  // Same low number, same roster, but the other five raised until the budget
  // is exact -- which is what "Even out the rest" does with the row locked.
  const p = plan(6, { constraints: { targetMinutes: { p0: 4, p1: 32, p2: 32, p3: 32, p4: 32, p5: 28 } } });
  assert.ok(p.ok);
  assert.equal(p.minutes.p0, 4);
});

test('a partial set of targets is honoured exactly, others absorb the rest', () => {
  const p = plan(10, { constraints: { targetMinutes: { p0: 24, p1: 8 } } });
  assert.ok(p.ok);
  assert.equal(p.minutes.p0, 24);
  assert.equal(p.minutes.p1, 8);
  assert.ok(!p.issues.some(i => i.code === 'TARGETS_UNDER_BUDGET'));
});

/* ---------------- closers ---------------- */

test('the closing group holds the floor for the closing window', () => {
  const closers = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const p = plan(10, { constraints: { closing: { stints: 2, players: closers } } });
  assert.ok(p.ok);
  for (const r of p.stints.slice(-2)) {
    assert.deepEqual([...r.onFloor].sort(), [...closers].sort(), `stint ${r.index}`);
  }
});

test('closers still leave the earlier minutes close to even', () => {
  const p = plan(10, { constraints: { closing: { stints: 2, players: ['p0','p1','p2','p3','p4'] } } });
  const others = ['p5','p6','p7','p8','p9'].map(id => p.minutes[id]);
  assert.ok(Math.max(...others) - Math.min(...others) <= 4);
});

test('a closing group that cannot legally share the floor is refused', () => {
  const p = plan(10, { constraints: {
    closing: { stints: 2, players: ['p0','p1','p2','p3','p4'] },
    avoids: [['p0', 'p1']],
  } });
  assert.equal(p.ok, false);
  assert.ok(p.issues.some(i => i.code === 'CLOSERS_AVOID'));
});

/* ---------------- consecutive-stint cap ---------------- */

test('nobody exceeds the consecutive-stint limit', () => {
  for (const n of [9, 10, 12]) {
    const p = plan(n, { constraints: { maxConsecutive: 2 } });
    assert.ok(p.ok, `n=${n}`);
    for (const id of ids(n)) {
      let run = 0, worst = 0;
      for (const r of p.stints) { if (r.onFloor.includes(id)) { run++; worst = Math.max(worst, run); } else run = 0; }
      assert.ok(worst <= 2, `n=${n} ${id} ran ${worst} straight`);
    }
  }
});

test('a consecutive limit still keeps minutes fair', () => {
  const p = plan(10, { constraints: { maxConsecutive: 2 } });
  assert.equal(p.spread, 0);
});

/* ---------------- platoon ---------------- */

test('platoon alternates whole units', () => {
  const units = [['p0','p1','p2','p3','p4'], ['p5','p6','p7','p8','p9']];
  const p = plan(10, { strategy: 'platoon', constraints: { units } });
  assert.ok(p.ok);
  p.stints.forEach(r => {
    const u = units[r.index % 2];
    assert.deepEqual([...r.onFloor].sort(), [...u].sort());
  });
  assert.equal(p.spread, 0);
});

test('a wrong-sized unit is refused, and leftovers are flagged', () => {
  const bad = plan(10, { strategy: 'platoon', constraints: { units: [['p0','p1','p2']] } });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some(i => i.code === 'UNIT_WRONG_SIZE'));

  const left = plan(12, { strategy: 'platoon', constraints: { units: [['p0','p1','p2','p3','p4'], ['p5','p6','p7','p8','p9']] } });
  assert.ok(left.issues.some(i => i.code === 'UNIT_LEFTOVERS'));
});

/* ---------------- interactions between the new features ---------------- */

test('closers survive a consecutive-stint limit', () => {
  const closers = ['p0','p1','p2','p3','p4'];
  const p = plan(10, { constraints: { closing: { stints: 2, players: closers }, maxConsecutive: 3 } });
  assert.ok(p.ok);
  for (const r of p.stints.slice(-2)) assert.deepEqual([...r.onFloor].sort(), [...closers].sort());
});

test('minute targets compose with a cap without silently losing either', () => {
  const p = plan(10, { constraints: { targetMinutes: { p0: 24 }, maxMinutes: { p1: 8 } } });
  assert.ok(p.ok);
  assert.equal(p.minutes.p0, 24);
  assert.ok(p.minutes.p1 <= 8);
  assert.equal(Object.values(p.minutes).reduce((a, b) => a + b, 0), 160);
});

test('minute targets ride on top of tournament carryover', () => {
  const g1 = plan(10);
  const g2 = plan(10, { carryover: g1.minutes, constraints: { targetMinutes: { p0: 28 } }, seed: 5 });
  assert.ok(g2.ok);
  assert.equal(g2.minutes.p0, 28, 'an explicit target outranks the carryover nudge');
});

test('every stint still fields exactly five under each strategy', () => {
  const cases = [
    ['closers', { closing: { stints: 2, players: ['p0','p1','p2','p3','p4'] } }, undefined],
    ['consec',  { maxConsecutive: 2 }, undefined],
    ['targets', { targetMinutes: { p0: 24, p1: 8 } }, undefined],
    ['platoon', { units: [['p0','p1','p2','p3','p4'], ['p5','p6','p7','p8','p9']] }, 'platoon'],
  ];
  for (const [tag, constraints, strategy] of cases) {
    const p = plan(10, { constraints, strategy });
    assert.ok(p.ok, tag);
    for (const r of p.stints) assert.equal(r.onFloor.length, 5, `${tag} stint ${r.index}`);
    assert.equal(new Set(p.stints[0].onFloor).size, 5, `${tag} has a duplicate on the floor`);
  }
});

/* ---------------- degenerate rosters and formats ---------------- */

test('exactly five available plays the whole game with no subs', () => {
  const p = plan(5);
  assert.ok(p.ok);
  for (const r of p.stints) {
    assert.equal(r.onFloor.length, 5);
    assert.equal(r.sitting.length, 0);
    assert.equal(r.in.length, 0);
  }
  assert.equal(p.spread, 0);
  for (const id of ids(5)) assert.equal(p.minutes[id], 32);
});

test('six available still rotates without stranding anyone', () => {
  const p = plan(6);
  assert.ok(p.ok);
  const sat = ids(6).filter(id => p.stints.some(r => !r.onFloor.includes(id)));
  assert.equal(sat.length, 6, 'everyone takes a turn sitting');
});

test('a consecutive limit with no bench is flagged, not silently applied', () => {
  const p = plan(5, { constraints: { maxConsecutive: 2 } });
  assert.ok(p.ok);
  assert.ok(p.issues.some(i => i.code === 'CONSEC_IMPOSSIBLE'));
});

test('a single-stint game is valid', () => {
  const p = generatePlan({
    players: roster(8), availableIds: ids(8),
    format: { periods: 1, periodMinutes: 10 }, granularity: { mode: 'breaksOnly' }, seed: 3,
  });
  assert.ok(p.ok);
  assert.equal(p.stints.length, 1);
  assert.equal(p.stints[0].onFloor.length, 5);
});

test('a sub interval longer than the period collapses to one stint', () => {
  const p = generatePlan({
    players: roster(8), availableIds: ids(8),
    format: { periods: 2, periodMinutes: 6 }, granularity: { mode: 'everyN', value: 20 }, seed: 3,
  });
  assert.ok(p.ok);
  assert.equal(p.stints.length, 2);
});

test('unequal stint lengths still fill every slot and reconcile', () => {
  const p = generatePlan({
    players: roster(10), availableIds: ids(10),
    format: { periods: 4, periodMinutes: 8 }, granularity: { mode: 'everyN', value: 3 }, seed: 9,
  });
  assert.ok(p.ok);
  assert.deepEqual(p.stints.slice(0, 3).map(r => r.minutes), [3, 3, 2]);
  for (const r of p.stints) assert.equal(r.onFloor.length, 5);
  assert.equal(Object.values(p.minutes).reduce((a, b) => a + b, 0), 32 * 5);
  assert.equal(p.minPossibleSpread.exact, false, 'unequal stints cannot claim an exact floor');
});

/* ---------------- name derivation edge cases ---------------- */

test('short names survive blank, single-word and duplicate names', () => {
  const s = deriveShortNames([
    { id: 'a', name: '' },
    { id: 'b', name: '' },
    { id: 'c', name: 'Cher' },
    { id: 'd', name: '  Bo   Jackson  ' },
    { id: 'e', name: 'Bo Jensen' },
  ]);
  const vals = Object.values(s);
  assert.equal(new Set(vals).size, vals.length, `collision: ${JSON.stringify(s)}`);
  assert.ok(vals.every(v => v.length > 0 && v.length <= 5), JSON.stringify(s));
  assert.equal(s.c, 'CHER');
});

/* ---------------- everything at once ---------------- */

test('all constraint types compose without producing an illegal plan', () => {
  const p = plan(12, { constraints: {
    minMinutes: { p6: 12 }, maxMinutes: { p7: 12 },
    pairs: [['p0', 'p1']], avoids: [['p2', 'p3']],
    openingFive: ['p0', 'p1'], maxConsecutive: 3,
    closing: { stints: 2, players: ['p0', 'p1', 'p4', 'p5', 'p8'] },
  } });
  assert.ok(p.ok, JSON.stringify(p.issues.filter(i => i.severity === 'error')));
  for (const r of p.stints) {
    assert.equal(r.onFloor.length, 5, `stint ${r.index}`);
    assert.equal(new Set(r.onFloor).size, 5, 'duplicate player on the floor');
    assert.ok(!(r.onFloor.includes('p2') && r.onFloor.includes('p3')), 'avoid broken');
  }
  assert.ok(p.stints[0].onFloor.includes('p0') && p.stints[0].onFloor.includes('p1'));
  assert.ok(p.minutes.p6 >= 12);
  assert.ok(p.minutes.p7 <= 12);
  assert.equal(Object.values(p.minutes).reduce((a, b) => a + b, 0), 160);
});

test('every strategy is deterministic for a fixed seed', () => {
  const cases = [
    [undefined, {}],
    [undefined, { targetMinutes: { p0: 24 } }],
    [undefined, { closing: { stints: 2, players: ['p0','p1','p2','p3','p4'] } }],
    ['platoon', { units: [['p0','p1','p2','p3','p4'], ['p5','p6','p7','p8','p9']] }],
  ];
  for (const [strategy, constraints] of cases) {
    const a = plan(10, { strategy, constraints, seed: 31 });
    const b = plan(10, { strategy, constraints, seed: 31 });
    assert.deepEqual(a.stints.map(r => r.onFloor), b.stints.map(r => r.onFloor), String(strategy));
  }
});

test('carryover copes with a player who has never played', () => {
  const g1 = plan(10);
  const carry = { ...g1.minutes };
  delete carry.p9;                       // p9 missed game one entirely
  const g2 = plan(10, { carryover: carry, seed: 21 });
  assert.ok(g2.ok);
  assert.ok(g2.minutes.p9 >= Math.max(...ids(10).map(id => g2.minutes[id])) - 4,
    `p9 got ${g2.minutes.p9}, should be catching up`);
});

test('no plan ever fields the same player twice', () => {
  const cases = [
    ['plain', 10, undefined, {}],
    ['constrained', 12, undefined, { minMinutes: { p6: 12 }, maxMinutes: { p7: 12 },
      pairs: [['p0','p1']], avoids: [['p2','p3']], openingFive: ['p0','p1'], maxConsecutive: 3,
      closing: { stints: 2, players: ['p0','p1','p4','p5','p8'] } }],
    ['targets', 10, undefined, { targetMinutes: { p0: 24, p1: 8 } }],
    ['closers', 11, undefined, { closing: { stints: 3, players: ['p0','p1','p2','p3','p4'] } }],
    ['consec', 9, undefined, { maxConsecutive: 2 }],
    ['platoon', 10, 'platoon', { units: [['p0','p1','p2','p3','p4'], ['p5','p6','p7','p8','p9']] }],
  ];
  for (const [tag, n, strategy, constraints] of cases) {
    for (let seed = 1; seed <= 12; seed++) {
      const p = plan(n, { strategy, constraints, seed });
      if (!p.ok) continue;
      for (const r of p.stints) {
        assert.equal(new Set(r.onFloor).size, 5, `${tag} seed ${seed} stint ${r.index}: ${r.onFloor}`);
        assert.equal(r.onFloor.length + r.sitting.length, n, `${tag}: floor+bench should equal the roster`);
      }
    }
  }
});

test('hand-set targets suppress the misleading "best possible" benchmark', () => {
  const p = plan(10, { constraints: { targetMinutes: { p0: 32 } } });
  assert.ok(p.ok);
  const codes = p.issues.map(i => i.code);
  assert.ok(codes.includes('TARGETS_ACTIVE'));
  assert.ok(!codes.includes('SPREAD_FLOOR'), 'the single-game floor is meaningless here');
  assert.ok(!codes.includes('SPREAD_EVEN'));
});

test('platoon with no units asks for them instead of silently planning as balanced', () => {
  const p = plan(10, { strategy: 'platoon', constraints: { units: [] } });
  assert.equal(p.ok, false, 'must not quietly fall back to an even rotation');
  const e = p.issues.find(i => i.code === 'UNITS_MISSING');
  assert.ok(e);
  assert.match(e.message, /Unit 1/);
  // and the other strategies are unaffected
  assert.ok(plan(10).ok);
  assert.ok(plan(10, { constraints: { units: [] } }).ok);
});

test('a period is called what it actually is', () => {
  /* "Q" was hardcoded in five renderers, so two eighteen-minute halves read
     "Q1 18:00" on the card, the timeline, the stint table and both places in
     bench mode. Reported from a real game. */
  const halves = buildStints({ periods: 2, periodMinutes: 18 }, { mode: 'everyN', value: 4 });
  assert.equal(halves[0].periodName, 'H1');
  assert.equal(halves[halves.length - 1].periodName, 'H2');

  const quarters = buildStints({ periods: 4, periodMinutes: 8 }, { mode: 'everyN', value: 4 });
  assert.equal(quarters[0].periodName, 'Q1');
  assert.equal(quarters[quarters.length - 1].periodName, 'Q4');

  const thirds = buildStints({ periods: 3, periodMinutes: 12 }, { mode: 'everyN', value: 4 });
  assert.equal(thirds[0].periodName, 'P1');

  const one = buildStints({ periods: 1, periodMinutes: 32 }, { mode: 'everyN', value: 4 });
  assert.equal(one[0].periodName, 'P1');
});

test('a plan carries the period name through to its rows', () => {
  /* The layer the first version of this test missed. buildStints setting
     periodName is necessary and not sufficient: `finish` rebuilds every row,
     so the field has to survive that copy or every renderer silently falls
     back to "Q" -- which looks right for four quarters and is wrong for two
     halves, which is exactly how it shipped. */
  const players = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const p = generatePlan({
    players, availableIds: players.map(x => x.id),
    format: { periods: 2, periodMinutes: 18 },
    granularity: { mode: 'everyN', value: 4 },
    constraints: {}, strategy: 'balanced', seed: 3,
  });
  assert.ok(p.ok);
  assert.ok(p.stints.every(r => r.periodName), 'a row reached a renderer with no period name');
  assert.equal(p.stints[0].periodName, 'H1');
  assert.equal(p.stints[p.stints.length - 1].periodName, 'H2');
});

test('no renderer hardcodes a period prefix any more', () => {
  for (const f of ['card.js', 'timeline.js', 'plan-view.js', 'gamemode.js']) {
    const src = readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
    const bare = src.match(/['"`]Q\$\{|['"`]Q['"] *\+ *\w+\.period/g) || [];
    // the only permitted mentions are the `|| 'Q' + r.period` fallbacks
    const unguarded = bare.filter(m => {
      const i = src.indexOf(m);
      return !src.slice(Math.max(0, i - 40), i).includes('periodName');
    });
    assert.deepEqual(unguarded, [], `${f} still builds a period label by hand`);
  }
});

/* ---------------- the tie-break: who plays the odd stint ---------------- */

/* Eleven players over eight 4-minute stints is forty slots: seven play 16 and
   four play 12, and the minutes term in the cost is exactly flat across every
   choice of which seven. Something settles it. These say what. */

test('who lands short follows the priority handed in, not the roster order', () => {
  const behind = ['p3', 'p7'];
  const priority = Object.fromEntries(ids(11).map(id => [id, behind.includes(id) ? 6 : 0]));
  const p = plan(11, { priority });
  assert.ok(p.ok);
  const long = Math.max(...ids(11).map(id => p.minutes[id]));
  for (const id of behind) {
    assert.equal(p.minutes[id], long, `${id} is furthest behind and still played short`);
  }
  // and the mirror: the two furthest AHEAD are the ones who pay for it
  const ahead = Object.fromEntries(ids(11).map(id => [id, behind.includes(id) ? -6 : 0]));
  const q = plan(11, { priority: ahead });
  const short = Math.min(...ids(11).map(id => q.minutes[id]));
  for (const id of behind) assert.equal(q.minutes[id], short, `${id} is furthest ahead and still played long`);
});

test('with nobody ahead or behind, the odd stint rotates with the seed', () => {
  /* The rejected alternative was a stable-arbitrary tie-break, and this is why:
     the same child would land short every week by roster position. */
  const shortOf = seed => ids(11)
    .filter(id => plan(11, { seed }).minutes[id] === 12).sort().join(',');
  const seen = new Set([1, 2, 3, 4, 5, 6].map(shortOf));
  assert.ok(seen.size > 1, `every seed shorted the same four players: ${[...seen][0]}`);
});

test('a locked target beats the tie-break outright', () => {
  /* A lock is the coach saying they mean the number. The tie-break is a nudge
     worth a twentieth of a minute; it must not be able to argue. */
  const priority = Object.fromEntries(ids(11).map(id => [id, id === 'p0' ? 50 : 0]));
  const p = plan(11, {
    priority,
    constraints: { targetMinutes: { p0: 8 }, lockedTargets: ['p0'] },
  });
  assert.ok(p.ok);
  assert.equal(p.minutes.p0, 8, 'the locked row moved');
});

test('the plan says who is on the short end, by name', () => {
  const p = plan(11);
  const spread = p.issues.find(i => i.code === 'SPREAD_FLOOR');
  assert.ok(spread, 'no floor line at all');
  const short = ids(11).filter(id => p.minutes[id] === 12);
  assert.deepEqual([...spread.playerIds].sort(), short.sort(),
    'the line does not hand back the players who actually play short');
  const names = Object.fromEntries(roster(11).map(x => [x.id, x.name]));
  for (const id of short) {
    assert.ok(spread.message.includes(names[id]), `${names[id]} plays short and is not named`);
  }
  assert.ok(/\band\b/.test(spread.message), 'the names read as a machine list, not a sentence');
  assert.ok(/\b12\b/.test(spread.message), `the short total should be on the line: ${spread.message}`);
  // state.js swaps this for the reason, so it has to be there to swap
  assert.ok(spread.message.endsWith('.'), 'the line does not end in a full stop');
});

/* ---------------- how many change at once ---------------- */

/* `maxSubs` is a PREFERENCE, and these pin the honesty of saying so. The
   construction pass (`repairChurn`) holds the ceiling, but the local search
   that follows charges 40 per extra change against 60 a minute off target, so
   a plan can still go over when holding to the number would cost somebody
   minutes. When it does, the plan says so -- the CONSEC_EXCEEDED contract. */

const worstBreak = p => {
  let worst = 0;
  for (let i = 1; i < p.stints.length; i++) worst = Math.max(worst, p.stints[i].in.length);
  return worst;
};

test('the number a coach sets reaches the plan', () => {
  const wide = plan(11, { maxSubs: 5 });
  const tight = plan(11, { maxSubs: 1 });
  assert.ok(wide.ok && tight.ok);
  assert.ok(worstBreak(tight) < worstBreak(wide),
    `${worstBreak(wide)} at once at 5, ${worstBreak(tight)} at 1 -- the setting did nothing`);
});

test('a plan that goes over the number says so, with the arithmetic', () => {
  const p = plan(11, { maxSubs: 1 });
  const worst = worstBreak(p);
  const issue = p.issues.find(i => i.code === 'SUBS_EXCEEDED');
  if (worst <= 1) {
    assert.equal(issue, undefined, 'nothing went over, so there is nothing to warn about');
    return;
  }
  assert.ok(issue, `${worst} players change at one break against a limit of 1 and the plan is silent`);
  assert.equal(issue.severity, 'warn');
  assert.ok(issue.message.includes(String(worst)), 'the warning does not say how many actually change');
  assert.ok(issue.message.includes('1'), 'nor what the coach asked for');
  assert.ok(issue.message.endsWith('.'), 'the line does not end in a full stop');
});

test('a plan that keeps to the number says nothing', () => {
  const p = plan(11, { maxSubs: 5 });
  assert.ok(p.ok);
  assert.equal(worstBreak(p) > 5, false);
  assert.equal(p.issues.find(i => i.code === 'SUBS_EXCEEDED'), undefined,
    'a warning on a plan that kept to the number is noise, and noise is how warnings stop being read');
});

test('platoon is exempt: alternating whole fives is what the coach asked for', () => {
  const units = [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8', 'p9']];
  const p = plan(10, { strategy: 'platoon', constraints: { units }, maxSubs: 3 });
  assert.ok(p.ok);
  assert.equal(worstBreak(p), 5, 'a platoon changes the whole floor, by definition');
  assert.equal(p.issues.find(i => i.code === 'SUBS_EXCEEDED'), undefined,
    'warning a platoon coach about churn is telling them their own choice is a problem');
});

test('the churn report does not change the plan it reports on', () => {
  // it is a post-hoc read of the lineups, not a term in the objective: same
  // seed, same everything, byte for byte
  const a = plan(11, { maxSubs: 3 });
  const b = plan(11, { maxSubs: 3 });
  assert.deepEqual(a.stints.map(r => r.onFloor), b.stints.map(r => r.onFloor));
  assert.deepEqual(a.minutes, b.minutes);
});

/* ---------------- everyone plays before halftime ---------------- */

/* Even totals were never the whole promise: a kid who does not start, sits a
   whole period and then plays one has the same number on the card and a
   different afternoon. Measured before this rule went in, 4.4% of players got
   their first minutes at or after the break and one plan in four had at least
   one of them. It is a DEFAULT, not a setting -- minimum minutes and the out
   list are the coach's escape hatch -- and it is governed by `maxSubs`, which
   is the coach's own number and therefore wins. */

const BREAKS = { mode: 'breaksOnly', value: 1 };

const lateIn = (p, half) => {
  const on = new Set();
  for (let i = 0; i < half; i++) for (const id of p.stints[i].onFloor) on.add(id);
  return p.stints[0].sitting.concat(p.stints[0].onFloor).filter(id => !on.has(id));
};

test('halftime is the midpoint of the clock, not the middle of the list', () => {
  assert.equal(stintsBeforeHalftime(buildStints(QUARTERS, EVERY_4)), 4);
  assert.equal(stintsBeforeHalftime(buildStints(QUARTERS, BREAKS)), 2);
  assert.equal(stintsBeforeHalftime(buildStints({ periods: 2, periodMinutes: 20 }, BREAKS)), 1);
  // one stint is the whole game; there is no such thing as being late in it
  assert.equal(stintsBeforeHalftime(buildStints({ periods: 1, periodMinutes: 20 }, BREAKS)), 0);
});

test('nobody waits past halftime for their first minutes', () => {
  for (let n = 6; n <= 12; n++) {
    const p = plan(n);
    assert.ok(p.ok);
    assert.deepEqual(lateIn(p, 4), [],
      `${n} players over 8 stints and somebody is still waiting at the break`);
    assert.equal(p.issues.find(i => i.code === 'HALF_LATE'), undefined);
  }
});

test('when the clock cannot fit everyone in, it says who and says the arithmetic', () => {
  // two stints before halftime seat ten; eleven do not fit, at any churn, and
  // the change limit is wide enough here that the clock is what binds
  const p = generatePlan({
    players: roster(11), availableIds: ids(11),
    format: QUARTERS, granularity: BREAKS, seed: 7, maxSubs: 5,
  });
  assert.ok(p.ok);
  const late = lateIn(p, 2);
  assert.equal(late.length, 1, 'exactly one player has to wait, and only one should');
  const issue = p.issues.find(i => i.code === 'HALF_LATE');
  assert.ok(issue, 'a player waits until the second half and the plan is silent about it');
  assert.equal(issue.severity, 'warn');
  assert.deepEqual([...issue.playerIds].sort(), late.sort());
  const names = Object.fromEntries(roster(11).map(x => [x.id, x.name]));
  for (const id of late) assert.ok(issue.message.includes(names[id]), `${names[id]} waits and is not named`);
  assert.ok(issue.message.includes('10') && issue.message.includes('11'),
    `the line should carry the arithmetic, not an apology: ${issue.message}`);
  assert.ok(issue.message.endsWith('.'), 'the line does not end in a full stop');
});

test("the coach's change limit governs the rule, and the warning says so", () => {
  /* Ten players, subs only at the breaks: five start and the other five can all
     be on by the second stint, but only if five change at once. The coach asked
     for three. Their number wins -- the app's own default is the one that
     yields -- and the plan explains the trade instead of quietly outbidding a
     control the settings page displays. */
  const tight = generatePlan({
    players: roster(10), availableIds: ids(10),
    format: QUARTERS, granularity: BREAKS, seed: 7, maxSubs: 3,
  });
  assert.ok(tight.ok);
  const issue = tight.issues.find(i => i.code === 'HALF_LATE');
  assert.ok(issue, 'somebody has to wait at a limit of three and the plan does not say so');
  assert.ok(/3 changes at a time/.test(issue.message), `the warning should name the limit that caused it: ${issue.message}`);
  assert.ok(/allow more changes/.test(issue.message), 'nor offer the lever that would lift it');
  assert.equal(tight.issues.find(i => i.code === 'SUBS_EXCEEDED'), undefined,
    'the default must not spend churn the coach said it could not have');

  const wide = generatePlan({
    players: roster(10), availableIds: ids(10),
    format: QUARTERS, granularity: BREAKS, seed: 7, maxSubs: 5,
  });
  assert.ok(wide.ok);
  assert.deepEqual(lateIn(wide, 2), [], 'with the room to do it, everyone should be on before the break');
  assert.equal(wide.issues.find(i => i.code === 'HALF_LATE'), undefined);
});

test('the rule loses every argument with a floor, a cap or a lock', () => {
  // p0 is capped at one stint and the plan is 8 stints long: getting them on
  // early is fine, but never at the price of the cap
  const p = plan(11, { constraints: { maxMinutes: { p0: 4 }, minMinutes: { p1: 24 } } });
  assert.ok(p.ok);
  assert.ok(p.minutes.p0 <= 4, `cap broken to satisfy a default: ${p.minutes.p0}`);
  assert.ok(p.minutes.p1 >= 24, `floor broken to satisfy a default: ${p.minutes.p1}`);
});

test('it does not move anyone off their fair total', () => {
  // the fix comes out of the minute-neutral exchange move, so the number the
  // app actually promises must be untouched
  for (let n = 6; n <= 13; n++) {
    const p = plan(n);
    assert.ok(p.ok);
    assert.equal(p.spread <= p.minPossibleSpread.minutes, true,
      `${n} players: spread ${p.spread} against a floor of ${p.minPossibleSpread.minutes}`);
  }
});

test('platoon is exempt: the coach chose the units and their order', () => {
  const units = [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8', 'p9'],
                 ['p0', 'p2', 'p4', 'p6', 'p8']];
  const p = generatePlan({
    players: roster(10), availableIds: ids(10), strategy: 'platoon',
    format: QUARTERS, granularity: BREAKS, seed: 7, constraints: { units },
  });
  assert.ok(p.ok);
  assert.equal(p.issues.find(i => i.code === 'HALF_LATE'), undefined,
    'telling a platoon coach their own unit order is a problem is noise');
});
