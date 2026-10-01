// Animation vocabulary for the app. Wraps the vendored Motion library so call
// sites read as intent, and degrades to plain no-ops if it fails to load.
//
// Continuous interactions (dragging a minute slider) stay on CSS transitions:
// they fire on every input event, and spawning spring animations per frame
// there costs more than it buys. Motion is used for discrete changes —
// entrances, stint navigation, reordering.

import { animate, stagger, ok } from './vendor/motion.mjs';

/* The preference is not fixed for the life of the tab — a phone can flip it
 * from Control Center / Accessibility mid-game — so it is watched rather than
 * sampled once at load. `enabled` is a `let` on purpose: importers get a live
 * binding and every call site here reads it per call, so nothing has to be
 * re-wired when it changes.
 *
 * The CSS `@media (prefers-reduced-motion: reduce)` block cannot do this job
 * on its own: Motion and the timeline blocks animate through the Web
 * Animations API, whose timing lives on the animation object, not in a style
 * a media query can override. So turning the preference on also finishes
 * whatever is already playing — including the CSS animations and transitions
 * caught in the same sweep, which land on their end state either way. */
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
export let enabled = ok && !reduceMQ.matches;

function syncMotionPref() {
  enabled = ok && !reduceMQ.matches;
  if (enabled) return;
  for (const a of document.getAnimations()) {
    // an infinite animation cannot be finished; those are ended outright
    try { a.finish(); } catch { a.cancel(); }
  }
}
reduceMQ.addEventListener('change', syncMotionPref);

/* A single 10ms tick of the vibration motor, for the four moments where the
 * coach is looking at the floor rather than the phone: a stint advancing, a
 * swap committing, a roster row picking up and the same row dropping.
 *
 * Three gates, all of them deliberate. `enabled` is the reduced-motion
 * preference, read here as a general "keep this app calm" signal rather than
 * as a statement about animation. A fine pointer means a mouse, where a
 * vibrating desk is nobody's idea of feedback. And `navigator.vibrate` has to
 * exist at all — which brings us to the thing worth writing down:
 *
 *   **Safari on iOS has never shipped the Vibration API.** This does nothing
 *   whatsoever on an iPhone, which is the device this app is designed around.
 *   It is an Android-only nicety, so the app must not be described anywhere as
 *   having haptics. The `<input switch>` label trick that fakes it on iOS is
 *   not an option: undocumented, it fires the system toggle haptic as a side
 *   effect, and it would put a hidden control in the accessibility tree on
 *   every tappable row.
 *
 * `vibrate` throws in some embedded webviews and is a no-op without a user
 * gesture, so the call is wrapped and its return value ignored.
 */
const coarse = matchMedia('(pointer: coarse)');
export function tick(ms = 10) {
  if (!enabled || !coarse.matches || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(ms); } catch { /* no motor, or a webview that refuses */ }
}

/* #151 item 5: the one easing this app uses, read from nowhere but here. The
 * CSS side is `--ease` in tokens.css -- same four numbers, same curve --
 * and every JS animation reaches it through this export rather than a
 * second copy of the numbers. EASE is a CSS string because that is what
 * `Element.animate`'s (WAAPI) `easing` option and inline `style.transition`
 * both take; Motion's own `animate` wants the same curve as a plain array,
 * so EASE_ARR is parsed from EASE once, here, instead of being retyped. */
export const EASE = 'cubic-bezier(.32,.72,0,1)';
const EASE_ARR = EASE.match(/-?[\d.]+/g).map(Number);

/* Evaluates the cubic-bezier curve EASE_ARR describes at a given fraction of
 * time (0-1), the way a browser's own transition timing function would --
 * Newton-Raphson on the x (time) axis to find the t that lands there, then
 * the y (progress) at that t. Used by `countTo`'s hand-rolled counter below,
 * so its curve is read from EASE_ARR rather than a second, separately-tuned
 * formula. */
function bezierAt(t, p1, p2) { const it = 1 - t; return 3 * it * it * t * p1 + 3 * it * t * t * p2 + t * t * t; }
function easeFn([x1, y1, x2, y2]) {
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let x = t;
    for (let i = 0; i < 8; i++) {
      const dx = bezierAt(x, x1, x2) - t;
      const slope = 3 * (1 - x) * (1 - x) * x1 + 6 * (1 - x) * x * (x2 - x1) + 3 * x * x * (1 - x2);
      if (Math.abs(slope) < 1e-6) break;
      x -= dx / slope;
    }
    return bezierAt(x, y1, y2);
  };
}
const ease = easeFn(EASE_ARR);

/* #151 item 5: replaces the old physics SPRING (damping ratio ~0.88, which
 * overshot before settling -- M1 forbids a bounce). A fixed-duration tween on
 * the shared curve, used by both of SPRING's former call sites (popIn, flip)
 * below. 300ms sits inside M1's 250-450ms band; neither call site is a tap
 * response, so --t-tap does not apply. */
const TWEEN_MS = 0.3;
const TWEEN = { duration: TWEEN_MS, easing: EASE_ARR };
const SNAP = { duration: 0.26, easing: EASE_ARR };

/** Fade + lift a set of elements in, one after another. */
export function riseIn(els, { delay = 0.028, from = 10 } = {}) {
  const list = [...els];
  if (!enabled || !list.length) return;
  animate(list,
    { opacity: [0, 1], transform: [`translateY(${from}px)`, 'translateY(0px)'] },
    { ...SNAP, delay: stagger(delay) });
}

