import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTokensCss } from '../scripts/tokens-css.mjs';

/* #69 (restyle Today and the game screen), Proof: "node --test on tokens ...
 * --ease value, --track and --seg-on declared in light and dark". The
 * parser and its four-theme resolution are shared with test/contrast.test.js
 * and test/graphite-tokens.test.js via scripts/tokens-css.mjs. */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const resolved = parseTokensCss(read('app/tokens.css'));
const { light, darkOwn } = resolved;

test('--ease matches the prototype easing', () => {
  assert.equal(light['--ease'], 'cubic-bezier(.32,.72,0,1)',
    `--ease is ${light['--ease']}, want cubic-bezier(.32,.72,0,1)`);
});

test('--track is declared at the prototype value in light and dark', () => {
  assert.equal(light['--track'], '#EBEBEF', `light --track is ${light['--track']}, want #EBEBEF`);
  assert.equal(darkOwn['--track'], '#26262A', `dark --track is ${darkOwn['--track']}, want #26262A`);
});

test('--seg-on is declared at the prototype value in light and dark', () => {
  assert.equal(light['--seg-on'], '#FFFFFF', `light --seg-on is ${light['--seg-on']}, want #FFFFFF`);
  assert.equal(darkOwn['--seg-on'], '#4A4A4F', `dark --seg-on is ${darkOwn['--seg-on']}, want #4A4A4F`);
});

test('--r-2xs, --r-sm and --r-lg match the prototype radii', () => {
  assert.equal(light['--r-2xs'], '4px', `--r-2xs is ${light['--r-2xs']}, want 4px`);
  assert.equal(light['--r-sm'], '12px', `--r-sm is ${light['--r-sm']}, want 12px`);
  assert.equal(light['--r-lg'], '20px', `--r-lg is ${light['--r-lg']}, want 20px`);
});
