/* Roster scenarios (the BDD pilot): what a coach can do to their roster on
 * the Team screen, driven in real Chrome through `test/coach.js`. Each test
 * is one thing a coach sets out to do, named in their words, and asserts
 * only what is on screen.
 *
 * Skipped where there is no Chrome (Cloudflare's build runs `npm test`, see
 * `hasChrome` in scripts/smoke/chrome.mjs). */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('a coach builds their roster', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  test('pasting a list adds everyone, reading numbers from either end', async () => {
    await coach.onTeamScreen([]);
    await coach.tap('Paste a list');
    await coach.fill('Your roster, one player per line', '12 Maya Webb\n#4 Eli Tran\n\nDevon Ellis 23\n');

    assert.equal(await coach.pasteNote(), '3 players: Maya Webb #12, Eli Tran #4 and Devon Ellis #23.');
    await coach.tap('Add 3 players');

    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Eli Tran', 'Devon Ellis']);
    assert.equal(await coach.rosterCount(), '3 players');

    await coach.comeBackLater();
    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Eli Tran', 'Devon Ellis'], 'the roster was saved');
  });

  test('a name pasted twice can be dropped before it is added', async () => {
    await coach.onTeamScreen([]);
    await coach.tap('Paste a list');
    await coach.fill('Your roster, one player per line', 'Maya Webb\nEli Tran\nMaya Webb');

    assert.equal(await coach.text('#pasteRepeats'), 'Maya Webb is listed twice. Drop one');
    await coach.tap('Drop one Maya Webb');
    assert.equal(await coach.sees('Drop one Maya Webb'), false);
    await coach.tap('Add 2 players');

    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Eli Tran']);
  });

  test('pasting players already on the roster offers to skip them', async () => {
    await coach.onTeamScreen(['Maya Webb', 'Eli Tran']);
    await coach.tap('Paste a list');
    await coach.fill('Your roster, one player per line', 'Maya Webb\nEli Tran\nDevon Ellis');
    await coach.tap('Add 3 players');

    assert.equal(await coach.toast(), '2 of these were already on the roster.');
    await coach.tap('Skip them');

    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Eli Tran', 'Devon Ellis']);
  });

  test('twins are kept when the coach ignores the skip offer, and told apart', async () => {
    await coach.onTeamScreen([{ name: 'Maya Webb', number: '12' }]);
    await coach.tap('Paste a list');
    await coach.fill('Your roster, one player per line', '4 Maya Webb');
    await coach.tap('Add player');

    assert.equal(await coach.toast(), '1 of these was already on the roster.');
    assert.deepEqual(await coach.rosterNames(), ['Maya Webb #12', 'Maya Webb #4']);
  });

  test('adding one player by hand', async () => {
    await coach.onTeamScreen(['Maya Webb']);
    await coach.tap('Add a player');
    await coach.fill('Number', '7');
    await coach.fill('Name', 'Jo Park');
    await coach.tap('Add player');

    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Jo Park']);
    assert.equal(await coach.rosterCount(), '2 players');

    await coach.openPlayer('Jo Park');
    assert.equal(await coach.valueOf('Jersey number for Jo Park'), '7');
  });

  test('two players on one number are flagged until one changes', async () => {
    await coach.onTeamScreen([{ name: 'Maya Webb', number: '12' }, { name: 'Eli Tran', number: '12' }]);

    assert.equal(await coach.warning(), '! Maya Webb and Eli Tran both wear #12. Give one of them a different number.');

    await coach.openPlayer('Eli Tran');
    await coach.fill('Jersey number for Eli Tran', '4');
    assert.equal(await coach.warning(), '');
  });

  test('removing a player can be undone, and focus moves to the next row', async () => {
    await coach.onTeamScreen(['Maya Webb', 'Eli Tran', 'Devon Ellis']);
    await coach.openPlayer('Eli Tran');
    await coach.tap('Remove from team');

    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Devon Ellis']);
    assert.match(await coach.toast(), /^Removed Eli Tran\./);
    assert.match(await coach.focused(), /Devon Ellis/);

    await coach.tap('Undo');
    assert.deepEqual(await coach.rosterNames(), ['Maya Webb', 'Eli Tran', 'Devon Ellis']);
  });
});
