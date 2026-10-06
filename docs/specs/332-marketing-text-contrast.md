# #332: orange text on the about and advanced pages passes contrast

**Issue** — #332. The small orange text on `about.html` and `advanced.html`
(links, labels, the "16 min" total) measures under 4.5:1; give it a darker
orange that passes, and keep Hardwood for fills and the headline.

**Goal** — a reader on either page can read every link and small label,
in light, dark and both more-contrast modes, and the pages still look like
#231's Hardwood pages: orange button, orange headline phrase, orange links.

**What would settle it** (the owner's decision, issue comments)

1. One new page-level token, `--accent-text`, on both pages:
   - light: `#B04308` (rgb(176, 67, 8));
   - dark: Hardwood unchanged, `#FF7A2A` (rgb(255, 122, 42)), i.e. `var(--tint)`;
   - light + more contrast: `--ink`, rgb(28, 28, 30);
   - dark + more contrast: `--ink`, rgb(244, 244, 246).
2. These paint `--accent-text`:
   - both pages: every `a` link that takes the page's link color (body links,
     `.more a`, footer links) and the `.jumpto a` hover and focus-visible color;
   - about: the "16 min" totals (`.tl-tot.hi`) and the step numbers 1–5
     (`ol.steps li::before`);
   - advanced: the `.sn-h` label ("Season · 4 games").
3. Advanced's selected "This stint" chip (`.scp.on`) paints `--ink` in every
   state, matching the app's bench-mode toggle (#328). Its soft fill stays.
4. Unchanged, still Hardwood `--tint`/`--accent`: `.btn.primary`'s fill, the
   `.hl` headline phrase, the switch fill, list bullets (`ul li::marker`,
   non-text), `--accent-soft` fills, the plate gradient, focus outlines.
5. Ratios, every small orange text on its real ground:
   - light: ≥ 4.5:1 on `--bg`, `--surface`, `--surface-2`, the plate
     (`--bg-2` under 7% of the accent, the worst point of its gradient), and
     the step numbers on `--accent-soft` over `--bg`. Expected: 5.23 on `--bg`,
     4.63 on the plate, 4.61 for the step numbers;
   - dark: ≥ 4.5:1 on the same grounds (Hardwood is ≥ 5.22 today);
   - light and dark + more contrast: ≥ 7:1 on the same grounds (`--ink`).
6. A test walks every rule on both pages that paints text with an orange token
   and fails on any small-text rule not using `--accent-text` (only `.hl`, the
   large headline, may paint `--tint`/`--accent` as text), and guards the
   ratios in item 5.
7. Look check: both pages at 320 and 390px, light and dark, 16 and 32px text,
   plus more contrast.

**Surfaces**
- Change: `app/about.html` and `app/advanced.html` (their `<style>` only),
  `app/sw.js` (via `npm run sw:bump`: both pages are precached),
  `scripts/smoke/hardwood-pages.mjs`, `test/contrast.test.js` (a new block at
  the end of the file).
- Must not change: `app/tokens.css` (the app's tokens), `app/app.css`, the
  about page's `<meta name="description">` (#331 is editing it), any markup.

**Constraints**
- The precache bump: run `npm run sw:bump` after the page edits.
- Selector trap (tokens.css, `scripts/tokens-css.mjs` header): every theme arm
  names its theme explicitly. The page's existing remap is
  `html:root[data-tint="hardwood"]`; the light arm is
  `html:root:not([data-theme="dark"])[data-tint="hardwood"]`, and the
  more-contrast block names both arms
  (`html:root:not([data-theme="dark"])[data-tint="hardwood"]`,
  `html:root[data-theme="dark"][data-tint="hardwood"]`), so it outranks the
  light arm by source order and the dark default by specificity.
- Reuse `scripts/tokens-css.mjs` (`parseTokensCss`, `splitBlocks`, `declsOf`,
  `colorOf`, `over`, `contrast`) for every ratio; do not write a second
  contrast calculator. `tint('hardwood')` gives the four Hardwood states.
- The smoke check keeps its expected colors as rgb() literals from this spec,
  never read back from the CSS (the file's own rule), and samples the painted
  backdrop with `samplePixels` the way it already does.
- Another lane (#329) is editing `test/contrast.test.js`: add this ticket's
  tests in their own block at the end of the file.
- American spelling.

**Design**
- In each page's `<style>`, beside the #231 remap, declare `--accent-text`
  per item 1, and switch the item 2 rules from `var(--accent)` to
  `var(--accent-text)`; `.scp.on` takes `color: var(--ink)`.

**Proof**
- **Smoke, `welcome, about and advanced carry the Hardwood orange`**
  (`scripts/smoke/hardwood-pages.mjs`), items 1–5 in a real browser across its
  four existing cases: links (`p a`) expect `--accent-text`'s value instead of
  Hardwood; add per page each small orange text (about: `footer a`,
  `.tl-tot.hi`, `ol.steps li::before`; advanced: `footer a`, `.sn-h`,
  `.scp.on`), asserting its color equals the item 1 / item 3 literal and its
  ratio against the painted backdrop clears 4.5 (7 under more contrast). The
  button fill and `.hl` keep expecting Hardwood (item 4). A missing element
  fails. Red before the CSS change: light links read rgb(210, 80, 10).
- **`node --test test/contrast.test.js`**, a guard under `/new-guard`, for
  items 5 and 6: parse each page's `<style>` with `splitBlocks`/`declsOf`,
  resolve `--accent-text` in the four Hardwood states (tokens.css's
  `tint('hardwood')` plus the page's own blocks), check item 5's grounds; and
  walk every `color:` declaration in the page's rules that references an
  orange token (`--accent`, `--accent-2`, `--tint`, `--tint-2`, `--phrase`),
  failing on any selector other than `.hl`. Shown red by reverting one rule
  (e.g. `.sn-h` back to `--accent`) and by adding a new orange-text rule.
- **`/browser-verify` and `scripts/look.mjs`** for item 7.

**Out of scope** — the app's own team-color text (#329); the welcome screen;
non-text uses of the orange; the chart pages.
