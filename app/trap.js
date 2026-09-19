/* ================================================================== *
 * focus trap
 *
 * The full-screen overlays (game mode, the tour, the sheets) sit on top of a
 * page that is still in the tab order. Without a trap, Tab walks out of
 * game mode into the timeline behind it and the coach is typing into a
 * form they cannot see.
 *
 * A stack rather than a single slot because an overlay can be opened from
 * onboarding while nothing else is open, and a future overlay should not
 * have to know about this one.
 *
 * Split out of app.js: the tour, game mode, the help sheet
 * and the shortcuts sheet all need it, and every one of those is a later
 * seam in the same split. Nothing here touches app state, which is why it
 * could move first.
 * ================================================================== */
import { $, el } from './dom.js';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
const traps = [];

// getClientRects() rather than offsetParent: the overlays are position:fixed,
// where offsetParent is null even when the element is plainly on screen.
// The undo toast is deliberately inside the trap even though it lives outside
// the overlay: it belongs to whatever is on top, and an Undo you cannot Tab to
// is not an undo.
const trapReach = (root, n) => root.contains(n) || $('#toasts')?.contains(n);
const trapNodes = root => {
  const box = $('#toasts');
  const all = [...root.querySelectorAll(FOCUSABLE)];
  if (box && !root.contains(box)) all.push(...box.querySelectorAll(FOCUSABLE));
  return all.filter(n => !n.disabled && n.getClientRects().length);
};

export function openTrap(root, onEscape, trigger) {
  if (!root || traps.some(t => t.root === root)) return;
  traps.push({ root, onEscape, prev: trigger || document.activeElement });
  (trapNodes(root)[0] || root).focus({ preventScroll: true });
}

export function closeTrap(root) {
  const i = traps.findIndex(t => t.root === root);
  if (i < 0) return;
  const [t] = traps.splice(i, 1);
  const p = t.prev;
  // the trigger may have been re-rendered or hidden away while the overlay was
  // up (the action bar hides itself in game mode); dropping focus on the body
  // is better than focusing something invisible
  if (p && document.contains(p) && p.getClientRects().length) p.focus({ preventScroll: true });
}

