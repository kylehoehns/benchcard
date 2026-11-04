/* #611: make the stylesheet's `em` media queries follow the text size a coach
 * chose. An `em` in a media query is the browser's default size, never the
 * root's (Media Queries 4, section 1.3), so when only the root grows -- as on
 * an iPhone with Larger Text, where `app.css`'s one `-apple-system-body` rule
 * resizes `html` -- `(max-width: 19em)` stays at 304px and no large-text layout
 * applies. Chrome's own default-size setting moves the default, so the queries
 * fire there already; there the root equals the default, the factor is 1, and
 * nothing here rewrites anything.
 *
 * `scaleEm` is pure. The rest reads the page and is exercised by the WebKit
 * row `today at large text` and by smoke's large-text pass. */

/* Every `<n>em` in a media condition becomes px at the root's size
 * (`n x basePx x factor`). `rem`, `px` and the rest are untouched; a factor of
 * 1 returns the text as it came. */
export function scaleEm(mediaText, factor, basePx) {
  if (factor === 1) return mediaText;
  return mediaText.replace(/(?<![\w.-])(\d*\.?\d+)em\b/g,
    (_, n) => `${+(parseFloat(n) * basePx * factor).toFixed(3)}px`);
}

/* iOS and iPadOS, where the root comes from `-apple-system-body`: the same
 * gate as that rule in app.css. Apple's body style is 17pt at the default
 * size, so 17px is the root with nothing turned up. */
const IOS_BASE_PX = 17;

/* The factor -- the root's size over its base, 1 at the default iPhone size and
 * wherever no author rule sets the root -- and the base. Elsewhere the base is the
 * browser's default, read off an element at `font-size: medium`. */
function measure() {
  const ios = !!globalThis.CSS?.supports?.('-webkit-touch-callout', 'none');
  let basePx = IOS_BASE_PX;
  if (!ios) {
    const probe = document.createElement('div');
    probe.style.cssText = 'font-size: medium; position: absolute; visibility: hidden';
    document.body.appendChild(probe);
    basePx = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
  }
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return { basePx, factor: rootPx / basePx };
}

/* A media rule's text as the stylesheet wrote it, so scaling twice, or after
 * the factor goes back to 1, is exact. */
const ORIGINAL = new WeakMap();

function scaleRules(rules, factor, basePx) {
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) {
      if (!ORIGINAL.has(rule)) ORIGINAL.set(rule, rule.media.mediaText);
      const want = scaleEm(ORIGINAL.get(rule), factor, basePx);
      if (rule.media.mediaText !== want) rule.media.mediaText = want;
    }
    // `@supports`, a nested `@media`: any grouping rule.
    if (rule.cssRules) scaleRules(rule.cssRules, factor, basePx);
  }
}

/* Rewrite every readable stylesheet's `em` media rules for the current text
 * size. Setting `media.mediaText` re-evaluates the rule in WebKit and
 * Chromium. A cross-origin sheet throws on `cssRules` and is skipped. */
export function scaleBreakpoints() {
  const { factor, basePx } = measure();
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    scaleRules(rules, factor, basePx);
  }
}

/* A query for `matchMedia`, scaled the same way. */
export function mq(query) {
  const { factor, basePx } = measure();
  return scaleEm(query, factor, basePx);
}
