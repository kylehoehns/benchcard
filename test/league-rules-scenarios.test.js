/* #566: League rules live together in Settings. A coach finds all four rules
 * under one heading, turns the two "in a row" rules on once for the team, and
 * the open day's games that have not started follow. Driven in real Chrome
 * through test/coach.js on RICH's game day (Hawks 9:00 AM and Ravens
 * 11:30 AM, 4 x 8, a sub every 4 minutes), with a long name in the roster.
 * Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';
import { lacks } from './prose.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';
const NAMES = ['Alexandria Montgomery-Okafor', 'Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy'];
const PLAYS = 'Plays at most: limit time on the floor in a row';
const SITS = 'Sits at most: limit time on the bench in a row';
const own = g => [g.constraints.maxConsecutive, g.constraints.maxBench];

describe('a coach sets the league rules in Settings', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('one League rules heading holds the four rules in order, with no N and both limits off', async () => {
    await coach.onGameDayWith({}, undefined, { names: NAMES });
    await coach.tap('Settings');
    const rules = await coach.leagueRules();
    assert.equal(rules.headings, 1);
    assert.deepEqual(rules.groups.map(g => g.title), ['Everyone plays at least', 'Everyone plays in', 'Plays at most', 'Sits at most']);
    assert.deepEqual(rules.groups.slice(2).map(g => [g.on, g.stepper]), [[false, null], [false, null]]);
    assert.ok(!rules.groups.some(g => g.rows.some(r => /\bN\b/.test(r))), JSON.stringify(rules));
    assert.ok(!(await coach.controls()).some(n => /\bN\b/.test(n)), 'no control is named with an N');
  });

  test('Sits at most starts at 2 with its footnote, and its stepper stops at 1 and 4', async () => {
    await coach.onGameDayWith({}, undefined, { names: NAMES });
    await coach.tap('Settings');
    await coach.tap(SITS);
    const sits = (await coach.leagueRules()).groups.find(g => g.title === 'Sits at most');
    assert.equal(sits.on, true);
    assert.equal(sits.stepper, '8 min', '2 subs of 4 minutes');
    assert.equal(sits.footnote, 'Counts across quarter breaks. Applies to every player.');
    await coach.stepRule('Sits at most', 'Shorter');
    assert.ok((await coach.leagueRules()).groups[3].stepper === '4 min');
    await coach.stepRule('Sits at most', 'Longer');
    await coach.stepRule('Sits at most', 'Longer');
    await coach.stepRule('Sits at most', 'Longer');
    assert.equal((await coach.leagueRules()).groups[3].stepper, '16 min', 'stops at 4 subs');
    await coach.comeBackLaterOn('settings');
    const kept = (await coach.leagueRules()).groups[3];
    assert.deepEqual([kept.on, kept.stepper], [true, '16 min'], 'the team value is saved');
  });

  test('Plays at most starts at 2 and stops at 4, as the rule\'s own page does', async () => {
    await coach.onGameDayWith({}, undefined, { names: NAMES });
    await coach.tap('Settings');
    await coach.tap(PLAYS);
    const plays = (await coach.leagueRules()).groups[2];
    assert.deepEqual([plays.on, plays.stepper, plays.footnote], [true, '8 min', 'Applies to every player.']);
    for (let i = 0; i < 6; i++) await coach.stepRule('Plays at most', 'Longer');
    assert.equal((await coach.leagueRules()).groups[2].stepper, '16 min', '4 of the 8 subs');
  });

  test('tapping Longer in Settings moves the number and leaves focus on that same button', async () => {
    await coach.onGameDayWith({}, undefined, { names: NAMES });
    await coach.tap('Settings');
    await coach.tap(SITS);
    await coach.stepRule('Sits at most', 'Longer');
    assert.equal((await coach.leagueRules()).groups[3].stepper, '12 min');
    assert.equal(await coach.focused(), 'Longer', 'focus stays on the button just pressed');
    await coach.stepRule('Sits at most', 'Shorter');
    assert.equal((await coach.leagueRules()).groups[3].stepper, '8 min');
    assert.equal(await coach.focused(), 'Shorter');
  });

  test('on a 4 x 12 game with a sub every 2 minutes, Plays at most still stops at 4 and keeps its value', async () => {
    await coach.onGameDayWith({ periodMinutes: 12, granValue: 2 }, undefined, { names: NAMES });
    await coach.tap('Settings');
    await coach.tap(PLAYS);
    for (let i = 0; i < 25; i++) await coach.stepRule('Plays at most', 'Longer');
    assert.equal((await coach.leagueRules()).groups[2].stepper, '8 min', '4 subs of 2 minutes');
    await coach.comeBackLaterOn('settings');
    assert.equal((await coach.leagueRules()).groups[2].stepper, '8 min', 'saved as 4 and read back as 4');
  });

  test("the day's games that have not started take a team value; a started game and another day keep theirs", async () => {
    await coach.onGameDayShaped(team => {
      team.days[0].games[0].live = { at: 2, overrides: {} };
      team.days.push({
        name: 'Next Saturday', date: '2099-01-03',
        games: [{ id: 'gx', label: 'Comets', tipoff: '10:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 99 }],
      });
    });
    await coach.tap('Settings');
    await coach.tap(SITS);
    await coach.tap(PLAYS);
    await coach.stepRule('Plays at most', 'Longer');
    await coach.tap('Back to Smoke Test');
    let days = await coach.savedDays();
    const today = days.find(d => d.name === 'Saturday');
    const later = days.find(d => d.name === 'Next Saturday');
    assert.deepEqual(own(today.games[0]), [0, 0], 'the started Hawks game keeps its own');
    assert.deepEqual(own(today.games[1]), [3, 2], 'the Ravens game has not started, so it follows the team');
    assert.deepEqual(own(later.games[0]), [0, 0], "another day's game keeps its own");

    await coach.tap('Settings');
    await coach.tap(SITS);
    await coach.tap('Back to Smoke Test');
    days = await coach.savedDays();
    assert.deepEqual(own(days.find(d => d.name === 'Saturday').games[1]), [3, 0], 'switching off sets the games to 0');
  });

  test('the minimum names its units by the game and says what it comes to, and the Plan sheet reads the same words', async () => {
    await coach.onGameDayWith({}, undefined, { names: NAMES });
    await coach.tap('Settings');
    assert.ok(!(await coach.footnotes()).some(n => n.startsWith('=')), 'no line while the minimum is off');
    await coach.choose('Counted in', '% of game');
    await coach.fill('How much everyone plays at least', '50');
    await coach.press('Tab');
    assert.ok((await coach.footnotes()).includes('= 16 min in a 4 × 8 game, any time'), JSON.stringify(await coach.footnotes()));
    await coach.choose('Counted in', 'whole quarters');
    await coach.fill('How much everyone plays at least', '2');
    await coach.press('Tab');
    assert.ok((await coach.footnotes()).includes('= 2 whole quarters (16 min)'), JSON.stringify(await coach.footnotes()));
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
    assert.ok(await coach.sees('Everyone plays at least 2 whole quarters (16 min)'), JSON.stringify((await coach.controls()).filter(n => /Everyone/.test(n))));
  });

  test('a two-half game says halves in the unit menu and the live line', async () => {
    await coach.onGameDayWith({ periods: 2, periodMinutes: 16 }, undefined, { names: NAMES });
    await coach.tap('Settings');
    await coach.choose('Counted in', 'halves of time');
    await coach.fill('How much everyone plays at least', '1');
    await coach.press('Tab');
    assert.ok((await coach.footnotes()).includes('= 16 min in a 2 × 16 game, any time'), JSON.stringify(await coach.footnotes()));
    await coach.choose('Counted in', 'whole halves');
    assert.ok((await coach.footnotes()).includes('= 1 whole half (16 min)'), JSON.stringify(await coach.footnotes()));
    await coach.tap(SITS);
    assert.equal((await coach.leagueRules()).groups[3].footnote, 'Counts across halftime. Applies to every player.');
  });

  test('a game added after a game with its own numbers starts from the team numbers', async () => {
    await coach.onGameDayWith(g => ({ constraints: { ...g.constraints, maxConsecutive: 1, maxBench: 0 } }), undefined,
      { names: NAMES, settings: { maxConsecutive: 3, maxBench: 2 } });
    await coach.tap('Add a game');
    await coach.fill('Opponent', 'Owls');
    await coach.setTime('Tip-off', '10:15 AM');
    await coach.tap('Next');
    await coach.tap('Next');
    await coach.tap('Add game');
    await coach.tap('Back to Smoke Test');
    const [day] = await coach.savedDays();
    const byName = Object.fromEntries(day.games.map(g => [g.label, own(g)]));
    assert.deepEqual(byName, { Hawks: [1, 0], Owls: [3, 2], Ravens: [0, 0] }, 'the new game takes the team, the others keep theirs');
  });

  describe('a game\'s own number', () => {
    const SITS_AT_2 = 'Each player sits at most 2 stints in a row (8 min)';
    const seed = () => coach.onGameDayShaped(team => {
      team.players = NAMES.map((name, i) => ({ id: `p${i}`, name, number: '', tier: 3 }));
      team.settings = { ...team.settings, maxBench: 2 };
      for (const g of team.days[0].games) g.constraints = { ...g.constraints, maxBench: 2 };
    });
    const open = async () => {
      await coach.tap('Hawks, 9:00 AM, planned');
      await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
      await coach.tap(SITS_AT_2);
    };

    test('changing it on the game leaves the team number and the other game alone', async () => {
      await seed();
      await open();
      assert.ok((await coach.text('#planSub')).includes("Changes this game only. Your team's rule is in Settings."), await coach.text('#planSub'));
      await coach.tap('Longer');
      await coach.tap('Close');
      const [day] = await coach.savedDays();
      assert.deepEqual(day.games.map(g => g.constraints.maxBench), [3, 2], 'Hawks 3, Ravens still 2');
      await coach.tap('Back to Smoke Test');
      await coach.tap('Settings');
      const sits = (await coach.leagueRules()).groups[3];
      assert.deepEqual([sits.on, sits.stepper], [true, '8 min'], 'the team number is still 2');
    });

    test('removing the row turns it off for that game only', async () => {
      await seed();
      await open();
      await coach.tap('Remove rule');
      await coach.tap('Close');
      const [day] = await coach.savedDays();
      assert.deepEqual(day.games.map(g => g.constraints.maxBench), [0, 2]);
      await coach.tap('Back to Smoke Test');
      await coach.tap('Settings');
      assert.equal((await coach.leagueRules()).groups[3].on, true, 'the team rule stays on');
    });
  });

  test("the plays-in row explains plays-in, not the minimum", async () => {
    await coach.onGameDayWith({}, undefined, { names: NAMES, settings: { playsIn: 'periods', minUnit: 'min', minMinutes: 8 } });
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
    await coach.tap('Everyone plays in every quarter');
    const text = await coach.text('#planSub');
    assert.ok(text.includes("Every player plays in every quarter. It's your league rule. Change it in Settings."), text);
    assert.ok(lacks(text, 'Your league minimum'), text);
  });

  test('Add a rule no longer offers the two in-a-row rules', async () => {
    await coach.onGameDay();
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap((await coach.controls()).find(n => /^Rules, /.test(n)));
    await coach.tap('Add a rule');
    const names = await coach.controls();
    assert.ok(names.includes('Plays at most'), 'the per-player cap is still there');
    assert.ok(!names.some(n => /in a row/.test(n)), JSON.stringify(names));
  });
});
