import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripAllComments, splitBlocks } from '../scripts/tokens-css.mjs';

/* #131 item 6: `[data-theme="dark"]` matches ANY element carrying the
 * attribute, not only `<html>`/`<body>` -- the root cause of #131 (a Settings
 * button that happens to carry the same attribute, for its own reason,
 * absorbed the whole dark palette). The fix scopes every such selector to the
 * root element; this guard holds that scoping for the whole of `app/`, with
 * no exception list, so a fifth bare selector cannot be added the same way
 * the first four were (#131's own survey missed three of them).
 *
 * Reuses `stripAllComments` and `splitBlocks` from scripts/tokens-css.mjs
 * (#131's own reuse instruction) rather than writing a second CSS block
 * splitter -- the same module test/contrast.test.js and
 * test/graphite-tokens.test.js already read tokens.css through. */

const ROOT = new URL('../app/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const CSS_FILES = readdirSync(ROOT).filter((f) => f.endsWith('.css'));
const HTML_FILES = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

/* Every selector list in a piece of CSS text: top-level blocks, plus one
 * level into any `@`-rule body (`@media`/`@supports`) -- the only nesting
 * tokens.css, app.css or an inline <style> here ever use. */
function selectorListsIn(css) {
  const clean = stripAllComments(css);
  const out = [];
  for (const b of splitBlocks(clean)) {
    if (b.selector.startsWith('@')) {
      for (const nested of splitBlocks(b.body)) out.push(nested.selector);
    } else if (b.selector) {
      out.push(b.selector);
    }
  }
  return out;
}

/* Split `str` on whichever of `seps` sit at bracket/paren depth 0, so a comma
 * or space inside `[data-theme="dark"]` or `:not(...)` is never mistaken for
 * a separator between selectors or compounds. */
function splitTop(str, seps) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    if (depth === 0 && seps.includes(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const DARK_ATTR = /data-theme=["']dark["']/;
/* #131 fix-pass finding, item 7: `:where(:root)[data-theme="dark"]` and
 * `:where(html)[data-theme="dark"]` are root-anchored too -- `:where()`
 * always carries zero specificity, so wrapping `:root`/`html` in it changes
 * nothing about WHICH element the rule can match, only how much it weighs
 * against a sibling rule. `:where(.x)[data-theme="dark"]` still applies to
 * any `.x` carrying the attribute, so only a `:where()` whose argument is
 * exactly `:root` or `html` counts as anchored. */
const ROOT_ANCHOR = /^(:root\b|html\b|:where\(\s*:root\s*\)|:where\(\s*html\s*\))/;
const COMBINATORS = [' ', '\t', '\n', '>', '+', '~'];

/* A selector list applies `[data-theme="dark"]` to something other than the
 * root element unless, in every comma-separated complex selector, the
 * attribute sits only on the FIRST compound (bare, or inside a `:not()`) and
 * that compound is anchored on `:root` or `html`. Returns the offending
 * complex selector(s), or [] if the list is clean (including a list that
 * never mentions the attribute at all). */
function offendingSelectors(selectorList) {
  const bad = [];
  for (const complex of splitTop(selectorList, [','])) {
    const compounds = splitTop(complex, COMBINATORS);
    compounds.forEach((compound, i) => {
      if (!DARK_ATTR.test(compound)) return;
      if (i !== 0 || !ROOT_ANCHOR.test(compound)) bad.push(complex);
    });
  }
  return bad;
}

test('offendingSelectors accepts every root-anchored form #131 names, and rejects a bare one', () => {
  const accept = [
    ':root[data-theme="dark"]',
    'html[data-theme="dark"]',
    ':root[data-theme="dark"] [data-tint="x"]',
    ':root[data-theme="dark"][data-tint="hardwood"]',
    ':root:not([data-theme="dark"])',
    ':root:not([data-theme="dark"]) [data-tint="x"]',
    ':root[data-theme="dark"] input, :root[data-theme="dark"] select',
    // #131 fix-pass finding, item 7: the three descendant rules' own
    // specificity-preserving form.
    ':where(:root)[data-theme="dark"]',
    ':where(html)[data-theme="dark"]',
    ':where(:root)[data-theme="dark"] input, :where(:root)[data-theme="dark"] select',
  ];
  for (const sel of accept) {
    assert.deepEqual(offendingSelectors(sel), [], `should accept "${sel}"`);
  }
  const reject = [
    '[data-theme="dark"]',
    '[data-theme="dark"] input',
    '[data-theme="dark"] #view-games input[type=text]',
    // a `:where()` anchored on anything other than :root/html is not an
    // anchor at all -- it still matches any `.x` carrying the attribute.
    ':where(.x)[data-theme="dark"]',
    '[data-theme="dark"] .tl-div.onblk',
    '.foo [data-theme="dark"]',
  ];
  for (const sel of reject) {
    assert.notDeepEqual(offendingSelectors(sel), [], `should reject "${sel}"`);
  }
});

function violationsIn(label, css) {
  const bad = [];
  for (const list of selectorListsIn(css)) {
    for (const off of offendingSelectors(list)) bad.push(`${label}: "${off}"`);
  }
  return bad;
}

test('every `[data-theme="dark"]` selector in app/*.css and inline <style> in app/*.html is anchored on :root or html', () => {
  assert.ok(CSS_FILES.length > 0, 'found no .css file under app/ -- the guard measured nothing');
  assert.ok(HTML_FILES.length > 0, 'found no .html file under app/ -- the guard measured nothing');

  const bad = [];
  for (const file of CSS_FILES) bad.push(...violationsIn(file, read(file)));
  for (const file of HTML_FILES) {
    const html = read(file);
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      bad.push(...violationsIn(`${file} (inline <style>)`, m[1]));
    }
  }
  assert.deepEqual(bad, [],
    '[data-theme="dark"] matches any element carrying the attribute, not only the root -- anchor it on '
    + '`:root` (or `html`), e.g. `:root[data-theme="dark"]`. Offenders:\n  ' + bad.join('\n  '));
});
