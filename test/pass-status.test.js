import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withTeam, player } from './state-fixture.js';
import { passStatus, resumeAt } from '../app/live.js';

/* #92, "What would settle it" item 1: `passStatus(p, live)` is the one place
 * that decides a game pass's status word and dot class -- Underway, Planned
 * or Needs a fix -- read off real plans built the same way
 * test/resume-bar.test.js builds them (S.newGame + S.computeAll()), never a
 * hand-typed stand-in plan.
 *
 * "Underway" is `resumeAt(p, live) !== null` and nothing else -- the decision
 * says not to re-check `live.at` or the stint count here, so these tests
 * assert resumeAt's own answer alongside passStatus's, rather than
 * recomputing what "mid-game" means. */

function oneGameTeam(extra) {
  const players = [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Cara'), player('d', 'Dee'), player('e', 'Eve')];
  const settings = { periods: 4, periodMinutes: 8 };
  const g = S.newGame(0, null, settings);
  if (extra) Object.assign(g, extra);
  return { players, games: [g], settings };
}

test('passStatus reads Underway when resumeAt answers for the game', () => {
  const { players, games, settings } = oneGameTeam();
  withTeam(players, games, settings, () => {
    S.computeAll();
    const p = S.plans[0];
    games[0].live = { at: 2, overrides: {} };
    assert.ok(resumeAt(p, games[0].live), 'fixture setup: resumeAt should answer for a game mid-play');
    assert.deepEqual(passStatus(p, games[0].live), { word: 'Underway', cls: 'now' });
  });
});

test('passStatus reads Planned when the plan is fine and the game is not underway', () => {
  const { players, games, settings } = oneGameTeam();
  withTeam(players, games, settings, () => {
    S.computeAll();
    const p = S.plans[0];
    games[0].live = { at: 0, overrides: {} };
    assert.deepEqual(passStatus(p, games[0].live), { word: 'Planned', cls: 'ok' },
      'live.at 0 is "never started", not underway');
    games[0].live = { at: p.stints.length - 1, overrides: {} };
    assert.deepEqual(passStatus(p, games[0].live), { word: 'Planned', cls: 'ok' },
      'the last stint is "game over", not underway');
  });
});

test('passStatus reads Needs a fix when there is no plan, or the plan is blocked, even mid-game', () => {
  const { players, games, settings } = oneGameTeam();
  withTeam(players, games, settings, () => {
    S.computeAll();
    assert.deepEqual(passStatus(null, games[0].live), { word: 'Needs a fix', cls: 'warn' });
  });

  // A real infeasible plan, the same shape FOUR's blocked "Owls" game uses
  // (fixtures.mjs): a minMinutes floor bigger than the whole game.
  const blocked = oneGameTeam({ constraints: { ...S.emptyConstraints(), minMinutes: { a: 40 } } });
  withTeam(blocked.players, blocked.games, blocked.settings, () => {
    S.computeAll();
    const p = S.plans[0];
    assert.equal(p.ok, false, 'fixture setup: this plan should be blocked');
    blocked.games[0].live = { at: 2, overrides: {} };
    assert.deepEqual(passStatus(p, blocked.games[0].live), { word: 'Needs a fix', cls: 'warn' });
  });
});
