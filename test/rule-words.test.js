import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* #136: bench mode, the solver's warnings and the tour used rule names from
   before the redesign. `KINDS` in rules.js (`Plays at least`, `Plays at
   most`, `Apart`, `Together`, `One of two on`, `Starting five`, `Last-period
   five`, `Rest limit`) is the one name for each rule now; the words below are
   the ones the old naming left behind, decided in
   docs/specs/136-rule-words.md ("What would settle it" item 1).

   Comments are stripped the way `test/help-deeplink.test.js` does -- a
   template literal is read as source text either way, so `${...}`
   placeholders survive (they never contain a banned word) and only the
   coach-visible characters around them are checked. */
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

const gm = stripComments(read('app/gamemode.js'));
const engine = stripComments(read('app/engine.js'));
const tour = stripComments(read('app/tour.js'));
const planView = read('app/plan-view.js');
const teamsView = read('app/teams-view.js');
const rulesJs = stripComments(read('app/rules.js'));

/* The four `warn(` calls #136 named (PAIR_DROPPED, AVOID_DROPPED,
   KEEPON_DROPPED, CONSEC_IMPOSSIBLE) are the seam this guard measures in
   engine.js -- not every `warn(`/`err(` call in the file, most of which this
   ticket's survey never named and this diff never touches (CAP_BELOW_STINT's
   "cap", for one, is unchanged by this ticket). Naming them by their issue
   code, the way `test/sit-rules.test.js`'s own `engineCodes()` does, means an
   edit to the surrounding arithmetic cannot make this guard measure nothing. */
const WARN_CODES = ['PAIR_DROPPED', 'AVOID_DROPPED', 'KEEPON_DROPPED', 'CONSEC_IMPOSSIBLE'];

const warnMessage = (code) => {
  const re = new RegExp(`warn\\('${code}',\\s*\`([^\`]*)\``);
  const m = engine.match(re);
  assert.ok(m, `${code}'s warn( call is gone from engine.js`);
  return m[1];
};

