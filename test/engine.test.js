import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lacks } from './prose.js';
import { longestBench, halfGameSitters } from './long-sit.js';
import {
  buildStints, fmtClock, deriveShortNames, analyzeFeasibility,
  generatePlan, missedPinIssues, minPossibleSpread, ON_FLOOR, stintsBeforeHalftime, isOvertimeStint,
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
  const w = p.issues.find(i => i.code === 'KEEPON_DROPPED');
  assert.ok(w);
  assert.equal(w.message, 'The One of two on rule for PlayerC Last2 and PlayerF Last5 is ignored: one of them is not available.');
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

test('minimums that exceed the game total name the offenders', () => {
  const p = plan(10, { constraints: { minMinutes: { p0: 32, p1: 32, p2: 32, p3: 32, p4: 32, p5: 32 } } });
  assert.equal(p.ok, false);
  const e = errs(p).find(x => x.code === 'MINS_UNSATISFIABLE');
  assert.ok(e);
  assert.match(e.message, /192 minutes/);
  assert.match(e.message, /only totals 160 minutes/);
  assert.match(e.message, /32 min × 5 players/);
});

test('caps too tight to field five is its own error', () => {
  const caps = Object.fromEntries(ids(10).map(id => [id, 8]));
  const p = plan(10, { constraints: { maxMinutes: caps } });
  assert.equal(p.ok, false);
  const e = errs(p).find(x => x.code === 'CAPS_UNSATISFIABLE');
  assert.ok(e);
  assert.match(e.message, /Maximums allow at most 80 total minutes/);
  assert.match(e.message, /needs 160 minutes to keep 5 on the floor/);
  assert.match(e.message, /Raise a maximum or add a player/);
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
  const e = errs(p).find(x => x.code === 'AVOID_IMPOSSIBLE');
  assert.ok(e);
  assert.equal(e.message, 'No legal lineup of 5 exists — the Apart rules rule out every combination. Drop one of them.');
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
  const w = p.issues.find(i => i.code === 'PAIR_DROPPED');
  assert.ok(w);
  assert.equal(w.message, 'The Together rule for PlayerA Last0 and PlayerJ Last9 is ignored: one of them is not available.');
});

test('an Apart rule naming an unavailable player is dropped, not turned into a conflict', () => {
  const p = generatePlan({
    players: roster(10), availableIds: ids(10).filter(id => id !== 'p9'),
    format: QUARTERS, granularity: EVERY_4, seed: 3,
    constraints: { avoids: [['p0', 'p9']] },
  });
  assert.ok(p.ok);
  const w = p.issues.find(i => i.code === 'AVOID_DROPPED');
  assert.ok(w);
  assert.equal(w.message, 'The Apart rule for PlayerA Last0 and PlayerJ Last9 is ignored: one of them is not available.');
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
  /* The reproduction a coach hit, and the behavior that replaced it. Ten
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
  const w = p.issues.find(i => i.code === 'CONSEC_IMPOSSIBLE');
  assert.ok(w);
  assert.equal(w.message, 'With only 5 available, nobody can be rested — the Plays at most N in a row rule will be ignored.');
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

/* #367: a game's overtime periods. `format.overtime` is a list of whole
   minutes, one entry per OT period, appended after regulation. */
const HALVES = { periods: 2, periodMinutes: 16 };
const pick = ({ period, periodName, startSec, endSec, minutes }) =>
  ({ period, periodName, startSec, endSec, minutes });

test('overtime of 2 minutes adds one OT stint after the 8 regulation stints', () => {
  const plain = buildStints(HALVES, EVERY_4);
  const s = buildStints({ ...HALVES, overtime: [2] }, EVERY_4);
  assert.equal(s.length, 9);
  assert.deepEqual(s.slice(0, 8), plain);
  assert.deepEqual(pick(s[8]), { period: 3, periodName: 'OT', startSec: 120, endSec: 0, minutes: 2 });
  assert.equal(s[8].index, 8);
});

test('overtime of 8 minutes at every 4 splits into two stints, 480 to 240 to 0', () => {
  const s = buildStints({ ...HALVES, overtime: [8] }, EVERY_4).slice(8);
  assert.deepEqual(s.map(pick), [
    { period: 3, periodName: 'OT', startSec: 480, endSec: 240, minutes: 4 },
    { period: 3, periodName: 'OT', startSec: 240, endSec: 0, minutes: 4 },
  ]);
});

test('two overtime periods are named OT then OT2 and numbered 3 then 4', () => {
  const s = buildStints({ ...HALVES, overtime: [2, 2] }, EVERY_4).slice(8);
  assert.deepEqual(s.map(x => [x.period, x.periodName]), [[3, 'OT'], [4, 'OT2']]);
});

test('four overtime periods are named OT, OT2, OT3, OT4', () => {
  const s = buildStints({ ...HALVES, overtime: [1, 1, 1, 1] }, EVERY_4).slice(8);
  assert.deepEqual(s.map(x => x.periodName), ['OT', 'OT2', 'OT3', 'OT4']);
});

test('isOvertimeStint is true for the stints buildStints names OT..OT4 and for no regulation period', () => {
  const s = buildStints({ ...HALVES, overtime: [1, 1, 1, 1] }, EVERY_4);
  assert.deepEqual(s.map(isOvertimeStint), [...Array(8).fill(false), true, true, true, true]);
});

test('overtime under perPeriod is one regulation stint long (#404); breaksOnly gives one', () => {
  const ot = { ...HALVES, overtime: [8] };
  assert.deepEqual(
    buildStints(ot, { mode: 'perPeriod', value: 2 }).slice(4).map(x => x.minutes), [8]);
  assert.deepEqual(
    buildStints(ot, { mode: 'breaksOnly' }).slice(2).map(x => x.minutes), [8]);
});

const PER_4 = { mode: 'perPeriod', value: 4 };
const otStints = (minutes, g) =>
  buildStints({ ...QUARTERS, overtime: [minutes] }, g).filter(isOvertimeStint);

test('a short overtime under perPeriod 4 is one stint, not four slivers (#404)', () => {
  const plain = buildStints(QUARTERS, PER_4);
  const s = buildStints({ ...QUARTERS, overtime: [2] }, PER_4);
  assert.deepEqual(s.slice(0, 16), plain);
  const ot = s.slice(16);
  assert.equal(ot.length, 1);
  assert.deepEqual([ot[0].minutes, ot[0].startSec, ot[0].endSec], [2, 120, 0]);
});

test('a full-length overtime under perPeriod 4 is four 2-minute stints (#404)', () => {
  assert.deepEqual(otStints(8, PER_4).map(x => x.minutes), [2, 2, 2, 2]);
});

test('an overtime tail under half a stint folds into the stint before it (#404)', () => {
  // 2 x 16, perPeriod 2: the stint is 8, a 1-minute tail is under 4
  const ot = buildStints({ ...HALVES, overtime: [9] }, { mode: 'perPeriod', value: 2 })
    .filter(isOvertimeStint);
  assert.deepEqual(ot.map(x => [x.minutes, x.startSec, x.endSec]), [[9, 540, 0]]);
});

test('an overtime tail of exactly half a stint stays its own stint, as everyN does (#404)', () => {
  assert.deepEqual(otStints(3, PER_4).map(x => x.minutes), [2, 1]);
  assert.deepEqual(otStints(3, { mode: 'everyN', value: 2 }).map(x => x.minutes), [2, 1]);
});

test('perPeriod regulation, everyN and breaksOnly overtime stay as they were (#404)', () => {
  for (const v of [1, 2, 3, 4]) {
    assert.deepEqual(
      buildStints({ ...QUARTERS, overtime: [5] }, { mode: 'perPeriod', value: v }).slice(0, 4 * v)
        .map(x => x.minutes),
      Array(4 * v).fill(8 / v));
  }
  assert.deepEqual(otStints(8, EVERY_4).map(x => x.minutes), [4, 4]);
  assert.deepEqual(otStints(2, { mode: 'breaksOnly' }).map(x => x.minutes), [2]);
});

test('overtime absent or empty gives exactly the regulation stints', () => {
  for (const g of [EVERY_4, { mode: 'perPeriod', value: 2 }, { mode: 'breaksOnly' }]) {
    const plain = buildStints(QUARTERS, g);
    assert.deepEqual(buildStints({ ...QUARTERS, overtime: [] }, g), plain);
    assert.deepEqual(buildStints({ ...QUARTERS, overtime: undefined }, g), plain);
  }
});

test('overtime of 1 to 10 minutes fills the clock for every granularity', () => {
  const modes = [EVERY_4, { mode: 'perPeriod', value: 2 }, { mode: 'breaksOnly' }];
  for (let len = 1; len <= 10; len++) for (const g of modes) {
    const plain = buildStints(HALVES, g);
    const s = buildStints({ ...HALVES, overtime: [len] }, g);
    const ot = s.slice(plain.length);
    const where = `${len} min, ${g.mode}`;
    assert.ok(ot.length >= 1, where);
    assert.deepEqual(s.slice(0, plain.length), plain, where);
    assert.equal(ot[0].startSec, len * 60, where);
    assert.equal(ot[ot.length - 1].endSec, 0, where);
    assert.ok(ot.every(x => x.period === 3 && x.periodName === 'OT'), where);
    assert.ok(Math.abs(ot.reduce((a, x) => a + x.minutes, 0) - len) < 1e-9, where);
    ot.forEach((x, i) => assert.equal(x.index, plain.length + i, where));
  }
});

/* #367: halftime is a fact about regulation. Overtime stints follow it and
   never move it. */
test('overtime does not move halftime: the same four stints, the same warning', () => {
  const run = overtime => generatePlan({
    players: roster(11), availableIds: ids(11),
    format: { ...HALVES, overtime }, granularity: EVERY_4, seed: 7, maxSubs: 1,
  });
  const plain = run(undefined).issues.find(i => i.code === 'HALF_LATE');
  const withOt = run([8]).issues.find(i => i.code === 'HALF_LATE');
  assert.ok(plain && plain.message.includes('4 stints'), 'the regulation game warns at four stints');
  assert.ok(withOt, 'overtime made the halftime warning vanish');
  assert.ok(withOt.message.includes('4 stints'), `halftime slid into the second half: ${withOt.message}`);
});

test('a plan of overtime stints alone has no halftime to be late for', () => {
  const stints = buildStints({ ...HALVES, overtime: [8] }, EVERY_4).slice(8);
  const p = generatePlan({
    players: roster(11), availableIds: ids(11), stints,
    format: HALVES, granularity: EVERY_4, seed: 7, maxSubs: 1,
  });
  assert.ok(p.ok);
  assert.equal(p.issues.find(i => i.code === 'HALF_LATE'), undefined);
});

/* ---------------- #378: warnings check the stint they mean ---------------- */

const HALVES_20 = { periods: 2, periodMinutes: 20 };
const EVERY_6 = { mode: 'everyN', value: 6 };
const feas = (format, granularity, constraints, extra = {}) => analyzeFeasibility({
  players: roster(8), availableIds: ids(8), constraints,
  stints: buildStints(format, granularity), ...extra,
});
const codes = (issues, code) => issues.filter(i => i.code === code);

test('378: a 7-minute cap on a starter covers a 6-minute opening stint', () => {
  const issues = feas(HALVES_20, EVERY_6, { openingFive: ['p0'], maxMinutes: { p0: 7 } });
  assert.deepEqual(codes(issues, 'FORCED_OVER_CAP'), []);
  assert.deepEqual(codes(issues, 'CAP_BELOW_STINT'), []);
});

test('378: a 5-minute cap on a starter fires FORCED_OVER_CAP naming the 6-minute stint', () => {
  const [hit] = codes(feas(HALVES_20, EVERY_6, { openingFive: ['p0'], maxMinutes: { p0: 5 } }), 'FORCED_OVER_CAP');
  assert.ok(hit, 'FORCED_OVER_CAP did not fire');
  assert.match(hit.message, /6-minute stint/);
});

test('378: the Starts the last period rule is checked against that period\'s first stint (periods passed or inferred)', () => {
  const stints = buildStints(HALVES_20, EVERY_6);
  const run = (cap, extra) => analyzeFeasibility({
    players: roster(8), availableIds: ids(8), stints, ...extra,
    constraints: { lastPeriodFive: ['p1'], maxMinutes: { p1: cap } },
  });
  for (const extra of [{}, { periods: 2 }]) {
    assert.deepEqual(codes(run(7, extra), 'FORCED_OVER_CAP'), [], JSON.stringify(extra));
    const [hit] = codes(run(5, extra), 'FORCED_OVER_CAP');
    assert.ok(hit, `no FORCED_OVER_CAP ${JSON.stringify(extra)}`);
    assert.match(hit.message, /6-minute stint/);
  }
  const p = generatePlan({
    players: roster(8), availableIds: ids(8), format: HALVES_20, granularity: EVERY_6, seed: 3,
    constraints: { lastPeriodFive: ['p1'], maxMinutes: { p1: 7 } },
  });
  assert.deepEqual(codes(p.issues, 'FORCED_OVER_CAP'), []);
  // H2's first stint: the cap covers the pin, and the plan holds it
  const h2 = p.stints.find(r => r.period === 2);
  assert.ok(h2.onFloor.includes('p1'), 'p1 is not on the floor for H2\'s first stint');
});

test('378: 4x10 perPeriod 3 prints stint lengths as 3.3, never 3.333', () => {
  const P3 = { mode: 'perPeriod', value: 3 };
  const issues = feas({ periods: 4, periodMinutes: 10 }, P3, {
    minMinutes: { p0: 7 }, maxMinutes: { p1: 2, p2: 38 }, openingFive: ['p1'],
    closing: { stints: 1, players: ['p2'] },
  });
  assert.ok(issues.length >= 3);
  for (const i of issues) assert.doesNotMatch(i.message, /3\.333/, i.message);
  const [hit] = codes(issues, 'MIN_OFF_STINT_BOUNDARY');
  assert.ok(hit.message.includes('rounds up to 10 (stints are 3.3 minutes)'), hit.message);
});

/* Every message that formats a stint length, with a game whose minutes are a
   genuine float: two 3.33-minute stints (6.67 minutes, 33.3 floor-minutes). Each
   case asserts the code fires and the exact text, so removing a fmtMinutes wrap
   prints 3.3333333333333335 and fails here. */
const stints2 = () => buildStints({ periods: 1, periodMinutes: 10 }, { mode: 'perPeriod', value: 3 }).slice(0, 2);
const feasFloat = constraints => analyzeFeasibility({
  players: roster(8), availableIds: ids(8), constraints, stints: stints2(),
});
const allIds = v => Object.fromEntries(ids(8).map(id => [id, v]));
const fires = (constraints, code, text) => {
  const [hit] = codes(feasFloat(constraints), code);
  assert.ok(hit, `${code} did not fire`);
  assert.ok(hit.message.includes(text), hit.message);
};

test('378: MIN_EXCEEDS_GAME formats a fractional game length', () => {
  fires({ minMinutes: { p0: 7 } }, 'MIN_EXCEEDS_GAME', 'but the game is only 6.7 minutes long.');
});
test('378: MINS_UNSATISFIABLE formats the floor and the game length', () => {
  fires({ minMinutes: allIds(5) }, 'MINS_UNSATISFIABLE', 'only totals 33.3 minutes (6.7 min × 5 players)');
});
test('378: CAPS_UNSATISFIABLE formats the floor minutes', () => {
  fires({ maxMinutes: allIds(4) }, 'CAPS_UNSATISFIABLE', 'at most 32 total minutes but the game needs 33.3 minutes');
});
test('378: KEEPON_UNSATISFIABLE formats the game length', () => {
  fires({ keepOnFloor: [['p0', 'p1']], maxMinutes: { p0: 3, p1: 3 } }, 'KEEPON_UNSATISFIABLE',
    "only cover 6 of the game's 6.7 minutes");
});
test('378: PINS_OVER_CAP formats the closing window', () => {
  fires({ closing: { stints: 1, players: ['p2'] }, maxMinutes: { p2: 2 } }, 'PINS_OVER_CAP',
    'set to close (3.3 min) but is capped at 2.');
});
test('378: TARGETS_OVER_BUDGET formats the excess', () => {
  fires({ targetMinutes: allIds(5) }, 'TARGETS_OVER_BUDGET', 'is 6.7 more than the game has');
});
test('378: TARGETS_UNDER_BUDGET formats the floor and the spare', () => {
  fires({ targetMinutes: allIds(4) }, 'TARGETS_UNDER_BUDGET', '32 of 33.3 floor-minutes. The spare 1.3 minutes');
});

test('378: an empty stint list never raises CAP_BELOW_STINT', () => {
  const issues = analyzeFeasibility({
    players: roster(8), availableIds: ids(8), constraints: { maxMinutes: { p0: 3 } }, stints: [],
  });
  assert.deepEqual(codes(issues, 'CAP_BELOW_STINT'), []);
});

test('378: 4x10 perPeriod 3 with a 10-minute minimum is not off a stint boundary', () => {
  const issues = feas({ periods: 4, periodMinutes: 10 }, { mode: 'perPeriod', value: 3 },
    { minMinutes: { p0: 10 } });
  assert.deepEqual(codes(issues, 'MIN_OFF_STINT_BOUNDARY'), []);
});

/* ---------------- 438: a hard pair costs evenness only when it must ---------------- */

const hardPairPlan = (format, granularity, seed) => generatePlan({
  players: roster(10), availableIds: ids(10), format, granularity, seed,
  constraints: { pairs: [['p0', 'p1']], hardPairs: true },
});

test('438: Force Together on 4x8 every 4 with 10 players is even and never splits the pair', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = hardPairPlan(QUARTERS, EVERY_4, seed);
    assert.equal(r.spread, 0, `seed ${seed}`);
    r.stints.forEach((s, i) => assert.equal(s.onFloor.includes('p0'), s.onFloor.includes('p1'),
      `seed ${seed} stint ${i}`));
  }
});

test('438: Force Together on 2x20 every 5 keeps the pair within one stint of the even 20', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = hardPairPlan({ periods: 2, periodMinutes: 20 }, { mode: 'everyN', value: 5 }, seed);
    for (const id of ['p0', 'p1']) {
      assert.ok(Math.abs(r.minutes[id] - 20) <= 5, `seed ${seed} ${id} got ${r.minutes[id]}`);
    }
    r.stints.forEach((s, i) => assert.equal(s.onFloor.includes('p0'), s.onFloor.includes('p1'),
      `seed ${seed} stint ${i}`));
  }
});

