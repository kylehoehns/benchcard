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