const sitRules = () => {
  const i = gm.indexOf('const SIT_RULES = {');
  assert.ok(i > 0, 'SIT_RULES is gone from gamemode.js');
  const body = gm.slice(i, gm.indexOf('\n};', i));
  const map = new Map([...body.matchAll(/^\s*([A-Z_]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
  assert.ok(map.size > 10, `only ${map.size} SIT_RULES entries parsed -- the parser broke`);
  return map;
};

/* docs/specs/136-rule-words.md, "What would settle it" item 1, one regex per
   phrase so a failure names which one came back. */
const BANNED = [
  ['Minutes limit', /Minutes limit/i],
  ['floor-minutes', /floor-minutes/i],
  ['floors', /\bfloors\b/i],
  ['a floor', /\ba floor\b/i],
  ['cap/caps as a word', /\bcaps?\b/i],
  ['pinned', /\bpinned\b/i],
  ['Pair ', /Pair /],
  ['Avoid ', /Avoid /],
  ['rebalanc', /rebalanc/i],
  ['on the court', /on the court/i],
  [' -- ', / -- /],
  ['an ASCII x between a number/min and a number', /(?:\d|\bmin\b)\s*x\s*\d/i],
];

const scan = (label, text) => {
  const hits = [];
  for (const [name, re] of BANNED) if (re.test(text)) hits.push(name);
  return hits.map((name) => `${label}: "${name}"`);
};

test('no banned word from #136 item 1 survives in the four named engine warnings', () => {
  const hits = WARN_CODES.flatMap((code) => scan(code, warnMessage(code)));
  assert.deepEqual(hits, [], `banned word(s) found:\n${hits.join('\n')}`);
});

test('no banned word from #136 item 1 survives in SIT_RULES', () => {
  const hits = [];
  for (const [code, clause] of sitRules()) hits.push(...scan(code, clause));
  assert.deepEqual(hits, [], `banned word(s) found:\n${hits.join('\n')}`);
});

/* Item 6: every SIT_RULES clause that names a specific rule kind does so with
   its exact `KINDS` label. Not every clause names one -- CLOSERS_TOO_MANY,
   FORCED_GROUP_TOO_BIG and NOT_ENOUGH_PLAYERS are about headcount, not a rule
   kind -- so only the clauses that used to carry a retired name are checked
   here. */
const EXPECT_LABEL = {
  MIN_EXCEEDS_GAME: 'Plays at least',
  MIN_ABOVE_CAP: 'Plays at least',
  MINS_UNSATISFIABLE: 'Plays at least',
  CAPS_UNSATISFIABLE: 'Plays at most',
  FORCED_OVER_CAP: 'Plays at most',
  PAIR_AVOID_CONFLICT: 'Together',
  AVOID_IMPOSSIBLE: 'Apart',
  CLOSERS_AVOID: 'Apart',
  FORCED_GROUP_AVOID: 'Apart',
  KEEPON_UNSATISFIABLE: 'One of two on',
  FORCED_GROUP_KEEPON: 'One of two on',
};

test('SIT_RULES names a rule kind by its Add-a-rule label, not a retired name', () => {
  const rules = sitRules();
  for (const [code, label] of Object.entries(EXPECT_LABEL)) {
    assert.ok(rules.has(code), `SIT_RULES no longer has ${code}`);
    assert.ok(rules.get(code).includes(label),
      `SIT_RULES.${code} ("${rules.get(code)}") does not name the "${label}" rule`);
  }
});

/* Item 4's "nothing" refusal ("Sit for the rest" asked to solve from one past
   the plan's last stint) has no browser seam: `stintIndex` (live.js) clamps
   the bench screen's own stint index to `p.stints.length - 1` on every
   render, so no click can ever hand `sitRest` the boundary
   `test/resolve-rest.test.js` drives `resolveRest` itself to directly. Its
   `flash()` sentence in gamemode.js is a private literal with no other seam,
   so it is read back out of source here, the same way SIT_RULES is above. */
test('the "nothing" refusal toast in sitRest reads the #136 wording', () => {
  const m = gm.match(/nothing:\s*'([^']*)'/);
  assert.ok(m, 'the `nothing:` refusal clause is gone from gamemode.js');
  assert.equal(m[1], 'Nothing left to share out. This is the last stint.');
});

/* Item 5: tour step 1's body, exactly. `TOUR` is not exported (`initTour`
   and `startTour` are tour.js's only exports), so this reads the first
   step object's `body:` back out of source, the same way
   `test/tour-anchors.test.js` reads the whole `TOUR` array as text. */
test('tour step 1 tells the coach to mark who is not here, not to mark someone absent', () => {
  const start = tour.indexOf('const TOUR = [');
  assert.ok(start > 0, 'tour.js no longer declares `const TOUR = [`');
  const m = tour.slice(start).match(/body:\s*(['"])((?:\\.|(?!\1).)*)\1/);
  assert.ok(m, 'step 1 has no `body:` string');
  assert.equal(m[2], "Everyone on the roster is available. Tap the number of players to mark who isn't here, and the rotation rebuilds.");
});

/* Survey's three more coach-visible "rebalanc" strings the issue did not
   list but its "Done when" covers -- each pulled out of its own template
   literal by name, not scanned across the whole file (`app/teams-view.js`
   also calls the code identifier `rebalance()`, which item 1 leaves alone). */
test('the day-spread note under the plan sheet no longer says "rebalance"', () => {
  const m = planView.match(/Later games ([^`]+)`/);
  assert.ok(m, 'the "Later games..." clause is gone from plan-view.js');
  assert.equal(m[1], 'even out against this automatically.');
});

test('removing a team\'s last-team toast no longer says "The day rebalanced"', () => {
  const m = teamsView.match(/last \? '' : ' ([^']*)'/);
  assert.ok(m, 'the day-changed clause is gone from teams-view.js');
  assert.equal(m[1], 'The day evened out.');
});

/* Survey's one switch label, `renderPairsGroup`'s `switchRow` call: item 2
   says every rule name in coach-visible copy is the `KINDS` label exactly,
   in the same case ("Together", not "together"). */
test('the "force pairs" switch names the Together rule by its KINDS label', () => {
  const m = rulesJs.match(/switchRow\('([^']*)',\s*c\.hardPairs/);
  assert.ok(m, 'renderPairsGroup\'s switchRow call for hardPairs is gone from rules.js');
  assert.equal(m[1], 'Force Together every stint');
});
