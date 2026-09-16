import { evalIn, TODAY_HOME } from './dom.mjs';
import { nameOf, SWEEP_FLOOR, SWEEP_HI } from './registry.mjs';

/* Every screen the chrome can be in, and the click that gets there (#23):
   Today is home, so it opens with nothing (or a back tap, if a previous
   state in the sweep left a pushed screen showing); the other four open from
   Today's own entries, since there is no tab bar to derive them from any
   more -- a list of names alone would have swept some and silently skipped
   the rest, which is the shape of the bug this whole sweep exists to catch. */
export const VIEWS = [
  { name: 'today', open: TODAY_HOME },
  { name: 'games', open: `document.querySelector('.today-game').click()` },
  { name: 'team', open: `document.querySelector('#todayTeam').click()` },
  { name: 'season', open: `document.querySelector('#todaySeason').click()` },
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
];
export async function sweepPass(c) {
  const before = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__SMOKE_VIEWPORT || [390, 844])', returnByValue: true,
  });
  const [w0, h0] = JSON.parse(before.result.value);

  /* Two frames at each width: one for the media queries to apply, one for the
     layout they cause. Cheaper than a fixed sleep and stricter than one. The
     whole walk happens in the page, so a sweep is one round trip per width. */
  const measure = async () => {
    const { result } = await c.send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => {
        const vw = document.documentElement.clientWidth; let worst = null;
        for (const el of document.body.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          /* Both edges: see the note in narrowPass. A right-edge-only test
             cannot see the Games tab hanging off the left, and neither can
             scrollWidth, which is why that one went unmeasured in every
             state. "over" is the edge that is out of reach, signed. */
          const over = r.right > vw + 1 ? Math.round(r.right) : r.left < -1 ? Math.round(r.left) : null;
          if (over === null) continue;
          /* An ancestor only excuses the overflow if it actually scrolls --
             overflow-x auto or scroll, i.e. the game tabs. Testing scrollWidth
             alone excuses it whenever the *parent* overflows too, which is
             exactly the case here: the bar is over-wide, so every child of an
             over-wide bar looks innocent and the check reads green. */
          let n = el.parentElement, scrolls = false;
          while (n && n !== document.body) {
            const ov = getComputedStyle(n).overflowX;
            if ((ov === 'auto' || ov === 'scroll') && n.scrollWidth > n.clientWidth + 1) { scrolls = true; break; }
            n = n.parentElement;
          }
          if (scrolls) continue;
          const out = over < 0 ? -over : over - vw;   // how far out of reach
          if (!worst || out > worst.out) worst = { el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')), right: over, out };
        }
        ok(JSON.stringify({ vw, worst }));
      })))`,
    });
    return JSON.parse(result.value);
  };

  const bad = [];
  let cleanFrom = SWEEP_FLOOR;
  for (const v of VIEWS) {
    await evalIn(c, v.open);
    await new Promise(r => setTimeout(r, 500));         // the view transition
    for (let w = SWEEP_FLOOR; w <= SWEEP_HI; w++) {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h0, deviceScaleFactor: 2, mobile: true });
      const m = await measure();
      if (m.worst) {
        bad.push({ view: v.name, w, right: m.worst.right, el: m.worst.el });
        if (w >= cleanFrom) cleanFrom = w + 1;
      }
    }
  }

  await evalIn(c, TODAY_HOME);
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));

  const pass = bad.length === 0;
  const list = bad.slice(0, 6).map(b => `${b.view}@${b.w}px: ${b.el} reaches ${b.right}px`).join(', ');
  return {
    name: nameOf('sweep'),
    pass,
    detail: pass
      ? `${(SWEEP_HI - SWEEP_FLOOR + 1) * VIEWS.length} widths across ${VIEWS.map(v => v.name).join(' + ')}, nothing stranded past the right edge`
      : `${bad.length} width(s) overflow: ${list}${bad.length > 6 ? ' …' : ''}`
        + (cleanFrom <= SWEEP_HI ? `; clean from ${cleanFrom}px up` : ''),
  };
}
