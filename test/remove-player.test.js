import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* `removePlayer` lives in state.js, which reaches for localStorage at import
   time, so this reads the source rather than running it. Crude, but it is
   guarding a specific failure mode: a new id-keyed field gets added to the
   constraints and nobody remembers to sweep it here, and the symptom is not a
   crash — it is "undefined" rendered next to a "?" avatar, mid-game. */
const src = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function removePlayer'));
const fn = body.slice(0, body.indexOf('\n}\n') + 2);

const MUST_SWEEP = [
  ['out', /g\.out\s*=\s*g\.out\.filter/],
  ['minMinutes', /delete c\.minMinutes\[id\]/],
  ['maxMinutes', /delete c\.maxMinutes\[id\]/],
  ['targetSlots', /delete c\.targetSlots\?\.\[id\]/],
  ['lockedTargets', /c\.lockedTargets\s*=/],
  ['pairs', /c\.pairs\s*=\s*c\.pairs\.filter/],
  ['avoids', /c\.avoids\s*=\s*c\.avoids\.filter/],
  ['openingFive', /c\.openingFive\s*=/],
  ['lastPeriodFive', /c\.lastPeriodFive\s*=/],
  ['closing.players', /c\.closing\.players\s*=/],
  ['units', /c\.units\s*=/],
  ['live.overrides', /overrides/],
];

for (const [name, re] of MUST_SWEEP) {
  test(`removePlayer sweeps ${name}`, () => {
    assert.ok(re.test(fn), `removePlayer never touches ${name}`);
  });
}

test('every id-keyed constraint field is accounted for here', () => {
  /* The list above is only worth something if it is complete. Read the shape
     from emptyConstraints and fail when a field appears that this test has
     never heard of — that is the moment to decide whether it holds player ids. */
  const shape = src.slice(src.indexOf('export const emptyConstraints'));
  const block = shape.slice(0, shape.indexOf('});'));
  const fields = [...block.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
  const known = new Set([
    'minMinutes', 'maxMinutes', 'pairs', 'avoids', 'openingFive', 'lastPeriodFive',
    'hardPairs', 'maxConsecutive', 'targetSlots', 'lockedTargets', 'closing', 'units',
  ]);
  const surprises = fields.filter(f => !known.has(f));
  assert.deepEqual(surprises, [],
    `new constraint field(s) ${surprises.join(', ')} — do they hold player ids? If so, sweep them in removePlayer and add them above.`);
});

/* ---- what the coach is told about it ------------------------------------
 *
 * The sweep above is thorough and, until this shipped, silent: "Removed
 * Casey." and nine seconds to change your mind. Two things go with a player
 * and neither is on screen at the moment it happens -- every rule naming them
 * in every game on the day, and the season ledger's ability to NAME them
 * (`season-view.js` looks the id up in the roster, so a filed row goes on
 * reading "Left the team" with the minutes still beside it).
 *
 * `removalCosts` is pure and depends on nothing but `state`, so it is lifted
 * out of the source and actually RUN here rather than pattern-matched: what
 * matters is which sentences a given record produces, and a regex over the
 * strings would pass just as happily with the branches inverted. */
const rv = readFileSync(new URL('../app/roster-view.js', import.meta.url), 'utf8');
const costsSrc = rv.slice(rv.indexOf('function removalCosts'));
const costsFn = costsSrc.slice(0, costsSrc.indexOf('\n}\n') + 2);
const costs = (state, id) => new Function('state', costsFn + '\nreturn removalCosts;')(state)(id);

const record = ({ constraints = {}, out = [], overrides = null, season = [] } = {}) => ({
  day: { games: [{ constraints, out, live: overrides ? { overrides } : undefined }] },
  season: { games: season },
});

test('a coach with no rules and no filed games is told nothing extra', () => {
  assert.deepEqual(costs(record(), 'p1'), []);
});

test('a rule naming the player is named, whichever rule it is', () => {
  const say = 'Their rules went too.';
  assert.deepEqual(costs(record({ constraints: { pairs: [['p1', 'p2']] } }), 'p1'), [say], 'a pairing');
  assert.deepEqual(costs(record({ constraints: { minMinutes: { p1: 8 } } }), 'p1'), [say], 'a minimum, which is a KEY not a value');
  assert.deepEqual(costs(record({ out: ['p1'] }), 'p1'), [say], 'sitting them out');
  assert.deepEqual(costs(record({ overrides: { 2: ['p1', 'p3'] } }), 'p1'), [say], 'a stint the coach overrode by hand');
  assert.deepEqual(costs(record({ constraints: { pairs: [['p2', 'p3']] } }), 'p1'), [], 'somebody else’s rule');
  assert.deepEqual(costs(record({ constraints: { pairs: [['p10', 'p2']] } }), 'p1'), [],
    'p1 matched inside p10 — the id is compared with its quotes for exactly this reason');
});

test('a filed game says the name is what is lost, not the minutes', () => {
  const season = [{ id: 'g1', minutes: { p1: 12, p2: 10 } }];
  assert.deepEqual(costs(record({ season }), 'p1'), ['The season keeps their minutes, not their name.']);
  assert.deepEqual(costs(record({ season }), 'p9'), [], 'a player who was not in that game');
  assert.deepEqual(costs(record({ season: [{ id: 'g1', minutes: { p1: 0 } }] }), 'p1').length, 1,
    'nought minutes is attendance, not absence — the key is the fact');
});

test('both costs are told in one toast, in the order they happen', () => {
  assert.deepEqual(costs(record({ out: ['p1'], season: [{ id: 'g1', minutes: { p1: 9 } }] }), 'p1'),
    ['Their rules went too.', 'The season keeps their minutes, not their name.']);
});

test('the rules question is asked structurally, so a new kind of rule is covered the day it lands', () => {
  /* The failure this file already guards is a new id-keyed constraint that
     nobody remembers to sweep. A hand-written list of field names HERE would
     be a second copy of that same list, one release behind the first. */
  assert.match(costsFn, /JSON\.stringify/, 'the rules check enumerates fields again; it has to ask the whole constraints object');
  assert.doesNotMatch(costsFn, /pairs|avoids|openingFive|lockedTargets/,
    'removalCosts names individual constraints, which is the drift this test file exists to catch');
});

test('the toast is built from the costs, not from a fixed sentence', () => {
  const click = rv.slice(rv.indexOf('x.onclick'), rv.indexOf('row.append(num'));
  assert.match(click, /removalCosts\(p\.id\)/, 'the removal toast stopped asking what the removal costs');
  assert.match(click, /undoable\(/, 'removing a player is undoable; it is not the app’s one confirm');
});
