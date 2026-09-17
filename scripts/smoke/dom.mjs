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

/* Today -> the first game, awaited as two separate `step()`s rather than one
   script with both clicks chained: the Today -> Games rebuild has to land
   before a phrase's own handler (`#phrasePlayers`, `#phraseStrategy`, ...) is
   live to receive the next click, a trap `who-rows.mjs` hit first (caught by
   running that state's own tab count against zero, per rule 2a, before
   landing on this fix). `who-rows.mjs` and `plan-rows.mjs` both open a sheet
   this way, so it is one copy rather than two. */
export async function toGameOne(c) {
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));
}

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

/* #28's own overflow probe, for a `dialog[open]`: every visible descendant
   checked against the DIALOG's own `getBoundingClientRect`, not the
   viewport's. `dialog.bsheet` is `width: 100%; max-width: 100%`, so today the
   dialog's box and the viewport are the same width and `OVERFLOW_PROBE` above
   would catch anything this one does -- verified on this tree, at 320px with
   a 32px root, for both the Plan sheet's level 1 and its Add-a-rule page,
   before this probe existed. This one is still worth having: it is the exact
   claim "What would settle it" item 11 makes ("no horizontal overflow ...
   with the Plan sheet open"), read against the box the coach actually sees
   the sheet occupy rather than an equality (dialog width == viewport width)
   that only holds because of one CSS rule elsewhere. If that rule ever
   changes -- a narrower, centered sheet, say -- `OVERFLOW_PROBE` would go on
   reporting the viewport clean while this one caught a control the coach
   cannot reach inside the sheet itself.
   `overflow: hidden` on `dialog.bsheet` clips visually but does not change a
   descendant's own `getBoundingClientRect` -- CSS overflow never does -- so
   this does not need the ancestor-scroll skip `OVERFLOW_PROBE` carries for a
   `overflow: auto` scroller; nothing here can be legitimately reachable by
   scrolling sideways, because nothing in this sheet scrolls on the X axis. */
export const DIALOG_OVERFLOW_PROBE = `(() => {
  const dialog = document.querySelector('dialog[open]');
  if (!dialog) return JSON.stringify({ dialog: false });
  const d = dialog.getBoundingClientRect();
  const vis = el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  let worst = null;
  for (const el of dialog.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if ((!r.width && !r.height) || !vis(el)) continue;
    const over = r.right > d.right + 1 ? Math.round(r.right - d.right)
      : r.left < d.left - 1 ? Math.round(d.left - r.left) : null;
    if (over === null) continue;
    if (!worst || over > worst.out) worst = {
      el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')),
      out: over,
    };
  }
  return JSON.stringify({ dialog: true, dw: Math.round(d.width), worst });
})()`;
