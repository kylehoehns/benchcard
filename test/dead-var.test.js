import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* Every CSS custom property that is declared, against every file that could
 * read it — and every `var(--x)` in the shipped code, against the
 * declarations.
 *
 * The fourth sibling of `test/dead-class.test.js` ("does every class the JS
 * emits have a rule?"), `test/dead-export.test.js` ("does every exported name
 * have a reader?") and `test/dead-id.test.js` ("does every id have a
 * reader?"). None of the three reaches a custom property, and `tokens.css` is
 * where the whole product's palette, type ramp, radii and easings live — a
 * token nobody reads looks exactly like one everything reads. The 2026-08-24
 * sweep found four:
 *   - `--r-xl: 28px`, the one radius on the scale with no rule behind it.
 *   - `--ease-in-out`, one of three named easings; the other two are used.
 *   - `--surface: #16151300` in the dark block, a fully transparent value
 *     immediately overwritten by the opaque `--surface: #161513` on the very
 *     next line — dead the moment it was written.
 *   - `var(--err-line, color-mix(…))` in `app.css`, a fallback chain whose
 *     first arm is declared nowhere in the repo, so the fallback was the only
 *     value it could ever take.
 *
 * Scope is deliberately the whole shipped surface in one pool, not per file:
 * `about.html` and the six chart pages link `tokens.css` and read its tokens
 * without declaring any, and modules declare tokens (`--c`, `--bar`) that only
 * CSS reads.
 */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

/* Comments would otherwise read as declarations: tokens.css explains its own
 * tokens by name, and `--` is legal inside an HTML comment. */
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

const SOURCES = readdirSync(new URL('app', ROOT))
  .filter((f) => /\.(js|css|html)$/.test(f))
  .map((f) => ['app/' + f, strip(read('app/' + f))]);

/* A declaration: `--x:` in a declaration position, in CSS or in a style
 * string a module builds, plus the scripted form. */
const DECL = /(?:^|[;{\s"'`(])(--[A-Za-z0-9_-]+)\s*:/g;
const SET = /setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g;
/* A read: `var(--x)`, including the nested arm of a fallback, plus the
 * scripted forms. */
const USE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
const GET = /(?:getPropertyValue|removeProperty)\(\s*['"`](--[A-Za-z0-9_-]+)/g;

const collect = (patterns) => {
  const found = new Map();
  for (const [path, src] of SOURCES) {
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        if (!found.has(m[1])) found.set(m[1], new Set());
        found.get(m[1]).add(path);
      }
    }
  }
  return found;
};

const declared = collect([DECL, SET]);
const used = collect([USE, GET]);

/* Tokens with no reader on purpose. Anything added here needs a reason on the
 * line, or the next sweep cannot tell a deliberate hook from a leftover. */
const KEEP_UNREAD = new Map();
/* Tokens read without a declaration on purpose — a genuine "set this from
 * outside" hook, not a typo. Same rule: a reason on the line. */
const KEEP_UNDECLARED = new Map();

test('every custom property declared is read somewhere', () => {
  const dead = [];
  for (const [name, where] of [...declared].sort()) {
    if (used.has(name) || KEEP_UNREAD.has(name)) continue;
    dead.push(`${name}  (declared in ${[...where].join(', ')})`);
  }
  assert.deepEqual(dead, [],
    'declared and never read — delete the declaration:\n  ' + dead.join('\n  '));
});

test('every var(--x) resolves to a declaration', () => {
  const missing = [];
  for (const [name, where] of [...used].sort()) {
    if (declared.has(name) || KEEP_UNDECLARED.has(name)) continue;
    missing.push(`${name}  (read in ${[...where].join(', ')})`);
  }
  assert.deepEqual(missing, [],
    'read but declared nowhere — either the token is missing or the var() is '
    + 'an indirection that only ever yields its fallback:\n  ' + missing.join('\n  '));
});

/* tokens.css only. It is a flat file of two theme blocks with no media
 * queries, so "same property twice in one block" is unambiguous there. The
 * same check over `app.css` would be noise: it is full of deliberate
 * progressive-enhancement pairs like `max-height: 92vh; max-height:
 * min(92dvh, 100%)`, which `test/dialog-viewport.test.js` pins on purpose. */
test('no token is declared twice in the same block of tokens.css', () => {
  const src = strip(read('app/tokens.css'));
  const dupes = [];
  for (const block of src.matchAll(/\{([^{}]*)\}/g)) {
    const seen = new Set();
    for (const m of block[1].matchAll(DECL)) {
      if (seen.has(m[1])) dupes.push(m[1]);
      seen.add(m[1]);
    }
  }
  assert.deepEqual(dupes, [],
    'the earlier declaration can never win — delete it:\n  ' + dupes.join('\n  '));
});
