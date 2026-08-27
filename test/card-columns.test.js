import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The half-sheet's second column of stints.
 *
 * The half-sheet was height-bound and width-unbound: an 8in sheet whose
 * width-fit ceiling (44.96px) sat above its own `maxName` (44), so the width
 * bought nothing and the bigger sheet held 9 stints against the pocket card's
 * 12. A second column spends the width on stints instead of on type.
 *
 * Source-scanned rather than rendered, like `card-mark.test.js`, because the
 * interesting parts are two couplings that no browser check would name:
 * a number in `card.js` that has to equal a length in `card.css`, and a class
 * name that has to NOT equal one `index.html` already uses. */
const card = readFileSync(new URL('../app/card.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/card.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

test('the half-sheet gets two columns and the pocket card stays at one', () => {
  assert.match(card, /pocket: \{[^}]*cols: 1/);
  assert.match(card, /half:\s*\{[^}]*cols: 2/);
});

/* The width-fit is measured per column, so the gutter `card.js` subtracts has
   to be the gutter the browser lays out. A mismatch does not throw, it just
   sizes the names against a column that is not the one on the paper. */
test('the gutter card.js measures is the gutter card.css draws', () => {
  const inches = card.match(/const COL_GUTTER = ([\d.]+);/);
  assert.ok(inches, 'COL_GUTTER is gone from card.js');
  const gap = css.match(/\.stintcols \{[^}]*gap: ([\d.]+)in/);
  assert.ok(gap, 'the .stintcols gap is gone from card.css');
  assert.equal(Number(gap[1]), Number(inches[1]));
});

/* The one that actually bit, and it bit silently.
 *
 * The wrapper was called `.cols` first. `index.html` has carried a `.cols`
 * page grid since the beginning, `card.css` is the last sheet the app loads,
 * and the two selectors have equal specificity -- so a rule written for a
 * 5.1in piece of paper replaced `display: grid` on the whole application
 * shell, and every guard in this suite stayed green because the class was
 * genuinely used in both a stylesheet and the markup. Nothing here can see a
 * collision; only this can. */
test('the stint columns do not collide with the page grid', () => {
  assert.match(html, /class="cols /, 'index.html no longer uses .cols for the page grid');
  assert.doesNotMatch(css, /^\.cols[\s{,:>]/m,
    'card.css is loaded last: a bare .cols rule here overrides the page grid in app.css');
  assert.match(card, /el\('div', 'stintcols'\)/);
  assert.match(css, /^\.stintcols \{/m);
});
