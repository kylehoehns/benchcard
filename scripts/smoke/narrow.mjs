import { nameOf, NARROW } from './registry.mjs';

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
  const before = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__SMOKE_VIEWPORT || [390, 844])', returnByValue: true,
  });
  const [w0, h0] = JSON.parse(before.result.value);
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: NARROW, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));

  const probe = await c.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const vw = document.documentElement.clientWidth;
      const x0 = window.scrollX;
      window.scrollTo(80, window.scrollY);
      const pans = window.scrollX !== x0;
      window.scrollTo(x0, window.scrollY);
      const bar = document.querySelector('.bar');
      const spill = [];
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        /* BOTH edges. scrollWidth and a right-edge test are blind to content
           hanging off the LEFT of the viewport -- measured, the Games tab does
           exactly that -- and a coach cannot reach it in either direction. */
        const over = r.right > vw + 1 ? Math.round(r.right) : r.left < -1 ? Math.round(r.left) : null;
        if (over !== null && !spill.some(s => s.el.contains(el))) spill.push({ el, right: over });
      }
      return JSON.stringify({
        vw, pans,
        barFits: bar ? bar.scrollWidth <= vw + 1 : true,
        barW: bar ? bar.scrollWidth : 0,
        // anything wider than the screen must scroll inside its own box
        stranded: spill
          .filter(s => { let n = s.el; while (n && n !== document.body) { if (n.scrollWidth > n.clientWidth + 1) return false; n = n.parentElement; } return true; })
          .map(s => (s.el.tagName.toLowerCase() + (s.el.id ? '#' + s.el.id : '')) + ' → ' + s.right + 'px')
          .slice(0, 4),
      });
    })()`,
  });
  const r = JSON.parse(probe.result.value);

  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r2 => setTimeout(r2, 300));

  const pass = !r.pans && r.barFits && r.stranded.length === 0;
  return {
    name: nameOf('narrow'),
    pass,
    detail: pass
      ? `page cannot pan, top bar fits in ${r.barW}px, nothing stranded`
      : [
          r.pans ? 'page pans sideways' : null,
          r.barFits ? null : `top bar needs ${r.barW}px`,
          r.stranded.length ? `stranded off-screen: ${r.stranded.join(', ')}` : null,
        ].filter(Boolean).join('; '),
  };
}
