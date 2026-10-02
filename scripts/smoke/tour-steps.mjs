/* #201's own guard (docs/specs/201-tour-refresh.md's Proof table): the six
 * tour steps' copy, counting, ring placement and end-of-tour behavior at
 * 390x844 (item 4), then desktop, step 6 only (item 5), then the fit every
 * step has to hold at 320px/32px text (item 6) -- the one cell nothing else
 * in the harness checks on the tour's own BOTTOM edge. `applargetext`'s
 * `OVERFLOW_PROBE` is horizontal only and its `STRANDED_ABOVE` looks only
 * above the top of a fixed overlay (survey item 2); neither would have caught
 * a `.tour-box` that simply ran off the bottom of an 844px phone the way the
 * six-step copy did before the fit fix (survey item 1: 824-1,189px tall
 * boxes on an 844px screen).
 *
 * Reuses rather than re-derives: `evalIn`, `step`, `setWidth`, `WIDTH`,
 * `HEIGHT` (dom.mjs); `LARGE_TEXT_PX`, `LARGE_TEXT_WIDTH`, `LAPTOP`,
 * `TOUCH_MIN` (sizes.mjs); and the six `tour, step k of 6` open/close
 * scripts `overlay.mjs`'s `STATES` already builds once, by name, rather than
 * a second copy of the click sequence that opens the tour through Settings ->
 * How it works -> Show me around again.
 *
 * `overlay.mjs` imports this file's `STEP_COUNT` back (rather than a third
 * `6` literal of its own), which makes the two modules mutually import each
 * other. That is safe ONLY because neither touches the other's binding at its
 * own module top level: `TOUR_STATES` below (the one place this file reads
 * `STATES`) is built inside `tourStepsPass`, not here, so by the time it runs
 * both modules have already finished loading. Do not hoist it back to a
 * top-level `const` -- `overlay.mjs` is the first of the two `registry.mjs`
 * imports, so this file's own top level would then run while overlay.mjs's
 * `STATES` is still mid-initialization, and throw. */
import { evalIn, step, setWidth, WIDTH, HEIGHT, TIMERS_QUIET } from './dom.mjs';
import { LARGE_TEXT, LARGE_TEXT_PX, LARGE_TEXT_WIDTH, LAPTOP, TOUCH_MIN } from './sizes.mjs';
import { STATES } from './overlay.mjs';
import { land, reset } from './page-state.mjs';

