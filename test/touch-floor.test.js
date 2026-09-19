import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUCH_FLOOR, TOUCH_TOL, TOUCH_MIN, TOUCH_CHECK } from '../scripts/smoke/registry.mjs';

/* The touch floor is spelled twice on purpose and pinned here.
 *
 * `scripts/smoke-checks.js` is not a module: `smoke.mjs` reads it as TEXT and
 * hands it to the page as one expression, so it cannot import
 * `scripts/smoke/registry.mjs` and has to carry its own `TOUCH_FLOOR`. That
 * is the right shape, but nothing in `npm test` held the two copies
 * together -- only a full `npm run smoke` could notice, and only indirectly,
 * by one side reporting a number the other never measured against.
 *
 * So this reads the second copy the same way the harness does, out of the
 * file's own source, and asserts the two agree. It needs no browser, which
 * is the point: divergence is caught in the suite that runs on every commit
 * rather than in the one that needs Chrome. */

const SRC = readFileSync(new URL('../scripts/smoke-checks.js', import.meta.url), 'utf8');

const num = (name) => {
  const m = SRC.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+(?:\\.\\d+)?)`));
  assert.ok(m, `smoke-checks.js no longer declares ${name} as a plain number -- `
    + 'this guard reads the file as text, the way smoke.mjs does, and found nothing to read');
  return Number(m[1]);
};

test('smoke-checks.js and the registry state the same touch floor', () => {
  assert.equal(num('TOUCH_FLOOR'), TOUCH_FLOOR,
    'the in-page floor and scripts/smoke/registry.mjs disagree -- raising one means raising both');
  assert.equal(num('TOUCH_TOL'), TOUCH_TOL,
    'the in-page measurement tolerance and the registry disagree');
  assert.equal(TOUCH_MIN, TOUCH_FLOOR - TOUCH_TOL, 'TOUCH_MIN must stay the floor minus the tolerance');
});

test('the check name the registry publishes is the one smoke-checks.js builds', () => {
  /* `STATIC_A11Y.has(name)` DROPS a verdict whose name it does not
     recognize, so a stale spelling here reads as seven clean static pages
     rather than as a failure. */
  assert.ok(SRC.includes('add(`touch targets ≥ ${TOUCH_FLOOR}px`'),
    'smoke-checks.js no longer builds its check name from TOUCH_FLOOR');
  assert.equal(TOUCH_CHECK, `touch targets ≥ ${num('TOUCH_FLOOR')}px`);
});

test('nothing in the harness measures against a floor it typed by hand', () => {
  /* The three row sweeps used to compare against `47.99` while the generic
     sweep used `43.5`; #37 collapsed that to one pair. A bare `47.5` or
     `43.5` back in this file is that split reappearing. */
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const bad of ['47.99', '47.5', '43.5', '44']) {
    assert.ok(!new RegExp(`(<|>|=)\\s*${bad.replace('.', '\\.')}\\b`).test(body),
      `smoke-checks.js compares against a hand-typed ${bad} -- use TOUCH_MIN`);
  }
});
