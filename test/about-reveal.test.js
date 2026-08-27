/* about.html is the only crawlable document on the site and the `softwareHelp`
 * target in index.html's JSON-LD, and it now carries scroll reveals. That is
 * the classic way to ship an invisible page: hide sections in CSS, reveal them
 * from script, and every reader without script -- a crawler, a text browser, a
 * phone that dropped the connection mid-load -- gets a blank column.
 *
 * The page avoids it by gating every hidden state behind a `.js` class that is
 * added only when IntersectionObserver exists. These tests pin that shape, so
 * the next person adding a reveal cannot quietly drop the guard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const about = readFileSync(new URL('../app/about.html', import.meta.url), 'utf8');
const css = about.slice(about.indexOf('<style>'), about.indexOf('</style>'));

test('nothing on the About page is hidden unless script says so', () => {
  /* Every rule that sets opacity: 0 or moves an element off its resting place
     has to be scoped to `.js`. An unscoped one is content nobody without
     JavaScript will ever read. */
  const rules = css.split('}').map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const [sel = '', body = ''] = rule.split('{');
    if (!/opacity:\s*0\s*[;}]|visibility:\s*hidden/.test(body + ';')) continue;
    if (/@media|@keyframes/.test(sel)) continue;
    assert.ok(/\.js\b/.test(sel),
      `about.html hides content outside the .js guard, so a reader without JavaScript never sees it: ${sel.trim()}`);
  }
});

test('the .js class is only set when the API that undoes it exists', () => {
  const m = about.match(/classList\.add\('js'\)/);
  assert.ok(m, "about.html no longer adds the 'js' class; the reveal CSS would never lift");
  const line = about.slice(about.lastIndexOf('\n', m.index) + 1, about.indexOf('\n', m.index));
  assert.match(line, /IntersectionObserver/,
    'the .js class must be gated on IntersectionObserver — without it nothing ever removes the hidden state');
});

test('reduced motion gets the finished state, not a faster animation', () => {
  const i = css.indexOf('prefers-reduced-motion');
  assert.ok(i > 0, 'about.html should still answer prefers-reduced-motion');
  const block = css.slice(i, i + 400);
  assert.match(block, /\.js \.reveal\s*\{[^}]*opacity:\s*1/,
    'under reduced motion a revealed section must start visible, not animate quickly');
});

test('every revealed section still carries its prose in the markup', () => {
  /* The reveal is a class on the section, never a reason to move content into
     script. If a section ever ships empty, this catches it. */
  const sections = [...about.matchAll(/<section class="reveal">([\s\S]*?)<\/section>/g)];
  assert.ok(sections.length >= 6, 'the About page should still be built of revealed sections');
  for (const [, body] of sections) {
    const text = body.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(text.length > 200, 'a revealed section on about.html has almost no text in the HTML itself');
  }
});
