import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  parseTokensCss, stripAllComments, colorOf, spread, hueOf,
  extractColors, isBanned, EMBER_RGB, WARM_RGB,
} from '../scripts/tokens-css.mjs';

/* #21 (Graphite look), the parts of "What would settle it" that are not the
 * contrast floors (those are `test/contrast.test.js`):
 *
 *   1. the four ticket values, exact, in both theme blocks; every other
 *      colour token neutral grey; no ember or warm-tint literal anywhere;
 *   2. --accent === --ink and --accent-ink === --surface (alpha included),
 *      in every block, and --accent-soft/--accent-line unmoved;
 *   3. ok/warn/err distinct from each other and from ink, not grey, and each
 *      still reads as its own hue (green/amber/red);
 *   4. --info === --muted and --info-soft neutral, in every block;
 *   5. the player-hue tokens, --av-ring and the formula untouched, and not
 *      quietly re-set by a more-contrast override;
 *   7. --font exact and not overridden by more-contrast; InterVar scoped to
 *      the three places item 7 allows;
 *   9. theme-color held to tokens.css's own --bg, everywhere it is spelled
 *      out, however the markup happens to be written.
 *
 * The tokens.css parser, the four-theme resolution and the colour maths are
 * shared with test/contrast.test.js via scripts/tokens-css.mjs -- see that
 * module's header for why it is a script rather than a second file under
 * test/. */

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

const resolved = parseTokensCss(read('app/tokens.css'));
const { light, darkOwn, dark, lightMore, darkMore } = resolved;
const THEMES = [
  ['light', light], ['dark', dark],
  ['light + more contrast', lightMore], ['dark + more contrast', darkMore],
];

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

/* ------------- item 1: every other colour token is neutral grey ------------- */

/* Every token that is meant to be a single, pure colour and is NOT a status
 * colour (checked for its own hue below) or a player token (untouched by
 * #21, checked separately). The shadows are named in the spec too
 * ("--bg-2, --surface-2, --surface-3, --ink-2, --faint, --line, --line-2,
 * --pc-track, the shadows"), but a shadow's VALUE is a multi-part box-shadow
 * list, not a single colour -- extractColors pulls the literal colour(s) out
 * of it instead of trying to parse the whole declaration as one. */
const NEUTRAL_DIRECT = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3',
  '--ink', '--ink-2', '--muted', '--faint', '--line', '--line-2',
  '--accent', '--accent-2', '--accent-soft', '--accent-line', '--accent-ink',
  '--info', '--info-soft', '--pc-track'];
const SHADOW_TOKENS = ['--shadow-sm', '--shadow', '--shadow-lg', '--shadow-paper'];
/* The real palette's widest legitimate spread today is 8 (light --faint,
 * #6B6B73); ten points of slack above that catches a warm off-white like
 * #F2EEE8 (spread 10) without flagging anything genuinely grey. */
const NEUTRAL_TOLERANCE = 8;

