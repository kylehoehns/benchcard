import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* #21 (Graphite look), the parts of "What would settle it" that are not the
 * contrast floors (those are `test/contrast.test.js`):
 *
 *   1. the four ticket values, exact, in both theme blocks, and no ember or
 *      warm-tint literal anywhere they could hide;
 *   2. --accent === --ink and --accent-ink === --surface, in every block;
 *   3. ok/warn/err distinct from each other and from ink, and not grey;
 *   4. --info === --muted and --info-soft neutral, in every block;
 *   5. the player-hue tokens and formula untouched;
 *   7. --font exact, and InterVar scoped to the three places item 7 allows;
 *   9. theme-color held to tokens.css's own --bg, everywhere it is spelled out.
 *
 * Same tokens.css block parser as test/contrast.test.js, kept as a second
 * copy on purpose -- these two files read the same source for different
 * reasons and neither should have to import test infrastructure from the
 * other to do it. */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const stripBlockComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripAllComments = (src) => stripBlockComments(src).replace(/<!--[\s\S]*?-->/g, ' ');

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

const tokensCssRaw = read('app/tokens.css');
const tokensCss = stripBlockComments(tokensCssRaw);
const topBlocks = splitBlocks(tokensCss);
const rootBlock = topBlocks.find((b) => b.selector === ':root');
const darkBlock = topBlocks.find((b) => b.selector === '[data-theme="dark"]');
const moreBlock = topBlocks.find((b) => b.selector.includes('prefers-contrast'));
const nested = moreBlock ? splitBlocks(moreBlock.body) : [];
const lightMoreBlock = nested.find((b) => b.selector === ':root:not([data-theme="dark"])');
const darkMoreBlock = nested.find((b) => b.selector === ':root[data-theme="dark"]');

const light = declsOf(rootBlock.body);
const darkOwn = declsOf(darkBlock.body);
const dark = { ...light, ...darkOwn };
const lightMore = { ...light, ...(lightMoreBlock ? declsOf(lightMoreBlock.body) : {}) };
const darkMore = { ...dark, ...(darkMoreBlock ? declsOf(darkMoreBlock.body) : {}) };
const THEMES = [
  ['light', light], ['dark', dark],
  ['light + more contrast', lightMore], ['dark + more contrast', darkMore],
];

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
const spread = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);

/* ---------------------------- item 1: the four ticket values ---------------------------- */

test('the four ticket tokens hold the ticket values, exactly, in both theme blocks', () => {
  const want = {
    light: { '--bg': '#F4F4F6', '--surface': '#FFFFFF', '--ink': '#1C1C1E', '--muted': '#6C6C72' },
    dark: { '--bg': '#0B0B0C', '--surface': '#1C1C1E', '--ink': '#F4F4F6', '--muted': '#98989F' },
  };
  for (const [theme, decls] of [['light', light], ['dark', darkOwn]]) {
    for (const [tok, val] of Object.entries(want[theme])) {
      assert.equal((decls[tok] || '').toUpperCase(), val, `${theme} ${tok} is "${decls[tok]}", want ${val}`);
    }
  }
});

/* -------------------- item 1/2: no ember, no warm tint, anywhere under app/ -------------------- */

const EMBER = ['#C33F08', '#A83505', '#FF7A38', '#FF9257', 'rgba(195, 63, 8', 'rgba(255, 122, 56'];
const WARM = ['#F6F4F0', '#EFECE6', 'rgba(20, 18, 15', 'rgba(35, 28, 18'];

/* Case-insensitive, and whitespace-tolerant inside the rgba() needles -- a
 * reformatted `rgba(195,63,8` must still be caught. Hex needles are matched
 * literally (case-insensitively); rgba needles are rebuilt as a regex over
 * their own numbers so `,` vs `, ` does not matter. */
