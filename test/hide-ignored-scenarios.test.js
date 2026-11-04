/* #562: the Plan sheet hides each control the strategy ignores, and one line
   under the strategy segment says which team settings it skips. Display only:
   the hidden controls keep what the coach left. (#563: the two even-out
   switches became the one Make up minutes from row.) Driven through test/coach.js
   on game 2 of a day with a season filed and levels set. Skipped where there
   is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome, midSeason } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const ROSTER = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Alexandria Montgomery-Okafor'];
const UNITS = [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8', 'p9']];
const BALANCE = 'Lineup balance Start strong';
const MAKE_UP = 'Make up minutes from';

describe('The Plan sheet shows only the switches the strategy uses', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* Game 2 (Ravens) is on `strategy`, the season so far chosen and the
     shape on Start strong; a season of filed games; `settings` laid over the team's. */
  async function gameTwo(strategy, settings = {}, extra = {}) {
    await coach.onGameDayShaped(team => {
      team.season = structuredClone(midSeason().teams[0].season);
      team.players = ROSTER.map((name, i) => ({ id: `p${i}`, name, number: '', tier: 1 + (i % 5) }));
      team.settings = { ...team.settings, maxSubs: 5, ...settings };
      const [day] = team.days;
      day.games = day.games.map(g => ({
        ...g, out: [], periods: 2, periodMinutes: 16, granMode: 'everyN', granValue: 4,
        ...(g.id === day.games[1].id ? {
          strategy, useCarryover: true, useSeasonTargets: true, balance: 'start',
          constraints: { ...g.constraints, units: UNITS, ...extra },
        } : {}),
      }));
    });
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
  }
  const shown = async () => {
    const c = await coach.controls();
    return [...[BALANCE].filter(n => c.includes(n)), ...((await coach.makeUpRow()) ? [MAKE_UP] : [])];
  };
  const choice = async () => (await coach.makeUpRow()).rows.filter(r => r.on).map(r => r.label);

  for (const [strategy, want] of [
    ['balanced', [BALANCE, MAKE_UP]],
    ['closers', [BALANCE, MAKE_UP]],
    ['minutes', [BALANCE]],
    ['platoon', []],
    ['order', []],
  ]) {
    test(`1. on ${strategy}, the Plan sheet shows ${want.length ? want.join(' and ') : 'none of the three'}`, async () => {
      await gameTwo(strategy);
      assert.deepEqual(await shown(), want);
    });
  }

  test('2. a Starting five rule set before switching to Order is still listed, as not used', async () => {
    await gameTwo('balanced', {}, { openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'] });
    await coach.tap('Order');
    assert.match(await coach.text('#constraints'), /Avery, Blake, Casey, Drew and Emery start the game\. Not used: the order picks who starts\./);
  });

  const skipLine = () => coach.text('#stratskip');
  const PLATOON = "Platoon plays whole groups, so Players changing at once, Everyone plays in, whole halves and making up minutes from other games don't apply.";
  const ORDER = "The order decides who plays, so Everyone plays in, whole halves and making up minutes from other games don't apply.";
  const BY_HAND = "By hand plays the minutes you set, so making up minutes from other games doesn't apply.";

  test('3. with no league minimum the line names what each strategy skips, and Even and Closers have none', async () => {
    await gameTwo('platoon', { minMinutes: 0 });
    assert.equal(await skipLine(), PLATOON);
    await coach.tap('Order');
    assert.equal(await skipLine(), ORDER);
    await coach.tap('By hand');
    assert.equal(await skipLine(), BY_HAND);
    await coach.tap('Closers');
    assert.equal(await skipLine(), '');
    await coach.tap('Even');
    assert.equal(await skipLine(), '');
    assert.equal(await coach.count('#stratskip:not([hidden])'), 0);
  });

  const AMOUNT = { min: 8, pct: 25, periods: 1, full: 1 };
  for (const [unit, strategy, tail] of [
    ['min', 'platoon', ' Your league minimum still counts.'],
    ['pct', 'platoon', ' Your league minimum still counts.'],
    ['periods', 'platoon', ' Your league minimum still counts.'],
    ['min', 'order', ' Your league minimum still counts, but the plan only warns when someone falls short.'],
    ['pct', 'order', ' Your league minimum still counts, but the plan only warns when someone falls short.'],
    ['periods', 'order', ' Your league minimum still counts, but the plan only warns when someone falls short.'],
    ['full', 'platoon', ' Your league minimum still counts in minutes, not as whole halves.'],
    ['full', 'order', ' Your league minimum still counts in minutes, not as whole halves, and the plan only warns when someone falls short.'],
  ]) {
    test(`4. with a league minimum in ${unit}, ${strategy} adds what still holds`, async () => {
      await gameTwo(strategy, { minMinutes: AMOUNT[unit], minUnit: unit });
      assert.equal(await skipLine(), (strategy === 'platoon' ? PLATOON : ORDER) + tail);
    });
  }

  test('4. By hand and a league minimum: no league sentence', async () => {
    await gameTwo('minutes', { minMinutes: AMOUNT.min, minUnit: 'min' });
    assert.equal(await skipLine(), BY_HAND);
  });

  test('5. on Platoon with the season so far chosen, Even shows the row as left, and so after a reopen', async () => {
    await gameTwo('platoon');
    assert.deepEqual(await shown(), []);
    await coach.tap('Even');
    assert.deepEqual(await shown(), [BALANCE, MAKE_UP]);
    assert.deepEqual(await choice(), ['The season so far']);
    await coach.tap('Platoon');
    assert.deepEqual(await shown(), []);
    await coach.tap('Even');
    assert.deepEqual(await choice(), ['The season so far']);

    await coach.tap('Platoon');
    await coach.tap('Close');
    await coach.comeBackLaterOn('games');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Plan, ')));
    assert.deepEqual(await shown(), []);
    const { useCarryover, useSeasonTargets, balance } = (await coach.savedDays())[0].games[1];
    assert.deepEqual({ useCarryover, useSeasonTargets, balance }, { useCarryover: true, useSeasonTargets: true, balance: 'start' }, 'hiding wrote nothing');
    await coach.tap('Even');
    assert.deepEqual(await shown(), [BALANCE, MAKE_UP]);
    assert.deepEqual(await choice(), ['The season so far']);
  });
});
