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
       between two word characters;
     - `assert.doesNotMatch(x, /a b/)` -- a regex literal with a plain space
       between two word characters, and no `\s` already doing the job.
   A regex already written with `\s+` (or `\s`) is not a plain space and
   passes. A one-word literal has no space at all and passes. Comments are
   stripped first with the SAME reader settings.test.js and analytics.test.js
   already use, so a comment naming a banned shape -- like the one two
   paragraphs up -- is never scored as code.

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

// the two banned shapes: each regex's numbered group is the phrase text to
// check for a wrap-losable space, and `describe` is that shape's half of the
// violation message.
const BANNED_SHAPES = [
  {
    re: /!\s*[\w$.\[\]]+\.includes\(\s*(['"])((?:(?!\1).)*)\1/g,
    group: 2,
    describe: "a negated .includes() carries a phrase with a literal space -- "
      + "a line wrap can hide it. Use test/prose.js's lacks() instead.",
  },
  {
    re: /doesNotMatch\([^,]+,\s*\/((?:\\.|[^/\\\n])*)\//g,
    group: 1,
    describe: "doesNotMatch carries a phrase with a literal space, not \\s+ -- "
      + "a line wrap can hide it. Use test/prose.js's lacks() instead.",
  },
];

function scan(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.js') && f !== SELF);
  const violations = [];
  for (const file of files) {
    const src = stripComments(readFileSync(new URL(file, dir), 'utf8'));
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      for (const { re, group, describe } of BANNED_SHAPES) {
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(line))) {
          if (WORD_SPACE_WORD.test(m[group])) {
            violations.push(`${file}:${i + 1}: ${describe}`);
          }
        }
      }
    });
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
