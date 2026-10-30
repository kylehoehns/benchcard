import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, withTeam, player, bareGame } from './state-fixture.js';

test('removePlayer clears the id from an overtime period\'s five, before any reload', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const game = bareGame({ overtime: [{ minutes: 3, who: 'keep', five: [...ids] }] });
  withTeam(ids.map(id => player(id)), [game], {}, () => {
    S.removePlayer('p3');
    assert.deepEqual(game.overtime[0].five, ['p1', 'p2', 'p4', 'p5']);
    assert.equal(game.overtime[0].minutes, 3);
    assert.equal(game.overtime[0].who, 'keep');
  });
});

test('removePlayer leaves an overtime entry with no five as it was', () => {
  const entry = { minutes: 3, who: 'keep' };
  const game = bareGame({ overtime: [entry] });
  withTeam([player('p1')], [game], {}, () => {
    S.removePlayer('p1');
    assert.equal(game.overtime[0], entry);
  });
});
