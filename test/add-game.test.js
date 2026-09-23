import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #32 "Add a game in three steps" (docs/specs/32-add-a-game.md), the model
 * half: `sameAsLast()` in state.js -- the "Same as …?" card's two lines --
 * and the draft `newGame(len, lastGame(), settings)` builds, which BOTH
 * "Use it" and "Plan it" commit.
 *
 * Same shape as `test/sentence.test.js` and `test/plan-sheet.test.js`: the
 * shared document stub and the one-team `withTeam` harness from
 * `test/state-fixture.js`, no DOM. Every expected string here is the spec's
 * own ("11 players, 4 × 8, even minutes", "Same as 11:30 AM?"), never a
 * second computation of what `sentenceParts` does.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { S, withTeam, withDays, player } from './state-fixture.js';
import { stripComments } from './js-comments.js';
import { seasonDate } from '../app/storage.js';

// The smoke harness's rich fixture: eleven players, 4 × 8, everyone here.
const ELEVEN = Array.from({ length: 11 }, (_, i) => player(`p${i}`, `P${i}`));

const SETTINGS = { periods: 4, periodMinutes: 8, minMinutes: 0, maxSubs: 3, tieBreak: 'behind' };

// A game the way the rich fixture writes one, with `newGame`'s own defaults
// filled in for everything the fixture leaves out.
const fixtureGame = (over = {}) => ({
  id: 'g0', label: 'Ravens', tipoff: '11:30',
  periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
  out: [], useCarryover: false, useSeasonTargets: false,
  constraints: S.emptyConstraints(), strategy: 'balanced', balance: 'even',
  live: { at: 0, overrides: {} }, seed: 1234,
  ...over,
});

/* ---------------------------- sameAsLast (items 3, 8, decision 10) -------- */

test('the Same as card names the last game by its tip-off and summarizes it', () => {
  withTeam(ELEVEN, [fixtureGame()], SETTINGS, () => {
    const card = S.sameAsLast();
    assert.match(card.title, /^Same as 11:30\s*AM\?$/);
    assert.equal(card.summary, '11 players, 4 × 8, even minutes');
  });
});

/* Item 8 / decision 6: the count is never 0 -- `newTeam`, `sanitizeTeam` and
   "New day" all seed one game -- so the card is suppressed on the state a
   brand-new team is actually in: one unplanned Game 1 with nobody at it. */
test('there is no Same as card when the last game has nobody at it', () => {
  withTeam([], [fixtureGame({ label: '', tipoff: '' })], SETTINGS, () => {
    assert.equal(S.sameAsLast(), null);
  });
});

test('there is no Same as card when every player on the last game is absent', () => {
  withTeam(ELEVEN, [fixtureGame({ out: ELEVEN.map(p => p.id) })], SETTINGS, () => {
    assert.equal(S.sameAsLast(), null);
  });
});

/* #102 item 5: this REPLACES the old fallback to the opponent -- with no
   tip-off the card reads the plain "Same as the last game?", whatever the
   opponent says (or does not say). */
test('with no tip-off the Same as card reads "Same as the last game?", opponent or not', () => {
  for (const label of ['Ravens', '']) {
    withTeam(ELEVEN, [fixtureGame({ tipoff: '', label })], SETTINGS, () => {
      assert.equal(S.sameAsLast().title, 'Same as the last game?');
    });
  }
});

/* ---------------------------- the draft (items 4 and 8) ------------------- */

/* `newGame(len, lastGame(), settings)` is the one call the flow makes, and
   both "Use it" and "Plan it" commit what it returns (decision 4) -- so what
   it copies IS acceptance criterion 4, and this pins it before two buttons
   start depending on it. `newGame`'s own semantics are out of scope for #32
   (Out of scope, last bullet); this is a characterization, and the mutation
   that proves it can fail is dropping one field from the `Object.assign`. */

const RULES = () => ({ ...S.emptyConstraints(), minMinutes: { p0: 12 }, pairs: [['p1', 'p2']] });

const previous = () => fixtureGame({
  periods: 2, periodMinutes: 20, granMode: 'perPeriod', granValue: 3,
  out: ['p3', 'p7'], strategy: 'closers', constraints: RULES(), seed: 1234,
});

/* `openAddGame`'s one line, written once here: every test below measures the
   draft the flow actually builds rather than a hand-made near-miss of it. */
const openDraft = () => S.newGame(S.state.day.games.length, S.lastGame(), S.state.settings);

test('the draft copies the last game, mints its own seed and evens out the day', () => {
  withTeam(ELEVEN, [previous()], SETTINGS, () => {
    const from = S.lastGame();
    const draft = openDraft();

    assert.equal(draft.periods, 2);
    assert.equal(draft.periodMinutes, 20);
    assert.equal(draft.granMode, 'perPeriod');
    assert.equal(draft.granValue, 3);
    assert.equal(draft.strategy, 'closers');
    assert.deepEqual([...draft.out].sort(), ['p3', 'p7']);
    assert.deepEqual(draft.constraints, RULES());
    assert.notEqual(draft.seed, from.seed);
    assert.equal(draft.useCarryover, true);
    // The opponent and the tip-off are the two things that are never copied:
    // they are what step 1 asks for.
    assert.equal(draft.label, '');
    assert.equal(draft.tipoff, '');
  });
});

