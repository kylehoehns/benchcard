import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avoidRegexes, appCopy, htmlBodyCopy } from './glossary.js';
import { trackedFiles } from '../scripts/spelling.mjs';
import { lacks } from './prose.js';

/* #149: one name for each thing across the app. Fourteen terms in CONTEXT.md
   each retire one or more older names (rule chips read "substitution", the
   filed-game toast read "saved to the season", the blocked panel read "Plan
   blocked", and so on -- the survey found the same thing named two or three
   ways across app.js, timeline.js, plan-view.js, onboarding.js, index.html,
   about.html and advanced.html). This guard reads CONTEXT.md's own `_Avoid_`
   lines for the fourteen terms (through `avoidRegexes`, test/glossary.js --
   #98's own rule against typing the list out a second time) and fails if any
   of them survives in copy a reader or screen reader actually sees: every
   tracked `app/*.js` string/template literal, and the `<body>` text of
   index.html, about.html, advanced.html and the six generated chart pages,
   with HTML and JS comments stripped and `<noscript>` dropped (index.html's
   own `<head>` and `<noscript>` are the one named carve-out -- Out of scope
   -- so a search-engine result or a no-JS reader can still say
   "substitution"). */
const TERMS = [
  'Break', 'Change', 'Filing', 'Filed game', 'Blocked plan',
  'Comes on / comes off', 'Starting five', 'Card name', 'Lock', 'Odd minutes',
  'Swap', 'Half sheet', 'Remove', 'By hand',
];

/* Dropped as ordinary words rather than the retired name #149 bans -- each
   for a reason this tree itself established, not a guess: */
const DROPS = new Set([
  'saved',        // Filed game _Avoid_: a coach's own Backup is "saved", unrelated to filing
  'finished',     // Filed game _Avoid_: that word names the (unchanged) Finished game
  'history',      // Filed game _Avoid_: not used anywhere as a synonym for Season
  'needs a fix',  // Blocked plan _Avoid_: a game pass's own status word, kept by CONTEXT.md itself
  'infeasible',   // Blocked plan _Avoid_: a code value, state.js -- `plan.reason === 'infeasible'`
  'pin',          // Lock _Avoid_: a class name, timeline.js's `.pin` row state
  'minutes',      // By hand _Avoid_: the ordinary word, everywhere minutes are just minutes
  'just on',      // Comes on / comes off _Avoid_: the bench-mode tag stays (Decided with the maintainer)
]);

/* "budget" (By hand's own _Avoid_ line) is an ordinary word lowercase --
   `maxBudget`, `#budgetInput` and the like -- but the capitalized UI label
   "Budget" is exactly the retired name #149 replaces with "Set so far". */
const OVERRIDES = { budget: /\bBudget\b/ };

const WORD_RES = avoidRegexes(TERMS, DROPS, OVERRIDES);
assert.ok(WORD_RES.length >= 20,
  `only ${WORD_RES.length} avoided phrases parsed from CONTEXT.md; the parser broke`);

/* about.html, advanced.html and the six chart pages are not part of
   `appCopy()` (that helper is shared with rule-names.test.js, which only
   ever scanned app/*.js + index.html) -- item 15 also names these three
   surfaces, so this guard reads them itself, the same way: `htmlBodyCopy`
   (test/glossary.js), from `<body` on, `<noscript>` dropped, HTML comments
   and block comments stripped. */
const CHART_FILES = trackedFiles()
  .filter((f) => /^app\/\d+-player-basketball-rotation-chart\.html$/.test(f));
assert.equal(CHART_FILES.length, 6,
  `expected the six generated chart pages, found ${CHART_FILES.length}`);

const FILES = [
  ...appCopy(),
  ['app/about.html', htmlBodyCopy('app/about.html')],
  ['app/advanced.html', htmlBodyCopy('app/advanced.html')],
  ...CHART_FILES.map((f) => [f, htmlBodyCopy(f)]),
];
assert.ok(FILES.length >= 25, `only ${FILES.length} files read; the file walk is wrong`);

test('no retired #149 name survives in app copy', () => {
  const hits = [];
  for (const [file, text] of FILES) {
    for (const [phrase, re] of WORD_RES) {
      // `lacks` (test/prose.js) rebuilds `re`'s literal spaces as `\s+`
      // before matching, so a phrase the source line-wraps still hits.
      if (!lacks(text, re)) hits.push(`${file}: "${phrase}"`);
    }
  }
  assert.deepEqual(hits, [], `banned name(s) found:\n${hits.join('\n')}`);
});
