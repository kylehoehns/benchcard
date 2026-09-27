import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlBodyCopy } from './glossary.js';
import { stripHtmlComments } from './html-comments.js';
import { lacks } from './prose.js';
import { read as readSurface } from '../scripts/feature-keys.mjs';

/* #150: About, Advanced and How it works (`#help` in index.html) described
 * the app from before the redesign -- old names, controls that moved, and
 * rules drawn as chips the app no longer has. This is the guard that keeps
 * the retired words from coming back.
 *
 * `about.html` and `advanced.html` are read whole (`htmlBodyCopy`,
 * test/glossary.js -- the body, comments and `<noscript>` stripped, the same
 * seam test/one-name.test.js already uses for these two pages). `#help` is
 * NOT read whole: `index.html`'s `<body>` also carries the live app, and a
 * banned phrase there would be a false alarm this guard has no business
 * raising. `scripts/feature-keys.mjs`'s `read('#help')` is the one place
 * that already slices `index.html` down to the `#help` dialog (bounded by
 * `id="help"` / `id="keys"`) -- reused here rather than re-deriving the
 * slice, then run through the same comment-stripping `htmlBodyCopy` uses.
 *
 * Each phrase below is exactly one of the spec's item 8 bullets. `<h3>Even</h3>`
 * (the strategy heading), "On the floor", "Rest limit" and the sheets' own
 * ✕ close buttons are deliberately NOT on this list -- they are current,
 * ordinary words that collide with the retired ones, which is why #150 does
 * not add them to CONTEXT.md's `_Avoid_` lists and this guard holds them
 * instead. */
const helpCopy = () =>
  stripHtmlComments(readSurface('#help')).replace(/\/\*[\s\S]*?\*\//g, ' ');

const PAGES = () => [
  ['about.html', htmlBodyCopy('app/about.html')],
  ['advanced.html', htmlBodyCopy('app/advanced.html')],
  ['#help', helpCopy()],
];

const BANNED = [
  /rotation levels?/i,               // the level control's old accessible name, and state.js's old tie message
  'lv-word">Rotation',               // about.html's level mock, mislabeling the middle level
  '<b>Even</b> —',                   // the shape's old name in about.html/advanced.html's shape lists
  'class="on">Even<',                // advanced.html's shape mock seg, same old name
  'rchip',                           // the retired chip mock's class
  'carries its own ✕',               // #help's old description of removing a rule
  'in one tap',                      // the rules-mock figcaptions' old description of removing a rule
  'red chip',                        // advanced.html's old description of a rule conflict
  /minutes limit/i,
  'floor and ceiling',
  'floors and ceilings',
  'a floor, a ceiling',
  'Undo in-game changes',            // #help's old name for #gmReset
  'row of steps',                    // the old description of where a level is set
];

test('#150: none of the retired words survive on about, advanced or How it works', () => {
  const hits = [];
  for (const [page, text] of PAGES()) {
    for (const phrase of BANNED) {
      if (!lacks(text, phrase)) hits.push(`${page}: ${phrase}`);
    }
  }
  assert.deepEqual(hits, [], `retired phrase(s) found:\n${hits.join('\n')}`);
});

/* index.html's JSON-LD sits in `<head>`, which `htmlBodyCopy` deliberately
 * does not read (index.html's `<head>` is #149's one named carve-out, so a
 * search-engine result can still say things the body no longer does) -- so
 * this is the one check in this file that reads the raw file instead. */
test('#150: index.html\'s JSON-LD no longer promises floors and ceilings', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.ok(lacks(html, /floors and ceilings/i),
    'index.html\'s JSON-LD still says floors and ceilings');
});
