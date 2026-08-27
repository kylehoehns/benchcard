import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The printed card rebuilds its stint rows from `live.overrides` whenever the
   coach has swapped anyone by hand, but its minutes footer quoted
   `plan.minutes` — the solver's answer, which knows nothing about the swap.
   So the card contradicted itself: the rows put a kid on the floor for stints
   the plan never gave her while the footer still printed the planned total.
   Found by walking a game whose roster changed between the plan and the bench.

   `minutesFrom` then moved to `state.js`, next to `effectiveStints`, once the
   timeline and the stat tiles needed the same number — two copies of it is
   exactly how the card and the plan page drifted apart. Both modules touch
   `document` / `localStorage` at import time, so the helper is exercised
   through `new Function`, the same trick availability.test.js uses. */
const state = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');
const card = readFileSync(new URL('../app/card.js', import.meta.url), 'utf8');
const body = state.slice(state.indexOf('export function minutesFrom'));
const fn = body.slice(0, body.indexOf('\n}\n') + 2).replace('export function', 'function');
// eslint-disable-next-line no-new-func
const minutesFrom = new Function(`${fn}\nreturn minutesFrom;`)();

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
const stints = [
  { onFloor: ['a', 'b', 'c', 'd', 'e'], minutes: 4 },
  { onFloor: ['b', 'c', 'd', 'e', 'f'], minutes: 4 },
];

test('minutes are totalled off the rows the card prints', () => {
  assert.deepEqual(minutesFrom(stints, ids), { a: 4, b: 8, c: 8, d: 8, e: 8, f: 4 });
});

test('a player who never gets on is still listed at 0', () => {
  const m = minutesFrom(stints, [...ids, 'g']);
  assert.equal(m.g, 0);
});

test('a swapped stint moves the minutes with it', () => {
  /* The override is the whole five, so the kid who came off loses the stint
     and the kid who came on gains it -- which is the number the footer must
     agree with. */
  const swapped = [stints[0], { onFloor: ['a', 'c', 'd', 'e', 'f'], minutes: 4 }];
  const m = minutesFrom(swapped, ids);
  assert.equal(m.b, 4, 'the player taken off keeps only the stint she played');
  assert.equal(m.a, 8, 'the player kept on gains the stint the plan gave away');
});

test('fractional stints do not accumulate float noise', () => {
  const thirds = Array.from({ length: 3 }, () => ({ onFloor: ['a'], minutes: 2.67 }));
  assert.equal(minutesFrom(thirds, ['a']).a, 8.01);
});

test('the card footer prints the effective minutes, not the plan', () => {
  assert.match(card, /Object\.entries\(minutes\)/,
    'the footer must read the minutes it was handed');
  assert.match(card, /buildCard\(p, rows, pg, pages\.length, title, g\.when, mins\)/,
    'renderCards must hand the effective minutes to buildCard');
  assert.match(card, /const mins = effectiveMinutes\(g, p\)/,
    'the card must total through the shared helper, not a copy of its own');
});

test('an unswapped plan keeps the solver\'s own minutes, by identity', () => {
  /* `effectiveStints` returns `p.stints` itself when nothing was swapped, so
     identity is the test for "this readout is the plan": every surface must
     print `plan.minutes` verbatim rather than a re-total of the same rows,
     which would re-round numbers the engine already rounded. */
  assert.match(state, /stints === p\.stints \? p\.minutes : minutesFrom\(stints, Object\.keys\(p\.minutes\)\)/,
    'effectiveMinutes must short-circuit to plan.minutes when nothing was swapped');
});

test('every minute readout goes through the shared helper', () => {
  /* The bug this closes: the card was already effective and the timeline and
     the stat tiles still read `plans[]` raw, so the plan page said DEVO 12 and
     the card two inches below said DEVO 4. Nothing that quotes a total to the
     coach may reach into `p.minutes` or `p.stints` on its own again. */
  for (const f of ['timeline.js', 'plan-view.js', 'card.js']) {
    const src = readFileSync(new URL('../app/' + f, import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/\bp\.minutes\b/.test(code), `${f} still reads p.minutes directly`);
    assert.match(src, /effectiveMinutes\(/, `${f} does not use effectiveMinutes`);
  }
});