/** Ease an element in from slightly small. */
export function popIn(el, opts = {}) {
  if (!enabled || !el) return;
  animate(el, { opacity: [0, 1], transform: ['scale(0.9)', 'scale(1)'] }, { ...TWEEN, ...opts });
}

/** Swap content in place: the outgoing rows leave, the incoming ones arrive. */
export function swapIn(els, { delay = 0.022 } = {}) {
  const list = [...els];
  if (!enabled || !list.length) return;
  animate(list,
    { opacity: [0, 1], transform: ['translateX(10px)', 'translateX(0px)'] },
    { duration: 0.26, easing: EASE_ARR, delay: stagger(delay) });
}

/* ===================== entering game mode =========================
 *
 * One transition, chosen after three structurally different candidates were
 * built and run back to back on a phone: the sheet below won over a hard cut
 * and a staged reveal. The shared-element grow they replaced had been tuned
 * four separate times and still read as janky, which was evidence against the
 * idea rather than against the timings -- `.gm` is the whole view, surface AND
 * type, so growing it out of a 44px button scaled every glyph from ~11% and
 * that smear was what "janky" meant.
 *
 * Two properties the survivor keeps, and the grow never had:
 *
 *   - **Nothing is measured.** No origin rect, so there is no folded-card case
 *     to get wrong. `#sheet .card` measuring 0x0 is how the shared element
 *     silently never ran on mobile at all, and `#abBench` measuring `top: 855`
 *     against an 844px viewport is how it declined again on a fresh load; a
 *     transition that asks the page no questions cannot fail that way.
 *   - **Nothing is scaled far.** Nothing here scales past 1, so there is no
 *     type to smear.
 *
 * It returns false under reduced motion so the caller falls back to the CSS
 * `gmIn` keyframe, which the global reduced-motion rule collapses to an
 * instant, correct state change rather than a fast animation.
 * ------------------------------------------------------------------ */

/* The sheet. Full height, driven up from the bottom edge, with the page
 * behind it stepping back the way iOS steps a page back under a modal.
 *
 * The idiom a coach already has muscle memory for: this is what every sheet
 * on their phone does, so it needs no reading. The contents ride up with the
 * surface at their natural size -- there is no scale on `.gm` at all, so
 * there is nothing to cross-fade and nothing to smear, and the five on the
 * floor are legible for most of the travel rather than arriving at the end.
 *
 * The recede runs exactly as long as the rise and reverts on its own: by the
 * time it ends the sheet is opaque and covering it, so there is no fill mode
 * and nothing to clean up. */
export function sheetUp(el, { recede = [] } = {}) {
  if (!enabled || !el) return false;
  const RISE = 0.36;
  animate(el, { transform: ['translateY(100%)', 'translateY(0%)'] },
    { duration: RISE, easing: EASE_ARR });
  const back = [...recede].filter(Boolean);
  if (back.length) {
    animate(back, { transform: ['scale(1)', 'scale(0.94)'], opacity: [1, 0.45] },
      { duration: RISE, easing: EASE_ARR });
  }
  tick(16);
  return true;
}

/* ------------------------------------------------------------------ *
 * Counting numbers
 *
 * A readout that snaps from 12 to 16 says a number changed; one that counts
 * says *which* numbers moved, which is the whole question a coach asks after
 * touching a slider. Written by hand rather than through Motion: the value is
 * text, not a style, so there is nothing for the WAAPI to interpolate.
 *
 * The memory is keyed by a caller-supplied string, not by the node, because
 * every readout here is rebuilt from scratch on each render — a WeakMap on
 * the element would forget the old value exactly when it is needed. Keys are
 * per player id or per tile, so the map is bounded by the roster.
 *
 * The stored value tracks what is *on screen*, not the last target, so a
 * second change landing mid-count carries on from where the eye is instead of
 * snapping back to the previous destination. That matters: a slider drag
 * fires one of these every 140ms.
 *
 * Deliberately not used in game mode. Its minute readouts are driven by the
 * running clock and would be re-targeted every second, so a tween there would
 * never land — it would just smear.
 * ------------------------------------------------------------------ */
const COUNT_MS = 250;
const counters = new Map();
const whole = v => String(Math.round(v));

/** Set `node`'s text to `to`, counting up (or down) to it from last time. */
export function countTo(node, to, key, fmt = whole) {
  const prev = counters.get(key);
  if (prev && prev.raf) cancelAnimationFrame(prev.raf);
  const from = prev ? prev.v : NaN;
  // under a tenth of a minute apart there is nothing to watch, and a fresh
  // key (or reduced motion) has no journey to play
  if (!enabled || !Number.isFinite(from) || !Number.isFinite(to) || Math.abs(to - from) < 0.05) {
    counters.set(key, { v: to, raf: 0 });
    node.textContent = fmt(to);
    return;
  }
  // whole endpoints count in whole numbers: a decimal appearing mid-count
  // widens the text and nudges the column it sits in
  const round = Number.isInteger(from) && Number.isInteger(to);
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / COUNT_MS);
    const v = from + (to - from) * ease(k);
    node.textContent = fmt(round ? Math.round(v) : v);
    counters.set(key, k < 1 ? { v, raf: requestAnimationFrame(step) } : { v: to, raf: 0 });
  };
  counters.set(key, { v: from, raf: requestAnimationFrame(step) });
}
