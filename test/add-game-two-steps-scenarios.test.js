/* #565: Add a game asks two things, who you are playing and who is here. A new
 * game plans the way the last one did. Driven through test/coach.js; skipped
 * where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const ROSTER = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Alexandria Montgomery-Okafor'];
const ids = (from, to) => ROSTER.slice(from, to).map((_, k) => `p${k + from}`);

describe('Add a game in two steps', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* The day is the Hawks (game 1) and Ravens (game 2); the Ravens, the last
     game, are on `strategy` with `constraints` laid over the rules. */
  async function lastGameOn(strategy, constraints = {}) {
    await coach.onGameDayShaped(team => {
      team.players = ROSTER.map((name, i) => ({ id: `p${i}`, name, number: '', tier: 1 + (i % 5) }));
      team.season = { games: [] };
      const [day] = team.days;
      day.games = day.games.map((g, i) => ({
        ...g, out: [], periods: 2, periodMinutes: 16, granMode: 'everyN', granValue: 4,
        ...(i === day.games.length - 1 ? { strategy, constraints: { ...g.constraints, ...constraints } } : {}),
      }));
    });
  }
  async function addOnePlayingOwls() {
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.setTime('Tip-off', '8:00 PM');
    await coach.tap('Next');
    await coach.tap('Add game');
  }
  const sorted = a => [...a].sort();

  test('1. the steps read 1 of 2 then 2 of 2, two segments, and Who is here ends with Add game', async () => {
    await lastGameOn('balanced');
    await coach.tap('Add a game');
    assert.deepEqual(await coach.addGameStep(), { step: '1 of 2', segments: 2, next: 'Next' });
    await coach.fill('Opponent', 'Owls');
    await coach.setTime('Tip-off', '8:00 PM');
    await coach.tap('Next');
    assert.deepEqual(await coach.addGameStep(), { step: '2 of 2', segments: 2, next: 'Add game' });
    assert.ok(await coach.sees('Avery'), "step 2 is Who's here");
    await coach.tap('Add game');
    assert.equal(await coach.text('#gameTitle'), 'Owls');
    assert.equal(await coach.addGameStep(), null);
  });

  test('2. a team with no games yet starts its first game on Even', async () => {
    await coach.onGameDayShaped(team => {
      team.players = ROSTER.map((name, i) => ({ id: `p${i}`, name, number: '', tier: 3 }));
      team.season = { games: [] };
      team.days = [];
    }, `document.querySelector('#view-today:not([hidden])')`);
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.tap('Next');
    assert.deepEqual((await coach.addGameStep()).step, '2 of 2');
    await coach.tap('Add game');
    assert.ok(await coach.sees('Plan, even minutes'));
  });

  test('3. a game added after a Closers game is Closers with the same closers', async () => {
    await lastGameOn('closers', { closing: { stints: 2, players: ids(5, 10) } });
    await addOnePlayingOwls();
    await coach.tap('Plan, a closing group');
    assert.deepEqual(sorted((await coach.picked())[0]), sorted(ROSTER.slice(5)));
  });

  test('4. a game added after a Platoon game keeps its groups', async () => {
    await lastGameOn('platoon', { units: [ids(0, 5), ids(5, 10)] });
    await addOnePlayingOwls();
    await coach.tap('Plan, fixed fives');
    assert.deepEqual((await coach.picked()).map(sorted), [sorted(ROSTER.slice(0, 5)), sorted(ROSTER.slice(5))]);
  });

  test('5. the Same as card still adds the game in one tap, on the same plan', async () => {
    await lastGameOn('platoon', { units: [ids(0, 5), ids(5, 10)] });
    await coach.tap('Add a game');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));
    assert.ok(await coach.sees('Plan, fixed fives'));
  });
});
