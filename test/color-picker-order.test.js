import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLORS } from '../app/storage.js';

/* #205 item 2: the picker's own markup must list the nine colors in the same
 * order `COLORS` does (Hardwood first, Graphite second, then the other
 * seven) -- there is no second place the order lives, so this reads the
 * `#colorOpts` block in app/index.html and holds it to `COLORS` rather than
 * to a second, hand-typed list. A guard, per /new-guard: it reads source, not
 * behavior through a seam.
 */
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

test('#colorOpts lists every color button in COLORS order', () => {
  const opts = html.match(/<div class="color-opts" id="colorOpts"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(opts, 'app/index.html must carry a #colorOpts block');
  const found = [...opts[0].matchAll(/class="color-opt"[^>]*data-color="([a-z]+)"/g)].map(m => m[1]);
  // 2a: a check that measured nothing fails. Assert the count found before
  // comparing order, so a selector that silently stops matching (a class
  // rename, a moved block) cannot read as "the order is fine".
  assert.equal(found.length, 9, `expected 9 .color-opt buttons, found ${found.length}`);
  assert.deepEqual(found, COLORS,
    `#colorOpts lists ${JSON.stringify(found)}; COLORS is ${JSON.stringify(COLORS)}`);
});
