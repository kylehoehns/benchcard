/* #452: the Help entries for the run rules. A guard on the help text, which is
 * prose and has no other seam: they must say breaks do not reset the count,
 * and must not promise the old "whole half" reading. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flat, lacks } from './prose.js';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const entry = (title) => {
  const i = html.indexOf(`<dt>${title}</dt>`);
  assert.ok(i > 0, `help entry ${title} exists`);
  return html.slice(i, html.indexOf('</dd>', i));
};

test('the run-rule help says breaks do not reset the count and drops "the whole half"', () => {
  const plays = entry('Plays at most N in a row');
  const sits = entry('Sits at most N in a row');
  for (const e of [plays, sits]) {
    assert.ok(lacks(e, 'the whole half'), 'no "the whole half"');
    assert.ok(flat(e).toLowerCase().includes('breaks between periods do not reset the count'), 'says breaks do not reset the count');
  }
  assert.ok(flat(plays).includes('1 means the whole five changes at every break'), 'says what 1 means');
});
