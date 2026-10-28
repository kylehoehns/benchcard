import { NARROW } from './sizes.mjs';
import { resize, smokeViewport } from './page-state.mjs';
import { OVERFLOW_WALK } from './dom.mjs';

/* The chrome has to survive the narrowest phone anyone still carries.
 *
 * This exists because it did not. The top bar had a hard floor of 378px --
 * brand, the Games/Roster nav, two icon buttons and a labelled Print -- so an
 * iPhone SE or a 13 mini at 375px could pan the entire app sideways, and so
 * could a 390px phone the moment its owner raised the system text size. Every
 * check here was green throughout, because the harness only ever renders at
 * 390 and the bar fits at 390.
 *
 * `scrollWidth` is not the question at narrow widths any more -- the root
 * carries `overflow-x: clip` as a backstop, under which `scrollWidth` still
 * reports the content size while scrolling is impossible. So this asks the
 * only thing a coach would notice: can the page actually be panned. It also
 * reports what stuck out, because "cannot pan" with content clipped off the
 * edge would be a different bug wearing the same green tick.
 */
export async function narrowPass(c) {
  const [w0, h0] = await smokeViewport(c);
  await resize(c, NARROW, h0, { debounce: true });

  const probe = await c.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const bar = document.querySelector('.bar');
      return JSON.stringify({
        ...(${OVERFLOW_WALK})(),
        barFits: bar ? bar.scrollWidth <= document.documentElement.clientWidth + 1 : true,
        barW: bar ? bar.scrollWidth : 0,
      });
    })()`,
  });
  const r = JSON.parse(probe.result.value);

  await resize(c, w0, h0, { debounce: true });

  /* The walker excuses overflow only inside an ancestor that scrolls it, and
     it names the worst element, not up to four. */
  const pass = !r.pans && r.barFits && !r.worst;
  return {
    pass,
    detail: pass
      ? `page cannot pan, top bar fits in ${r.barW}px, nothing stranded`
      : [
          r.pans ? 'page pans sideways' : null,
          r.barFits ? null : `top bar needs ${r.barW}px`,
          r.worst ? `stranded off-screen: ${r.worst.el} → ${r.worst.right}px` : null,
        ].filter(Boolean).join('; '),
  };
}