document.addEventListener('keydown', e => {
  const t = traps[traps.length - 1];
  if (!t) return;
  if (e.key === 'Escape') { e.preventDefault(); t.onEscape?.(); return; }
  if (e.key !== 'Tab') return;
  const nodes = trapNodes(t.root);
  if (!nodes.length) { e.preventDefault(); t.root.focus({ preventScroll: true }); return; }
  const first = nodes[0], last = nodes[nodes.length - 1];
  const cur = document.activeElement;
  // a rebuild (stint nav repaints the whole body) can leave focus on <body>
  if (!trapReach(t.root, cur)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
}, true);

/* ================================================================== *
 * sheets (#27, decision 12)
 *
 * A parallel primitive, not a rewrite of the trap above: native
 * `<dialog>.showModal()` already does what the trap hand-rolls for the
 * other overlays -- it inerts the background and contains Tab -- and fires
 * a `cancel` event for Escape and Android's back gesture, so a sheet needs
 * only what `showModal` leaves undone: remembering which button opened it,
 * one sheet open at a time, the backdrop tap, and the drag/handle behavior
 * decision 9 and C3 ask for. Finding the first focusable node to land on
 * reuses `trapNodes`/`FOCUSABLE` above rather than a second selector, and
 * the focus-return rule (still in the document, still visible) is the same
 * one `closeTrap` uses.
 * ================================================================== */

const sheetTrigger = new Map();    // dialog -> the button that opened it
const wiredSheets = new WeakSet(); // dialogs with their listeners already attached

// A downward drag past a quarter of the sheet's own height closes it
// (decision 9); an upward drag past this much of it snaps to full. Both are
// fractions of the sheet's own height, not the viewport's, so they hold at
// any width.
const DRAG_CLOSE_FRAC = 0.25;
const DRAG_FULL_FRAC = 0.15;

/* ================================================================== *
 * #73: release math -- pure, exported, unit-tested under `node --test`
 * (test/trap.test.js). Distance alone (the two fractions above) missed a
 * fast flick that had not yet crossed a quarter of the sheet's height; speed
 * over the trailing window of the gesture is what a native sheet actually
 * reads, so a flick and a slow drag past the same point behave differently.
 * ================================================================== */

// Item 12: "speed over the last 100ms of movement". `samples` is a
// chronological `{ t, y }` list (ms, px); only the ones inside the trailing
// `windowMs` are read, so an early slow stretch cannot dilute the speed of a
// fast flick at the very end. Positive is downward, matching `dy` below.
export function dragSpeed(samples, now, windowMs = 100) {
  const win = samples.filter(s => s.t >= now - windowMs);
  if (win.length < 2) return 0;
  const a = win[0], b = win[win.length - 1];
  const dt = b.t - a.t;
  return dt > 0 ? (b.y - a.y) / dt : 0;
}

// Item 12's flick speed, shared by both directions.
const FLICK_PX_MS = 0.5;

// Item 12's close/full/settle decision: distance thresholds first (they
// "stay"), then a fast flick past `FLICK_PX_MS` even short of the distance.
// `full` is the height the drag STARTED from -- the upward flick-to-full
// rule only applies "from half" (item 12), so a flick up while already full
// has nothing further to snap to and settles back at full.
export function releaseAction({ dy, height, speed, full }) {
  if (dy > height * DRAG_CLOSE_FRAC) return 'close';
  if (dy < -height * DRAG_FULL_FRAC) return 'full';
  if (speed > FLICK_PX_MS) return 'close';
  if (speed < -FLICK_PX_MS && !full) return 'full';
  return 'settle';
}

// Item 13: rubber-banding a drag past the top edge of the current height.
// `overshoot` is how far past that edge the finger has moved (px, always
// >= 0); the return value is the actual translate distance, strictly under
// `cap` however far the finger goes, so "no gap shows under the sheet while
// it is pulled up" (the sheet's top can never travel past `cap`).
export function rubberBand(overshoot, cap = 60) {
  if (overshoot <= 0) return 0;
  return cap * overshoot / (overshoot + cap);
}

// Fix pass finding 1 (#73): `moveDrag` used to feed every upward `raw` into
// `rubberBand` from the first pixel, so `|dy|` could never reach `cap` (60)
// -- below the ~63px a 420px-tall half sheet needs to cross item 12's "15%
// up from half goes full" threshold. This tracks the finger 1:1 while `raw`
// is still within `roomUp` -- the distance the sheet's top would travel to
// reach the full top, measured once at `beginDrag`, not per move -- and
// rubber-bands only the overshoot past that edge. `roomUp = 0` (an
// already-full sheet, nothing further to travel to) collapses to the old,
// single-branch behavior: every upward pixel is overshoot.
export function dragOffset(raw, roomUp) {
  if (raw >= 0) return raw;
  if (raw >= -roomUp) return raw;
  const overshoot = -raw - roomUp;
  return -(roomUp + rubberBand(overshoot, 60));
}

// Not `half`: card.css already styles `.card.half` (the half-size print
// card), and a bottom sheet and a card can both be on screen at once — a
// second, unrelated `.half` would collide and the later stylesheet would win
// silently (see test/css-collide.test.js).
//
// #73 items 11/16: the height class still changes in one step, never
// animated; `animate` (default true) plays a FLIP -- read the old top edge,
// switch the class, read the new one, apply the difference as a transform
// with no transition, then let it transition to zero -- so the visible
// motion is the same `transform` a drag uses, not a second animated
// property. Two rAFs, the same reason `pushPane` below uses two: one alone
// can still land in the same frame as the style recalc and skip the start
// of the transition.
function setSheetHeight(dialog, full, animate = true) {
  const wasFull = dialog.classList.contains('full');
  const doFlip = animate && wasFull !== full && dialog.open && !reducedMotion();
  // Read BEFORE any inline transform is touched -- mid-drag (a release that
  // snaps to full) this already includes the finger's own offset, so the
  // diff below folds that in too and the switch starts exactly where the
  // drag left the sheet, with no jump, not just where a class-only toggle
  // (transform already at rest) would have.
  const before = doFlip ? dialog.getBoundingClientRect().top : 0;
  dialog.classList.toggle('full', full);
  dialog.classList.toggle('bsheet-half', !full);
  const handle = dialog.querySelector('.bsheet-handle');
  if (handle) handle.setAttribute('aria-label', full ? 'Half height' : 'Full height');
  if (!doFlip) { dialog.style.transform = ''; dialog.style.removeProperty('--scrim'); return; }
  dialog.style.transform = ''; // the new height's own resting position, to diff against
  dialog.style.removeProperty('--scrim');
  const diff = before - dialog.getBoundingClientRect().top;
  if (!diff) return;
  dialog.classList.add('dragging');
  dialog.style.transform = `translateY(${diff}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    dialog.classList.remove('dragging');
    dialog.style.transform = '';
  }));
}

/* -------------------------- the drag controller ------------------------- *
 * #73 items 10-20. One session per dialog at a time: a header pointerdown
 * or a qualifying body touchstart begins it, every subsequent move writes
 * `dy` (rubber-banded above the current height's own top edge) and reads
 * nothing layout-shaped, and release runs the pure `releaseAction` above to
 * decide close / snap to full / settle. M3 (interruptible): a new
 * pointerdown reads the CURRENT computed transform first (a pointerDOWN, not
 * a per-frame read) so a drag that starts mid-close or mid-settle picks up
 * from wherever the sheet already is, rather than jumping. */

const dragOf = new WeakMap();     // dialog -> the in-progress drag session
const closingOf = new WeakMap();  // dialog -> its pending close listener/timer

// The current translateY of `dialog`'s own transform (0 if there is none) --
// read once, at the start of a drag or a close, never inside a move handler.
function currentTranslateY(dialog) {
  const t = getComputedStyle(dialog).transform;
  const m = t && t !== 'none' && t.match(/^matrix\(([^)]+)\)$/);
  return m ? Number(m[1].split(',')[5]) || 0 : 0;
}

function cancelClosing(dialog) {
  const c = closingOf.get(dialog);
  if (!c) return;
  dialog.removeEventListener('transitionend', c.onEnd);
  clearTimeout(c.fallback);
  closingOf.delete(dialog);
  dialog.classList.remove('closing');
}

function writeDrag(dialog, st) {
  dialog.style.transform = `translateY(${st.dy}px)`;
  // Item 15: fades in step with a downward drag only -- clear at a full
  // height of travel, unchanged (fully opaque) while pulled up past the top.
  const scrim = st.dy > 0 ? Math.max(0, 1 - st.dy / st.height) : 1;
  dialog.style.setProperty('--scrim', String(scrim));
}

// Finding 1's `roomUp`: the distance the sheet's own top edge would travel
// to reach the full top, measured once (a real layout read, but only ever
// at `beginDrag`, never inside the per-frame move handler item 19 guards).
// An already-full sheet has nothing further to travel to, so this returns 0
// without touching the DOM at all -- `dragOffset` then rubber-bands every
// upward pixel, same as before. For a half sheet, `.full`'s own CSS height
// wins the cascade over `.bsheet-half`'s (declared earlier in app.css) the
// instant it is added, so toggling it on and back off in the same tick reads
// the full-height top with no visible flash -- the same before/after diff
// `setSheetHeight`'s own FLIP already relies on, just discarded here instead
// of applied as a transform.
function roomUpFor(dialog) {
  if (dialog.classList.contains('full')) return 0;
  const before = dialog.getBoundingClientRect().top;
  dialog.classList.add('full');
  const after = dialog.getBoundingClientRect().top;
  dialog.classList.remove('full');
  return Math.max(0, before - after);
}

function beginDrag(dialog, y) {
  /* #35 decision 13. From 600px up a sheet is a centered dialog, and the drag
     it would otherwise start is a gesture with nowhere to go: `endDrag`
     dismisses a sheet pulled DOWN past the bottom edge, and a dialog floating
     in the middle of the screen has no bottom edge to be pulled past -- it
     would simply slide out from under the coach's finger and snap back.
     Measured, not a second copy of the 600px breakpoint: the rule is "only a
     sheet that touches the bottom can be pulled down past it", and 1px of
     slack covers subpixel layout. Returning before `dragOf.set` is what makes
     this stick -- `moveDrag` and `endDrag` both no-op on a dialog with no
     drag state, so the whole gesture is a no-op without either of them
     needing to ask the question again. */
  if (innerHeight - dialog.getBoundingClientRect().bottom > 1) return null;
  cancelClosing(dialog);
  const st = {
    base: currentTranslateY(dialog),
    height: dialog.getBoundingClientRect().height, // read once, at the start
    full: dialog.classList.contains('full'),
    roomUp: roomUpFor(dialog), // read once, at the start (finding 1)
    startY: y, dy: 0, moved: false, raf: null,
    samples: [{ t: performance.now(), y }],
  };
  dragOf.set(dialog, st);
  dialog.classList.add('dragging');
  dialog.style.transform = `translateY(${st.base}px)`;
  return st;
}

// Item 19: the one function every pointermove/touchmove handler calls --
// no layout read, one `requestAnimationFrame`-coalesced write.
function moveDrag(dialog, y) {
  const st = dragOf.get(dialog);
  if (!st) return;
  if (Math.abs(y - st.startY) > 4) st.moved = true;
  const raw = y - st.startY + st.base;
  st.dy = dragOffset(raw, st.roomUp);
  st.samples.push({ t: performance.now(), y });
  if (st.samples.length > 24) st.samples.splice(0, st.samples.length - 24);
  if (st.raf == null) st.raf = requestAnimationFrame(() => { st.raf = null; writeDrag(dialog, st); });
}

function endDrag(dialog, y) {
  const st = dragOf.get(dialog);
  if (!st) return;
  dragOf.delete(dialog);
  if (st.raf != null) cancelAnimationFrame(st.raf);
  dialog.classList.remove('dragging');
  // Item 17: a tap (no movement) still toggles half/full, handle or header.
  if (!st.moved) {
    dialog.style.transform = '';
    dialog.style.removeProperty('--scrim');
    setSheetHeight(dialog, !st.full);
    return;
  }
  const speed = dragSpeed(st.samples, performance.now());
  const action = releaseAction({ dy: st.dy, height: st.height, speed, full: st.full });
  if (action === 'close') { closeSheet(dialog); return; }
  // Item 11: still mid-drag transform (the finger's own offset) -- `dragOf`
  // is already cleared above, so this is `setSheetHeight`'s FLIP path, not
  // a drag write; it folds that offset into the diff itself (see there).
  if (action === 'full' && !st.full) { setSheetHeight(dialog, true); return; }
  // Item 16: settle back at the height it already had, `--ease` over `--t`
  // (the class removal above already restored the ordinary transition).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    dialog.style.transform = '';
    dialog.style.removeProperty('--scrim');
  }));
}

// Item 14: the header (`.bsheet-hd`), except a pointerdown on one of its
// OTHER buttons (✕, back, Add rule) -- the handle itself is fair game, and
// so is any of the header's own empty chrome.
function wireHeaderDrag(dialog, header) {
  let id = null;
  header.addEventListener('pointerdown', e => {
    const btn = e.target.closest('button');
    if (btn && !btn.classList.contains('bsheet-handle')) return;
    id = e.pointerId;
    header.setPointerCapture(id);
    beginDrag(dialog, e.clientY);
  });
  header.addEventListener('pointermove', e => { if (e.pointerId === id) moveDrag(dialog, e.clientY); });
  const release = e => {
    if (e.pointerId !== id) return;
    id = null;
    endDrag(dialog, e.clientY);
  };
  header.addEventListener('pointerup', release);
  header.addEventListener('pointercancel', release);
}

// Item 14: the body, only once `scrollTop <= 0` AND the finger has moved
// down -- otherwise it scrolls as normal. The `scrollTop` read happens once,
// at the first move of a touch (deciding whether this gesture is a drag at
// all), never on every move of an already-started drag.
//
// Fix pass finding 2: a permanent `{ passive: false }` touchmove listener
// forces the browser to wait for this handler on EVERY touch move in the
// body -- even an ordinary scroll, which never calls `preventDefault` --
// taking every list scroll in a sheet off the fast (main-thread-uncoupled)
// path. The non-passive listener now exists only for the span of a touch
// that actually started at `scrollTop <= 0` (a genuine drag candidate):
// attached in `touchstart`, removed the instant the gesture is decided not
// to be a drag after all (mid-touch scrolling, or the first move going up)
// or the touch ends/cancels -- a touch that starts already scrolled never
// gets a listener at all, so the browser treats it as passive from the
// first move.
function wireBodyDrag(dialog, body) {
  let id = null, startY = 0, started = false;
  const onMove = e => {
    const t = [...e.touches].find(x => x.identifier === id);
    if (!t) return;
    if (!started) {
      if (body.scrollTop > 0 || t.clientY - startY <= 0) { stop(); return; }
      started = true;
      beginDrag(dialog, startY);
    }
    e.preventDefault();
    moveDrag(dialog, t.clientY);
  };
  const stop = () => {
    body.removeEventListener('touchmove', onMove);
    id = null; started = false;
  };
  body.addEventListener('touchstart', e => {
    if (body.scrollTop > 0) return;
    const t = e.touches[0];
    id = t.identifier; startY = t.clientY; started = false;
    body.addEventListener('touchmove', onMove, { passive: false });
  }, { passive: true });
  const end = e => {
    if (id === null) return;
    const t = [...e.changedTouches].find(x => x.identifier === id);
    const y = t ? t.clientY : startY;
    const wasStarted = started;
    stop();
    if (wasStarted) endDrag(dialog, y);
  };
  body.addEventListener('touchend', end);
  body.addEventListener('touchcancel', end);
}

function wireSheet(dialog) {
  if (wiredSheets.has(dialog)) return;
  wiredSheets.add(dialog);
  // A click lands on the dialog element itself only when it hits the
  // backdrop -- every real row and button inside it is a child element, so
  // a tap that reaches one of those never matches this target.
  dialog.addEventListener('click', e => { if (e.target === dialog) closeSheet(dialog); });
  // The native `cancel` event: Escape, and Android's back gesture. At level 2
  // (#28 decision 10) this pops one level; `popPane` returns false when the
  // dialog has no open sub pane (every #27 sheet, and the Plan sheet at
  // level 1), which falls through to the old decision-11 behavior of
  // closing the whole sheet.
  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    if (popPane(dialog)) return;
    closeSheet(dialog);
  });
  const header = dialog.querySelector('.bsheet-hd');
  if (header) wireHeaderDrag(dialog, header);
  const body = dialog.querySelector('.bsheet-body');
  if (body) wireBodyDrag(dialog, body);
}

// #73 item 1: the first focus on open (and on a level-2 push, below) lands
// on the sheet's own title, not the handle (`trapNodes(dialog)[0]` in every
// sheet) -- a mouse-opened sheet drew a focus ring on the handle that then
// covered the title, and iOS Safari does match `:focus-visible` on a
// pointer-triggered focus even though desktop Chrome does not. The title
// carries `tabindex="-1"` in the markup so it can receive focus without
// joining the Tab order (`FOCUSABLE` above already excludes it). Falling
// back to the old first-focusable-node rule keeps this generic for any
// future dialog with no title of its own.
const sheetTitle = root => root.querySelector('.bsheet-hd h2');
const focusTarget = root => sheetTitle(root) || trapNodes(root)[0] || root;

// I9: the one place a dialog's opener gets recorded, so `returnFocus` below
// has somewhere to send focus back to on close. `openSheet` is the usual
// caller, but a dialog opened by hand (`showModal()` direct, bypassing the
// `.bsheet` machinery `openSheet` also runs -- #32's flow is the one case)
// still needs this one line without the rest of it.
export function rememberTrigger(dialog, trigger) {
  if (!dialog) return;
  sheetTrigger.set(dialog, trigger || document.activeElement);
}

export function openSheet(dialog, trigger, { full = false } = {}) {
  if (!dialog) return;
  closeSheets();
  wireSheet(dialog);
  rememberTrigger(dialog, trigger);
  setSheetHeight(dialog, full, false); // not open yet -- nothing to FLIP from
  dialog.showModal();
  focusTarget(dialog).focus({ preventScroll: true });
}

// Which kind of input the coach used last. A sheet always hands focus back
// to the phrase that opened it, which is right for VoiceOver and for Tab --
// but Safari paints its keyboard ring on that programmatic focus (Chrome
// does not), so a sheet slid shut with a finger left a box drawn around the
// phrase. `returnFocus` below reads these to tell a finger close from an
// Escape close; capture phase so a handler that stops the event still counts.
let lastPointerAt = 0;
let lastKeyAt = 0;
document.addEventListener('pointerdown', () => { lastPointerAt = Date.now(); }, true);
document.addEventListener('keydown', () => { lastKeyAt = Date.now(); }, true);

function returnFocus(dialog) {
  const t = sheetTrigger.get(dialog);
  if (!t || !document.contains(t) || !t.getClientRects().length) return;
  // Finger or mouse: focus still moves, the ring just isn't drawn (app.css
  // reads the attribute). It comes off again the moment the coach leaves the
  // phrase or touches a key, so a keyboard user's next ring is the real one.
  if (lastPointerAt > lastKeyAt) {
    t.dataset.noring = '';
    const drop = () => { delete t.dataset.noring; };
    t.addEventListener('blur', drop, { once: true });
    t.addEventListener('keydown', drop, { once: true });
  }
  t.focus({ preventScroll: true });
}

// The drag-in-progress reset both close paths below start from: drop any
// pending close, any pending drag session, and the finger-tracking transform
// and `--scrim` it left behind. Fix pass finding 7: `closeSheet` used to
// leave `writeDrag`'s inline `--scrim` in place when it added `.closing` --
// an inline style always beats a class rule, so `.closing { --scrim: 0 }`
// (app.css) never took effect and the backdrop held at the drag's own
// opacity for the whole slide, then vanished at once when the dialog
// actually closed. Clearing it here, before `.closing` goes on, hands the
// custom property back to the class rule, so the change from the drag's
// opacity to 0 is a normal cascade change that the backdrop's own
// `transition: opacity` (app.css) picks up and fades over `--t`, same as
// every other close path already did.
function resetDragTransform(dialog) {
  cancelClosing(dialog);
  dragOf.delete(dialog);
  dialog.classList.remove('dragging');
  dialog.style.transform = '';
  dialog.style.removeProperty('--scrim');
}

// The one close path that never slides: a screen change (`closeSheets`,
// `popstate`) and the close `openSheet` above does when another sheet is
// already open. `closeSheet` (below) is everything a coach actually does --
// ✕, Escape, backdrop, drag/flick -- and that one slides (item 10).
function closeSheetNow(dialog) {
  resetDragTransform(dialog);
  dialog.style.removeProperty('--scrim');
  dialog.close();
  returnFocus(dialog);
}

/* ---- the close guard (#31 decision 5) ------------------------------------
 *
 * A commit sheet must ask before it throws away text a coach typed (C4), and
 * it cannot ask in a second overlay: `confirmAction` (toast.js) is a
 * `div#confirm` at `z-index: 320`, and a sheet opened with `showModal()` sits
 * in the browser's top layer with everything outside it inert -- so the ask
 * would paint behind the sheet and take no taps. C5 caps the app at one
 * overlay besides.
 *
 * So a dialog opts in to being asked first. The guard returns true for "I
 * have handled this, stay open" (the paste sheet swaps its footer for the ask
 * row) and false for "nothing to lose, go ahead". `closeSheet` below is the
 * one place it is consulted, which is what makes the ✕, Escape and a backdrop
 * tap take the same path -- all three end up there. `closeSheets` deliberately
 * does NOT consult it: that is the screen-change path, and a coach who has
 * navigated away is not waiting to answer a question about a sheet they can
 * no longer see. */
const closeGuards = new WeakMap();   // dialog -> () => boolean

export function guardClose(dialog, ask) {
  if (!dialog) return;
  if (ask) closeGuards.set(dialog, ask);
  else closeGuards.delete(dialog);
}

/* I7: the ask row a `guardClose` callback above shows is the same shape
   everywhere it is used -- swap the footer for a row asking "Keep editing"
   or "Discard", focus follow the ask -- and used to be a third near-verbatim
   copy (roster-view.js's `showAddAsk`/`showPasteAsk`, teams-view.js's
   `showFlowAsk`). One helper, three selector sets. */
export function showAskRow(askSel, footSel, keepSel, show) {
  const ask = $(askSel), foot = $(footSel);
  if (!ask || !foot) return;
  ask.hidden = !show;
  foot.hidden = show;
  // the ask replaced the control the coach was reaching for, so focus follows
  if (show) $(keepSel)?.focus({ preventScroll: true });
}

/* #36: the step/progress/body/back/next painter `teams-view.js`'s add-a-game
   flow and `onboarding.js`'s first-run flow both need, pulled out here rather
   than kept as add-a-game's own private function -- a second flow copying it
   by hand is the drift `showAskRow` above already exists to avoid. `ids` is
   the caller's own selector set (`#agStep`/`#frStep` and so on), so this
   module still knows nothing about either flow's ids or state. */
export function paintFlowShell(ids, n, total, node, opts = {}) {
  const { nextText = 'Next', nextDisabled = false, backHidden = n === 1 } = opts;
  const step = $(ids.step); if (step) step.textContent = `${n} of ${total}`;
  const prog = $(ids.prog);
  if (prog) {
    // one segment per step, built here so the dot count can never drift from
    // the step count the way a hand-authored `<i>` per markup would
    if (prog.children.length !== total)
      prog.replaceChildren(...Array.from({ length: total },
        () => document.createElement('i')));
    [...prog.children].forEach((seg, i) => seg.classList.toggle('on', i === n - 1));
  }
  const body = $(ids.body);
  if (body) body.replaceChildren(node);
  const back = $(ids.back); if (back) back.hidden = backHidden;
  const next = $(ids.next);
  if (next) { next.textContent = nextText; next.disabled = nextDisabled; }
  // the whole screen changed under the coach, so focus goes to what it now
  // asks -- the same move `openSheet` makes to a sheet's own title
  body?.querySelector('h2')?.focus({ preventScroll: true });
}

/* The body `paintFlowShell` above is given, built from the caller's own steps
   array -- a list of `{ q, build }`, which is the shape both flows already
   wrote by hand.

   HERE RATHER THAN IN EITHER FLOW because the focus contract is shared and was
   split across three files: the painter focuses `body h2`, and each flow
   separately emitted an `h2.flow-q` with `tabIndex = -1` to receive it. A flow
   that built its heading any other way would silently lose focus on every
   step, with nothing to fail. Now the heading that is focused and the heading
   that is built are one piece of code. */
export function flowStepBody(steps, n) {
  const { q, build } = steps[n - 1];
  const wrap = el('div');
  const h = el('h2', 'flow-q', q);
  h.tabIndex = -1;
  wrap.append(h);
  build(wrap, q);
  return wrap;
}

/* The `.f` label + control pair both flows' text fields are made of. The label
   WRAPS its control instead of pointing at an id: `#label` and `#when` are
   already taken by the game screen's "This game" box, and a second element
   with either id would be the duplicate the shell tests catch.

   `tag` because first run's roster box is a `<textarea>` and everything else
   about the pair is identical; `type` is only meaningful on an `<input>`.
   Returns `[label, control]` -- the label is what gets appended, and the
   control is what a caller that needs an id on the field (first run does, for
   its own smoke driving) reaches for without a query. */
export function flowField(tag, label, value, placeholder, onInput) {
  const l = el('label', 'flow-f');
  l.append(el('span', 'f', label));
  const i = el(tag);
  if (tag === 'input') i.type = 'text';
  i.value = value;
  if (placeholder) i.placeholder = placeholder;
  i.oninput = () => onInput(i.value);
  l.append(i);
  return [l, i];
}

// Item 10: adds `.closing` (app.css: slides the sheet to `translateY(100%)`
// and the backdrop to clear, both over `--t`/`--ease`) and calls the native
// `close()` once that transition ends, with a `--t` + 100ms timeout fallback
// in case a property never actually changes (e.g. the sheet was already at
// the close position when this ran). Reduced motion skips straight to the
// instant path (item 18).
export function closeSheet(dialog) {
  if (!dialog || !dialog.open) return;
  const ask = closeGuards.get(dialog);
  if (ask && ask()) return;                   // the guard took it (see above)
  if (reducedMotion()) { closeSheetNow(dialog); return; }
  resetDragTransform(dialog);
  dialog.classList.add('closing');
  const onEnd = e => { if (e.target === dialog && e.propertyName === 'transform') done(); };
  const done = () => closeSheetNow(dialog);
  const fallback = setTimeout(done, PANE_MS + 100); // matches --t + 100ms (item 10)
  closingOf.set(dialog, { onEnd, fallback });
  dialog.addEventListener('transitionend', onEnd);
}

// Any screen change, including a `popstate`, calls this first (decision 11).
export function closeSheets() {
  for (const d of document.querySelectorAll('dialog.bsheet[open]')) closeSheetNow(d);
}

/* ================================================================== *
 * sheet level-2 panes (#28 decision 16)
 *
 * A caller marks its two panes `data-pane="main"` / `data-pane="sub"`;
 * `pushPane`/`popPane` do the generic parts -- hiding/showing, remembering
 * the main pane's scroll position, moving focus, and the slide -- while
 * header text, the icon swap and any draft state stay with the caller
 * (game-setup.js, rules.js). `wireSheet` above routes the native `cancel`
 * event through `popPane` first, so Escape and Android's back gesture go
 * back one level before they fall through to closing the sheet.
 *
 * The slide is a `transform`, never `top`/`left`/`width`/`height` (the
 * constraint): `app.css` starts the sub pane translated off to the right
 * and the `pane-in` class transitions it to rest. `hidden` still governs
 * which pane is in the accessibility tree and the tab order; the main pane
 * sits fully underneath the sub pane either way, so hiding it the instant
 * the push starts is not seen. Reduced motion skips the transition, so both
 * panes land at rest in the same frame instead of `PANE_MS` apart.
 * ================================================================== */

const paneScroll = new WeakMap(); // main pane -> the scroller's scrollTop when pushed
const panePusher = new WeakMap(); // sub pane -> the button that pushed it
const paneOnPop = new WeakMap();  // sub pane -> callback fired once it is popped
const PANE_MS = 260; // matches --t in tokens.css

const panesOf = dialog => ({
  main: dialog.querySelector('[data-pane="main"]'),
  sub: dialog.querySelector('[data-pane="sub"]'),
});
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// `onPop`, when given, fires once `popPane` actually pops this push --
// whether that came from the caller's own back button or from the native
// `cancel` event (Escape, Android back) routed through `wireSheet` above.
// Without it, a caller wiring only its back button's `onclick` misses the
// chrome reset (title, back button, right-slot control) on the cancel path.
export function pushPane(dialog, trigger, onPop) {
  const { main, sub } = panesOf(dialog);
  if (!main || !sub) return;
  // Neither pane scrolls itself (#28's own `#sheetPlanBody` does, so
  // `openPlanSheet`'s `scrollIntoView` can reach a header in either one) --
  // the position to remember and restore is the shared parent's, not main's
  // own (always 0). Without this, a sub pane pushed while main was scrolled
  // opened part-way down the sheet's own scroll instead of at its own top.
  const scroller = main.parentElement;
  paneScroll.set(main, scroller.scrollTop);
  scroller.scrollTop = 0;
  panePusher.set(sub, trigger || document.activeElement);
  if (onPop) paneOnPop.set(sub, onPop); else paneOnPop.delete(sub);
  main.hidden = true;
  sub.classList.remove('pane-in');
  sub.hidden = false;
  if (reducedMotion()) sub.classList.add('pane-in');
  // Two rAFs: the first lets `hidden` removal land, the second starts the
  // transition from the off-screen position rather than skipping it -- one
  // rAF alone can still land in the same frame as the style recalc.
  else requestAnimationFrame(() => requestAnimationFrame(() => sub.classList.add('pane-in')));
  // #73 item 1: the same title `openSheet` focuses, not the sub pane's first
  // control -- the caller (game-setup.js/rules.js) has already set the
  // title's text to the pushed page's name before this runs.
  focusTarget(dialog).focus({ preventScroll: true });
}

export function popPane(dialog) {
  const { main, sub } = panesOf(dialog);
  if (!main || !sub || sub.hidden) return false;
  main.hidden = false;
  main.parentElement.scrollTop = paneScroll.get(main) || 0;
  sub.classList.remove('pane-in');
  const t = panePusher.get(sub);
  if (t && document.contains(t) && t.getClientRects().length) t.focus({ preventScroll: true });
  if (reducedMotion()) sub.hidden = true;
  else setTimeout(() => { sub.hidden = true; }, PANE_MS);
  paneOnPop.get(sub)?.();
  return true;
}

/* Re-render safety net, not strictly a trap: a repaint throws away the node
   the coach is typing into, so remember it by its `data-fk` key and put the
   caret back where it was afterwards. Lives here because it is the other half
   of "focus survives what the app does to the DOM". */
export function withFocus(fn) {
  const el0 = document.activeElement;
  const key = el0 && el0.dataset ? el0.dataset.fk : null;
  const start = key && el0.setSelectionRange ? el0.selectionStart : null;
  const end = key && el0.setSelectionRange ? el0.selectionEnd : null;
  fn();
  if (!key) return;
  const back = document.querySelector(`[data-fk="${CSS.escape(key)}"]`);
  if (!back || back === document.activeElement) return;
  back.focus({ preventScroll: true });
  if (start != null && back.setSelectionRange) {
    try { back.setSelectionRange(start, end); } catch {}
  }
}