test('438: Force Together on 4x10 every 2 (20 stints) never splits the pair', () => {
  const splits = [];
  for (const n of [12, 15]) for (let seed = 1; seed <= 10; seed++) {
    const r = generatePlan({ players: roster(n), availableIds: ids(n), format: { periods: 4, periodMinutes: 10 },
      granularity: { mode: 'everyN', value: 2 }, seed,
      constraints: { pairs: [['p0', 'p1']], hardPairs: true } });
    if (r.stints.some(s => s.onFloor.includes('p0') !== s.onFloor.includes('p1'))) splits.push(`${n} players seed ${seed}`);
  }
  assert.deepEqual(splits, []);
});

test('438: a hard pair with an Apart pair on the bench and a pinned player keeps all three', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = generatePlan({ players: roster(10), availableIds: ids(10), format: QUARTERS, granularity: EVERY_4, seed,
      constraints: { pairs: [['p0', 'p1']], hardPairs: true, avoids: [['p5', 'p6'], ['p2', 'p7']],
        openingFive: ['p3', 'p0', 'p1'] } });
    r.stints.forEach((s, i) => {
      assert.equal(s.onFloor.includes('p0'), s.onFloor.includes('p1'), `seed ${seed} stint ${i} split`);
      assert.ok(!(s.onFloor.includes('p5') && s.onFloor.includes('p6')), `seed ${seed} stint ${i} p5+p6`);
      assert.ok(!(s.onFloor.includes('p2') && s.onFloor.includes('p7')), `seed ${seed} stint ${i} p2+p7`);
    });
    for (const id of ['p3', 'p0', 'p1']) assert.ok(r.stints[0].onFloor.includes(id), `seed ${seed} pin ${id}`);
  }
});

