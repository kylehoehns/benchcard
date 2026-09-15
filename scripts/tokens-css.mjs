/* Shared reading of app/tokens.css for test/contrast.test.js and
 * test/graphite-tokens.test.js (#21).
 *
 * Lives here rather than under test/ for one reason that is not stylistic:
 * `node --test` with no path argument does not only run `test/*.test.js` --
 * it runs every `.js`/`.mjs`/`.cjs` file that sits anywhere under a directory
 * literally named `test`, filename pattern or not. A first attempt at this
 * file lived at `test/helpers/tokens-css.js`; `npm test`'s own `ℹ tests` count
 * went up by one with zero `test()` calls added, because node counted the
 * file itself. `scripts/` already holds exactly this shape of shared module
 * -- `scripts/charts.mjs` exports `SIZES`, `file`, `planFor` and friends for
 * `test/charts.test.js` to import -- so this follows that precedent rather
 * than inventing a second one.
 *
 * Every function here is a small, literal reading of the cascade and of CSS
 * colour syntax -- not a CSS engine. It exists to let the tests ask tokens.css
 * the same questions a browser answers, in the states a browser can be in:
 * which block wins for a given property, and what colour a token resolves to.
 */

const stripBlockComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');
export const stripAllComments = (src) => stripBlockComments(src).replace(/<!--[\s\S]*?-->/g, ' ');

/* A minimal CSS block splitter that tracks brace depth, so one
 * `@media (…) { … }` block comes back as a single entry whose own body can be
 * split again for the selectors nested inside it. */
export function splitBlocks(src) {
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
export function declsOf(body) {
  const out = {};
  for (const m of body.matchAll(DECL)) out[m[1]] = m[2].trim();
  return out;
}

/* Every block whose selector matches `selector`, merged in SOURCE ORDER --
 * the cascade's own rule for two rules of equal specificity is "the later
 * one wins", property by property, not "the first block found" and not "the
 * later block replaces the earlier one wholesale". A second `:root { … }`
 * appended anywhere in the file, or a second `[data-theme="dark"] { … }`,
 * lands exactly the way a browser would apply it. */
function mergeSelector(blocks, selector) {
  return blocks.filter((b) => b.selector === selector)
    .reduce((acc, b) => ({ ...acc, ...declsOf(b.body) }), {});
}

/* Resolve tokens.css into the four themes the spec (#21 item 6) checks:
 * light, dark, light + more contrast, dark + more contrast. The more-contrast
 * blocks layer over their OWN base theme, because `[data-theme="dark"]` and
 * `:root` (and, one level in, the two more-contrast selectors) all match the
 * same root element -- a property one side never redeclares still resolves
 * to the other side's value, it is not left undefined. */
export function parseTokensCss(raw) {
  const src = stripBlockComments(raw);
  const top = splitBlocks(src);
  const light = mergeSelector(top, ':root');
  const darkOwn = mergeSelector(top, '[data-theme="dark"]');
  const dark = { ...light, ...darkOwn };

  /* `.includes('prefers-contrast')` alone accepts `(prefers-contrast: less)`
   * too -- match the exact "more" this feature actually wants. Every such
   * block contributes its nested selectors; #21's tree has exactly one. */
  const moreBlocks = top.filter((b) => /prefers-contrast:\s*more\b/.test(b.selector));
  const nested = moreBlocks.flatMap((b) => splitBlocks(b.body));
  const lightMoreOwn = mergeSelector(nested, ':root:not([data-theme="dark"])');
  const darkMoreOwn = mergeSelector(nested, ':root[data-theme="dark"]');
  const lightMore = { ...light, ...lightMoreOwn };
  const darkMore = { ...dark, ...darkMoreOwn };

  return {
    top: top.map((b) => b.selector),
    nested: nested.map((b) => b.selector),
    mediaSelectors: moreBlocks.map((b) => b.selector),
    light, darkOwn, dark, lightMoreOwn, darkMoreOwn, lightMore, darkMore,
  };
}

/* ---------------------------- colour parsing ---------------------------- */

/* One shared channel/alpha grammar for both the anchored single-value parse
 * below and the free-text scan in extractColors: comma syntax
 * (`rgba(28, 28, 30, .1)`) and the space syntax (`rgb(28 28 30 / .1)`) read
 * the same colour, any case, any amount of whitespace. */
const CH = '(?:\\s*,\\s*|\\s+)';
const ALPHA = '(?:\\s*[,/]\\s*([\\d.]+%?)\\s*)?';
const RGB_CORE = `([\\d.]+)${CH}([\\d.]+)${CH}([\\d.]+)${ALPHA}`;
const RGB_ANCHORED = new RegExp(`^rgba?\\(\\s*${RGB_CORE}\\)$`, 'i');
const RGB_GLOBAL = new RegExp(`rgba?\\(\\s*${RGB_CORE}\\)`, 'gi');
/* Longest alternative first: `{8}` and `{6}` must be tried before `{4}` and
 * `{3}` or a #RRGGBB reads as a #RGB followed by three stray digits. */
const HEX_ANCHORED = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i;
const HEX_GLOBAL = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi;

function hexToColor(hex) {
  if (hex.length === 8) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: parseInt(hex.slice(6, 8), 16) / 255 };
  }
  if (hex.length === 6) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
  }
  if (hex.length === 4) {
    const [r, g, b, a] = hex.split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: a / 255 };
  }
  const [r, g, b] = hex.split('').map((c) => parseInt(c + c, 16));
  return { r, g, b, a: 1 };
}
function rgbMatchToColor(m) {
  const alpha = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]);
  return { r: +m[1], g: +m[2], b: +m[3], a: alpha };
}

