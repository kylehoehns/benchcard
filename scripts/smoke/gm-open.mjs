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
import { evalIn, step, TODAY_HOME, WIDTH, HEIGHT, CSS_VAR_COLOR_PROBE } from './dom.mjs';
import { goRich } from './fixtures.mjs';

const TOL = 1;

async function setWidth(c, width) {
  await c.send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
}

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

export async function gmOpenPass(c, origin) {
  const problems = [];
  let measured = 0;

  try {
    await goRich(c, origin);
    const tint = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})('var(--tint)')`);

    for (const width of [840, 1280]) {
      await setWidth(c, width);
      const m = await measure(c);
      if (!m.gmOpenVisible) { problems.push(`${width}px: #gmOpen is not visible -- nothing measured`); continue; }
      measured++;

      if (!m.isPrimary) problems.push(`${width}px: #gmOpen is not classed .primary`);
      if (m.bg !== tint) problems.push(`${width}px: #gmOpen background is ${m.bg}, want ${tint} (--tint)`);
      if (m.gmStartW == null) problems.push(`${width}px: .gm-start is not visible -- nothing to compare #gmOpen's width to`);
      else if (Math.abs(m.gmOpenW - m.gmStartW) > TOL) {
        problems.push(`${width}px: #gmOpen is ${m.gmOpenW}px wide, its panel (.gm-start) is ${m.gmStartW}px`);
      }
      if (m.filledCount !== 1) {
        problems.push(`${width}px: ${m.filledCount} filled .btn.primary element(s) on screen (${m.filledIds.join(', ')}), want exactly 1`);
      }
    }

    // Below 840, #gmOpen is still hidden -- #actionbar covers Start game there.
    await setWidth(c, 800);
    const below = await measure(c);
    if (below.gmOpenVisible) problems.push('800px: #gmOpen is visible, want it hidden below 840');
    else measured++;

    // Rule 2a: 2 widths' worth of #gmOpen measurements, plus the below-840 check.
    if (measured < 3) problems.push(`only ${measured}/3 measurements were taken -- a selector stopped matching`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    // The rows after this one measure at the phone width; leave it that way.
    await setWidth(c, WIDTH);
    await evalIn(c, step(TODAY_HOME));
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `#gmOpen is filled and matches .gm-start's full width at 840/1280px, the only filled button on screen, still hidden below 840`,
  };
}
