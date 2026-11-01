/* #504: a kid who is Out is not coming; a kid who is Running late is the
 * exception. Driven through test/coach.js on RICH's Hawks game: ten on the
 * roster, Theo Alvarez (p9) the one turned off. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('Out and Running late on Who\'s here', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function openWhoHere(edits = {}) {
    await coach.onGameDayWith({ out: [], ...edits }, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap("Who's here, 10 players");
  }

  test('a kid turned off reads Out with Running late beside it, and turning them back on removes both', async () => {
    await openWhoHere();
    assert.equal(await coach.whoMark('Theo Alvarez'), '');
    assert.equal(await coach.sees('Running late, Theo Alvarez'), false, 'a kid who is here has no Running late');

    await coach.tap('Theo Alvarez');

    assert.equal(await coach.whoMark('Theo Alvarez'), 'Out');
    assert.equal(await coach.isPressed('Running late, Theo Alvarez'), false, 'Out is the default');
    const size = await coach.sizeOf('Running late, Theo Alvarez');
    assert.ok(size.height >= 48, `Running late is ${size.height}px tall`);
    assert.ok((await coach.sizeOf('Theo Alvarez')).height >= 48);

    await coach.tap('Running late, Theo Alvarez');
    assert.equal(await coach.isPressed('Running late, Theo Alvarez'), true);
    await coach.tap('Running late, Theo Alvarez');
    assert.equal(await coach.isPressed('Running late, Theo Alvarez'), false, 'a second tap goes back to Out');

    await coach.tap('Running late, Theo Alvarez');
    await coach.tap('Theo Alvarez');
    assert.equal(await coach.whoMark('Theo Alvarez'), '');
    assert.equal(await coach.sees('Running late, Theo Alvarez'), false, 'turning them on removes the button');
    await coach.tap('Theo Alvarez');
    assert.equal(await coach.isPressed('Running late, Theo Alvarez'), false, 'turned off again, they are Out, not late');
  });

  test('Running late is still pressed after closing the app and reopening', async () => {
    await openWhoHere();
    await coach.tap('Theo Alvarez');
    await coach.tap('Running late, Theo Alvarez');
    await coach.tap('Close');

    await coach.comeBackDaysLater(0);
    await coach.tap("Who's here, 9 players");

    assert.equal(await coach.whoMark('Theo Alvarez'), 'Out');
    assert.equal(await coach.isPressed('Running late, Theo Alvarez'), true);
  });
});

describe('Running late and Out in bench mode', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  /* Ten on the roster at the Hawks game; `edits` is who is out and who is late. */
  async function benchWith(edits) {
    await coach.onGameDayWith(edits, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    for (let i = 0; i < 2; i++) await coach.tap('Next stint');
  }
  const has = async name => (await coach.controls()).includes(name);

  test('nobody out: neither the Running late section nor the Someone showed up row', async () => {
    await benchWith({ out: [] });

    assert.deepEqual(await coach.runningLate(), []);
    assert.equal(await coach.sees('Someone showed up?'), false);
    assert.equal(await has('Here now, Theo Alvarez'), false);
  });

  test('one kid Out: no Running late section; Someone showed up opens a list with a Here now for them', async () => {
    await benchWith({ out: ['p9'], late: [] });

    assert.deepEqual(await coach.runningLate(), [], 'an Out kid is not at the top');
    assert.equal(await has('Here now, Theo Alvarez'), false, 'and has no Here now until asked');
    assert.equal(await coach.isExpanded('Someone showed up?'), false);
    assert.ok((await coach.sizeOf('Someone showed up?')).height >= 48);

    await coach.tap('Someone showed up?');

    assert.equal(await coach.isExpanded('Someone showed up?'), true);
    assert.deepEqual(await coach.showedUp(), ['Theo Alvarez']);
    assert.ok((await coach.sizeOf('Here now, Theo Alvarez')).height >= 48);
    const floor = await coach.onFloor();

    await coach.tap('Here now, Theo Alvarez');

    assert.equal(await coach.toast(), 'Theo is here.');
    assert.deepEqual(await coach.onFloor(), floor, "this stint's floor did not change");
    assert.equal(await coach.sees('Someone showed up?'), false, 'nobody is Out any more');
    assert.deepEqual(await coach.runningLate(), []);
  });

  test('one kid Running late: at the top with Here now, and no Someone showed up row', async () => {
    await benchWith({ out: ['p9'], late: ['p9'] });

    assert.deepEqual(await coach.runningLate(), ['Theo Alvarez']);
    assert.ok((await coach.sizeOf('Here now, Theo Alvarez')).height >= 48);
    assert.equal(await coach.sees('Someone showed up?'), false);
  });

  test('Here now with the Someone showed up list closed puts focus on a floor row, never a hidden button', async () => {
    await benchWith({ out: ['p8', 'p9'], late: ['p9'] });

    await coach.tap('Here now, Theo Alvarez');

    assert.match(await coach.focused(), /minutes/, 'focus is on a floor row');
  });

  test('Here now from the bottom list moves focus to the next Here now in that list, and Undo finds the kid again after the list is closed', async () => {
    await benchWith({ out: ['p7', 'p8'], late: [] });
    await coach.tap('Someone showed up?');
    const [first, second] = await coach.showedUp();

    await coach.tap(`Here now, ${first}`);
    assert.equal(await coach.focused(), `Here now, ${second}`);

    await coach.tap('Someone showed up?');
    await coach.tap('Undo');
    assert.equal(await coach.focused(), `Here now, ${first}`, 'Undo lands on the restored kid even though the list was closed');
  });

  test('both: each kid is in their own place, and Here now then Undo restores Out and Running late after a reopen', async () => {
    await benchWith({ out: ['p8', 'p9'], late: ['p9'] });
    assert.deepEqual(await coach.runningLate(), ['Theo Alvarez']);
    await coach.tap('Someone showed up?');
    assert.deepEqual(await coach.showedUp(), ['Casey Lindqvist']);

    await coach.tap('Here now, Casey Lindqvist');
    await coach.tap('Undo');
    assert.equal(await coach.focused(), 'Here now, Casey Lindqvist', 'Undo lands on the restored kid');
    await coach.tap('Here now, Theo Alvarez');
    await coach.tap('Undo');
    assert.deepEqual(await coach.runningLate(), ['Theo Alvarez']);

    await coach.tap('Leave');
    await coach.comeBackDaysLater(0);
    await coach.tap((await coach.controls()).find(n => /Resume/.test(n)));
    assert.deepEqual(await coach.runningLate(), ['Theo Alvarez']);
    await coach.tap('Someone showed up?');
    assert.deepEqual(await coach.showedUp(), ['Casey Lindqvist']);
  });
});

