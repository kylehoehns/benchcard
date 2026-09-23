/* Shared with static-pages.test.js and rule-names.test.js -- not a *.test.js
   file itself, so `node --test`'s default discovery leaves it alone (same
   proof test/js-strings.js's own header comment gives for the same shape:
   an empty `test/_dummy_helper.js` produced no `not ok` and no test count
   change under `node --test --test-reporter=tap` with no path argument).

   CONTEXT.md's own `_Avoid_:` lines, parsed rather than retyped -- both
   guards that need the glossary's retired words for a term read this one
   parser rather than each typing the list out by hand (docs/specs/98-pair-
   rule-names.md, Constraints: "reuse, do not re-derive"). Each line sits
   right under a term heading ("**Card name**:") and lists its retired
   words, comma-separated, sometimes with a parenthetical qualifier
   ("Minutes (as a strategy name)"). Returns { term -> [phrase, ...] }, the
   parenthetical stripped. */
import { readFileSync } from 'node:fs';

export function parseGlossaryAvoid(md) {
  const out = {};
  let term = null;
  for (const line of md.split('\n')) {
    const heading = line.match(/^\*\*([^*]+)\*\*.*:$/);
    if (heading) { term = heading[1].trim(); continue; }
    const avoid = line.match(/^_Avoid_:\s*(.+)$/);
    if (avoid && term) {
      out[term] = avoid[1].split(',')
        .map((p) => p.replace(/\([^)]*\)/g, '').trim())
        .filter(Boolean);
    }
  }
  return out;
}

const CONTEXT_URL = new URL('../CONTEXT.md', import.meta.url);

function wordRegex(phrase) {
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

/* The one way of turning a glossary term's `_Avoid_` phrases into whole-word
   regexes, shared by static-pages.test.js and rule-names.test.js (#98
   review: the identical `new RegExp(\`\\b${phrase...}\\b\`, 'i')` expression
   used to be typed out in both files). Each caller still keeps its own drop
   set and its own reasons for dropping a phrase -- they scan different text
   (app/*.js + index.html vs. about.html + advanced.html) and drop different
   words for different, file-specific reasons -- and its own overrides, where
   a phrase needs something narrower than a bare word match (static-pages'
   `Minutes` -> an `<h3>` heading, so the ordinary word "minutes" elsewhere on
   the page is not flagged). What is shared is only the mechanical step:
   phrase -> whole-word, case-insensitive RegExp.

   `terms` picks which CONTEXT.md headings to pull `_Avoid_` phrases from;
   `drops` (a Set, compared case-insensitively) removes phrases a caller has
   decided are ordinary copy rather than the retired name; `overrides` maps a
   phrase to a RegExp to use instead of the default whole-word one. Returns
   `[phrase, RegExp]` pairs, in `terms`' order, so a caller that wants to name
   the offending phrase in a failure message still can. */
export function avoidRegexes(terms, drops = new Set(), overrides = {}) {
  const avoidByTerm = parseGlossaryAvoid(readFileSync(CONTEXT_URL, 'utf8'));
  return terms.flatMap((term) => (avoidByTerm[term] || [])
    .filter((phrase) => !drops.has(phrase.toLowerCase()))
    .map((phrase) => [phrase, overrides[phrase] || wordRegex(phrase)]));
}