/* ---------------- #436: a pinned kid is held, or the plan is refused ---------------- */

const FIVE = ['p0', 'p1', 'p2', 'p3', 'p4'];
const ONE_PERIOD = { format: { periods: 1, periodMinutes: 12 } };
const pinPlan = (n, seed, constraints, extra = {}) => generatePlan({
  players: roster(n), availableIds: ids(n), format: QUARTERS, granularity: EVERY_4, seed, constraints, ...extra,
});

test('436: a Starts the last period kid with a cap of 4 or 8 is on Q4\'s first stint in every plan', () => {
  for (const cap of [4, 8]) for (const n of [8, 10, 12]) for (let seed = 1; seed <= 10; seed++) {
    const p = pinPlan(n, seed, { lastPeriodFive: FIVE, maxMinutes: { p0: cap } });
    assert.ok(p.ok, `cap ${cap}, ${n} players, seed ${seed}: refused`);
    assert.ok(p.stints[6].onFloor.includes('p0'), `cap ${cap}, ${n} players, seed ${seed}: p0 missing from stint 6`);
  }
});

test('436: a closer capped at 12 is on both closing stints in every plan', () => {
  for (const n of [8, 10, 12]) for (let seed = 1; seed <= 10; seed++) {
    const p = pinPlan(n, seed, { closing: { stints: 2, players: FIVE }, maxMinutes: { p0: 12 } }, { strategy: 'closers' });
    assert.ok(p.ok, `${n} players, seed ${seed}: refused`);
    for (const i of [6, 7]) assert.ok(p.stints[i].onFloor.includes('p0'), `${n} players, seed ${seed}: p0 missing from stint ${i}`);
  }
});

test('436: a cap under the sum of a kid\'s pinned stints is refused with PINS_OVER_CAP', () => {
  const both = pinPlan(10, 1, { openingFive: FIVE, lastPeriodFive: FIVE, maxMinutes: { p0: 4 } });
  assert.equal(both.ok, false);
  const [hit] = codes(both.issues, 'PINS_OVER_CAP');
  assert.ok(hit, 'PINS_OVER_CAP did not fire');
  assert.equal(hit.severity, 'error');
  assert.deepEqual(hit.playerIds, ['p0']);
  assert.match(hit.message, /PlayerA/);
  assert.match(hit.message, /\b8\b/);
  assert.match(hit.message, /\b4\b/);

  const closers = pinPlan(10, 1, { closing: { stints: 2, players: FIVE }, maxMinutes: { p0: 6 } }, { strategy: 'closers' });
  assert.equal(closers.ok, false);
  assert.ok(codes(closers.issues, 'PINS_OVER_CAP').length, 'closing 2 stints (8 min) with cap 6 was not refused');
  assert.deepEqual(codes(closers.issues, 'CLOSER_OVER_CAP'), []);

  // a cap that covers the pins is fine
  assert.equal(pinPlan(10, 1, { openingFive: FIVE, lastPeriodFive: FIVE, maxMinutes: { p0: 8 } }).ok, true);
});

