import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A10 slice 2, part (b). When "Sit, rebalance" cannot solve the rest of the
   game, the toast now names the rule that stopped it instead of saying "one of
   your rules". The names live in `SIT_RULES` in `gamemode.js`, keyed by the
   solver's own error codes -- so the failure mode this file exists for is a
   code being ADDED to `engine.js` and nobody thinking of the toast, which
   would silently fall back to the generic sentence forever.

   gamemode.js reaches for the DOM at import time, so this reads the source,
   the way `test/gamemode-open.test.js` already does. */

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const gm = read('app/gamemode.js');
const engine = read('app/engine.js');

/* Comments are stripped first. A guard anchored on a NAME can otherwise be
   satisfied by a comment that merely mentions it -- a hazard that shipped a
   2/6-dead guard once. */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const mapped = () => {
  const src = bare(gm);
  const i = src.indexOf('const SIT_RULES = {');
  assert.ok(i > 0, 'SIT_RULES is gone from gamemode.js');
  const body = src.slice(i, src.indexOf('\n};', i));
  return new Map([...body.matchAll(/^\s*([A-Z_]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
};

/* Codes the toast deliberately does not name, with the reason on the line.
   Both are platoon-only, and `resolveRest` refuses `strategy === 'platoon'`
   before it ever reaches the solver, so a clause for either would be copy no
   coach can reach. */
const UNMAPPED = new Map([
  ['UNITS_MISSING', 'platoon only; resolveRest refuses platoon before solving'],
  ['UNIT_WRONG_SIZE', 'platoon only; resolveRest refuses platoon before solving'],
]);

const engineCodes = () =>
  new Set([...bare(engine).matchAll(/\berr\('([A-Z_]+)'/g)].map((m) => m[1]));

test('every solver error code is either named for the coach or listed as unreachable', () => {
  const rules = mapped();
  const gaps = [];
  for (const code of engineCodes()) {
    if (rules.has(code) || UNMAPPED.has(code)) continue;
    gaps.push(code);
  }
  assert.deepEqual(gaps, [],
    'these `err()` codes can reach the "Sit, rebalance" toast with no name:\n  '
    + gaps.join('\n  ') + '\nAdd a clause to SIT_RULES, or a line to UNMAPPED with the reason.');
});

test('SIT_RULES and UNMAPPED have not rotted', () => {
  /* Both directions. An entry for a code the engine no longer raises is dead
     copy that reads as coverage. */
  const codes = engineCodes();
  assert.ok(codes.size > 10, 'the code extraction found almost nothing -- it has stopped working');
  for (const code of mapped().keys()) {
    assert.ok(codes.has(code), `SIT_RULES names ${code}, which engine.js no longer raises`);
  }
  for (const [code, why] of UNMAPPED) {
    assert.ok(codes.has(code), `UNMAPPED lists ${code}, which engine.js no longer raises`);
    assert.ok(why.trim().length > 10, `UNMAPPED entry ${code} has no reason on the line`);
    assert.ok(!mapped().has(code), `${code} is both mapped and listed as unmapped`);
  }
});

test('each clause composes into the sentence the toast builds', () => {
  /* The toast is `Sitting ${name} leaves no plan for the rest: ${rule}.` --
     so a clause that starts with a capital or ends in a full stop reads as a
     second sentence spliced into the first. */
  for (const [code, clause] of mapped()) {
    assert.ok(!/^[A-Z]/.test(clause), `${code}'s clause starts a new sentence`);
    assert.ok(!/[.!?]$/.test(clause), `${code}'s clause ends in punctuation the toast adds`);
    assert.ok(clause.length < 80, `${code}'s clause is too long for a phone toast`);
  }
  assert.match(bare(gm), /leaves no plan for the rest: \$\{rule\}/,
    'the toast that consumes SIT_RULES is gone');
  assert.match(bare(gm), /SIT_RULES\[\(r\.issues \|\| \[\]\)\.find\(x => x\.severity === 'error'\)\?\.code\]/,
    'the clause must come from the solver\'s own first error, not a guess');
});

test('the stale-card line counts stints that really moved', () => {
  /* Part (a). An override can be written with the five the card already had --
     a re-solve often leaves a stint alone -- so counting keys would tell the
     coach their card is wrong when it is not. */
  const src = bare(gm);
  const i = src.indexOf('const moved = Object.entries(live.overrides)');
  assert.ok(i > 0, 'the moved count is gone');
  const body = src.slice(i, src.indexOf('#gmMoved', i));
  assert.match(body, /p\.stints\[k\]/, 'the count must compare against the printed plan');
  assert.match(body, /sort\(\)\.join\(\)/, 'the comparison must not depend on lineup order');
  assert.match(src, /moved === 1 \? '1 stint no longer matches/,
    'the singular case has its own sentence');
});
