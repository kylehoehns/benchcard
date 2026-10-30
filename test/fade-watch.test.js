/* #375: the fade watcher in test/coach.js must record a screen that fades in
 * even when the animation is already at its end frame by the time the watcher
 * reads it (a slow CI runner). A script registered ahead of the watcher holds
 * each entrance animation at its end frame on `animationstart`, which is that
 * race made certain. Skipped where there is no Chrome. */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

const HOLD_AT_END = `window.addEventListener('animationstart', e => {
  if (!['viewIn', 'welMark', 'rise'].includes(e.animationName)) return;
  for (const a of e.target.getAnimations()) {
    if (a.animationName === e.animationName) a.finish();
  }
}, true);`;

describe('the fade watcher under a slow runner', { skip }, () => {
  let coach;
  before(async () => {
    coach = await Coach.open();
    await coach.realMotion();
    await coach.c.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD_AT_END });
  });
  after(async () => { await coach?.close(); });

  test('a screen that fades in is recorded although its animation is already finished', async () => {
    await coach.onGameDayWide();
    assert.deepEqual(await coach.fadedIn(), ['view-games']);
  });
});
