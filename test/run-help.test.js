/* #452: the Help entries for the run rules. A guard on the help text, which is
 * prose and has no other seam: they must say breaks do not reset the count,
 * and must not promise the old "whole half" reading. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flat, lacks } from './prose.js';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

test('the run-rule help says breaks do not reset the count, says a game can change its own number, and drops "the whole half"', () => {
  const i = html.indexOf('<b>League rules.</b>');
  assert.ok(i > 0, 'help has a League rules entry');
  const e = flat(html.slice(i, html.indexOf('</p>', i)));
  assert.ok(lacks(e, 'the whole half'), 'no "the whole half"');
  assert.ok(e.toLowerCase().includes('a break between periods is not a rest'), 'plays: says a break does not reset the count');
  assert.ok(e.toLowerCase().includes('sitting does not reset at a break'), 'sits: says a break does not reset the count');
  assert.ok(e.includes('A game can change its own in-a-row number'), 'says a game can change its own');
});

test('How it works names no "N" in a row and counts the minimum in the unit words Settings uses', () => {
  const help = flat(html.slice(html.indexOf('id="help"'), html.indexOf('id="keys"')));
  assert.ok(help.length > 5000, 'read the whole help dialog, not an empty slice');
  assert.ok(lacks(help, ' N in a row'), 'no "Plays at most N in a row" or "Sits at most N in a row"');
  assert.ok(lacks(help, ', in periods'), 'the unit is named like the select: quarters of time');
  assert.ok(lacks(help, 'or in periods'), 'the unit is named like the select: quarters of time');
});
