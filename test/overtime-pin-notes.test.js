import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame, withTeam, player } from './state-fixture.js';

/* #440: a pinned overtime five that breaks one of the coach's rules says so,
   in a note on the plan. The five itself is never changed. Driven through
   `addOvertime` and `computeAll`, the way the app asks. Game: 10 players,
   4 x 8 every 4, seed 7, Apart p1/p2, One of two on p3/p4, game on stint 8. */

const LEVELS = [3, 5, 5, 1, 1, 4, 4, 4, 2, 2];
const roster = LEVELS.map((tier, i) => ({ ...player(`p${i}`), tier }));
const sorted = five => [...five].sort();

function game(maxMinutes = { p0: 16 }) {
  const constraints = { ...S.emptyConstraints(), avoids: [['p1', 'p2']], keepOnFloor: [['p3', 'p4']], maxMinutes };
  return bareGame({
    id: 'g0', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
    seed: 7, constraints, live: { at: 0, overrides: {} },
  });
}

function run(who, fn, caps) {
  withTeam(roster, [game(caps)], {}, () => {
    const g = S.state.day.games[0];
    S.computeAll();
    g.live.at = 7;
    S.computeAll();
    S.addOvertime(g, 4, who);
    fn(g);
  });
}

const notes = () => S.plans[0].issues.filter(i => i.code === 'PIN_BREAKS_RULE');
const messages = () => notes().map(i => i.message);

test('strongest five that sets two Apart kids on together says so, and so for a One of two on pair both off', () => {
  run('strongest', () => {
    const apart = notes().find(i => i.message.includes('Apart'));
    assert.ok(apart, 'an Apart note: ' + messages().join('|'));
    assert.equal(apart.severity, 'warn');
    assert.deepEqual(sorted(apart.playerIds), ['p1', 'p2']);
    assert.ok(messages().includes('Strongest five puts p1 and p2 on together; they are set Apart.'), messages().join('|'));
    const one = notes().find(i => i.message.includes('One of two on'));
    assert.ok(one, 'a One of two on note');
    assert.deepEqual(sorted(one.playerIds), ['p3', 'p4']);
    assert.ok(messages().includes('Strongest five leaves p3 and p4 both off; they are set One of two on.'), messages().join('|'));
  });
});

test('strongest five that plays a capped kid past the cap says so', () => {
  run('strongest', () => {
    const cap = notes().find(i => i.message.includes('Plays at most'));
    assert.ok(cap, 'a Plays at most note');
    assert.deepEqual(cap.playerIds, ['p1']);
    assert.equal(cap.message, 'Strongest five gives p1 20 minutes; Plays at most is 16.');
  }, { p1: 16 });
});

test('next rotation, even out and keep this five break nothing, so add no note', () => {
  for (const who of ['next', 'even', 'keep']) {
    run(who, () => assert.deepEqual(notes(), [], who));
  }
});

test('strongest five keeps the five it chose', () => {
  run('strongest', g => {
    const five = ['p1', 'p2', 'p5', 'p6', 'p7'];
    assert.deepEqual(sorted(g.overtime[0].five), five);
    const stints = S.effectiveStints(g, S.plans[0]);
    assert.deepEqual(sorted(stints[stints.length - 1].onFloor), five);
  });
});

test('a hand swap that takes p2 off the overtime stint clears the Apart note', () => {
  run('strongest', g => {
    assert.ok(messages().some(m => m.includes('Apart')), 'the premise: the note is there first');
    const k = S.plans[0].stints.length - 1;
    const five = S.effectiveLineup(g, S.plans[0], k);
    g.live.overrides[k] = five.map(id => (id === 'p2' ? 'p8' : id));
    g.live.hand = [...new Set([...(g.live.hand || []), k])];
    S.computeAll();
    assert.ok(!messages().some(m => m.includes('Apart')), messages().join('|'));
  });
});

test('computeAll again leaves exactly one of each note', () => {
  run('strongest', () => {
    S.computeAll();
    S.computeAll();
    assert.equal(notes().length, 2, messages().join('|'));
  });
});

test('keep this five is checked too, and the note names the choice', () => {
  withTeam(roster, [game()], {}, () => {
    const g = S.state.day.games[0];
    S.computeAll();
    g.live.at = 6;
    S.computeAll();
    S.addOvertime(g, 4, 'keep');
    assert.ok(messages().includes('Keep this five gives p0 20 minutes; Plays at most is 16.'), messages().join('|'));
  });
});
