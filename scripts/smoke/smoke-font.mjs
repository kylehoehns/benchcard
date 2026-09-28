/* #177: "One font for smoke, no Docker" (the maintainer's decision, on the
 * issue). CI's smoke job runs Chrome on Ubuntu, whose fonts are wider than a
 * Mac's -- `AGENTS.md`'s "Smoke forces CI's font on a Mac too" paragraph --
 * so this harness forces DejaVu Sans, CI's own resolved face, onto every page
 * it opens, on a Mac and in CI alike. `scripts/smoke.mjs` registers the
 * script this module builds with `Page.addScriptToEvaluateOnNewDocument`,
 * right beside the seed/viewport script it already carries, so every
 * navigation of the one smoke page gets it before the page's own scripts run.
 *
 * The two release `.ttf` files live under `scripts/fonts/` -- NOT
 * `scripts/smoke/`, which `test/smoke-size.test.js` caps at 55,000 bytes per
 * file and a font file is hundreds of KB -- read once here, base64-encoded,
 * and turned into one script. They never ship to a coach: nothing under
 * `app/` reads `scripts/fonts/`, and `wrangler.jsonc`'s `assets.directory`
 * only publishes `app/` (`AGENTS.md` § Layout).
 *
 * `buildFontInjectionScript` is the pure half, exported on its own for
 * `test/smoke-font.test.js`: given the two faces' already-base64'd bytes and
 * the family name, it returns the script text that decodes each face's own
 * bytes -- not the base64 text -- into a `FontFace` (weight 400 for the book
 * face, weight 700 for the bold one, no range: "CSS's own weight matching
 * then picks Book for 500 and Bold for 600 and 800, the same as CI's
 * fontconfig" only holds with two discrete weights, not a range), adds both
 * to `document.fonts`, then constructs one stylesheet overriding `--font`
 * and appends it to `document.adoptedStyleSheets`. No network request and no
 * DOM node -- the FontFace source is the decoded bytes themselves, and the
 * override lives in a stylesheet object, never a `<style>` element -- so the
 * three smoke budgets (bytes, requests, nodes) cannot move. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildFontInjectionScript({ bookBase64, boldBase64, family }) {
  return `(() => {
  const decode = b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  };
  const faces = [
    { b64: ${JSON.stringify(bookBase64)}, weight: '400' },
    { b64: ${JSON.stringify(boldBase64)}, weight: '700' },
  ];
  for (const { b64, weight } of faces) {
    document.fonts.add(new FontFace(${JSON.stringify(family)}, decode(b64), { weight }));
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(':root { --font: ${JSON.stringify(family)} !important; }');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
})();`;
}

/* The family name every FontFace above declares, and the one
 * `CSS.getPlatformFontsForNode` must report back -- CI's own resolved face
 * (the issue's Decisions section: `system-ui` resolves to DejaVu Sans on the
 * Ubuntu runner), not a smoke-only alias, so the smoke check that reads
 * platform fonts (`font-draws.mjs`) imports this rather than re-typing the
 * string it is asserting against. */
export const SMOKE_FONT_FAMILY = 'DejaVu Sans';

// Node-only from here down: reading the two real font files off disk, once,
// at import time -- never re-read per browserChecks() call or per row.
const FONTS_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), 'fonts');
const toBase64 = name => readFileSync(join(FONTS_DIR, name)).toString('base64');

export const FONT_INJECTION_SCRIPT = buildFontInjectionScript({
  bookBase64: toBase64('DejaVuSans.ttf'),
  boldBase64: toBase64('DejaVuSans-Bold.ttf'),
  family: SMOKE_FONT_FAMILY,
});
