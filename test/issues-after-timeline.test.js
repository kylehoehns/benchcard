import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* #72 item 6: the balance note (#issues) now reads the rotation it explains
   AFTER explaining it, not before -- it moved from directly above #timeline
   to directly below it, still inside .s-rot and still ahead of #stats.

   Read as text, the same way note-placement.test.js reads structure out of
   index.html: no DOM is built. `#timeline`'s own markup is a single EMPTY
   `<div id="timeline" ...></div>` -- the plan is rendered into it by
   `renderTimeline` at runtime, so in the source its own closing tag is the
   very next `</div>` after its opening one, and whatever non-whitespace,
   non-comment element follows that is its real next sibling. */
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

function nextSiblingId(src) {
  const open = /<div[^>]*\bid="timeline"[^>]*>/.exec(src);
  assert.ok(open, '#timeline not found in index.html -- this guard is reading nothing');
  const closeIdx = src.indexOf('</div>', open.index + open[0].length) + '</div>'.length;
  assert.ok(closeIdx > open.index, "#timeline's own closing tag was not found");
  const rest = src.slice(closeIdx).replace(/^(?:\s|<!--[\s\S]*?-->)+/, '');
  const nextTag = rest.match(/^<(\w+)([^>]*)>/);
  if (!nextTag) return null;
  return (nextTag[2].match(/\bid="([^"]*)"/) || [, null])[1];
}

test('#timeline\'s next element sibling is #issues', () => {
  const id = nextSiblingId(html);
  assert.equal(id, 'issues', `#timeline's next sibling is #${id}, not #issues`);
});

test('the reader actually catches the old order', () => {
  // The pre-#72 markup: #issues directly BEFORE #timeline, not after.
  const oldOrder = `<div id="issues" role="status" aria-live="polite"></div>
    <div id="timeline" class="tl"></div>
    <div class="statrow" id="stats"></div>`;
  assert.equal(nextSiblingId(oldOrder), 'stats',
    'the reader must see #stats as the sibling in the old, pre-#72 markup');
});
