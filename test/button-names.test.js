import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* A button whose only text is a glyph is announced as that glyph.
 *
 * `strategy.js`'s unit-remove button was `el('button', 'xbtn', '×')`, so its
 * whole accessible name was the multiplication sign: "times, button", once per
 * unit, on a screen that can hold several, with nothing to say which one it
 * deletes. Smoke's `controls have accessible names` passes that — the name is
 * non-empty — and that check is right; a live probe cannot know that "×" means
 * nothing to a listener while "Remove unit 2" means something.
 *
 * So the check belongs here, on the shape rather than on today's one instance:
 * every `el('button', …, '<glyph>')` in the app must get a real name from an
 * `aria-label` or a `title` before anything else happens to it. Written this
 * way an ADDED glyph button fails it, which a regex listing the glyphs that
 * exist today could not do. */
const dir = new URL('../app/', import.meta.url);
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* Text that is one or two characters and not a word character: ×, +, ‹, ✕.
   A digit or a letter is left alone — a numbered button is a different case
   and this test has no opinion on it. */
const GLYPH = /const (\w+) = el\('button'[^)]*,\s*'([^\w\s']{1,2})'\)/g;

const files = readdirSync(dir).filter(f => f.endsWith('.js'));
const found = [];
for (const f of files) {
  const src = decomment(readFileSync(new URL(f, dir), 'utf8'));
  for (const m of src.matchAll(GLYPH)) {
    found.push({ f, name: m[1], glyph: m[2], after: src.slice(m.index, m.index + 500) });
  }
}

test('the app still builds a glyph-only button', () => {
  /* Without this, deleting the last one leaves the loop below asserting
     nothing and passing forever. If glyph buttons genuinely go away, delete
     this file rather than leaving a green test that checks no code. */
  assert.ok(found.length >= 1,
    'no `el(\'button\', …, \'<glyph>\')` left in app/. If that is deliberate, remove this file.');
});

for (const g of found) {
  test(`${g.f}: the "${g.glyph}" button is named for a screen reader`, () => {
    assert.match(g.after, new RegExp(`${g.name}\\.(setAttribute\\('aria-label'|title\\s*=)`),
      `${g.f}: \`${g.name}\` is a button whose entire accessible name is "${g.glyph}", so it is `
      + `announced as that glyph and nothing else. Give it an aria-label (or a title, the way `
      + `roster-view.js's ✕ does) that says what it acts on.`);
  });
}

test('the unit-remove control still says WHICH unit', () => {
  /* #28 replaced the glyph-only `×` button this file's own comment describes
     with a full-text `.prow` row ("Remove unit N") -- decision 5's "a `Remove
     unit N` row". The row's visible text IS its accessible name, so the glyph
     problem this file guards against cannot recur here; what still has to
     hold is that the index survives the restyle. */
  const src = decomment(readFileSync(new URL('strategy.js', dir), 'utf8'));
  assert.match(src, /`Remove unit \$\{i \+ 1\}`/,
    'the unit-remove rows all carry the same name again. On a screen holding three units '
    + 'that is three identical "Remove unit" rows — the index is what makes it usable.');
});
