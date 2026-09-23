import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripComments } from './js-comments.js';

/* #14. A search that reads one line at a time cannot see a phrase this repo
   wrapped across two -- `#help`'s lede survived a "must not contain" check
   for months because the markup wrapped between "this" and "device" and the
   check wanted a literal space. `test/prose.js`'s `lacks` fixes that for a
   "must not contain" check; this guard is what keeps a new one from being
   written the old, wrap-blind way.

   Only a NEGATIVE check is in scope (AGENTS.md/the spec's own reasoning): a
   "must contain" check fails loudly on a wrap and someone looks: the third
   miss in #14, and it cost ninety seconds. A "must not contain" check passes
   silently over a wrapped phrase, which is a green guard over a broken tree.

   THE TWO BANNED SHAPES, so this file can name them without tripping over
   its own comment (the same move analytics.test.js makes stripping HTML
   comments before scanning):
     - a negated `.includes('a b')` -- a string literal with a plain space
       between two word characters, where "negated" means the expression the
       call hangs off (its receiver, however many nested calls it holds) is
       preceded by `!`;
     - `assert.doesNotMatch(x, /a b/)` -- a regex literal argument with a
       plain space between two word characters, and no `\s` already doing
       the job.
   A regex already written with `\s+` (or `\s`) is not a plain space and
   passes. A one-word literal has no space at all and passes. Comments are
   stripped first with the SAME reader settings.test.js and analytics.test.js
   already use, so a comment naming a banned shape -- like the one two
   paragraphs up -- is never scored as code.

   THE SCAN READS EACH FILE'S WHOLE COMMENT-STRIPPED TEXT, not line by line:
   a `doesNotMatch(` call split across lines --
     assert.doesNotMatch(
       text,
       /two words/,
     );
   -- is exactly the multi-line style this repo already writes (see
   test/storage-warn.test.js's own `doesNotMatch(`), and a line-by-line scan
   never sees the regex argument, because it never shares a line with the
   call. So does a call whose own arguments carry a nested comma or paren --
   `doesNotMatch(body + open.slice(0, open.indexOf('\n}')), /x/)` -- which
   broke the old `[^,]+` capture at the comma inside `.slice(0, 1)` well
   before the phrase itself. Both shapes below WALK BALANCED PARENS/BRACKETS
   from each call site to find its real argument boundaries, rather than
   matching a fixed-width pattern against one line: `matchParen` finds a
   call's own closing paren, `splitTopLevelArgs` splits its argument list on
   only the top-level commas (skipping ones inside a nested call, a string or
   a regex literal), and `receiverStart` walks backward over a `.includes()`
   receiver the same way, so `!fn(a, b).includes('two words')` is read as one
   negated call rather than losing the `!` to the class `[\w$.\[\]]+` used to
   require of a receiver. A match's line number is computed from its index
   into the whole file text (`\n` count up to that index), not from a line
   the scan split on -- `stripComments` preserves every original newline, so
   the two counts agree.

   THIS FILE ITSELF IS EXCLUDED from the scan below: it is full of banned
   shapes in prose describing them, and a guard that flags its own
   explanatory comment has shipped here before (feature-coverage.test.js's
   own note on the point). Excluding by filename rather than trying to write
   a comment-proof example keeps this file readable. */

const SELF = 'wrap-blind.test.js';

// a plain literal space with a word character immediately on each side --
// not \s, which is already wrap-safe, and not a lone word, which has no
// phrase to lose to a wrap
const WORD_SPACE_WORD = /\w \w/;

const INCLUDES_DESCRIBE = "a negated .includes() carries a phrase with a literal space -- "
  + "a line wrap can hide it. Use test/prose.js's lacks() instead.";
const DOES_NOT_MATCH_DESCRIBE = "doesNotMatch carries a phrase with a literal space, not \\s+ -- "
  + "a line wrap can hide it. Use test/prose.js's lacks() instead.";

// True from `i` while scanning a string ('...", "...", `...`) or, when
// `atExprStart` says a '/' here opens an expression rather than closing a
// division, a `/regex/flags` literal -- shared by every balanced walk below
// so they all agree on what one token is. Returns the index just past the
// token, or -1 if `i` is not the start of either kind.
function skipToken(text, i, atExprStart) {
  const c = text[i];
  if (c === "'" || c === '"' || c === '`') {
    const q = c;
    let j = i + 1;
    while (j < text.length && text[j] !== q) { j += text[j] === '\\' ? 2 : 1; }
    return Math.min(j + 1, text.length);
  }
  if (atExprStart && c === '/') {
    let j = i + 1;
    let inClass = false;
    while (j < text.length) {
      if (text[j] === '\\') { j += 2; continue; }
      if (text[j] === '[') inClass = true;
      else if (text[j] === ']') inClass = false;
      else if (text[j] === '/' && !inClass) { j++; break; }
      j++;
    }
    while (j < text.length && /[a-z]/i.test(text[j])) j++;
    return j;
  }
  return -1;
}

