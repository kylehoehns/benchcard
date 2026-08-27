import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* HOVER IS A POINTER AFFORDANCE AND NOTHING THIS SITE SHIPS MAY ASSUME ONE.
 *
 * A finger cannot rest on a control, so a touch browser fakes the state it
 * cannot produce: the tap applies `:hover` and it sticks until something else
 * is tapped. Before this file, app.css carried forty-five hover rules and
 * exactly ONE `@media (hover: hover)` guard, so every tapped button, chip, tab
 * and table row stayed painted as though a mouse were still on it.
 *
 * SCOPE IS THE PAGE LIST, NOT ONE FILE. This guard used to read `app.css` and
 * nothing else, which is exactly why three bare hover rules survived the sweep
 * that wrote it -- `card.css`'s stage lift and the `.jumpto a:hover` in
 * `about.html` and `advanced.html`. A file list would have gone stale the same
 * way, so scope is derived: every `.html` in `app/` (which is everything
 * deployed -- `wrangler.jsonc` names `app` as the assets directory), and for
 * each page every local stylesheet it links plus its own inline `<style>`
 * blocks. A new page, a new sheet, or a new inline block is covered the moment
 * it is linked; nobody has to remember this file. The same shape as
 * `test/tap-action.test.js` and `css-collide.test.js`, which are the other two
 * guards that have to know which sheets meet on which page.
 *
 * WHY THIS IS STRUCTURAL AND NOT `css.includes`. This tree has already been
 * bitten twice by text checks over CSS: a comment that closed early once
 * swallowed a whole rule while `npm test` stayed green (see the delimiter guard
 * in first-paint.test.js), and `test/tap-action.test.js` had to walk braces for
 * the same reason. `css.includes('@media (hover: hover)')` proves the string is
 * in the file; it cannot tell you which rules are actually inside one. So this
 * walks each sheet, tracks the at-rule stack, and asks of each rule which
 * ancestors it has -- which is the question the cascade asks.
 *
 * The two exemptions below are the point of the file as much as the rule is:
 * `:focus-visible` is the keyboard affordance and `:active` is the touch one,
 * and a hover guard that swallowed either would be a regression wearing the
 * costume of a fix. Where a selector list pairs them, split it and leave the
 * non-hover half outside the guard.
 *
 * A wrap is IN PLACE. A media block changes nothing about specificity, so
 * source order is the whole cascade -- `.btn:hover` sits above `.btn.primary`
 * on purpose. */

const ROOT = new URL('../app/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

/* Every stylesheet every page loads, deduplicated by name: linked local sheets
 * in document order, then the page's own inline blocks as `inline:<page>`. */
const SHEETS = (() => {
  const out = new Map();
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\.\/([\w.-]+\.css)"/g)) {
      if (!out.has(m[1])) out.set(m[1], read(m[1]));
    }
    const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    if (inline.trim()) out.set(`inline:${page}`, inline);
  }
  return out;
})();

/* Every style rule in a sheet, with the at-rule preludes it sits inside.
 * Comments come out first -- a selector quoted in prose is not a selector, and
 * these sheets are more comment than rule in places. */
function rulesOf(name, css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      if (prelude.startsWith('@')) stack.push({ at: prelude, rule: false });
      else { stack.push({ at: prelude, rule: true }); out.push({ sheet: name, sel: prelude, at: stack.filter((f) => !f.rule).map((f) => f.at) }); }
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';') buf = '';
    else buf += ch;
  }
  assert.equal(stack.length, 0, `${name} does not balance its braces; every check below is reading rubble`);
  return out;
}

const RULES = [...SHEETS].flatMap(([name, css]) => rulesOf(name, css));
const guarded = (r) => r.at.some((a) => /\(\s*hover\s*:\s*hover\s*\)/.test(a));
const where = (rs) => rs.map((r) => `${r.sheet}  ${r.sel}`);

/* The scope itself is the thing that failed last time, so it is asserted like
 * any other behaviour. Named sheets are the ones a hover rule has actually
 * arrived in; if the walker stops reaching one of them the count goes to zero
 * and the hover test below passes for the wrong reason. */
test('the guard reaches every sheet the site ships', () => {
  assert.ok(PAGES.length >= 9,
    `only ${PAGES.length} pages found in app/; the page list is the scope of this guard and it is empty or short`);
  for (const page of PAGES) {
    assert.ok([...SHEETS.keys()].some((n) => n === `inline:${page}` || read(page).includes(`href="./${n}"`)),
      `${page} contributes no stylesheet at all -- either it is unstyled or the link/style scan missed it`);
  }
  for (const name of ['app.css', 'card.css', 'tokens.css', 'inline:about.html', 'inline:advanced.html']) {
    assert.ok(SHEETS.has(name), `${name} is no longer being scanned by the hover guard`);
    assert.ok(RULES.some((r) => r.sheet === name), `${name} parsed to zero rules; the walker is not reading it`);
  }
});

test('every :hover rule the site ships is behind @media (hover: hover)', () => {
  const hovers = RULES.filter((r) => r.sel.includes(':hover'));
  assert.ok(hovers.length >= 45,
    `only ${hovers.length} hover rules were found across the site; the walker is wrong, not the sheets`);
  for (const name of ['card.css', 'inline:about.html', 'inline:advanced.html']) {
    assert.ok(hovers.some((r) => r.sheet === name),
      `${name} contributed no hover rule; it carried one when this guard was widened, so either it was `
      + 'deleted (fine, drop it from this list) or the sheet is not being walked (not fine)');
  }
  const bare = hovers.filter((r) => !guarded(r));
  assert.deepEqual(where(bare), [],
    `these hover rules fire on a tap, because a touch browser fakes :hover and the state sticks:\n  `
    + `${where(bare).join('\n  ')}\nWrap each in @media (hover: hover), IN PLACE -- moving one changes the cascade.`);
});

test('the keyboard affordance never sits behind the hover guard', () => {
  const focus = RULES.filter((r) => r.sel.includes(':focus-visible'));
  assert.ok(focus.length >= 8,
    `only ${focus.length} :focus-visible rules across the site; the keyboard affordances have been lost, `
    + 'most likely to a selector list that was wrapped whole instead of split');
  const swallowed = focus.filter(guarded);
  assert.deepEqual(where(swallowed), [],
    `these focus affordances only apply where there is a pointer, which is nowhere a keyboard user `
    + `needs them:\n  ${where(swallowed).join('\n  ')}\nSplit the selector list: the :hover half is guarded, `
    + 'the :focus-visible half is not.');
});

test('the touch affordance never sits behind the hover guard', () => {
  const active = RULES.filter((r) => r.sel.includes(':active'));
  assert.ok(active.length >= 4,
    `only ${active.length} :active rules across the site; the press feedback is what a phone has INSTEAD `
    + 'of hover, so it cannot be the thing that goes');
  const swallowed = active.filter(guarded);
  assert.deepEqual(where(swallowed), [],
    `:active is the touch affordance and these are behind a pointer query:\n  ${where(swallowed).join('\n  ')}`);
  assert.ok(active.some((r) => r.sel === '.press:active'),
    '`.press:active` is gone -- it is the scale-down every control in the app shares on a tap');
});
