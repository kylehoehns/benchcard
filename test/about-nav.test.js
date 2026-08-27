/* about.html carries a section index under the hero card, because the page is
 * 14,592px at 390px and roughly forty screens at 200% text, and until it
 * shipped the only way to the section a reader came for was the scroll bar.
 *
 * The failure mode this guards is not the link going missing — it is a TENTH
 * section being added and the index quietly staying at nine. A section index
 * that is one short is worse than none: it reads as complete, so the reader
 * concludes the thing they came for is not on the page. Nothing else can
 * notice, either — `test/dead-id.test.js` scopes its dead-id sweep to
 * `index.html`, and `test/dead-class.test.js` scopes itself to the shell, so
 * `about.html`'s own markup and inline stylesheet are swept by hand.
 *
 * The labels are the headings themselves, verbatim and in document order. That
 * is deliberate and worth pinning: no new prose was invented for the nav, and
 * a label that drifts from its heading is a small lie about where the link
 * goes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const about = readFileSync(new URL('../app/about.html', import.meta.url), 'utf8');
const nav = about.slice(about.indexOf('<nav class="jumpto"'), about.indexOf('</nav>', about.indexOf('<nav class="jumpto"')));

const headings = [...about.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)]
  .map(([, id, text]) => ({ id, text }));
const entries = [...nav.matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)]
  .map(([, id, text]) => ({ id, text }));

test('the section index lists every section, in order', () => {
  assert.ok(headings.length >= 9, 'about.html should still be built of h2 sections');
  assert.deepEqual(entries.map(e => e.id), headings.map(h => h.id));
});

test('every h2 on the page is addressable', () => {
  const bare = [...about.matchAll(/<h2(?![^>]*\sid=)[^>]*>([^<]*)/g)].map(m => m[1].trim());
  assert.deepEqual(bare, [], 'an h2 with no id cannot be linked to or listed:\n  ' + bare.join('\n  '));
});

test('the labels are the headings, not a second set of names', () => {
  assert.deepEqual(entries.map(e => e.text), headings.map(h => h.text));
});

test('the index is a labelled landmark, and the label is not a tenth heading', () => {
  assert.match(nav, /aria-labelledby="onthispage"/);
  assert.match(nav, /<p id="onthispage" class="jumpto-hd">/,
    'the visible label is a <p>: an <h2> here would add a section to the outline that is not a section');
});