test('436: a pin that already trips FORCED_OVER_CAP is not also reported as PINS_OVER_CAP', () => {
  const issues = feas(HALVES_20, EVERY_6, { openingFive: ['p0'], maxMinutes: { p0: 5 } });
  assert.equal(codes(issues, 'FORCED_OVER_CAP').length, 1);
  assert.deepEqual(codes(issues, 'PINS_OVER_CAP'), []);
});

test('436: a stint pinned by two groups counts once toward the cap', () => {
  // a one-period game: the opening stint is also the last period's first stint
  const p = pinPlan(8, 1, { openingFive: FIVE, lastPeriodFive: FIVE, maxMinutes: { p0: 4 } }, ONE_PERIOD);
  assert.ok(p.ok, JSON.stringify(p.issues.filter(i => i.severity === 'error')));
  assert.ok(p.stints[0].onFloor.includes('p0'));
});

test('436: a one-period game with two different fives pinned to its one stint is refused', () => {
  const p = pinPlan(10, 1, { openingFive: FIVE, lastPeriodFive: ['p5', 'p6', 'p7', 'p8', 'p9'] }, ONE_PERIOD);
  assert.equal(p.ok, false);
  const [hit] = codes(p.issues, 'FORCED_GROUP_TOO_BIG');
  assert.ok(hit, 'FORCED_GROUP_TOO_BIG did not fire');
  assert.match(hit.message, /\b10 players\b/);
  assert.match(hit.message, /only 5 fit/);
});

test('436: closers that overlap the Starts the last period stint are refused when together they are over five', () => {
  const p = pinPlan(10, 1, { lastPeriodFive: FIVE, closing: { stints: 2, players: ['p5', 'p6', 'p7', 'p8', 'p9'] } },
    { strategy: 'closers' });
  assert.equal(p.ok, false);
  assert.ok(codes(p.issues, 'FORCED_GROUP_TOO_BIG').length);
});

test('436: an Apart pair split across two pinned groups is refused once', () => {
  const p = pinPlan(10, 1, { openingFive: ['p0', 'p1'], lastPeriodFive: ['p2'], avoids: [['p0', 'p1']] });
  // inside one group: refused, reported once, not twice
  assert.equal(p.ok, false);
  assert.equal(codes(p.issues, 'FORCED_GROUP_AVOID').length, 1);
  const q = pinPlan(10, 1, { openingFive: ['p0'], lastPeriodFive: ['p1'], avoids: [['p0', 'p1']] }, ONE_PERIOD);
  assert.equal(q.ok, false);
  const hits = codes(q.issues, 'FORCED_GROUP_AVOID');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].severity, 'error');
  assert.match(hits[0].message, /PlayerA.*PlayerB|PlayerB.*PlayerA/);
});

test('436: a cap exactly equal to a fractional pinned sum is not refused', () => {
  // 4 periods of 8.8 min, one stint each: closing 3 stints pins 26.4 min, which adds up to 26.400000000000002
  const format = { periods: 4, periodMinutes: 8.8 };
  const stints = buildStints(format, { mode: 'perPeriod', value: 1 });
  const run = cap => analyzeFeasibility({ players: roster(10), availableIds: ids(10), stints, strategy: 'closers',
    constraints: { closing: { stints: 3, players: FIVE }, maxMinutes: { p0: cap } }, periods: 4 });
  assert.deepEqual(codes(run(26.4), 'PINS_OVER_CAP'), []);
  assert.equal(codes(run(26.3), 'PINS_OVER_CAP').length, 1);
});

test('436: the PINS_OVER_CAP message names only groups that pin the kid to a stint', () => {
  // all-overtime suffix: no regulation stint remains, so the Starts the last period rule pins nothing
  const stints = buildStints({ periods: 2, periodMinutes: 4, overtime: [4] }, EVERY_4).slice(2);
  const issues = analyzeFeasibility({ players: roster(8), availableIds: ids(8), stints, strategy: 'closers',
    constraints: { lastPeriodFive: FIVE, closing: { stints: 1, players: FIVE }, maxMinutes: { p0: 2 } }, periods: 2 });
  const [hit] = codes(issues, 'PINS_OVER_CAP');
  assert.ok(hit, JSON.stringify(issues));
  assert.match(hit.message, /set to close/);
  assert.ok(lacks(hit.message, 'last period'), hit.message);
});

test('436: platoon applies no pins, so pin checks do not refuse a platoon plan', () => {
  const p = generatePlan({ players: roster(10), availableIds: ids(10), format: { periods: 4, periodMinutes: 8 },
    granularity: EVERY_4, seed: 1, strategy: 'platoon',
    constraints: { units: [FIVE, ['p5', 'p6', 'p7', 'p8', 'p9']], openingFive: ['p0'], lastPeriodFive: ['p0'], maxMinutes: { p0: 4 } } });
  assert.ok(p.ok, JSON.stringify(p.issues.filter(i => i.severity === 'error')));
  assert.deepEqual(codes(p.issues, 'PINS_OVER_CAP'), []);
});

