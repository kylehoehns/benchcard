import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTokensCss, parseColor, colorOf, over, contrast } from '../scripts/tokens-css.mjs';
import { COLORS } from '../app/storage.js';

/* #21 (Graphite look), item 6: every color token in app/tokens.css against
 * WCAG 2.2's own contrast formula, on every ground it can land on.
 *
 * The parser, the four-theme resolution and the color maths live in
 * scripts/tokens-css.mjs -- test/graphite-tokens.test.js reads the same
 * tokens.css for a different set of questions and needs the same machinery,
 * and `node --test`'s own default file discovery is why that machinery is a
 * script rather than a second file under test/ (see that module's header).
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
 * EVERY ALPHA TOKEN IS COMPOSITED OVER THE GROUND IT IS CHECKED AGAINST,
 * never read as opaque -- spec item 6's own words, and true of any token in
 * play here, not only the `-soft` tints: `effective()` below composites
 * whichever side of a comparison carries alpha, over the OTHER side (which is
 * itself composited first if it also carries alpha -- see `--accent-ink` on
 * `--accent`, where `--accent` can be translucent and sits on `--surface`).
 *
 * A TOKEN THAT CANNOT BE PARSED FAILS THE TEST, IT IS NEVER SKIPPED: `colorOf`
 * throws on a missing or unrecognized value, and nothing here catches that
 * throw -- it surfaces as a failing test, the same as a ratio under floor. */

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const resolved = parseTokensCss(read('app/tokens.css'));
const { light, dark, lightMore, darkMore, nested } = resolved;

test('the more-contrast block keeps the two base selectors that survive equal specificity', () => {
  // #25 adds one light and one dark tint block per non-Graphite color inside
  // this same media query (8 colors x 2 = 16), alongside the two base
  // selectors this test has always pinned -- so the count grows with the
  // color list rather than staying fixed at 2.
  assert.equal(nested.length, 2 + 16,
    `@media (prefers-contrast: more) holds ${nested.length} selector block(s), want exactly 2 base + 16 tint`);
  assert.ok(nested.includes(':root:not([data-theme="dark"])'),
    'no block is selected on ":root:not([data-theme=\\"dark\\"])" -- found: ' + nested.join(', '));
  assert.ok(nested.includes(':root[data-theme="dark"]'),
    'no block is selected on ":root[data-theme=\\"dark\\"]" -- a bare `:root` here ties with '
    + '[data-theme="dark"] at equal specificity and loses on source order, painting light values '
    + 'onto a dark phone. found: ' + nested.join(', '));
});

