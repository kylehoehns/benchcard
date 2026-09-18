import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* #33 decision 11 (W3: no help icons, no paragraphs beside controls).
 *
 * This file used to guard the "?" deep-link mechanism: a `.helpq` button
 * beside a control, wired through `data-help`, that opened `#help` scrolled
 * to the section describing that control. The redesign removes the
 * mechanism outright rather than trimming it, so this file now guards its
 * absence -- the W3 guard decision 11 calls for.
 *
 * `#help` itself is not gone: Settings' own "How it works" row (`#helpBtn`)
 * still opens it, at the top, with no deep link. That is `settings.test.js`'s
 * job to pin, not this file's.
 */

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

const html = read('app/index.html');
/* Comments stripped before the CSS/JS checks: both files are allowed to say,
   historically, that a `.helpq` rule used to live here -- what must be gone
   is a RULE, a selector that still matches something, not the word. */
const css = read('app/app.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
const js = read('app/shortcuts.js').replace(/\/\*[\s\S]*?\*\//g, ' ');

test('no element carries data-help', () => {
  assert.doesNotMatch(html, /data-help/,
    'a data-help attribute survives in app/index.html -- decision 11 deletes the deep-link mechanism entirely');
});

test('no "?" help control is wired up', () => {
  assert.doesNotMatch(html, /class="helpq/, 'a .helpq button is still in the markup');
  assert.doesNotMatch(css, /\.helpq\b/, '.helpq still has a rule in app.css');
  assert.doesNotMatch(js, /data-help|helpq/, 'shortcuts.js still wires up a data-help/.helpq control');
});

test('openHelp still opens #help with no section to scroll to', () => {
  // #helpBtn is Settings' own "How it works" row, and the one remaining
  // caller now that the deep links are gone; it must keep working.
  assert.match(js, /on\('#helpBtn',\s*'onclick',\s*\(\)\s*=>\s*openHelp\(\)\)/,
    '#helpBtn no longer opens #help with no section');
});

/* #33 decision 16, "What would settle it" item 9: `#help`'s own copy is the
 * one place in the app most likely to go stale, since nothing else reads it
 * back -- a control it names can be renamed or removed elsewhere with no
 * test here noticing, unless this checks the literal words. The four
 * phrases below are the ones decision 16 names by name: each pointed at a
 * control this redesign renamed or removed (Season went from a tab to its
 * own screen; Print's size options moved under a "Size" row, not a "Print"
 * one; the day chart moved off this screen's own copy to the Season screen;
 * Rules moved into the Plan sheet, off any "under Rules" section of its
 * own). `\bPrint\b` -- not `/print/i` -- so the verb ("prints it on a
 * card", "the printed plan") stays allowed; only the capitalized control
 * name is banned. */
test('#help names only controls that exist (decision 16)', () => {
  const start = html.indexOf('id="help" hidden tabindex="-1" role="dialog"');
  assert.ok(start >= 0, '#help dialog not found in app/index.html');
  const end = html.indexOf('<!-- ====================== keyboard shortcuts', start);
  assert.ok(end > start, 'could not find the end of the #help dialog');
  const body = html.slice(start, end);
  const banned = [
    ['Season tab', /Season tab/],
    ['Print', /\bPrint\b/],
    ['Across the day', /Across the day/],
    ['under Rules', /under\s+(?:<b>)?Rules/],
  ];
  for (const [label, re] of banned) {
    assert.doesNotMatch(body, re, `#help still says "${label}" -- decision 16 named that a control this redesign removed`);
  }
});
