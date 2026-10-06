import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTokensCss, parseColor, colorOf, over, contrast, luminance, splitBlocks, declsOf, stripAllComments } from '../scripts/tokens-css.mjs';
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
 * would tie with `:root[data-theme="dark"]` at equal specificity and lose on
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

const appCss = read('app/app.css');

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
    + ':root[data-theme="dark"] at equal specificity and loses on source order, painting light values '
    + 'onto a dark phone. found: ' + nested.join(', '));
});

test('parseColor fails closed on a value it does not recognize', () => {
  assert.equal(parseColor('oklch(0.72 0.15 26)'), null);
  assert.equal(parseColor('banana'), null);
  assert.throws(() => colorOf({ '--x': 'banana' }, '--x'), /could not be parsed/);
  assert.throws(() => colorOf({}, '--missing'), /is not declared/);
});

/* #151 finding: dark `--on-err` restates dark `--bg-2`'s literal on purpose
 * (app/tokens.css) and is being changed to `var(--bg-2)` so the two stop
 * drifting independently. `colorOf` never resolved a `var()` reference
 * before this token needed it -- these three cases are the seam that change
 * relies on: a one-level reference resolves to its target's color, a
 * reference to a name absent from the theme still fails closed (never
 * silently skipped), and a reference cycle fails closed too rather than
 * looping forever. */
test('colorOf resolves a var() reference to another token in the same theme, and still fails closed', () => {
  assert.deepEqual(colorOf({ '--a': 'var(--b)', '--b': '#131314' }, '--a'), { r: 19, g: 19, b: 20, a: 1 });
  assert.throws(() => colorOf({ '--a': 'var(--missing)' }, '--a'), /--missing.*not declared/);
  assert.throws(() => colorOf({ '--a': 'var(--b)', '--b': 'var(--a)' }, '--a'), /cycles/);
});

const THEMES = [
  { name: 'light', tokens: light, textFloor: 4.5, controlFloor: 3 },
  { name: 'dark', tokens: dark, textFloor: 4.5, controlFloor: 3 },
  { name: 'light + more contrast', tokens: lightMore, textFloor: 7, controlFloor: 4.5 },
  { name: 'dark + more contrast', tokens: darkMore, textFloor: 7, controlFloor: 4.5 },
];

const GROUNDS = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3', '--sheet'];
const TEXT_TOKENS = ['--ink', '--ink-2', '--muted', '--ok', '--warn', '--err', '--info'];
const CONTROL_TOKENS = ['--accent', '--ok', '--warn', '--err', '--info'];
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

/* A segmented control paints on its own ground, `--seg-track`, which is not in
 * GROUNDS: only two colors ever land on it, and putting it there would demand
 * that `--muted`, `--info` and the rest clear a floor on a surface they never
 * touch. The two that do touch it are checked here instead.
 *
 * `--seg-track` had to go darker than `--surface-2` for the pill to read at
 * all in light mode, and that is exactly the move that costs contrast -- so
 * the pair is pinned rather than left to a hand measurement that was true on
 * the day someone took it. `--seg-on` is the raised chip the selected label
 * sits on, which is a different ground from the track around it. The
 * selected label's own pair is checked in the next test, across every team
 * color (#324): this one covers only the unselected label and only the four
 * base themes. */
