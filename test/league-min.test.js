import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The league minimum is a RULE, and the Rules section has to admit to it.
 *
 * A24b. `computeAll` composes `settings.minMinutes` into a CLONE of the game's
 * constraints on the way to the solver, so it is never in `game.constraints`
 * and the two things that describe the Rules section were counting an empty
 * map. With the setting at 10 the app said all three of these at once, on one
 * screen: `#issues` named eleven players whose minutes a minimum was rewriting,
 * the Rules drawer said "No rules yet. The plan just evens out the minutes.",
 * and `#conscount` was `display: none`.
 *
 * Source-read, same idiom as game-format.test.js and note-placement.test.js:
 * neither renderer has a DOM harness in this repo, and what has to hold is
 * WHERE the number is read, not what it renders to on one fixture. The
 * behaviour of the reader itself is exercised for real below.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');

globalThis.document ??= {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });

const S = await import('../app/state.js');

const withSettings = (settings, fn) => {
  const saved = S.state.teams;
  S.state.teams = [{ id: 't', name: 'T', players: [], day: { name: '', games: [] },
                     season: { games: [] }, activeGame: 0, settings }];
  S.state.activeTeam = 0;
  try { return fn(); } finally { S.state.teams = saved; }
};

test('leagueMinutes reads the active team, and off is 0', () => {
  assert.equal(withSettings({ minMinutes: 10 }, () => S.leagueMinutes()), 10);
  assert.equal(withSettings({ minMinutes: 0 }, () => S.leagueMinutes()), 0,
    '0 is off, and 0 is what every record written before the key existed means');
  assert.equal(withSettings(undefined, () => S.leagueMinutes()), 0,
    'a record that has not been through sanitize has no settings block — the default is '
    + 'exactly what that means, and this must never throw on the way to a render');
});

test('the Rules count counts the league minimum', () => {
  const setup = read('game-setup.js');
  const expr = /const n = ([\s\S]*?);\s*\n\s*set\('#conscount'/.exec(setup);
  assert.ok(expr, 'the #conscount count expression has moved — find it and re-pin it');
  assert.match(expr[1], /leagueMinutes\(\)/,
    'the Rules badge counts only the per-game constraint maps again. The league floor is '
    + 'not stored on the game (computeAll composes it into a clone), so a coach with the '
    + 'setting on sees "no rules" while a rule rewrites every available player\'s minutes');
});

test('the Rules drawer only says "just evens out the minutes" when nothing else is on', () => {
  const rules = read('rules.js');
  const FALSE_WHEN_SET = 'The plan just evens out the minutes.';
  const at = rules.indexOf(FALSE_WHEN_SET);
  assert.ok(at > -1, 'the zero-state sentence is gone — if it was reworded, re-pin it here');
  /* The sentence must sit in a branch that has already ruled the league floor
     out. Anything else is the app denying a rule it is enforcing. */
  const before = rules.slice(0, at);
  const guard = /leagueMinutes\(\)[\s\S]*?\belse\b[\s\S]*$/.test(before.slice(-900));
  assert.ok(guard,
    `"${FALSE_WHEN_SET}" is no longer guarded by the league minimum — with the setting on `
    + 'it is false, and #issues four inches away is naming every player it applies to');
  assert.match(rules, /league minimum/,
    'the drawer never mentions the league minimum, so the one rule a coach cannot see from '
    + 'here is the one rule that is on');
});

/* One source, or the two screens drift apart again — which is the whole bug.
   `state.js` defines the reader; `storage.js` sanitizes the stored value and
   `teams-view.js` is the editor that writes it. Nobody else reads it raw. */
test('nothing outside state.js, storage.js and the settings editor reads minMinutes raw', () => {
  const ALLOWED = new Set(['state.js', 'storage.js', 'teams-view.js']);
  const FILES = ['game-setup.js', 'rules.js', 'plan-view.js', 'season-view.js', 'card.js',
    'app.js', 'render.js', 'strategy.js', 'gamemode.js', 'onboarding.js', 'balance.js'];
  for (const f of FILES) {
    if (ALLOWED.has(f)) continue;
    assert.ok(!/settings\??\.\s*minMinutes/.test(read(f)),
      `${f} reads settings.minMinutes directly — use leagueMinutes() from state.js, or the `
      + 'Rules badge, the Rules drawer and the solver start disagreeing again (A24b)');
  }
});
