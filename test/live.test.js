import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stage, stintIndex, resumeAt, passStatus, openAt, stepAt, resumeBarAt } from '../app/live.js';

/* #123/#135: `live.js`'s exports, proved with hand-built plans and `live`
 * values -- no `withTeam`, no `computeAll`, no DOM. #135's rule: `stage`
 * reads `live.finished` first -- `true` is `'finished'`, whatever `at` is --
 * then falls back to `at`: not started is `at <= 0`, everything else
 * (including the last stint, and past the end of a plan that got shorter)
 * is part-played. A missing `live` is `at: 0`. */

const stints = (n) => Array.from({ length: n }, (_, i) => ({
  period: 1, periodName: '', startSec: i * 60, endSec: (i + 1) * 60,
}));
const plan = (n) => ({ ok: true, stints: stints(n) });

test('stage: a 4-stint plan at at 0 is not-started', () => {
  assert.equal(stage(plan(4), { at: 0 }), 'not-started');
});

test('stage: a 4-stint plan at at 1 or 2 is part-played', () => {
  assert.equal(stage(plan(4), { at: 1 }), 'part-played');
  assert.equal(stage(plan(4), { at: 2 }), 'part-played');
});

test('stage: a 4-stint plan at at 3 (the last stint) is part-played, not finished', () => {
  assert.equal(stage(plan(4), { at: 3 }), 'part-played');
});

test('stage: a 4-stint plan past the end (at 7) is part-played', () => {
  assert.equal(stage(plan(4), { at: 7 }), 'part-played');
});

test('stage: live.finished true is finished, whatever at is', () => {
  assert.equal(stage(plan(4), { at: 0, finished: true }), 'finished');
  assert.equal(stage(plan(4), { at: 2, finished: true }), 'finished');
  assert.equal(stage(plan(4), { at: 3, finished: true }), 'finished');
});

test('stage: a missing live is at: 0, so it reads not-started', () => {
  assert.equal(stage(plan(4), undefined), 'not-started');
});

test('stage: a 1-stint plan is not-started at 0, not finished', () => {
  assert.equal(stage(plan(1), { at: 0 }), 'not-started');
});

test('stage: a 1-stint plan with finished: true is finished', () => {
  assert.equal(stage(plan(1), { at: 0, finished: true }), 'finished');
});

test('stage: a missing plan is null', () => {
  assert.equal(stage(null, { at: 2 }), null);
});

test('stage: a blocked plan (p.ok === false) is null', () => {
  assert.equal(stage({ ok: false, stints: stints(4) }, { at: 2 }), null);
});

test('stintIndex: clamps at 0, 1, 2, 3 to themselves in a 4-stint plan', () => {
  assert.equal(stintIndex(plan(4), { at: 0 }), 0);
  assert.equal(stintIndex(plan(4), { at: 1 }), 1);
  assert.equal(stintIndex(plan(4), { at: 2 }), 2);
  assert.equal(stintIndex(plan(4), { at: 3 }), 3);
});

test('stintIndex: clamps past the end (at 7) to the last stint', () => {
  assert.equal(stintIndex(plan(4), { at: 7 }), 3);
});

test('stintIndex: a missing live is at: 0', () => {
  assert.equal(stintIndex(plan(4), undefined), 0);
});

test('stintIndex: a 1-stint plan clamps to 0', () => {
  assert.equal(stintIndex(plan(1), { at: 0 }), 0);
});

test('resumeAt: part-played answers { at, where } off the stint row', () => {
  assert.deepEqual(resumeAt(plan(4), { at: 1 }), { at: 1, where: 'Q1 1:00' });
  assert.deepEqual(resumeAt(plan(4), { at: 2 }), { at: 2, where: 'Q1 2:00' });
});

test('resumeAt: where prefers periodName over "Q" + period', () => {
  const p = { ok: true, stints: [
    { period: 1, periodName: '', startSec: 0, endSec: 60 },
    { period: 5, periodName: 'OT', startSec: 90, endSec: 150 },
    { period: 5, periodName: 'OT', startSec: 150, endSec: 210 },
  ] };
  assert.deepEqual(resumeAt(p, { at: 1 }), { at: 1, where: 'OT 1:30' });
});

test('resumeAt: null when not-started (at 0)', () => {
  assert.equal(resumeAt(plan(4), { at: 0 }), null);
});

test('resumeAt: answers on the last stint, at 3', () => {
  assert.deepEqual(resumeAt(plan(4), { at: 3 }), { at: 3, where: 'Q1 3:00' });
});

test('resumeAt: clamps to the last stint when past the end', () => {
  assert.deepEqual(resumeAt(plan(4), { at: 7 }), { at: 3, where: 'Q1 3:00' });
});

test('resumeAt: null for a missing live', () => {
  assert.equal(resumeAt(plan(4), undefined), null);
});

test('resumeAt: null for a 1-stint plan (not-started at 0)', () => {
  assert.equal(resumeAt(plan(1), { at: 0 }), null);
});

test('resumeAt: null for any finished live', () => {
  assert.equal(resumeAt(plan(4), { at: 0, finished: true }), null);
  assert.equal(resumeAt(plan(4), { at: 3, finished: true }), null);
});