test('every non-status, non-player colour token is neutral grey, in all four themes', () => {
  const bad = [];
  for (const [name, decls] of THEMES) {
    for (const tok of NEUTRAL_DIRECT) {
      const c = colorOf(decls, tok);
      const s = spread(c);
      if (s > NEUTRAL_TOLERANCE) bad.push(`${name}: ${tok} (${decls[tok]}) is not neutral, spread ${s}`);
    }
    for (const tok of SHADOW_TOKENS) {
      const raw = decls[tok];
      if (raw === undefined) continue;
      for (const c of extractColors(raw)) {
        const s = spread(c);
        if (s > NEUTRAL_TOLERANCE) bad.push(`${name}: ${tok} (${raw}) carries a non-neutral colour, spread ${s}`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* -------------------- item 1/2: no ember, no warm tint, anywhere under app/ -------------------- */

/* A SCAN, not a spelling match: every hex and rgb()/rgba() literal in a file
 * is parsed to its RGB triple and compared against the banned values by
 * NUMBER, so hex vs rgb(), comma vs space syntax, case and whitespace are all
 * the same colour to this check -- `rgba( 20, 18, 15` and `rgb(20 18 15 /
 * .08)` are exactly as caught as `rgba(20, 18, 15`. */
const BINARY_EXT = /\.(png|ico|woff2?|ttf|otf|jpe?g|gif|webp)$/i;
const appFiles = readdirSync(new URL('app/', ROOT), { withFileTypes: true })
  .filter((d) => d.isFile() && !BINARY_EXT.test(d.name))
  .map((d) => d.name);
assert.ok(appFiles.length >= 30, `only ${appFiles.length} text files found directly under app/ -- the scan is looking in the wrong place`);

function scanFor(list, label) {
  const bad = [];
  for (const name of appFiles) {
    const src = read('app/' + name);
    for (const c of extractColors(src)) {
      if (isBanned(c, list)) bad.push(`app/${name} contains ${label} rgb(${c.r}, ${c.g}, ${c.b})`);
    }
  }
  const charts = read('scripts/charts.mjs');
  for (const c of extractColors(charts)) {
    if (isBanned(c, list)) bad.push(`scripts/charts.mjs contains ${label} rgb(${c.r}, ${c.g}, ${c.b})`);
  }
  return bad;
}

test('no ember accent literal survives anywhere under app/ (excluding vendor/) or in scripts/charts.mjs', () => {
  assert.deepEqual(scanFor(EMBER_RGB, 'an ember'), []);
});

test('no warm-tint literal survives anywhere under app/ (excluding vendor/) or in scripts/charts.mjs', () => {
  assert.deepEqual(scanFor(WARM_RGB, 'a warm-tint'), []);
});

/* ------------------------------ item 2: accent is ink ------------------------------ */

test('--accent equals --ink and --accent-ink equals --surface, alpha included, in every block', () => {
  const bad = [];
  for (const [name, decls] of THEMES) {
    const accent = colorOf(decls, '--accent'), ink = colorOf(decls, '--ink');
    if (accent.r !== ink.r || accent.g !== ink.g || accent.b !== ink.b || accent.a !== ink.a) {
      bad.push(`${name}: --accent is ${decls['--accent']}, --ink is ${decls['--ink']}`);
    }
    const accentInk = colorOf(decls, '--accent-ink'), surface = colorOf(decls, '--surface');
    if (accentInk.r !== surface.r || accentInk.g !== surface.g || accentInk.b !== surface.b || accentInk.a !== surface.a) {
      bad.push(`${name}: --accent-ink is ${decls['--accent-ink']}, --surface is ${decls['--surface']}`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('--accent-soft and --accent-line keep exactly today\'s alpha in light and dark, and more-contrast never overrides them', () => {
  const EXPECT = { light: { '--accent-soft': 0.10, '--accent-line': 0.32 }, dark: { '--accent-soft': 0.14, '--accent-line': 0.4 } };
  const bad = [];
  for (const [name, decls, exp] of [['light', light, EXPECT.light], ['dark', dark, EXPECT.dark]]) {
    const ink = colorOf(decls, '--ink');
    for (const tok of ['--accent-soft', '--accent-line']) {
      const c = colorOf(decls, tok);
      if (c.r !== ink.r || c.g !== ink.g || c.b !== ink.b) {
        bad.push(`${name} ${tok} is ${decls[tok]}, whose rgb does not match --ink ${decls['--ink']}`);
      }
      if (Math.abs(c.a - exp[tok]) > 1e-9) bad.push(`${name} ${tok} alpha is ${c.a}, want ${exp[tok]}`);
    }
  }
  for (const tok of ['--accent-soft', '--accent-line']) {
    if (lightMore[tok] !== light[tok]) bad.push(`light + more contrast overrides ${tok}: ${lightMore[tok]} vs ${light[tok]}`);
    if (darkMore[tok] !== dark[tok]) bad.push(`dark + more contrast overrides ${tok}: ${darkMore[tok]} vs ${dark[tok]}`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* ------------------------- item 3: status colours keep their hues ------------------------- */

/* Standard HSL hue, calibrated with margin against the four themes' real
 * values today (~150° ok, ~39° warn, ~4-14° err): a band wide enough to
 * survive a future re-tune for contrast (Design: "their values may move to
 * pass item 6"), narrow enough that a colour from a different hue family
 * (blue, grey) cannot land inside it. */
const HUE_BANDS = { ok: [[80, 170]], warn: [[20, 70]], err: [[0, 25], [335, 360]] };
const HUE_NAME = { ok: 'green', warn: 'amber', err: 'red' };
const inBand = (h, bands) => bands.some(([lo, hi]) => h >= lo && h <= hi);

test('--ok, --warn and --err stay distinct from each other, from --ink, are not grey, and keep their own hue', () => {
  const bad = [];
  for (const [name, decls] of THEMES) {
    const ink = colorOf(decls, '--ink');
    const cs = { ok: colorOf(decls, '--ok'), warn: colorOf(decls, '--warn'), err: colorOf(decls, '--err') };
    for (const [k, c] of Object.entries(cs)) {
      if (spread(c) < 15) bad.push(`${name}: --${k} (${decls['--' + k]}) reads as grey`);
      if (c.r === ink.r && c.g === ink.g && c.b === ink.b) bad.push(`${name}: --${k} equals --ink`);
      const h = hueOf(c);
      if (!inBand(h, HUE_BANDS[k])) bad.push(`${name}: --${k} hue is ${h.toFixed(1)}°, expected ${HUE_NAME[k]}`);
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
    if (spread(soft) > NEUTRAL_TOLERANCE) bad.push(`${name}: --info-soft (${decls['--info-soft']}) is not neutral, spread ${spread(soft)}`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* --------------------------- item 5: player identity untouched --------------------------- */

test('the player-hue tokens keep exactly their ticket values', () => {
  assert.equal(light['--pc-l'], '63%'); assert.equal(light['--pc-c'], '.145'); assert.equal(light['--av-ink'], '60%');
  assert.equal(darkOwn['--pc-l'], '72%'); assert.equal(darkOwn['--pc-c'], '.15'); assert.equal(darkOwn['--av-ink'], '100%');
});

test('the player-hue tokens and --av-ring are not overridden by more-contrast, in either theme', () => {
  const bad = [];
  for (const tok of ['--pc-l', '--pc-c', '--av-ink', '--av-ring']) {
    if (lightMore[tok] !== light[tok]) bad.push(`light + more contrast redefines ${tok}: ${lightMore[tok]} vs ${light[tok]}`);
    if (darkMore[tok] !== dark[tok]) bad.push(`dark + more contrast redefines ${tok}: ${darkMore[tok]} vs ${dark[tok]}`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('--av-ring stays 1.5px in every block', () => {
  for (const [name, decls] of THEMES) {
    assert.equal(decls['--av-ring'], '1.5px', `${name}: --av-ring is "${decls['--av-ring']}"`);
  }
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

test('--font is not overridden by more-contrast, in either theme', () => {
  assert.equal(lightMore['--font'], light['--font'], 'light + more contrast redefines --font');
  assert.equal(darkMore['--font'], dark['--font'], 'dark + more contrast redefines --font');
});

const CARD_FONT_LITERAL_FALLBACK = `'InterVar', "Helvetica Neue", Arial, sans-serif`;
/* app/card.js cannot be imported under node: it imports app/dom.js, whose
 * `export const ctx2d = document.createElement('canvas').getContext('2d');`
 * runs at module top level and throws with no DOM (`document is not
 * defined`) -- confirmed by attempting it here rather than assumed, so a
 * future dom.js that stops doing that starts being read from the source of
 * truth automatically. Until then the literal below is kept in step by the
 * byte-identical check against card.css a few lines down. */
let CARD_FONT_LITERAL = CARD_FONT_LITERAL_FALLBACK;
let CARD_FONT_IMPORTED = false;
try {
  ({ CARD_FONT: CARD_FONT_LITERAL } = await import('../app/card.js'));
  CARD_FONT_IMPORTED = true;
} catch { /* expected under node today -- see comment above */ }

test('CARD_FONT and .card\'s font-family stay byte-identical, and both still name InterVar first', () => {
  const cardJs = read('app/card.js');
  const cardCss = read('app/card.css');
  if (!CARD_FONT_IMPORTED) {
    assert.ok(cardJs.includes(`export const CARD_FONT = \`${CARD_FONT_LITERAL}\`;`),
      'app/card.js no longer exports CARD_FONT with the exact literal card.css must match');
  }
  assert.ok(cardCss.includes(`font-family: ${CARD_FONT_LITERAL};`),
    'app/card.css\'s .card font-family no longer matches CARD_FONT byte-for-byte');
  assert.match(CARD_FONT_LITERAL, /^'InterVar'/, 'CARD_FONT no longer names InterVar first');
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

/* Quote-style tolerant (`'…'` or `"…"`), because the only thing that makes a
 * page's script the pre-paint theme script is its shape, not which quote key
 * a hand-written copy happened to use. */
const PREPAINT_RE = (varName) => new RegExp(
  `setAttribute\\(\\s*['"]content['"]\\s*,\\s*${varName}\\s*===\\s*['"]dark['"]\\s*\\?\\s*['"]([^'"]+)['"]\\s*:\\s*['"]([^'"]+)['"]\\s*\\)`);

test('render.js applyTheme sets the theme-color meta to tokens.css\'s own light/dark --bg', () => {
  const renderJs = stripAllComments(read('app/render.js'));
  const m = PREPAINT_RE('resolved').exec(renderJs);
  assert.ok(m, 'render.js applyTheme no longer sets the theme-color meta the way this test expects to find it');
  assert.equal(m[1].toUpperCase(), GROUND.dark, `applyTheme's dark value is ${m[1]}`);
  assert.equal(m[2].toUpperCase(), GROUND.light, `applyTheme's light value is ${m[2]}`);
});

/* Every `<meta>` tag, attributes read independently of their order or quote
 * style -- `<meta content="…" name="theme-color">` names the same thing as
 * the canonical spelling, and a regex anchored on `name="theme-color"`
 * coming first would silently skip it rather than flag a mismatch. */
const METATAG_G = /<meta\b[^>]*>/gi;
function metaAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z0-9:-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}
function themeColorMetas(html) {
  const out = [];
  for (const m of html.matchAll(METATAG_G)) {
    const attrs = metaAttrs(m[0]);
    if (attrs.name === 'theme-color' && attrs.content !== undefined) out.push(attrs);
  }
  return out;
}

test('scripts/charts.mjs\'s own theme-color meta literal matches tokens.css light --bg', () => {
  // The chart pages' pre-paint SCRIPT is lifted byte-for-byte from about.html
  // at generation time (see fromAbout()), so it is covered by the glob test
  // below; this static <meta> literal in the template is written by hand and
  // needs its own check.
  const charts = read('scripts/charts.mjs');
  const metas = themeColorMetas(charts);
  assert.ok(metas.length >= 1, 'scripts/charts.mjs no longer has a literal theme-color meta in its template');
  for (const m of metas) {
    assert.equal(m.content.toUpperCase(), GROUND.light, `the chart template's theme-color is ${m.content}`);
  }
});

test('every theme-color meta on every HTML page under app/ agrees with tokens.css, discovered by glob', () => {
  // Not a hard-coded list: a new page with its own theme-color meta or
  // pre-paint script is picked up here automatically, and a mismatch fails --
  // and EVERY meta on a page is checked, not only the first one found.
  const pages = appFiles.filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 9, `only ${pages.length} HTML pages found under app/`);
  let metaSeen = 0, scriptSeen = 0;
  const bad = [];
  for (const name of pages) {
    const src = stripAllComments(read('app/' + name));
    const metas = themeColorMetas(src);
    metaSeen += metas.length;
    for (const m of metas) {
      // A meta scoped to dark by media query is judged against dark's own
      // ground; anything else (the common case: one meta, flipped by script
      // after boot) is judged against light, the value it ships with.
      const wantsDark = /prefers-color-scheme:\s*dark/i.test(m.media || '');
      const want = wantsDark ? GROUND.dark : GROUND.light;
      if (m.content.toUpperCase() !== want) bad.push(`${name}'s <meta theme-color${wantsDark ? ' (dark)' : ''}> is ${m.content}, want ${want}`);
    }
    const script = PREPAINT_RE('t').exec(src);
    if (script) {
      scriptSeen++;
      if (script[1].toUpperCase() !== GROUND.dark) bad.push(`${name}'s pre-paint dark value is ${script[1]}, want ${GROUND.dark}`);
      if (script[2].toUpperCase() !== GROUND.light) bad.push(`${name}'s pre-paint light value is ${script[2]}, want ${GROUND.light}`);
    }
  }
  assert.ok(metaSeen >= 9, `only ${metaSeen} theme-color meta(s) found across all pages -- the glob or the parser is missing pages`);
  assert.ok(scriptSeen >= 9, `only ${scriptSeen} pages carry the pre-paint theme script -- the glob or the regex is missing pages`);
  assert.deepEqual(bad, [], bad.join('\n  '));
});