export const TOUR_STEPS_CHECK =
  `tour: six steps at ${WIDTH}px, ${LAPTOP}px and ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;

/* The spec's own table (item 1). `test/tour-anchors.test.js` pins the same
 * six against `app/tour.js`'s SOURCE; this file never reads that source, only
 * the rendered page, so a step that is right in the array but wrong on
 * screen (a typo in the markup id, a step that never receives focus) fails
 * here even though the source-read guard is clean. */
const EXPECTED = [
  { title: 'Who is here tonight', anchor: '#phrasePlayers' },
  { title: 'How the minutes get shared', anchor: '#phraseStrategy' },
  { title: 'Rules and lineups', anchor: '#phraseRules' },
  { title: 'This is the rotation', anchor: '#timeline' },
  { title: 'Timeline or card', anchor: '#viewSeg' },
  { title: 'What you use in the gym', anchor: '#shareBtn' },
];

// The count comes from EXPECTED's own length, not a second literal `6` --
// see "Reuse, do not re-derive" in docs/specs/201-tour-refresh.md. Exported
// so `overlay.mjs` can build its six `tour, step k of 6` states from the same
// number instead of its own literal.
export const STEP_COUNT = EXPECTED.length;

// past placeTour's own +320ms re-run (app/tour.js): a short app timer, which
// TIMERS_QUIET waits out.
const quiet = c => evalIn(c, TIMERS_QUIET);

/* One rect-and-text read of whatever step is currently up, for a given
 * anchor selector -- `placeTour`'s own re-run at +320ms (app/tour.js) means
 * every caller waits past that before reading, not this probe's job. */
const readStep = anchorSel => `JSON.stringify((() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const dots = [...document.querySelectorAll('#tourDots i')];
  return {
    open: !!(document.getElementById('tour') && !document.getElementById('tour').hidden),
    stepText: document.getElementById('tourStep')?.textContent || '',
    title: document.getElementById('tourTitle')?.textContent || '',
    dotCount: dots.length,
    dotsOn: dots.map(d => (d.getAttribute('class') || '').trim() === 'on'),
    skipHidden: !!document.getElementById('tourSkip')?.hidden,
    nextText: document.getElementById('tourNext')?.textContent || '',
    holeHidden: !!document.getElementById('tourHole')?.hidden,
    hole: rect(document.getElementById('tourHole')),
    box: rect(document.getElementById('tourBox')),
    next: rect(document.getElementById('tourNext')),
    anchor: rect(document.querySelector(${JSON.stringify(anchorSel)})),
    vw: document.documentElement.clientWidth,
    vh: document.documentElement.clientHeight,
  };
})())`;

const read = async (c, anchorSel) => JSON.parse(await evalIn(c, readStep(anchorSel)));

const inside = (outer, inner, tol = 0.5) =>
  inner.left >= outer.left - tol && inner.top >= outer.top - tol &&
  inner.right <= outer.right + tol && inner.bottom <= outer.bottom + tol;

const overlaps = (a, b) =>
  a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

/* Item 4: `#tourHole`'s rect contains the anchor's -- except `#timeline`,
 * where `placeTour`'s own `CAP` (app/tour.js's `RING_CAP_RATIO`) deliberately
 * traces only the top `52%` of the viewport rather than the whole row list.
 * `RING_CAP_RATIO` is copied here as a literal, not imported and not exported
 * from `app/tour.js`: `app/tour.js` pulls in `app/dom.js`, whose `ctx2d` calls
 * `document.createElement` at module load time, so importing it under
 * `node --test`/plain Node throws `document is not defined` before any of
 * `placeTour`'s own code runs -- and an export with no reader `test/dead-
 * export.test.js` can see (it scans only `scripts/*.js`, not `scripts/smoke/`)
 * would fail that guard anyway. If the ratio changes in `app/tour.js`, change
 * it here too.
 *
 * `EDGE_TOL`: `placeTour` clamps every edge of the hole to at least `edge`
 * (10px) from the screen edge, but only pads the anchor out by `pad` (8px)
 * first (app/tour.js, both local to `placeTour` and not exported -- same
 * import boundary as `RING_CAP_RATIO` above, and neither is worth a module
 * this file can't load anyway). An anchor sitting closer than `edge` to the
 * physical screen edge -- `#phrasePlayers` et al, whose tap target runs to
 * ~8.5px -- is clamped inward by the up-to-2px difference between the two
 * constants. That gap is `placeTour`'s own unchanged math, not #201's, so the
 * tolerance matches it rather than the usual 1px sub-pixel rounding
 * allowance. */
const EDGE_TOL = 3;
const RING_CAP_RATIO = 0.52; // app/tour.js's own RING_CAP_RATIO, copied -- see above
const ringCovers = (hole, anchor, vh, capped) => {
  const horiz = hole.left <= anchor.left + EDGE_TOL && hole.right >= anchor.right - EDGE_TOL;
  if (!capped) return horiz && hole.top <= anchor.top + EDGE_TOL && hole.bottom >= anchor.bottom - EDGE_TOL;
  const CAP = Math.round(vh * RING_CAP_RATIO);
  return horiz && hole.top <= anchor.top + EDGE_TOL && hole.height <= CAP + 1;
};

