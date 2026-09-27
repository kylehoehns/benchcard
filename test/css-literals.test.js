import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './js-comments.js';

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
 * not a violation; the reason is what the test looks for on a REAL line.
 *
 * Comments are blanked with test/js-comments.js's `stripComments` rather than
 * a second hand-rolled blanker (review finding 1 on #152) -- it pads every
 * non-newline character of a `/* *\/` comment with a space, so no line
 * number shifts, matching test/dead-var.test.js's own approach. `stripComments`
 * is JS-oriented: it also treats a bare `//` as a line comment and reads
 * `"…"`/`'…'`/`` `…` `` as opaque string bodies, none of which app.css has any
 * of -- checked directly: zero `//` and zero backtick anywhere in app.css
 * outside a comment, so a `url(//…)` or `https://` literal can never trip
 * its line-comment handling here. If either is ever added to app.css this
 * check would need re-verifying before trusting stripComments on it. */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const HEX = /#[0-9a-fA-F]{3,8}\b/d;
const RGB = /\brgba?\([^)]*\)/d;
const ZINDEX = /z-index\s*:\s*(-?\d+)\b/d;
const RADIUS = /border-radius\s*:\s*[^;{}]*?(\d*\.?\d+)px/d;

/* A real reason is a sentence fragment on the SAME physical line as the
 * literal, not any trailing comment (review finding 2): `color: #ABCDEF;
 * /* x *\/` must not pass just because something follows the semicolon.
 * Every existing reason comment in app.css is a complete, closed `/* … *\/`
 * on one line and at least 3 words -- checked directly across all 69 of
 * them -- so "at least 3 words, and not just a token like TODO/x/fixme" is
 * the rule: every one of them passes it, and a token comment does not. */
const INLINE_COMMENT = /\/\*(.*?)\*\//;
function realReason(rawLine) {
  const m = rawLine.match(INLINE_COMMENT);
  if (!m) return false;
  const text = m[1].trim();
  if (/^(todo|fixme|x)$/i.test(text)) return false;
  return text.split(/\s+/).filter(Boolean).length >= 3;
}

/* Maps a character offset in `text` to its 0-based line number, so a match
 * found in a whole DECLARATION's text (below) can still be reported, and
 * reasoned about, against the physical line it actually sits on. */
function lineIndexer(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
}

/* Declarations, not physical lines (review finding 2): a rule split as
 * `border-radius:\n  6px;` has no line containing the whole thing, so a
 * per-line regex never sees it. Splitting the comment-blanked text on `;`,
 * `{` and `}` reassembles each declaration regardless of how its source
 * wraps, while keeping each piece's start offset so the violation can still
 * be pinned to a real line afterwards. */
function declarations(codeText) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < codeText.length; i++) {
    const c = codeText[i];
    if (c === ';' || c === '{' || c === '}') {
      parts.push({ text: codeText.slice(start, i), start });
      start = i + 1;
    }
  }
  parts.push({ text: codeText.slice(start), start });
  return parts;
}

/* One violations array per call, so the real file and a mutated copy run
 * through the exact same logic (used by the positive control below). */
function findViolations(css) {
  const rawLines = css.split('\n');
  const codeText = stripComments(css);
  const toLine = lineIndexer(codeText);
  const violations = [];
  for (const { text, start } of declarations(codeText)) {
    const zi = text.match(ZINDEX);
    if (zi && Number(zi[1]) > 5) {
      const lineNo = toLine(start + zi.indices[1][0]);
      violations.push(`line ${lineNo + 1}: z-index: ${zi[1]} is not a token — ${rawLines[lineNo].trim()}`);
    }
    const hex = text.match(HEX);
    if (hex) {
      const lineNo = toLine(start + hex.indices[0][0]);
      if (!realReason(rawLines[lineNo])) {
        violations.push(`line ${lineNo + 1}: color literal ${hex[0]} has no reason comment — ${rawLines[lineNo].trim()}`);
      }
    }
    const rgb = text.match(RGB);
    if (rgb) {
      const lineNo = toLine(start + rgb.indices[0][0]);
      if (!realReason(rawLines[lineNo])) {
        violations.push(`line ${lineNo + 1}: color literal ${rgb[0]} has no reason comment — ${rawLines[lineNo].trim()}`);
      }
    }
    const radius = text.match(RADIUS);
    if (radius) {
      const lineNo = toLine(start + radius.indices[1][0]);
      if (!realReason(rawLines[lineNo])) {
        violations.push(`line ${lineNo + 1}: border-radius: ${radius[1]}px has no reason comment — ${rawLines[lineNo].trim()}`);
      }
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

test('a token comment is not a real reason', () => {
  /* #152 review finding 2: `color: #ABCDEF; /* x *\/` must not pass just
   * because SOMETHING follows the semicolon on the line -- a real reason is
   * a sentence fragment, not a token. Planted, never written to disk. */
  const real = read('app/app.css');
  const planted = real + '\n'
    + '.css-literals-test-plant { color: #ABCDEF; /* x */ }\n';
  const violations = findViolations(planted);
  assert.ok(violations.some((v) => v.includes('#ABCDEF')),
    'a one-word comment ("x") should not excuse a color literal');
});

test('a declaration split across lines is still seen', () => {
  /* #152 review finding 2: a line-based scan never sees `border-radius`
   * and its `6px` value when they are on different physical lines. Scanning
   * whole declarations (split on `;`/`{`/`}`) catches it. Planted, never
   * written to disk. */
  const real = read('app/app.css');
  const planted = real + '\n'
    + '.css-literals-test-plant {\n  border-radius:\n  6px;\n}\n';
  const violations = findViolations(planted);
  assert.ok(violations.some((v) => v.includes('border-radius: 6px')),
    'a border-radius split across two lines with no reason should still be caught');
});
