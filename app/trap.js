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
  // The native `cancel` event: Escape, and Android's back gesture (decision 11).
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeSheet(dialog); });
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
