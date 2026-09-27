import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* #152 item 5: every z-index, border-radius and color literal in app.css
 * uses a token, or carries a one-line reason. Three kinds of literal, one
 * rule each:
 *   - a bare `z-index` number above 5 must be a token (`var(--z-…)`) --
 *     there is no "reason" that excuses skipping the token once a layer
 *     needs a name; -1, 1, 2 and 5 inside a component's own stacking
 *     context may stay literal, but only with a reason on the line;
 *   - a hex or rgb()/rgba() color literal must carry a reason on the line
 *     it appears on, if it is not a token;
 *   - a `border-radius` px literal must carry a reason on the line it
 *     appears on, if it is not a token (`border-radius: 50%`, `0` and
 *     `inherit` are shapes, not radii on the scale, and are not literals
 *     this test is about).
 * "Outside comments" (the spec's own words) means a mention inside a prose
 * comment -- `z-index: 50` inside a sentence explaining `.bar`, say -- is
 * not a violation; the reason is what the test looks for on a REAL line,
 * so comments are blanked first without shifting any line number, matching
 * test/dead-var.test.js's own approach. */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const blankComments = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB = /\brgba?\([^)]*\)/;
const ZINDEX = /z-index\s*:\s*(-?\d+)\b/;
const RADIUS = /border-radius\s*:\s*[^;{}]*?(\d*\.?\d+)px/;

/* One violations array per call, so the real file and a mutated copy run
 * through the exact same logic (used by the positive control below). */
function findViolations(css) {
  const rawLines = css.split('\n');
  const codeLines = blankComments(css).split('\n');
  const violations = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const code = codeLines[i];
    const hasComment = raw !== code;
    const zi = code.match(ZINDEX);
    if (zi && Number(zi[1]) > 5) {
      violations.push(`line ${i + 1}: z-index: ${zi[1]} is not a token — ${raw.trim()}`);
    }
    const hex = code.match(HEX);
    if (hex && !hasComment) {
      violations.push(`line ${i + 1}: color literal ${hex[0]} has no reason comment — ${raw.trim()}`);
    }
    const rgb = code.match(RGB);
    if (rgb && !hasComment) {
      violations.push(`line ${i + 1}: color literal ${rgb[0]} has no reason comment — ${raw.trim()}`);
    }
    const radius = code.match(RADIUS);
    if (radius && !hasComment) {
      violations.push(`line ${i + 1}: border-radius: ${radius[1]}px has no reason comment — ${raw.trim()}`);
    }
  }
  return violations;
}

test('every z-index, border-radius and color literal in app.css is a token or carries a reason', () => {
  const violations = findViolations(read('app/app.css'));
  assert.deepEqual(violations, [], violations.join('\n  '));
});

test('the scan can see a planted violation of each of the three kinds', () => {
  /* A check that cannot fail measures nothing (/new-guard rule 2a). Plant
   * one of each kind into an in-memory copy -- a hex with no reason, an
   * un-tokened z-index above 5, and a border-radius px with no reason --
   * and prove the same scan that just passed on the real file catches all
   * three. Never written to disk. */
  const real = read('app/app.css');
  const planted = real + '\n'
    + '.css-literals-test-plant { color: #ABCDEF; z-index: 400; border-radius: 6px; }\n';
  const violations = findViolations(planted);
  assert.ok(violations.some((v) => v.includes('#ABCDEF')),
    'did not catch the planted hex color');
  assert.ok(violations.some((v) => v.includes('z-index: 400')),
    'did not catch the planted z-index');
  assert.ok(violations.some((v) => v.includes('border-radius: 6px')),
    'did not catch the planted border-radius');
});
