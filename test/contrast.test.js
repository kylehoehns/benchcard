import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* #21 (Graphite look), item 6: every colour token in app/tokens.css against
 * WCAG 2.2's own contrast formula, on every ground it can land on.
 *
 * FOUR RESOLVED THEMES, not two. `prefers-contrast: more` layers OVER its own
 * base theme rather than replacing it -- `[data-theme="dark"]` and `:root`
 * both match the same root element at equal specificity, so a property the
 * dark block never redeclares still resolves to the light value, and the same
 * is true one level up for the two more-contrast selectors. Resolve them the
 * way the cascade actually does: light = the :root block; dark = light with
 * the dark block's own declarations laid over it; light+more / dark+more =
 * light/dark with their own more-contrast block laid over THAT.
 *
 * THE SELECTOR TRAP IS PART OF WHAT THIS FILE GUARDS. tokens.css's own
 * comment says a bare `:root` for the dark arm of the more-contrast block
 * would tie with `[data-theme="dark"]` at equal specificity and lose on
 * source order, painting the light values onto a dark phone. So the two
 * blocks inside the media query are found BY THEIR EXACT SELECTOR TEXT, not
 * by position -- swap `:root[data-theme="dark"]` for a bare `:root` and this
 * file no longer finds a dark-more block at all, which fails loudly rather
 * than silently reading the wrong one.
 *
 * A TOKEN THAT CANNOT BE PARSED FAILS THE TEST, IT IS NEVER SKIPPED: `colorOf`
 * below throws on a missing or unrecognised value, and nothing here catches
 * that throw -- it surfaces as a failing test, the same as a ratio under
 * floor. */

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* A minimal CSS block splitter that tracks brace depth, so the single
 * `@media (prefers-contrast: more) { ... }` block comes back as ONE entry
 * (selector `@media (prefers-contrast: more)`) whose own body can be split
 * again for its two nested selectors -- the same two-pass shape
 * `test/dead-var.test.js` notes is required once tokens.css holds a nested
 * block. */