test('the draft is a deep copy, so editing it never reaches back into the last game', () => {
  withTeam(ELEVEN, [previous()], SETTINGS, () => {
    const from = S.lastGame();
    const draft = openDraft();
    S.setAvailable(draft, 'p0', false);
    draft.constraints.minMinutes.p4 = 30;
    assert.deepEqual([...from.out].sort(), ['p3', 'p7']);
    assert.deepEqual(from.constraints.minMinutes, { p0: 12 });
  });
});

/* Item 8: a team whose only game has nobody at it. `lastGame()` still returns
   that game, so the draft copies it -- and because `newTeam` seeded it from
   the team's settings in the first place, "copied" and "from settings" are
   the same four numbers. That is what makes the flow need no second branch. */
test('with nothing worth copying the draft still carries the team settings', () => {
  const settings = { ...SETTINGS, periods: 3, periodMinutes: 12 };
  withTeam([], [S.newGame(0, null, settings)], settings, () => {
    assert.equal(S.sameAsLast(), null);
    const draft = openDraft();
    assert.equal(draft.periods, 3);
    assert.equal(draft.periodMinutes, 12);
    assert.equal(draft.granValue, 4);
    assert.equal(draft.strategy, 'balanced');
  });
});

/* ---------------------------- #126: the draft with no days ---------------- */

/* `openAddGame`'s no-days branch (teams-view.js), written once here the same
   way `openDraft` above pins the day-with-a-game branch: `newGame(0, null,
   state.settings)`, dated with `seasonDate()` -- never a second date
   formatter (Constraints: reuse, do not re-derive). */
test('with no days the draft is newGame(0, null, settings), dated today, and offers no Same as card', () => {
  const settings = { ...SETTINGS, periods: 3, periodMinutes: 12 };
  withDays([], [], settings, () => {
    assert.equal(S.sameAsLast(), null);
    const draft = S.newGame(0, null, S.state.settings);
    draft.date = seasonDate();
    assert.equal(draft.periods, 3);
    assert.equal(draft.periodMinutes, 12);
    assert.deepEqual(draft.out, []);
    assert.equal(draft.label, '');
    assert.equal(draft.tipoff, '');
    assert.equal(draft.date, seasonDate());
  });
});

/* ---------------------------- one switch builder (Proof 3) ---------------- */

/* `switchRow` (rules.js) is the app's one switch builder, and step 3's "Even
   out earlier games" row is a second CALLER for it -- not a second copy. A
   GUARD, written under /new-guard: the first half runs the real module and
   asks its public surface; the other two read source, because "nobody wrote a
   second one" is a claim about the tree, not about a return value. Falsified
   both ways before it was trusted -- by taking the `export` off `switchRow`,
   and by adding a second `input[switch]` builder to teams-view.js.

   The import direction is safe: `app/rules.js`'s transitive import closure is
   analytics, backup, budget, dom, engine, fx, game-setup, gamemode, icons,
   pills, roster, state, storage, toast and trap -- teams-view.js is in none of
   them, so `teams-view.js -> rules.js` closes no cycle. */

const APP = new URL('../app/', import.meta.url);
const MODULES = readdirSync(APP).filter(f => f.endsWith('.js'));

test('rules.js exports switchRow, so a second caller can reuse it', async () => {
  const R = await import('../app/rules.js');
  assert.equal(typeof R.switchRow, 'function',
    'app/rules.js does not export switchRow -- #32 step 3 needs the one switch builder, '
    + 'not a second copy of it (docs/specs/32-add-a-game.md, Constraints)');
});

test('exactly one module in app/ builds an input[switch]', () => {
  assert.ok(MODULES.length > 20, `scanned ${MODULES.length} module(s) in app/; the read is wrong`);
  const builders = MODULES.filter(f =>
    /setAttribute\(\s*'switch'/.test(stripComments(readFileSync(new URL(f, APP), 'utf8'))));
  assert.deepEqual(builders, ['rules.js'],
    `${builders.length} module(s) build a switch (${builders.join(', ') || 'none'}); `
    + 'there must be exactly one, rules.js, and every other caller imports switchRow from it');
});

test('teams-view.js takes the switch from rules.js rather than rolling its own', () => {
  const src = stripComments(readFileSync(new URL('teams-view.js', APP), 'utf8'));
  assert.ok(src.length > 1000, 'read no teams-view.js source; this guard is measuring nothing');
  assert.match(src, /import\s*\{[^}]*\bswitchRow\b[^}]*\}\s*from\s*'\.\/rules\.js'/,
    "teams-view.js does not import switchRow from './rules.js'");
});
