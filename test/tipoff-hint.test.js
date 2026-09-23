import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { thisGameBox } from './markup.js';

/* #118: the Tip-off hint, spec docs/specs/118-tipoff-hint.md.
 *
 * `#when` is a native `type="time"` input, which cannot show a placeholder --
 * so, unlike `#dayName` (#112), there is no `renderSetup`-painted seam here.
 * The hint text is static and, per the spec's "one answer lives in one
 * place" constraint, lives in the markup only. That leaves one seam, named
 * in the spec's Proof table: `app/index.html` read with `element()` from
 * test/markup.js -- depth-balanced tag walking, never a line-by-line phrase
 * search, since this repo hard-wraps prose (test/day-name-field.test.js and
 * test/this-game.test.js do the same).
 *
 * A new file rather than a new case in test/day-name-field.test.js: that
 * file's own seam is the day-name field specifically -- half of it drives
 * `renderSetup` against a hand-built DOM, which this field has no version of
 * -- so folding Tip-off cases in would answer a different field's question
 * under the wrong file's name. */

const { box } = thisGameBox();

test('#whenHint is a .note right after #when, reading exactly the spec\'s copy', () => {
  const m = box.match(/<input[^>]*\bid="when"[^>]*>\s*<p class="note" id="whenHint">([^<]*)<\/p>/);
  assert.ok(m, '#whenHint is not a `.note` immediately after #when in the "This game" box');
  assert.equal(m[1], "Optional. Sets the order of the day's games.");
});

test('#when points at its hint with aria-describedby, and the hint exists', () => {
  const inputM = box.match(/<input[^>]*\bid="when"[^>]*>/);
  assert.ok(inputM, '#when input not found in the "This game" box');
  const described = inputM[0].match(/aria-describedby="([^"]+)"/);
  assert.ok(described, '#when has no aria-describedby');
  assert.ok(box.includes(`id="${described[1]}"`),
    `aria-describedby points at #${described[1]}, which is not in the "This game" box`);
});

test('the label for #when still reads "Tip-off"', () => {
  const m = box.match(/<label class="f" for="when">([^<]*)<\/label>/);
  assert.ok(m, '#when lost its <label class="f" for="when">');
  assert.equal(m[1], 'Tip-off');
});

/* Constraint 3, named as a guard in the spec's own Proof table: the hint
 * text lives in the markup only, so no script may name `whenHint` -- the
 * same shape #112's `renderSetup` seam would need if a future change ever
 * made this hint dynamic, but until then there is nothing to paint and
 * nothing should try. `app/*.js`, not a recursive walk: `app/vendor/` is
 * third-party code untouched by this change (analytics.test.js's privacy
 * scan draws the same line for the same reason). */
test('no script in app/ writes #whenHint -- the hint text lives in the markup only', () => {
  const dir = new URL('../app/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 30, `only ${files.length} JS files found in app/ -- the scan is looking in the wrong place`);
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!src.includes('whenHint'),
      `app/${f} names whenHint -- the hint text must live only in app/index.html, not be painted by script`);
  }
});
