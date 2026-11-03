/* #533: Sit for the rest and the This stint swap take the cap retry a change of
 * plan uses. RICH's Hawks cut to six players (4 x 8, subs every 4, seed 1234)
 * with Plays at most 16 on Marcus Williams and Devon Ellis, driven through
 * test/coach.js from the second stint. Skipped where there is no Chrome. */

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const CAPPED = ['Marcus Williams', 'Devon Ellis'];
const rules = { keepOnFloor: [], avoids: [], pairs: [], closing: { players: [] }, minMinutes: {}, maxMinutes: { p0: 16, p1: 16 } };

describe('a sit or a swap with Plays at most in the way', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });
  afterEach(() => { assert.deepEqual(coach.errors, [], 'the page logged an error'); });

  async function atStint2() {
    await coach.onGameDayWith({ seed: 1234, constraints: rules }, 6);
    await coach.tap('Hawks, 9:00 AM, planned');
    await coach.tap('Start game');
    await coach.goToStint(2);
  }

  test('Sit for the rest of a kid with no limit plans the rest and the plan says who goes over', async () => {
    await atStint2();
    const sitter = (await coach.onFloor()).find(n => !CAPPED.includes(n));
    await coach.tapPlayer(sitter);
    await coach.tap('Sits the rest of the game');
    assert.ok(!(await coach.onFloor()).includes(sitter), 'the sit took');
    const later = await coach.floorEachStint();
    assert.deepEqual(later.filter(f => f.includes(sitter)), [], `${sitter} plays after the sit`);
    await coach.tap('Leave');
    assert.match(await coach.text('#issues'), /over Plays at most 16/);
  });

  test('a This stint swap that brings a capped kid on re-plans the rest of the game', async () => {
    await atStint2();
    const floor = await coach.onFloor();
    const off = CAPPED.find(n => !floor.includes(n));
    assert.ok(off, 'the premise: a capped kid is on the bench');
    const before = await coach.floorEachStint();
    await coach.goToStint(2);
    await coach.tapPlayer(floor.find(n => !CAPPED.includes(n)));
    await coach.tap('For now');
    await coach.tapPlayer(off);
    assert.match(await coach.toast(), /The rest of the game was re-planned/);
    const after = await coach.floorEachStint();
    assert.notDeepEqual(after.slice(2), before.slice(2), 'the later stints did not change');
  });
});
