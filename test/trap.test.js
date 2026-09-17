/* Pure release/rubber-band/speed math the sheet drag controller uses
 * (#73, items 12-13) -- the one seam the spec's Proof table names for
 * `node --test`: "Pure release/rubber-band/speed functions exported from
 * app/trap.js". `trap.js` calls `document.addEventListener` at import time,
 * so this needs the same document/matchMedia stub test/state-fixture.js
 * holds for state.js -- reused from test/dom-stub.js rather than a second
 * hand copy (the two had already drifted once: this file's own copy carried
 * an unused extra `querySelectorAll`). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-stub.js';

const T = await import('../app/trap.js');

/* ---------------- dragSpeed: px/ms over the trailing window ------------ */

test('dragSpeed: 50px of downward movement over 100ms is 0.5 px/ms', () => {
  const samples = [{ t: 0, y: 0 }, { t: 100, y: 50 }];
  assert.equal(T.dragSpeed(samples, 100), 0.5);
});

test('dragSpeed: movement outside the trailing 100ms window does not count', () => {
  // a slow first 400ms (100px), then a fast last 100ms (60px) -- only the
  // trailing 100ms should be read, so the result reflects 0.6, not the
  // 160px/500ms (0.32 px/ms) average over the whole gesture.
  const samples = [{ t: 0, y: 0 }, { t: 400, y: 100 }, { t: 500, y: 160 }];
  assert.equal(T.dragSpeed(samples, 500), 0.6);
});

test('dragSpeed: upward movement is negative', () => {
  const samples = [{ t: 0, y: 100 }, { t: 100, y: 40 }];
  assert.equal(T.dragSpeed(samples, 100), -0.6);
});

test('dragSpeed: fewer than two samples is 0', () => {
  assert.equal(T.dragSpeed([{ t: 0, y: 0 }], 0), 0);
  assert.equal(T.dragSpeed([], 0), 0);
});

/* ---------------- releaseAction: the close/full/settle decision -------- */

test('releaseAction: a slow release inside both distance thresholds settles', () => {
  assert.equal(T.releaseAction({ dy: 50, height: 400, speed: 0.1, full: false }), 'settle');
});

test('releaseAction: 25% down distance closes even at low speed', () => {
  assert.equal(T.releaseAction({ dy: 120, height: 400, speed: 0.1, full: false }), 'close');
});

test('releaseAction: 15% up distance from half goes full even at low speed', () => {
  assert.equal(T.releaseAction({ dy: -70, height: 400, speed: -0.1, full: false }), 'full');
});

test('releaseAction: a fast downward flick (>0.5 px/ms) closes from half', () => {
  assert.equal(T.releaseAction({ dy: 50, height: 400, speed: 0.6, full: false }), 'close');
});

test('releaseAction: a fast downward flick (>0.5 px/ms) closes from full too', () => {
  assert.equal(T.releaseAction({ dy: 50, height: 400, speed: 0.6, full: true }), 'close');
});

test('releaseAction: a fast upward flick (>0.5 px/ms) from half goes full', () => {
  assert.equal(T.releaseAction({ dy: -30, height: 400, speed: -0.6, full: false }), 'full');
});

test('releaseAction: a fast upward flick from full, still under distance, settles at full', () => {
  assert.equal(T.releaseAction({ dy: -30, height: 400, speed: -0.6, full: true }), 'settle');
});

/* ---------------- rubberBand: the pull-up-past-the-top curve ----------- */

test('rubberBand: zero overshoot moves zero', () => {
  assert.equal(T.rubberBand(0, 60), 0);
});

test('rubberBand: overshoot equal to the cap moves exactly half the cap', () => {
  // f(x) = cap*x/(x+cap); at x = cap, f = cap/2 -- checkable by hand.
  assert.equal(T.rubberBand(60, 60), 30);
});

test('rubberBand: three times the cap moves three-quarters of the cap', () => {
  // f(180) = 60*180/240 = 45
  assert.equal(T.rubberBand(180, 60), 45);
});

test('rubberBand: never reaches the cap however far the finger goes', () => {
  assert.ok(T.rubberBand(100000, 60) < 60);
});

test('rubberBand: monotonically increasing', () => {
  assert.ok(T.rubberBand(10, 60) < T.rubberBand(20, 60));
  assert.ok(T.rubberBand(20, 60) < T.rubberBand(100, 60));
});

/* ---------------- dragOffset: 1:1 up to roomUp, banded past it ---------- *
 * Finding 1 (#73 fix pass): the old `moveDrag` fed every upward `raw` into
 * `rubberBand` from the first pixel, so `|dy|` could never reach `cap` (60)
 * -- unreachable even though `releaseAction`'s "15% up from half goes full"
 * needs ~63px of travel at a 420px-tall half sheet. `dragOffset(raw, roomUp)`
 * tracks the finger 1:1 while `raw` is still within `roomUp` (the distance
 * the sheet's top would travel to reach the full top, measured once at
 * `beginDrag`), and only rubber-bands the overshoot past that edge -- so a
 * half sheet's own drag distance is never capped at 60px before it even
 * reaches the full position. */

test('dragOffset: downward movement passes through unchanged, whatever roomUp is', () => {
  assert.equal(T.dragOffset(80, 100), 80);
  assert.equal(T.dragOffset(80, 0), 80);
});

test('dragOffset: upward movement within roomUp tracks the finger 1:1', () => {
  assert.equal(T.dragOffset(-50, 100), -50);
});

test('dragOffset: upward movement exactly at roomUp is still 1:1 -- room, not yet overshoot', () => {
  assert.equal(T.dragOffset(-100, 100), -100);
});

test('dragOffset: 63px up with 350px of room is reached 1:1 -- the threshold releaseAction reads', () => {
  // The bug this replaces: rubberBand(63, 60) = 60*63/123 = ~30.7, so the old
  // code could never deliver |dy| >= 63 to releaseAction. With 350px of room
  // (a half sheet's top is far from full's), 63px of upward finger movement
  // is still within it, so it passes through 1:1.
  assert.equal(T.dragOffset(-63, 350), -63);
});

test('dragOffset: upward movement past roomUp rubber-bands only the overshoot', () => {
  // raw = -160, roomUp = 100 -> overshoot = 60 -> rubberBand(60, 60) = 30
  // (checkable by hand, same curve the rubberBand tests above use) ->
  // result = -(100 + 30) = -130.
  assert.equal(T.dragOffset(-160, 100), -130);
});

test('dragOffset: an already-full sheet (roomUp 0) rubber-bands from the first upward pixel', () => {
  // roomUp = 0 -> the old, single-branch behavior for a sheet with nothing
  // further to travel to: raw = -100 -> rubberBand(100, 60) = 60*100/160 = 37.5.
  assert.equal(T.dragOffset(-100, 0), -37.5);
});

test('dragOffset: never travels past roomUp + cap, however far the finger goes', () => {
  const dy = T.dragOffset(-100000, 100);
  assert.ok(dy > -160); // -(roomUp + cap) = -(100 + 60)
});
