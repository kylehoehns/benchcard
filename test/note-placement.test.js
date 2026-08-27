import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A note may only describe the control it sits beside.
 *
 * The roster page carried a paragraph at the top making three feature claims
 * about a page that had since grown levels, backup, restore and the season
 * ledger, and nobody adding any of those had a reason to look at it. That is
 * not a prose problem, it is a placement problem: a note inside the box it
 * describes ships and dies with that box, and a note loose at the top of a
 * view outlives whatever it was written about.
 *
 * This cannot check the copy. It checks the structure that causes the rot:
 * no `p.note` is a direct child of a view root. Same source-reading trick as
 * plan-table.test.js -- the markup is read as text, no DOM.
 */

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/* Walk the tags in order, keeping a depth counter. Inside a `main.view` the
   depth the view's own children sit at is known, so any p.note at exactly that
   depth is loose page-level prose. */
function looseNotes(src) {
  const bad = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let depth = 0, viewDepth = null, viewId = '';
  for (let m; (m = tag.exec(src));) {
    const [, close, name, attrs] = m;
    const selfClosing = /\/\s*$/.test(attrs) || VOID.has(name.toLowerCase());
    if (close) { depth--; if (viewDepth != null && depth < viewDepth) viewDepth = null; continue; }
    if (!selfClosing) {
      if (viewDepth == null && name === 'main' && /\bclass\s*=\s*"[^"]*\bview\b/.test(attrs)) {
        viewDepth = depth + 1;
        viewId = (attrs.match(/\bid\s*=\s*"([^"]*)"/) || [, '?'])[1];
      }
      depth++;
    }
    if (name === 'p' && /\bclass\s*=\s*"[^"]*\bnote\b/.test(attrs)
        && viewDepth != null && (selfClosing ? depth + 1 : depth) === viewDepth + 1) {
      bad.push(viewId);
    }
  }
  return bad;
}

test('no page-level note: every p.note sits inside the section it describes', () => {
  const bad = looseNotes(html);
  assert.deepEqual(bad, [],
    `p.note is a direct child of ${bad.join(', ')} — move it inside the box it describes`);
});

test('the walker actually finds a loose note when there is one', () => {
  const fixture = `<main class="view wrap" id="view-x">
    <h1>X</h1>
    <p class="note">loose</p>
    <div class="side-box"><p class="note">fine</p></div>
  </main>`;
  assert.deepEqual(looseNotes(fixture), ['view-x']);
});

test('a note nested one box deep is not reported', () => {
  const fixture = `<main class="view" id="view-y"><div><p class="note">fine</p></div></main>`;
  assert.deepEqual(looseNotes(fixture), []);
});

test('the roster page keeps the card-name note beside the card-name control', () => {
  const roster = html.slice(html.indexOf('id="view-team"'));
  const foot = roster.slice(roster.indexOf('<div class="rfoot">'));
  const end = foot.indexOf('</div>', foot.indexOf('id="cardnames"'));
  assert.match(foot.slice(0, end), /The card prints a short name/,
    'the short-name note left the footer that holds #cardnames');
});
