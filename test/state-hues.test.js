import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* `hueSlots` lives in state.js, which touches localStorage at import time, so
   this exercises the logic through a copy rather than importing the module.
   Crude, but the thing worth pinning is small and the bug it guards against
   was mine: calling the single-slot helper inside a `.map` handed every player
   in a pasted list the same colour, because state has not been written yet and
   each call sees the same "taken" set. */
const src = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export const hueSlots'));
const fn = body.slice(0, body.indexOf('\n};') + 3).replace('export const hueSlots =', 'const hueSlots =');
const HUES_LEN = 12;
// eslint-disable-next-line no-new-func
const hueSlots = new Function(`${fn.replace('players = state.players', 'players')}\nreturn hueSlots;`)();

test('a batch of new players gets distinct slots', () => {
  const slots = hueSlots(5, []);
  assert.equal(new Set(slots).size, 5, `collided: ${slots}`);
});

test('slots already taken are skipped', () => {
  const existing = [{ hue: 0 }, { hue: 1 }, { hue: 3 }];
  const slots = hueSlots(2, existing);
  assert.deepEqual(slots, [2, 4]);
});

test('a freed slot is reused rather than left as a gap', () => {
  // player on hue 1 was deleted; the next player should take 1, not 3
  const existing = [{ hue: 0 }, { hue: 2 }];
  assert.deepEqual(hueSlots(1, existing), [1]);
});

test('players with no hue do not block a slot', () => {
  const existing = [{ hue: 0 }, {}, { hue: null }];
  assert.deepEqual(hueSlots(1, existing), [1]);
});

test('past the palette it keeps returning distinct numbers', () => {
  const slots = hueSlots(HUES_LEN + 3, []);
  assert.equal(new Set(slots).size, HUES_LEN + 3);
});
