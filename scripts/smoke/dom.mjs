/* Shared DOM/CDP helpers: the viewport every pass measures at, evaluating
   script in the page, waiting for entrance animations to settle, and the two
   overflow probes reused across passes. Moved out of `smoke.mjs` unchanged. */

export const WIDTH = 390, HEIGHT = 844;

/* Evaluate in the page and throw the page's own error, rather than letting a
   typo in a selector come back as a silent `undefined`. */
export async function evalIn(c, expression) {
  const { result, exceptionDetails } = await c.send('Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  }
  return result.value;
}

/* Wait until nothing is animating. `fx.js` fades controls in from opacity 0
   and `smoke-checks.js` skips anything at opacity 0, so a page measured
   mid-entrance is audited for whichever controls happened to have arrived:
   three runs of the unchanged app counted 54, 57 and 58 of them. The timeline
   skeleton shimmers forever, so infinite animations are excluded — and the
   whole wait is capped, because a harness that hangs is worse than one that
   measures early. */
export const SETTLE = `(async () => {
  const running = () => document.getAnimations().filter(a => {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return a.playState === 'running' && t && t.iterations !== Infinity;
  }).length;
  const cap = Date.now() + 3000;
  // two consecutive quiet samples: one is not enough, since fx.js starts the
  // next element's animation on the frame after the last one finished
  for (let quiet = 0; quiet < 2 && Date.now() < cap; ) {
    quiet = running() ? 0 : quiet + 1;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
})()`;

export const step = js => `(async () => { const $ = s => document.querySelector(s); ${js};
  await ${SETTLE}; })()`;

// Is `#id` the screen currently on show? Both #23 checks below ask this of
// more than one screen (Today, and on the keys/undo side, Games too), so it
// is one helper rather than a `!!(document.getElementById(...) && ...)` at
// every call site.
export const onScreen = (c, id) => evalIn(c, `!!(document.getElementById('${id}') && !document.getElementById('${id}').hidden)`);

// The "get back to Today" script every sweep below opens from. One copy,
// here, because `sweepPass`, `touchPass`, `settingsRowPass` and
// `appLargeTextPass` all need it and it moved unchanged out of `smoke.mjs`.
// See `VIEWS` in `sweep.mjs` for why Today is the baseline each sweep starts
// from.
export const TODAY_HOME = `document.querySelector('#barBack').hidden || document.querySelector('#backBtn').click()`;

/* The same assertion `sweepPass` makes, and for the same reason: `scrollWidth`
   is clamped by `overflow-x: clip` on a shrink-to-fit container, so the thing
   clip cannot hide is an element's own edge. `pans` is the other half —
   content out of reach with the scrollbar removed is the same bug with its
   symptom deleted.
   `vw` is `documentElement.clientWidth`, never `window.innerWidth`: Chrome's
   mobile emulation WIDENS `innerWidth` to contain the overflow, so a probe
   written against it reports a 331px window in a 320px viewport and calls the
   overflow that caused it clean.
   BOTH EDGES. A right-edge test is blind to content off the LEFT, and so is
   `scrollWidth`; the Games tab hangs off it and no pass could see it.
   Shared by `staticPass` and `appLargeTextPass`. */
export const OVERFLOW_PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const x0 = window.scrollX;
  window.scrollTo(80, window.scrollY);
  const pans = window.scrollX !== x0;
  window.scrollTo(x0, window.scrollY);
  let worst = null;
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const over = r.right > vw + 1 ? Math.round(r.right) : r.left < -1 ? Math.round(r.left) : null;
    if (over === null) continue;
    let n = el.parentElement, scrolls = false;
    while (n && n !== document.body) {
      const ov = getComputedStyle(n).overflowX;
      if ((ov === 'auto' || ov === 'scroll') && n.scrollWidth > n.clientWidth + 1) { scrolls = true; break; }
      n = n.parentElement;
    }
    if (scrolls) continue;
    const out = over < 0 ? -over : over - vw;
    if (!worst || out > worst.out) worst = { el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')), right: over, out };
  }
  return JSON.stringify({ vw, pans, worst });
})()`;
