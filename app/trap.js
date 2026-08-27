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