test('a segmented control\'s unselected label clears the text floor on --seg-track', () => {
  const bad = [];
  for (const t of THEMES) {
    for (const [fg, bgTok] of [['--ink', '--seg-track']]) {
      const ground = colorOf(t.tokens, bgTok);
      const r = contrast(effective(colorOf(t.tokens, fg), ground), ground);
      if (r < t.textFloor - 1e-9) bad.push(`${t.name}: ${fg} on ${bgTok} is ${r.toFixed(2)}:1, needs >= ${t.textFloor}:1`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* #324: the selected label's color is READ from app.css's own rule, the way
 * DANGER_HOVER_MIX is below, so a change of token is what this reacts to.
 * It was `--tint`, checked only on the four base themes (Graphite's tint),
 * and a first run is Hardwood: dark #FF7A2A on dark --seg-on was 3.39:1
 * here (Lighthouse rounded it to 3.38).
 * The owner's decision is `--ink`. This walks every color in COLORS in all
 * four states, because that is the sweep the base-theme check never made.
 * Fix a failure by choosing a token that clears the floor, not by dropping a
 * color from COLORS. */
/* #329 widens the same walk to the other small text painted in the team
 * color. The owner's decision for each is `--ink`, as in #324/#328; the
 * welcome heading's `.hl` stays `--tint` (large text, held by the "tint as
 * text" check above). One table, one walk: a new use is a new row. */
const TEAM_TEXT_USES = [
  { name: 'the selected segment label', ground: '--seg-on',
    selector: '.seg button.on, .seg button[aria-selected="true"]', rule: /\.seg button\.on,\s*\.seg button\[aria-selected="true"\]\s*\{[^}]*?[\s;{]color:\s*var\((--[a-z0-9-]+)\)/ },
  { name: '.flow-card-use', ground: '--surface',
    selector: '.flow-card-use', rule: /\.flow-card-use\s*\{[^}]*?[\s;{]color:\s*var\((--[a-z0-9-]+)\)/ },
  { name: '.plr-check', ground: '--surface',
    selector: '.plr-check', rule: /\.plr-check\s*\{[^}]*?[\s;{]color:\s*var\((--[a-z0-9-]+)\)/ },
];
const textTokenOf = (use, css) => {
  const m = css.match(use.rule);
  if (!m) throw new Error(`could not find \`${use.selector} { ... color: var(--token) ... }\` in app/app.css`);
  return m[1];
};

test('each team-color text rule is found by its selector, and fails closed when it is not', () => {
  for (const use of TEAM_TEXT_USES) {
    assert.match(textTokenOf(use, appCss), /^--[a-z0-9-]+$/, use.name);
    assert.throws(() => textTokenOf(use, appCss.replace(use.selector + ' {', use.selector + '-renamed {')), /could not find/, `${use.name}: a renamed selector must throw`);
    assert.throws(() => textTokenOf(use, `${use.selector} { background: red; }`), /could not find/, `${use.name}: a rule with no color must throw`);
  }
});

for (const use of TEAM_TEXT_USES) {
  test(`${use.name} clears the text floor on ${use.ground}, for every team color in all four states`, () => {
    const token = textTokenOf(use, appCss);
    const bad = [];
    let cells = 0;
    for (const c of COLORS) {
      const t = resolved.tint(c);
      for (const s of [
        { name: `${c} light`, tokens: t.light, floor: 4.5 },
        { name: `${c} dark`, tokens: t.dark, floor: 4.5 },
        { name: `${c} light + more contrast`, tokens: t.lightMore, floor: 7 },
        { name: `${c} dark + more contrast`, tokens: t.darkMore, floor: 7 },
      ]) {
        const ground = colorOf(s.tokens, use.ground);
        const r = contrast(effective(colorOf(s.tokens, token), ground), ground);
        cells++;
        if (r < s.floor - 1e-9) bad.push(`${s.name}: ${token} on ${use.ground} is ${r.toFixed(2)}:1, needs >= ${s.floor}:1`);
      }
    }
    assert.equal(cells, COLORS.length * 4, 'every color x state cell must be measured');
    assert.ok(COLORS.length > 0, 'COLORS is empty, so nothing was measured');
    assert.deepEqual(bad, [], `${bad.length} of ${cells} cells fail:\n  ` + bad.join('\n  '));
  });
}

/* #140 (prototype control size), item 7 and Q3: the switch's off track is a
 * new token, `--switch-track-off`, checked against `--surface` (the only
 * ground a switch ever sits on) at the control floor -- 3:1 in light and
 * dark, 4.5:1 in both more-contrast themes, the same floors `THEMES` already
 * carries for every other control token. The on track is unchanged and out
 * of scope (Q3, item 7's own last sentence). */
test('the switch\'s own off track clears the control floor against --surface, in all four themes', () => {
  const bad = [];
  for (const t of THEMES) {
    const ground = colorOf(t.tokens, '--surface');
    const r = contrast(effective(colorOf(t.tokens, '--switch-track-off'), ground), ground);
    if (r < t.controlFloor - 1e-9) bad.push(`${t.name}: --switch-track-off on --surface is ${r.toFixed(2)}:1, needs >= ${t.controlFloor}:1`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* #137: the header chips (`#backBtn`, `#shareBtn`, `#settingsBtn`, `#teamAdd`
 * and `#teamBtn`) used to fill from `--surface-2`, which is almost the same
 * as `--bg` in light mode and made them nearly vanish. The owner's decision
 * (docs/specs/137-header-chip-fill.md) is a token of the chip's own: the
 * prototype's `--seg-track` gray in light, unchanged from `--surface-2` in
 * dark. Both values are pinned here literally, from the spec, not read back
 * out of whatever app.css currently computes. */
test('--chip is the prototype gray in light and unchanged from --surface-2 in dark', () => {
  assert.equal(light['--chip'], '#E8E8ED', 'light --chip should be #E8E8ED, the prototype/--seg-track gray (#137)');
  assert.equal(dark['--chip'], '#242426', 'dark --chip should be #242426, unchanged from --surface-2 (#137)');
});

/* #137 item 5: `--surface-3` (#F1F1F3) is LIGHTER than the new `--chip`
 * (#E8E8ED) in light mode, so a chip hover rule that darkens by switching to
 * `--surface-3` would actually lighten the chip. `--chip-hover` is a token of
 * its own for this reason -- checked by relative luminance (the same measure
 * `contrast()` is built on), not by eyeballing the two hex values, because a
 * later edit to either token should be caught the same way a color literal
 * would be. */
test('the light chip hover fill is darker than the light chip fill', () => {
  const chip = luminance(colorOf(light, '--chip'));
  const hover = luminance(colorOf(light, '--chip-hover'));
  assert.ok(hover < chip - 1e-9,
    `light --chip-hover should be darker than light --chip: chip luminance ${chip}, hover luminance ${hover}`);
});

/* #137 item 4: the five header controls do not all draw with the same ink.
 * `#backBtn`, `#shareBtn`, `#settingsBtn` and `#teamAdd` are `.btn.icon.ghost`
 * (app/index.html) -- `.btn.ghost` in app.css sets `color: var(--ink-2)`,
 * inherited by their `.i` icon's `currentColor` stroke (app/icons.js). Their
 * icon color is `--ink-2`, not `--ink`. `#teamBtn` is not a `.btn` at all: it
 * sets no color of its own, so its label inherits the page's `--ink` (body's
 * own rule) straight through. Both are checked on `--chip`, across the same
 * four base themes AND every non-Graphite tint's four states (#25), because
 * a tint block that ever redefined either ink should be caught here rather
 * than trusted by inspection. */
test('the header chips\' own icon and label inks clear the text floor on --chip', () => {
  const bad = [];
  const cases = [...THEMES, ...COLORS.flatMap((c) => {
    const t = resolved.tint(c);
    return [
      { name: `${c} light`, tokens: t.light, textFloor: 4.5 },
      { name: `${c} dark`, tokens: t.dark, textFloor: 4.5 },
      { name: `${c} light + more contrast`, tokens: t.lightMore, textFloor: 7 },
      { name: `${c} dark + more contrast`, tokens: t.darkMore, textFloor: 7 },
    ];
  })];
  for (const s of cases) {
    for (const fg of ['--ink-2', '--ink']) {
      const ground = colorOf(s.tokens, '--chip');
      const r = contrast(effective(colorOf(s.tokens, fg), ground), ground);
      if (r < s.textFloor - 1e-9) bad.push(`${s.name}: ${fg} on --chip is ${r.toFixed(2)}:1, needs >= ${s.textFloor}:1`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* #137 item 5: the same icon and label inks checked on `--chip` above also
 * land on `--chip-hover` while a pointer sits over one of the five controls,
 * so the same sweep applies -- every base theme and every non-Graphite
 * tint's four states. */
test('the header chips\' own icon and label inks clear the text floor on --chip-hover', () => {
  const bad = [];
  const cases = [...THEMES, ...COLORS.flatMap((c) => {
    const t = resolved.tint(c);
    return [
      { name: `${c} light`, tokens: t.light, textFloor: 4.5 },
      { name: `${c} dark`, tokens: t.dark, textFloor: 4.5 },
      { name: `${c} light + more contrast`, tokens: t.lightMore, textFloor: 7 },
      { name: `${c} dark + more contrast`, tokens: t.darkMore, textFloor: 7 },
    ];
  })];
  for (const s of cases) {
    for (const fg of ['--ink-2', '--ink']) {
      const ground = colorOf(s.tokens, '--chip-hover');
      const r = contrast(effective(colorOf(s.tokens, fg), ground), ground);
      if (r < s.textFloor - 1e-9) bad.push(`${s.name}: ${fg} on --chip-hover is ${r.toFixed(2)}:1, needs >= ${s.textFloor}:1`);
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

/* #151 item 1: `test/contrast.test.js:98-115` (the pre-existing "on its own
 * soft tint" test above) only ever blends a status tint over `--surface` --
 * `.alert.info` sits directly on the page's `--bg` (`#cardnote`,
 * index.html:804), and `--info` on `--info-soft` over `--bg` measured 4.23:1
 * in light mode there, under the 4.5:1 floor every other text token here is
 * held to. This case adds `--bg` as a second ground beside `--surface`, for
 * every status color, in every theme -- so a future soft tint that only
 * clears its floor on one of the two grounds a `.alert` can actually sit on
 * (a sheet's `--surface`, or the page's own `--bg`) is caught here instead of
 * shipping quietly like `.alert.info` did. */
test('every soft status tint, blended over --bg as well as --surface, clears 4.5:1 in every theme', () => {
  const bad = [];
  for (const t of THEMES) {
    for (const g of ['--bg', '--surface']) {
      const ground = colorOf(t.tokens, g);
      for (const s of STATUS) {
        const soft = effective(colorOf(t.tokens, `--${s}-soft`), ground);
        const fg = effective(colorOf(t.tokens, `--${s}`), soft);
        const r = contrast(fg, soft);
        if (r < 4.5 - 1e-9) bad.push(`${t.name}: --${s} on --${s}-soft (over ${g}) is ${r.toFixed(2)}:1, needs >= 4.5:1`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* #151 item 1's own words, not the flat 4.5:1 the sweep above holds every
 * theme to: "Light mode with more contrast stays at or above its current
 * 6.60:1." A flat 4.5:1 floor would still pass if this tint regressed all
 * the way down to 4.6:1, so this pins the one cell the spec actually names
 * to its own number instead. Compared rounded to 2dp, the way a contrast
 * ratio is normally reported (and the way the spec states "6.60") -- the raw
 * ratio here is 6.596335980947871, a hair under a literal 6.60 threshold. */
test('light + more contrast keeps info-over-bg at or above its current 6.60:1 (#151 item 1)', () => {
  const ground = colorOf(lightMore, '--bg');
  const soft = effective(colorOf(lightMore, '--info-soft'), ground);
  const fg = effective(colorOf(lightMore, '--info'), soft);
  const r = Number(contrast(fg, soft).toFixed(2));
  assert.ok(r >= 6.6, `light + more contrast: --info on --info-soft (over --bg) is ${r}:1, needs >= 6.60:1`);
});

/* #151 item 2: `--phrase-line` (the sentence-style underline, app.css:2714)
 * is Graphite's own value here -- every non-Graphite team color sets it
 * `transparent` (tokens.css's own comment above the tint blocks says why),
 * and that non-text case is smoke-tested elsewhere
 * (scripts/smoke/team-color.mjs's own `--phrase-line: transparent`
 * assertion, which #151 leaves unchanged). Graphite's underline measured
 * 2.00:1 against `--bg` in light mode, under WCAG's 3:1 floor for a
 * non-text/decorative graphic like an underline; dark mode already cleared
 * it at 3.55:1. */
test('the phrase underline clears 3:1 against --bg in light and dark, base and more-contrast', () => {
  const bad = [];
  for (const t of THEMES) {
    const bg = colorOf(t.tokens, '--bg');
    const line = effective(colorOf(t.tokens, '--phrase-line'), bg);
    const r = contrast(line, bg);
    if (r < 3 - 1e-9) bad.push(`${t.name}: --phrase-line on --bg is ${r.toFixed(2)}:1, needs >= 3:1`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* #151 item 3: `.btn.danger` (app.css:285) painted the literal `#fff` on
 * `--err`, which measured 2.93:1 in dark mode and 1.91:1 in dark + more
 * contrast -- `--err` itself is a text color elsewhere and is not changed
 * (item 3's own words), so the fix is a new token, `--on-err`, with its own
 * value per theme. The hover fill (`.btn.danger:hover`, app.css:286) is
 * `color-mix(in srgb, var(--err) 86%, #000)` -- a straight linear mix toward
 * black in sRGB space, reproduced here by the same arithmetic the CSS spec
 * defines for `color-mix(in srgb, …)`. The 86% itself is READ from app.css's
 * own rule text, not retyped as a second copy: a future edit to that
 * percentage is what this test should react to, not a stale literal here
 * that quietly stops matching what the button actually paints. */
const DANGER_HOVER_MIX = /\.btn\.danger:hover\s*\{\s*background:\s*color-mix\(in srgb,\s*var\(--err\)\s*(\d+(?:\.\d+)?)%,\s*#000\)/;
const dangerHoverMatch = appCss.match(DANGER_HOVER_MIX);
if (!dangerHoverMatch) throw new Error('could not find .btn.danger:hover\'s color-mix(in srgb, var(--err) N%, #000) rule in app/app.css');
const DANGER_HOVER_PCT = parseFloat(dangerHoverMatch[1]) / 100;

const mixToBlack = (c, pct) => ({ r: c.r * pct, g: c.g * pct, b: c.b * pct, a: 1 });

test('--on-err on --err, and on its hover fill, clears 4.5:1 in every theme', () => {
  const bad = [];
  for (const t of THEMES) {
    const err = colorOf(t.tokens, '--err');
    const onErr = colorOf(t.tokens, '--on-err');
    const r1 = contrast(onErr, err);
    if (r1 < 4.5 - 1e-9) bad.push(`${t.name}: --on-err on --err is ${r1.toFixed(2)}:1, needs >= 4.5:1`);
    const hoverErr = mixToBlack(err, DANGER_HOVER_PCT);
    const r2 = contrast(onErr, hoverErr);
    if (r2 < 4.5 - 1e-9) bad.push(`${t.name}: --on-err on --err's hover fill is ${r2.toFixed(2)}:1, needs >= 4.5:1`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

/* =========================================================================
 * #332: the small orange text on about.html and advanced.html. A GUARD under
 * /new-guard: it reads the pages' own <style>, so it is shown red by
 * mutation (docs/specs/332-marketing-text-contrast.md, Proof). Everything
 * below belongs to this ticket; the tests above are not touched.
 *
 * Two questions. (1) Does `--accent-text` clear the floor on every ground
 * the small orange text lands on, in the four Hardwood states? The cascade
 * is resolved with the same rule a browser applies: specificity first (an
 * arm that names its theme outranks the bare `html:root[data-tint]`
 * default), then source order -- so a more-contrast block that forgot to
 * name both themes loses to the light arm and fails here, the selector trap.
 * (2) Does every rule that paints text an orange token use `--accent-text`?
 * Only `.hl`, the large headline, may paint `--tint`/`--accent`. The list
 * bullets (`ul li::marker`, non-text, spec item 4) are named below. */
const PAGES_332 = {
  'about.html': { rules: ['a', '.jumpto a:focus-visible', '.jumpto a:hover', '.tl-tot.hi', 'ol.steps li::before'] },
  'advanced.html': { rules: ['a', '.jumpto a:focus-visible', '.jumpto a:hover', '.sn-h'] },
};
const ORANGE_TEXT_OK = new Set(['.hl', 'ul li::marker']);
const ORANGE_TOKEN = /var\(\s*--(?:accent|accent-2|tint|tint-2|phrase)\s*[,)]/;

/* Every style rule on a page, in source order, @media/@supports flattened;
 * `more` marks a rule that sits inside (prefers-contrast: more). */
function pageRules(file) {
  const html = stripAllComments(read('app/' + file));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const out = [];
  const walk = (src, more) => {
    for (const b of splitBlocks(src)) {
      if (b.selector.startsWith('@')) walk(b.body, more || /prefers-contrast:\s*more\b/.test(b.selector));
      else out.push({ selector: b.selector, body: b.body, more });
    }
  };
  for (const st of styles) walk(st, false);
  return out;
}

/* The page's custom properties in one Hardwood state, over tokens.css's own. */
function stateTheme(rules, base, { dark, more }) {
  const hits = [];
  rules.forEach((r, order) => {
    const d = declsOf(r.body);
    if (!Object.keys(d).length) return;
    if (r.more && !more) return;
    for (const piece of r.selector.split(',').map((x) => x.trim())) {
      if (!piece.startsWith('html:root') || !piece.includes('[data-tint="hardwood"]')) continue;
      const lightOnly = piece.includes(':not([data-theme="dark"])');
      const darkOnly = !lightOnly && piece.includes('[data-theme="dark"]');
      if ((lightOnly && dark) || (darkOnly && !dark)) continue;
      hits.push({ rank: lightOnly || darkOnly ? 1 : 0, order, d });
      break;
    }
  });
  hits.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return hits.reduce((acc, h) => ({ ...acc, ...h.d }), { ...base });
}

const hardwood = resolved.tint('hardwood');
const STATES_332 = [
  { name: 'light', base: hardwood.light, dark: false, more: false, floor: 4.5 },
  { name: 'dark', base: hardwood.dark, dark: true, more: false, floor: 4.5 },
  { name: 'light + more contrast', base: hardwood.lightMore, dark: false, more: true, floor: 7 },
  { name: 'dark + more contrast', base: hardwood.darkMore, dark: true, more: true, floor: 7 },
];

for (const file of Object.keys(PAGES_332)) {
  test(`${file}: --accent-text clears its floor on every ground, in the four Hardwood states (#332)`, () => {
    const rules = pageRules(file);
    const bad = [];
    let measured = 0;
    for (const st of STATES_332) {
      const th = stateTheme(rules, st.base, st);
      const bg = colorOf(th, '--bg');
      const bg2 = colorOf(th, '--bg-2');
      const accent = colorOf(th, '--accent');
      const grounds = {
        '--bg': bg,
        '--surface': over(colorOf(th, '--surface'), bg),
        '--surface-2': over(colorOf(th, '--surface-2'), bg),
        // the plate's gradient: 7% of the accent over --bg-2, its worst point
        'the plate (--bg-2 under 7% accent)': over({ ...accent, a: 0.07 }, bg2),
        'step numbers (--accent-soft over --bg)': over(colorOf(th, '--accent-soft'), bg),
      };
      for (const [name, ground] of Object.entries(grounds)) {
        const fg = over(colorOf(th, '--accent-text'), ground);
        const r = contrast(fg, ground);
        measured++;
        if (r < st.floor - 1e-9) bad.push(`${file}, ${st.name}: --accent-text on ${name} is ${r.toFixed(2)}:1, needs >= ${st.floor}:1`);
      }
    }
    assert.equal(measured, 20, 'measured nothing: 4 states x 5 grounds');
    assert.deepEqual(bad, [], bad.join('\n  '));
  });

  test(`${file}: only .hl paints an orange token as text; the small orange text uses --accent-text (#332)`, () => {
    const rules = pageRules(file);
    const colorDecl = /(?<![-\w])color\s*:\s*([^;}]+)/g;
    const painted = []; // { selector, value } for every `color:` declaration
    for (const r of rules) for (const m of r.body.matchAll(colorDecl)) painted.push({ selector: r.selector, value: m[1].trim() });
    assert.ok(painted.length > 10, `read ${painted.length} color declarations; expected a page's worth`);
    const stray = painted.filter((p) => ORANGE_TOKEN.test(p.value) && !ORANGE_TEXT_OK.has(p.selector))
      .map((p) => `${file}: "${p.selector}" paints ${p.value} as text; small orange text takes var(--accent-text) (only .hl may paint --tint/--accent)`);
    assert.deepEqual(stray, [], stray.join('\n  '));
    const hl = painted.find((p) => p.selector === '.hl');
    assert.ok(hl && /var\(--tint\)/.test(hl.value), `${file}: .hl no longer paints var(--tint), the headline keeps Hardwood`);
    const missing = PAGES_332[file].rules.filter((sel) => !painted.some((p) => p.selector === sel && /^var\(--accent-text\)$/.test(p.value)))
      .map((sel) => `${file}: "${sel}" does not paint var(--accent-text)`);
    assert.deepEqual(missing, [], missing.join('\n  '));
  });
}

test('advanced.html: the selected "This stint" chip paints --ink in every state (#332)', () => {
  const chip = pageRules('advanced.html').filter((r) => r.selector === '.scp.on');
  assert.ok(chip.length > 0, 'no .scp.on rule on advanced.html');
  assert.ok(chip.some((r) => /(?<![-\w])color\s*:\s*var\(--ink\)/.test(r.body)), '.scp.on must paint color: var(--ink)');
});
