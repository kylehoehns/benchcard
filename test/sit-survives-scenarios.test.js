/* #412: a Sit for the rest survives every later re-plan: an arrival, Who's
 * here, Shuffle, overtime, a hand-off, a reload. Driven through test/coach.js,
 * RICH's Hawks game (8 stints) as game-day-scenarios.test.js has it. Skipped
 * where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a player sat for the rest stays sat', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  const resume = async () => coach.tap((await coach.controls()).find(n => /^Resume/.test(n)));

  async function toStint(n) {
    for (let i = 0; ; i++) {
      const showing = await coach.stint();
      if (showing.startsWith(`${n} of`)) return;
      assert.ok(i < 20, `never reached stint ${n}`);
      await coach.tap(Number(showing.split(' ')[0]) < n ? 'Next stint' : 'Previous stint');
    }
  }

  /* Ten players, Theo (p9) marked out, Hawks started, Eli (the second name on
     stint 3's floor) sat for the rest from stint 3, then on to stint 4. */
  async function satAtStint3(edits = {}, size = 10) {
    await coach.onGameDayWith({ out: ['p9'], ...edits }, size);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await toStint(3);
    const eli = (await coach.onFloor())[1];
    await coach.tapPlayer(eli);
    await coach.tap('Sit for the rest');
    assert.ok(!(await coach.onFloor()).includes(eli), 'the premise: the sit took');
    return eli;
  }

  /* Who is on the floor in each stint from the one showing to the last. */
  const laterFloors = () => coach.floorEachStint();
  /* With exactly five at the game the floor rows are not buttons, so the
     floor is read as the text bench mode shows. */
  async function floorTexts() {
    const texts = [];
    for (;;) {
      texts.push(await coach.text('#gmFloor'));
      const [at, of] = (await coach.stint()).split(' of ').map(Number);
      if (at >= of) return texts;
      await coach.tap('Next stint');
    }
  }
  const never = (floors, name, where) => assert.deepEqual(floors.filter(f => f.includes(name)), [],
    `${name} plays ${where}: ${JSON.stringify(floors)}`);

  /* From bench mode (Leave first) or from the game screen a reload or a
     link opens on. */
  async function viaWhosHere(label, name) {
    if (await coach.sees('Leave')) {
      await coach.tap('Leave');
      await coach.tap('Back to Smoke Test');
      await coach.tap('Hawks, 9:00 AM, underway');
    }
    await coach.tap(label);
    await coach.tap(name);
    await coach.tap('Close');
  }

  test('1. a late arrival marked Here now does not put the sat player back', async () => {
    const eli = await satAtStint3();
    await coach.tap('Next stint');
    await coach.tap('Here now, Theo Alvarez');
    never(await laterFloors(), eli, 'after the sit');
  });

  test('2. marking a late player here on Who\'s here does not put the sat player back', async () => {
    const eli = await satAtStint3();
    await coach.tap('Next stint');
    await viaWhosHere("Who's here, 9 players", 'Theo Alvarez');
    await resume();
    never(await laterFloors(), eli, 'after the sit');
  });

  test('3. Shuffle does not put the sat player back', async () => {
    const eli = await satAtStint3();
    await coach.tap('Leave');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Hawks, 9:00 AM, underway');
    await coach.tap('Shuffle');
    await resume();
    never(await laterFloors(), eli, 'after the sit');
  });

  for (const who of ['Next rotation', 'Even out', 'Strongest five', 'Keep this five']) {
    test(`4. overtime with ${who} never has the sat player in its five`, async () => {
      // nine players, Hana Kim (Level 5, what Strongest five picks first) sat in the last stint
      await coach.onGameDayWith({ out: ['p9', 'p10'] });
      await coach.tap('Hawks, 9:00 AM, planned');
      await coach.tap('Start game');
      await toStint(8);
      const sat = (await coach.onFloor()).includes('Hana Kim') ? 'Hana Kim' : (await coach.onFloor())[0];
      await coach.tapPlayer(sat);
      await coach.tap('Sit for the rest');
      await coach.addOvertime(4, who);
      assert.ok(!(await coach.onFloor()).includes(sat), `${sat} is in the first overtime five`);
    });
  }

  test('5. a hand-off link keeps the sit on the receiving phone', async () => {
    const eli = await satAtStint3();
    await coach.tap('Leave');
    await coach.tap('Card');
    await coach.tap('Share or hand off');
    await coach.tap('Hand off');
    const link = await coach.shareLink();
    await coach.tap('Close');
    await coach.openLink(link);
    // the link carries first names only
    await viaWhosHere("Who's here, 9 players", 'Theo');
    await resume();
    const floors = await laterFloors();
    assert.equal(floors.length, 6, 'the premise: resumed at stint 3');
    never(floors, eli.split(' ')[0], 'after the sit');
  });

  test('6. after a reload the sit still holds through an arrival', async () => {
    const eli = await satAtStint3();
    await coach.tap('Leave');
    await coach.comeBackDaysLater(0);
    await viaWhosHere("Who's here, 9 players", 'Theo Alvarez');
    await resume();
    never((await laterFloors()).slice(2), eli, 'after the sit');
  });

  test('7. Back to the printed plan puts the sat player back, and so does Undo on the sit', async () => {
    const eli = await satAtStint3();
    await coach.tap('Next stint');
    await coach.tap('Here now, Theo Alvarez');
    assert.ok(await coach.sees('Back to the printed plan'), 'the way back is on screen');
    await coach.tap('Back to the printed plan');
    const floors = await laterFloors();
    assert.ok(floors.some(f => f.includes(eli)), `${eli} plays again: ${JSON.stringify(floors)}`);

    await satAtStint3();
    await coach.tap('Undo');
    assert.ok((await laterFloors()).some(f => f.includes(eli)), 'Undo on the sit puts them back');
  });

  test('8. with too few left, the sat player fills the fifth seat and is told so; the sit comes back with the player', async () => {
    // six players: sitting one leaves five, marking one more out leaves five at the game, one of them sat
    await coach.onGameDayWith({}, 6);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.tap('Next stint');
    const sat = (await coach.onFloor())[1];
    await coach.tapPlayer(sat);
    await coach.tap('Sit for the rest');
    const other = (await coach.onFloor())[0];
    await viaWhosHere("Who's here, 6 players", other);
    assert.equal(await coach.toast(), `Not enough players to keep ${sat.split(' ')[0]} sitting.`);
    await resume();
    const short = (await floorTexts()).slice(1);
    assert.equal(short.length, 6, 'stints 3 to 8');
    assert.ok(short.every(t => t.includes(sat)), `${sat} fills the fifth seat: ${JSON.stringify(short)}`);

    while ((await coach.stint()) !== '2 of 8') await coach.tap('Previous stint');
    await viaWhosHere("Who's here, 5 players", other);
    await resume();
    assert.equal(await coach.stint(), '2 of 8');
    never((await laterFloors()).slice(1), sat, 'once there are five without them');
  });
});
