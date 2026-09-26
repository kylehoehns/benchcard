import { setWidth, TODAY_HOME } from './dom.mjs';
import { tap, evalJSON } from './sheet-drive.mjs';
import { goRich } from './fixtures.mjs';

/* #142's own guard (docs/specs/142-settings-groups.md's Proof section, "Group
 * look" row): Settings adopted the app's shared `.pgrp`/`.prow` grammar, and
 * the four claims a node test cannot make about that -- because they are
 * about the CASCADE, not the markup -- are read back here, in a real
 * browser, at both widths the row names (320 and 390) and both themes:
 *
 *   1. No `.pgrp` carries a border (a bespoke `.side-box` border sneaking
 *      back in, or a dark-theme rule punching one through).
 *   2. Every VISIBLE `h2.pgrp-h` and `p.pgrp-f`'s own TEXT starts 32px from
 *      the screen edge -- the `.wrap` gutter (16px) plus the Settings
 *      modifier's own 1rem (item 3) -- read from a live
 *      `getBoundingClientRect()` plus computed `padding-left`, not the two
 *      numbers added by hand. `#persistNote` ships `hidden` (Decision 6) and
 *      only #backupFootnote's `.pgrp-f` is on screen in the ordinary run
 *      this check drives, so a `[hidden]` element's own rect (all zero,
 *      unlike its rem-based padding, which resolves without layout) must not
 *      be measured as if it were painted.
 *   3. Every header reads sentence case -- computed `text-transform: none`,
 *      not the old `.set-h`/`.side-hd` eyebrow's upper case, and
 *      `letter-spacing` no wider than normal, not that eyebrow's tracked-out
 *      positive spacing. `h1,h2,h3,h4` all carry a small NEGATIVE tracking
 *      app-wide (app.css :49) that a literal `letter-spacing: normal` would
 *      wrongly flag, so this checks the sign, not the value.
 *   4. Only one VISIBLE `p.pgrp-f` sits between one `.pgrp` and the next --
 *      "one footnote per group" (item 5), read from the live sibling chain.
 *
 * `no visible .btn or .linkish control` (item 2) and "every header is an
 * h2.pgrp-h, and there are exactly three" (item 4's other half) are already
 * pinned by test/settings-look.test.js at the markup seam; nothing here
 * repeats them. */
const WIDTHS = [320, 390];
const TOL = 1;

const READ_LOOK = `JSON.stringify((() => {
  const view = document.getElementById('view-settings');
  if (!view) return null;
  const headers = [...view.querySelectorAll('h2.pgrp-h')];
  const groups = [...view.querySelectorAll('.pgrp')];
  const bordered = groups.filter(g => {
    const cs = getComputedStyle(g);
    return parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
  }).map(g => g.className);
  const insets = [...headers, ...view.querySelectorAll('p.pgrp-f')].filter(el => !el.hidden).map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim().slice(0, 24), left: r.left + parseFloat(cs.paddingLeft),
      textTransform: cs.textTransform, letterSpacing: cs.letterSpacing };
  });
  const footnoteCounts = groups.map(g => {
    let n = 0;
    let sib = g.nextElementSibling;
    while (sib && !sib.matches('.pgrp, h2.pgrp-h')) { if (sib.matches('p.pgrp-f') && !sib.hidden) n++; sib = sib.nextElementSibling; }
    return n;
  });
  return { headerCount: headers.length, bordered, insets, footnoteCounts };
})())`;

export async function settingsLookPass(c, origin) {
  const problems = [];
  let measured = 0;

  try {
    for (const theme of ['light', 'dark']) {
      await goRich(c, origin, { theme });
      for (const width of WIDTHS) {
        await setWidth(c, width);
        await tap(c, `document.querySelector('#settingsBtn').click()`);
        const look = await evalJSON(c, READ_LOOK);
        if (!look) { problems.push(`${theme}/${width}px: #view-settings not open -- nothing to measure`); continue; }

        if (look.bordered.length) {
          problems.push(`${theme}/${width}px: ${look.bordered.length} .pgrp group(s) carry a border`);
        }
        for (const ins of look.insets) {
          measured++;
          if (Math.abs(ins.left - 32) > TOL) {
            problems.push(`${theme}/${width}px: "${ins.text}" text starts at ${ins.left.toFixed(1)}px, want 32px`);
          }
          if (ins.textTransform !== 'none') {
            problems.push(`${theme}/${width}px: "${ins.text}" text-transform is ${ins.textTransform}, want none`);
          }
          if (ins.letterSpacing !== 'normal' && parseFloat(ins.letterSpacing) > 0) {
            problems.push(`${theme}/${width}px: "${ins.text}" letter-spacing is ${ins.letterSpacing}, want normal or tighter, not tracked out`);
          }
        }
        const overCount = look.footnoteCounts.filter(n => n > 1).length;
        if (overCount) problems.push(`${theme}/${width}px: ${overCount} group(s) show more than one footnote`);

        await tap(c, TODAY_HOME);
      }
    }

    // Rule 2a: a run that never found #view-settings open measured nothing.
    if (measured === 0 && problems.length === 0) {
      problems.push('no header or footnote was measured in any pass -- a broken probe, not a pass');
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await setWidth(c, 390);
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${measured} header/footnote(s) at 32px, sentence case, no .pgrp border, one footnote per group -- ${WIDTHS.join('/')}px, light and dark`,
  };
}
