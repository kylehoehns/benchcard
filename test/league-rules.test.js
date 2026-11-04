/* #566: the pure wording helpers and the team values' reader, writer and new
 * game rule. Expected strings come from the spec (docs/specs/566-league-rules.md,
 * items 7, 8, 9 and "What would settle it" 3, 6, 7, 8). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S, withTeam, withDays, player, bareGame } from './state-fixture.js';

const four = () => bareGame({ id: 'four', periods: 4, periodMinutes: 8 });
const two = () => bareGame({ id: 'two', periods: 2, periodMinutes: 16 });
const asTeam = (g, settings, fn) => withTeam([player('a')], [g], settings, () => fn(g));

test('live line, minutes and percent say what they come to in a 4 x 8 game', () => {
  assert.equal(asTeam(four(), { minUnit: 'min', minMinutes: 12 }, g => S.leagueLiveLine(g)), '= 12 min in a 4 × 8 game, any time');
  assert.equal(asTeam(four(), { minUnit: 'pct', minMinutes: 50 }, g => S.leagueLiveLine(g)), '= 16 min in a 4 × 8 game, any time');
});

test('live line, quarters of time and halves of time', () => {
  assert.equal(asTeam(four(), { minUnit: 'periods', minMinutes: 2 }, g => S.leagueLiveLine(g)), '= 16 min in a 4 × 8 game, any time');
  assert.equal(asTeam(two(), { minUnit: 'periods', minMinutes: 1 }, g => S.leagueLiveLine(g)), '= 16 min in a 2 × 16 game, any time');
});

test('live line, whole quarters and whole halves, the count capped at the game', () => {
  assert.equal(asTeam(four(), { minUnit: 'full', minMinutes: 2 }, g => S.leagueLiveLine(g)), '= 2 whole quarters (16 min)');
  assert.equal(asTeam(two(), { minUnit: 'full', minMinutes: 1 }, g => S.leagueLiveLine(g)), '= 1 whole half (16 min)');
  assert.equal(asTeam(four(), { minUnit: 'full', minMinutes: 8 }, g => S.leagueLiveLine(g)), '= 4 whole quarters (32 min)');
});

test('live line is empty when the minimum is 0', () => {
  for (const unit of ['min', 'pct', 'periods', 'full']) {
    assert.equal(asTeam(four(), { minUnit: unit, minMinutes: 0 }, g => S.leagueLiveLine(g)), '', unit);
  }
});

test('unit labels read quarters in a 4-period game and halves in a 2-period game', () => {
  const labels = g => ['min', 'pct', 'periods', 'full'].map(u => S.minUnitLabel(g, u));
  assert.deepEqual(labels(four()), ['min', '% of game', 'quarters of time', 'whole quarters']);
  assert.deepEqual(labels(two()), ['min', '% of game', 'halves of time', 'whole halves']);
  assert.deepEqual(labels(bareGame({ periods: 3, periodMinutes: 10 })), ['min', '% of game', 'periods of time', 'whole periods']);
});

test('the rule sentence follows the renamed units', () => {
  const text = (g, minUnit, minMinutes) => asTeam(g, { minUnit, minMinutes }, S.leagueRuleText);
  assert.equal(text(four(), 'periods', 2), '2 quarters of time (16 min)');
  assert.equal(text(four(), 'periods', 1), '1 quarter of time (8 min)');
  assert.equal(text(four(), 'full', 1), '1 whole quarter (8 min)');
  assert.equal(text(two(), 'full', 1), '1 whole half (16 min)');
  assert.equal(text(four(), 'pct', 50), 'half the game (16 min)');
  assert.equal(text(four(), 'min', 12), '12 min');
});

test('the plays-in detail has its own text, by the game\'s period word', () => {
  const detail = (g, playsIn) => asTeam(g, { playsIn }, S.playsInDetail);
  assert.equal(detail(four(), 'periods'), "Every player plays in every quarter. It's your league rule. Change it in Settings.");
  assert.equal(detail(two(), 'periods'), "Every player plays in every half. It's your league rule. Change it in Settings.");
  assert.equal(detail(four(), 'halves'), "Every player plays in each half. It's your league rule. Change it in Settings.");
});

test('a new game takes the team values, even after a game whose own values differ', () => {
  const source = four();
  source.constraints.maxConsecutive = 1;
  source.constraints.maxBench = 0;
  const made = S.newGame(1, source, { maxConsecutive: 3, maxBench: 2 });
  assert.deepEqual([made.constraints.maxConsecutive, made.constraints.maxBench], [3, 2]);
  assert.deepEqual([source.constraints.maxConsecutive, source.constraints.maxBench], [1, 0]);
  const first = S.newGame(0, null, { maxConsecutive: 3, maxBench: 2 });
  assert.deepEqual([first.constraints.maxConsecutive, first.constraints.maxBench], [3, 2]);
  const none = S.newGame(0, null, undefined);
  assert.deepEqual([none.constraints.maxConsecutive, none.constraints.maxBench], [0, 0]);
});

test('the team value reads as 0 when settings hold none', () => {
  assert.equal(withTeam([], [four()], {}, () => S.teamRun('maxBench')), 0);
  assert.equal(withTeam([], [four()], { maxBench: 3 }, () => S.teamRun('maxBench')), 3);
});

test('setting a team value reaches the open day games that have not started, and no others', () => {
  const mk = (id, extra) => ({ ...four(), id, ...extra });
  const open = [mk('a'), mk('b', { live: { at: 2, overrides: {} } }), mk('c', { live: { at: 0, overrides: {}, finished: true } })];
  const other = [mk('d')];
  withDays([player('a')], [{ name: '', date: '2026-09-22', games: open }, { name: '', date: '2026-09-29', games: other }], {}, () => {
    S.setTeamRun('maxBench', 2);
    assert.equal(S.state.settings.maxBench, 2);
    assert.deepEqual([...open, ...other].map(g => g.constraints.maxBench), [2, 0, 0, 0]);
    S.setTeamRun('maxBench', 0);
    assert.equal(S.state.settings.maxBench, 0);
    assert.equal(open[0].constraints.maxBench, 0);
    S.setTeamRun('maxConsecutive', 3);
    assert.deepEqual([...open, ...other].map(g => g.constraints.maxConsecutive), [3, 0, 0, 0]);
  });
});

test('the Sits at most footnote names the game\'s break, and adds the Platoon hint where it is true', () => {
  const note = (g, n, ids = ['a']) => withTeam(ids.map(id => player(id)), [g], {}, () => S.benchFootnote(g, n));
  assert.equal(note(four(), 2), 'Counts across quarter breaks. Applies to every player.');
  assert.equal(note(two(), 2), 'Counts across halftime. Applies to every player.');
  assert.equal(note(bareGame({ periods: 3, periodMinutes: 10 }), 2), 'Counts across period breaks. Applies to every player.');
  const ten = Array.from({ length: 10 }, (_, i) => `p${i}`);
  assert.equal(note(four(), 1, ten), 'Counts across quarter breaks. Applies to every player. With 10 players, Sits at most 1 in a row is Platoon.');
});

test('the unit select ships with the 4-period words, the same ones the painter writes for a 4-period game', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const sel = html.slice(html.indexOf('id="minUnit"'), html.indexOf('</select>', html.indexOf('id="minUnit"')));
  const shipped = [...sel.matchAll(/<option value="(\w+)">([^<]*)<\/option>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(shipped.map(([v]) => v), ['min', 'pct', 'periods', 'full']);
  for (const [value, text] of shipped) assert.equal(text, S.minUnitLabel(four(), value), value);
});
