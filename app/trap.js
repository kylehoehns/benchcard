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
import { $ } from './dom.js';

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

function setSheetHeight(dialog, full) {
  dialog.classList.toggle('full', full);
  // Not `half`: card.css already styles `.card.half` (the half-size print
  // card), and a bottom sheet and a card can both be on screen at once — a
  // second, unrelated `.half` would collide and the later stylesheet would
  // win silently (see test/css-collide.test.js).
  dialog.classList.toggle('bsheet-half', !full);
  const handle = dialog.querySelector('.bsheet-handle');
  if (handle) handle.setAttribute('aria-label', full ? 'Half height' : 'Full height');
}

function wireHandle(dialog, handle) {
  let startY = 0, dragging = false, moved = false;
  handle.addEventListener('pointerdown', e => {
    startY = e.clientY; dragging = true; moved = false;
    handle.setPointerCapture(e.pointerId);
    // app.css turns the entrance transition off while this class is set, so
    // the sheet tracks the finger 1:1 instead of chasing it toward each new
    // pointermove value through an easing curve meant for the open animation.
    dialog.classList.add('dragging');
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    // transform only while dragging -- never top or height (the constraint).
    dialog.style.transform = `translateY(${dy}px)`;
  });
  const release = e => {
    if (!dragging) return;
    dragging = false;
    const dy = e.clientY - startY;
    const h = dialog.getBoundingClientRect().height;
    dialog.style.transform = '';
    dialog.classList.remove('dragging');
    if (!moved) { setSheetHeight(dialog, !dialog.classList.contains('full')); return; }
    if (dy > h * DRAG_CLOSE_FRAC) { closeSheet(dialog); return; }
    if (dy < -h * DRAG_FULL_FRAC) { setSheetHeight(dialog, true); return; }
    // released between the thresholds: settle back at the height it had.
    setSheetHeight(dialog, dialog.classList.contains('full'));
  };
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
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
  const handle = dialog.querySelector('.bsheet-handle');
  if (handle) wireHandle(dialog, handle);
}

export function openSheet(dialog, trigger, { full = false } = {}) {
  if (!dialog) return;
  closeSheets();
  wireSheet(dialog);
  sheetTrigger.set(dialog, trigger || document.activeElement);
  setSheetHeight(dialog, full);
  dialog.showModal();
  (trapNodes(dialog)[0] || dialog).focus({ preventScroll: true });
}

export function closeSheet(dialog) {
  if (!dialog || !dialog.open) return;
  dialog.close();
  const t = sheetTrigger.get(dialog);
  if (t && document.contains(t) && t.getClientRects().length) t.focus({ preventScroll: true });
}

// Any screen change, including a `popstate`, calls this first (decision 11).
export function closeSheets() {
  for (const d of document.querySelectorAll('dialog.bsheet[open]')) closeSheet(d);
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
  (trapNodes(sub)[0] || sub).focus({ preventScroll: true });
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
