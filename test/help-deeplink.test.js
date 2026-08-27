import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The in-app "?" affordances, and the one thing they are not allowed to do.
 *
 * A20 slice 4: a "?" beside a control opens `#help` scrolled to the section
 * that describes it. The whole point of pointing at `#help` rather than at
 * `advanced.html` is that it never leaves the PWA -- it works in a gym with no
 * signal, costs no page load and has no back button -- so everything pinned
 * here is about the deep link staying inside the sheet.
 *
 * COMMENTS ARE STRIPPED BEFORE ANY SOURCE IS READ. Every assertion below is a
 * negative one anchored on a NAME, and this repo has now shipped two guards
 * that scored their own explanatory comment; the mirror of that failure is a
 * comment EXPLAINING an absence and failing the guard for it, which is exactly
 * what `shortcuts.js`'s note about `scrollIntoView` would do.
 */

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

const html = read('app/index.html');
const css = read('app/app.css');
/* Block comments only: `//` inside a string literal (`'https://...'`) is not a
   comment, and there are no line comments in the file this reads. */
const src = read('app/shortcuts.js').replace(/\/\*[\s\S]*?\*\//g, '');

// the sheet, sliced by its own id the way the coverage guard slices it
const sheet = (() => {
  const at = html.indexOf('id="help"');
  assert.ok(at > -1, '#help is gone');
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('id="keys"', at);
  assert.ok(end > start, 'cannot find the end of the help sheet');
  return html.slice(start, end);
})();

const links = [...html.matchAll(/data-help="([^"]+)"/g)].map(m => m[1]);
const targets = [...sheet.matchAll(/<h4 class="help-h" id="([^"]+)">/g)].map(m => m[1]);

test('every "?" points at a section that exists inside #help', () => {
  assert.ok(links.length >= 5, `expected the slice-4 deep links, found ${links.length}`);
  for (const id of links) {
    assert.ok(sheet.includes(`id="${id}"`),
      `a "?" deep-links to #${id}, which is not a section of the help sheet — `
      + 'the sheet would open at the top and the coach would have to hunt');
  }
});

test('and every anchored section is pointed at by one', () => {
  /* The other direction, because an id nothing links to is a hook that
     survives every refactor walking past it — the `#cardHint` shape.
     "Reading the card" deliberately carries no id: its header is a <button>
     and the only other place to hang a "?" is `display: none` by default. */
  assert.deepEqual([...targets].sort(), [...new Set(links)].sort(),
    'the anchored help sections and the "?" targets have drifted apart');
});

test('a "?" is a real control: named, typed, and square at 44px', () => {
  const btns = [...html.matchAll(/<button[^>]*data-help="[^"]*"[^>]*>/g)].map(m => m[0]);
  assert.equal(btns.length, links.length, 'a data-help landed on something that is not a button');
  for (const b of btns) {
    assert.match(b, /aria-label="[^"]+"/, `a "?" with no accessible name: ${b}`);
    assert.match(b, /type="button"/, `a "?" with no type: ${b}`);
    assert.match(b, /class="[^"]*\bhelpq\b/, `a "?" outside the .helpq rule: ${b}`);
  }
  /* Both axes, not just `min-height`. `advanced.html` shipped a 41.5px-WIDE
     footer link under a rule that already carried `min-height: 44px`, and
     smoke is what caught it — height is not width. */
  const at = css.indexOf('.helpq {');
  assert.ok(at > -1, '.helpq has no rule');
  const rule = css.slice(at, css.indexOf('}', at));
  for (const axis of ['width', 'height']) {
    assert.match(rule, new RegExp(`(^|[;{\\s])${axis}: 44px`),
      `.helpq does not pin its ${axis} at 44px — the app's touch floor is 44 in BOTH directions`);
    assert.match(rule, new RegExp(`min-${axis}: 44px`),
      `.helpq has no min-${axis} floor, so a text-size change can shrink it under 44px`);
  }
});

test('opening the sheet at a section never moves it sideways', () => {
  /* `scrollIntoView`'s `inline` defaults to 'nearest', which scrolls the
     horizontal axis the moment the anchor does not fit across. It has already
     cost this repo one shipped bug (see tour.js and test/tour-scroll.test.js),
     and a dialog is worse than a document: there is no page to scroll back. */
  assert.doesNotMatch(src, /\.scrollIntoView\(/,
    'the help sheet must scroll Y by hand — scrollIntoView moves X as well');
  assert.doesNotMatch(src, /scrollLeft/,
    'nothing in the help sheet may write or read a horizontal scroll offset');
  assert.doesNotMatch(src, /scrollTo\(/,
    'scrolling the dialog is a scrollTop write on .keysbox, not a scrollTo');
  const writes = src.match(/\.scrollTop = [^;]+/g) || [];
  assert.equal(writes.length, 2,
    'expected exactly two scrollTop writes in shortcuts.js — the reset on open and the deep link');
});

test('the deep link reads the sticky header rather than restyling it', () => {
  /* `test/dialog-viewport.test.js` owns the shell's shape: `dvh` with a `vh`
     fallback, safe-area insets on the wrap, a sticky `.keys-hd` with no
     negative top margin. The deep link has to subtract that header's height
     (it is pinned at `top: 0`, so an anchor scrolled to its own offset lands
     underneath it) and must do it by MEASURING, never by touching the rule. */
  assert.match(src, /\.keys-hd/, 'the deep link no longer accounts for the sticky header');
  assert.match(src, /offsetHeight/, 'the header height is hard-coded rather than measured');
});

test('the "?" does not toggle the fold it sits in', () => {
  /* Three of the five live inside a <summary>, where a click on any descendant
     toggles the <details> as its default action. Cancelling the event cancels
     that; without it the "?" opens the sheet AND collapses the section behind
     it. */
  assert.match(src, /data-help/, 'the "?" affordances are no longer wired');
  assert.match(src, /e\.preventDefault\(\);\s*openHelp\(/,
    'the "?" handler does not cancel the click, so it toggles the fold it sits in');
});

test('#helpBtn is not handed the click Event as a section id', () => {
  /* `openHelp` takes an argument now. `on(sel, "onclick", fn)` calls `fn`
     with the event, so passing it by name would have Settings' "Open" ask the
     sheet to scroll to `#[object PointerEvent]`. */
  assert.doesNotMatch(src, /on\('#helpBtn',\s*'onclick',\s*openHelp\s*\)/,
    "Settings' help button passes openHelp the click Event — wrap it");
});