describe('Running late changes nothing about the plan, and travels with the game', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function floorsWith(edits) {
    await coach.onGameDayWith(edits, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    return coach.floorEachStint();
  }

  test('every stint is the same whether the kid is Out or Running late', async () => {
    const out = await floorsWith({ out: ['p9'], late: [] });
    const late = await floorsWith({ out: ['p9'], late: ['p9'] });

    assert.equal(out.length, 8);
    assert.deepEqual(late, out);
  });

  test('the next game of the day starts with the same kids Out and Running late', async () => {
    await coach.onGameDayWith({}, 10);
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap("Who's here, 10 players");
    await coach.tap('Casey Lindqvist');
    await coach.tap('Theo Alvarez');
    await coach.tap('Running late, Theo Alvarez');
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.tap((await coach.controls()).find(n => n.startsWith('Same as')));

    await coach.tap("Who's here, 8 players");

    assert.equal(await coach.isPressed('Running late, Theo Alvarez'), true);
    assert.equal(await coach.isPressed('Running late, Casey Lindqvist'), false);
  });

  test('the add-game tiles call a kid copied in as Running late "Running late", and a kid copied in as Out "Out"', async () => {
    await coach.onGameDayWith({}, 10);
    await coach.tap('Ravens, 11:30 AM, planned');
    await coach.tap("Who's here, 10 players");
    await coach.tap('Casey Lindqvist');
    await coach.tap('Theo Alvarez');
    await coach.tap('Running late, Theo Alvarez');
    await coach.tap('Close');
    await coach.tap('Back to Smoke Test');
    await coach.tap('Add a game');
    await coach.tap('Next');

    const names = await coach.controls();

    assert.ok(names.includes('Theo Alvarez, Running late'), JSON.stringify(names));
    assert.ok(names.includes('Casey Lindqvist, Out'), JSON.stringify(names));
  });

  test('a hand-off link carries who is Running late', async () => {
    await coach.onGameDayWith({ out: ['p8', 'p9'], late: ['p9'] }, 10);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Card');
    await coach.tap('Share or hand off');
    await coach.tap('Hand off');
    const link = await coach.shareLink();

    await coach.openLink(link);
    await coach.tap("Who's here, 8 players");

    // the link carries first names only, so the roster there reads "Theo" and "Casey"
    assert.equal(await coach.isPressed('Running late, Theo'), true);
    assert.equal(await coach.isPressed('Running late, Casey'), false);
  });
});
