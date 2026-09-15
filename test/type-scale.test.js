import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* #24: the app's text follows the phone's text size. This is a SOURCE guard,
   built under /new-guard -- it reads tokens.css, app.css and index.html and
   judges what is written there, the same way test/big-text.test.js already
   does for the em/px breakpoint ordering. It does not run the app; the
   typescale smoke row (scripts/smoke.mjs --only "type scale: 7 sizes, 4
   weights") is what proves the computed result in a browser.

   Comments are stripped before every scan below, the same way
   test/dead-var.test.js and test/big-text.test.js already do it, so a
   `font-size: .7rem` written in an explanatory comment can never satisfy or
   break an assertion about real declarations. */

const ROOT = new URL('../app/', import.meta.url);
const readApp = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const stripCss = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripHtml = (src) => src.replace(/<!--[\s\S]*?-->/g, ' ');

const tokens = stripCss(readApp('tokens.css'));
const app = stripCss(readApp('app.css'));
const index = stripHtml(readApp('index.html'));

/* ---- 1: the scale, exactly (decision 3's table) ---- */

const SCALE = {
  '--fs-large': '2.125rem',
  '--fs-sentence': '1.5625rem',
  '--fs-title': '1.375rem',
  '--fs-headline': '1.0625rem',
  '--fs-body': '1rem',
  '--fs-secondary': '.875rem',
  '--fs-footnote': '.8125rem',
};

test('tokens.css declares exactly the seven --fs-* tokens, at their spec values', () => {
  const declared = new Map();
  for (const m of tokens.matchAll(/(--fs-[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
    declared.set(m[1], m[2].trim());
  }
  const names = [...declared.keys()].sort();
  assert.deepEqual(names, Object.keys(SCALE).sort(),
    `tokens.css must declare exactly the seven --fs-* tokens and no other, got: ${names.join(', ')}`);
  for (const [name, value] of Object.entries(SCALE)) {
    assert.equal(declared.get(name), value, `${name} must be ${value}, got ${declared.get(name)}`);
  }
});

/* ---- 2: the root rule, gated on iOS/iPadOS, and the text-scale meta ---- */

test('the -apple-system-body rule exists exactly once, gated on -webkit-touch-callout', () => {
  const hits = (app.match(/-apple-system-body/g) || []).length;
  assert.equal(hits, 1, `expected exactly one -apple-system-body rule, found ${hits}`);
  assert.ok(
    app.includes('@supports (-webkit-touch-callout: none) {\n  html { font: -apple-system-body; }\n}'),
    'the -apple-system-body rule must be exactly `html { font: -apple-system-body; }` ' +
      'inside `@supports (-webkit-touch-callout: none) { ... }` -- an ungated rule would apply ' +
      'to every WebKit, including a Mac, where it computes to 13px'
  );
});

test('body still sets its own font-family and line-height, next to the gated root rule', () => {
  // The @supports shorthand also resets family and line-height on <html>;
  // `body` has to keep declaring both or a 32px-root gym coach loses the app's
  // own type on iOS.
  assert.match(app, /body\s*{[^}]*font-family:\s*var\(--font\)/s, 'body must keep font-family: var(--font)');
  assert.match(app, /body\s*{[^}]*line-height:\s*[\d.]/s, 'body must keep its own line-height');
});

test('index.html carries the text-scale meta', () => {
  assert.match(index, /<meta\s+name="text-scale"\s+content="scale">/,
    'index.html must have <meta name="text-scale" content="scale"> in <head>');
});

/* ---- 3: every font-size and font-weight is on the scale ---- */

/* The one place a step may be capped rather than named outright: a large
   title, and only inside the existing 19em big-text block (decision 4). */
const BIG_AT = app.indexOf('@media (max-width: 19em)');
const BIG_END = app.indexOf('\n}', BIG_AT);
assert.ok(BIG_AT > -1 && BIG_END > BIG_AT, 'the 19em big-text block is gone from app.css');

const FS_TOKEN = /^var\(--fs-[a-z]+\)$/;
const FS_CAP = /^min\(var\(--fs-large\),\s*[\d.]+vw\)$/;

function checkFontSizes(src, label, allowCap) {
  const offenders = [];
  for (const m of src.matchAll(/font-size:\s*([^;]+);/g)) {
    const val = m[1].trim();
    const insideBig = allowCap && m.index >= BIG_AT && m.index < BIG_END;
    if (val === 'inherit' || FS_TOKEN.test(val)) continue;
    if (insideBig && FS_CAP.test(val)) continue;
    offenders.push(val);
  }
  assert.deepEqual(offenders, [],
    `${label}: every font-size must be var(--fs-*), inherit, or (inside the 19em block, ` +
      `on a large title) min(var(--fs-large), <n>vw). Non-token value(s): ${offenders.join(', ')}`);
}

test('every font-size in app.css is on the scale', () => {
  checkFontSizes(app, 'app.css', true);
});

/* Both index.html style-attribute checks below scan the same way: every
   `style="…"` attribute, every occurrence of one property inside it. A
   style attribute's last declaration ends at the closing quote, not a
   semicolon, so the semicolon is optional here (unlike `checkFontSizes` /
   `checkFontWeights` above, which read whole stylesheet rules). */
function styleAttrValues(html, prop) {
  const re = new RegExp(`${prop}:\\s*([^;"]+);?`, 'g');
  const values = [];
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    for (const fm of m[1].matchAll(re)) values.push(fm[1].trim());
  }
  return values;
}

test('every font-size in an index.html style attribute is on the scale', () => {
  const offenders = styleAttrValues(index, 'font-size')
    .filter(val => val !== 'inherit' && !FS_TOKEN.test(val));
  assert.deepEqual(offenders, [],
    `index.html inline styles must not size text directly: ${offenders.join(', ')}`);
});

const FW_OK = new Set(['400', '500', '600', '700', 'inherit']);

function checkFontWeights(src, label) {
  const offenders = [];
  for (const m of src.matchAll(/font-weight:\s*([^;]+);/g)) {
    const val = m[1].trim();
    if (!FW_OK.has(val)) offenders.push(val);
  }
  assert.deepEqual(offenders, [],
    `${label}: every font-weight must be 400, 500, 600, 700 or inherit. Off-scale value(s): ${offenders.join(', ')}`);
}

test('every font-weight in app.css is 400, 500, 600, 700 or inherit', () => {
  checkFontWeights(app, 'app.css');
});

test('every font-weight in an index.html style attribute is 400, 500, 600, 700 or inherit', () => {
  const offenders = styleAttrValues(index, 'font-weight').filter(val => !FW_OK.has(val));
  assert.deepEqual(offenders, [], `index.html inline styles have an off-scale font-weight: ${offenders.join(', ')}`);
});
