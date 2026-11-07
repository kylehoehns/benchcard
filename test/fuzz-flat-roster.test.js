import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, analyzeFeasibility } from '../app/engine.js';
import { scenario, minutesSpread } from './fuzz-gen.js';

test('property: a flat roster plans identically whatever the shape', () => {
  /* Inertness. A coach who never opens the tier control must not be able to
     tell the feature shipped, no matter which shape happens to be stored. */
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    if (sc.strategy === 'platoon') continue;
    const flatRoster = sc.players.map(p => ({ ...p, tier: 3 }));
    const base = generatePlan({ ...sc, players: flatRoster, balance: 'even' });
    if (!base.ok) continue;
    for (const shape of ['start', 'finish', 'both']) {
      const p = generatePlan({ ...sc, players: flatRoster, balance: shape });
      assert.deepEqual(p.stints.map(r => r.onFloor), base.stints.map(r => r.onFloor),
        `scenario ${n}: ${shape} moved a flat roster`);
    }
    checked++;
  }
  assert.ok(checked > 100, `only ${checked} scenarios compared`);
});

test('property: lineup balance never widens the minutes spread', () => {
  /* The one trade this app must not make. Balance is allowed to rearrange
     who shares the floor; it is not allowed to buy that with anyone's
     minutes. Compared against the identical scenario with the shape off. */
  let checked = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    if (sc.balance === 'even' || sc.strategy === 'platoon') continue;
    const shaped = generatePlan(sc);
    const flat = generatePlan({ ...sc, balance: 'even' });
    if (!shaped.ok || !flat.ok) continue;
    checked++;
    assert.ok(minutesSpread(shaped) <= minutesSpread(flat) + 1e-9,
      `scenario ${n} (${sc.balance}): spread went ${minutesSpread(flat)} -> ${minutesSpread(shaped)}`);
  }
  assert.ok(checked > 40, `only ${checked} scenarios exercised a shape`);
});


test('property #378: a starting five whose caps cover the opening stint is never blocked by FORCED_OVER_CAP', () => {
  let exercised = 0;
  for (let n = 1; n <= 400; n++) {
    const sc = scenario(n);
    const five = sc.constraints.openingFive.filter(id => sc.availableIds.includes(id));
    const covered = five.length && five.every(id => {
      const cap = sc.constraints.maxMinutes[id];
      return cap == null || cap >= sc.stints[0].minutes;
    });
    if (!covered) continue;
    if (five.some(id => sc.constraints.maxMinutes[id] != null)) exercised++;
    const issues = analyzeFeasibility({ players: sc.players, availableIds: sc.availableIds,
      constraints: sc.constraints, stints: sc.stints, strategy: sc.strategy, periods: sc.format.periods });
    // players also pinned to the last period may fail that stint's check instead
    const onlyOpening = five.filter(id => !sc.constraints.lastPeriodFive.includes(id));
    assert.deepEqual(issues.filter(i => i.code === 'FORCED_OVER_CAP' && i.playerIds.some(id => onlyOpening.includes(id))), [],
      `scenario ${n}`);
  }
  assert.ok(exercised > 0, 'no scenario had a capped starting five that covers the stint');
});