test('436: missedPinIssues emits each missed-pin code, and nothing for platoon', () => {
  const stints = buildStints(QUARTERS, EVERY_4);
  const none = { openingFive: [], lastPeriodFive: [], closing: null };
  const c = { ...none, openingFive: ['p0'], lastPeriodFive: ['p1'], closing: { stints: 1, players: ['p2'] } };
  // nobody is ever on the floor
  const lineups = stints.map(() => ['p5', 'p6', 'p7', 'p8', 'p9']);
  const args = { stints, c, periods: 4, lineups, avail: ids(10), label: id => `Kid ${id}` };
  const got = missedPinIssues(args);
  assert.deepEqual(got.map(i => i.code), ['OPENING_MISSED', 'LAST_PERIOD_MISSED', 'CLOSER_MISSED']);
  assert.deepEqual(got.map(i => i.playerIds), [['p0'], ['p1'], ['p2']]);
  assert.ok(got.every(i => i.severity === 'warn'));
  assert.match(got[0].message, /Kid p0 is set to start but is not/);
  assert.match(got[1].message, /Kid p1 is set to start the last period/);
  assert.match(got[2].message, /Kid p2 is set to close/);
  assert.deepEqual(missedPinIssues({ ...args, platoon: true }), []);
  // a lineup that honors the pins: nothing
  const kept = stints.map(() => ['p0', 'p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(missedPinIssues({ ...args, lineups: kept }), []);
});

/* ---------------- Plays at most N in a row that cannot hold (#439) ---------------- */

const restPlan = (n, constraints, seed = 1) => plan(n, { constraints, seed });
const issuesOf = (p, code) => p.issues.filter(i => i.code === code);
const runOf = (p, id) => {
  let run = 0, best = 0;
  for (const r of p.stints) { if (r.onFloor.includes(id)) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
};

test('Plays at most N in a row the roster cannot meet is one up-front line naming the players it needs', () => {
  for (const [n, r, need] of [[8, 1, 10], [7, 2, 8], [6, 3, 7]]) {
    const p = restPlan(n, { maxConsecutive: r });
    const few = issuesOf(p, 'CONSEC_TOO_FEW');
    assert.equal(few.length, 1, `Rest ${r} with ${n} players`);
    assert.ok(few[0].message.includes(`Plays at most ${r} in a row cannot hold`), few[0].message);
    assert.ok(few[0].message.includes(`needs ${need} players`), few[0].message);
    assert.equal(issuesOf(p, 'CONSEC_EXCEEDED').length, 0, `Rest ${r} with ${n} players`);
  }
});

test('Plays at most N in a row the roster can meet raises no up-front line', () => {
  for (const [n, r] of [[8, 2], [7, 3]]) {
    const p = restPlan(n, { maxConsecutive: r });
    assert.equal(issuesOf(p, 'CONSEC_TOO_FEW').length, 0, `Rest ${r} with ${n} players`);
  }
});

test('Rest 1 with 6 players shortens the worst run first', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const p = restPlan(6, { maxConsecutive: 1 }, seed);
    for (const id of ids(6)) assert.ok(runOf(p, id) <= 5, `seed ${seed} ${id} ran ${runOf(p, id)}`);
  }
});

test('when Plays at most N in a row forces five to change at once, the subs warning says so', () => {
  const p = restPlan(10, { maxConsecutive: 1, openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'] });
  const w = issuesOf(p, 'SUBS_EXCEEDED')[0];
  assert.ok(w, 'SUBS_EXCEEDED is present');
  assert.match(w.message, /Plays at most 1 in a row/);
  assert.ok(lacks(w.message, 'cost somebody minutes'), w.message);
});

test('a minimum Plays at most N in a row makes impossible is named up front', () => {
  const p = restPlan(10, { maxConsecutive: 2, minMinutes: { p0: 28 } });
  const w = issuesOf(p, 'CONSEC_MIN_CONFLICT').find(i => i.playerIds.includes('p0'));
  assert.ok(w, 'CONSEC_MIN_CONFLICT for p0');
  assert.ok(w.message.includes('28-minute minimum'), w.message);
  assert.ok(w.message.includes('PlayerA'), w.message);
  assert.equal(issuesOf(p, 'CONSEC_EXCEEDED').filter(i => i.playerIds.includes('p0')).length, 0);
});

/* ---------------- #439 review fixes ---------------- */

test('a break Plays at most N in a row did not force keeps the "cost somebody minutes" reason', () => {
  const p = plan(8, { seed: 1, maxSubs: 1, constraints: { maxConsecutive: 2 } });
  const w = issuesOf(p, 'SUBS_EXCEEDED')[0];
  assert.ok(w, 'SUBS_EXCEEDED is present');
  assert.ok(w.message.includes('cost somebody minutes'), w.message);
  assert.ok(lacks(w.message, 'Plays at most'), w.message);
});

test('a forced break names the number asked for, not "that many"', () => {
  const p = restPlan(10, { maxConsecutive: 1, openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'] });
  const w = issuesOf(p, 'SUBS_EXCEEDED')[0];
  assert.ok(w.message.includes('Plays at most 1 in a row makes more than 3 come off at once.'), w.message);
});

const everyoneMin = (n, m) => Object.fromEntries(ids(n).map(id => [id, m]));

test('several minimums Plays at most N in a row rules out are one line naming each player', () => {
  const five = ids(5);
  const p = restPlan(10, { maxConsecutive: 2, minMinutes: Object.fromEntries(five.map(id => [id, 28])) });
  assert.ok(p.ok, 'the plan builds');
  const w = issuesOf(p, 'CONSEC_MIN_CONFLICT');
  assert.equal(w.length, 1, w.map(i => i.message).join(' | '));
  assert.deepEqual([...w[0].playerIds].sort(), five);
  assert.ok(w[0].message.includes('PlayerA') && w[0].message.includes('PlayerE'), w[0].message);
  assert.match(w[0].message, /more than Plays at most 2 in a row allows/);
});

test('a minimum the game cannot hold at all does not also blame Plays at most N in a row', () => {
  const p = restPlan(10, { maxConsecutive: 2, minMinutes: everyoneMin(10, 26) });
  assert.equal(p.ok, false);
  assert.ok(p.issues.some(i => i.severity === 'error'), 'a blocking error is named');
  assert.equal(issuesOf(p, 'CONSEC_MIN_CONFLICT').length, 0);
});

test('Plays at most N in a row as long as the game is not offered as the way out', () => {
  const p = plan(6, { format: { periods: 4, periodMinutes: 8 }, granularity: { mode: 'perPeriod', value: 1 },
    constraints: { maxConsecutive: 3 } });
  const w = issuesOf(p, 'CONSEC_TOO_FEW')[0];
  assert.ok(w, 'CONSEC_TOO_FEW is present');
  assert.ok(lacks(w.message, 'Try a limit of'), w.message);
  assert.match(w.message, /Turn off Plays at most N in a row or add players\.$/);
});

test('no up-front line when the game has fewer than r+1 stints', () => {
  const p = plan(6, { format: { periods: 1, periodMinutes: 8 }, granularity: { mode: 'everyN', value: 4 },
    constraints: { maxConsecutive: 2 } });
  assert.equal(p.stints.length, 2);
  assert.equal(issuesOf(p, 'CONSEC_TOO_FEW').length, 0);
});

test('on unequal stints the minimum Plays at most N in a row allows is exact', () => {
  /* 1 period of 10 minutes, a break every 4: stints of 4, 4 and 2. With Rest 1
     nobody can play two in a row, so the most is 4 + 2 = 6 minutes. */
  const run = mn => plan(8, { format: { periods: 1, periodMinutes: 10 }, granularity: { mode: 'everyN', value: 4 },
    constraints: { maxConsecutive: 1, minMinutes: { p0: mn } } });
  assert.equal(run(6).stints.map(s => s.minutes).join(), '4,4,2');
  assert.equal(issuesOf(run(6), 'CONSEC_MIN_CONFLICT').length, 0);
  assert.equal(issuesOf(run(7), 'CONSEC_MIN_CONFLICT').length, 1);
});

/* ---------------- #443: long sits cost more than short ones ---------------- */

const seedsOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const onFloorIn = (p, id, rows) => p.stints.some(r => rows(r.period) && r.onFloor.includes(id));

test('#443 a capped starter still plays in both halves', () => {
  let both = 0;
  for (const seed of seedsOf(1, 30)) {
    const p = plan(10, { seed, constraints: { openingFive: FIVE, maxMinutes: { p0: 8 } } });
    if (onFloorIn(p, 'p0', q => q <= 2) && onFloorIn(p, 'p0', q => q >= 3)) both++;
  }
  assert.ok(both >= 28, `p0 played both halves in ${both}/30 plans`);
});

test('#443 nobody sits more than 12 minutes in a row at a change limit of 3', () => {
  for (const n of [11, 12]) {
    for (const seed of seedsOf(1, 20)) {
      const p = plan(n, { seed, maxSubs: 3 });
      for (const id of ids(n)) {
        assert.ok(longestBench(p, id) <= 12, `${n} players, seed ${seed}: ${id} sat ${longestBench(p, id)}`);
      }
    }
  }
});

test('#443 a Starting five does not make a starter sit half the game', () => {
  for (const seed of seedsOf(1, 30)) {
    const withFive = plan(12, { seed, constraints: { openingFive: FIVE } });
    const without = plan(12, { seed });
    if (halfGameSitters(without, 16).length) continue;
    const bad = halfGameSitters(withFive, 16).filter(id => FIVE.includes(id));
    assert.deepEqual(bad, [], `seed ${seed}: starters sitting 16+ in a row`);
  }
});

test('#443 the change limit is no more broken than before', () => {
  /* the one plan today's code flags, from the spec's Survey */
  const today = ['4x8/2, 10 players, seed 6'];
  const formats = [
    ['4x8/4', { periods: 4, periodMinutes: 8 }, 4], ['2x20/5', { periods: 2, periodMinutes: 20 }, 5],
    ['2x16/4', { periods: 2, periodMinutes: 16 }, 4], ['4x6/3', { periods: 4, periodMinutes: 6 }, 3],
    ['4x8/2', { periods: 4, periodMinutes: 8 }, 2],
  ];
  const flagged = [];
  for (const [label, format, every] of formats) {
    for (const n of [10, 11, 12]) {
      for (const seed of seedsOf(1, 8)) {
        const p = plan(n, { seed, maxSubs: 2, format, granularity: { mode: 'everyN', value: every } });
        if (p.issues.some(i => i.code === 'SUBS_EXCEEDED')) flagged.push(`${label}, ${n} players, seed ${seed}`);
      }
    }
  }
  assert.deepEqual(flagged.filter(f => !today.includes(f)), []);
});

/* Games where the long-sit plan used to win with a warning the plain search
   does not give. Found by sweeping tiers 1-5 and maxSubs 2/3/5; the base
   column is the pre-#443 engine. Written as data so each stays a game. */
const warned = ({ n, seed, maxSubs, constraints }) => {
  const players = roster(n).map((p, i) => ({ ...p, tier: 1 + (i * 7 + seed) % 5 }));
  return new Set(generatePlan({
    players, availableIds: ids(n), format: QUARTERS, granularity: EVERY_4, seed, maxSubs, constraints,
  }).issues.filter(i => i.level !== 'info').map(i => i.code));
};

test('#443 Plays at most 2 in a row is not newly broken by the long-sit charge', () => {
  const w = warned({ n: 8, seed: 4, maxSubs: 2,
    constraints: { lockedTargets: ['p0'], targetMinutes: { p0: 8 }, maxConsecutive: 2 } });
  assert.ok(!w.has('CONSEC_EXCEEDED'));
});

test('#443 the change limit is not newly broken beside Plays at most 2 in a row', () => {
  const w = warned({ n: 12, seed: 1, maxSubs: 3, constraints: { maxConsecutive: 2 } });
  assert.ok(!w.has('SUBS_EXCEEDED'));
});

test('#443 the change limit is not newly broken beside a cap and a minimum', () => {
  const w = warned({ n: 10, seed: 3, maxSubs: 2,
    constraints: { maxMinutes: { p0: 12, p1: 16 }, minMinutes: { p2: 20 } } });
  assert.ok(!w.has('SUBS_EXCEEDED'));
});

/* ---------------- #446: notes name the rule that bound ---------------- */

const lettered = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: String.fromCharCode(65 + i) }));
const clash = (n, over = {}) => generatePlan({
  players: lettered(n), availableIds: lettered(n).map(p => p.id),
  format: QUARTERS, granularity: EVERY_4, seed: 1, ...over,
});
const noteOf = (p, code) => p.issues.find(i => i.code === code);

test('#446 Apart on a 6-player bench says Apart, not the clock', () => {
  const p = clash(6, { constraints: { avoids: [['p0', 'p1']] } });
  assert.equal(noteOf(p, 'SPREAD_FLOOR'), undefined);
  const n = noteOf(p, 'SPREAD_RULE');
  assert.equal(n.severity, 'info');
  assert.match(n.message, /Apart/);
  assert.match(n.message, /6/);
  assert.match(n.message, /\bA\b/);
  assert.match(n.message, /\bB\b/);
  assert.deepEqual([...n.playerIds].sort(), ['p0', 'p1']);
});

test('#446 Force Together with a capped partner names the partner and the cap', () => {
  const p = clash(10, { constraints: { pairs: [['p0', 'p1']], hardPairs: true, maxMinutes: { p0: 8 } } });
  assert.equal(noteOf(p, 'SPREAD_FLOOR'), undefined);
  const n = noteOf(p, 'SPREAD_RULE');
  assert.match(n.message, /Force Together/);
  assert.match(n.message, /capped at 8/);
  assert.match(n.message, /\bB\b/);
});

test('#446 Force Together with a partner who has a minimum says minimum', () => {
  const p = clash(10, { constraints: { pairs: [['p0', 'p1']], hardPairs: true, minMinutes: { p0: 28 } } });
  const n = noteOf(p, 'SPREAD_RULE');
  assert.match(n.message, /Force Together/);
  assert.match(n.message, /minimum 28/);
});

test('#446 Force Together that ties two Apart players is refused, naming them', () => {
  const constraints = { pairs: [['p0', 'p1'], ['p0', 'p2']], avoids: [['p1', 'p2']], hardPairs: true };
  const p = clash(10, { constraints });
  assert.equal(p.ok, false);
  const e = noteOf(p, 'PAIR_CHAIN_APART');
  assert.equal(e.severity, 'error');
  assert.match(e.message, /\bB and C\b/);
  assert.match(e.message, /\bA\b/);
  assert.deepEqual([...e.playerIds].sort(), ['p1', 'p2']);
});

test('#446 the same rules with Force Together off are not refused', () => {
  const p = clash(10, { constraints: { pairs: [['p0', 'p1'], ['p0', 'p2']], avoids: [['p1', 'p2']], hardPairs: false } });
  assert.equal(p.ok, true);
});

const byHand = (over = {}) => ({
  strategy: 'minutes',
  constraints: {
    targetMinutes: { p0: 8, p1: 20, p2: 20, p3: 16, p4: 16, p5: 16, p6: 16, p7: 16, p8: 16, p9: 16 },
    lockedTargets: ['p0'], minMinutes: { p0: 16 }, ...over,
  },
});

test('#446 a locked By hand number under a minimum is raised, on every seed', () => {
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(clash(10, { ...byHand(), seed }).minutes.p0, 16, `seed ${seed}`);
  }
  const p = clash(10, byHand());
  const w = noteOf(p, 'TARGET_UNDER_MIN');
  assert.equal(w.severity, 'warn');
  assert.deepEqual(w.playerIds, ['p0']);
  assert.equal(w.message, "A's By hand number was raised from 8 to 16 to meet their 16-minute minimum.");
  assert.equal(noteOf(p, 'TARGETS_OVER_BUDGET'), undefined);
});

test('#446 the league shape (everyone has a 16 minimum) raises the lock too', () => {
  const everyone = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, 16]));
  const p = clash(10, byHand({ minMinutes: everyone }));
  assert.equal(p.minutes.p0, 16);
  assert.equal(noteOf(p, 'TARGETS_OVER_BUDGET'), undefined);
});

