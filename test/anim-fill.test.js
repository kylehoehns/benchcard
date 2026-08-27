import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* An element that ships `hidden` must not animate with a backwards fill.
 *
 * THE BUG THIS EXISTS FOR. `.wel-setup` is the first-run setup pane; it ships
 * `hidden` and carried `animation: rise ... both`. `rise` starts at
 * `opacity: 0`, and an animation does not run on a `display: none` element, so
 * the fill pinned the pane at the FROM state. Whether it ever escapes depends
 * on the engine restarting the animation when `hidden` comes off: Chrome does,
 * WebKit did not. On an iPhone, tapping either door on the welcome screen hid
 * the landing pane and revealed a pane stuck at opacity 0 -- a blank black
 * screen, in a private tab, so no cache was involved. Every browser check in
 * this repo runs Chrome, which is exactly why nothing caught it.
 *
 * The rule is one-directional and cheap: `forwards` is fine (it holds the TO
 * state, which is the visible one), `both` and `backwards` are not, because
 * both of them apply the FROM state before the animation runs.
 *
 * WHAT IS PROVEN AND WHAT IS NOT. That the fill applies the FROM state, and
 * that an animation does not run on a `display: none` element, are the spec.
 * That WebKit specifically fails to restart it is the best explanation for the
 * report and NOTHING HERE HAS WATCHED IT HAPPEN: there is no WebKit on this
 * machine and no simulator, and every browser check in this repo drives Chrome,
 * which restarts the animation and is green either way.
 *
 * FIVE RULES CARRIED THIS SHAPE when the test was written -- `.view`, `.gm`,
 * `.actionbar`, `.keyswrap` and `.tour` -- and `.view` is the one that matters
 * most, because every `<main class="view">` in the app ships `hidden`. Every
 * entrance keyframe involved ends at the element's natural state
 * (`opacity: 1; transform: none`), so the forwards half of `both` was buying
 * nothing at all and only the backwards half had any effect. They were all
 * defilled in the same change: behaviour-preserving where the animation plays,
 * failure-proof where it does not. The allowance is therefore ZERO. */

const ROOT = new URL('../app/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

/** Classes on elements that ship with a bare `hidden` attribute. */
function hiddenClasses(html) {
  const out = new Set();
  for (const tag of html.match(/<[a-z][^>]*>/g) || []) {
    if (!/\shidden(?=[\s/>])/.test(tag)) continue;
    const cls = tag.match(/\sclass="([^"]*)"/);
    if (cls) for (const c of cls[1].trim().split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

/** Rules whose `animation` shorthand carries a backwards-filling mode. */
function backwardsFilled(css) {
  const out = [];
  // declarations only, so a class named in a comment is not a hit
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of bare.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, sel, body] = m;
    const anim = body.match(/(?:^|;)\s*animation\s*:([^;]*)/);
    if (!anim) continue;
    if (!/\b(both|backwards)\b/.test(anim[1])) continue;
    out.push([sel.trim().replace(/\s+/g, ' '), anim[1].trim()]);
  }
  return out;
}

test('nothing that ships hidden animates with a backwards fill', () => {
  const html = read('index.html');
  const hidden = hiddenClasses(html);
  assert.ok(hidden.size > 3, `only ${hidden.size} classes ship hidden; the markup scan broke`);

  const hits = [];
  for (const sheet of ['tokens.css', 'app.css', 'card.css']) {
    for (const [sel, anim] of backwardsFilled(read(sheet))) {
      for (const cls of hidden) {
        // the class as its own simple selector, not a substring of a longer one
        const re = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?![\\w-])`);
        // `.x[hidden]` rules are the ones DOING the hiding; they are not the bug
        if (re.test(sel) && !/\[hidden\]/.test(sel)) hits.push(`${sheet}: ${sel} { animation:${anim} }`);
      }
    }
  }
  assert.deepEqual(hits, [],
    'an element that ships `hidden` animates with `both`/`backwards`. The fill applies the FROM '
    + 'state (invisible or off-screen) before the animation runs, and an animation does not run '
    + 'on a display:none element -- so the element can stay stuck there when `hidden` comes off, '
    + 'which is a blank screen with no way back. Every entrance keyframe here ends at the natural '
    + 'state, so the fill buys nothing: drop it, or use `forwards` if you genuinely need the end '
    + 'state held.');
});

test('the guard would catch the rule it was written for', () => {
  // the exact shape that shipped, proven to be caught rather than assumed to be
  const css = '.wel-setup { width: 100%; animation: rise var(--t) var(--ease) both; }';
  const found = backwardsFilled(css);
  assert.equal(found.length, 1, 'the CSS scan no longer sees a `both` fill');
  assert.match(found[0][0], /\.wel-setup/);
  // ...and leaves the fill-less version alone
  assert.deepEqual(backwardsFilled('.wel-setup { animation: rise var(--t) var(--ease); }'), []);
  // ...and `forwards`, which holds the visible end state
  assert.deepEqual(backwardsFilled('.x { animation: rise 1s forwards; }'), []);
  // ...and does not read a class out of a comment
  assert.deepEqual(backwardsFilled('/* .wel-setup { animation: rise 1s both } */ .y { color: red }'), []);
});

/* The two first-run panes are SIBLINGS, and nothing but the DOM can say so.
 *
 * A52 shipped with `#welSetup` nested INSIDE `#welLanding`, so `pane(true)`
 * hid the landing pane and took the setup pane down with it: both doors led to
 * a blank screen, in Chrome, with an empty console. It survived because the
 * check that was run was a TAG COUNT -- 19 `<div` against 19 `</div>` in the
 * view -- and a balanced count says nothing at all about nesting. One `</div>`
 * had gone missing in an unrelated edit to the footer below it.
 *
 * This parses the markup rather than counting it: walk the view, keep a stack,
 * and assert the two panes come out at the same depth under `.wel-in`. It is
 * the cheap half of what a browser would tell you, and it runs in `node --test`
 * where a browser does not.
 */
test('the landing and setup panes are siblings, not one inside the other', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const view = html.slice(html.indexOf('id="view-welcome"'), html.indexOf('id="view-team"'))
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'path', 'circle', 'source', 'use']);
  const stack = [];
  const depth = {};
  for (const m of view.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const [, close, tag, attrs] = m;
    if (close) { stack.pop(); continue; }
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (id === 'welLanding' || id === 'welSetup') depth[id] = stack.slice();
    if (!VOID.has(tag.toLowerCase()) && !/\/\s*$/.test(attrs)) stack.push(tag.toLowerCase());
  }
  assert.ok(depth.welLanding, '#welLanding is gone from the welcome view');
  assert.ok(depth.welSetup, '#welSetup is gone from the welcome view');
  assert.equal(depth.welSetup.length, depth.welLanding.length,
    `#welSetup sits ${depth.welSetup.length - depth.welLanding.length} level(s) deeper than #welLanding. `
    + 'They must be siblings: hiding one pane to show the other cannot work if one contains the other, '
    + 'and the result is a blank screen with no error.');
  assert.deepEqual(depth.welSetup, depth.welLanding,
    'the two first-run panes no longer share a parent');
});
