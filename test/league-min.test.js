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
 * behavior of the reader itself is exercised for real below.
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
  /* #28 retired the collapsed Rules row's `#conscount` badge -- the sentence's
     `#phraseRules` phrase and the Plan sheet's Rules group both read straight
     from `ruleCount`/`ruleItems` (state.js) on every repaint instead, so
     there is no separate count expression left in game-setup.js to re-derive
     the league floor from. What still has to hold is that state.js's own
     count and its own row list agree with each other about it. */
  const stateJs = read('state.js');
  assert.match(stateJs, /leagueMinutes\(\) > 0 \? 1 : 0/,
    'ruleCount(g) in state.js no longer counts the league minimum when it is on');
  assert.match(stateJs, /if \(lmin > 0\) items\.push/,
    'ruleItems(g) in state.js no longer lists the league minimum as a row of its own — the '
    + 'Rules group and ruleCount would disagree about it again (A24b / #26 decision 3)');
});

test('the Rules drawer only says "just evens out the minutes" when nothing else is on', () => {
  const rules = read('rules.js');
  const FALSE_WHEN_SET = 'No rules yet. The plan just evens out the minutes.';
  const at = rules.indexOf(FALSE_WHEN_SET);
  assert.ok(at > -1, 'the zero-state sentence is gone — if it was reworded, re-pin it here');
  /* #28: the guard moved from a local `leagueMinutes()` check to
     `ruleItems(g).length` -- `ruleItems` (state.js) already puts the league
     minimum in the same list this file counts, so an empty list here already
     means no rule is on, the league floor included. Re-deriving the check
     from `leagueMinutes()` a second time here is exactly the kind of second
     copy that let the badge and the drawer disagree before (A24b). */
  const before = rules.slice(Math.max(0, at - 400), at);
  assert.match(before, /!items\.length/,
    `"${FALSE_WHEN_SET}" is no longer guarded by ruleItems(g).length — with the league minimum `
    + 'on, ruleItems is non-empty and #issues four inches away is naming every player it applies to');
  assert.match(read('state.js'), /if \(lmin > 0\) items\.push/,
    'ruleItems(g) no longer lists the league minimum as its own row — the one rule a coach '
    + 'cannot see from the Rules group is the one rule that is on');
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