test('#446 locked By hand numbers that cannot cover One of two on are refused, naming them', () => {
  const targetMinutes = { p0: 8, p1: 8 };
  for (let i = 2; i < 10; i++) targetMinutes[`p${i}`] = 18;
  const p = clash(10, { strategy: 'minutes', constraints: {
    targetMinutes, lockedTargets: ['p0', 'p1'], keepOnFloor: [['p0', 'p1']] } });
  assert.equal(p.ok, false);
  const e = noteOf(p, 'KEEPON_UNSATISFIABLE');
  assert.match(e.message, /By hand/);
  assert.match(e.message, /\b8\b/);
  assert.doesNotMatch(e.message, /caps/);
});

test('#446 a minimum lost to the pinned fives names them, not the clock', () => {
  const p = clash(6, {
    format: { periods: 1, periodMinutes: 6 },
    constraints: { minMinutes: { p0: 4 }, openingFive: ['p1', 'p2', 'p3'], lastPeriodFive: ['p4', 'p5'] },
  });
  const m = noteOf(p, 'MIN_MISSED');
  assert.match(m.message, /Starting five/);
  assert.match(m.message, /Starts the last period/);
  assert.doesNotMatch(m.message, /clock/);
});

test('#446 a minimum off the stint grid keeps the clock wording', () => {
  const players = lettered(7);
  const p = clash(7, {
    format: { periods: 2, periodMinutes: 20 }, granularity: { mode: 'everyN', value: 5 }, seed: 9,
    constraints: {
      minMinutes: Object.fromEntries(players.map(x => [x.id, 6])), maxMinutes: { p1: 8 },
    },
  });
  assert.equal(p.minutes.p1, 5);
  const m = p.issues.filter(i => i.code === 'MIN_MISSED').find(i => i.playerIds[0] === 'p1');
  assert.match(m.message, /The clock does not divide to hit it exactly\./);
});

