/* #141 (one control each), item 5 ("Start game"): `#gmOpen` is `.btn.primary`
 * now and stretches to its panel's width, instead of a plain `.btn` sitting
 * centered at its own content width. Checked at 840 and 1280 -- the two
 * widths `.gm-start` is ever shown at (`@media (max-width: 839px)` hides it,
 * `#actionbar` covers the phone instead) -- plus that it is still the only
 * filled button on screen (C2) and still hidden below 840.
 *
 * "The panel's content box" is read as `.gm-start`'s own rendered width, not
 * `.col-side`'s: below the 1100px two-column breakpoint `.col-side` is
 * `display: contents` (app.css's own stacked-layout comment) and has no box
 * of its own, but `.gm-start` always does, and `.cols`'s `align-items:
 * stretch` (narrow) / block layout (wide) both give it the panel's full
 * width either way -- the same width `#gmOpen` is being asked to match. */
import { evalIn, step, TODAY_HOME, WIDTH, CSS_VAR_COLOR_PROBE } from './dom.mjs';
import { land, resize } from './page-state.mjs';

const TOL = 1;

async function measure(c) {
  return JSON.parse(await evalIn(c, `(() => {
    const gmOpen = document.getElementById('gmOpen');
    const gmStart = document.querySelector('.gm-start');
    const visible = el => !!el && el.getClientRects().length > 0;
    return JSON.stringify({
      gmOpenVisible: visible(gmOpen),
      gmOpenW: visible(gmOpen) ? gmOpen.getBoundingClientRect().width : null,
      gmStartW: visible(gmStart) ? gmStart.getBoundingClientRect().width : null,
      bg: visible(gmOpen) ? getComputedStyle(gmOpen).backgroundColor : null,
      isPrimary: gmOpen ? gmOpen.classList.contains('primary') : false,
      filledCount: [...document.querySelectorAll('.btn.primary')].filter(visible).length,
      filledIds: [...document.querySelectorAll('.btn.primary')].filter(visible).map(el => el.id || el.className),
    });
  })()`));
}

export async function gmOpenPass(c, origin, rec) {
  let measured = 0;

  try {
    await land(c, origin);
    const tint = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})('var(--tint)')`);

    for (const width of [840, 1280]) {
      await resize(c, width);
      const m = await measure(c);
      if (!m.gmOpenVisible) { rec.fail(`${width}px: #gmOpen is not visible -- nothing measured`); continue; }
      measured++;

      rec.check(m.isPrimary, `${width}px: #gmOpen is not classed .primary`);
      rec.check(m.bg === tint, `${width}px: #gmOpen background is ${m.bg}, want ${tint} (--tint)`);
      if (m.gmStartW == null) rec.fail(`${width}px: .gm-start is not visible -- nothing to compare #gmOpen's width to`);
      else {
        rec.check(Math.abs(m.gmOpenW - m.gmStartW) <= TOL, `${width}px: #gmOpen is ${m.gmOpenW}px wide, its panel (.gm-start) is ${m.gmStartW}px`);
      }
      rec.check(m.filledCount === 1, `${width}px: ${m.filledCount} filled .btn.primary element(s) on screen (${m.filledIds.join(', ')}), want exactly 1`);
    }

    // Below 840, #gmOpen is still hidden -- #actionbar covers Start game there.
    await resize(c, 800);
    const below = await measure(c);
    if (rec.check(!below.gmOpenVisible, '800px: #gmOpen is visible, want it hidden below 840')) measured++;

    // Rule 2a: 2 widths' worth of #gmOpen measurements, plus the below-840 check.
    rec.check(measured >= 3, `only ${measured}/3 measurements were taken -- a selector stopped matching`);
  } finally {
    // The rows after this one measure at the phone width; leave it that way.
    await resize(c, WIDTH);
    await evalIn(c, step(TODAY_HOME));
  }

  rec.ok(`#gmOpen is filled and matches .gm-start's full width at 840/1280px, the only filled button on screen, still hidden below 840`);
}
