import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The tag-walking helper this-game.test.js and day-name-field.test.js both
 * need to pull one element's markup out of app/index.html as source text --
 * no DOM, so it holds for every state rather than the one a rendered check
 * happened to be given. A lazy `</div>`-stops-here regex would report a
 * subtree that ends before the thing being looked for, since these boxes
 * nest divs; this counts depth instead. Shared here rather than copied a
 * second time -- day-name-field.test.js (#112) had grown a byte-for-byte
 * copy of this-game.test.js's own.
 *
 * A plain file straight in test/, not test/helpers/: see
 * test/state-fixture.js's own comment on why a subdirectory is not safe for
 * a module that only exports -- `node --test`'s glob would otherwise run it
 * as its own (empty) suite. test/note-placement.test.js and
 * test/tour-anchors.test.js keep their own VOID and walker: each counts
 * depth for a different question (a loose note, an anchor's ancestry) and
 * neither is this function with different variable names. */

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

// The source of the element whose opening tag contains `needle`, from `<` to
// its matching close.
export function element(src, needle) {
  const start = src.lastIndexOf('<', src.indexOf(needle));
  assert.ok(start > 0, `${needle} is not in index.html`);
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m; (m = tag.exec(src));) {
    const [, close, name, attrs] = m;
    if (close) { if (--depth === 0) return src.slice(start, tag.lastIndex); continue; }
    if (!(/\/\s*$/.test(attrs) || VOID.has(name.toLowerCase()))) depth++;
  }
  assert.fail(`unbalanced markup around ${needle}`);
}

// app/index.html, comments stripped, plus the "This game" box (Date, Opponent,
// Day name, Tip-off, Remove) pulled out with `element()`. this-game.test.js,
// day-name-field.test.js and tipoff-hint.test.js all start from
// this same box; shared here rather than each reading and re-slicing
// index.html itself, the way this file's own header describes for VOID and
// `element()`.
export function thisGameBox() {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
  return { html, box: element(html, 'class="side-box noprint s-thisgame"') };
}