test('#446 a Force Together group too big to sit plays every minute, and says so', () => {
  const p = clash(7, { constraints: { pairs: [['p0', 'p1'], ['p1', 'p2']], hardPairs: true } });
  assert.equal(noteOf(p, 'SPREAD_FLOOR'), undefined);
  const n = noteOf(p, 'SPREAD_RULE');
  assert.match(n.message, /Force Together/);
  assert.match(n.message, /every minute/);
  assert.deepEqual([...n.playerIds].sort(), ['p0', 'p1', 'p2']);
});

test('#446 Apart from a player who plays the whole game names that player', () => {
  const p = clash(6, { constraints: { avoids: [['p0', 'p1']], minMinutes: { p1: 32 } } });
  assert.equal(noteOf(p, 'SPREAD_FLOOR'), undefined);
  const n = noteOf(p, 'SPREAD_RULE');
  assert.equal(n.message, 'A plays 0 because they are Apart from B, who plays every minute.');
});

test('#446 One of two on with both capped to cover the game names One of two on', () => {
  const p = clash(13, { constraints: { keepOnFloor: [['p0', 'p1']], maxMinutes: { p0: 16, p1: 16 } } });
  assert.equal(noteOf(p, 'SPREAD_FLOOR'), undefined);
  const n = noteOf(p, 'SPREAD_RULE');
  assert.match(n.message, /One of two on/);
  assert.deepEqual([...n.playerIds].sort(), ['p0', 'p1']);
});

test('#446 HALF_LATE names the pinned closers when they fill every stint before halftime', () => {
  const p = clash(6, {
    format: { periods: 1, periodMinutes: 16 },
    constraints: { closing: { stints: 4, players: ['p1', 'p2', 'p3', 'p4', 'p5'] } },
  });
  const m = noteOf(p, 'HALF_LATE').message;
  assert.match(m, /Closers/);
  assert.ok(lacks(m, /No legal lineup/));
});

test('#446 HALF_LATE names the Apart rule when the partner is on every stint before halftime', () => {
  const p = clash(6, { constraints: { avoids: [['p0', 'p1']], minMinutes: { p1: 32 } } });
  const m = noteOf(p, 'HALF_LATE').message;
  assert.match(m, /Apart from B/);
  assert.ok(lacks(m, /No legal lineup/));
});

test('#446 One of two on missed because the pinned fives fill the stint names them', () => {
  const p = clash(7, {
    format: { periods: 1, periodMinutes: 6 },
    constraints: { keepOnFloor: [['p0', 'p1']], openingFive: ['p2', 'p3', 'p4'], lastPeriodFive: ['p5', 'p6'] },
  });
  const m = noteOf(p, 'KEEPON_PARTIAL').message;
  assert.match(m, /Starting five/);
  assert.match(m, /Starts the last period/);
  assert.ok(lacks(m, /No legal lineup/));
});

/* ---------------- #446 fix pass: the notes must be true ---------------- */

test('#446 a player in two pinned groups is not counted twice: a stint with open seats is not "filled"', () => {
  // 1 x 6 gives stints of 4 and 2. Starting five and Starts the last period are
  // the same three kids (B, C, D) on the same stint, so two seats stay open --
  // A could play it, but is Apart from B. A got 2 against a 4-minute minimum.
  const p = clash(6, {
    format: { periods: 1, periodMinutes: 6 },
    constraints: {
      minMinutes: { p0: 4 }, avoids: [['p0', 'p1']],
      openingFive: ['p1', 'p2', 'p3'], lastPeriodFive: ['p1', 'p2', 'p3'],
    },
  });
  const m = noteOf(p, 'MIN_MISSED').message;
  assert.equal(m, 'A got 2 minutes against a 4-minute minimum. No legal lineup gave them more.');
});

test('#446 a minimum missed after a pin-filled stint AND an open one the player sat does not blame the pins', () => {
  // 7 players, 1 x 12 (three 4-minute stints), Starting five B-F fills stint 1.
  // A and G both need 8, are Apart, so each gets one of the two open stints (4).
  // The open stint each sat could have covered the 4 minutes they lack.
  const p = clash(7, {
    format: { periods: 1, periodMinutes: 12 },
    constraints: {
      minMinutes: { p0: 8, p6: 8 }, avoids: [['p0', 'p6']], openingFive: ['p1', 'p2', 'p3', 'p4', 'p5'],
    },
  });
  const m = p.issues.filter(i => i.code === 'MIN_MISSED').find(i => i.playerIds[0] === 'p0').message;
  assert.equal(m, 'A got 4 minutes against a 8-minute minimum. No legal lineup gave them more.');
});

test('#446 One of two on off for two stints, only one of them pin-filled, does not blame the pins', () => {
  // 7 players, 1 x 12 (three stints). B, C, D start and E, F the last period
  // (the same stint in a one-period game), so stint 1 is filled. A is Apart from
  // all five, so A never plays; B is capped at 4. Both are off stints 1 and one other.
  const p = clash(7, {
    format: { periods: 1, periodMinutes: 12 },
    constraints: {
      keepOnFloor: [['p0', 'p1']], maxMinutes: { p1: 4 },
      avoids: ['p2', 'p3', 'p4', 'p5', 'p6'].map(x => ['p0', x]),
      openingFive: ['p2', 'p3', 'p4'], lastPeriodFive: ['p5', 'p6'],
    },
  });
  const m = noteOf(p, 'KEEPON_PARTIAL').message;
  assert.equal(m, 'A and B are both off the floor for 2 stints — no legal lineup kept one of them on.');
});

test('#446 HALF_LATE explains the late player it can and keeps the plain sentence for the one it cannot', () => {
  // A is Apart from B, who plays every minute. C is capped at 0, so nothing
  // but the cap keeps C off the floor.
  const p = clash(7, { constraints: { avoids: [['p0', 'p1']], minMinutes: { p1: 32 }, maxMinutes: { p2: 0 } } });
  const m = noteOf(p, 'HALF_LATE').message;
  assert.match(m, /A is Apart from B, who is on the floor for every stint before halftime\./);
  assert.match(m, /No legal lineup got C on any sooner\./);
});

test('#446 two locked By hand numbers under a minimum are both raised, and the unlocked numbers pay for both', () => {
  // A and B locked at 8, minimum 16 each. The other eight were 18 (144): raising
  // A and B adds 16, which comes back as 2 each from the eight, to 16. All 160.
  const targetMinutes = { p0: 8, p1: 8 };
  for (let i = 2; i < 10; i++) targetMinutes[`p${i}`] = 18;
  const p = clash(10, { strategy: 'minutes', constraints: {
    targetMinutes, lockedTargets: ['p0', 'p1'], minMinutes: { p0: 16, p1: 16 } } });
  const raised = p.issues.filter(i => i.code === 'TARGET_UNDER_MIN');
  assert.deepEqual(raised.map(i => i.message), [
    "A's By hand number was raised from 8 to 16 to meet their 16-minute minimum.",
    "B's By hand number was raised from 8 to 16 to meet their 16-minute minimum.",
  ]);
  assert.equal(noteOf(p, 'TARGETS_OVER_BUDGET'), undefined);
  assert.equal(noteOf(p, 'TARGETS_UNDER_BUDGET'), undefined);
  assert.deepEqual(Object.values(p.minutes), Array(10).fill(16));
});

