/* Shared state.js test fixtures for the pure-helper tests in
 * test/sentence.test.js (#27) and test/plan-sheet.test.js (#28): the
 * document/matchMedia stub state.js needs at import time (now split into
 * ./dom-stub.js -- #73, shared with test/trap.test.js -- since two hand
 * copies of the same object had already drifted once) even though neither
 * file's tests touch a DOM, plus the one-team `withTeam` harness and its
 * `player` builder -- copied identically in both files until this one.
 *
 * A plain file straight in test/, not test/helpers/state-fixture.js or any
 * other subdirectory: node --test's default glob runs every .js file
 * anywhere under a directory named `test`, subdirectories included --
 * confirmed by planting a throwing probe file at test/helpers/probe.js and
 * watching `node --test` fail the run on it, then removing it. A
 * subdirectory is therefore not a safe place for a module that only exports;
 * `test/js-strings.js` and `test/js-comments.js` already use exactly this
 * convention (a plain-named file straight in test/, picked up by the glob as
 * an empty, harmless passing subtest, and imported by relative path from the
 * files that actually need it), so this follows it rather than inventing a
 * second one.
 *
 * `withTeam` always takes `settings` explicitly (plan-sheet.test.js's own
 * shape, a superset of sentence.test.js's -- the same value applies as the
 * `{}` sentence.test.js's callers never needed), so both call sites read the
 * same four-argument signature rather than one of them being a magic
 * shorter form of the other. `player`'s optional `name` is plan-sheet.test.js's
 * shape too -- calling it with one argument, as every sentence.test.js site
 * does, still returns the same `{ id, name: id }` either way. */

import './dom-stub.js';

export const S = await import('../app/state.js');

export const withTeam = (players, games, settings, fn) => {
  const saved = S.state.teams;
  S.state.teams = [{
    id: 't', name: 'T', players,
    day: { name: '', games }, season: { games: [] }, activeGame: 0,
    settings: settings || {},
  }];
  S.state.activeTeam = 0;
  try { return fn(); } finally { S.state.teams = saved; }
};

export const player = (id, name) => ({ id, name: name || id });