test('parseColor fails closed on a value it does not recognize', () => {
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

const GROUNDS = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3', '--sheet'];
const TEXT_TOKENS = ['--ink', '--ink-2', '--muted', '--faint', '--ok', '--warn', '--err', '--info'];
const CONTROL_TOKENS = ['--accent', '--ok', '--warn', '--err'];
const STATUS = ['ok', 'warn', 'err', 'info'];

/* `fg` composited over `bg` if it carries alpha, `bg` used as-is otherwise --
 * every ground token in this file is opaque, so `bg` itself never needs
 * compositing except in the accent-ink-on-accent pair below, which composites
 * by hand before calling this. */
const effective = (fg, bg) => over(fg, bg);

test('every text token clears its floor against every ground, in all four themes', () => {
  const bad = [];
  for (const t of THEMES) {
    for (const tok of TEXT_TOKENS) {
      for (const g of GROUNDS) {
        const ground = colorOf(t.tokens, g);
        const r = contrast(effective(colorOf(t.tokens, tok), ground), ground);
        if (r < t.textFloor - 1e-9) bad.push(`${t.name}: ${tok} on ${g} is ${r.toFixed(2)}:1, needs >= ${t.textFloor}:1`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('accent-ink on accent, and each status color on its own soft tint over the surface, clear the text floor', () => {
  const bad = [];
  for (const t of THEMES) {
    const surface = colorOf(t.tokens, '--surface');
    // --accent can itself carry alpha (nothing stops #25 from making the tint
    // translucent later); composite it over --surface first, then --accent-ink
    // over THAT, so a translucent accent is judged as it would actually paint.
    const accentOnSurface = effective(colorOf(t.tokens, '--accent'), surface);
    const r0 = contrast(effective(colorOf(t.tokens, '--accent-ink'), accentOnSurface), accentOnSurface);
    if (r0 < t.textFloor - 1e-9) bad.push(`${t.name}: --accent-ink on --accent (over --surface) is ${r0.toFixed(2)}:1, needs >= ${t.textFloor}:1`);
    for (const s of STATUS) {
      const soft = effective(colorOf(t.tokens, `--${s}-soft`), surface);
      const fg = effective(colorOf(t.tokens, `--${s}`), soft);
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
        const ground = colorOf(t.tokens, g);
        const r = contrast(effective(colorOf(t.tokens, tok), ground), ground);
        if (r < t.controlFloor - 1e-9) bad.push(`${t.name}: ${tok} on ${g} is ${r.toFixed(2)}:1, needs >= ${t.controlFloor}:1`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* #25 (team color), items 2 and 6: the nine colors are found by the same
 * list the app uses (`COLORS`, next to `TIE_BREAKS` in storage.js) -- a
 * tenth color added there with no blocks in tokens.css, or a color with a
 * block missing for one of the four states, fails the presence check below
 * rather than silently reading Graphite's values for the state that is
 * missing. Graphite itself needs no block: the base :root / dark blocks
 * declare --tint* at Graphite's values (the selector trap's own comment in
 * tokens.css says why), so it is excluded from the presence check but still
 * walked by the numeric one below. */
test('every non-Graphite color in COLORS has a light, dark, light+more and dark+more block', () => {
  const bad = [];
  for (const c of COLORS) {
    if (c === 'graphite') continue;
    const t = resolved.tint(c);
    if (!t.hasLight) bad.push(`${c}: no ":root:not([data-theme=\\"dark\\"])[data-tint=\\"${c}\\"]" block`);
    if (!t.hasDark) bad.push(`${c}: no ":root[data-theme=\\"dark\\"][data-tint=\\"${c}\\"]" block`);
    if (!t.hasLightMore) bad.push(`${c}: no light block inside @media (prefers-contrast: more)`);
    if (!t.hasDarkMore) bad.push(`${c}: no dark block inside @media (prefers-contrast: more)`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('every color\'s label on its own fill, and its fill as text on every ground, clear their floors', () => {
  const bad = [];
  for (const c of COLORS) {
    const t = resolved.tint(c);
    const states = [
      { name: `${c} light`, tokens: t.light, textFloor: 4.5, controlFloor: 3 },
      { name: `${c} dark`, tokens: t.dark, textFloor: 4.5, controlFloor: 3 },
      { name: `${c} light + more contrast`, tokens: t.lightMore, textFloor: 7, controlFloor: 4.5 },
      { name: `${c} dark + more contrast`, tokens: t.darkMore, textFloor: 7, controlFloor: 4.5 },
    ];
    for (const s of states) {
      const fill = colorOf(s.tokens, '--tint');
      const label = colorOf(s.tokens, '--tint-ink');
      const onFill = contrast(effective(label, fill), fill);
      if (onFill < s.textFloor - 1e-9) {
        bad.push(`${s.name}: --tint-ink on --tint is ${onFill.toFixed(2)}:1, needs >= ${s.textFloor}:1`);
      }
      for (const g of GROUNDS) {
        const ground = colorOf(s.tokens, g);
        const asText = contrast(effective(fill, ground), ground);
        if (asText < s.controlFloor - 1e-9) {
          bad.push(`${s.name}: --tint as text on ${g} is ${asText.toFixed(2)}:1, needs >= ${s.controlFloor}:1`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});