function needleRegex(s) {
  if (s.startsWith('#')) return new RegExp(s, 'i');
  const prefix = s.match(/^[a-z]+\(/i)[0].replace('(', '\\(');
  const nums = s.match(/[\d.]+/g).map((n) => n.replace('.', '\\.'));
  return new RegExp(prefix + nums.join('\\s*,\\s*'), 'i');
}
const EMBER_RE = EMBER.map(needleRegex);
const WARM_RE = WARM.map(needleRegex);

const BINARY_EXT = /\.(png|ico|woff2?|ttf|otf|jpe?g|gif|webp)$/i;
const appFiles = readdirSync(new URL('app/', ROOT), { withFileTypes: true })
  .filter((d) => d.isFile() && !BINARY_EXT.test(d.name))
  .map((d) => d.name);
assert.ok(appFiles.length >= 30, `only ${appFiles.length} text files found directly under app/ -- the scan is looking in the wrong place`);

test('no ember accent literal survives anywhere under app/ (excluding vendor/) or in scripts/charts.mjs', () => {
  const bad = [];
  for (const name of appFiles) {
    const src = read('app/' + name);
    for (const re of EMBER_RE) if (re.test(src)) bad.push(`app/${name} matches ${re}`);
  }
  const charts = read('scripts/charts.mjs');
  for (const re of EMBER_RE) if (re.test(charts)) bad.push(`scripts/charts.mjs matches ${re}`);
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('no warm-tint literal survives anywhere under app/ (excluding vendor/) or in scripts/charts.mjs', () => {
  const bad = [];
  for (const name of appFiles) {
    const src = read('app/' + name);
    for (const re of WARM_RE) if (re.test(src)) bad.push(`app/${name} matches ${re}`);
  }
  const charts = read('scripts/charts.mjs');
  for (const re of WARM_RE) if (re.test(charts)) bad.push(`scripts/charts.mjs matches ${re}`);
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* ------------------------------ item 2: accent is ink ------------------------------ */

test('--accent equals --ink and --accent-ink equals --surface, in every block', () => {
  const bad = [];
  for (const [name, decls] of THEMES) {
    const accent = colorOf(decls, '--accent'), ink = colorOf(decls, '--ink');
    if (accent.r !== ink.r || accent.g !== ink.g || accent.b !== ink.b) {
      bad.push(`${name}: --accent is ${decls['--accent']}, --ink is ${decls['--ink']}`);
    }
    const accentInk = colorOf(decls, '--accent-ink'), surface = colorOf(decls, '--surface');
    if (accentInk.r !== surface.r || accentInk.g !== surface.g || accentInk.b !== surface.b) {
      bad.push(`${name}: --accent-ink is ${decls['--accent-ink']}, --surface is ${decls['--surface']}`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('--accent-soft and --accent-line are ink at their own alpha, in light and dark', () => {
  for (const [name, decls] of [['light', light], ['dark', dark]]) {
    const ink = colorOf(decls, '--ink');
    for (const tok of ['--accent-soft', '--accent-line']) {
      const c = colorOf(decls, tok);
      assert.ok(c.a > 0 && c.a < 1, `${name} ${tok} is "${decls[tok]}", not a translucent value`);
      assert.deepEqual([c.r, c.g, c.b], [ink.r, ink.g, ink.b],
        `${name} ${tok} is ${decls[tok]}, whose rgb does not match --ink ${decls['--ink']}`);
    }
  }
});

/* ------------------------- item 3: status colours keep their hues ------------------------- */

test('--ok, --warn and --err stay distinct from each other, from --ink, and are not grey', () => {
  const bad = [];
  for (const [name, decls] of THEMES) {
    const ink = colorOf(decls, '--ink');
    const cs = { ok: colorOf(decls, '--ok'), warn: colorOf(decls, '--warn'), err: colorOf(decls, '--err') };
    for (const [k, c] of Object.entries(cs)) {
      if (spread(c) < 15) bad.push(`${name}: --${k} (${decls['--' + k]}) reads as grey`);
      if (c.r === ink.r && c.g === ink.g && c.b === ink.b) bad.push(`${name}: --${k} equals --ink`);
    }
    for (const [a, b] of [['ok', 'warn'], ['ok', 'err'], ['warn', 'err']]) {
      const ca = cs[a], cb = cs[b];
      if (ca.r === cb.r && ca.g === cb.g && ca.b === cb.b) bad.push(`${name}: --${a} equals --${b}`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* --------------------------------- item 4: info is neutral --------------------------------- */

test('--info equals --muted, and --info-soft is neutral, in every block', () => {
  const bad = [];
  for (const [name, decls] of THEMES) {
    const info = colorOf(decls, '--info'), muted = colorOf(decls, '--muted');
    if (info.r !== muted.r || info.g !== muted.g || info.b !== muted.b) {
      bad.push(`${name}: --info is ${decls['--info']}, --muted is ${decls['--muted']}`);
    }
    const soft = colorOf(decls, '--info-soft');
    if (spread(soft) > 6) bad.push(`${name}: --info-soft (${decls['--info-soft']}) is not neutral, spread ${spread(soft)}`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* --------------------------- item 5: player identity untouched --------------------------- */

test('the player-hue tokens keep exactly their ticket values', () => {
  assert.equal(light['--pc-l'], '63%'); assert.equal(light['--pc-c'], '.145'); assert.equal(light['--av-ink'], '60%');
  assert.equal(darkOwn['--pc-l'], '72%'); assert.equal(darkOwn['--pc-c'], '.15'); assert.equal(darkOwn['--av-ink'], '100%');
});

test('the player-hue formula in app/state.js is untouched', () => {
  const stateJs = read('app/state.js');
  assert.match(stateJs, /oklch\(var\(--pc-l\)\s*var\(--pc-c\)\s*\$\{HUES\[/,
    'state.js no longer builds the per-player hue from --pc-l/--pc-c the way #21 says it must not change');
});

/* -------------------------------------- item 7: font -------------------------------------- */

test('--font is exactly the system stack, everywhere it is declared', () => {
  const want = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';
  assert.equal(light['--font'], want, `--font is "${light['--font']}"`);
  // not redeclared per theme; confirm the merged view (what every page actually reads) agrees
  assert.equal(dark['--font'], want);
});

const CARD_FONT_LITERAL = `'InterVar', "Helvetica Neue", Arial, sans-serif`;

test('CARD_FONT and .card\'s font-family stay byte-identical, and both still name InterVar first', () => {
  const cardJs = read('app/card.js');
  const cardCss = read('app/card.css');
  assert.ok(cardJs.includes(`export const CARD_FONT = \`${CARD_FONT_LITERAL}\`;`),
    'app/card.js no longer exports CARD_FONT with the exact literal card.css must match');
  assert.ok(cardCss.includes(`font-family: ${CARD_FONT_LITERAL};`),
    'app/card.css\'s .card font-family no longer matches CARD_FONT byte-for-byte');
});

test('InterVar appears under app/ only in the two @font-face rules, .card\'s font-family and CARD_FONT', () => {
  const ALLOW = {
    'tokens.css': 2,   // the two @font-face font-family declarations
    'card.css': 1,     // .card's font-family
    'card.js': 1,      // CARD_FONT
  };
  const bad = [];
  for (const name of appFiles) {
    if (!name.endsWith('.css') && !name.endsWith('.js') && !name.endsWith('.html')) continue;
    const src = stripAllComments(read('app/' + name));
    const count = (src.match(/InterVar/g) || []).length;
    const want = ALLOW[name] || 0;
    if (count !== want) bad.push(`app/${name}: InterVar appears ${count} time(s), want ${want}`);
  }
  const charts = stripAllComments(read('scripts/charts.mjs'));
  const chartsCount = (charts.match(/InterVar/g) || []).length;
  if (chartsCount !== 0) bad.push(`scripts/charts.mjs: InterVar appears ${chartsCount} time(s), want 0`);
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* ----------------------------------- item 9: theme-color ----------------------------------- */

const GROUND = { light: light['--bg'].toUpperCase(), dark: darkOwn['--bg'].toUpperCase() };

test('tokens.css light --bg and dark --bg are what every theme-color literal must match', () => {
  // Sanity on the fixture itself, so a broken parser above cannot make every
  // check below vacuously pass by comparing "undefined" to "undefined".
  assert.match(GROUND.light, /^#[0-9A-F]{6}$/);
  assert.match(GROUND.dark, /^#[0-9A-F]{6}$/);
});

test('site.webmanifest theme_color and background_color match tokens.css light --bg', () => {
  const manifest = JSON.parse(read('app/site.webmanifest'));
  assert.equal(manifest.theme_color.toUpperCase(), GROUND.light);
  assert.equal(manifest.background_color.toUpperCase(), GROUND.light);
});

test('render.js applyTheme sets the theme-color meta to tokens.css\'s own light/dark --bg', () => {
  const renderJs = stripBlockComments(read('app/render.js'));
  const m = /setAttribute\('content',\s*resolved\s*===\s*'dark'\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\)/.exec(renderJs);
  assert.ok(m, 'render.js applyTheme no longer sets the theme-color meta the way this test expects to find it');
  assert.equal(m[1].toUpperCase(), GROUND.dark, `applyTheme's dark value is ${m[1]}`);
  assert.equal(m[2].toUpperCase(), GROUND.light, `applyTheme's light value is ${m[2]}`);
});

test('scripts/charts.mjs\'s own theme-color meta literal matches tokens.css light --bg', () => {
  // The chart pages' pre-paint SCRIPT is lifted byte-for-byte from about.html
  // at generation time (see fromAbout()), so it is covered by the glob test
  // below; this static <meta> literal in the template is written by hand and
  // needs its own check.
  const charts = read('scripts/charts.mjs');
  const m = /<meta name="theme-color" content="([^"]+)">/.exec(charts);
  assert.ok(m, 'scripts/charts.mjs no longer has a literal theme-color meta in its template');
  assert.equal(m[1].toUpperCase(), GROUND.light, `the chart template's theme-color is ${m[1]}`);
});

test('every HTML page under app/ that names a theme-color agrees with tokens.css, discovered by glob', () => {
  // Not a hard-coded list: a new page with its own theme-color meta or
  // pre-paint script is picked up here automatically, and a mismatch fails.
  const pages = appFiles.filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 9, `only ${pages.length} HTML pages found under app/`);
  let metaSeen = 0, scriptSeen = 0;
  const bad = [];
  for (const name of pages) {
    const src = stripAllComments(read('app/' + name));
    const meta = /<meta name="theme-color" content="([^"]+)">/.exec(src);
    if (meta) {
      metaSeen++;
      if (meta[1].toUpperCase() !== GROUND.light) bad.push(`${name}'s <meta theme-color> is ${meta[1]}, want ${GROUND.light}`);
    }
    const script = /setAttribute\('content',\s*t\s*===\s*'dark'\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\)/.exec(src);
    if (script) {
      scriptSeen++;
      if (script[1].toUpperCase() !== GROUND.dark) bad.push(`${name}'s pre-paint dark value is ${script[1]}, want ${GROUND.dark}`);
      if (script[2].toUpperCase() !== GROUND.light) bad.push(`${name}'s pre-paint light value is ${script[2]}, want ${GROUND.light}`);
    }
  }
  assert.ok(metaSeen >= 9, `only ${metaSeen} pages carry a theme-color meta -- the glob or the regex is missing pages`);
  assert.ok(scriptSeen >= 9, `only ${scriptSeen} pages carry the pre-paint theme script -- the glob or the regex is missing pages`);
  assert.deepEqual(bad, [], bad.join('\n  '));
});
