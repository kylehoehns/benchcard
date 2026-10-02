import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A tour step may not point at something a fold is hiding.
 *
 * `tourAnchor` picks the first anchor with client rects — and in Chrome 151 a
 * descendant of a SHUT `<details>` still reports client rects, a truthy
 * `offsetParent` and plausible geometry. So the failure is not a missing
 * spotlight, it is a ring drawn around a control the coach cannot see, with
 * the copy explaining it. Measured, not reasoned: with `#planFold` shut,
 * `#stratseg.getClientRects().length` is 1 while
 * `checkVisibility({ opacityProperty: true, visibilityProperty: true, ... })`
 * is false.
 *
 * A21 turned `Plan` into a fold, which put step 2's anchor inside one. Step 1
 * already carried the fix — a `before` that opens `#squadFold` — so the rule
 * this pins is the one the file was already following: every anchor with a
 * `<details>` ancestor must have that ancestor opened by its own step.
 *
 * Source-read, like `tour-scroll.test.js`: tour.js touches the DOM at import
 * time, and the markup is walked as text the way `note-placement.test.js`
 * does it.
 */

const HTML = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');
const TOUR_SRC = readFileSync(new URL('../app/tour.js', import.meta.url), 'utf8');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/* id -> the ids of the `<details>` elements it is nested inside, outermost
   first. An element that IS a details does not count itself: spotlighting a
   shut fold's own summary row is legitimate. */
function detailsAncestors(src) {
  const map = new Map();
  const stack = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  for (let m; (m = tag.exec(src));) {
    const [, close, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    if (close) { for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].name === name) { stack.length = i; break; } } continue; }
    const id = (attrs.match(/\bid\s*=\s*"([^"]*)"/) || [])[1];
    if (id) map.set(id, stack.filter(e => e.name === 'details').map(e => e.id).filter(Boolean));
    if (!(/\/\s*$/.test(attrs) || VOID.has(name))) stack.push({ name, id });
  }
  return map;
}

/* The step objects, as source text, so a step's `sel` and its `before` can be
   read together. Balanced-brace scan over the `TOUR` array literal. */
function steps(src) {
  const start = src.indexOf('const TOUR = [');
  assert.ok(start > 0, 'tour.js no longer declares `const TOUR = [`');
  const out = [];
  let depth = 0, from = -1;
  for (let i = src.indexOf('[', start); i < src.length; i++) {
    const c = src[i];
    if (c === '{') { if (depth === 0) from = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0) out.push(src.slice(from, i + 1)); }
    else if (c === ']' && depth === 0) break;
  }
  return out;
}

const ancestors = detailsAncestors(HTML);
const TOUR = steps(TOUR_SRC);

/* A step's `sel: [...]` array, as `#id` strings, read from its source text --
   shared by both tests below so the same regex is not kept in step twice. */
function stepSel(s) {
  const m = s.match(/sel:\s*\[[^\]]*\]/);
  return m ? [...m[0].matchAll(/'#([\w-]+)'/g)].map(x => '#' + x[1]) : null;
}

/* #201 item 1, as #275 split step 6: seven steps, in this order, with these titles and these exact
   `sel` lists — the issue's own table (#275, which extends docs/specs/201-tour-refresh.md), not a
   re-read of tour.js, so a step reordered, retitled or repointed at the
   wrong anchor fails here even when nothing else about the markup moved. */
const EXPECTED = [
  { title: 'Who is here tonight', sel: ['#phrasePlayers'] },
  { title: 'How the minutes get shared', sel: ['#phraseStrategy'] },
  { title: 'Rules and lineups', sel: ['#phraseRules'] },
  { title: 'This is the rotation', sel: ['#timeline'] },
  { title: 'Timeline or card', sel: ['#viewSeg'] },
  { title: 'What you use in the gym', sel: ['#abBench', '#gmOpen'] },
  { title: 'Print, share or hand off', sel: ['#shareBtn'] },
];

test('the tour reads as seven steps, titles and sel exactly as the spec says, in order, with anchors that exist in the markup', () => {
  assert.equal(TOUR.length, EXPECTED.length, `seven steps (#275), found ${TOUR.length}`);
  TOUR.forEach((s, i) => {
    const want = EXPECTED[i];
    const titleM = s.match(/title:\s*'((?:\\.|[^'])*)'/);
    assert.ok(titleM, `step ${i + 1} has no \`title:\` literal: ${s.slice(0, 60)}`);
    assert.equal(titleM[1], want.title, `step ${i + 1} title`);
    const sel = stepSel(s);
    assert.ok(sel, `step ${i + 1} has no \`sel:\` array: ${s.slice(0, 60)}`);
    assert.deepEqual(sel, want.sel, `step ${i + 1} sel`);
    assert.doesNotMatch(s, /before:/, `step ${i + 1} carries a \`before\` — #201 says no step has one`);
    for (const id of sel.map(x => x.slice(1))) {
      assert.ok(ancestors.has(id), `tour anchor #${id} is not an id in index.html`);
    }
  });
});

test('a tour anchor inside a fold is opened by its own step', () => {
  for (const s of TOUR) {
    const sel = (stepSel(s) || []).map(x => x.slice(1));
    for (const id of sel) {
      for (const fold of ancestors.get(id) || []) {
        assert.match(s, new RegExp(`#${fold}`),
          `tour anchor #${id} sits inside <details id="${fold}">, which the step never names — ` +
          'a shut fold still reports client rects, so the spotlight lands on a control nobody can see');
        assert.match(s, /\.open\s*=\s*true/,
          `the step anchoring #${id} names #${fold} but never opens it`);
        assert.match(s, /before:/,
          `opening #${fold} has to happen in \`before\`, which runs ahead of the anchor measurement`);
      }
    }
  }
});