function splitBlocks(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) break;
    const selector = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (depth > 0 && j < src.length) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    out.push({ selector, body: src.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

const DECL = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
const declsOf = (body) => {
  const out = {};
  for (const m of body.matchAll(DECL)) out[m[1]] = m[2].trim();
  return out;
};

const tokensCss = strip(read('app/tokens.css'));
const topBlocks = splitBlocks(tokensCss);

const rootBlock = topBlocks.find((b) => b.selector === ':root');
const darkBlock = topBlocks.find((b) => b.selector === '[data-theme="dark"]');
const moreBlock = topBlocks.find((b) => b.selector.includes('prefers-contrast'));
assert.ok(rootBlock, 'app/tokens.css has no bare :root block any more');
assert.ok(darkBlock, 'app/tokens.css has no [data-theme="dark"] block any more');
assert.ok(moreBlock, 'app/tokens.css has no @media (prefers-contrast: more) block any more');

const nested = splitBlocks(moreBlock.body);
const lightMoreBlock = nested.find((b) => b.selector === ':root:not([data-theme="dark"])');
const darkMoreBlock = nested.find((b) => b.selector === ':root[data-theme="dark"]');

test('the more-contrast block keeps the two selectors that survive equal specificity', () => {
  assert.equal(nested.length, 2,
    `@media (prefers-contrast: more) holds ${nested.length} selector block(s), want exactly 2`);
  assert.ok(lightMoreBlock,
    'no block is selected on ":root:not([data-theme=\\"dark\\"])" -- found: '
    + nested.map((b) => b.selector).join(', '));
  assert.ok(darkMoreBlock,
    'no block is selected on ":root[data-theme=\\"dark\\"]" -- a bare `:root` here ties with '
    + '[data-theme="dark"] at equal specificity and loses on source order, painting light values '
    + 'onto a dark phone. found: ' + nested.map((b) => b.selector).join(', '));
});

const light = declsOf(rootBlock.body);
const darkOwn = declsOf(darkBlock.body);
const dark = { ...light, ...darkOwn };
const lightMoreOwn = lightMoreBlock ? declsOf(lightMoreBlock.body) : {};
const darkMoreOwn = darkMoreBlock ? declsOf(darkMoreBlock.body) : {};
const lightMore = { ...light, ...lightMoreOwn };
const darkMore = { ...dark, ...darkMoreOwn };

function parseColor(raw) {
  const v = (raw || '').trim();
  let m;
  if ((m = /^#([0-9a-f]{6})$/i.exec(v))) {
    return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  }
  if ((m = /^#([0-9a-f]{3})$/i.exec(v))) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v))) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }
  return null;
}

function colorOf(theme, name) {
  const raw = theme[name];
  if (raw === undefined) throw new Error(`${name} is not declared in this theme`);
  const c = parseColor(raw);
  if (!c) throw new Error(`${name}: "${raw}" could not be parsed as a colour`);
  return c;
}

/* Alpha is composited over the ground it is checked against, never read as
 * opaque -- spec item 6's own words. Every token this file treats as opaque
 * (grounds, ink family, status colours) really is opaque in tokens.css today;
 * the only alpha values in play are the `-soft` tints, composited here. */
function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function luminance({ r, g, b }) {
  const lin = (c) => { const n = c / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

test('parseColor fails closed on a value it does not recognise', () => {
  assert.equal(parseColor('oklch(0.72 0.15 26)'), null);
  assert.equal(parseColor('banana'), null);
  assert.throws(() => colorOf({ '--x': 'banana' }, '--x'), /could not be parsed/);
  assert.throws(() => colorOf({}, '--missing'), /is not declared/);
});

const THEMES = [
  { name: 'light', tokens: light, textFloor: 4.5, controlFloor: 3 },
  { name: 'dark', tokens: dark, textFloor: 4.5, controlFloor: 3 },
  { name: 'light + more contrast', tokens: lightMore, textFloor: 7, controlFloor: 4.5 },
  { name: 'dark + more contrast', tokens: darkMore, textFloor: 7, controlFloor: 4.5 },
];

const GROUNDS = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3'];
const TEXT_TOKENS = ['--ink', '--ink-2', '--muted', '--faint', '--ok', '--warn', '--err', '--info'];
const CONTROL_TOKENS = ['--accent', '--ok', '--warn', '--err'];
const STATUS = ['ok', 'warn', 'err', 'info'];

test('every text token clears its floor against every ground, in all four themes', () => {
  const bad = [];
  for (const t of THEMES) {
    for (const tok of TEXT_TOKENS) {
      for (const g of GROUNDS) {
        const r = contrast(colorOf(t.tokens, tok), colorOf(t.tokens, g));
        if (r < t.textFloor - 1e-9) bad.push(`${t.name}: ${tok} on ${g} is ${r.toFixed(2)}:1, needs >= ${t.textFloor}:1`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('accent-ink on accent, and each status colour on its own soft tint over the surface, clear the text floor', () => {
  const bad = [];
  for (const t of THEMES) {
    const r0 = contrast(colorOf(t.tokens, '--accent-ink'), colorOf(t.tokens, '--accent'));
    if (r0 < t.textFloor - 1e-9) bad.push(`${t.name}: --accent-ink on --accent is ${r0.toFixed(2)}:1, needs >= ${t.textFloor}:1`);
    const surface = colorOf(t.tokens, '--surface');
    for (const s of STATUS) {
      const fg = colorOf(t.tokens, `--${s}`);
      const soft = over(colorOf(t.tokens, `--${s}-soft`), surface);
      const r = contrast(fg, soft);
      if (r < t.textFloor - 1e-9) bad.push(`${t.name}: --${s} on --${s}-soft (over --surface) is ${r.toFixed(2)}:1, needs >= ${t.textFloor}:1`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('every control token clears its floor against every ground, in all four themes', () => {
  const bad = [];
  for (const t of THEMES) {
    for (const tok of CONTROL_TOKENS) {
      for (const g of GROUNDS) {
        const r = contrast(colorOf(t.tokens, tok), colorOf(t.tokens, g));
        if (r < t.controlFloor - 1e-9) bad.push(`${t.name}: ${tok} on ${g} is ${r.toFixed(2)}:1, needs >= ${t.controlFloor}:1`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});