// Given the index of a call's opening '(', returns the index just past its
// matching ')' -- brace/bracket-, string- and regex-literal-aware, so a
// nested `.slice(0, 1)` or a `/regex/` argument never fools the depth count.
function matchParen(text, openIdx) {
  let depth = 0;
  let i = openIdx;
  let atExprStart = true;
  while (i < text.length) {
    const skipped = skipToken(text, i, atExprStart);
    if (skipped !== -1) { i = skipped; atExprStart = false; continue; }
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') { depth++; atExprStart = true; i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--; i++;
      if (depth === 0) return i;
      atExprStart = false;
      continue;
    }
    atExprStart = /\s/.test(c) || c === ',' || atExprStart;
    i++;
  }
  return -1;
}

// Splits a call's argument-list text on its TOP-LEVEL commas only -- one
// inside a nested call (`a + b.slice(0, 1)`), a string or a regex literal is
// never a split point.
function splitTopLevelArgs(text) {
  const args = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  let atExprStart = true;
  while (i < text.length) {
    const skipped = skipToken(text, i, atExprStart);
    if (skipped !== -1) { i = skipped; atExprStart = false; continue; }
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') { depth++; atExprStart = true; i++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; atExprStart = false; i++; continue; }
    if (c === ',' && depth === 0) {
      args.push(text.slice(start, i).trim());
      i++; start = i; atExprStart = true;
      continue;
    }
    atExprStart = /\s/.test(c);
    i++;
  }
  args.push(text.slice(start).trim());
  return args;
}

// Walks backward from the index of the '.' in `.includes(` over its
// receiver expression -- `fn(a, b)`, `x.y[0]`, a plain name -- so a nested
// call in the receiver no longer breaks the search the way a fixed
// character class (`[\w$.\[\]]+`) did. Returns the index the receiver
// starts at.
function receiverStart(text, dotIdx) {
  let i = dotIdx - 1;
  let depth = 0;
  while (i >= 0) {
    const c = text[i];
    if (c === ')' || c === ']') { depth++; i--; continue; }
    if (c === '(' || c === '[') {
      if (depth === 0) break;
      depth--; i--; continue;
    }
    if (depth > 0) { i--; continue; }
    if (/[\w$.]/.test(c)) { i--; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i--;
      while (i >= 0 && text[i] !== q) i--;
      i--; continue;
    }
    break;
  }
  return i + 1;
}

function isNegated(text, exprStart) {
  let i = exprStart - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  return i >= 0 && text[i] === '!';
}

function lineOf(text, idx) {
  let n = 1;
  for (let i = 0; i < idx; i++) if (text[i] === '\n') n++;
  return n;
}

function findIncludesViolations(file, text) {
  const violations = [];
  const re = /\.includes\(\s*(['"])((?:(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(text))) {
    const dotIdx = m.index;
    if (WORD_SPACE_WORD.test(m[2]) && isNegated(text, receiverStart(text, dotIdx))) {
      violations.push(`${file}:${lineOf(text, dotIdx)}: ${INCLUDES_DESCRIBE}`);
    }
  }
  return violations;
}

const REGEX_ARG = /^\/((?:\\.|[^/\\\n])*)\/[a-z]*$/;

function findDoesNotMatchViolations(file, text) {
  const violations = [];
  const re = /\bdoesNotMatch\(/g;
  let m;
  while ((m = re.exec(text))) {
    const openIdx = re.lastIndex - 1;
    const closeIdx = matchParen(text, openIdx);
    if (closeIdx === -1) continue;
    const args = splitTopLevelArgs(text.slice(openIdx + 1, closeIdx - 1));
    for (const arg of args.slice(1)) {
      const rm = arg.match(REGEX_ARG);
      if (rm && WORD_SPACE_WORD.test(rm[1])) {
        violations.push(`${file}:${lineOf(text, m.index)}: ${DOES_NOT_MATCH_DESCRIBE}`);
        break;
      }
    }
  }
  return violations;
}

function scan(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.js') && f !== SELF);
  const violations = [];
  for (const file of files) {
    const text = stripComments(readFileSync(new URL(file, dir), 'utf8'));
    violations.push(...findIncludesViolations(file, text), ...findDoesNotMatchViolations(file, text));
  }
  return { files, violations };
}

const DIR = new URL('./', import.meta.url);

test('the scan reads a real, non-trivial slice of test/, not nothing', () => {
  // #22's settings-row smoke check passed at "0 rows, all >= 48px" -- a count
  // asserted before anything about the items is what makes that impossible
  // here. 128 files are scanned (129 test/*.js files minus this one) at the
  // time of writing (#14); the floor is well below that so a few new files
  // never make this guard the failure.
  const { files } = scan(DIR);
  assert.ok(files.length >= 115,
    `only ${files.length} test/*.js files scanned -- the guard is reading the wrong directory`);
});

test('no test/*.js file (other than this one) carries a wrap-blind negative phrase check', () => {
  const { violations } = scan(DIR);
  assert.deepEqual(violations, []);
});
