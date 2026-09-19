import { evalIn, TODAY_HOME } from './dom.mjs';
import { nameOf, SWEEP_FLOOR, SWEEP_HI, SWEEP_EXTRA } from './registry.mjs';

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
/* #35 decision 14: the band, then the discrete widths above it -- the 600px
   sheet band, the 840px two-pane floor and a laptop. Sweeping every integer
   from SWEEP_FLOOR to the top of SWEEP_EXTRA would be 4,900 widths across five
   views for no extra signal; the extras are the numbers the ticket's
   acceptance criteria name, so they are the ones that get walked. Same
   measurement, same views, one list -- and one list is also what the row's
   own "N widths" detail counts, so it cannot describe a walk that did not
   happen. */
const WIDTHS = Object.freeze([
  ...Array.from({ length: SWEEP_HI - SWEEP_FLOOR + 1 }, (_, i) => SWEEP_FLOOR + i),
  ...SWEEP_EXTRA,
]);

/* Rule 2a's floor, in drawn boxes per walk. Measured: the leanest of the 620
   walks draws 70 boxes. Set well under that so a narrow width collapsing a row
   or two does not read as a broken probe, and far enough above zero that a
   walk which found nothing -- or a `checkVisibility` skip gone wrong -- cannot
   pass. */
const SEEN_FLOOR = 40;

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
        const vw = document.documentElement.clientWidth; let worst = null, seen = 0;
        for (const el of document.body.querySelectorAll('*')) {
          /* Only elements the browser is actually rendering. The bare call --
             no options -- is deliberate: it adds exactly one thing to the
             zero-box test below, a subtree the browser has display-locked
             (content-visibility), and a locked subtree is where
             getBoundingClientRect stops telling the truth. Measured here at
             840px on the game screen: #plan lives inside the CLOSED <details
             id="tabledetails">, and the first read into it after a width
             change came back at right 959px -- the x from the 840px layout
             plus the width from the 600px one -- while the second and third
             reads in the same frame found nothing at all. Nothing was
             overflowing; the rect was stale because the box it describes is
             not being laid out. Skipping visibility:hidden or opacity:0 is
             NOT wanted: those still take up space a coach can be stranded
             past, so the options that would exclude them stay off. */
          if (!el.checkVisibility()) continue;
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          seen++;
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
        ok(JSON.stringify({ vw, worst, seen }));
      })))`,
    });
    return JSON.parse(result.value);
  };

  const bad = [];
  let cleanFrom = SWEEP_FLOOR;
  let leanest = null;                                   // fewest boxes any one walk measured
  for (const v of VIEWS) {
    await evalIn(c, v.open);
    await new Promise(r => setTimeout(r, 500));         // the view transition
    for (const w of WIDTHS) {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h0, deviceScaleFactor: 2, mobile: true });
      const m = await measure();
      if (leanest === null || m.seen < leanest.seen) leanest = { view: v.name, w, seen: m.seen };
      if (m.worst) {
        bad.push({ view: v.name, w, right: m.worst.right, el: m.worst.el });
        // "clean from Npx up" is a claim about the BAND -- an overflow at one
        // of the three discrete widths above it says nothing about where the
        // continuous sweep starts reading clean.
        if (w <= SWEEP_HI && w >= cleanFrom) cleanFrom = w + 1;
      }
    }
  }

  await evalIn(c, TODAY_HOME);
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));

  /* Rule 2a: a walk that measured nothing is a failure, not a pass. The skip
     above is the reason this is here -- `checkVisibility` returning false for
     everything (a view that never opened, a screen left display-locked) would
     leave the walk with no boxes to compare and this row would print green
     having proved nothing. The floor is per WALK, not a total: 620 walks
     summed would stay comfortably above any floor even if one screen went
     empty, so the smallest count a single width/view pair produced is the
     honest number to hold, and it is the number the detail prints. */
  const thin = !leanest || leanest.seen < SEEN_FLOOR;
  const pass = bad.length === 0 && !thin;
  const list = bad.slice(0, 6).map(b => `${b.view}@${b.w}px: ${b.el} reaches ${b.right}px`).join(', ');
  return {
    name: nameOf('sweep'),
    pass,
    detail: pass
      ? `${WIDTHS.length * VIEWS.length} widths across ${VIEWS.map(v => v.name).join(' + ')} `
        + `(${SWEEP_FLOOR}–${SWEEP_HI}px plus ${SWEEP_EXTRA.join(', ')}px), `
        + `${leanest.seen}+ drawn boxes each, nothing stranded past the right edge`
      : bad.length
        ? `${bad.length} width(s) overflow: ${list}${bad.length > 6 ? ' …' : ''}`
          + (cleanFrom <= SWEEP_HI ? `; clean from ${cleanFrom}px up` : '')
        : `the leanest walk measured only ${leanest ? leanest.seen : 0} drawn box(es) `
          + `(${leanest ? `${leanest.view}@${leanest.w}px` : 'no walk ran'}), want at least `
          + `${SEEN_FLOOR} -- nothing was actually compared against the edges`,
  };
}
