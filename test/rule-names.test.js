import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avoidRegexes, appCopy } from './glossary.js';

/* #98: the Plan sheet's rule picker, bench mode's blocked-plan messages, the
   rules list and the help sheet each named the three pair rules differently.
   CONTEXT.md's glossary gives one name for each -- Together, Apart, One of
   two on -- and this guard bans the retired names it lists, read through the
   same `_Avoid_:` parser and phrase-to-regex builder test/static-pages.test.js
   already uses (#98 Constraints: "reuse, do not re-derive"; docs/specs/98-
   pair-rule-names.md Design: "Do not type them in again").

   #149 gave the scan loop itself -- every tracked app/*.js string/template
   literal plus index.html's `<body>` text -- one shared home, `appCopy()` in
   test/glossary.js, so this guard and test/one-name.test.js read the same
   files the same way rather than each walking the tree on its own. */
const TERMS = ['Together', 'Apart', 'One of two on'];

/* Two phrases are dropped from the three terms' `_Avoid_` lists, each for a
   reason a grep against this tree, not a guess, established:

   "pair" (Together's own `_Avoid_` line) is ordinary copy throughout this
   codebase and not the phrase #98 retires -- the same call #75 made for the
   same word. It is the field name (`c.pairs`), the switch row "Force
   together pairs every stint" (rules.js, unchanged by this spec), and the
   PAIR_DROPPED warning "Pair A + B ignored: one of them is not available."
   (engine.js, also unchanged -- item 4 names five messages to change and
   this is not one of them). Banning it bare would flag all three.

   "avoid" (Apart's own `_Avoid_` line) is dropped because the only place it
   survives as a real string in app/*.js once comments are stripped is the
   symmetric AVOID_DROPPED warning next to PAIR_DROPPED above --
   `Avoid A / B ignored: one of them is not available.` (engine.js) -- which
   item 4 also leaves alone. Every other hit for the bare word is inside a
   comment (card.js, storage.js, trap.js), which `jsStrings` already drops. */
const PHRASE_DROP = new Set(['pair', 'avoid']);

const WORD_RES = avoidRegexes(TERMS, PHRASE_DROP);

assert.ok(WORD_RES.length >= 4, `only ${WORD_RES.length} avoided phrases parsed from CONTEXT.md; the parser broke`);

const FILES = appCopy();
assert.ok(FILES.length > 20, `only ${FILES.length} file(s) read; the file walk is wrong`);

test('no banned pair-rule name survives in app/*.js literals or app/index.html text', () => {
  const hits = [];
  for (const [file, text] of FILES) {
    for (const [phrase, re] of WORD_RES) if (re.test(text)) hits.push(`${file}: "${phrase}"`);
  }
  assert.deepEqual(hits, [], `banned pair-rule name(s) found:\n${hits.join('\n')}`);
});
