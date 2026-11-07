import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, isOvertimeStint } from '../app/engine.js';
import { scenario, longestRun } from './fuzz-gen.js';

test('fuzz: no scenario throws, and every plan is structurally legal', () => {
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const ctx = `scenario ${n}`;
    let p;
    try { p = generatePlan(sc); }
    catch (e) { assert.fail(`${ctx} threw: ${e.stack}`); }

    assert.ok(Array.isArray(p.issues), ctx);

    if (!p.ok) {
      const errs = p.issues.filter(i => i.severity === 'error');
      assert.ok(errs.length, `${ctx}: refused a plan without saying why`);
      assert.ok(errs.every(e => e.code && e.message && e.message.length > 10),
        `${ctx}: an error carried no usable message`);
      continue;
    }

    const availSet = new Set(sc.availableIds);
    for (const r of p.stints) {
      assert.equal(r.onFloor.length, 5, `${ctx} stint ${r.index}: wrong count`);
      assert.equal(new Set(r.onFloor).size, 5, `${ctx} stint ${r.index}: duplicate player`);
      for (const id of r.onFloor) {
        assert.ok(availSet.has(id), `${ctx} stint ${r.index}: ${id} is not available`);
      }
      assert.equal(r.onFloor.length + r.sitting.length, sc.availableIds.length,
        `${ctx} stint ${r.index}: floor + bench should account for everyone available`);
    }

    // stint lengths can be fractional (a 10-min period split three ways), so
    // reconcile within a rounding tolerance rather than exactly
    const total = Object.values(p.minutes).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - sc.gameMinutes * 5) < 0.05,
      `${ctx}: minutes do not reconcile (${total} vs ${sc.gameMinutes * 5})`);

    for (const m of Object.values(p.minutes)) {
      assert.ok(String(m).replace('-', '').replace('.', '').length <= 6,
        `${ctx}: unformatted float leaked into minutes (${m})`);
    }
  }
});

test('fuzz: a hard constraint is either honoured or reported, never silently dropped', () => {
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const p = generatePlan(sc);
    if (!p.ok) continue;
    const ctx = `scenario ${n}`;
    const c = sc.constraints;
    const said = code => p.issues.some(i => i.code === code);

    /* Avoid pairs are enforced outright, with one declared exception: a
       platoon unit is used exactly as the coach wrote it, so a pair inside a
       unit is honoured as written *and* reported as UNIT_AVOID. Silence is
       still a failure; being overruled loudly is not. */
    for (const [a, b] of c.avoids) {
      if (!sc.availableIds.includes(a) || !sc.availableIds.includes(b)) continue;
      const inSameUnit = (c.units || []).some(u => u.includes(a) && u.includes(b));
      for (const r of p.stints) {
        if (!(r.onFloor.includes(a) && r.onFloor.includes(b))) continue;
        assert.ok(inSameUnit && said('UNIT_AVOID'),
          `${ctx}: avoid ${a}/${b} broken at stint ${r.index} with no warning`);
      }
    }

    for (const [id, cap] of Object.entries(c.maxMinutes)) {
      if (!sc.availableIds.includes(id)) continue;
      if (p.minutes[id] > cap + 1e-9) {
        assert.ok(said('CAP_EXCEEDED'), `${ctx}: ${id} blew a ${cap} cap with no warning`);
      }
    }
    for (const [id, need] of Object.entries(c.minMinutes)) {
      if (!sc.availableIds.includes(id)) continue;
      if (p.minutes[id] < need - 1e-9) {
        assert.ok(said('MIN_MISSED'), `${ctx}: ${id} missed a ${need} minimum with no warning`);
      }
    }
    if (c.maxConsecutive) {
      for (const id of sc.availableIds) {
        if (longestRun(p.stints, id) > c.maxConsecutive) {
          const upFront = p.issues.some(i => i.code === 'CONSEC_TOO_FEW' || i.code === 'CONSEC_IMPOSSIBLE'
            || (i.code === 'CONSEC_MIN_CONFLICT' && i.playerIds.includes(id)));
          assert.ok(said('CONSEC_EXCEEDED') || upFront, `${ctx}: ${id} ran past the limit with no warning`);
        }
      }
      /* The DP says a minimum is out of reach under the limit; the engine must
         never have delivered it, or the up-front line claimed the impossible. */
      for (const w of p.issues.filter(i => i.code === 'CONSEC_MIN_CONFLICT')) {
        for (const id of w.playerIds) {
          const both = p.minutes[id] >= c.minMinutes[id] - 1e-9 && longestRun(p.stints, id) <= c.maxConsecutive;
          assert.ok(!both, `${ctx}: ${id} met the minimum within the limit yet CONSEC_MIN_CONFLICT named them`);
        }
      }
    }
  }
});

test('fuzz: identical input produces an identical plan', () => {
  for (let n = 1; n <= 120; n++) {
    const sc = scenario(n);
    const a = generatePlan(sc), b = generatePlan(sc);
    assert.equal(a.ok, b.ok, `scenario ${n}`);
    if (a.ok) {
      assert.deepEqual(a.stints.map(r => r.onFloor), b.stints.map(r => r.onFloor), `scenario ${n}`);
      assert.deepEqual(a.minutes, b.minutes, `scenario ${n}`);
    }
  }
});

test('fuzz: short names are always unique and printable', () => {
  for (let n = 1; n <= 200; n++) {
    const sc = scenario(n);
    const p = generatePlan(sc);
    const names = Object.values(p.shortNames || {});
    if (!names.length) continue;
    assert.equal(new Set(names).size, names.length,
      `scenario ${n}: duplicate short names ${JSON.stringify(p.shortNames)}`);
    assert.ok(names.every(v => typeof v === 'string' && v.length >= 1 && v.length <= 5),
      `scenario ${n}: unprintable short name ${JSON.stringify(names)}`);
  }
});

test('fuzz #378: the generator makes overtime and uneven-stint games, and no warning prints a raw float', () => {
  let overtime = 0, uneven = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    if (sc.format.overtime?.length) overtime++;
    const reg = sc.stints.filter(s => !isOvertimeStint(s));
    if (reg.some(s => Math.abs(s.minutes - reg[0].minutes) > 1e-9)) uneven++;
    for (const i of generatePlan(sc).issues) {
      assert.doesNotMatch(i.message, /\d\.\d{3,}/, `scenario ${n} ${i.code}: ${i.message}`);
    }
  }
  assert.ok(overtime > 0, 'no scenario had overtime');
  assert.ok(uneven > 0, 'no scenario had uneven stints');
});
