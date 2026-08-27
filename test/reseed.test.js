import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Shuffle kept the coach's hand swaps and spliced them into a rotation they
   were never made against.

   A swap in bench mode writes a whole five into `live.overrides`, keyed by
   stint index — "put Ben on for Devon in the Q2 4:00 stint". Shuffle rerolls
   the seed and the solver returns a completely different rotation, but the
   overrides survived: every id in them still resolves to a real, available
   player, so neither `removePlayer`'s sweep nor `setAvailable`'s nor
   `sanitize` had any reason to touch them. Walked at 390×844 on an 11-player
   4×8 game: swap Ben in for Devon for the rest of the game, tap Done, tap
   Shuffle, and the new card had two of its eight stints frozen at the old
   plan's fives while the stat row above still quoted the new plan's spread.

   `removePlayer` and `setAvailable` already answer this question the same way
   — a five that is no longer a lineup gets dropped and the stint falls back
   to the plan — so rerolling the rotation does the same. `live.at` stays:
   how far into the game the coach is does not depend on which rotation is
   printed.

   state.js reaches for localStorage at import time, so the helper is
   exercised through `new Function`, the same trick card-minutes.test.js uses. */
const src = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function reseed'));
const fn = body.slice(0, body.indexOf('\n}\n') + 2).replace('export ', '');
// eslint-disable-next-line no-new-func
const reseed = new Function(`${fn}\nreturn reseed;`)();

const live = () => ({ at: 3, overrides: { 3: ['a', 'b', 'c', 'd', 'e'], 6: ['b', 'c', 'd', 'e', 'f'] } });

test('shuffling drops the hand-picked fives', () => {
  const g = { seed: 42, live: live() };
  reseed(g);
  assert.deepEqual(g.live.overrides, {});
});

test('shuffling moves the seed', () => {
  const g = { seed: 42, live: live() };
  reseed(g);
  assert.notEqual(g.seed, 42);
  assert.ok(Number.isInteger(g.seed) && g.seed >= 0 && g.seed < 2 ** 32);
});

test('how far into the game the coach is survives a shuffle', () => {
  const g = { seed: 42, live: live() };
  reseed(g);
  assert.equal(g.live.at, 3);
});

test('a game that was never opened on the bench has no live to sweep', () => {
  const g = { seed: 42 };
  assert.doesNotThrow(() => reseed(g));
  assert.notEqual(g.seed, 42);
});

test('the Shuffle button goes through reseed, not a bare seed assignment', () => {
  /* The bug was one line in app.js setting `game().seed` directly. Guarding it
     here because the symptom is silent: the card just prints a stint nobody
     planned. */
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const handler = app.slice(app.indexOf("on('#regen'"));
  const line = handler.slice(0, handler.indexOf('\n'));
  assert.match(line, /reseed\(/, '#regen must reroll through reseed()');
  assert.doesNotMatch(line, /seed\s*=/, '#regen must not set the seed by hand');
});
