import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTokensCss } from '../scripts/tokens-css.mjs';

/* #28 (the Plan sheet), Proof: "node --test on tokens: --sheet and --r-sheet
 * are declared in light and dark, and --sheet passes the contrast guard as a
 * ground." The contrast-guard half of that is test/contrast.test.js's own
 * GROUNDS list; this file pins the two new tokens' declared values, the same
 * way test/prototype-tokens.test.js pins #69's. The parser and its
 * four-theme resolution are shared via scripts/tokens-css.mjs. */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const resolved = parseTokensCss(read('app/tokens.css'));
const { light, darkOwn } = resolved;

test('--sheet is declared at the prototype value in light and dark', () => {
  assert.equal(light['--sheet'], '#F1F1F5', `light --sheet is ${light['--sheet']}, want #F1F1F5`);
  assert.equal(darkOwn['--sheet'], '#141416', `dark --sheet is ${darkOwn['--sheet']}, want #141416`);
});

test('--r-sheet is declared at 28px', () => {
  assert.equal(light['--r-sheet'], '28px', `--r-sheet is ${light['--r-sheet']}, want 28px`);
});
