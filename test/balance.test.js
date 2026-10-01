import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../app/engine.js';

/* Lineup balance exists so a coach can have even minutes *and* not field
   their five weakest together. The whole feature is only defensible if the
   first half of that sentence survives it, so most of what follows is about
   what balance must NOT cost. */

const team = tiers => tiers.map((tier, i) => ({
  id: 'p' + i, name: 'Player ' + (i + 1), number: String(i + 1), shortName: '', tier,
}));

const plan = (players, balance, over = {}) => generatePlan({
  players,
  availableIds: players.map(p => p.id),
  format: { periods: 4, periodMinutes: 8 },
  granularity: { mode: 'everyN', value: 4 },
  constraints: {}, strategy: 'balanced', balance, seed: 11, ...over,
});

const spread = p => {
  const v = Object.values(p.minutes);
  return Math.max(...v) - Math.min(...v);
};
const strengths = (p, players) => {
  const tier = Object.fromEntries(players.map(x => [x.id, x.tier]));
  return p.stints.map(s => s.onFloor.reduce((a, id) => a + tier[id], 0));
};

// a genuinely lopsided roster: two of each tier
const LOPSIDED = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1];

test('every player still carries a tier through a plan', () => {
  const p = plan(team(LOPSIDED), 'even');
  assert.ok(p.ok);
  assert.equal(p.stints.every(s => s.onFloor.length === 5), true);
});

test('balance never costs minutes fairness', () => {
  /* The point of the low weight. If this ever fails, the feature is taking
     minutes off somebody to make a lineup look tidier, which is the one
     trade this app must not make. */
  const players = team(LOPSIDED);
  const base = plan(players, 'even');
  for (const shape of ['even', 'start', 'finish', 'both']) {
    const p = plan(players, shape);
    assert.ok(p.ok, shape);
    assert.ok(spread(p) <= spread(base) + 1e-9,
      `${shape} widened the minutes spread: ${spread(p)} vs ${spread(base)}`);
  }
});

test('an all-default roster plans exactly as it did before tiers existed', () => {
  /* Inertness is the promise to every coach who never opens this. One tier
     for everyone means every five is worth the same, so the term switches
     itself off rather than pushing lineups around for no reason. */
  const flat = team(Array(10).fill(3));
  const withBalance = plan(flat, 'both');
  const without = plan(flat, 'even');
  assert.deepEqual(
    withBalance.stints.map(s => [...s.onFloor].sort()),
    without.stints.map(s => [...s.onFloor].sort()),
  );
});

test('a missing tier is treated as the middle, not as zero', () => {
  const naked = team(LOPSIDED).map(({ tier, ...rest }) => rest);
  const p = plan(naked, 'both');
  assert.ok(p.ok);
  // all-equal tiers => the term is off => same plan as 'even'
  assert.deepEqual(
    p.stints.map(s => [...s.onFloor].sort()),
    plan(naked, 'even').stints.map(s => [...s.onFloor].sort()),
  );
});

test('even keeps lineup strength closer together than leaving it alone', () => {
  const players = team(LOPSIDED);
  const balanced = strengths(plan(players, 'even'), players);
  const range = a => Math.max(...a) - Math.min(...a);
  // the honest claim: not that every stint is identical, but that the worst
  // five and the best five are not both on the floor during the same game
  assert.ok(range(balanced) <= 4,
    `stint strengths still swing by ${range(balanced)}: ${balanced.join(', ')}`);
});

test('start puts the stronger lineups first, finish puts them last', () => {
  const players = team(LOPSIDED);
  const s = strengths(plan(players, 'start'), players);
  const f = strengths(plan(players, 'finish'), players);
  const half = Math.floor(s.length / 2);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(s.slice(0, half)) > mean(s.slice(-half)),
    `start did not front-load: ${s.join(', ')}`);
  assert.ok(mean(f.slice(-half)) > mean(f.slice(0, half)),
    `finish did not back-load: ${f.join(', ')}`);
});

test('both ends is stronger at the ends than in the middle', () => {
  const players = team(LOPSIDED);
  const b = strengths(plan(players, 'both'), players);
  const ends = (b[0] + b[b.length - 1]) / 2;
  const mid = b.slice(1, -1);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(ends > mean(mid), `both did not lift the ends: ${b.join(', ')}`);
});

test('an unknown balance value falls back to even rather than throwing', () => {
  const players = team(LOPSIDED);
  const p = plan(players, 'vibes');
  assert.ok(p.ok);
  assert.deepEqual(
    p.stints.map(s => [...s.onFloor].sort()),
    plan(players, 'even').stints.map(s => [...s.onFloor].sort()),
  );
});

test('balance is deterministic for a given seed', () => {
  const players = team(LOPSIDED);
  const a = plan(players, 'both');
  const b = plan(players, 'both');
  assert.deepEqual(a.stints.map(s => s.onFloor), b.stints.map(s => s.onFloor));
});

test('minute floors still win over balance', () => {
  /* A floor is a promise to a kid. Balance is a preference. If the weakest
     player is guaranteed 12 minutes, no shape may talk the solver out of it. */
  const players = team(LOPSIDED);
  const weakest = players[players.length - 1].id;
  const p = plan(players, 'start', { constraints: { minMinutes: { [weakest]: 12 } } });
  assert.ok(p.ok);
  assert.ok(p.minutes[weakest] >= 12,
    `floor broken: ${weakest} got ${p.minutes[weakest]}`);
});

