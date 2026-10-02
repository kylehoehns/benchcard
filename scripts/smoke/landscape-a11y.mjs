import { evalIn, TODAY_HOME, WIDTH, HEIGHT, computedStyle } from './dom.mjs';
import { tap, evalJSON } from './sheet-drive.mjs';
import { resize } from './page-state.mjs';

/* #151 item 8: a phone held sideways (844x390) puts a tall column behind a
 * short window -- `app.css`'s own two `@media (orientation: landscape) and
 * (max-height: 560px)` blocks (one for bench mode's `.gm-*` chrome, one for
 * the shared `.bar`/`.wrap` chrome) trim padding so the coach is not left
 * scrolling. This reads one rule from each block BEFORE and AFTER the
 * width change and asserts the computed value actually moves -- proof the
 * rule is live, not just present in the stylesheet (a check that only read
 * the landscape value once could not tell a live rule from a coincidence).
 */
// #145 item 8's `computedStyle(c, sel, props)` (dom.mjs) already probes one
// selector's computed style and returns null when nothing matches -- reused
// here instead of re-rolling the same three `getComputedStyle` probes.
async function readLandscape(c) {
  const bar = await computedStyle(c, '.bar', ['paddingTop']);
  const wrap = await computedStyle(c, '.wrap', ['paddingBottom']);
  const nav = await computedStyle(c, '.gm-nav', ['height']);
  return { barPt: bar ? bar.paddingTop : null, wrapPb: wrap ? wrap.paddingBottom : null, gmNavH: nav ? nav.height : null };
}

const NAV_RECTS_JS = `JSON.stringify([...document.querySelectorAll('.gm-nav')]
  .filter(el => !el.hidden && getComputedStyle(el).display !== 'none')
  .map(el => el.getBoundingClientRect())
  .map(r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })))`;

export async function landscapeA11yPass(c, origin) {
  const problems = [];
  try {
    await resize(c, WIDTH, HEIGHT);
    await evalIn(c, TODAY_HOME);

    // ---- portrait baseline, the game screen (`.bar`/`.wrap`, app.css:4362's block) ----
    await tap(c, `$('.today-game').click()`);
    const portraitGame = await readLandscape(c);
    await tap(c, `$('#backBtn').click()`);

    // ---- portrait baseline, bench mode (`.gm-body`/`.gm-foot`/`.gm-nav`, app.css:1784's block) ----
    await tap(c, `$('#gmOpen').click()`);
    const portraitBench = await readLandscape(c);
    await tap(c, `$('#gmClose').click()`);

    await resize(c, 844, 390);

    // ---- landscape, the game screen ----
    await tap(c, `$('.today-game').click()`);
    const landscapeGame = await readLandscape(c);
    const gameScrollWidth = await evalIn(c, 'document.documentElement.scrollWidth');
    if (gameScrollWidth > 844) problems.push(`the game screen: scrollWidth is ${gameScrollWidth}, want <= 844`);
    if (landscapeGame.barPt === portraitGame.barPt) problems.push(`app.css:4362's block: .bar's padding-top is still ${landscapeGame.barPt} in landscape, want it to differ from portrait's ${portraitGame.barPt}`);
    if (landscapeGame.wrapPb === portraitGame.wrapPb) problems.push(`app.css:4362's block: .wrap's padding-bottom is still ${landscapeGame.wrapPb} in landscape, want it to differ from portrait's ${portraitGame.wrapPb}`);
    await tap(c, `$('#backBtn').click()`);

    // ---- landscape, bench mode ----
    await tap(c, `$('#gmOpen').click()`);
    const landscapeBench = await readLandscape(c);
    const benchScrollWidth = await evalIn(c, 'document.documentElement.scrollWidth');
    if (benchScrollWidth > 844) problems.push(`bench mode: scrollWidth is ${benchScrollWidth}, want <= 844`);
    if (landscapeBench.gmNavH === portraitBench.gmNavH) problems.push(`app.css:1784's block: .gm-nav's height is still ${landscapeBench.gmNavH} in landscape, want it to differ from portrait's ${portraitBench.gmNavH}`);
    const rects = await evalJSON(c, NAV_RECTS_JS);
    if (!rects.length) problems.push('bench mode: no .gm-nav step buttons found to check');
    for (const r of rects) {
      if (r.left < 0 || r.top < 0 || r.right > 844 || r.bottom > 390) {
        problems.push(`bench mode: a .gm-nav button sits at ${JSON.stringify(r)}, outside the 844x390 viewport`);
        break;
      }
    }
    await tap(c, `$('#gmClose').click()`);

    await evalIn(c, TODAY_HOME);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await resize(c, WIDTH, HEIGHT);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'at 844x390 both landscape blocks are live, no sideways scroll, and bench mode’s step buttons stay inside the viewport',
  };
}
