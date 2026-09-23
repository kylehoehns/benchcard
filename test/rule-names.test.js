import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jsStrings } from './js-strings.js';
import { parseGlossaryAvoid } from './glossary.js';
import { trackedFiles } from '../scripts/spelling.mjs';

/* #98: the Plan sheet's rule picker, bench mode's blocked-plan messages, the
   rules list and the help sheet each named the three pair rules differently.
   CONTEXT.md's glossary gives one name for each -- Together, Apart, One of
   two on -- and this guard bans the retired names it lists, read through the
   same `_Avoid_:` parser test/static-pages.test.js already uses (#98
   Constraints: "reuse, do not re-derive"; docs/specs/98-pair-rule-names.md
   Design: "Do not type them in again"). */
const AVOID_BY_TERM = parseGlossaryAvoid(readFileSync(new URL('../CONTEXT.md', import.meta.url), 'utf8'));
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

const PHRASES = TERMS.flatMap((term) => (AVOID_BY_TERM[term] || [])
  .filter((phrase) => !PHRASE_DROP.has(phrase.toLowerCase())));

assert.ok(PHRASES.length >= 4, `only ${PHRASES.length} avoided phrases parsed from CONTEXT.md; the parser broke`);

const WORD_RES = PHRASES.map((phrase) =>
  [phrase, new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')]);

/* Comments are prose ABOUT the code, not text a coach reads -- the same rule
   test/static-pages.test.js and test/team-tab-copy.test.js apply to HTML. */
function stripHtmlComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, ' ');
}

const APP_JS_FILES = trackedFiles().filter((f) => /^app\/[^/]+\.js$/.test(f));
assert.ok(APP_JS_FILES.length > 20, `only ${APP_JS_FILES.length} app/*.js files found; the file list is wrong`);

test('no banned pair-rule name survives in app/*.js literals or app/index.html text', () => {
  const hits = [];
  for (const file of APP_JS_FILES) {
    const text = jsStrings(readFileSync(file, 'utf8')).join(' \n ');
    for (const [phrase, re] of WORD_RES) if (re.test(text)) hits.push(`${file}: "${phrase}"`);
  }
  const html = stripHtmlComments(readFileSync(new URL('../app/index.html', import.meta.url), 'utf8'));
  for (const [phrase, re] of WORD_RES) if (re.test(html)) hits.push(`app/index.html: "${phrase}"`);
  assert.deepEqual(hits, [], `banned pair-rule name(s) found:\n${hits.join('\n')}`);
});