/* #150 item 2: the level control's own accessible name. `balance.js` reaches
   for `document` at import time (dom.js keeps a canvas, state.js and fx.js
   bind listeners) -- the same reason test/level-keys.test.js's stub exists --
   so this builds a minimal fake element (just enough of the DOM surface
   `levelMeter` calls: style.setProperty, dataset, setAttribute/getAttribute,
   append, addEventListener) and reads the radiogroup's aria-label back off
   it, rather than grepping balance.js's source for the string. */
function fakeElement() {
  const attrs = {};
  return {
    style: { setProperty() {} },
    dataset: {},
    children: [],
    classList: { toggle() {} },
    listeners: {},
    rect: { left: 0, width: 0 },
    focused: false,
    focus() { this.focused = true; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    append(...kids) { this.children.push(...kids); },
    // recorded, so a test can fire the pointer events a browser would
    addEventListener(type, fn) { this.listeners[type] = fn; },
    getBoundingClientRect() { return this.rect; },
    getContext: () => ({ measureText: () => ({ width: 0 }) }),
  };
}
globalThis.document = {
  createElement: fakeElement,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });
const { levelMeter, resetLevels, initBalance } = await import('../app/balance.js');
const { state } = await import('../app/state.js');

const radiogroupLabel = name => {
  const wrap = levelMeter({ id: 'p9', name, tier: 3 });
  const steps = wrap.children.find(c => c.getAttribute('role') === 'radiogroup');
  return steps.getAttribute('aria-label');
};

test('the level control names the player it belongs to', () => {
  assert.equal(radiogroupLabel('Marcus'), 'Level for Marcus');
});

test('the level control still names an unnamed player', () => {
  assert.equal(radiogroupLabel(''), 'Level for this player');
});

/* #264: what a coach does to the level meter, driven through the listeners the
   meter registers. The strip is 500px wide, so each level is a 100px fifth:
   x=350 is the fourth fifth, x=10 the first, x=490 the last. The label under
   the strip is what the coach reads, so it is what is asserted, along with
   the player's stored tier and whether the app was told. */
const built = tier => {
  const p = { id: 'p9', name: 'Pat', tier };
  state.players = [p];
  const edits = [];
  initBalance(kind => edits.push(kind), () => {});
  const wrap = levelMeter(p);
  const steps = wrap.children.find(c => c.getAttribute('role') === 'radiogroup');
  steps.rect = { left: 0, width: 500 };
  const label = wrap.children.find(c => c !== steps);
  const fire = (type, clientX) => {
    let prevented = false;
    steps.listeners[type]({ clientX, button: 0, pointerId: 1, preventDefault() { prevented = true; } });
    return prevented;
  };
  return { p, steps, label, edits, fire };
};
const keyOn = (m, step, key) => m.steps.children[step - 1].onkeydown({ key, preventDefault() {} });

test('level meter: ArrowRight on Regular commits Reliable and moves focus', () => {
  const m = built(3);
  keyOn(m, 3, 'ArrowRight');
  assert.equal(m.p.tier, 4);
  assert.equal(m.label.textContent, 'Reliable');
  assert.equal(m.steps.children[3].focused, true);
  assert.deepEqual(m.edits, ['level']);
});

test('level meter: ArrowLeft on the lowest level stays there and tells no one', () => {
  const m = built(1);
  keyOn(m, 1, 'ArrowLeft');
  assert.equal(m.p.tier, 1);
  assert.deepEqual(m.edits, []);
});

test('level meter: a tap on the fourth fifth commits level 4', () => {
  const m = built(3);
  m.fire('pointerdown', 350);
  m.fire('pointerup', 350);
  assert.equal(m.p.tier, 4);
  assert.equal(m.label.textContent, 'Reliable');
  assert.deepEqual(m.edits, ['level']);
});

test('level meter: a drag from the first fifth to the last commits level 5', () => {
  const m = built(3);
  m.fire('pointerdown', 10);
  assert.equal(m.label.textContent, 'Developing', 'the label follows the finger');
  m.fire('pointermove', 250);
  m.fire('pointermove', 490);
  m.fire('pointerup', 490);
  assert.equal(m.p.tier, 5);
  assert.equal(m.label.textContent, 'Go-to');
  assert.deepEqual(m.edits, ['level'], 'one change for the whole drag');
});

test('level meter: a tap on the level already set clears it to Regular', () => {
  const m = built(5);
  m.fire('pointerdown', 490);
  m.fire('pointerup', 490);
  assert.equal(m.p.tier, 3);
  assert.equal(m.label.textContent, 'Regular');
  assert.deepEqual(m.edits, ['level']);
});

test('level meter: a browser cancel mid-drag puts the saved level back', () => {
  const m = built(4);
  m.fire('pointerdown', 10);
  assert.equal(m.label.textContent, 'Developing');
  m.steps.listeners.pointercancel({});
  assert.equal(m.p.tier, 4);
  assert.equal(m.label.textContent, 'Reliable');
  m.fire('pointerup', 10);
  assert.equal(m.p.tier, 4, 'a release after the cancel is not a gesture');
  assert.deepEqual(m.edits, []);
});

test('resetLevels puts every player back to Regular', () => {
  const edits = [];
  initBalance(kind => edits.push(kind), () => {});
  state.players = [{ id: 'a', tier: 5 }, { id: 'b', tier: 1 }, { id: 'c', tier: 3 }, { id: 'd' }];
  resetLevels();
  assert.deepEqual(state.players.map(p => p.tier), [3, 3, 3, 3]);
  assert.deepEqual(edits, ['level']);
});