/* A single CSS colour VALUE (the whole string is the colour, e.g. a token's
 * declared value) -- hex or rgb/rgba, either syntax, any case. Returns null
 * for anything else (oklch(), color-mix(), a bare keyword, a typo), which
 * callers must treat as a failure, never a skip. */
export function parseColor(raw) {
  const v = (raw || '').trim();
  let m;
  if ((m = HEX_ANCHORED.exec(v))) return hexToColor(m[1].toLowerCase());
  if ((m = RGB_ANCHORED.exec(v))) return rgbMatchToColor(m);
  return null;
}

/* Every colour LITERAL found anywhere in a block of text, for the ember/warm
 * bans -- a scan, not a parse, because the banned value can be sitting inside
 * a longer declaration (`box-shadow: 0 0 0 1px rgba(20,18,15,.14)`) rather
 * than being the whole value. Matches hex and rgb/rgba in both comma and
 * space syntax, any case, any amount of whitespace -- so a reformatted
 * `rgba( 20, 18, 15` or `rgb(20 18 15 / .08)` is read as the same colour a
 * plain `rgba(20, 18, 15` is, rather than missed because the spelling moved. */
export function extractColors(text) {
  const out = [];
  for (const m of text.matchAll(HEX_GLOBAL)) out.push(hexToColor(m[0].slice(1).toLowerCase()));
  for (const m of text.matchAll(RGB_GLOBAL)) out.push(rgbMatchToColor(m));
  return out;
}

export function colorOf(theme, name) {
  const raw = theme[name];
  if (raw === undefined) throw new Error(`${name} is not declared in this theme`);
  const c = parseColor(raw);
  if (!c) throw new Error(`${name}: "${raw}" could not be parsed as a colour`);
  return c;
}

export const spread = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);

/* Standard HSL hue, degrees. Used only to check that a status colour keeps
 * its OWN hue family (green/amber/red) rather than to judge contrast, which
 * relative luminance already owns. */
export function hueOf(c) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

/* Alpha is composited over the ground it is checked against, never read as
 * opaque -- spec item 6's own words, generalised to every token this file
 * checks (text, control and accent alike), not only the `-soft` tints. `bg`
 * is assumed opaque, which every ground token here is. */
export function over(fg, bg) {
  if (fg.a >= 1) return fg;
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

export function luminance({ r, g, b }) {
  const lin = (c) => { const n = c / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* The four ember and four warm-tint values #21 bans, as RGB triples rather
 * than spellings -- the scan above turns every literal it finds into the same
 * shape, so a banned colour is caught by VALUE regardless of hex vs rgb(),
 * case, spacing or comma-vs-space syntax. Alpha is never part of the ban. */
export const EMBER_RGB = [[195, 63, 8], [168, 53, 5], [255, 122, 56], [255, 146, 87]];
export const WARM_RGB = [[246, 244, 240], [239, 236, 230], [20, 18, 15], [35, 28, 18]];
export const isBanned = (c, list) => list.some(([r, g, b]) => c.r === r && c.g === g && c.b === b);