export async function tourStepsPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };
  // Built here, not at module top level -- see the import-order note above
  // `STEP_COUNT`'s export.
  const TOUR_STATES = EXPECTED.map((_, i) => STATES.find(s => s.name === `tour, step ${i + 1} of ${STEP_COUNT}`));

  try {
    for (const s of TOUR_STATES) {
      if (!ck(!!s, 'overlay.mjs is missing one of the six "tour, step k of 6" states')) return finish();
    }

    // ---------- 390x844: items 2, 3, 4 ----------
    await setWidth(c, WIDTH, HEIGHT);
    for (let i = 0; i < EXPECTED.length; i++) {
      const s = TOUR_STATES[i];
      const last = i === EXPECTED.length - 1;
      await evalIn(c, step(s.open));
      await quiet(c);
      const d = await read(c, EXPECTED[i].anchor);
      const where = `step ${i + 1} at ${WIDTH}px`;
      if (!ck(d.open, `${where}: #tour never opened`)) { await evalIn(c, step(s.close)); continue; }

      ck(d.stepText === `Step ${i + 1} of ${STEP_COUNT}`, `${where}: #tourStep reads "${d.stepText}", want "Step ${i + 1} of ${STEP_COUNT}"`);
      ck(d.title === EXPECTED[i].title, `${where}: #tourTitle reads "${d.title}", want "${EXPECTED[i].title}"`);
      ck(d.dotCount === STEP_COUNT, `${where}: #tourDots holds ${d.dotCount} <i>, want ${STEP_COUNT}`);
      const on = d.dotsOn.map((v, k) => v ? k : null).filter(v => v !== null);
      ck(on.length === 1 && on[0] === i, `${where}: dots on = [${on}], want only [${i}]`);
      ck(d.skipHidden === last, `${where}: #tourSkip hidden=${d.skipHidden}, want ${last}`);
      ck(d.nextText === (last ? 'Got it' : 'Next'), `${where}: #tourNext reads "${d.nextText}", want "${last ? 'Got it' : 'Next'}"`);

      const capped = EXPECTED[i].anchor === '#timeline';
      ck(!d.holeHidden, `${where}: #tourHole is hidden`);
      if (!d.holeHidden) {
        if (ck(!!d.anchor, `${where}: anchor ${EXPECTED[i].anchor} not found -- nothing measured`)) {
          ck(ringCovers(d.hole, d.anchor, d.vh, capped),
            `${where}: #tourHole ${JSON.stringify(d.hole)} does not cover ${EXPECTED[i].anchor} ${JSON.stringify(d.anchor)}`);
        }
        /* `#timeline`'s ring is capped at 52% of the viewport height (`CAP`,
         * app/tour.js) -- with the fixture's 11-row roster that leaves less
         * room below the ring than the box needs, and `placeTour`'s own
         * fallback (picking the side with more room, then clamping into the
         * viewport) can leave the box crossing the ring's bottom edge here.
         * That is `placeTour`'s existing box-placement math, unchanged by
         * #201, and pre-existing on main: measured on a scratch checkout of
         * 197dd20 (the commit this spec's Survey was taken against) with the
         * same title, body and #timeline anchor at step 3 of today's
         * four-step tour -- box {top:619, bottom:833.8} against hole
         * {top:207, bottom:636.6} at 390x844, RICH fixture, the same ~18px
         * overlap #201 inherits at its own step 4. Fixing it would mean
         * changing `placeTour`, which this spec was handed as "must not
         * change" (see the spec's Out of scope); every other step's box
         * still has to clear the ring. */
        if (!capped) ck(!overlaps(d.box, d.hole), `${where}: #tourBox ${JSON.stringify(d.box)} overlaps #tourHole ${JSON.stringify(d.hole)}`);
      }
      const vp = { left: 0, top: 0, right: d.vw, bottom: d.vh };
      ck(inside(vp, d.box), `${where}: #tourBox ${JSON.stringify(d.box)} is not fully inside the ${d.vw}x${d.vh} viewport`);

      if (last) {
        // item 3: tapping Got it closes the tour and state.tourSeen becomes
        // true. Focus returning to the trigger is `closeTrap`'s own job
        // (trap.js) -- unchanged by #201, and already every other trap in
        // the app relies on the same mechanism; not re-proven here.
        await evalIn(c, step(`$('#tourNext').click()`));
        const after = await evalIn(c, `(async () => {
          const st = await import('/state.js');
          return JSON.stringify({
            tourSeen: st.state.tourSeen,
            hidden: !!document.getElementById('tour')?.hidden,
          });
        })()`).then(JSON.parse);
        ck(after.hidden === true, `${where}: #tour is still open after tapping Got it`);
        ck(after.tourSeen === true, `${where}: state.tourSeen is ${after.tourSeen} after Got it, want true`);
        await evalIn(c, step(`$('#backBtn').click()`));
      } else {
        await evalIn(c, step(s.close));
      }
    }

    // ---------- 1280x800: item 5, last step only ----------
    const lastStep = STEP_COUNT - 1, lastAnchor = EXPECTED[lastStep].anchor;
    await setWidth(c, LAPTOP, 800);
    await evalIn(c, step(TOUR_STATES[lastStep].open));
    await quiet(c);
    {
      const d = await read(c, lastAnchor);
      const where = `step ${STEP_COUNT} at ${LAPTOP}px`;
      if (ck(d.open, `${where}: #tour never opened`)) {
        ck(!d.holeHidden, `${where}: #tourHole is hidden`);
        if (!d.holeHidden && ck(!!d.anchor, `${where}: ${lastAnchor} not found -- nothing measured`)) {
          ck(ringCovers(d.hole, d.anchor, d.vh, false), `${where}: ring does not cover ${lastAnchor}`);
        }
        const vp = { left: 0, top: 0, right: d.vw, bottom: d.vh };
        ck(inside(vp, d.box), `${where}: #tourBox is not fully inside the ${d.vw}x${d.vh} viewport`);
      }
    }
    await evalIn(c, step(TOUR_STATES[lastStep].close));

    // ---------- 320px/32px text: item 6, every step ----------
    try {
      await land(c, origin, { ...LARGE_TEXT });
      for (let i = 0; i < EXPECTED.length; i++) {
        const s = TOUR_STATES[i];
        await evalIn(c, step(s.open));
        await quiet(c);
        const d = await read(c, EXPECTED[i].anchor);
        const where = `step ${i + 1} at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
        if (ck(d.open, `${where}: #tour never opened`)) {
          const vp = { left: 0, top: 0, right: d.vw, bottom: d.vh };
          ck(inside(vp, d.box), `${where}: #tourBox ${JSON.stringify(d.box)} runs off the ${d.vw}x${d.vh} viewport`);
          ck(inside(vp, d.next), `${where}: #tourNext ${JSON.stringify(d.next)} runs off the viewport`);
          ck(Math.min(d.next.width, d.next.height) >= TOUCH_MIN,
            `${where}: #tourNext is ${Math.round(d.next.width)}x${Math.round(d.next.height)}, want >= ${TOUCH_MIN}px`);
          ck(d.stepText === `Step ${i + 1} of ${STEP_COUNT}`, `${where}: #tourStep reads "${d.stepText}"`);
          ck(d.title === EXPECTED[i].title, `${where}: #tourTitle reads "${d.title}"`);
        }
        await evalIn(c, step(s.close));
      }
    } finally {
      // never leave the emulated font size or width on: back to the baseline
      // page state (16px text, WIDTH x HEIGHT, RICH), the way the other rows do.
      await reset(c, origin);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
    await setWidth(c, WIDTH, HEIGHT).catch(() => {});
  }

  function finish() {
    return {
      pass: problems.length === 0,
      detail: problems.length
        ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
        : `six steps' copy, counting, ring and fit hold at ${WIDTH}px, ${LAPTOP}px and ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`,
    };
  }
  return finish();
}
