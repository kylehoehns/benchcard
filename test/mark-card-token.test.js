import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitBlocks, declsOf, stripAllComments, parseColor, contrast } from '../scripts/tokens-css.mjs';

/* #277: the mark's card is the paper (#F4F4F6) wherever paper reads against
 * the tint at 3:1, and the tint's own ink wherever it does not. --mark-card
 * is that choice as a token, so welcomeLogoSvg carries one var(). The rule is
 * checked for every block of tokens.css that sets a --tint, nested more-
 * contrast ones included; a block that names no --mark-card inherits the
 * base :root's paper. */
const PAPER = '#F4F4F6';
const src = stripAllComments(readFileSync(new URL('../app/tokens.css', import.meta.url), 'utf8'));
const tintBlocks = [];
const walk = (text) => {
  for (const b of splitBlocks(text)) {
    if (b.selector.startsWith('@media')) { walk(b.body); continue; }
    const d = declsOf(b.body);
    if (d['--tint']) tintBlocks.push({ selector: b.selector, d });
  }
};
walk(src);

test('the rule is checked on every tint block: base, dark base, 16 light and 16 dark', () => {
  assert.equal(tintBlocks.length, 34);
});

test('--mark-card is paper where paper reads on the tint at 3:1, else the tint ink', () => {
  for (const { selector, d } of tintBlocks) {
    const ratio = contrast(parseColor(PAPER), parseColor(d['--tint']));
    const got = d['--mark-card'] ?? PAPER; // inherited from the base :root
    if (ratio >= 3) {
      assert.equal(got.toUpperCase(), PAPER, `${selector} (${d['--tint']}, ${ratio.toFixed(2)}:1) should keep the paper card`);
    } else {
      assert.equal(got, 'var(--tint-ink)', `${selector} (${d['--tint']}, ${ratio.toFixed(2)}:1) should fall back to --tint-ink`);
    }
  }
});

test('the base block declares the paper card, so an unset tint block inherits it', () => {
  const base = tintBlocks.find((b) => b.selector === ':root');
  assert.equal(base.d['--mark-card'], PAPER);
});