test('resumeAt: null when the plan is missing or blocked', () => {
  assert.equal(resumeAt(null, { at: 2 }), null);
  assert.equal(resumeAt({ ok: false, stints: stints(4) }, { at: 2 }), null);
});

test('passStatus: Underway when part-played, including the last stint', () => {
  assert.deepEqual(passStatus(plan(4), { at: 2 }), { word: 'Underway', cls: 'now' });
  assert.deepEqual(passStatus(plan(4), { at: 3 }), { word: 'Underway', cls: 'now' });
});

test('passStatus: Planned for any other ok plan', () => {
  assert.deepEqual(passStatus(plan(4), { at: 0 }), { word: 'Planned', cls: 'ok' });
  assert.deepEqual(passStatus(plan(4), undefined), { word: 'Planned', cls: 'ok' });
});

test('passStatus: Finished when live.finished is true', () => {
  assert.deepEqual(passStatus(plan(4), { at: 0, finished: true }), { word: 'Finished', cls: 'done' });
});

test('passStatus: Needs a fix when the plan is missing or blocked, even with a mid-game live', () => {
  assert.deepEqual(passStatus(null, { at: 2 }), { word: 'Needs a fix', cls: 'warn' });
  assert.deepEqual(passStatus({ ok: false, stints: stints(4) }, { at: 2 }),
    { word: 'Needs a fix', cls: 'warn' });
});

test('passStatus: Needs a fix when the plan is blocked or missing, even with finished: true', () => {
  assert.deepEqual(passStatus(null, { at: 2, finished: true }), { word: 'Needs a fix', cls: 'warn' });
  assert.deepEqual(passStatus({ ok: false, stints: stints(4) }, { at: 2, finished: true }),
    { word: 'Needs a fix', cls: 'warn' });
});

test('openAt: a not-started or part-played game opens on its own stint', () => {
  assert.equal(openAt(plan(4), { at: 0 }), 0);
  assert.equal(openAt(plan(4), { at: 2 }), 2);
  assert.equal(openAt(plan(4), { at: 3 }), 3);
});

test('openAt: a finished game opens on stint 0', () => {
  assert.equal(openAt(plan(4), { at: 2, finished: true }), 0);
});

test('openAt: a game past the end clamps to the last stint', () => {
  assert.equal(openAt(plan(4), { at: 7 }), 3);
});

test('stepAt: steps forward and back within range', () => {
  assert.equal(stepAt(plan(4), { at: 1 }, 1), 2);
  assert.equal(stepAt(plan(4), { at: 1 }, -1), 0);
});

test('stepAt: clamps at the low end', () => {
  assert.equal(stepAt(plan(4), { at: 0 }, -1), 0);
});

test('stepAt: clamps at the high end', () => {
  assert.equal(stepAt(plan(4), { at: 3 }, 1), 3);
});

const day = (games) => ({ games });

test('resumeBarAt: prefers the latest day when both are part-played', () => {
  const days = [
    day([{ live: { at: 2 } }]),
    day([{ live: { at: 1 } }]),
  ];
  const dayPlans = [[plan(4)], [plan(4)]];
  const r = resumeBarAt(days, dayPlans);
  assert.equal(r.d, 1, 'the later day (index 1) wins, not the earlier one');
  assert.equal(r.i, 0);
});

test('resumeBarAt: within a day, prefers the last game', () => {
  const days = [day([{ live: { at: 2 } }, { live: { at: 1 } }])];
  const dayPlans = [[plan(4), plan(4)]];
  const r = resumeBarAt(days, dayPlans);
  assert.equal(r.d, 0);
  assert.equal(r.i, 1, 'the later game (index 1) wins, not the earlier one');
});

test('resumeBarAt: skips a day with no plans', () => {
  const days = [
    day([{ live: { at: 2 } }]), // day 0: part-played, has a plan
    day([{ live: { at: 1 } }]), // day 1: no plan at all
  ];
  const dayPlans = [[plan(4)], []];
  const r = resumeBarAt(days, dayPlans);
  assert.equal(r.d, 0, 'day 1 has no plan, so the bar falls back to day 0');
  assert.equal(r.i, 0);
});

test('resumeBarAt: null when nothing is part-played', () => {
  const days = [day([{ live: { at: 0 } }])];
  const dayPlans = [[plan(4)]];
  assert.equal(resumeBarAt(days, dayPlans), null);
});

test('resumeBarAt: returns { d, i, at, where } for the picked game', () => {
  const days = [day([{ live: { at: 2 } }])];
  const dayPlans = [[plan(4)]];
  assert.deepEqual(resumeBarAt(days, dayPlans), { d: 0, i: 0, at: 2, where: 'Q1 2:00' });
});

test('resumeBarAt: skips a finished game and picks a game on its last stint', () => {
  const days = [day([{ live: { at: 3, finished: true } }, { live: { at: 3 } }])];
  const dayPlans = [[plan(4), plan(4)]];
  const r = resumeBarAt(days, dayPlans);
  assert.deepEqual(r, { d: 0, i: 1, at: 3, where: 'Q1 3:00' },
    'the finished game (index 0) is skipped; the part-played game on its last stint (index 1) is picked');
});