test('#446 the take-back never goes below a player\'s own minimum: the one with room pays it all', () => {
  // A locked 8 (minimum 16), B-I each 16 with a 16 minimum, J 24. Raising A adds
  // 8; B-I have no room, so J pays all 8, to 16. Everyone plays 16.
  const targetMinutes = { p0: 8, p9: 24 };
  const minMinutes = { p0: 16 };
  for (let i = 1; i < 9; i++) { targetMinutes[`p${i}`] = 16; minMinutes[`p${i}`] = 16; }
  const p = clash(10, { strategy: 'minutes', constraints: { targetMinutes, lockedTargets: ['p0'], minMinutes } });
  assert.equal(noteOf(p, 'TARGET_UNDER_MIN').message,
    "A's By hand number was raised from 8 to 16 to meet their 16-minute minimum.");
  assert.equal(noteOf(p, 'TARGETS_OVER_BUDGET'), undefined);
  assert.equal(noteOf(p, 'TARGETS_UNDER_BUDGET'), undefined);
  assert.equal(noteOf(p, 'MIN_MISSED'), undefined);
  assert.deepEqual(Object.values(p.minutes), Array(10).fill(16));
});

test('#446 when not everyone has a By hand number, the raise takes nothing back and says so once', () => {
  const p = clash(10, { strategy: 'minutes', constraints: {
    targetMinutes: { p0: 8, p1: 20, p2: 20 }, lockedTargets: ['p0'], minMinutes: { p0: 16 } } });
  assert.equal(p.minutes.p0, 16);
  assert.equal(p.issues.filter(i => i.code === 'TARGET_UNDER_MIN').length, 1);
  assert.equal(noteOf(p, 'TARGETS_OVER_BUDGET'), undefined);
});

/* ---------------- #448: HALF_EARLY, the mirror of HALF_LATE ---------------- */

describe448();
function describe448() {
  const ALL = (n, minutes) => Object.fromEntries(ids(n).map(id => [id, minutes]));
  const run = (n, periodMinutes, maxSubs, seed) => generatePlan({
    players: roster(n), availableIds: ids(n),
    format: { periods: 4, periodMinutes }, granularity: { mode: 'breaksOnly' },
    constraints: { minMinutes: ALL(n, 10) }, seed, maxSubs,
  });
  const half = (p) => stintsBeforeHalftime(p.stints.filter(s => s.period <= 4));
  const early = (p) => p.issues.find(i => i.code === 'HALF_EARLY');

  test('#448 names the kids who play before halftime and never after, with the arithmetic', () => {
    const p = run(10, 5, 3, 1);
    assert.ok(p.ok);
    const issue = early(p);
    assert.ok(issue, 'kids sit the whole second half and the plan is silent about it');
    assert.equal(issue.severity, 'warn');
    assert.deepEqual([...issue.playerIds].sort(), ['p5', 'p9']);
    assert.ok(issue.message.includes('PlayerF') && issue.message.includes('PlayerJ'), issue.message);
    assert.ok(/do not play after halftime/.test(issue.message), issue.message);
    assert.ok(/3 changes at a time/.test(issue.message) && /allow more changes/.test(issue.message), issue.message);
  });

  test('#448 stays silent when the change limit leaves room for everyone', () => {
    assert.equal(early(run(10, 5, 5, 1)), undefined);
  });

  test('#448 names exactly the kids who play only the first half, seeds 1-20', () => {
    for (const [pm, n] of [[5, 9], [5, 10], [8, 9], [8, 10]]) {
      for (let seed = 1; seed <= 20; seed++) {
        const p = run(n, pm, 3, seed);
        if (!p.ok) continue;
        const h = half(p);
        const first = new Set(p.stints.slice(0, h).flatMap(x => x.onFloor));
        const second = new Set(p.stints.slice(h).flatMap(x => x.onFloor));
        const want = [...first].filter(id => !second.has(id)).sort();
        const got = early(p) ? [...early(p).playerIds].sort() : [];
        assert.deepEqual(got, want, `${n} players, ${pm} min periods, seed ${seed}`);
      }
    }
  });
}

/* ---------------- #449: `start`, the plan a re-solve begins from ---------------- */

{
  const TEN = Array.from({ length: 10 }, (_, i) => ({ id: 'ABCDEFGHIJ'[i], name: `Kid${'ABCDEFGHIJ'[i]}` }));
  const solve = (seed, extra = {}, constraintExtra = {}) => generatePlan({
    players: TEN, availableIds: TEN.map(p => p.id), format: QUARTERS, granularity: EVERY_4, seed, maxSubs: 3,
    constraints: { openingFive: ['A', 'B', 'C', 'D', 'E'], avoids: [['F', 'G']], keepOnFloor: [['A', 'F']], maxConsecutive: 2, ...constraintExtra },
    ...extra,
  });
  const rows = (p) => p.stints.map(s => s.onFloor);

  test('#449 a start that is not one row per stint is ignored, byte for byte', () => {
    const plain = solve(3);
    assert.deepEqual(solve(3, { start: undefined }), plain);
    assert.deepEqual(solve(3, { start: rows(plain).slice(0, 3) }), plain, 'too few rows');
    assert.deepEqual(solve(3, { start: [] }), plain, 'empty');
  });

  test('#449 given its own plan back, a solve keeps every seat, whatever the seed', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const first = solve(seed);
      assert.deepEqual(rows(solve(seed, { start: rows(first) })), rows(first), `seed ${seed}`);
    }
  });

  test('#449 levels never move minutes, with a start too (the balance pass is minute-neutral)', () => {
    // a start from another seed is not what this solve would find, and under levels
    // the second pass must not swap it in with different totals than the first gave
    const NINE = TEN.slice(0, 9);
    const leveled = NINE.map((p, i) => ({ ...p, tier: [1, 5, 3, 2, 4, 1, 5, 3, 2][i] }));
    const flat = NINE.map(p => ({ ...p, tier: 3 }));
    const go = (players, start) => generatePlan({
      players, availableIds: NINE.map(p => p.id), format: QUARTERS, granularity: EVERY_4, seed: 1, maxSubs: 3,
      balance: 'even', constraints: {}, start,
    });
    const start = rows(generatePlan({
      players: leveled, availableIds: NINE.map(p => p.id), format: QUARTERS, granularity: EVERY_4, seed: 8, maxSubs: 3,
      balance: 'even', constraints: {},
    }));
    assert.deepEqual(go(leveled, start).minutes, go(flat, start).minutes);
  });

  test('#449 a rule the start breaks is repaired, and most seats stay', () => {
    // Apart H-I: the start has them on together in two stints, so those rows must change; the rest should mostly stay
    const first = solve(2);
    const edited = { avoids: [['F', 'G'], ['H', 'I']] };
    const warm = solve(2, { start: rows(first) }, edited);
    const cold = solve(2, {}, edited);
    assert.ok(warm.ok);
    for (const lu of rows(warm)) assert.ok(!(lu.includes('H') && lu.includes('I')), `H and I together: ${lu}`);
    const moved = (a, b) => rows(a).reduce((m, r, i) => m + r.filter(id => !rows(b)[i].includes(id)).length, 0);
    assert.ok(moved(first, warm) <= moved(first, cold) / 2, `warm moved ${moved(first, warm)}, cold ${moved(first, cold)}`);
    assert.ok(moved(first, warm) <= 8, `warm moved ${moved(first, warm)} of 40 seats`);
  });
}
