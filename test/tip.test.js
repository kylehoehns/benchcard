import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The tip prompt is the one place this app asks a volunteer coach for money,
   so when it fires matters more than most behaviour here. `toast.js` reaches
   for the DOM at import time, so this reads the source: what is being pinned
   is the *rule*, and the rule is short enough to read. */
const src = readFileSync(new URL('../app/toast.js', import.meta.url), 'utf8');

test('both paths count toward the same threshold', () => {
  /* They used to disagree -- printing waited for the second card while
     finishing a game asked the first time, so whichever happened first won and
     the threshold was arbitrary from the coach's side. */
  const printFn = src.slice(src.indexOf('export function tipAfterPrint'));
  const gameFn = src.slice(src.indexOf('export function tipAfterGame'));
  assert.match(printFn.slice(0, printFn.indexOf('\n}')), /countUse\(\)/);
  assert.match(gameFn.slice(0, gameFn.indexOf('\n}')), /countUse\(\)/);
});

test('the ask needs more than one visit', () => {
  const m = src.match(/const USES_BEFORE_ASKING = (\d+);/);
  assert.ok(m, 'the threshold should be a named constant, not a literal in a branch');
  assert.ok(Number(m[1]) >= 3,
    'two prints can be one game -- change a rule, print again. Three is the first number that cannot be a single Saturday.');
});

test('finishing a game is gated on eligibility like printing is', () => {
  // the earlier version called showTip directly, so it could fire after the
  // coach had already answered if the flag was checked only downstream
  const gameFn = src.slice(src.indexOf('export function tipAfterGame'));
  assert.match(gameFn.slice(0, gameFn.indexOf('\n}')), /tipEligible\(\)/);
});

test('answering either way is the end of it', () => {
  /* Taking the link and declining both set the flag. A free tool that keeps
     asking is how something starts feeling like shareware. */
  const shows = src.slice(src.indexOf('function showTip'));
  const body = shows.slice(0, shows.indexOf('\n}\n'));
  const sets = body.match(/state\.ui\.tipDone = true/g) || [];
  assert.ok(sets.length >= 2, 'both the accept and the dismiss path must record an answer');
});

test('it never appears over a live game', () => {
  assert.match(src, /tipEligible[\s\S]{0,200}gamemode/,
    'bench mode is the one screen where an interruption costs something real');
});
